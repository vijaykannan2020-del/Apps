// Browse by add-on: pick an add-on, type, list and genre, then page through its catalog.
const typeNames={movie:'Movies',series:'Shows',tv:'TV',channel:'Channels',sport:'Sports',events:'Events',anime:'Anime',other:'Other'};
let cinemetaFull=null,discoverState=null;
async function discoverSources(){
 if(!cinemetaFull){try{const m=await providerJSON('https://v3-cinemeta.strem.io/manifest.json');if(Array.isArray(m.catalogs))cinemetaFull={...titleCatalog,manifest:{...m,name:'Cinemeta (all titles)'}}}catch{}}
 const list=[cinemetaFull||titleCatalog,...providers.filter(p=>p.enabled!==false&&p.manifest.id!=='com.linvo.cinemeta')];
 return list.map(p=>({p,cats:(p.manifest.catalogs||[]).filter(c=>c&&typeof c.id==='string'&&typeof c.type==='string'&&!(c.extra||[]).some(e=>e&&e.isRequired&&e.name!=='genre')&&!((c.extra||[]).find(e=>e?.name==='genre')?.isRequired&&!((c.extra||[]).find(e=>e?.name==='genre')?.options||[]).length))})).filter(x=>x.cats.length)}
let discoverList=[];
function fillSelect(sel,items,keep){const prev=keep?sel.value:'';sel.innerHTML=items.map(([v,t])=>'<option value="'+boardEsc(v)+'">'+boardEsc(t)+'</option>').join('');if(items.some(([v])=>v===prev))sel.value=prev}
function discoverPick(){const src=discoverList[Number($('#dAddon').value)]||discoverList[0];if(!src)return {};const types=[...new Set(src.cats.map(c=>c.type))];
 fillSelect($('#dType'),types.map(t=>[t,typeNames[t]||t[0].toUpperCase()+t.slice(1)]),true);
 const cats=src.cats.filter(c=>c.type===$('#dType').value);fillSelect($('#dCatalog'),cats.map((c,i)=>[String(i),c.name||c.id]),true);
 const cat=cats[Number($('#dCatalog').value)]||cats[0];const g=(cat?.extra||[]).find(e=>e?.name==='genre');const options=(g?.options||[]).filter(o=>typeof o==='string');
 fillSelect($('#dGenre'),[...(g?.isRequired?[]:[['','All genres']]),...options.map(o=>[o,o])],true);$('#dGenreWrap').classList.toggle('hidden',!options.length);
 return {src,cat}}
async function setupDiscover(){discoverList=await discoverSources();fillSelect($('#dAddon'),discoverList.map((x,i)=>[String(i),x.p.manifest.name]),true);discoverPick()}
async function runDiscover(more=false){const {src,cat}=discoverPick();if(!src||!cat)return;
 if(!more)discoverState={src,cat,genre:$('#dGenre').value,skip:0,done:false};const st=discoverState;if(st.done)return;
 const generation=more?searchGeneration:++searchGeneration;if(!more){providerResults=[];$('#libraryResults').innerHTML=''}
 showBoard(false);$('#dMore').classList.add('hidden');$('#libraryStatus').textContent='Loading '+(cat.name||cat.id)+' from '+src.p.manifest.name+'…';
 const canSkip=(cat.extra||[]).some(e=>e?.name==='skip')||(cat.extraSupported||[]).includes('skip');
 const extra=[st.genre?'genre='+encodeURIComponent(st.genre):'',st.skip&&canSkip?'skip='+st.skip:''].filter(Boolean).join('&');
 try{const data=await providerJSON(providerEndpoint(src.p,'catalog',cat.type,cat.id,extra),20000);if(generation!==searchGeneration)return;
  const seen=new Set(providerResults.map(r=>r.type+':'+r.meta.id));
  const metas=(Array.isArray(data.metas)?data.metas:[]).filter(m=>m&&typeof m.id==='string'&&typeof m.name==='string'&&!seen.has(cat.type+':'+m.id));
  const start=providerResults.length;metas.forEach(meta=>providerResults.push({meta,provider:src.p,type:cat.type,catalogId:cat.id}));
  $('#libraryResults').insertAdjacentHTML('beforeend',metas.map((m,k)=>posterHTML(providerResults[start+k],start+k).replace('data-board=','data-title=')).join(''));
  st.skip=providerResults.length;st.done=!canSkip||!metas.length||providerResults.length>=1000;
  $('#libraryStatus').textContent=src.p.manifest.name+' · '+(cat.name||cat.id)+(st.genre?' · '+st.genre:'')+' · '+providerResults.length+' titles';
  $('#dMore').classList.toggle('hidden',st.done)}
 catch{if(generation===searchGeneration)$('#libraryStatus').textContent='Could not load this list. The add-on may be down or blocking browser requests.'}}
$('#dAddon').onchange=()=>{$('#dType').innerHTML='';discoverPick()};$('#dType').onchange=()=>{$('#dCatalog').innerHTML='';discoverPick()};$('#dCatalog').onchange=()=>discoverPick();
$('#dGo').onclick=()=>runDiscover(false);$('#dGenre').onchange=()=>runDiscover(false);$('#dMore').onclick=()=>runDiscover(true);
// Other searches reset paging.
$('#librarySearchForm').addEventListener('submit',()=>{discoverState=null;$('#dMore').classList.add('hidden')});
$('#browseProviders').addEventListener('click',()=>{discoverState=null;$('#dMore').classList.add('hidden')});
$('#boardBack').addEventListener('click',()=>$('#dMore').classList.add('hidden'));
{const close=$('#closeProviders').onclick;$('#closeProviders').onclick=()=>{close();setupDiscover()}}
setupDiscover();
