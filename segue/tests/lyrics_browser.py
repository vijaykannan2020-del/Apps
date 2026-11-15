"""Automatic timed-lyric selection with mocked catalogs/lyrics/SDK; no real music."""
import json,os,shutil,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];html=(root/'index.html').read_text();sdk=(root/'tests/mock_sdk.js').read_text()
url='https://vijaykannan2020-del.github.io/Apps/segue/'
def track(i):
 ident='T'+str(i).zfill(21)
 return {'id':ident,'uri':'spotify:track:'+ident,'name':f'Test song {i}','duration_ms':300000,'type':'track','artists':[{'id':'artist','name':'Test Artist'}],'external_ids':{'isrc':'INAAA'+str(i).zfill(7)}}
def lyric(i):
 return {'id':100+i,'trackName':f'Test song {i}','artistName':'Test Artist','albumName':'Test album','duration':300,'syncedLyrics':'[00:10]opening one\n[00:15]opening two\n[00:20]\n[01:38]unique verse first\n[01:50]unique verse second\n[02:20]verse third\n[03:05]verse final word\n[03:12]\n[03:40]opening one\n[03:45]opening two\n[03:55]'}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SEGUE_CHROMIUM') or shutil.which('chromium'),args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844})
 # An existing Version 39 installation must move to automation without file prompts.
 context.add_init_script("if(!localStorage.getItem('test_seeded')){localStorage.setItem('test_seeded','1');for(const[k,v]of Object.entries({rt:'test',at:'test',exp:'9999999999999',passage_source:'local',ai4:JSON.stringify({legacy:{schema:2,start:20000,end:80000}})}))localStorage.setItem('segue_'+k,v)}")
 context.add_init_script("if(!localStorage.getItem('test_v1_seed')){localStorage.setItem('test_v1_seed','1');const id='T'+'0'.repeat(21),cache=JSON.parse(localStorage.getItem('segue_ai4')||'{}');cache[id]={schema:2,source:'timed-lyrics',method:'lyrics-structure-v1',start:10000,end:295000,song:{id,uri:'spotify:track:'+id,name:'Test song 0',artists:['Test Artist'],dur:300000,isrc:'INAAA0000000'}};localStorage.setItem('segue_ai4',JSON.stringify(cache));localStorage.setItem('segue_hooks',JSON.stringify({[id]:299000}))}")
 state={'id':None,'pos':0,'paused':True,'at':time.monotonic()};lyric_calls=[];ai_calls=[];loads=[];errors=[];active=False;album='A'*22
 def advance():
  now=time.monotonic()
  if not state['paused']:state['pos']+=(now-state['at'])*1000
  state['at']=now
 def route(r):
  u=r.request.url;path=urlparse(u).path;qs=parse_qs(urlparse(u).query)
  if u==url:return r.fulfill(body=html,content_type='text/html')
  if 'sdk.scdn.co' in u:return r.fulfill(body=sdk,content_type='application/javascript')
  if 'generativelanguage' in u or 'anthropic' in u:ai_calls.append(u);return r.abort()
  if 'lrclib.net' in u:
   assert 'Segue/41' in r.request.headers.get('lrclib-client','')
   assert not r.request.headers.get('authorization')
   name=qs['track_name'][0];i=int(name.split()[-1]);lyric_calls.append(i)
   # Song 3 has plain lyrics only. Wrong versions/artists must not be accepted.
   variants=[{**lyric(i),'duration':240},{**lyric(i),'artistName':'Another artist'}]
   variants.append({**lyric(i),'syncedLyrics':None,'plainLyrics':'unsynced words'} if i==3 else lyric(i))
   return r.fulfill(json=variants,headers={'Access-Control-Allow-Origin':'*'})
  if path=='/v1/me':return r.fulfill(json={'id':'lyrics-test'})
  if path=='/v1/me/playlists':return r.fulfill(json={'items':[],'next':None})
  if path.startswith('/v1/albums/'):
   return r.fulfill(json={'id':album,'name':'Test album','images':[],'artists':[{'name':'Test Artist'}],'tracks':{'items':[track(i) for i in range(4)],'next':None}})
  if path.startswith('/v1/tracks/'):return r.fulfill(json=track(int(path.split('/')[-1][1:])))
  if '/me/player/play' in path:
   body=r.request.post_data_json;loads.append(body);state.update(id=body['uris'][0].split(':')[-1],pos=body['position_ms'],paused=False,at=time.monotonic());return r.fulfill(status=204)
  if '/me/player/pause' in path:advance();state['paused']=True;return r.fulfill(status=204)
  if '/me/player/resume' in path:advance();state['paused']=False;return r.fulfill(status=204)
  if '/me/player/seek' in path:state.update(pos=int(qs['position_ms'][0]),at=time.monotonic());return r.fulfill(status=204)
  if path=='/v1/me/player':
   advance();return r.fulfill(json={'item':{'id':state['id'],'uri':'spotify:track:'+str(state['id'])},'progress_ms':state['pos'],'is_playing':not state['paused'],'device':{'id':'browser'}})
  return r.fulfill(body='',content_type='application/javascript')
 context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url);page.wait_for_function("DJ.sdkDev==='browser'&&Persist.ready")
 assert page.evaluate('AI.source()')=='lyrics'
 page.click('#nav [data-v=set]');assert page.locator('#lyricsSettings').is_visible();assert not page.locator('#matchingForm').is_visible()
 assert not page.locator('#geminiSettings').is_visible()
 page.click('#nav [data-v=mix]');page.fill('#q','spotify:album:'+album);page.wait_for_selector('#results [data-key]');page.click('#results [data-key]');page.click('#buildBtn')
 page.wait_for_function('ST.mix.length===4&&!lyricAheadBusy&&ST.mix.slice(0,3).every(t=>AI.pick(t))',timeout=30000)
 assert sorted(lyric_calls)==[0,1,2,3],lyric_calls
 assert page.evaluate('ST.mix[0].start')==98000 and page.evaluate('ST.mix[0].end')==192000
 assert page.evaluate('AI.cache()[ST.mix[0].id].method')=='lyrics-structure-v2'
 assert page.evaluate('AI.cache()[ST.mix[0].id].previous.end')==295000
 assert page.evaluate('HK.get()[ST.mix[0].id]')==299000
 assert not ai_calls
 page.click('#nav [data-v=play]');page.click('#playBtn');page.wait_for_function('DJ.playing')
 assert loads[-1]['position_ms']==98000
 # A verified lyric break advances to the prefetched next recording.
 state.update(pos=192200,at=time.monotonic());page.wait_for_function('DJ.idx===1&&DJ.playing')
 assert loads[-1]['uris']==['spotify:track:'+track(1)['id']]
 assert len(lyric_calls)==4
 page.click('#playBtn');page.wait_for_function("DJ.phase==='paused'")
 # Missing lyrics does not fabricate a clip or silently skip the song.
 page.evaluate('DJ.go(3)');page.wait_for_function("DJ.phase==='error'")
 assert page.evaluate('DJ.idx')==3 and 'No matching timed-lyric' in page.evaluate('DJ.detail')
 assert state['paused']
 page.evaluate('()=>Persist.flush()');before=len(lyric_calls)
 page.reload();page.wait_for_function("Persist.ready&&ST.mix.length===4&&!lyricAheadBusy")
 assert len(lyric_calls)==before and page.evaluate('AI.cache().legacy.end')==80000
 assert page.evaluate('AI.cache()[ST.mix[0].id].source')=='timed-lyrics'
 assert not page.evaluate('DJ.playing')
 # Reusing another release ID must not call lyrics/Gemini again.
 assert page.evaluate("AI.pick({...ST.mix[0],id:'another-release'}).end")==192000
 page.click('#nav [data-v=set]');page.wait_for_timeout(1100);page.screenshot(path='/tmp/segue40-lyrics-settings.png')
 assert not errors,errors
 assert not ai_calls
 browser.close()
 print('PASS automatic mode migration, full album, identified lyric requests, strict recording match, prefetch, shared SDK transitions, missing lyrics pause, cached reload and cross-release reuse, v1 refinement and stale-manual-start guard; no file selection/AI requests')
