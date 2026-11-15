import json,re,os,shutil,tempfile,time
from urllib.parse import urlparse,parse_qs
from pathlib import Path
from playwright.sync_api import sync_playwright
html=(Path(__file__).resolve().parents[1]/'index.html').read_text()
sdk=(Path(__file__).resolve().parent/'mock_sdk.js').read_text()
preview_dir=Path(os.environ.get('SEGUE_PREVIEW_DIR',Path(tempfile.gettempdir())/'segue-previews'));preview_dir.mkdir(parents=True,exist_ok=True)
url='https://vijaykannan2020-del.github.io/Apps/segue/'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SEGUE_CHROMIUM') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox'])
 for width,height in [(320,740),(390,844),(768,1024),(1024,768)]:
  for theme in ['light','dark']:
   context=browser.new_context(viewport={'width':width,'height':height},color_scheme=theme)
   context.add_init_script("localStorage.setItem('segue_rt','audit');localStorage.setItem('segue_at','audit');localStorage.setItem('segue_exp',String(Date.now()+3600000));localStorage.setItem('segue_aikey','test');")
   context.add_init_script("window.mediaHandlers={};if(navigator.mediaSession){const original=navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);navigator.mediaSession.setActionHandler=(name,fn)=>{mediaHandlers[name]=fn;return original(name,fn)}}")
   errors=[]; counts={'ai':0,'play':0,'seek':0}; state={'uri':None,'pos':0,'paused':True,'offline':False,'frozen':False,'transport_offline':False,'volume':70,'at':time.monotonic()}
   def advance():
    now=time.monotonic()
    if not state['paused'] and not state['frozen']:state['pos']+=(now-state['at'])*1000
    state['at']=now
   def route(r):
    u=r.request.url
    if u==url:return r.fulfill(body=html,content_type='text/html')
    if 'sdk.scdn.co/spotify-player.js' in u:return r.fulfill(body=sdk,content_type='application/javascript')
    if u.endswith('/v1/me'):
     if state['offline']:return r.fulfill(status=503,json={'error':{'message':'Service unavailable'}})
     return r.fulfill(json={'id':'audit','display_name':'Audit'})
    if '/me/playlists' in u:return r.fulfill(json={'items':[{'id':'playlist','name':'Night Drive','owner':{'id':'audit'},'items':{'total':3}}],'next':None})
    if '/playlists/playlist/items' in u:return r.fulfill(json={'items':[{'item':{'id':str(i)*22,'uri':'spotify:track:'+str(i)*22,'name':['Evening Light','After Hours','Going Home'][i-1],'duration_ms':240000,'type':'track','artists':[{'id':'artist','name':'An Artist'}]}} for i in range(1,4)],'next':None})
    if '/artists/' in u:return r.fulfill(json={'genres':[]})
    if '/me/player/devices' in u:return r.fulfill(json={'devices':[{'id':'phone','name':'My iPhone','type':'Smartphone','is_active':True}]})
    if r.request.method in ['PUT','POST'] and '/me/player/' in u:assert parse_qs(urlparse(u).query).get('device_id')==['browser'],u
    if '/me/player/play?' in u:
     counts['play']+=1; body=r.request.post_data_json; state.update(uri=body['uris'][0],pos=0,paused=False,at=time.monotonic());return r.fulfill(status=204)
    if '/me/player/seek?' in u:
     counts['seek']+=1;state['pos']=int(parse_qs(urlparse(u).query)['position_ms'][0]);state['at']=time.monotonic();return r.fulfill(status=204)
    if '/me/player/pause?' in u:advance();state['paused']=True;return r.fulfill(status=204)
    if '/me/player/resume?' in u:advance();state['paused']=False;return r.fulfill(status=204)
    if u.endswith('/me/player'):
     advance();
     if state['transport_offline']:return r.fulfill(status=503,json={'error':{'message':'Playback unavailable'}})
     return r.fulfill(json={'item':{'id':state['uri'].split(':')[-1] if state['uri'] else 'unknown','uri':state['uri']},'progress_ms':state['pos'],'is_playing':not state['paused'],'device':{'id':'browser','volume_percent':state['volume']}})
    if 'reccobeats' in u:return r.fulfill(json={'content':[]})
    if '/v1beta/models?' in u:return r.fulfill(json={'models':[{'name':'models/gemini-3-flash','supportedGenerationMethods':['generateContent']}]})
    if ':generateContent?' in u:
     counts['ai']+=1; text=r.request.post_data_json['contents'][0]['parts'][0]['text']; ids=re.findall(r'"id":"([^"]+)"',text)
     return r.fulfill(json={'candidates':[{'content':{'parts':[{'text':json.dumps([{'id':i,'start':60,'end':105,'mood':'happy','why':'famous passage'} for i in ids])}]}}]})
    return r.fulfill(body='',content_type='application/javascript')
   context.route('**/*',route)
   page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(url);page.wait_for_selector('#v-home:visible');page.wait_for_function("DJ.sdkDev==='browser'");page.locator('#homeCreate').click();page.wait_for_selector('#results .item');page.locator('#results .item').first.click();page.locator('#buildBtn').click()
   page.wait_for_selector('#queue .q');page.wait_for_function('Object.keys(AI.cache()).length===3')
   for view in ['home','mix','play','set']:
    page.locator(f'#nav [data-v={view}]').click();page.wait_for_selector(f'#v-{view}:visible')
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),(width,theme,view,'overflow')
    assert page.locator('#playBtn').count()==1
    assert page.locator('#miniPlayer').is_visible()
    if view=='play':page.locator('#miniPlayer').evaluate("e=>e.scrollIntoView({block:'center'})")
    else:page.locator('#playBtn').scroll_into_view_if_needed()
    if view!='play':page.wait_for_function("document.querySelector('#miniPlayer').getBoundingClientRect().bottom < document.querySelector('#nav').getBoundingClientRect().top")
    bounds=page.evaluate("({player:document.querySelector('#miniPlayer').getBoundingClientRect().toJSON(),nav:document.querySelector('#nav').getBoundingClientRect().toJSON(),height:innerHeight,width:innerWidth,reserve:parseFloat(getComputedStyle(document.querySelector('#scroller')).paddingBottom)})")
    assert bounds['player']['bottom']<=bounds['nav']['top']-4
    assert bounds['player']['left']>=10 and bounds['player']['right']<=width-10
    assert bounds['nav']['width']<=521 and bounds['nav']['left']>=10 and bounds['nav']['bottom']<=height
    if view!='play':assert bounds['reserve']>=height-bounds['player']['top']
    else:assert page.locator('#miniPlayer').evaluate("e=>e.parentElement.id==='deckTransport'")
   page.locator('#nav [data-v=home]').click();assert page.locator('#savedMixes .mix-tile').count()==1;assert page.locator('#savedSongs .saved-song').count()==3
   page.locator('#savedSongSearch').fill('Going Home');assert page.locator('#savedSongs .saved-song').count()==1
   page.locator('#savedSongSearch').fill('');assert page.locator('#savedSongs .saved-song').count()==3
   if width==390:page.screenshot(path=str(preview_dir/f'v35-home-{theme}.png'),full_page=True)
   page.locator('#continueMix button').click();page.wait_for_function('DJ.playing===true');page.evaluate("document.querySelector('#miniPlayer').transportIdentity='one-player'");assert counts['play']==1;assert counts['seek']==1;assert 60000<=state['pos']<64000
   current=page.evaluate('({id:ST.mix[DJ.idx].id,start:ST.mix[DJ.idx].start,end:ST.mix[DJ.idx].end})');plays_before=counts['play']
   for view in ['home','mix','set','play']:
    page.locator(f'#nav [data-v={view}]').click();assert page.locator('#miniState').inner_text()=='Playing';assert page.locator('#playerAction').inner_text()=='Pause';assert page.locator('#miniPlayer').evaluate("e=>e.transportIdentity==='one-player'")
   page.locator('#shuffleBtn').click();assert page.evaluate('DJ.shuffle');assert page.evaluate('ST.mix[DJ.idx].id')==current['id'];assert counts['play']==plays_before
   page.locator('#repeatBtn').click();assert page.evaluate('DJ.repeat')=='all'
   page.locator('#repeatBtn').click();assert page.evaluate('DJ.repeat')=='one'
   page.locator('#repeatBtn').click();assert page.evaluate('DJ.repeat')=='off'
   if width==390:
    for view in ['home','play']:
     page.locator(f'#nav [data-v={view}]').click();page.screenshot(path=str(preview_dir/f'v35-{view}-playing-{theme}.png'),full_page=True)
   page.locator('#renameMix').click();page.locator('#mixName').fill('Night Drive Edit');page.locator('#mixName').press('Space');page.locator('#saveMixName').click();assert page.locator('#mixTitle').inner_text()=='Night Drive Edit'
   page.locator('#playBtn').click();page.wait_for_function("DJ.phase==='paused'&&!DJ.busy")
   previous_plays=counts['play'];page.locator('#nextBtn').click();page.wait_for_function('DJ.idx===1');assert counts['play']==previous_plays;assert page.evaluate('DJ.phase')=='paused'
   page.locator('#prevBtn').click();page.wait_for_function('DJ.idx===0',timeout=8000);assert counts['play']==previous_plays
   page.locator('#playerSeek').evaluate("e=>{e.value=78000;e.dispatchEvent(new Event('change',{bubbles:true}))}")
   keyboard_plays=counts['play'];page.locator('#nav [data-v=home]').click();page.locator('#miniOpen').focus();page.keyboard.press('Space');assert counts['play']==keyboard_plays;assert page.evaluate('ST.view')=='play';assert page.evaluate('DJ.phase')=='paused'
   before=page.evaluate('({ids:ST.mix.map(t=>t.id),pos:DJ.pos,idx:DJ.idx})');oldplays=counts['play'];page.reload();page.wait_for_selector('#app:visible');page.locator('#nav [data-v=home]').click();page.wait_for_selector('#v-home:visible')
   after=page.evaluate('({ids:ST.mix.map(t=>t.id),pos:DJ.pos,idx:DJ.idx})');assert before['ids']==after['ids'];assert abs(before['pos']-after['pos'])<1000;assert counts['play']==oldplays;assert counts['ai']==1
   page.locator('#continueMix button').click();page.wait_for_function('DJ.playing===true');assert abs(state['pos']-before['pos'])<2000;assert counts['ai']==1
   page.locator('#playBtn').click();page.wait_for_function("DJ.phase==='paused'&&!DJ.busy");state['offline']=True;page.reload();page.wait_for_selector('#app:visible');page.locator('#nav [data-v=home]').click();page.wait_for_selector('#v-home:visible');assert page.locator('#savedMixes .mix-tile').count()==1;assert 'Night Drive Edit' in page.locator('#savedMixes').inner_text()
   state['offline']=False
   page.locator('#clearMixes').click();page.locator('#cancelClear').click();assert page.locator('#savedMixes .mix-tile').count()==1
   saved_cache=page.evaluate("LS.get('ai4')")
   page.locator('#clearMixes').click();page.locator('#confirmClear').click();assert page.locator('#savedMixes .mix-tile').count()==0
   page.locator('#clearSavedSongs').click();page.locator('#confirmClear').click();assert page.locator('#savedSongs .saved-song').count()==0
   assert page.evaluate("LS.get('ai4')")==saved_cache
   page.reload();page.wait_for_selector('#app:visible');page.locator('#nav [data-v=home]').click();page.wait_for_selector('#v-home:visible');assert page.locator('#savedMixes .mix-tile').count()==0;assert page.locator('#savedSongs .saved-song').count()==0;assert page.evaluate('Object.keys(AI.cache()).length')==3
   if width==390 and theme=='light':
    # A ready flag with a frozen clock must never produce a Pause/Playing UI.
    state['frozen']=True;page.locator('#homeCreate').click();page.locator('#buildBtn').click();page.wait_for_selector('#queue .q');page.locator('#playBtn').click()
    page.wait_for_function("DJ.phase==='error'&&!DJ.busy",timeout=18000)
    for view in ['home','mix','play','set']:
     page.locator(f'#nav [data-v={view}]').click();assert page.locator('#playerAction').inner_text()=='Retry';assert page.locator('#miniState').inner_text()!='Playing'
    state['frozen']=False;state['at']=time.monotonic();page.locator('#playBtn').click();page.wait_for_function("DJ.phase==='playing'&&!DJ.busy")
    external_plays=counts['play'];advance();state['paused']=True
    page.wait_for_function("DJ.phase==='paused'",timeout=8000);assert page.locator('#playerAction').inner_text()=='Play'
    state['paused']=False;state['at']=time.monotonic();page.wait_for_function("DJ.phase==='playing'",timeout=8000);assert counts['play']==external_plays
    # A different song in this SDK is stopped, never adopted from an old queue.
    state.update(uri=page.evaluate('ST.mix[1].uri'),pos=0,paused=False,at=time.monotonic())
    page.wait_for_function("DJ.phase==='external'&&!DJ.busy",timeout=8000)
    assert state['paused'] and page.evaluate('DJ.idx')==0
    page.locator('#playBtn').click();page.wait_for_function("DJ.phase==='playing'&&!DJ.busy")
    # Outside controls request actual tracks, not ten-second skips.
    assert page.evaluate('mediaHandlers.seekforward===null&&mediaHandlers.seekbackward===null')
    page.evaluate('mediaHandlers.nexttrack()');page.wait_for_function("DJ.idx===1&&DJ.phase==='playing'&&!DJ.busy")
    for view in ['home','mix','play','set']:
     page.locator(f'#nav [data-v={view}]').click();assert page.locator('#miniTitle').inner_text()==page.evaluate('ST.mix[1].name')
    page.evaluate('mediaHandlers.pause()');page.wait_for_function("DJ.phase==='paused'&&!DJ.busy")
    native_plays=counts['play'];page.evaluate('mediaHandlers.nexttrack()');page.wait_for_function("DJ.idx===2&&DJ.phase==='paused'")
    assert counts['play']==native_plays
    page.evaluate('mediaHandlers.play()');page.wait_for_function("DJ.phase==='playing'&&!DJ.busy")
    external_plays=counts['play']
    print('PASS wrong SDK track stopped, media Next selects actual track, paused media Next stays silent, no ten-second handlers')
    state['transport_offline']=True
    page.wait_for_function("DJ.phase!=='playing'",timeout=8000);assert page.locator('#miniState').inner_text()!='Playing';assert counts['play']==external_plays
    state['transport_offline']=False;page.wait_for_function("DJ.phase==='playing'",timeout=8000);assert counts['play']==external_plays
    page.locator('#playBtn').click();page.wait_for_function("DJ.phase==='paused'&&!DJ.busy")
    page.evaluate('window.SDK_NO_STATE=false')
    media_plays=counts['play'];page.evaluate('mediaHandlers.seekto({seekTime:80})');assert counts['play']==media_plays
    page.evaluate('mediaHandlers.play()');page.wait_for_function("DJ.phase==='playing'&&!DJ.busy");assert counts['play']==media_plays
    assert page.locator('#disc').evaluate("e=>getComputedStyle(e).animationPlayState")=='running'
    page.evaluate('mediaHandlers.pause()');page.wait_for_function("DJ.phase==='paused'&&!DJ.busy")
    assert page.locator('#disc').evaluate("e=>getComputedStyle(e).animationPlayState")=='paused'
    page.evaluate("window.SDK_PLAYER.events.not_ready()");page.wait_for_function("DJ.phase==='disconnected'&&DJ.dev===null")
    reconnect_plays=counts['play'];page.locator('#nav [data-v=set]').click();page.locator('#v-set .reconnect-player').click();page.wait_for_function("DJ.sdkDev==='browser'&&DJ.phase==='ready'")
    assert counts['play']==reconnect_plays and page.evaluate('SDK_CONSTRUCTORS')==1
    print('PASS browser media actions, actual-progress CD animation, disconnect/reconnect without native fallback or autoplay')
    print('PASS phone adversarial flow: frozen-start rejection on all screens, retry, external pause/resume, network-loss status, recovery without replay, SDK-only state')
   assert page.evaluate('SDK_OPTIONS.enableMediaSession===true')
   assert not errors,errors
   print(f'PASS {width}x{height} {theme}: create, save, four screens, cached AI song list, play/pause, reopen, same order/position, no autoplay, continue without AI, library during Spotify outage, clear lists keeps AI mappings, ignored starts corrected, shared control/state, shuffle/repeat, paused next/seek')
   context.close()
 browser.close()
