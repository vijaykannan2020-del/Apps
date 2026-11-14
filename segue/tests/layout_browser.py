"""Responsive glass-shell checks with synthetic metadata; no live account/audio."""
import base64,json,os,shutil,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
sdk=(Path(__file__).resolve().parent/'mock_sdk.js').read_text()
url='https://vijaykannan2020-del.github.io/Apps/segue/'
previews=Path(os.environ.get('SEGUE_PREVIEW_DIR',Path(tempfile.gettempdir())/'segue-previews'));previews.mkdir(parents=True,exist_ok=True)
artists=['Anirudh Ravichander','Sai Abhyankkar','Harris Jayaraj','A.R. Rahman','Yuvan Shankar Raja']
long_name=' + '.join(artists)
def art(n):
 colors=[('#183b31','#407d64'),('#24324b','#7b9bc2'),('#482a24','#b57555'),('#342c43','#9d85ba')];a,b=colors[n%4]
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="280" cy="150" r="130" fill="white" opacity=".08"/><text x="34" y="320" fill="white" font-family="sans-serif" font-size="40">S E G U E</text><text x="34" y="355" fill="white" opacity=".6" font-family="sans-serif" font-size="14">LAYOUT PREVIEW</text></svg>'
 return 'data:image/svg+xml;base64,'+base64.b64encode(svg.encode()).decode()
tracks=[{'id':str(i).zfill(22),'uri':'spotify:track:'+str(i).zfill(22),'name':'Netru Ponavi' if i==3 else f'Favourite song {i+1}','artists':[artists[i%len(artists)]],'dur':72000,'img':art(i),'imgS':art(i),'energy':.5,'dance':.5,'aiStart':15000,'aiEnd':65000,'start':15000,'end':65000,'hook':15000,'hookSrc':'ai','fadeOut':300} for i in range(120)]
sources=[{'type':'artist','id':str(i).zfill(22),'name':name} for i,name in enumerate(artists)]
mixes=[{'id':f'mix{i}','name':long_name if i==0 else ['Evening favourites','Weekend drive','Old favourites'][i%3],'tracks':tracks[:120 if i==0 else 15],'idx':3 if i==0 else 0,'position':17000,'positionReady':True,'pendingSeek':False,'sources':sources,'baseOrder':[t['id'] for t in tracks],'shuffle':False,'repeat':'off','history':[],'createdAt':1,'updatedAt':2} for i in range(6)]
cache={t['id']:{'start':15000,'end':65000,'mood':'intense','song':t} for t in tracks}
library={'schema':1,'sources':sources,'max':120,'activeId':'mix0','mixes':mixes,'hiddenPicks':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SEGUE_CHROMIUM') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox'])
 for width,height in [(320,740),(390,844),(430,932),(844,390),(900,600),(1280,900),(1536,960)]:
  for theme in ['light','dark']:
   context=browser.new_context(viewport={'width':width,'height':height},color_scheme=theme)
   seed={'segue_aikey':'test','segue_at':'test','segue_rt':'test','segue_exp':'9999999999999','segue_library_layout':json.dumps(library),'segue_ai4':json.dumps(cache)}
   context.add_init_script('for(const [k,v] of Object.entries('+json.dumps(seed)+')){if(localStorage.getItem(k)==null)localStorage.setItem(k,v)}')
   errors=[];writes=[]
   def route(r):
    u=r.request.url
    if u==url:return r.fulfill(body=html,content_type='text/html')
    if 'sdk.scdn.co/spotify-player.js' in u:return r.fulfill(body=sdk,content_type='application/javascript')
    if r.request.method in ['POST','PUT','DELETE']:writes.append(u)
    if u.endswith('/v1/me'):return r.fulfill(json={'id':'layout','display_name':'Layout preview'})
    if '/me/player/devices' in u:return r.fulfill(json={'devices':[{'id':'phone','name':'This phone','type':'Smartphone','is_active':True}]})
    if u.endswith('/me/player'):return r.fulfill(json={'item':{'id':tracks[3]['id'],'uri':tracks[3]['uri']},'progress_ms':17000,'is_playing':False,'device':{'id':'browser'}})
    if '/me/playlists' in u:return r.fulfill(json={'items':[],'next':None})
    return r.fulfill(body='',content_type='application/javascript')
   context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(url);page.wait_for_selector('#v-play:visible');page.wait_for_function("DJ.phase==='ready'&&DJ.sdkDev==='browser'")
   for view in ['home','mix','play','set']:
    page.locator(f'#nav [data-v={view}]').click();page.wait_for_selector(f'#v-{view}:visible')
    if view=='play':page.locator('#miniPlayer').evaluate("e=>e.scrollIntoView({block:'center'})")
    else:page.locator('#playBtn').scroll_into_view_if_needed()
    if view!='play':page.wait_for_function("document.querySelector('#miniPlayer').getBoundingClientRect().bottom <= document.querySelector('#nav').getBoundingClientRect().top - 4")
    box=page.evaluate("""()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {player:r('#miniPlayer'),nav:r('#nav'),main:r('#app'),padding:parseFloat(getComputedStyle(document.querySelector('#scroller')).paddingBottom),radius:parseFloat(getComputedStyle(document.querySelector('#nav')).borderRadius),blur:getComputedStyle(document.querySelector('#nav')).backdropFilter,overflow:document.documentElement.scrollWidth>innerWidth,buttons:['shuffleBtn','prevBtn','playBtn','nextBtn','repeatBtn'].map(id=>r('#'+id))}}""")
    assert not box['overflow'],(width,height,theme,view,'horizontal overflow')
    assert box['main']['width']<=1121,(width,view,'stretched content')
    assert 10<=box['nav']['left'] and box['nav']['right']<=width-10 and box['nav']['width']<=521
    assert box['radius']>=100 and box['blur']!='none'
    assert box['player']['width']<=841 and box['player']['left']>=10 and box['player']['right']<=width-10
    assert box['player']['bottom']<=box['nav']['top']-4 and box['nav']['bottom']<=height,(width,height,view,box['player'],box['nav'])
    if view!='play':assert box['padding']>=height-box['player']['top']
    else:
     assert page.locator('#miniPlayer').evaluate("e=>e.parentElement.id==='deckTransport'")
     assert page.locator('#queue').evaluate('e=>e.scrollHeight>e.clientHeight')
    assert all(b['width']>=43.5 and b['height']>=43.5 for b in box['buttons']),('touch targets',width,box['buttons'])
    assert page.locator('#playBtn').count()==1 and page.locator('#miniState').inner_text()=='Ready'
    if width>=720 and view=='home':
     assert page.locator('.hero').bounding_box()['x']<page.locator('#continueMix').bounding_box()['x']
    if width>=720 and view=='play':assert page.locator('#orderCard').bounding_box()['x']<page.locator('#deck').bounding_box()['x']
    if width in [390,844,1280] and view in ['home','play']:page.screenshot(path=str(previews/f'v34-{width}x{height}-{view}-{theme}.png'))
   # At the very end of Home content, floating chrome cannot cover its last note.
   page.locator('#nav [data-v=home]').click();page.evaluate("document.querySelector('#scroller').scrollTop=document.querySelector('#scroller').scrollHeight")
   page.wait_for_function("document.querySelector('#v-home>.local-note').getBoundingClientRect().bottom < document.querySelector('#miniPlayer').getBoundingClientRect().top")
   # Live orientation changes must keep the same queue, state, mappings and no audio writes.
   before=page.evaluate('JSON.stringify({ids:ST.mix.map(t=>t.id),idx:DJ.idx,phase:DJ.phase,cache:AI.cache()})')
   page.set_viewport_size({'width':height,'height':width});page.wait_for_timeout(80)
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
   assert page.evaluate('JSON.stringify({ids:ST.mix.map(t=>t.id),idx:DJ.idx,phase:DJ.phase,cache:AI.cache()})')==before
   assert not writes,writes
   assert not errors,errors
   print(f'PASS {width}x{height} {theme}: four views, capped content, glass capsule, non-overlapping reserved footer, 44px targets, rotation preserves player/cache')
   context.close()
 # Accessibility fallback must remain solid when the OS requests less transparency.
 page=browser.new_page(viewport={'width':390,'height':844})
 page.route('**/*',lambda r:r.fulfill(body=html if r.request.url==url else '',content_type='text/html' if r.request.url==url else 'application/javascript'))
 page.goto(url)
 cdp=page.context.new_cdp_session(page);cdp.send('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-transparency','value':'reduce'}]})
 assert page.evaluate("matchMedia('(prefers-reduced-transparency: reduce)').matches")
 assert page.locator('#nav').evaluate("e=>getComputedStyle(e).backdropFilter")=='none'
 assert page.locator('#miniPlayer').evaluate("e=>getComputedStyle(e).backdropFilter")=='none'
 print('PASS reduced-transparency fallback removes blur from both docks')
 page.emulate_media(reduced_motion='reduce')
 assert page.locator('.walkman-intro').evaluate('e=>getComputedStyle(e).display')=='none'
 assert page.locator('#disc').evaluate('e=>getComputedStyle(e).animationName')=='none'
 page.emulate_media(reduced_motion='no-preference');page.reload();page.wait_for_timeout(1100)
 assert page.locator('.walkman-intro').evaluate('e=>getComputedStyle(e).visibility')=='hidden'
 assert page.locator('.walkman-intro').evaluate('e=>getComputedStyle(e).pointerEvents')=='none'
 print('PASS cassette greeting ends without blocking input and skips reduced-motion')
 browser.close()
