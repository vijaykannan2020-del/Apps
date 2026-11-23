// Home language filter (Version 25), like Cinema Book: language chips + Movies/Shows,
// with rows from TMDB (same TMDB key Cinema Book saves). Tapping a title looks up its
// IMDb id so every add-on can find streams for it.
(function(){
'use strict';
const LANGS=[['ta','Tamil'],['ml','Malayalam'],['te','Telugu'],['hi','Hindi'],['kn','Kannada'],['en','English'],['ko','Korean'],['all','All languages']];
const store=k=>(window.sidelineStorageKey?window.sidelineStorageKey(k):k);
const get=(k,d)=>{try{return localStorage.getItem(store(k))||d}catch{return d}};
const put=(k,v)=>{try{localStorage.setItem(store(k),v)}catch{}};
let lang=get('sideline-hlang','ta'),kind=get('sideline-hkind','movie'),langItems=[],gen=0;
const cache={};
const IMG='https://image.tmdb.org/t/p/';

// UI: chips + kind toggle above the home rows, and a container for language rows.
const css=document.createElement('style');
css.textContent='#langBar{display:flex;flex-direction:column;gap:10px;margin:4px 0 18px}#langChips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px 0}#langChips::-webkit-scrollbar{display:none}#langChips button,#langKind button{flex:0 0 auto;border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:999px;padding:0 16px;min-height:38px;font:600 14px/1 inherit;cursor:pointer;transition:background .2s,color .2s,border-color .2s}#langChips button.on,#langKind button.on{background:var(--accent);border-color:var(--accent);color:#fff}#langKind{display:inline-flex;align-self:flex-start;gap:4px;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:4px}#langKind button{border:0;min-height:32px;background:transparent}#langNote{margin:0 0 20px}';
document.head.appendChild(css);
const bar=document.createElement('section');bar.id='langBar';bar.setAttribute('aria-label','Language');
bar.innerHTML='<div id="langChips" role="group" aria-label="Language"></div><div id="langKind" role="group" aria-label="Movies or shows"><button type="button" data-k="movie">Movies</button><button type="button" data-k="series">Shows</button></div>';
const rows=document.createElement('div');rows.id='langRows';
const home=$('#boardHome');home.insertBefore(rows,$('#boardRows'));home.insertBefore(bar,$('#boardHero'));
function paint(){
 $('#langChips').innerHTML=LANGS.map(([k,n])=>'<button type="button" data-l="'+k+'" class="'+(k===lang?'on':'')+'" aria-pressed="'+(k===lang)+'">'+n+'</button>').join('');
 $$('#langKind button').forEach(b=>{b.classList.toggle('on',b.dataset.k===kind);b.setAttribute('aria-pressed',b.dataset.k===kind)});
 $('#langKind').classList.toggle('hidden',lang==='all');
}
function $$(s){return [...document.querySelectorAll(s)]}

// TMDB
let tokenPromise=null;
function getToken(){
 if(!tokenPromise)tokenPromise=window.sidelineDB.doc('apps/cinemabook/config/tmdb').get().then(s=>(s.exists&&s.data().token)||null,()=>null);
 return tokenPromise}
async function tm(path,params){
 const t=await getToken();if(!t)throw new Error('nokey');
 const u=new URL('https://api.themoviedb.org/3'+path);Object.entries(params||{}).forEach(([k,v])=>u.searchParams.set(k,v));
 const bearer=t.startsWith('eyJ');if(!bearer)u.searchParams.set('api_key',t);
 const key=u.toString();if(cache[key])return cache[key];
 const r=await fetch(key,bearer?{headers:{Authorization:'Bearer '+t}}:{});if(!r.ok)throw new Error(r.status===401?'badkey':'tmdb');
 return cache[key]=await r.json()}
const iso=ms=>new Date(ms).toISOString().slice(0,10),DAY=864e5;
function toItem(r,type){
 const date=r.release_date||r.first_air_date||'';
 return {tmdb:{id:r.id,kind:type==='series'?'tv':'movie'},type,provider:titleCatalog,catalogId:'tmdb',
  meta:{id:'',type,name:r.title||r.name||'Untitled',poster:r.poster_path?IMG+'w342'+r.poster_path:'',background:r.backdrop_path?IMG+'w1280'+r.backdrop_path:'',
   description:r.overview||'',releaseInfo:date.slice(0,4),imdbRating:r.vote_average&&r.vote_count>=5?Number(r.vote_average).toFixed(1):''}}}
function rowDefs(){
 const tv=kind==='series',name=(LANGS.find(x=>x[0]===lang)||[,''])[1],t=Date.now(),L={with_original_language:lang};
 const dk=tv?'first_air_date':'primary_release_date',path=tv?'/discover/tv':'/discover/movie';
 return [
  {name:'New '+name+(tv?' shows':' releases'),path,q:{...L,sort_by:'popularity.desc',[dk+'.gte']:iso(t-(tv?180:120)*DAY),[dk+'.lte']:iso(t+30*DAY)}},
  {name:'Popular in '+name,path,q:{...L,sort_by:'popularity.desc',[dk+'.gte']:iso(t-365*DAY),[dk+'.lte']:iso(t)}},
  {name:'Top rated '+name+(tv?' shows':' movies'),path,q:{...L,sort_by:'vote_average.desc','vote_count.gte':tv?20:50}},
  {name:'All-time favourites',path,q:{...L,sort_by:'popularity.desc'}}]}
function hero(item,idx){
 renderFeatured(item,idx);
 $$('#boardHero [data-board]').forEach(b=>{b.removeAttribute('data-board');b.dataset.lang=idx})}
async function loadLang(){
 const g=++gen;langItems=[];
 if(lang==='all'){rows.innerHTML='';return}
 const defs=rowDefs(),type=kind;window.langDefs=defs;
 rows.innerHTML=defs.map((d,i)=>'<section class="board-row" id="lrow'+i+'"><div class="row-head"><h3>'+boardEsc(d.name)+'</h3><button class="text-button" data-lang-all="'+i+'">See all ›</button></div><div class="row-scroll">'+'<div class="row-skeleton"></div>'.repeat(5)+'</div></section>').join('');
 let heroDone=false;
 await Promise.all(defs.map(async(d,i)=>{
  const el=$('#lrow'+i);
  try{const data=await tm(d.path,d.q);if(g!==gen)return;
   const items=(data.results||[]).filter(r=>r.poster_path).map(r=>toItem(r,type));
   if(!items.length){el.remove();return}
   const start=langItems.length;langItems.push(...items);
   el.querySelector('.row-scroll').innerHTML=items.map((it,k)=>posterHTML(it,start+k).replace('data-board=','data-lang=')).join('');
   if(i===0&&!heroDone){heroDone=true;const withBg=items.map((it,k)=>[it,start+k]).filter(([it])=>it.meta.background).slice(0,8);const p=withBg[Math.floor(Math.random()*withBg.length)];if(p)hero(p[0],p[1])}
  }catch(e){if(g!==gen)return;
   if(e.message==='nokey'||e.message==='badkey'){rows.innerHTML='<p class="help" id="langNote">'+(e.message==='nokey'?'The language filter uses the TMDB key from Cinema Book. Open Cinema Book → Settings and add the TMDB key, then reload Sideline.':'Cinema Book\'s TMDB key was rejected. Update it in Cinema Book → Settings.')+'</p>';gen++}
   else el.remove()}
 }))}

// When a language is chosen, hide the generic (mostly English) Cinemeta rows and their banner.
const baseDefs=boardRowDefs,baseFeatured=renderFeatured;
boardRowDefs=function(){const d=baseDefs();return lang==='all'?d:d.filter(x=>x.p!==titleCatalog)};
renderFeatured=function(item,idx){if(lang!=='all'&&item&&!item.tmdb)return;baseFeatured(item,idx)};

// Open a TMDB title: find its IMDb id first so add-ons can look up streams.
const baseOpen=openTitle;
openTitle=async function(item){
 if(!item||!item.tmdb||item.meta.id)return baseOpen(item);
 try{const x=await tm('/'+item.tmdb.kind+'/'+item.tmdb.id+'/external_ids');
  if(!x.imdb_id){toast('This title is not linked to IMDb yet, so add-ons cannot find it.');return}
  item.meta.id=x.imdb_id}
 catch{toast('Could not look up this title. Check your connection and try again.');return}
 return baseOpen(item)};

async function seeAll(i){
 const d=(window.langDefs||[])[i];if(!d)return;const g=++searchGeneration;showBoard(false);
 providerResults=[];$('#libraryResults').innerHTML='';$('#libraryStatus').textContent='Loading '+d.name+'…';
 try{const pages=await Promise.all([1,2,3].map(p=>tm(d.path,{...d.q,page:p}).catch(()=>({results:[]}))));if(g!==searchGeneration)return;
  const seen=new Set();providerResults=pages.flatMap(p=>p.results||[]).filter(r=>r.poster_path&&!seen.has(r.id)&&seen.add(r.id)).map(r=>toItem(r,kind));
  $('#libraryResults').innerHTML=providerResults.map((r,k)=>posterHTML(r,k).replace('data-board=','data-title=')).join('');
  $('#libraryStatus').textContent=d.name+' · '+providerResults.length+' titles'}
 catch{$('#libraryStatus').textContent='Could not load this list. Try again later.'}}

home.addEventListener('click',e=>{
 const c=e.target.closest('[data-lang]');if(c){openTitle(langItems[Number(c.dataset.lang)]);return}
 const a=e.target.closest('[data-lang-all]');if(a)seeAll(Number(a.dataset.langAll))});
$('#langChips').addEventListener('click',e=>{const b=e.target.closest('[data-l]');if(!b||b.dataset.l===lang)return;
 const wasAll=lang==='all';lang=b.dataset.l;put('sideline-hlang',lang);paint();if(lang==='all')$('#boardHero').classList.add('hidden');
 loadLang();if(wasAll||lang==='all')loadBoard(true)});
$('#langKind').addEventListener('click',e=>{const b=e.target.closest('[data-k]');if(!b||b.dataset.k===kind)return;kind=b.dataset.k;put('sideline-hkind',kind);paint();loadLang()});

paint();loadLang();if(lang!=='all')loadBoard(true);
})();
