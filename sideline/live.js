// Live TV, Cricket and Saved, built only from the user's add-ons (no built-in channel lists).
const CRICKET=/cricket|\bipl\b|\bt20\b|\bodi\b|test match|\bbcci\b|\bicc\b|\bbbl\b|\bpsl\b|\bcpl\b|ranji|world cup.*cricket/i;
let liveItems=[],liveGeneration=0;const liveCache=new Map();
function liveCatalogs(){const out=[];for(const p of providers.filter(x=>x.enabled!==false))for(const c of (p.manifest.catalogs||[])){if(!c||typeof c.id!=='string'||typeof c.type!=='string'||['movie','series'].includes(c.type))continue;const extra=Array.isArray(c.extra)?c.extra:[];const genre=extra.find(e=>e&&e.name==='genre');const options=(genre?.options||c.genres||[]).filter(o=>typeof o==='string');if(extra.some(e=>e&&e.isRequired&&e.name!=='genre'))continue;if(genre?.isRequired&&!options.length)continue;out.push({p,c,options,genreRequired:!!genre?.isRequired})}return out.slice(0,24)}
async function liveFetch(p,c,genre=''){const key=p.base+'|'+c.type+'|'+c.id+'|'+genre,hit=liveCache.get(key);if(hit&&Date.now()-hit.at<5*60000)return hit.metas;
 const data=await providerJSON(providerEndpoint(p,'catalog',c.type,c.id,genre?'genre='+encodeURIComponent(genre):''),20000);
 const metas=(Array.isArray(data.metas)?data.metas:[]).filter(m=>m&&typeof m.id==='string'&&typeof m.name==='string').slice(0,60);liveCache.set(key,{at:Date.now(),metas});return metas}
function liveText(m){return [m.name,m.description,m.releaseInfo,...(Array.isArray(m.genres)?m.genres:[]),...(Array.isArray(m.genre)?m.genre:[])].filter(x=>typeof x==='string').join(' ')}
function liveEmpty(title,text,button=true){return '<div class="live-empty"><h3>'+boardEsc(title)+'</h3><p>'+boardEsc(text)+'</p>'+(button?'<button class="primary" data-open-addons>✚ Open Add-ons</button>':'')+'</div>'}
function liveRow(name,items){if(!items.length)return '';const start=liveItems.length;items.forEach(i=>liveItems.push(i));return '<section class="board-row"><div class="row-head"><h3>'+boardEsc(name)+'</h3><span class="row-count">'+items.length+'</span></div><div class="row-scroll">'+items.map((it,k)=>posterHTML(it,start+k).replace('data-board=','data-live=')).join('')+'</div></section>'}
function liveHead(title,sub){return '<div class="live-head"><h2>'+boardEsc(title)+'</h2><p>'+boardEsc(sub)+'</p></div>'}
async function renderLive(view){
 const box=$('#liveBoard');if(!box)return;const generation=++liveGeneration;liveItems=[];
 if(view==='My List'){renderSaved();return}
 const cats=liveCatalogs(),cricket=view==='Sports';
 const title=cricket?'Cricket':'Live TV',sub=cricket?'Cricket from your add-ons':'Live channels and events from your add-ons';
 if(!cats.length){box.innerHTML=liveHead(title,sub)+liveEmpty('No live TV add-ons yet','Add an add-on that has live TV or event lists, and its channels show up here.');return}
 box.innerHTML=liveHead(title,sub)+'<div class="row-scroll">'+'<div class="row-skeleton wide"></div>'.repeat(4)+'</div>';
 const jobs=[];
 for(const {p,c,options,genreRequired} of cats){
  const label=(c.name||c.id)+' · '+p.manifest.name;
  if(cricket){
   const catIsCricket=CRICKET.test((c.name||'')+' '+c.id);
   const cricketGenre=options.find(o=>CRICKET.test(o));
   if(catIsCricket)jobs.push({label,p,c,genre:genreRequired?options[0]:'',filter:false});
   else if(cricketGenre)jobs.push({label:(c.name||c.id)+' · '+cricketGenre+' · '+p.manifest.name,p,c,genre:cricketGenre,filter:false});
   else if(!genreRequired)jobs.push({label,p,c,genre:'',filter:true});
  }else jobs.push({label,p,c,genre:genreRequired?options[0]:'',filter:false});
 }
 const results=await Promise.all(jobs.map(async j=>{try{let metas=await liveFetch(j.p,j.c,j.genre);if(j.filter)metas=metas.filter(m=>CRICKET.test(liveText(m)));return {j,metas}}catch{return {j,metas:[],failed:true}}}));
 if(generation!==liveGeneration)return;
 let html='';const seen=new Set();
 for(const {j,metas} of results){const items=metas.filter(m=>{const k=j.c.type+':'+m.id;if(cricket&&seen.has(k))return false;seen.add(k);return true}).map(meta=>({meta,provider:j.p,type:j.c.type,catalogId:j.c.id}));html+=liveRow(j.label,items)}
 const failed=results.filter(r=>r.failed).length;
 box.innerHTML=liveHead(title,sub)+(html||liveEmpty(cricket?'No cricket right now':'Nothing live right now',cricket?'None of your add-ons list a cricket match or channel at the moment. Check again closer to match time.':'Your add-ons returned no live channels or events.',false))+(failed?'<p class="help">'+failed+' list'+(failed>1?'s':'')+' could not load (the add-on may be down or blocking browser requests).</p>':'');
 liveFilter();
}
// Saved titles (from any add-on), stored on this device.
function savedList(){const v=read('sideline-saved-items',[]);return Array.isArray(v)?v:[]}
function savedKey(item){return item.type+':'+item.meta.id}
function isSaved(item){return savedList().some(s=>s.key===savedKey(item))}
function toggleSaved(item){let list=savedList();const key=savedKey(item);if(list.some(s=>s.key===key))list=list.filter(s=>s.key!==key);else{const m=item.meta,keep={};for(const f of ['id','name','poster','background','logo','description','releaseInfo','year','imdbRating','runtime','genres','type'])if(m[f]!==undefined)keep[f]=m[f];list.unshift({key,type:item.type,base:item.provider?.base||'',meta:keep,catalogId:item.catalogId||''})}save('sideline-saved-items',list.slice(0,300));return list.some(s=>s.key===key)}
function renderSaved(){const box=$('#liveBoard');liveItems=[];const list=savedList();
 const items=list.map(s=>({meta:s.meta,type:s.type,catalogId:s.catalogId,provider:providers.find(p=>p.base===s.base)||titleCatalog}));
 box.innerHTML=liveHead('Saved','Titles and channels you saved with ♡')+(items.length?'<div class="saved-grid">'+items.map((it,i)=>{liveItems.push(it);return posterHTML(it,i).replace('data-board=','data-live=')}).join('')+'</div>':liveEmpty('Nothing saved yet','Open any movie, show or channel and tap ♡ Save.',false))}
$('#liveBoard').addEventListener('click',e=>{const card=e.target.closest('[data-live]');if(card){openTitle(liveItems[Number(card.dataset.live)]);return}if(e.target.closest('[data-open-addons]'))$('#manageProviders').click()});
// ♡ Save button on the details page.
{const base=window.renderTitleHero;window.renderTitleHero=item=>{base(item);const text=$('#titleHero .th-text');if(!text)return;const b=document.createElement('button');b.className='secondary save-title';const paint=()=>{const on=isSaved(item);b.textContent=on?'♥ Saved':'♡ Save';b.setAttribute('aria-pressed',String(on))};paint();b.onclick=()=>{toggleSaved(item);paint();if(nav==='My List')renderSaved()};text.appendChild(b)}}
// Header search filters the cards on Live TV / Cricket / Saved.
function liveFilter(){const q=($('#search').value||'').trim().toLowerCase();document.querySelectorAll('#liveBoard .poster-card').forEach(c=>{c.style.display=!q||c.title.toLowerCase().includes(q)?'':'none'});document.querySelectorAll('#liveBoard .board-row').forEach(r=>{r.style.display=!q||[...r.querySelectorAll('.poster-card')].some(c=>c.style.display!=='none')?'':'none'})}
$('#search').oninput=liveFilter;$('#search').placeholder='⌕  Filter channels…';
// Hook navigation.
{const nav0=window.setNav;window.setNav=n=>{nav0(n);$('#search').value='';if(n!=='Sources')renderLive(n)}}
{const close=$('#closeProviders').onclick;$('#closeProviders').onclick=()=>{close();liveCache.clear();if(nav!=='Sources')renderLive(nav)}}
if(nav!=='Sources')renderLive(nav);
