"""Local file decoding/worker/review/storage checks. Synthetic tones, not musical judgment."""
import io, math, struct, wave, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
# Load the production UI and handlers, without account startup or Spotify SDK.
html=html[:html.index('(async function boot(){')]+'\n</script></body></html>'
url='https://vijaykannan2020-del.github.io/Apps/segue/'
def recording(seconds=85):
 b=io.BytesIO()
 with wave.open(b,'wb') as w:
  w.setparams((1,2,11025,0,'NONE','not compressed'))
  data=bytearray()
  for i in range(11025*seconds):
   t=i/11025; hot=22<=t<57
   amp=.65 if hot else .08; beat=(1 if math.sin(2*math.pi*2*t)>0 else .25) if hot else 1
   data+=struct.pack('<h',int(amp*beat*math.sin(2*math.pi*(220 if hot else 440)*t)*32767))
  w.writeframes(data)
 return b.getvalue()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SEGUE_CHROMIUM',shutil.which('chromium')),args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844})
 unexpected=[]
 def route(r):
  if r.request.url==url:r.fulfill(body=html,content_type='text/html')
  elif 'fonts.' in r.request.url or 'sdk.scdn.co' in r.request.url:r.fulfill(body='',content_type='application/javascript')
  else:unexpected.append(r.request.url);r.abort()
 context.route('**/*',route);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url)
 page.evaluate("""async()=>{await Persist.init();ST.me={id:'file-test'};ST.mix=[{id:'recording',uri:'spotify:track:recording',isrc:'INAAA2400001',name:'Test recording',artists:['Test artist'],dur:85000}];ST.pool=ST.mix;$('#boot').classList.add('hide');$('#app').classList.remove('hide');document.querySelectorAll('.view').forEach(e=>e.classList.add('hide'));$('#v-set').classList.remove('hide');LocalAudio.refresh();globalThis.aiCalls=0;AI.call=async()=>{aiCalls++;throw Error('AI must stay off')};} """)
 page.locator('#audioFile').set_input_files({'name':'wrong-version.wav','mimeType':'audio/wav','buffer':recording(20)})
 page.click('#analyseFile');page.wait_for_function("document.querySelector('#audioStatus').textContent.includes('Recording mismatch')")
 assert page.evaluate('LocalAudio.result') is None
 page.locator('#audioFile').set_input_files({'name':'matching.wav','mimeType':'audio/wav','buffer':recording()})
 page.evaluate('async()=>{const pending=LocalAudio.analyse();LocalAudio.cancel();await pending;}')
 assert page.evaluate('LocalAudio.result') is None
 page.click('#analyseFile');page.wait_for_function('LocalAudio.result!==null',timeout=30000)
 assert page.locator('[data-candidate]').count()>0
 assert page.locator('#audioReview').is_visible()
 page.screenshot(path='/tmp/segue39-matching-file.png',full_page=True)
 # Review endpoints are editable, not imposed by the energy detector.
 page.fill('#audioStart','0:22');page.fill('#audioEnd','0:57')
 page.evaluate("()=>{DJ.go=async(i,o)=>{globalThis.preview={i,...o,end:ST.mix[i].end};return true}}")
 page.click('#previewPassage');page.wait_for_function('!!globalThis.preview')
 assert page.evaluate('preview.position')==22000 and page.evaluate('preview.end')==57000
 assert page.evaluate('Object.keys(AI.cache()).length')==0
 page.click('#savePassage');page.wait_for_function("AI.cache().recording?.boundary==='user-reviewed'")
 assert page.evaluate('AI.cache().recording.source')=='local-audio'
 assert page.evaluate("AI.pick({id:'other-release',isrc:'INAAA2400001',dur:85000}).end")==57000
 assert page.evaluate('aiCalls')==0
 page.evaluate('()=>Persist.flush()')
 page.reload();page.evaluate('()=>Persist.init()')
 assert page.evaluate('AI.cache().recording.start')==22000
 assert page.evaluate('AI.usesGemini()') is False
 assert not errors,errors
 assert not unexpected,unexpected
 browser.close()
 print('PASS real browser local WAV decode, worker suggestions, mismatch, preview, approval, recording reuse and IndexedDB reload; zero file uploads/AI calls')
