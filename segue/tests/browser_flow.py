import json,re,os,shutil,tempfile
from urllib.parse import urlparse,parse_qs
from pathlib import Path
from playwright.sync_api import sync_playwright
html=(Path(__file__).resolve().parents[1]/'index.html').read_text()
preview_dir=Path(os.environ.get('SEGUE_PREVIEW_DIR',Path(tempfile.gettempdir())/'segue-previews'));preview_dir.mkdir(parents=True,exist_ok=True)
url='https://vijaykannan2020-del.github.io/Apps/segue/'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SEGUE_CHROMIUM') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox'])
 for width,height in [(320,740),(390,844),(768,1024),(1024,768)]:
  for theme in ['light','dark']:
   context=browser.new_context(viewport={'width':width,'height':height},color_scheme=theme)
   context.add_init_script("localStorage.setItem('segue_rt','audit');localStorage.setItem('segue_at','audit');localStorage.setItem('segue_exp',String(Date.now()+3600000));localStorage.setItem('segue_aikey','test');")
   errors=[]; counts={'ai':0,'play':0,'seek':0}; state={'uri':None,'pos':0,'paused':True,'offline':False}
   def route(r):
    u=r.request.url
    if u==url:return r.fulfill(body=html,content_type='text/html')
    if u.endswith('/v1/me'):
     if state['offline']:return r.fulfill(status=503,json={'error':{'message':'Service unavailable'}})
     return r.fulfill(json={'id':'audit','display_name':'Audit'})
    if '/me/playlists' in u:return r.fulfill(json={'items':[{'id':'playlist','name':'Night Drive','owner':{'id':'audit'},'items':{'total':3}}],'next':None})
    if '/playlists/playlist/items' in u:return r.fulfill(json={'items':[{'item':{'id':str(i)*22,'uri':'spotify:track:'+str(i)*22,'name':['Evening Light','After Hours','Going Home'][i-1],'duration_ms':240000,'type':'track','artists':[{'id':'artist','name':'An Artist'}]}} for i in range(1,4)],'next':None})
    if '/artists/' in u:return r.fulfill(json={'genres':[]})
    if '/me/player/devices' in u:return r.fulfill(json={'devices':[{'id':'phone','name':'My iPhone','type':'Smartphone','is_active':True}]})
    if '/me/player/play?' in u:
     counts['play']+=1; body=r.request.post_data_json; state.update(uri=body['uris'][0],pos=0,paused=False);return r.fulfill(status=204)
    if '/me/player/seek?' in u:
     counts['seek']+=1;state['pos']=int(parse_qs(urlparse(u).query)['position_ms'][0]);return r.fulfill(status=204)
    if '/me/player/pause?' in u:state['paused']=True;return r.fulfill(status=204)
    if u.endswith('/me/player'):return r.fulfill(json={'item':{'id':state['uri'].split(':')[-1] if state['uri'] else 'unknown','uri':state['uri']},'progress_ms':state['pos'],'is_playing':not state['paused'],'device':{'id':'phone'}})
    if 'reccobeats' in u:return r.fulfill(json={'content':[]})
    if '/v1beta/models?' in u:return r.fulfill(json={'models':[{'name':'models/gemini-3-flash','supportedGenerationMethods':['generateContent']}]})
    if ':generateContent?' in u:
     counts['ai']+=1; text=r.request.post_data_json['contents'][0]['parts'][0]['text']; ids=re.findall(r'id: (\w+)',text)
     return r.fulfill(json={'candidates':[{'content':{'parts':[{'text':json.dumps([{'id':i,'start':60,'end':105,'mood':'happy','why':'famous passage'} for i in ids])}]}}]})
    return r.fulfill(body='',content_type='application/javascript')
   context.route('**/*',route)
   page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(url);page.wait_for_selector('#v-home:visible');page.locator('#homeCreate').click();page.wait_for_selector('#results .item');page.locator('#results .item').first.click();page.locator('#buildBtn').click()
   page.wait_for_selector('#queue .q');page.wait_for_function('Object.keys(AI.cache()).length===3')
   for view in ['home','mix','play','set']:
    page.locator(f'#nav [data-v={view}]').click();page.wait_for_selector(f'#v-{view}:visible')
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),(width,theme,view,'overflow')
   page.locator('#nav [data-v=home]').click();assert page.locator('#savedMixes .mix-tile').count()==1;assert page.locator('#savedSongs .saved-song').count()==3
   page.locator('#savedSongSearch').fill('Going Home');assert page.locator('#savedSongs .saved-song').count()==1
   page.locator('#savedSongSearch').fill('');assert page.locator('#savedSongs .saved-song').count()==3
   if width==390:page.screenshot(path=str(preview_dir/f'v28-home-{theme}.png'),full_page=True)
   page.locator('#continueMix button').click();page.wait_for_function('DJ.playing===true');assert counts['play']==1;assert counts['seek']==1;assert state['pos']==60000
   page.once('dialog',lambda dialog:dialog.accept('Night Drive Edit'));page.locator('#renameMix').click();assert page.locator('#mixTitle').inner_text()=='Night Drive Edit'
   page.evaluate('DJ.pos=78000;DJ.posAt=performance.now()');page.locator('#playBtn').click();page.wait_for_function('DJ.playing===false')
   before=page.evaluate('({ids:ST.mix.map(t=>t.id),pos:DJ.pos,idx:DJ.idx})');oldplays=counts['play'];page.reload();page.wait_for_selector('#v-home:visible')
   after=page.evaluate('({ids:ST.mix.map(t=>t.id),pos:DJ.pos,idx:DJ.idx})');assert before['ids']==after['ids'];assert abs(before['pos']-after['pos'])<1000;assert counts['play']==oldplays;assert counts['ai']==1
   page.locator('#continueMix button').click();page.wait_for_function('DJ.playing===true');assert abs(state['pos']-before['pos'])<1000;assert counts['ai']==1
   page.locator('#playBtn').click();page.wait_for_function('!DJ.playing');state['offline']=True;page.reload();page.wait_for_selector('#v-home:visible');assert page.locator('#savedMixes .mix-tile').count()==1;assert 'Night Drive Edit' in page.locator('#savedMixes').inner_text()
   state['offline']=False
   page.locator('#clearMixes').click();page.locator('#cancelClear').click();assert page.locator('#savedMixes .mix-tile').count()==1
   saved_cache=page.evaluate("LS.get('ai4')")
   page.locator('#clearMixes').click();page.locator('#confirmClear').click();assert page.locator('#savedMixes .mix-tile').count()==0
   page.locator('#clearSavedSongs').click();page.locator('#confirmClear').click();assert page.locator('#savedSongs .saved-song').count()==0
   assert page.evaluate("LS.get('ai4')")==saved_cache
   page.reload();page.wait_for_selector('#v-home:visible');assert page.locator('#savedMixes .mix-tile').count()==0;assert page.locator('#savedSongs .saved-song').count()==0;assert page.evaluate('Object.keys(AI.cache()).length')==3
   assert not errors,errors
   print(f'PASS {width}x{height} {theme}: create, save, four screens, cached AI song list, play/pause, reopen, same order/position, no autoplay, continue without AI, library during Spotify outage, clear lists keeps AI mappings, ignored start/resume positions corrected')
   context.close()
 browser.close()
