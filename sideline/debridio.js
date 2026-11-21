// Debridio: build the add-on link from the user's keys (same format as debridio.com's
// "Copy Install URL") and add it as a normal source. Keys stay in this browser only.
const debridioHost='addon.debridio.com';
const debridioResolutions=['8k','4k','1440p','1080p','720p','480p','360p','unknown'];
const debridioLowQuality=['TeleCine','TeleSync','SCR','CAM'];
function isDebridioSource(p){try{return new URL(p.base).hostname===debridioHost}catch{return false}}
function debridioManifestURL(cfg){const json=JSON.stringify({api_key:cfg.apiKey,provider:cfg.provider,providerKey:cfg.providerKey,disableUncached:cfg.cachedOnly,maxSize:'',maxReturnPerQuality:'',resolutions:debridioResolutions,excludedQualities:debridioLowQuality,preferredLang:cfg.language?[cfg.language]:[]});return 'https://'+debridioHost+'/'+btoa(unescape(encodeURIComponent(json)))+'/manifest.json'}
async function debridioManifest(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});let body=null;try{body=await response.json()}catch{}if(!response.ok){const msg=typeof body?.message==='string'?body.message:'';throw new Error(/subscription/i.test(msg)?'Debridio says the subscription is not active. Check your Debridio API key and your plan on debridio.com.':response.status===401||response.status===403?'Debridio rejected the key. Check your Debridio API key.'+(msg?' ('+msg.slice(0,120)+')':''):'Debridio did not respond correctly (error '+response.status+'). Try again later.')}if(!body||typeof body.id!=='string'||typeof body.name!=='string'||!Array.isArray(body.resources))throw new Error('Debridio returned an unexpected reply. Try again later.');body.catalogs=Array.isArray(body.catalogs)?body.catalogs:[];return body}catch(error){if(error.name==='AbortError')throw new Error('Debridio took too long to answer. Check your internet and try again.');if(error instanceof TypeError)throw new Error('Could not reach Debridio. Check your internet and try again.');throw error}finally{clearTimeout(timer)}}
function renderDebridioState(){const connected=providers.some(isDebridioSource);$('#debridioState').textContent=connected?'Connected ✓ Debridio results appear when you open a movie or episode.':'Not connected.'}
$('#debridioForm').onsubmit=async e=>{e.preventDefault();const status=$('#debridioStatus'),button=$('#connectDebridio');const cfg={apiKey:$('#debridioKey').value.trim(),provider:$('#debridioProvider').value,providerKey:$('#debridioProviderKey').value.trim(),cachedOnly:$('#debridioCachedOnly').checked,language:$('#debridioLanguage').value};
 if(!cfg.apiKey||/\s/.test(cfg.apiKey)){status.textContent='Paste your Debridio API key (no spaces).';return}
 if(!cfg.provider){status.textContent='Choose your debrid service.';return}
 if(!cfg.providerKey||/\s/.test(cfg.providerKey)){status.textContent='Paste the API key from your debrid service (no spaces).';return}
 button.disabled=true;status.textContent='Connecting to Debridio…';
 try{const p=normalizeProvider(debridioManifestURL(cfg)),manifest=await debridioManifest(p.url);
  const others=providers.filter(x=>!isDebridioSource(x));if(others.length>=8)throw new Error('Remove a source before adding Debridio. Maximum: 8.');
  providers.splice(0,providers.length,...others,{...p,manifest,enabled:true});
  if($('#debridioRemember').checked)$('#rememberProviders').checked=true;
  persistProviders();renderProviders();renderDebridioState();searchGeneration++;streamGeneration++;
  $('#debridioKey').value='';$('#debridioProviderKey').value='';
  status.textContent='Debridio connected. Close this panel, search for a movie, open it and tap ▶ Play here on a Debridio result.';
  $('#libraryStatus').textContent='Debridio is ready. Search for a title or select Browse.'}
 catch(error){status.textContent=error.message||'Could not connect to Debridio.'}
 finally{button.disabled=false}};
$('#disconnectDebridio').onclick=()=>{const before=providers.length;providers.splice(0,providers.length,...providers.filter(x=>!isDebridioSource(x)));persistProviders();renderProviders();renderDebridioState();$('#debridioStatus').textContent=before!==providers.length?'Debridio removed from this device.':'Debridio was not connected.'};
{const open=$('#manageProviders').onclick;$('#manageProviders').onclick=()=>{renderDebridioState();open()}}
$('#providerList').addEventListener('click',()=>setTimeout(renderDebridioState,0));
renderDebridioState();

// One debrid account for every source. The key is saved once on this device and written into
// every source that takes a debrid key in its link (Torrentio-style "service=KEY" settings),
// and Debridio uses it as its provider key. Real-Debrid's own API blocks browser requests,
// so plain torrent results from other add-ons still need Webtor or the private server.
const torrentioServices={realdebrid:'Real-Debrid',alldebrid:'AllDebrid',premiumize:'Premiumize',torbox:'TorBox',debridlink:'Debrid-Link',easydebrid:'EasyDebrid',offcloud:'Offcloud'};
let debridAccount=read('sideline-debrid',null);if(!debridAccount||!(debridAccount.service in torrentioServices)||typeof debridAccount.key!=='string')debridAccount=null;
function isTorrentioSource(p){try{return /(^|\.)torrentio\.strem\.fun$|knightcrawler|torrentio/i.test(new URL(p.base).hostname)}catch{return false}}
function torrentioOptions(p){const u=new URL(p.base),parts=u.pathname.replace(/^\/+|\/+$/g,'').split('/'),seg=decodeURIComponent(parts.pop()||'');const opts=[];for(const part of seg.split('|')){const i=part.indexOf('=');if(i>0)opts.push([part.slice(0,i),part.slice(i+1)])}return {origin:u.origin+(parts.length?'/'+parts.join('/'):''),opts}}
function takesDebridKey(p){if(isDebridioSource(p))return false;if(isTorrentioSource(p))return true;try{const {opts}=torrentioOptions(p);return opts.some(([k])=>k in torrentioServices||k==='debridoptions')}catch{return false}}
function torrentioDebrid(p){const {opts}=torrentioOptions(p);const hit=opts.find(([k])=>k in torrentioServices||k==='putio');return hit?(torrentioServices[hit[0]]||'Put.io'):null}
function withDebrid(p,acct){const {origin,opts}=torrentioOptions(p);const kept=opts.filter(([k])=>!(k in torrentioServices)&&k!=='putio');const config=[...kept,...(acct?[[acct.service,acct.key]]:[])].map(([k,v])=>k+'='+v).join('|');return normalizeProvider(origin+'/'+(config?config+'/':'')+'manifest.json')}
function sourceName(p){return p.manifest?.name||new URL(p.base).hostname}
function renderTorrentioState(){const using=providers.filter(takesDebridKey).map(sourceName);const debridio=providers.some(isDebridioSource);
 $('#torrentioState').textContent=debridAccount?torrentioServices[debridAccount.service]+' key saved ✓ Used by: '+([...using,...(debridio?['Debridio']:[])].join(', ')||'new sources you add (and Torrentio if you tick the box)'):'No debrid key saved yet.';
 $('#forgetDebrid').classList.toggle('hidden',!debridAccount);
 const shared=!!debridAccount;$('#debridioProvider').closest('label').classList.toggle('hidden',shared);$('#debridioProviderKey').closest('label').classList.toggle('hidden',shared);
 $('#debridioShared').textContent=shared?'Uses your saved '+torrentioServices[debridAccount.service]+' key from "Your debrid account" above. You only need the Debridio key.':'';}
// Quietly bring every compatible source in line with the saved key (no network calls).
function applyDebridEverywhere(){if(!debridAccount)return 0;let changed=0;providers.forEach((p,i)=>{if(!takesDebridKey(p))return;const next=withDebrid(p,debridAccount);if(next.url!==p.url){providers[i]={...p,...next};changed++}});if(changed){persistProviders();searchGeneration++;streamGeneration++}return changed}
async function probeTorrentio(p,service){try{const probe=await providerJSON(p.base+'/stream/movie/tt0111161.json'+(p.query||''),20000);const first=(probe.streams||[])[0];const text=first?[first.name,first.title,first.description].filter(x=>typeof x==='string').join(' '):'';if(/invalid|expired|error|access denied|not premium/i.test(text)&&/failed_access|error/i.test((first.url||'')+' '+text))throw new Error('The '+torrentioServices[service]+' key was rejected: '+text.replace(/\s+/g,' ').slice(0,140))}catch(err){if(err.message?.startsWith('The '))throw err}}
$('#torrentioForm').onsubmit=async e=>{e.preventDefault();const status=$('#torrentioStatus'),button=$('#connectTorrentio'),service=$('#torrentioService').value,key=$('#torrentioKey').value.trim();
 if(!(service in torrentioServices)){status.textContent='Choose your debrid service.';return}
 if(!key||/[\s|\/]/.test(key)){status.textContent='Paste the API key from your debrid service (no spaces).';return}
 button.disabled=true;status.textContent='Checking your key…';
 try{const acct={service,key};
  // Check the key once through Torrentio (works for any Torrentio-style source).
  const test=withDebrid({base:'https://torrentio.strem.fun'},acct);await probeTorrentio(test,service);
  let index=providers.findIndex(p=>{try{return /(^|\.)torrentio\.strem\.fun$/i.test(new URL(p.base).hostname)}catch{return false}});
  if(index<0&&$('#addTorrentio').checked){if(providers.length>=8)throw new Error('Remove a source before adding Torrentio. Maximum: 8.');const manifest=await providerJSON(test.url);manifest.catalogs=Array.isArray(manifest.catalogs)?manifest.catalogs:[];providers.push({...test,manifest,enabled:true})}
  debridAccount=acct;
  if($('#torrentioRemember').checked){save('sideline-debrid',acct);$('#rememberProviders').checked=true}
  const changed=applyDebridEverywhere();persistProviders();renderProviders();renderTorrentioState();$('#torrentioKey').value='';
  const using=providers.filter(takesDebridKey).map(sourceName);
  status.textContent='Saved. '+torrentioServices[service]+' is now used by '+(using.length?using.join(', '):'new compatible sources you add')+(providers.some(isDebridioSource)?' (reconnect Debridio below to switch it to this key)':'')+'. Open a movie and tap ▶ Play here or Open in VLC.'}
 catch(error){status.textContent=error.message?.startsWith('The ')||error.message?.startsWith('Remove')?error.message:'Could not check the key (Torrentio unreachable). Check your internet and try again.'}
 finally{button.disabled=false}};
$('#forgetDebrid').onclick=()=>{debridAccount=null;try{localStorage.removeItem(window.sidelineStorageKey?window.sidelineStorageKey('sideline-debrid'):'sideline-debrid')}catch{}
 providers.forEach((p,i)=>{if(takesDebridKey(p)){const next=withDebrid(p,null);providers[i]={...p,...next}}});persistProviders();renderProviders();renderTorrentioState();searchGeneration++;streamGeneration++;$('#torrentioStatus').textContent='Key removed from this device and from your sources. Debridio keeps the key it was connected with until you disconnect it.'};
// Debridio: fall back to the saved account for provider + provider key.
{const submit=$('#debridioForm').onsubmit;$('#debridioForm').onsubmit=e=>{if(debridAccount){$('#debridioProvider').value=debridAccount.service;$('#debridioProviderKey').value=debridAccount.key}return submit(e)}}
// Keep sources in line whenever the Add-ons panel opens or closes (covers sources added later).
{const open=$('#manageProviders').onclick;$('#manageProviders').onclick=()=>{applyDebridEverywhere();renderProviders();renderTorrentioState();open()}}
{const close=$('#closeProviders').onclick;$('#closeProviders').onclick=()=>{if(applyDebridEverywhere())renderProviders();close()}}
$('#providerList').addEventListener('click',()=>setTimeout(renderTorrentioState,0));
$('#providerForm').addEventListener('submit',()=>setTimeout(()=>{if(applyDebridEverywhere()){renderProviders();$('#providerStatus').textContent+=' Your saved debrid key was added to it.'}renderTorrentioState()},2500));
applyDebridEverywhere();renderTorrentioState();
