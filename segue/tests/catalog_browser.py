"""Complete-source loading, recording reuse and actual IndexedDB persistence."""
import json,os,re,shutil,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];html=(root/'index.html').read_text();sdk=(root/'tests/mock_sdk.js').read_text()
url='https://vijaykannan2020-del.github.io/Apps/segue/'
def track(i,copy=False):
 ident=('C' if copy else 'O')+str(i).zfill(21)
 return {'id':ident,'uri':'spotify:track:'+ident,'name':f'Song {i}','duration_ms':300000,'type':'track','artists':[{'id':'artist','name':'Artist'}],'external_ids':{'isrc':'INAAA'+str(i).zfill(7)}}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SEGUE_CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1280,'height':900})
 context.add_init_script("for(const [k,v]of Object.entries({rt:'test',at:'test',exp:'9999999999999',aikey:'test'}))localStorage.setItem('segue_'+k,v);if(!localStorage.getItem('segue_ai4'))localStorage.setItem('segue_ai4',JSON.stringify({legacySaved:{schema:2,start:10000,end:85000}}))")
 state={'id':None,'pos':0,'paused':True,'at':time.monotonic()};calls=[];errors=[]
 def advance():
  now=time.monotonic()
  if not state['paused']:state['pos']+=(now-state['at'])*1000
  state['at']=now
 def route(r):
  u=r.request.url;path=urlparse(u).path;qs=parse_qs(urlparse(u).query)
  if u==url:return r.fulfill(body=html,content_type='text/html')
  if 'sdk.scdn.co' in u:return r.fulfill(body=sdk,content_type='application/javascript')
  if path=='/v1/me':return r.fulfill(json={'id':'catalog'})
  if path=='/v1/me/playlists':return r.fulfill(json={'items':[],'next':None})
  if path.startswith('/v1/albums/'):
   copy=path.split('/')[3].startswith('B');offset=int(qs.get('offset',[0])[0]);items=[track(i,copy) for i in range(offset,min(128,offset+50))]
   # Album track objects are simplified; ISRC requires a recording lookup.
   for t in items:t.pop('external_ids')
   page={'items':items,'next':f'https://api.spotify.com/v1/albums/{"B"*22 if copy else "A"*22}/tracks?offset={offset+50}' if offset+50<128 else None}
   return r.fulfill(json=page if path.endswith('/tracks') else {'id':path.split('/')[3],'name':'Complete album','artists':[{'name':'Artist'}],'images':[],'tracks':page})
  if path.startswith('/v1/tracks/'):
   ident=path.split('/')[-1];return r.fulfill(json=track(int(ident[1:]),ident.startswith('C')))
  if '/v1beta/models' in path and ':generateContent' not in path:return r.fulfill(json={'models':[{'name':'models/gemini-3-flash','supportedGenerationMethods':['generateContent']}]})
  if ':generateContent' in path:
   text=r.request.post_data_json['contents'][0]['parts'][0]['text'];ids=[i for i in re.findall(r'"id":"([^"]+)"',text) if i!='...'];calls.append(ids)
   return r.fulfill(json={'candidates':[{'content':{'parts':[{'text':json.dumps([{'id':i,'start':30,'end':170,'section':'Beat-driven charanam'} for i in ids])}]}}]})
  if '/me/player/play' in path:state.update(id=r.request.post_data_json['uris'][0].split(':')[-1],pos=r.request.post_data_json['position_ms'],paused=False,at=time.monotonic());return r.fulfill(status=204)
  if '/me/player/pause' in path:advance();state['paused']=True;return r.fulfill(status=204)
  if path=='/v1/me/player':
   advance();return r.fulfill(json={'item':{'id':state['id'],'uri':'spotify:track:'+str(state['id'])},'progress_ms':state['pos'],'is_playing':not state['paused'],'device':{'id':'browser'}})
  return r.fulfill(body='',content_type='application/javascript')
 context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url);page.wait_for_function("DJ.sdkDev==='browser'&&Persist.ready")
 page.locator('#homeCreate').click();assert page.locator('[data-k=max]').count()==0
 def choose_album(letter):
  page.locator('#nav [data-v=mix]').click()
  for button in page.locator('#crate button').all():button.click()
  page.locator('#q').fill('spotify:album:'+letter*22);page.wait_for_selector(f'#results [data-key="album:{letter*22}"]');page.locator(f'#results [data-key="album:{letter*22}"]').click();page.locator('#buildBtn').click()
  page.wait_for_function('ST.mix.length===128')
 choose_album('A');page.wait_for_function('Object.keys(AI.cache()).length>=6');page.evaluate('Persist.flush()')
 assert page.evaluate('ST.mix[127].id')=='O'+str(127).zfill(21)
 assert len(calls)==1 and len(calls[0])==6
 # New release IDs, same recordings: no additional Gemini request.
 choose_album('B');page.wait_for_function("ST.mix[0].id.startsWith('C')&&AI.pick(ST.mix[0])!==null&&!aheadBusy")
 assert len(calls)==1
 assert page.evaluate('AI.pick(ST.mix[0]).end')==170000
 page.evaluate('Persist.flush()');page.reload();page.wait_for_function("Persist.ready&&ST.mix.length===128&&DJ.sdkDev==='browser'")
 assert page.evaluate("ST.mix[0].id.startsWith('C')&&AI.pick(ST.mix[0]).end===170000")
 assert len(calls)==1
 persisted=page.evaluate("""()=>new Promise(resolve=>{const r=Persist.db.transaction('data').objectStore('data').get('ai4');r.onsuccess=()=>resolve(JSON.parse(r.result))})""")
 assert len(persisted)==7 and persisted['legacySaved']['end']==85000
 # The database supports a catalog larger than the old localStorage ceiling.
 assert page.evaluate("async()=>{LS.set('library_large',JSON.stringify({padding:'x'.repeat(6*1024*1024)}));return await Persist.flush()}")
 page.reload();page.wait_for_function("Persist.ready&&ST.mix.length===128")
 assert page.evaluate("JSON.parse(LS.get('library_large')).padding.length")==6*1024*1024
 # A failed database must not silently resurrect stale localStorage or spend AI again.
 context.add_init_script("Object.defineProperty(window,'indexedDB',{value:undefined})")
 page.reload();page.wait_for_selector('#bootBtns:visible');assert 'database' in page.locator('#bootMsg').inner_text()
 assert len(calls)==1
 assert not errors,errors
 print('PASS complete 128-song album order; no count picker; adaptive first batch; zero AI calls for identical recordings on another release; legacy migration and IndexedDB timings/queue survive reload; 6 MiB catalog persists; database failure does not re-query AI')
 browser.close()
