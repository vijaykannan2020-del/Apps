// Replay metadata only. No audio downloads, Spotify credentials or language model calls.
const API='https://api.ytapi.dev/v1';
export const text=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
export const title=s=>text(String(s||'').replace(/\s*[\(\[]\s*from\b[^\)\]]*[\)\]]/gi,'').replace(/\s*[-–]\s*from\b.*$/i,''));
const artists=s=>String(s||'').split(/[,;&/]|\b(?:feat\.?|featuring|and)\b/i).map(text).filter(Boolean);
export function matching(video,track){
  if(!/^[\w-]{11}$/.test(video?.video_id)||!Number.isFinite(video.length_seconds)||Math.abs(video.length_seconds*1000-track.dur)>1000||video.is_live_content||video.is_live||video.is_upcoming)return false;
  // Prefer release audio, not music videos with dialog, cuts or a different timeline.
  if(!/ - Topic$/i.test(video.channel?.title||'')&&!/provided to youtube by/i.test(video.description||''))return false;
  return (video.music||[]).some(song=>title(song.title)===title(track.name)&&artists(song.artist).some(a=>track.artists.flatMap(artists).includes(a)));
}
export function replayRegion(video,heatmap,track){
  if(!matching(video,track)||heatmap?.video_id!==video.video_id||!Number.isFinite(heatmap.length_seconds)||Math.abs(heatmap.length_seconds-video.length_seconds)>1)return null;
  const valid=r=>r&&Number.isFinite(r.start_seconds)&&Number.isFinite(r.end_seconds)&&Number.isFinite(r.intensity)&&r.start_seconds>=0&&r.end_seconds>r.start_seconds&&r.end_seconds<=video.length_seconds&&r.intensity>=0&&r.intensity<=1;
  const curve=(heatmap.curve||[]).filter(valid).sort((a,b)=>a.start_seconds-b.start_seconds);
  if(curve.length<5||curve.length>1000)return null;
  // Incomplete or overlapping curves cannot support a valley-based region.
  for(let i=1;i<curve.length;i++)if(Math.abs(curve[i].start_seconds-curve[i-1].end_seconds)>.05)return null;
  if(curve[0].start_seconds>.05||Math.abs(curve.at(-1).end_seconds-video.length_seconds)>1)return null;
  const values=curve.map(x=>x.intensity);if(Math.max(...values)-Math.min(...values)<.1)return null;
  const peaks=[heatmap.most_replayed,...(heatmap.peaks||[])].filter(valid).sort((a,b)=>b.intensity-a.intensity);
  for(const peak of peaks){
    const at=(peak.start_seconds+peak.end_seconds)/2,index=curve.findIndex(r=>at>=r.start_seconds&&at<r.end_seconds);
    // The first bin is often high simply because all views begin at zero.
    if(index<=0||index>=curve.length-1)continue;
    const valley=direction=>{let at=index;while(at+direction>=0&&at+direction<curve.length){let next=at+direction;
      if(values[next]===values[at]){while(next>=0&&next<curve.length&&values[next]===values[at])next+=direction;if(next<0||next>=curve.length||values[next]>values[at])return at;}
      if(values[next]>values[at])return at;at=next;
    }return at;};
    const left=valley(-1),right=valley(1);
    if(values[index]<=values[left]||values[index]<=values[right])continue;
    const start=curve[left].end_seconds,end=curve[right].start_seconds;
    if(!(end>start)||end-start>track.dur/2000||start<=0)continue;
    // Only trust explicit verse/chorus chapter boundaries inside this same region.
    const chapters=(video.chapters||[]).filter(c=>Number.isFinite(c.start_time_seconds)).sort((a,b)=>a.start_time_seconds-b.start_time_seconds);
    const chapter=chapters.find((c,i)=>i+1<chapters.length&&c.start_time_seconds<=at&&chapters[i+1].start_time_seconds>at&&/\b(?:chorus|verse|charanam|refrain|hook)\b/i.test(c.title)&&c.start_time_seconds>=start&&chapters[i+1].start_time_seconds<=end);
    const from=chapter?chapter.start_time_seconds:start,to=chapter?chapters[chapters.indexOf(chapter)+1].start_time_seconds:end;
    return {schema:2,source:'replay',method:'replay-v1',start:Math.round(from*1000),end:Math.round(to*1000),section:'Replay-region estimate',boundary:chapter?'video-chapter':'replay-valley',videoId:video.video_id,videoDuration:Math.round(video.length_seconds*1000),videoTitle:video.title,music:(video.music||[]).map(x=>({title:x.title,artist:x.artist})),channel:video.channel?.title,peak:Math.round(at*1000),intensity:peak.intensity,alignment:'metadata-duration-only',why:'Estimated from audience replay peaks; vocal ending not verified'};
  }
  return null;
}
export async function lookup(track,provider){
  const search=await provider('/search?'+new URLSearchParams({q:`${track.name} ${track.artists.join(' ')} official audio`,type:'video',limit:'8'}));
  const ids=[...new Set((search.items||[]).filter(x=>x.type==='video'&&/^[\w-]{11}$/.test(x.id)&&Number.isFinite(x.length_seconds)&&Math.abs(x.length_seconds*1000-track.dur)<=1000).map(x=>x.id))].slice(0,3);
  let matched=false,graphs=false;
  for(const id of ids){
    let video;try{video=await provider(`/videos/${id}/video-info`);}catch(e){if(e.status===404)continue;throw e;}
    if(video.video_id!==id||!matching(video,track))continue;matched=true;
    let heatmap;try{heatmap=await provider(`/videos/${id}/heatmap`);}catch(e){if(e.status===404)continue;throw e;}
    graphs=true;const pick=replayRegion(video,heatmap,track);if(pick)return {status:'ready',pick};
  }
  return {status:'unavailable',reason:!matched?'no_match':!graphs?'no_heatmap':'no_region',message:!matched?'No matching release audio was found.':!graphs?'This recording has no audience replay graph.':'No distinct replay region could be separated.'};
}
const providerFlights=new Map();let lastProviderAt=0,providerRetryAt=0;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin'),allowed=env.ALLOWED_ORIGIN||'https://vijaykannan2020-del.github.io';
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
    const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
    if(origin!==allowed)return reply({message:'Origin not allowed.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(!env.REPLAY_ACCESS_TOKEN||!env.YTAPI_API_KEY)return reply({message:'Replay service is not configured.'},503);
    if(request.headers.get('Authorization')!==`Bearer ${env.REPLAY_ACCESS_TOKEN}`)return reply({message:'Replay connection token is invalid.'},401);
    const path=new URL(request.url).pathname;
    if(path==='/health'&&request.method==='GET')return reply({status:'ready',provider:'YTAPI',experimental:true});
    if(path!=='/v1/replay'||request.method!=='POST')return reply({message:'Not found.'},404);
    if(Number(request.headers.get('Content-Length'))>8192)return reply({message:'Request too large.'},413);
    let track;
    try{const raw=await request.text();if(raw.length>8192)return reply({message:'Request too large.'},413);track=JSON.parse(raw);}catch{return reply({message:'Invalid track.'},400);}
    if(!track||typeof track.id!=='string'||!track.id||typeof track.name!=='string'||!track.name.trim()||track.name.length>300||!Array.isArray(track.artists)||!track.artists.length||track.artists.length>20||track.artists.some(a=>typeof a!=='string'||a.length>150)||!Number.isFinite(track.dur)||track.dur<=0||track.dur>86400000)return reply({message:'Invalid track.'},400);
    // Key includes matching metadata; an unverified claimed ISRC never authorizes a match.
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({name:title(track.name),artists:track.artists.map(text).sort(),dur:track.dur})));
    const key='replay-v1:'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    try{
      const cached=await env.REPLAY_CACHE?.get(key,'json');if(cached)return reply({...cached,cached:true});
      if(!providerFlights.has(key)){
        const deadline=Date.now()+32000;
        const task=lookup(track,async path=>{
          if(Date.now()<providerRetryAt)throw Object.assign(new Error('Replay provider rate limit reached.'),{status:429,retryAfter:String(Math.ceil((providerRetryAt-Date.now())/1000))});
          const wait=lastProviderAt+1100-Date.now();if(Date.now()+Math.max(0,wait)>=deadline)throw new Error('Replay lookup timed out. Retry later.');if(wait>0)await delay(wait);lastProviderAt=Date.now();
          const response=await fetch(API+path,{headers:{Authorization:`Bearer ${env.YTAPI_API_KEY}`},signal:AbortSignal.timeout(Math.max(1,Math.min(12000,deadline-Date.now())))});
          lastProviderAt=Date.now();
          if(response.status===429){const raw=response.headers.get('Retry-After'),seconds=Number(raw);providerRetryAt=Date.now()+Math.max(1000,raw&&Number.isFinite(seconds)?seconds*1000:Date.parse(raw||'')-Date.now()||60000);}
          if(!response.ok){const status=response.status===429?429:response.status===404?404:response.status===401||response.status===403?502:503;throw Object.assign(new Error(response.status===402?'Replay provider credits are exhausted.':status===429?'Replay provider rate limit reached.':status===404?'Replay data unavailable.':'Replay provider is unavailable. Check its connection and balance.'),{status,retryAfter:response.headers.get('Retry-After')});}
          return response.json();
        }).then(async result=>{if(result.status==='ready')await env.REPLAY_CACHE?.put(key,JSON.stringify(result),{expirationTtl:2592000});return result;}).finally(()=>providerFlights.delete(key));
        providerFlights.set(key,task);
      }
      return reply(await providerFlights.get(key));
    }catch(e){return reply({message:e.message||'Replay lookup failed.'},e.status||503,e.retryAfter?{'Retry-After':e.retryAfter}:{});}
  }
};
