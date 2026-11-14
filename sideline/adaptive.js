function mediaRequestHeaders(channel,requestURL){try{if(new URL(requestURL).origin!==new URL(channel.stream).origin)return {};return channel.headerPolicy?.allowed||{}}catch{return {}}}
/* Unencrypted DASH playback. No license keys or DRM bypass configuration. */
let dashPlayer=null,dashRelease=Promise.resolve(),shakaLoading=null;
function stopDASH(){if(dashPlayer){const old=dashPlayer;dashPlayer=null;dashRelease=Promise.resolve(old.destroy()).catch(()=>{})}}
function ensureShaka(){if(window.shaka?.Player)return Promise.resolve();if(!shakaLoading)shakaLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/shaka-player@4.16.8/dist/shaka-player.compiled.js';script.onload=resolve;script.onerror=()=>{shakaLoading=null;reject(new Error('DASH library could not load.'))};document.head.appendChild(script)});return shakaLoading}
async function playDASH(video,url,attempt,failed){try{
 await dashRelease;await ensureShaka();if(attempt!==playAttempt)return;
 shaka.polyfill.installAll();
 if(!shaka.Player.isBrowserSupported()){failed('DASH playback is unavailable in this browser. Try a compatible external player or an HLS result.');return}
 const player=new shaka.Player();dashPlayer=player;
 const channel=channels.find(c=>c.id===current);
 if(channel)player.getNetworkingEngine().registerRequestFilter((type,request)=>{if(type!==shaka.net.NetworkingEngine.RequestType.MANIFEST&&type!==shaka.net.NetworkingEngine.RequestType.SEGMENT)return;for(const [name,value] of Object.entries(mediaRequestHeaders(channel,request.uris[0])))request.headers[name]=value});
 player.addEventListener('error',event=>{if(attempt===playAttempt)failed('DASH playback failed (code '+String(event.detail?.code||'unknown')+'). The stream may require provider headers, a license, or another codec.');});
 await player.attach(video);if(attempt!==playAttempt)return;
 await player.load(url);if(attempt!==playAttempt)return;
 clearTimeout(playTimer);
 const tracks=player.getVariantTracks(),heights=[...new Set(tracks.map(t=>t.height).filter(Boolean))].sort((a,b)=>a-b);
 $('#quality').innerHTML='<option value="-1">Auto quality</option>'+heights.map(h=>'<option value="'+h+'">'+h+'p</option>').join('');
 $('#quality').disabled=heights.length<2;
 $('#playerNote').textContent='DASH ready. Press play if playback does not start.';
 try{await video.play()}catch(error){if(attempt===playAttempt){if(error?.name==='NotAllowedError')$('#playerNote').textContent='Ready. Press play to start.';else failed('The browser could not start this DASH video.')}}
 }catch(error){if(attempt===playAttempt)failed('DASH could not load'+(error?.code?' (code '+error.code+')':'')+'. Check the source, browser support, and any provider requirements.')}
}
function setDASHQuality(value){if(!dashPlayer)return;const height=Number(value);dashPlayer.configure({abr:{enabled:height<0}});if(height>=0){const track=dashPlayer.getVariantTracks().find(t=>t.height===height);if(track)dashPlayer.selectVariantTrack(track,true)}}
