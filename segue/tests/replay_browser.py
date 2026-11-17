"""Replay trial setup/playback with a mocked private backend and SDK; no live provider credits."""
import json,os,shutil,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];html=(root/'index.html').read_text();sdk=(root/'tests/mock_sdk.js').read_text()
url='https://vijaykannan2020-del.github.io/Apps/segue/'
def track(i):
 ident='T'+str(i).zfill(21)
 return {'id':ident,'uri':'spotify:track:'+ident,'name':f'Test song {i}','duration_ms':300000,'type':'track','artists':[{'id':'artist','name':'Test Artist'}],'external_ids':{'isrc':'INAAA'+str(i).zfill(7)}}
def replay(i):
 return {'status':'ready','pick':{'schema':2,'source':'replay','method':'replay-v1','start':60000,'end':165000,'boundary':'replay-valley','videoId':'abcdefghijk','videoDuration':300000,'peak':112500,'intensity':1,'alignment':'metadata-duration-only','music':[{'title':f'Test song {i}','artist':'Test Artist'}]}}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SEGUE_CHROMIUM') or shutil.which('chromium'),args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844})
 # An existing Version 39 installation must move to automation without file prompts.
 context.add_init_script("if(!localStorage.getItem('test_seeded')){localStorage.setItem('test_seeded','1');for(const[k,v]of Object.entries({rt:'test',at:'test',exp:'9999999999999',passage_source:'local',ai4:JSON.stringify({legacy:{schema:2,start:20000,end:80000}})}))localStorage.setItem('segue_'+k,v)}")
 context.add_init_script("if(!localStorage.getItem('test_v1_seed')){localStorage.setItem('test_v1_seed','1');const id='T'+'0'.repeat(21),cache=JSON.parse(localStorage.getItem('segue_ai4')||'{}');cache[id]={schema:2,source:'timed-lyrics',method:'lyrics-structure-v1',start:10000,end:295000,song:{id,uri:'spotify:track:'+id,name:'Test song 0',artists:['Test Artist'],dur:300000,isrc:'INAAA0000000'}};localStorage.setItem('segue_ai4',JSON.stringify(cache));localStorage.setItem('segue_hooks',JSON.stringify({[id]:299000}))}")
 state={'id':None,'pos':0,'paused':True,'at':time.monotonic()};replay_calls=[];ai_calls=[];loads=[];errors=[];active=False;album='A'*22
 def advance():
  now=time.monotonic()
  if not state['paused']:state['pos']+=(now-state['at'])*1000
  state['at']=now
 def route(r):
  u=r.request.url;path=urlparse(u).path;qs=parse_qs(urlparse(u).query)
  if u==url:return r.fulfill(body=html,content_type='text/html')
  if 'sdk.scdn.co' in u:return r.fulfill(body=sdk,content_type='application/javascript')
  if 'generativelanguage' in u or 'anthropic' in u:ai_calls.append(u);return r.abort()
  if 'lrclib.net' in u:raise AssertionError('Replay mode must not query timed lyrics')
  if 'replay.example' in u:
   assert r.request.headers.get('authorization')=='Bearer private-connection-token'
   if path=='/health':return r.fulfill(json={'status':'ready','provider':'YTAPI'})
   assert path=='/v1/replay'
   body=r.request.post_data_json;assert 'uri' not in body and 'token' not in body
   i=int(body['id'][1:]);replay_calls.append(i)
   return r.fulfill(json={'status':'unavailable','reason':'no_heatmap','message':'This recording has no audience replay graph.'} if i==3 else replay(i))
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
 page.click('#nav [data-v=set]')
 page.select_option('#passageSource','replay')
 assert page.evaluate('AI.source()')=='lyrics' # No setup: keep the functioning method.
 assert 'Not connected' in page.locator('#replayStatus').inner_text() or 'Connect' in page.locator('#replayStatus').inner_text()
 page.fill('#replayUrl','https://replay.example');page.fill('#replayToken','private-connection-token')
 page.click('#connectReplay');page.wait_for_function("AI.source()==='replay'")
 assert not page.locator('#matchingForm').is_visible() and not page.locator('#geminiSettings').is_visible()
 page.click('#nav [data-v=mix]');page.fill('#q','spotify:album:'+album);page.wait_for_selector('#results [data-key]');page.click('#results [data-key]');page.click('#buildBtn')
 page.wait_for_function('ST.mix.length===4&&!Replay.aheadBusy&&ST.mix.slice(0,3).every(t=>AI.pick(t))',timeout=30000)
 assert sorted(replay_calls)==[0,1,2],replay_calls
 assert page.evaluate('ST.mix[0].start')==60000 and page.evaluate('ST.mix[0].end')==165000
 assert page.evaluate('AI.cache()[ST.mix[0].id].method')=='replay-v1'
 assert page.evaluate('AI.cache()[ST.mix[0].id].previous.end')==295000
 assert page.evaluate('HK.get()[ST.mix[0].id]')==299000
 assert not ai_calls
 page.click('#nav [data-v=play]');page.click('#playBtn');page.wait_for_function('DJ.playing')
 assert loads[-1]['position_ms']==60000
 # A verified lyric break advances to the prefetched next recording.
 state.update(pos=165200,at=time.monotonic());page.wait_for_function('DJ.idx===1&&DJ.playing')
 assert loads[-1]['uris']==['spotify:track:'+track(1)['id']]
 page.wait_for_function('!Replay.aheadBusy')
 assert len(replay_calls)==4
 page.click('#playBtn');page.wait_for_function("DJ.phase==='paused'")
 # Missing lyrics does not fabricate a clip or silently skip the song.
 page.evaluate('DJ.go(3)');page.wait_for_function("DJ.phase==='error'")
 assert page.evaluate('DJ.idx')==3 and 'no audience replay graph' in page.evaluate('DJ.detail')
 assert state['paused']
 page.evaluate('()=>Persist.flush()');before=len(replay_calls)
 page.reload();page.wait_for_function("Persist.ready&&ST.mix.length===4&&!Replay.aheadBusy")
 assert len(replay_calls)==before and page.evaluate('AI.cache().legacy.end')==80000
 assert page.evaluate('AI.cache()[ST.mix[0].id].source')=='replay'
 assert not page.evaluate('DJ.playing')
 # Reusing another release ID must not call lyrics/Gemini again.
 assert page.evaluate("AI.pick({...ST.mix[0],id:'another-release'}).end")==165000
 page.click('#nav [data-v=set]');page.wait_for_timeout(1100);page.screenshot(path='/tmp/segue42-replay-settings.png')
 assert not errors,errors
 assert not ai_calls
 browser.close()
 print('PASS replay setup guard/connection, automatic album preparation, wrong source isolation, shared SDK playback, no-graph pause, durable cached reload and recording reuse; no Gemini, lyric or audio requests')
