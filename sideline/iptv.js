// Version 35: IPTV portal (MAG / Stalker, MAC-locked) inside Live TV, with STB box model.
// Safari cannot send the MAG box headers a portal checks, so the Sideline bridge on your
// own server (installed automatically beside your Inbox app) logs in as the chosen box and
// turns channels into iPhone HLS. Portal URL, MAC and box model stay on this device and are
// sent to your bridge only.
(function(){
'use strict';
const DEFAULT_SERVER='https://vijayinbox.duckdns.org/sideline';
const CRICKET_RE=/cricket|\bipl\b|\bt20\b|\bodi\b|willow|star sports|sky sports cricket|ptv sports|ten sports|sony (six|ten)/i;
// STB models (the box the portal thinks it is talking to) → the user-agent it sends.
const MAG='Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: ';
const AURA='Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 1812 AuraHD/1.7 Safari/533.3';
const MODELS={
 'MAG250':MAG+'2 rev: 250 Safari/533.3','MAG254':MAG+'4 rev: 2721 Safari/533.3','MAG322':MAG+'6 rev: 3701 Safari/533.3',
 'MAG351':MAG+'6 rev: 4728 Safari/533.3','MAG420':MAG+'6 rev: 5008 Safari/533.3','AuraHD':AURA,'AuraHD2':AURA,'AuraHD9':AURA};
const MODEL_LIST=['AuraHD9','AuraHD','AuraHD2','MAG254','MAG250','MAG322','MAG351','MAG420'];
function agentFor(c){const m=(c&&c.model)||'MAG254';return {model:m,ua:MODELS[m]||MODELS.MAG254,sn:(c&&c.sn)||'',deviceId:(c&&c.deviceId)||'',deviceId2:(c&&c.deviceId2)||'',signature:(c&&c.signature)||''}}
let cfg=read('sideline-iptv',null);if(!cfg||typeof cfg.portal!=='string'||typeof cfg.mac!=='string')cfg=null;
let list=null,loading=null,errorText='',cat=read('sideline-iptv-cat',''),shown=120,lastPlay=null,view='Live TV';
const serverBase=()=>((cfg&&cfg.server)||DEFAULT_SERVER).replace(/\/+$/,'');

const css=document.createElement('style');
css.textContent='#iptvBoard{margin:0 0 26px}#iptvBoard .iptv-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px}#iptvBoard .iptv-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 12px}#iptvBoard .iptv-top h3{margin:0;font-size:18px}#iptvBoard .iptv-top small{color:var(--muted)}#iptvChips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px 0 12px}#iptvChips::-webkit-scrollbar{display:none}#iptvChips button{flex:0 0 auto;border:1px solid var(--line);background:var(--bg2);color:var(--muted);border-radius:999px;padding:0 14px;min-height:36px;font:600 13px/1 inherit}#iptvChips button.on{background:var(--accent);border-color:var(--accent);color:#fff}#iptvGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.iptv-ch{display:flex;align-items:center;gap:10px;min-height:58px;padding:8px 10px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);color:var(--text);text-align:left;font:600 13px/1.25 inherit;cursor:pointer}.iptv-ch:active{transform:scale(.98)}.iptv-ch img,.iptv-ch i{flex:0 0 40px;width:40px;height:40px;border-radius:8px;object-fit:contain;background:#0006;display:grid;place-items:center;font-style:normal;color:var(--muted);font-size:12px}.iptv-ch span{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.iptv-ch.playing{border-color:var(--accent)}#iptvMore{margin-top:12px}#iptvLast{margin:12px 0 0;font-size:12px;color:var(--muted)}#iptvLast button{margin-left:6px}@media(max-width:600px){#iptvGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}';
document.head.appendChild(css);

const board=document.createElement('div');board.id='iptvBoard';board.className='hidden';
function attachBoard(){const lb=$('#liveBoard');if(lb&&lb.firstChild!==board)lb.prepend(board)}
attachBoard();
// live.js replaces #liveBoard's contents on every refresh; keep the IPTV box pinned at the top.
{const lb=$('#liveBoard');if(lb)new MutationObserver(()=>{if(lb.firstChild!==board)lb.prepend(board)}).observe(lb,{childList:true})}

const dlg=document.createElement('dialog');dlg.id='iptvDialog';
dlg.innerHTML='<div class="dialog-head"><h2>Your IPTV</h2><button class="close" id="iptvClose" aria-label="Close IPTV settings">×</button></div>'+
 '<p class="help">For IPTV subscriptions locked to a MAC address (MAG box / Stalker portal). Your Sideline bridge, running beside your Inbox app on your server, logs in as the box for you, because Safari cannot. Portal URL and MAC are saved only on this phone and sent to your bridge only.</p>'+
 '<form id="iptvForm" autocomplete="off"><label class="field">Portal URL<input id="iptvPortal" type="text" inputmode="url" placeholder="http://line.provider.com:8080/c/" spellcheck="false" autocapitalize="off" required></label>'+
 '<label class="field">MAC address<input id="iptvMac" type="text" placeholder="00:1A:79:AB:CD:EF" spellcheck="false" autocapitalize="characters" required></label>'+
 '<label class="field">STB model (the box your provider set up)<select id="iptvModel">'+MODEL_LIST.map(m=>'<option value="'+m+'">'+m+'</option>').join('')+'</select></label>'+
 '<label class="field">Serial number <span style="color:var(--muted);font-weight:400">(from your box app, optional)</span><input id="iptvSn" type="text" placeholder="e.g. 062014N016744" spellcheck="false" autocapitalize="characters"></label>'+
 '<label class="field">Device ID <span style="color:var(--muted);font-weight:400">(optional)</span><input id="iptvDev" type="text" placeholder="long code from your box app" spellcheck="false" autocapitalize="characters"></label>'+
 '<details style="margin:0 0 12px"><summary class="help" style="cursor:pointer">More identity fields (only if still refused)</summary>'+
 '<label class="field">Device ID 2 <span style="color:var(--muted);font-weight:400">(optional)</span><input id="iptvDev2" type="text" placeholder="from your box app" spellcheck="false" autocapitalize="characters"></label>'+
 '<label class="field">Signature <span style="color:var(--muted);font-weight:400">(optional)</span><input id="iptvSig" type="text" placeholder="from your box app" spellcheck="false" autocapitalize="characters"></label></details>'+
 '<label class="field">Bridge address<input id="iptvServer" type="text" inputmode="url" placeholder="'+DEFAULT_SERVER+'" spellcheck="false" autocapitalize="off"></label>'+
 '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="primary" id="iptvSave">Save and load channels</button><button class="secondary" id="iptvForget" type="button">Forget IPTV</button></div></form>'+
 '<p id="iptvStatus" class="help" role="status"></p>'+
 '<p class="help" style="font-size:11px">Many providers allow one device per MAC at a time. Turn off your MAG box or other app using this MAC while watching here.</p>';
document.body.appendChild(dlg);

function macOK(v){const h=String(v||'').replace(/[^0-9a-f]/gi,'').toUpperCase();return h.length===12?h.match(/.{2}/g).join(':'):null}
async function api(route,data,ms){
 const base=serverBase();const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms||30000);
 try{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data||{}),signal:ctl.signal,credentials:'omit',referrerPolicy:'no-referrer'});
  let out={};try{out=await r.json()}catch{}
  if((r.status===404||r.status===502||r.status===503)&&!out.error)throw new Error('The IPTV bridge is still installing on your server — it can take a minute after an update. Try again shortly.');
  if(!r.ok)throw new Error(out.error||'Bridge request failed.');return out}
 catch(e){if(e.name==='AbortError')throw new Error('The bridge took too long. The channel may be offline.');if(e.message==='Failed to fetch'||e.name==='TypeError')throw new Error('Could not reach your bridge at '+base.replace(/^https?:\/\//,'')+'. Check the address.');throw e}
 finally{clearTimeout(t)}}

function openDialog(){
 $('#iptvPortal').value=cfg?.portal||'';$('#iptvMac').value=cfg?.mac||'';$('#iptvModel').value=cfg?.model||'MAG254';$('#iptvSn').value=cfg?.sn||'';$('#iptvDev').value=cfg?.deviceId||'';$('#iptvDev2').value=cfg?.deviceId2||'';$('#iptvSig').value=cfg?.signature||'';$('#iptvServer').value=cfg?.server||DEFAULT_SERVER;
 $('#iptvStatus').textContent='';dlg.showModal()}
$('#iptvClose').onclick=()=>dlg.close();
$('#iptvForget').onclick=()=>{cfg=null;list=null;errorText='';try{localStorage.removeItem(window.sidelineStorageKey('sideline-iptv'))}catch{}$('#iptvStatus').textContent='IPTV removed from this phone.';paint()};
$('#iptvForm').onsubmit=async e=>{e.preventDefault();
 const portal=$('#iptvPortal').value.trim(),mac=macOK($('#iptvMac').value),model=$('#iptvModel').value,sn=$('#iptvSn').value.trim(),deviceId=$('#iptvDev').value.trim(),deviceId2=$('#iptvDev2').value.trim(),signature=$('#iptvSig').value.trim(),server=($('#iptvServer').value.trim()||DEFAULT_SERVER).replace(/\/+$/,'');
 if(!mac){$('#iptvStatus').textContent='The MAC address needs 12 letters/numbers, like 00:1A:79:AB:CD:EF.';return}
 if(!/^https?:\/\//i.test(server)){$('#iptvStatus').textContent='The bridge address should start with https://';return}
 $('#iptvSave').disabled=true;$('#iptvStatus').textContent='Logging in to your portal through your bridge…';
 const prev=cfg;cfg={portal,mac,model,sn,deviceId,deviceId2,signature,server};
 try{const data=await api('/api/iptv/channels',{...cfg,...agentFor(cfg)},150000);save('sideline-iptv',cfg);list=data;errorText='';cat='';shown=120;
  $('#iptvStatus').textContent='Loaded '+data.channels.length+' channels in '+data.categories.length+' categories ✓';paint();setTimeout(()=>dlg.close(),900)}
 catch(err){cfg=prev;$('#iptvStatus').textContent=err.message}
 finally{$('#iptvSave').disabled=false}};

async function loadList(){
 if(!cfg||list||loading)return loading;
 errorText='';loading=api('/api/iptv/channels',{...cfg,...agentFor(cfg)},150000).then(d=>{list=d}).catch(e=>{errorText=e.message}).finally(()=>{loading=null;paint()});paint();return loading}

function visible(){
 if(!list)return [];let l=list.channels;
 if(view==='Sports')l=l.filter(c=>CRICKET_RE.test(c.name+' '+c.category));
 else if(cat)l=l.filter(c=>c.category===cat);
 const q=($('#search').value||'').trim().toLowerCase();if(q)l=l.filter(c=>c.name.toLowerCase().includes(q)||c.category.toLowerCase().includes(q));
 return l}

function chHTML(c,i){const logo=/^https:/i.test(c.logo||'')?'<img src="'+boardEsc(c.logo)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<i>TV</i>\'">':'<i>'+boardEsc(String(c.number??'TV')).slice(0,4)+'</i>';
 return '<button class="iptv-ch'+(lastPlay&&lastPlay.id===c.id?' playing':'')+'" data-iptv="'+i+'" title="'+boardEsc(c.name)+'">'+logo+'<span>'+boardEsc(c.name)+'</span></button>'}

let rendered=[];
function paint(){
 attachBoard();
 const live=['Live TV','Sports'].includes(view);board.classList.toggle('hidden',!live);if(!live)return;
 const sports=view==='Sports';
 // Not set up yet — show the Set up card on both Live TV and Cricket.
 if(!cfg){board.innerHTML='<div class="iptv-card"><div class="iptv-top"><div><h3>'+(sports?'Cricket on your IPTV':'Your IPTV')+'</h3><small>Watch a MAC-locked IPTV subscription (MAG / Stalker portal) here</small></div><button class="primary" data-iptv-setup>Set up</button></div></div>';return}
 const head='<div class="iptv-top"><div><h3>'+(sports?'Cricket on your IPTV':'Your IPTV')+'</h3><small>'+(list?list.channels.length+' channels':'')+'</small></div><button class="text-button" data-iptv-setup>⚙ IPTV</button></div>';
 if(!list){board.innerHTML='<div class="iptv-card">'+head+'<p class="help">'+boardEsc(errorText||'Loading your channels…')+'</p>'+(errorText?'<button class="secondary" data-iptv-retry>↻ Try again</button>':'')+'</div>';return}
 rendered=visible();
 const chips=sports?'':'<div id="iptvChips" role="group" aria-label="IPTV categories">'+[['','All'],...list.categories.map(x=>[x,x])].map(([v,n])=>'<button type="button" data-iptv-cat="'+boardEsc(v)+'" class="'+(v===cat?'on':'')+'">'+boardEsc(n)+'</button>').join('')+'</div>';
 const empty=sports?'No cricket channels found in your IPTV list. Try the search, or use Live TV to see all channels.':'No channels match.';
 const grid=rendered.length?'<div id="iptvGrid">'+rendered.slice(0,shown).map(chHTML).join('')+'</div>'+(rendered.length>shown?'<button class="secondary" id="iptvMore" data-iptv-more>Show more ('+(rendered.length-shown)+')</button>':''):'<p class="help">'+empty+'</p>';
 const last=lastPlay?'<p id="iptvLast">Last: '+boardEsc(lastPlay.name)+'. No picture? <button class="secondary" data-iptv-convert>Convert video</button></p>':'';
 board.innerHTML='<div class="iptv-card">'+head+chips+grid+last+'</div>'}

async function play(c,convert){
 lastPlay={...c,convert:!!convert};paint();toast('Starting '+c.name+'…');
 try{const r=await api('/api/iptv/play',{...cfg,...agentFor(cfg),cmd:c.cmd,name:c.name,convert:!!convert},50000);
  const id='iptv-live';channels=channels.filter(x=>x.id!==id);
  channels.push({id,name:c.name,category:'Live TV',tags:[],desc:'Your IPTV'+(c.category?' · '+c.category:''),logo:c.name,photo:'tv',stream:r.hls,alternatives:[r.hls],onDemand:false,mediaFormat:'hls'});
  watch(id);
  if(r.direct){const vlc=makePlayerURL(r.direct);if(vlc){$('#infusePlayer').href=vlc;$('#infusePlayer').classList.remove('hidden')}}}
 catch(e){toast(e.message)}}

board.addEventListener('click',e=>{
 const ch=e.target.closest('[data-iptv]');if(ch){const c=rendered[Number(ch.dataset.iptv)];if(c)play(c,false);return}
 if(e.target.closest('[data-iptv-setup]')){openDialog();return}
 if(e.target.closest('[data-iptv-retry]')){loadList();return}
 if(e.target.closest('[data-iptv-more]')){shown+=120;paint();return}
 if(e.target.closest('[data-iptv-convert]')&&lastPlay){play(lastPlay,true);return}
 const ct=e.target.closest('[data-iptv-cat]');if(ct){cat=ct.dataset.iptvCat;save('sideline-iptv-cat',cat);shown=120;paint()}});
$('#search').addEventListener('input',()=>{if(!board.classList.contains('hidden')){shown=120;paint()}});

// Free the provider's one-device slot as soon as the player closes.
$('#player').addEventListener('close',()=>{if(current==='iptv-live'&&cfg)api('/api/iptv/stop',{},8000).catch(()=>{})});

// Show inside Live TV and Cricket, and keep showing even if another file re-renders the nav.
const baseRender=typeof renderLive==='function'?renderLive:null;
renderLive=function(v){view=v;const r=baseRender?baseRender(v):undefined;paint();if(['Live TV','Sports'].includes(v))loadList();return r};
document.querySelector('nav')?.addEventListener('click',e=>{const b=e.target.closest('[data-nav]');if(b){const v=b.dataset.nav;if(['Live TV','Sports'].includes(v)){view=v;setTimeout(()=>{paint();loadList()},0)}}});
if(typeof nav!=='undefined'&&nav!=='Sources'){view=nav;paint();loadList()}
})();
