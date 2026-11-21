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
