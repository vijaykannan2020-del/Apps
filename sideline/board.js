// Sideline home: featured banner + horizontal poster rows from Cinemeta and the user's add-ons,
// and the title header shown at the top of the streams page.
let boardItems=[],boardGeneration=0,boardLoaded=false;
function boardEsc(v){return escapeHTML(String(v??''))}
function metaYear(m){return m.releaseInfo||m.year||''}
function metaGenres(m){return (Array.isArray(m.genres)?m.genres:Array.isArray(m.genre)?m.genre:[]).filter(g=>typeof g==='string').slice(0,3)}
function boardRowDefs(){
 const rows=[{p:titleCatalog,type:'movie',id:'top',name:'Popular movies'},{p:titleCatalog,type:'series',id:'top',name:'Popular shows'},{p:titleCatalog,type:'movie',id:'imdbRating',name:'Top rated movies'},{p:titleCatalog,type:'series',id:'imdbRating',name:'Top rated shows'},{p:titleCatalog,type:'movie',id:'year',name:'New movies'}];
 for(const p of providers.filter(x=>x.enabled!==false&&x.manifest.id!=='com.linvo.cinemeta')){
  for(const c of (p.manifest.catalogs||[]).slice(0,6)){
   if(!c||typeof c.id!=='string'||typeof c.type!=='string')continue;
   if((c.extra||[]).some(x=>x&&x.isRequired))continue;
   rows.push({p,type:c.type,id:c.id,name:(c.name||c.id)+' · '+p.manifest.name});
  }
 }
 return rows.slice(0,14);
}
function posterHTML(item,index){const m=item.meta,poster=safeVideoURL(m.poster),live=!['movie','series'].includes(item.type);
 return '<button class="poster-card'+(live?' wide':'')+'" data-board="'+index+'" title="'+boardEsc(m.name)+'"><div class="poster-img">'+(poster?'<img src="'+boardEsc(poster)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span>'+boardEsc(m.name).slice(0,2)+'</span>')+(m.imdbRating?'<em>★ '+boardEsc(m.imdbRating)+'</em>':'')+'</div><strong>'+boardEsc(m.name)+'</strong><small>'+boardEsc(metaYear(m)||item.type)+'</small></button>'}
function renderFeatured(item,index){const m=item.meta,bg=safeVideoURL(m.background)||safeVideoURL(m.poster),logo=safeVideoURL(m.logo);
 $('#boardHero').innerHTML='<div class="bh-bg"'+(bg?' style="background-image:url(\''+boardEsc(bg)+'\')"':'')+'></div><div class="bh-body">'+(logo?'<img class="bh-logo" src="'+boardEsc(logo)+'" alt="'+boardEsc(m.name)+'" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'h1\'),{textContent:this.alt}))">':'<h1>'+boardEsc(m.name)+'</h1>')+'<p class="bh-meta">'+[metaYear(m),m.runtime,m.imdbRating?'★ '+m.imdbRating:'',...metaGenres(m)].filter(Boolean).map(boardEsc).join('<span>•</span>')+'</p><p class="bh-desc">'+boardEsc(String(m.description||'').slice(0,260))+'</p><div class="bh-actions"><button class="primary" data-board="'+index+'">▶ Watch now</button><button class="secondary" data-board="'+index+'">ⓘ Details</button></div></div>';
 $('#boardHero').classList.remove('hidden')}
async function loadBoard(force=false){
 if(boardLoaded&&!force)return;boardLoaded=true;const generation=++boardGeneration;boardItems=[];
 const defs=boardRowDefs();
 $('#boardRows').innerHTML=defs.map((d,i)=>'<section class="board-row" id="brow'+i+'"><div class="row-head"><h3>'+boardEsc(d.name)+'</h3><button class="text-button" data-see-all="'+i+'">See all ›</button></div><div class="row-scroll"><div class="row-skeleton"></div><div class="row-skeleton"></div><div class="row-skeleton"></div><div class="row-skeleton"></div><div class="row-skeleton"></div></div></section>').join('');
 $('#boardRows').dataset.defs=JSON.stringify(defs.map(d=>({type:d.type,id:d.id,name:d.name})));
 window.boardDefs=defs;
 await Promise.all(defs.map(async(d,i)=>{
  const el=$('#brow'+i);
  try{const data=await providerJSON(providerEndpoint(d.p,'catalog',d.type,d.id),20000);if(generation!==boardGeneration)return;
   const metas=(Array.isArray(data.metas)?data.metas:[]).filter(m=>m&&typeof m.id==='string'&&typeof m.name==='string').slice(0,30);
   if(!metas.length){el.remove();return}
   const start=boardItems.length;metas.forEach(meta=>boardItems.push({meta,provider:d.p,type:d.type,catalogId:d.id}));
   el.querySelector('.row-scroll').innerHTML=metas.map((m,k)=>posterHTML(boardItems[start+k],start+k)).join('');
   if(i===0&&metas.length){const pick=Math.floor(Math.random()*Math.min(8,metas.length));renderFeatured(boardItems[start+pick],start+pick)}
  }catch{if(generation===boardGeneration)el.remove()}
 }));
}
function showBoard(show){$('#boardHome').classList.toggle('hidden',!show);$('#libraryResults').classList.toggle('hidden',show);$('#boardBack').classList.toggle('hidden',show);document.body.classList.toggle('board-mode',show)}
$('#boardHome').addEventListener('click',e=>{
 const card=e.target.closest('[data-board]');if(card){openTitle(boardItems[Number(card.dataset.board)]);return}
 const all=e.target.closest('[data-see-all]');if(all){const d=(window.boardDefs||[])[Number(all.dataset.seeAll)];if(!d)return;showBoard(false);
  if(['movie','series'].includes(d.type)&&d.p===titleCatalog&&d.id==='top'){document.querySelector('[data-content-type="'+d.type+'"]')?.click();searchProviders(true);return}
  seeAllRow(d)}
});
async function seeAllRow(d){const generation=++searchGeneration;providerResults=[];$('#libraryResults').innerHTML='';$('#libraryStatus').textContent='Loading '+d.name+'…';
 try{const data=await providerJSON(providerEndpoint(d.p,'catalog',d.type,d.id),20000);if(generation!==searchGeneration)return;
  providerResults=(Array.isArray(data.metas)?data.metas:[]).filter(m=>m&&typeof m.id==='string'&&typeof m.name==='string').slice(0,300).map(meta=>({meta,provider:d.p,type:d.type,catalogId:d.id}));
  $('#libraryResults').innerHTML=providerResults.map((r,i)=>posterHTML(r,i).replace('data-board=','data-title=')).join('');$('#libraryStatus').textContent=d.name+' · '+providerResults.length+' titles'}
 catch{$('#libraryStatus').textContent='Could not load this list. Try again later.'}}
$('#boardBack').onclick=()=>{showBoard(true);$('#libraryQuery').value='';$('#libraryStatus').textContent=''};
// Search / Browse switch the page to results; empty search returns to Home.
$('#librarySearchForm').addEventListener('submit',()=>{if($('#libraryQuery').value.trim())showBoard(false)});
$('#browseProviders').addEventListener('click',()=>showBoard(false));
$('#libraryQuery').addEventListener('input',()=>{if(!$('#libraryQuery').value.trim()&&!$('#libraryResults').children.length)showBoard(true)});
// Results grid uses the same poster cards.
new MutationObserver(()=>{const grid=$('#libraryResults');if(grid.dataset.restyling)return;const cards=grid.querySelectorAll('.movie-card[data-title]');if(!cards.length)return;grid.dataset.restyling='1';cards.forEach(c=>{const r=providerResults[Number(c.dataset.title)];if(r){const t=document.createElement('div');t.innerHTML=posterHTML(r,Number(c.dataset.title)).replace('data-board=','data-title=');c.replaceWith(t.firstChild)}});delete grid.dataset.restyling}).observe($('#libraryResults'),{childList:true});
// Title header on the streams page.
function renderTitleHero(item){const m=item.meta||{},bg=safeVideoURL(m.background)||safeVideoURL(m.poster),poster=safeVideoURL(m.poster),logo=safeVideoURL(m.logo);
 $('#titleHero').innerHTML='<div class="th-bg"'+(bg?' style="background-image:url(\''+boardEsc(bg)+'\')"':'')+'></div><div class="th-body">'+(poster?'<img class="th-poster" src="'+boardEsc(poster)+'" alt="" referrerpolicy="no-referrer">':'')+'<div class="th-text">'+(logo?'<img class="th-logo" src="'+boardEsc(logo)+'" alt="'+boardEsc(m.name)+'" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'h1\'),{textContent:this.alt}))">':'<h1>'+boardEsc(m.name)+'</h1>')+'<p class="bh-meta">'+[metaYear(m),m.runtime,m.imdbRating?'★ '+m.imdbRating:'',...metaGenres(m)].filter(Boolean).map(boardEsc).join('<span>•</span>')+'</p>'+(m.description?'<p class="th-desc">'+boardEsc(String(m.description).slice(0,600))+'</p>':'')+'</div></div>'}
// Navigation extras: Add-ons button in the menu.
$('#navAddons').onclick=e=>{e.stopPropagation();$('#manageProviders').click()};
{const nav=window.setNav;if(typeof nav==='function'){window.setNav=n=>{nav(n);if(n==='Sources')loadBoard()}}}
document.querySelector('nav').addEventListener('click',e=>{if(e.target.closest('[data-nav="Sources"]'))loadBoard()});
{const close=$('#closeProviders').onclick;$('#closeProviders').onclick=()=>{close();if(boardLoaded)loadBoard(true)}}
showBoard(true);loadBoard();
