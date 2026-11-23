// Version 26: tell "ready to play" (already cached on the debrid service) apart from results the
// debrid service would still have to download. Uncached torrents with few seeders end in Torrentio's
// "Failed opening torrent due to low seeds" clip, so ready results go first and get a badge.
(function(){
'use strict';
const DEBRID='RD|AD|PM|TB|DL|ED|OC|PP|DB|PK';
const NOT_READY=new RegExp('\\[(?:'+DEBRID+')[^\\]]*download[^\\]]*\\]|⏳|\\buncached\\b|not cached','i');
const READY=new RegExp('\\[(?:'+DEBRID+')\\+\\]|⚡|\\binstant\\b|\\bcached\\b','i');
// true = cached and ready, false = must be downloaded first, null = the add-on did not say.
function streamReady(s){const t=String(s?.name||'')+'\n'+String(s?.title||'')+'\n'+String(s?.description||'');
 if(NOT_READY.test(t))return false;if(READY.test(t))return true;return null}
window.streamReady=streamReady;

const css=document.createElement('style');
css.textContent='.ready-badge{display:inline-block;font:700 11px/1 inherit;letter-spacing:.02em;padding:5px 9px;border-radius:999px;margin:0 0 8px}.ready-badge.yes{background:rgba(52,199,89,.16);color:#34c759}.ready-badge.no{background:rgba(255,159,10,.16);color:#ff9f0a}.ready-badge.unk{background:rgba(156,151,179,.14);color:var(--muted)}.stream-row.not-ready{opacity:.72}.ready-tip{margin:6px 0 0;font-size:12px;color:#ff9f0a}';
document.head.appendChild(css);

// Filter: "Ready to play only".
const fmt=$('#filterFormat');if(fmt&&!fmt.querySelector('[value="ready"]')){const o=document.createElement('option');o.value='ready';o.textContent='Ready to play only (cached)';fmt.insertBefore(o,fmt.children[1]||null)}
const baseMatch=matchesSourceFilters;
matchesSourceFilters=function(row,filters){
 if(filters&&filters.format==='ready'){if(streamNotice(row.stream))return true;if(streamReady(row.stream)!==true)return false;return baseMatch(row,{...filters,format:''})}
 return baseMatch(row,filters)};

// Order: ready first, then unknown, then "needs download" (except "Original add-on order").
const baseRank=rankStreamResults;
rankStreamResults=function(results,mode){const list=baseRank(results,mode);if(mode==='provider')return list;
 const g=r=>streamNotice(r.stream)?-1:{true:0,null:1,false:2}[String(streamReady(r.stream))];
 return list.map((r,i)=>({r,i})).sort((a,b)=>g(a.r)-g(b.r)||a.i-b.i).map(x=>x.r)};

// Badge on each result.
const baseRow=renderStreamRow;
renderStreamRow=function(r,i){let html=baseRow(r,i);const s=r.stream;if(streamNotice(s))return html;
 const ready=streamReady(s),action=streamAction(s),playable=['magnet','video','external'].includes(action.kind);if(!playable)return html;
 const torrent=action.kind==='magnet',debrid=typeof debridAccount!=='undefined'&&debridAccount;
 let badge='',tip='';
 if(ready===true)badge='<span class="ready-badge yes">✓ Ready to play</span>';
 else if(ready===false){badge='<span class="ready-badge no">⏳ Not cached yet</span>';tip='<p class="ready-tip">Your debrid service has to download this first. With few seeders it can fail with "low seeds". Pick a ✓ Ready one, or try again later.</p>';
  html=html.replace('class="primary" data-infuse','class="secondary" data-infuse')}
 else if(torrent&&debrid){badge='<span class="ready-badge unk">? Cache unknown</span>';tip='<p class="ready-tip">This add-on does not say whether it is cached. If VLC shows "low seeds", pick a ✓ Ready result instead.</p>'}
 if(!badge)return html;
 return html.replace('<article class="stream-row">','<article class="stream-row'+(ready===false?' not-ready':'')+'">').replace('<div><strong>','<div>'+badge+'<br><strong>').replace('</small></div>','</small>'+tip+'</div>')};

// Summary line after results: how many are ready.
const box=$('#streamResults');
new MutationObserver(()=>{const all=(typeof rawStreamResults!=='undefined'?rawStreamResults:[]).filter(r=>!streamNotice(r.stream));if(!all.length)return;
 const ready=all.filter(r=>streamReady(r.stream)===true).length,el=$('#sourceFilterSummary');if(!el||el.dataset.readyFor===String(all.length)+':'+ready+':'+el.textContent)return;
 const base=el.textContent.replace(/ · \d+ ready to play.*$/,'');el.textContent=base+' · '+ready+' ready to play'+(ready?' (shown first)':'');el.dataset.readyFor=String(all.length)+':'+ready+':'+el.textContent}).observe(box,{childList:true});
})();
