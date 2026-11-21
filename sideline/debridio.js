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

// Torrentio + debrid: rewrite the existing Torrentio source so its results come back as
// direct HTTPS links (playable here) instead of magnets. Other Torrentio options are kept.
const torrentioServices={realdebrid:'Real-Debrid',alldebrid:'AllDebrid',premiumize:'Premiumize',torbox:'TorBox',debridlink:'Debrid-Link',easydebrid:'EasyDebrid',offcloud:'Offcloud'};
function isTorrentioSource(p){try{return /(^|\.)torrentio\.strem\.fun$/i.test(new URL(p.base).hostname)}catch{return false}}
function torrentioOptions(p){const u=new URL(p.base),seg=decodeURIComponent(u.pathname.replace(/^\/+|\/+$/g,'').split('/').pop()||'');const opts=[];for(const part of seg.split('|')){const i=part.indexOf('=');if(i>0)opts.push([part.slice(0,i),part.slice(i+1)])}return {origin:u.origin,opts}}
function torrentioDebrid(p){const {opts}=torrentioOptions(p);const hit=opts.find(([k])=>k in torrentioServices||k==='putio');return hit?(torrentioServices[hit[0]]||'Put.io'):null}
function renderTorrentioState(){const list=providers.filter(isTorrentioSource);$('#torrentioState').textContent=!list.length?'No Torrentio source yet. Connecting here adds one for you.':list.map(p=>{const d=torrentioDebrid(p);return d?'Torrentio is using '+d+' ✓ Results play here.':'Torrentio found, but without debrid: results are torrents and cannot play here.'}).join(' ')}
$('#torrentioForm').onsubmit=async e=>{e.preventDefault();const status=$('#torrentioStatus'),button=$('#connectTorrentio'),service=$('#torrentioService').value,key=$('#torrentioKey').value.trim();
 if(!(service in torrentioServices)){status.textContent='Choose your debrid service.';return}
 if(!key||/[\s|\/]/.test(key)){status.textContent='Paste the API key from your debrid service (no spaces).';return}
 button.disabled=true;status.textContent='Checking your key with Torrentio…';
 try{const index=providers.findIndex(isTorrentioSource),old=index>=0?providers[index]:null;
  const {origin,opts}=old?torrentioOptions(old):{origin:'https://torrentio.strem.fun',opts:[]};
  const kept=opts.filter(([k])=>!(k in torrentioServices)&&k!=='putio'&&k!=='debridoptions');
  const config=[...kept,[service,key]].map(([k,v])=>k+'='+v).join('|');
  const p=normalizeProvider(origin+'/'+config+'/manifest.json');
  const manifest=await providerJSON(p.url);if(typeof manifest.id!=='string'||!Array.isArray(manifest.resources))throw new Error('Torrentio returned an unexpected reply. Try again later.');manifest.catalogs=Array.isArray(manifest.catalogs)?manifest.catalogs:[];
  // Torrentio reports a bad key as a fake stream; test with a well-known film.
  try{const probe=await providerJSON(p.base+'/stream/movie/tt0111161.json'+(p.query||''),20000);const first=(probe.streams||[])[0];const text=first?[first.name,first.title,first.description].filter(x=>typeof x==='string').join(' '):'';if(/invalid|expired|error|access denied|not premium/i.test(text)&&/failed_access|error/i.test((first.url||'')+' '+text))throw new Error('Torrentio says the '+torrentioServices[service]+' key was rejected: '+text.replace(/\s+/g,' ').slice(0,140))}catch(err){if(err.message?.startsWith('Torrentio says'))throw err}
  if(old)providers[index]={...p,manifest,enabled:true};else{if(providers.length>=8)throw new Error('Remove a source before adding Torrentio. Maximum: 8.');providers.push({...p,manifest,enabled:true})}
  if($('#torrentioRemember').checked)$('#rememberProviders').checked=true;
  persistProviders();renderProviders();renderTorrentioState();searchGeneration++;streamGeneration++;$('#torrentioKey').value='';
  status.textContent=(old?'Your Torrentio source now uses ':'Torrentio added with ')+torrentioServices[service]+'. Open a movie and tap ▶ Play here (or ▶ Try here for MKV).'}
 catch(error){status.textContent=error.message?.startsWith('Torrentio')||error.message?.startsWith('Remove')?error.message:'Could not reach Torrentio. Check your internet and try again.'}
 finally{button.disabled=false}};
{const open=$('#manageProviders').onclick;$('#manageProviders').onclick=()=>{renderTorrentioState();open()}}
$('#providerList').addEventListener('click',()=>setTimeout(renderTorrentioState,0));
renderTorrentioState();
