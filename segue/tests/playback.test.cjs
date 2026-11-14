// Run with Node: no credentials, real network, music, or dependencies.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].split('(async function boot(){')[0];
function context() {
  const els = new Map(), storage = new Map(); let now = 10000;
  const element = () => ({value:'',dataset:{},style:{},classList:{values:new Set(),add(x){this.values.add(x)},remove(x){this.values.delete(x)},toggle(x,on){if(on===undefined)on=!this.values.has(x);on?this.values.add(x):this.values.delete(x);return on},contains(x){return this.values.has(x)}},addEventListener(){},querySelectorAll(){return []},focus(){},scrollIntoView(){}});
  const c = vm.createContext({console,URL,URLSearchParams,Blob,AbortController,TextEncoder,Uint8Array,Math,JSON,Date,performance:{now:()=>now},
    document:{querySelector(s){if(!els.has(s)) els.set(s,element());return els.get(s)},querySelectorAll(){return []},addEventListener(){}},
    location:{hostname:'localhost',origin:'http://localhost',pathname:'/segue/',search:''},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},fetch(){throw Error('Unexpected network request')},window:{addEventListener(){}}});
  // Replace only time/network boundaries; keep production algorithms and retry control flow.
  vm.runInContext(source.replace('const tfetch =','let tfetch =').replace('const sleep = ms => new Promise(r => setTimeout(r, ms));','const sleep = async () => {};'),c);
  c.setNow = x => now = x; c.storage = storage;
  vm.runInContext('renderDeck=()=>{};showNow=()=>{};drawCurve=()=>{};aiStatus=()=>{};aiAhead=()=>{};',c);
  vm.runInContext('globalThis.realVerifyStart=DJ.verifyStart;DJ.verifyStart=async(t,pos)=>pos;',c);
  return c;
}
const run = (c,s) => vm.runInContext(s,c);
const track = `({id:'one',uri:'spotify:track:one',name:'Song',artists:['Artist'],dur:240000,tempo:120,energy:.5,dance:.5,start:30000,end:75000,fadeOut:300,fadeIn:0,hookSrc:'ai'})`;
let count = 0;
async function test(name,fn) { await fn(); console.log('PASS:',name);count++; }
function backend(c,options={}){
 let now=10000;
 const state={id:null,pos:0,paused:true,dev:'phone',frozen:false,offline:false,missing:false,ignoreStart:false,ignoreSeek:false,volume:70,...options};
 const calls=[];
 c.hostAPI=async(p,o={})=>{
  calls.push({p,o});
  if(state.offline){now+=2200;c.setNow(now);throw Error('Network offline');}
  if(p.includes('/devices'))return {devices:[{id:state.dev,name:'My phone',type:'Smartphone',is_active:true,volume_percent:state.volume}]};
  if(p.includes('/play?')){state.id=o.body.uris[0].split(':').at(-1);state.pos=state.ignoreStart?0:o.body.position_ms;state.paused=false;return null;}
  if(p.includes('/pause?')){state.paused=true;return null;}
  if(p.includes('/seek?')){if(!state.ignoreSeek)state.pos=+new URL('https://x'+p).searchParams.get('position_ms');return null;}
  if(p==='/me/player'){
   now+=400;c.setNow(now);if(state.missing)return null;
   if(!state.paused&&!state.frozen)state.pos+=400;
   return {item:state.id?{id:state.id,uri:'spotify:track:'+state.id}:null,progress_ms:state.pos,is_playing:!state.paused,device:{id:state.dev,volume_percent:state.volume}};
  }
  return null;
 };
 run(c,"api=hostAPI;DJ.dev=DJ.sdkDev='phone';DJ.remote=false;DJ.verifyStart=realVerifyStart;");
 return {state,calls,advance(ms){now+=ms;c.setNow(now);},plays:()=>calls.filter(x=>x.p.includes('/play?')),seeks:()=>calls.filter(x=>x.p.includes('/seek?'))};
}
function ready(c,n=3){
 run(c,`ST.me={id:'tester'};ST.mix=Array.from({length:${n}},(_,i)=>({...${track},id:'song'+i,uri:'spotify:track:song'+i,name:'Song '+i,aiStart:30000,aiEnd:75000}));ST.pool=ST.mix;DJ.baseOrder=ST.mix.map(t=>t.id);LS.set('ai4',JSON.stringify(Object.fromEntries(ST.mix.map(t=>[t.id,{start:30000,end:75000,song:t}]))));`);
}

(async()=>{
await test('one request covers eight songs and requests stay serialized', async()=>{
 const c=context();run(c,`ST.mix=Array.from({length:16},(_,i)=>({...${track},id:String(i)}));LS.set('aikey','test');globalThis.sizes=[];globalThis.active=0;globalThis.maxActive=0;AI.call=async text=>{active++;maxActive=Math.max(active,maxActive);sizes.push((text.match(/id: /g)||[]).length);await Promise.resolve();active--;return '[]'};`);
 await run(c,'Promise.all([AI.one(ST.mix[0]),AI.one(ST.mix[8])])');assert.equal(run(c,'JSON.stringify(sizes)'),'[8,8]');assert.equal(run(c,'maxActive'),1);
});
await test('Gemini success retains backup models',async()=>{
 const c=context();run(c,"LS.set('aikey','test');AI.models=['a','b'];tfetch=async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'[]'}]}}]})});");
 await run(c,"AI.call('test')");assert.equal(run(c,'AI.models.length'),2);
});
await test('daily quota exhausts each model once then terminates',async()=>{
 const c=context();run(c,"LS.set('aikey','test');AI.models=['a','b'];globalThis.calls=0;tfetch=async()=>{if(++calls>4)throw Error('retry overflow');return {ok:false,status:429,json:async()=>({error:{message:'Daily quota exceeded'}})}};");
 await assert.rejects(run(c,"AI.call('test')"),/quota/);assert.equal(run(c,'calls'),2);
});
await test('temporary quota retry has a finite limit',async()=>{
 const c=context();run(c,"LS.set('aikey','test');AI.models=['a','b'];globalThis.calls=0;tfetch=async()=>{calls++;return {ok:false,status:429,json:async()=>({error:{message:'retry in 1 s'}})}};");
 await assert.rejects(run(c,"AI.call('test')"),/retry/);assert.equal(run(c,'calls'),4);
});
await test('AI exact passage, cache, manual priority and current lock',async()=>{
 const c=context();run(c,`ST.mix=[${track}];LS.set('aikey','test');AI.call=async()=>JSON.stringify([{id:'one',start:100,end:131,mood:'happy'}]);`);
 await run(c,'AI.run(ST.mix)');run(c,"planSegments(ST.mix,'smooth','ai')");assert.equal(run(c,'ST.mix[0].start'),100000);assert.equal(run(c,'ST.mix[0].end'),131000);
 run(c,"HK.set('one',60000);planSegments(ST.mix,'smooth','ai')");assert.equal(run(c,'ST.mix[0].hookSrc'),'you');
 run(c,"ST.mix[0]._lock=true;ST.mix[0].start=12345;planSegments(ST.mix,'smooth','ai')");assert.equal(run(c,'ST.mix[0].start'),12345);
});
await test('first song does not start before AI resolves',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev=DJ.sdkDev='device';LS.set('aikey','test');globalThis.calls=[];api=async(p,o)=>calls.push({p,o});AI.call=()=>new Promise(r=>globalThis.answer=r);globalThis.pending=DJ.go(0);`);
 await new Promise(r=>setImmediate(r));assert.equal(run(c,'calls.length'),0);
 run(c,`answer(JSON.stringify([{id:'one',start:100,end:140}]))`);await run(c,'pending');assert.equal(run(c,'calls[0].o.body.position_ms'),100000);assert.equal(run(c,'DJ.playing'),true);
});
await test('pause cancels an AI wait without a late start',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev=DJ.sdkDev='device';LS.set('aikey','test');globalThis.calls=[];api=async(p,o)=>calls.push(p);AI.call=()=>new Promise(r=>globalThis.answer=r);globalThis.pending=DJ.go(0);`);
 await new Promise(r=>setImmediate(r));await run(c,'DJ.pause()');await run(c,'pending');assert.equal(run(c,'DJ.busy'),false);
 run(c,`answer(JSON.stringify([{id:'one',start:100,end:140}]))`);await run(c,'AI.q');assert.equal(run(c,"calls.filter(x=>x.includes('/play?')).length"),0);
});
await test('AI failure never plays an estimated replacement',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev=DJ.sdkDev='device';LS.set('aikey','test');AI.call=async()=>{throw Error('quota exhausted')};globalThis.calls=[];api=async(p,o)=>calls.push(p);`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'DJ.playing'),false);assert.equal(run(c,'DJ.retryIdx'),0);assert.equal(run(c,"calls.filter(p=>p.includes('/play?')).length"),0);
});
await test('a missing browser SDK never falls back to a Spotify phone or saved output',async()=>{
 const c=context();run(c,`DJ.dev='stale-phone';LS.set('device','phone');api=async()=>{throw Error('Must not discover native devices')};`);
 await run(c,'DJ.devices()');assert.equal(run(c,'DJ.dev'),null);assert.equal(run(c,'DJ.devList.length'),0);assert.equal(run(c,'DJ.remote'),false);
 await assert.rejects(run(c,'DJ.devices({required:true})'),/browser player/);
});
await test('on iPhone the browser SDK is the only selected player, ignoring legacy native preference',async()=>{
 const c=context();c.navigator={userAgent:'iPhone',platform:'iPhone',maxTouchPoints:1};
 run(c,`DJ.sdkDev='browser';DJ.dev='phone';LS.set('device','phone');api=async()=>{throw Error('Must not query external outputs')};`);
 await run(c,'DJ.devices()');assert.equal(run(c,'DJ.dev'),'browser');assert.equal(run(c,'DJ.remote'),false);assert.equal(run(c,'DJ.devList.length'),1);
});
await test('an expired browser device is cleared without choosing another Spotify output',async()=>{
 const c=context();run(c,`DJ.dev=DJ.sdkDev='browser';api=async()=>{throw Error('Must not discover outputs')};`);
 await assert.rejects(run(c,"DJ.devices({required:true,exclude:'browser'})"),/Reconnect/);assert.equal(run(c,'DJ.dev'),null);assert.equal(run(c,'DJ.sdkDev'),null);assert.equal(run(c,'DJ.phase'),'disconnected');
});
await test('browser connection failures stay visible without an Open Spotify instruction',async()=>{
 const c=context();run(c,`DJ.sdkUnavailable('Protected audio unavailable');`);
 await assert.rejects(run(c,'DJ.devices({required:true})'),/Protected audio/);assert.match(run(c,"$('#deviceNote').textContent"),/Protected audio/);assert(!run(c,"$('#deviceNote').textContent").includes('Open Spotify'));
});
await test('SDK enables browser media integration, connects once and never autoplays on ready/reconnect',async()=>{
 const c=context();ready(c);run(c,`globalThis.options=null;globalThis.events={};globalThis.constructs=0;globalThis.connects=0;globalThis.requests=[];api=async(p,o)=>{requests.push(p);return null};globalThis.Spotify={Player:function(o){options=o;constructs++;this.addListener=(n,fn)=>events[n]=fn;this.connect=()=>{connects++;events.ready({device_id:'browser'});return Promise.resolve(true)}}};window.Spotify=Spotify;LS.set('device','native-phone');DJ.init();`);
 assert.equal(run(c,'options.enableMediaSession'),true);assert.equal(run(c,'DJ.dev'),'browser');assert.equal(run(c,'DJ.remote'),false);assert.equal(run(c,"LS.get('device')"),null);assert.equal(run(c,'requests.length'),0);
 run(c,"DJ.reconnect();events.not_ready();DJ.reconnect()");await new Promise(r=>setImmediate(r));assert.equal(run(c,'constructs'),1);assert.equal(run(c,'connects'),2);assert.equal(run(c,'DJ.dev'),'browser');assert.equal(run(c,'requests.length'),0);assert.equal(run(c,'DJ.playing'),false);
});
await test('SDK disconnect cancels AI preparation; later AI completion does not play anywhere',async()=>{
 const c=context();ready(c);const b=backend(c);run(c,`LS.set('ai4','{}');LS.set('aikey','test');AI.call=()=>new Promise(r=>globalThis.answer=r);globalThis.pending=DJ.resume();`);await new Promise(r=>setImmediate(r));run(c,"DJ.sdkUnavailable('Browser disconnected')");await run(c,'pending');run(c,`answer(JSON.stringify([{id:'song0',start:30,end:75}]))`);await run(c,'AI.q');assert.equal(b.plays().length,0);assert.equal(run(c,'DJ.phase'),'disconnected');assert.equal(run(c,'DJ.dev'),null);assert.equal(run(c,'DJ.remote'),false);
});
await test('Play before SDK readiness fails explicitly without starting or discovering Spotify phone playback',async()=>{
 const c=context();ready(c);run(c,`DJ.dev='native-phone';DJ.sdkDev=null;globalThis.requests=[];api=async(p,o)=>requests.push(p);`);await run(c,'DJ.resume()');assert.equal(run(c,'requests.length'),0);assert.equal(run(c,'DJ.phase'),'error');assert.match(run(c,'DJ.detail'),/browser player/);
});
await test('saved song pick reused after reload and across playlists without AI request',async()=>{
 const first=context();run(first,`ST.mix=[${track}];LS.set('aikey','test');AI.call=async()=>JSON.stringify([{id:'one',start:100,end:140,mood:'happy'}]);`);
 await run(first,'AI.run(ST.mix)');const saved=run(first,"LS.get('ai4')");const next=context();next.saved=saved;
 run(next,`LS.set('ai4',saved);LS.set('aikey','test');ST.mix=[{...${track},playlist:'another-playlist'}];globalThis.aiCalls=0;AI.call=async()=>{aiCalls++;throw Error('Should use saved pick')};`);
 await run(next,'AI.one(ST.mix[0])');await run(next,'AI.run(ST.mix)');assert.equal(run(next,'aiCalls'),0);assert.equal(run(next,'ST.mix[0].aiStart'),100000);assert.equal(run(next,'ST.mix[0].aiEnd'),140000);
});
await test('saving new AI picks no longer silently deletes older picks',async()=>{
 const c=context();run(c,`globalThis.picks=Object.fromEntries(Array.from({length:3001},(_,i)=>['track'+i,{start:30000,end:75000}]));AI.save(picks);`);
 assert.equal(run(c,'Object.keys(AI.cache()).length'),3001);assert.equal(run(c,'AI.cache().track0.start'),30000);
});
await test('saved mix restores its order, song and position after reopening without autoplay',async()=>{
 const first=context();run(first,`ST.me={id:'user-a'};ST.crate=[{type:'playlist',id:'p',name:'Night drive'}];ST.mix=[${track},{...${track},id:'two',uri:'spotify:track:two',name:'Second song'}];ST.pool=ST.mix;DJ.idx=1;DJ.pos=54000;DJ.posAt=10000;Library.capture(true);Library.saveDraft();`);
 const second=context();for(const [k,v] of first.storage)second.storage.set(k,v);
 run(second,`ST.me={id:'user-a'};Library.load();`);
 assert.equal(run(second,"ST.mix.map(t=>t.id).join(',')"),'one,two');assert.equal(run(second,'DJ.idx'),1);assert.equal(run(second,'DJ.pos'),54000);assert.equal(run(second,'DJ.playing'),false);assert.equal(run(second,'ST.crate[0].name'),'Night drive');assert.equal(run(second,'ST.view'),'play');
});
await test('sources and song-count draft survives before any mix is built',async()=>{
 const first=context();run(first,`ST.me={id:'user-a'};ST.crate=[{type:'album',id:'album',name:'An album'}];ST.max=60;Library.saveDraft();`);
 const second=context();for(const [k,v] of first.storage)second.storage.set(k,v);
 run(second,`ST.me={id:'user-a'};Library.load();`);assert.equal(run(second,'ST.max'),60);assert.equal(run(second,'ST.crate[0].type'),'album');assert.equal(run(second,'ST.mix.length'),0);
});
await test('library is scoped to Spotify account',async()=>{
 const first=context();run(first,`ST.me={id:'user-a'};ST.mix=[${track}];Library.capture(true);`);
 const second=context();for(const [k,v] of first.storage)second.storage.set(k,v);
 run(second,`ST.me={id:'user-b'};Library.load();`);assert.equal(run(second,'Library.state.mixes.length'),0);assert.equal(run(second,'ST.mix.length'),0);
});
await test('saved mix serialization omits runtime promises and credentials',async()=>{
 const c=context();run(c,`ST.me={id:'user-a'};ST.mix=[{...${track},_aiP:Promise.resolve(),privateToken:'secret-sentinel'}];LS.set('at','secret-access-token');Library.capture(true);`);
 const saved=run(c,"LS.get('library_user-a')");assert(!saved.includes('_aiP'));assert(!saved.includes('secret'));assert(saved.includes('spotify:track:one'));
});
await test('old timing-only cache is preserved and not presented as a recovered mix',async()=>{
 const c=context();run(c,`ST.me={id:'user-a'};LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));Library.load();`);
 assert.equal(run(c,'Library.state.mixes.length'),0);assert.equal(run(c,'AI.cache().one.start'),30000);assert.match(run(c,"$('#savedSongs').innerHTML"),/earlier AI timings/);
});
await test('new AI picks retain song details for the visible saved-song library',async()=>{
 const c=context();run(c,`ST.mix=[${track}];LS.set('aikey','test');AI.call=async()=>JSON.stringify([{id:'one',start:30,end:75}]);`);
 await run(c,'AI.run(ST.mix)');assert.equal(run(c,'AI.cache().one.song.name'),'Song');assert.match(run(c,"$('#savedSongs').innerHTML"),/AI pick saved/);
});
await test('completed saved mix restores as replay from its first song',async()=>{
 const first=context();run(first,`ST.me={id:'user-a'};ST.mix=[${track},{...${track},id:'two',uri:'spotify:track:two'}];DJ.idx=1;DJ.finished=true;Library.capture(true);`);
 const second=context();for(const [k,v] of first.storage)second.storage.set(k,v);
 run(second,`ST.me={id:'user-a'};Library.load();`);assert.equal(run(second,'DJ.finished'),true);assert.equal(run(second,'DJ.idx'),0);assert.equal(run(second,'DJ.loadedMix'),null);
});
await test('older song names can be recovered from Spotify without a new AI request',async()=>{
 const c=context();run(c,`LS.set('ai4',JSON.stringify({one:{start:60000,end:105000}}));globalThis.lookups=0;api=async()=>{lookups++;return {id:'one',uri:'spotify:track:one',name:'Recovered song',duration_ms:240000,artists:[{name:'Artist'}]}};AI.call=async()=>{throw Error('Must not call AI')};`);
 await run(c,'Library.recoverPicks()');assert.equal(run(c,'lookups'),1);assert.equal(run(c,'AI.cache().one.song.name'),'Recovered song');assert.equal(run(c,'AI.cache().one.start'),60000);
});
await test('in-flight AI save retains independently recovered song metadata',async()=>{
 const c=context();run(c,`LS.set('ai4',JSON.stringify({one:{start:30000,end:75000,song:${track}}}));AI.save({one:{start:30000,end:75000},two:{start:50000,end:95000}});`);
 assert.equal(run(c,'AI.cache().one.song.name'),'Song');assert.equal(run(c,'AI.cache().two.start'),50000);
});
await test('clear mixes preserves AI mappings, corrections, setup and active playback',async()=>{
 const c=context();run(c,`ST.me={id:'user-a'};ST.crate=[{type:'playlist',id:'p',name:'Playlist'}];ST.mix=[${track}];DJ.playing=true;DJ.idx=0;DJ.pos=42000;DJ.posAt=10000;LS.set('ai4',JSON.stringify({one:{start:30000,end:75000,song:${track}}}));HK.set('one',35000);LS.set('aikey','ai-key');LS.set('at','access-token');Library.capture(true);Library.saveDraft();globalThis.beforeAI=LS.get('ai4');globalThis.beforeHooks=LS.get('hooks');globalThis.original=ST.mix;Library.clearMixes();`);
 assert.equal(run(c,'Library.state.mixes.length'),0);assert.equal(run(c,'ST.mix===original'),true);assert.equal(run(c,'DJ.playing'),true);assert.equal(run(c,'DJ.pos'),42000);assert.equal(run(c,"LS.get('ai4')===beforeAI"),true);assert.equal(run(c,"LS.get('hooks')===beforeHooks"),true);assert.equal(run(c,"LS.get('aikey')"),'ai-key');assert.equal(run(c,"LS.get('at')"),'access-token');assert.equal(run(c,'Library.state.sources.length'),1);
});
await test('cleared mixes are not recreated by playback or later snapshots',async()=>{
 const c=context();run(c,`ST.me={id:'user-a'};ST.mix=[${track}];Library.capture(true);Library.clearMixes();Library.capture();Library.progress();`);
 assert.equal(run(c,'Library.state.mixes.length'),0);assert.equal(run(c,"JSON.parse(LS.get('library_user-a')).mixes.length"),0);
});
await test('clear song list persists across reload while exact AI mappings remain reusable',async()=>{
 const first=context();run(first,`ST.me={id:'user-a'};LS.set('ai4',JSON.stringify({one:{start:30000,end:75000,song:${track}}}));globalThis.before=LS.get('ai4');Library.clearSongs();`);assert.equal(run(first,"LS.get('ai4')===before"),true);
 const next=context();for(const [k,v] of first.storage)next.storage.set(k,v);
 run(next,`ST.me={id:'user-a'};Library.load();ST.mix=[${track}];LS.set('aikey','test');globalThis.aiCalls=0;AI.call=async()=>{aiCalls++;throw Error('Must reuse cached pick')};`);
 await run(next,'AI.one(ST.mix[0])');assert.equal(run(next,'aiCalls'),0);assert.match(run(next,"$('#savedSongs').innerHTML"),/List cleared/);assert.equal(run(next,'AI.cache().one.start'),30000);
});
await test('an explicitly created new mix can show previously hidden songs without AI requests',async()=>{
 const c=context();run(c,`ST.me={id:'user-a'};LS.set('ai4',JSON.stringify({one:{start:30000,end:75000,song:${track}}}));Library.clearSongs();ST.mix=[${track}];Library.capture(true);`);
 assert.equal(run(c,'Library.state.hiddenPicks.length'),0);assert.match(run(c,"$('#savedSongs').innerHTML"),/AI pick saved/);
});
await test('a pending AI answer from the current queue cannot refill a cleared song list',async()=>{
 const c=context();run(c,`ST.me={id:'user-a'};ST.mix=[${track}];Library.clearSongs();AI.save({one:{start:30000,end:75000,song:ST.mix[0]}});`);
 assert.match(run(c,"$('#savedSongs').innerHTML"),/List cleared/);assert.equal(run(c,'AI.cache().one.start'),30000);
});
await test('a restored undecided mix waits for AI instead of resuming an estimate',async()=>{
 const c=context();run(c,`ST.mix=[{...${track},hookSrc:'estimate'}];DJ.dev=DJ.sdkDev='phone';DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.pos=30000;DJ.posAt=1000;LS.set('aikey','test');globalThis.plays=[];api=async(p,o)=>{if(o?.body?.uris)plays.push(o.body.position_ms);return null};AI.call=()=>new Promise(r=>globalThis.answer=r);globalThis.pending=DJ.resume();`);
 await new Promise(r=>setImmediate(r));assert.equal(run(c,'plays.length'),0);run(c,`answer(JSON.stringify([{id:'one',start:90,end:135}]))`);await run(c,'pending');assert.equal(run(c,'plays[0]'),90000);
});
await test('invalid cached timestamps are refreshed rather than played from zero',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev=DJ.sdkDev='phone';LS.set('aikey','test');LS.set('ai4',JSON.stringify({one:{start:-1000,end:45000}}));globalThis.aiCalls=0;globalThis.positions=[];AI.call=async()=>{aiCalls++;return JSON.stringify([{id:'one',start:90,end:135}])};api=async(p,o)=>{if(o?.body?.uris)positions.push(o.body.position_ms);return null};`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'aiCalls'),1);assert.equal(run(c,'positions[0]'),90000);
});
await test('a stuck token refresh cannot hold a Spotify request indefinitely',async()=>{
 const c=context();c.setTimeout=fn=>{queueMicrotask(fn);return 1};run(c,`token=()=>new Promise(()=>{});`);
 await assert.rejects(run(c,"api('/me/player',{retry:0,timeout:1})"),/Spotify did not answer/);
});

// New shared-transport regressions follow.
await test('a frozen timestamp never becomes Playing, even when Spotify says is_playing',async()=>{
 const c=context();ready(c);const b=backend(c,{frozen:true});await run(c,'DJ.resume()');
 assert.equal(run(c,'DJ.playing'),false);assert.equal(run(c,'DJ.phase'),'error');assert.notEqual(run(c,"$('#playerAction').textContent"),'Pause');assert.equal(b.plays().length,1);assert.equal(b.state.paused,true);
});
await test('real progress is required before the shared Pause control appears',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');assert.equal(run(c,'DJ.phase'),'playing');assert.equal(run(c,"$('#playerAction').textContent"),'Pause');assert.equal(run(c,"$('#miniState').textContent"),'Playing');assert.equal(b.plays().length,1);
});
await test('all screens use the same transport and status without issuing playback commands',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');const count=b.calls.length;
 for(const view of ['home','mix','play','set']){run(c,`showView('${view}')`);assert.equal(run(c,"$('#playerAction').textContent"),'Pause');assert.equal(run(c,"$('#miniState').textContent"),'Playing');}
 assert.equal(b.plays().length,1);assert(b.calls.length>=count);
});
await test('Next while paused selects the next song without starting music',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.next()');assert.equal(run(c,'DJ.idx'),1);assert.equal(run(c,'DJ.phase'),'paused');assert.equal(b.plays().length,0);
});
await test('Next while playing starts exactly the next song and preserves mix size',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');await run(c,'DJ.next()');assert.equal(run(c,'DJ.idx'),1);assert.equal(b.state.id,'song1');assert.equal(run(c,'ST.mix.length'),3);assert.equal(b.plays().length,2);
});
await test('late paused polling cannot undo silent Next/Previous or a saved seek checkpoint',async()=>{
 for(const intent of ['next','seek']){
  const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');await run(c,'DJ.pause()');
  run(c,`DJ.playbackState=()=>new Promise(r=>globalThis.oldPoll=r);globalThis.pendingPoll=DJ.poll(true);`);
  if(intent==='next')await run(c,'DJ.next()');else await run(c,'DJ.seekTo(60000)');
  run(c,`oldPoll({item:{id:'song0',uri:'spotify:track:song0'},position:31000,paused:true,deviceId:'phone',volume:70})`);await run(c,'pendingPoll');
  assert.equal(run(c,'DJ.phase'),'paused');assert.equal(b.plays().length,1);
  if(intent==='next'){assert.equal(run(c,'DJ.idx'),1);await run(c,'DJ.previous()');assert.equal(run(c,'DJ.idx'),0);}
  else{assert.equal(run(c,'DJ.pos'),60000);assert.equal(run(c,'DJ.pendingSeek'),true);}
 }
});
await test('Previous restarts after three seconds, otherwise returns through listening history',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.go(0)');await run(c,'DJ.go(1)');await run(c,'DJ.go(2)');
 b.state.pos=37000;await run(c,'DJ.poll(true)');await run(c,'DJ.previous()');assert.equal(run(c,'DJ.idx'),2);
 await run(c,'DJ.previous()');assert.equal(run(c,'DJ.idx'),1);await run(c,'DJ.previous()');assert.equal(run(c,'DJ.idx'),0);
});
await test('shuffle preserves the current passage, played prefix and every track without audio commands',async()=>{
 const c=context();ready(c,12);const b=backend(c);run(c,'DJ.idx=3;DJ.pos=45000;DJ.posAt=10000;globalThis.before=ST.mix.slice(0,4).map(t=>t.id).join();globalThis.start=ST.mix[3].start;globalThis.end=ST.mix[3].end;');
 for(let i=0;i<20;i++)run(c,'DJ.shuffleUpcoming(true,true)');
 assert.equal(run(c,'ST.mix.slice(0,4).map(t=>t.id).join()'),run(c,'before'));assert.equal(run(c,'new Set(ST.mix.map(t=>t.id)).size'),12);assert.equal(run(c,'ST.mix[3].start'),run(c,'start'));assert.equal(run(c,'ST.mix[3].end'),run(c,'end'));assert.equal(b.plays().length,0);
 run(c,'DJ.shuffleUpcoming(false)');assert.equal(run(c,'ST.mix.map(t=>t.id).join()'),run(c,'DJ.baseOrder.join()'));
});
await test('repeat-one repeats automatically but manual Next still advances',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');run(c,"DJ.repeat='one'");await run(c,'DJ.transition()');assert.equal(run(c,'DJ.idx'),0);await run(c,'DJ.next()');assert.equal(run(c,'DJ.idx'),1);assert.equal(b.plays().length,3);
});
await test('repeat-all wraps and repeat-off ends without playing an unrelated song',async()=>{
 const c=context();ready(c,2);const b=backend(c);await run(c,'DJ.go(1)');run(c,"DJ.repeat='all'");await run(c,'DJ.transition()');assert.equal(run(c,'DJ.idx'),0);
 await run(c,'DJ.go(1)');run(c,"DJ.repeat='off'");await run(c,'DJ.transition()');assert.equal(run(c,'DJ.phase'),'ended');assert.equal(b.state.paused,true);const n=b.plays().length;await run(c,'DJ.resume()');assert.equal(run(c,'DJ.idx'),0);assert.equal(b.plays().length,n+1);
});
await test('paused seeking records a bounded checkpoint without starting or seeking Spotify',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.seekTo(0)');assert.equal(run(c,'DJ.pos'),30000);assert.equal(b.plays().length,0);assert.equal(b.seeks().length,0);await run(c,'DJ.resume()');assert.equal(b.plays()[0].o.body.position_ms,30000);
});
await test('playing seek stays within the AI window and verifies actual progress',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');await run(c,'DJ.seekTo(60000)');assert.equal(run(c,'DJ.phase'),'playing');assert(run(c,'DJ.pos')>=60000);assert.equal(b.seeks().length,1);
});
await test('an ignored initial seek is corrected once and frozen output still cannot fake Playing',async()=>{
 const c=context();ready(c);const b=backend(c,{ignoreStart:true});await run(c,'DJ.resume()');assert.equal(b.seeks().length,1);assert.equal(run(c,'DJ.phase'),'playing');assert(run(c,'DJ.pos')>=30000);
});
await test('external pause and external resume use observed state with no new Play command',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');b.state.paused=true;await run(c,'DJ.poll(true)');assert.equal(run(c,'DJ.phase'),'paused');
 b.state.paused=false;await run(c,'DJ.poll(true)');await run(c,'DJ.poll(true)');assert.equal(run(c,'DJ.phase'),'playing');assert.equal(b.plays().length,1);
});
await test('stale network status removes Playing and never skips forward',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');b.state.offline=true;b.advance(4000);await run(c,'DJ.poll(true)');assert.notEqual(run(c,'DJ.phase'),'playing');assert.notEqual(run(c,"$('#miniState').textContent"),'Playing');assert.equal(run(c,'DJ.idx'),0);assert.equal(b.plays().length,1);
 b.state.offline=false;await run(c,'DJ.poll(true)');assert.equal(run(c,'DJ.phase'),'playing');assert.equal(b.plays().length,1);
});
await test('a stream that stops moving buffers then stops with Retry, without skipping',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');b.state.frozen=true;b.advance(4000);await run(c,'DJ.poll(true)');assert.equal(run(c,'DJ.phase'),'buffering');b.advance(11000);await run(c,'DJ.poll(true)');assert.equal(run(c,'DJ.phase'),'error');assert.equal(run(c,'DJ.idx'),0);assert.equal(b.state.paused,true);
});
await test('another device or track disables mix scheduling without seeking or taking over',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');b.state.id='another';await run(c,'DJ.poll(true)');assert.equal(run(c,'DJ.phase'),'external');assert.equal(run(c,'DJ.loadedMix'),null);assert.equal(b.plays().length,1);assert.equal(b.seeks().length,0);
});
await test('opening the already active mix never pauses, restarts, or issues another Play',async()=>{
 const c=context();ready(c);const b=backend(c);run(c,'Library.capture(true)');await run(c,'DJ.resume()');const n=b.calls.length;await run(c,'Library.open(Library.state.activeId,true)');assert.equal(b.calls.length,n);assert.equal(run(c,'DJ.phase'),'playing');
});
await test('a cancelled in-flight start is stopped before the replacement start',async()=>{
 const c=context();ready(c);const b=backend(c);const api=c.hostAPI;let finish;
 c.hostAPI=async(p,o)=>{if(p.includes('/play?')&&o.body.uris[0].endsWith('song0')){await api(p,o);return new Promise(r=>finish=r);}return api(p,o);};run(c,'api=hostAPI;globalThis.a=DJ.go(0)');await new Promise(r=>setImmediate(r));run(c,'globalThis.b=DJ.go(1)');finish();await run(c,'Promise.all([a,b])');
 assert.equal(run(c,'DJ.idx'),1);assert.equal(run(c,'DJ.phase'),'playing');const commands=b.calls.filter(x=>/player\/(play|pause)\?/.test(x.p));assert(commands[0].p.includes('/play?'));assert(commands[1].p.includes('/pause?'));assert(commands[2].p.includes('/play?'));assert.equal(commands.length,3);
});
await test('waiting for AI shows Cancel and never a fake Pause icon',async()=>{
 const c=context();ready(c);backend(c);run(c,"LS.set('ai4','{}');LS.set('aikey','test');AI.call=()=>new Promise(r=>globalThis.answer=r);globalThis.pending=DJ.resume()");await new Promise(r=>setImmediate(r));assert.equal(run(c,'DJ.phase'),'waiting-ai');assert.equal(run(c,"$('#playerAction').textContent"),'Cancel');assert.equal(run(c,'DJ.playing'),false);await run(c,'DJ.pause()');await run(c,'pending');assert.equal(run(c,'DJ.phase'),'paused');
});
await test('shuffle and repeat survive reopening with the saved order',async()=>{
 const c=context();ready(c,8);backend(c);run(c,'Library.capture(true);DJ.shuffleUpcoming(true);DJ.cycleRepeat();');const ids=run(c,'ST.mix.map(t=>t.id).join()');const d=context();for(const[k,v]of c.storage)d.storage.set(k,v);run(d,"ST.me={id:'tester'};Library.load()");assert.equal(run(d,'DJ.shuffle'),true);assert.equal(run(d,'DJ.repeat'),'all');assert.equal(run(d,'ST.mix.map(t=>t.id).join()'),ids);
});
await test('a finished single-song mix replays its AI passage from the beginning',async()=>{
 const c=context();ready(c,1);const b=backend(c);await run(c,'DJ.resume()');await run(c,'DJ.transition()');assert.equal(run(c,'DJ.phase'),'ended');await run(c,'DJ.resume()');assert.equal(b.plays().at(-1).o.body.position_ms,30000);
});
await test('building a new mix while playing saves it without interrupting the current queue',async()=>{
 const c=context();ready(c,3);const b=backend(c);run(c,'Library.capture(true)');await run(c,'DJ.resume()');run(c,`globalThis.old=ST.mix;ST.pool=[...ST.mix].reverse();ST.crate=[{type:'playlist',id:'new',name:'New mix'}];buildOrder=tracks=>tracks.slice();`);const n=b.calls.length;
 const selected=await run(c,'remix()');assert.equal(selected,false);assert.equal(run(c,'ST.mix===old'),true);assert.equal(run(c,'DJ.phase'),'playing');assert.equal(run(c,'Library.state.mixes.length'),2);assert.equal(b.calls.length,n);
});
await test('a failed next track stops with retry on that track instead of skipping',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');const previous=c.hostAPI;c.hostAPI=async(p,o)=>{if(p.includes('/play?')&&o.body.uris[0].endsWith('song1'))throw Error('Track unavailable');return previous(p,o);};run(c,'api=hostAPI');await run(c,'DJ.next()');assert.equal(run(c,'DJ.idx'),1);assert.equal(run(c,'DJ.phase'),'error');assert.equal(b.state.paused,true);assert.equal(b.plays().length,1);
});
await test('a failed pause is shown as unconfirmed and Retry pause does not resume audio',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');const previous=c.hostAPI;c.hostAPI=async(p,o)=>{if(p.includes('/pause?'))throw Error('Pause failed');return previous(p,o);};run(c,'api=hostAPI');await run(c,'DJ.pause()');assert.equal(run(c,'DJ.phase'),'pause-unconfirmed');assert.equal(run(c,"$('#playerAction').textContent"),'Retry pause');await run(c,'DJ.toggle()');assert.equal(b.plays().length,1);
});
await test('zero output volume is disclosed without changing user volume',async()=>{
 const c=context();ready(c);const b=backend(c,{volume:0});await run(c,'DJ.resume()');assert.equal(run(c,'DJ.phase'),'playing');assert.match(run(c,"$('#stat').textContent"),/volume at zero/);assert.equal(b.calls.filter(x=>x.p.includes('/volume')).length,0);
});
await test('stale source-search responses cannot replace newer results',async()=>{
 const c=context();run(c,`ST.tab='album';$('#q').value='old';api=path=>new Promise(r=>{if(path.includes('old'))globalThis.oldAnswer=r;else globalThis.newAnswer=r});globalThis.oldSearch=refreshSources();$('#q').value='new';globalThis.newSearch=refreshSources();newAnswer({albums:{items:[{id:'new',name:'New result',artists:[]}]}});`);await run(c,'newSearch');run(c,`oldAnswer({albums:{items:[{id:'old',name:'Stale result',artists:[]}]}})`);await run(c,'oldSearch');assert.equal(run(c,'lastResults[0].id'),'new');
});
await test('unavailable, restricted and malformed tracks are filtered before building',async()=>{
 const c=context();assert.equal(run(c,`normTrack({id:'one',uri:'spotify:track:one',duration_ms:100000,is_playable:false})`),null);assert.equal(run(c,`normTrack({id:'one',uri:'spotify:track:one',duration_ms:100000,restrictions:{reason:'market'}})`),null);assert.equal(run(c,`normTrack({id:'one',uri:'spotify:track:one',duration_ms:0})`),null);
});
await test('short songs can have a valid AI passage without being forced to zero',async()=>{
 const c=context();run(c,`ST.mix=[{...${track},dur:15000}];LS.set('aikey','test');AI.call=async()=>JSON.stringify([{id:'one',start:2,end:13}]);`);await run(c,'AI.run(ST.mix)');run(c,`planSegments(ST.mix,'smooth','ai')`);assert.equal(run(c,'ST.mix[0].start'),2000);assert.equal(run(c,'ST.mix[0].end'),13000);
});
await test('end of mix is not claimed if Spotify refuses the pause',async()=>{
 const c=context();ready(c,1);const b=backend(c);await run(c,'DJ.resume()');const prior=c.hostAPI;c.hostAPI=async(p,o)=>{if(p.includes('/pause?'))throw Error('Pause refused');return prior(p,o)};run(c,'api=hostAPI');await run(c,'DJ.transition()');assert.equal(run(c,'DJ.phase'),'pause-unconfirmed');assert.equal(run(c,'DJ.finished'),false);
});
await test('manual hook corrections save without moving the currently playing window',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');const n=b.calls.length;run(c,`globalThis.originalStart=ST.mix[0].start;globalThis.originalEnd=ST.mix[0].end;applyHook(50000,'Saved')`);assert.equal(run(c,'HK.get().song0'),50000);assert.equal(run(c,'ST.mix[0].start'),run(c,'originalStart'));assert.equal(run(c,'ST.mix[0].end'),run(c,'originalEnd'));assert.equal(b.calls.length,n);
});
await test('next-song AI wait is not shown as safely paused when Spotify ignored pause',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');const prior=c.hostAPI;c.hostAPI=async(p,o)=>p.includes('/pause?')?null:prior(p,o);run(c,`api=hostAPI;const cache=AI.cache();delete cache.song1;LS.set('ai4',JSON.stringify(cache));LS.set('aikey','test');globalThis.requests=0;AI.call=async()=>{requests++;return '[]'};`);await run(c,'DJ.go(1)');assert.equal(run(c,'DJ.phase'),'pause-unconfirmed');assert.equal(run(c,'requests'),0);
});
await test('buffering seek is a verified transport action, not a local-only checkpoint',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');run(c,`DJ.setPhase('buffering','Checking')`);await run(c,'DJ.seekTo(50000)');assert.equal(b.seeks().length,1);assert.equal(run(c,'DJ.phase'),'playing');assert(run(c,'DJ.pos')>=50000);
});
await test('duplicate Play commands for the same pending song are coalesced',async()=>{
 const c=context();ready(c);const b=backend(c);const prior=c.hostAPI;let finish;c.hostAPI=async(p,o)=>{if(p.includes('/play?')){await prior(p,o);return new Promise(r=>finish=r);}return prior(p,o);};run(c,'api=hostAPI;globalThis.first=DJ.go(0)');await new Promise(r=>setImmediate(r));run(c,'globalThis.second=DJ.go(0)');finish();await run(c,'Promise.all([first,second])');assert.equal(b.plays().length,1);assert.equal(b.calls.filter(x=>x.p.includes('/pause?')).length,0);assert.equal(run(c,'DJ.phase'),'playing');
});
await test('an unavailable local SDK state falls back to the authoritative API clock',async()=>{
 const c=context();ready(c);const b=backend(c);run(c,`DJ.remote=false;DJ.sdkDev='phone';DJ.player={getCurrentState:async()=>null};`);await run(c,'DJ.resume()');assert.equal(run(c,'DJ.phase'),'playing');assert.equal(b.plays().length,1);
});
await test('browser autoplay denial is an error rather than a fake playing state',async()=>{
 const c=context();ready(c);const b=backend(c);run(c,`DJ.remote=false;DJ.sdkDev='phone';DJ.player={activateElement:async()=>{throw Error('Audio permission denied')}};`);await run(c,'DJ.resume()');assert.equal(run(c,'DJ.phase'),'error');assert.equal(b.plays().length,0);assert.notEqual(run(c,"$('#playerAction').textContent"),'Pause');
});
await test('a changed external context during pause is not falsely labelled Paused',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');const prior=c.hostAPI;c.hostAPI=async(p,o)=>{if(p.includes('/pause?')){b.state.id='external';return null;}return prior(p,o);};run(c,'api=hostAPI');await run(c,'DJ.pause()');assert.equal(run(c,'DJ.phase'),'external');assert.equal(run(c,'DJ.loadedMix'),null);
});
await test('paused navigation cannot discard an unconfirmed active stream',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');run(c,`DJ.desiredPlaying=false;DJ.setPhase('pause-unconfirmed','Not confirmed')`);await run(c,'DJ.next()');assert.equal(run(c,'DJ.idx'),0);assert.equal(run(c,'DJ.phase'),'pause-unconfirmed');assert.equal(run(c,"$('#nextBtn').disabled"),true);
});
await test('Cancel does not wait for browser readiness and late readiness never starts music',async()=>{
 const c=context();ready(c);run(c,`DJ.dev=DJ.sdkDev=null;DJ.activate=async()=>{};globalThis.plays=0;api=async()=>{plays++;return null};DJ.devices=()=>new Promise(r=>globalThis.devicesAnswer=r);globalThis.pending=DJ.resume();`);await new Promise(r=>setImmediate(r));await run(c,'DJ.pause()');await run(c,'pending');assert.equal(run(c,'DJ.phase'),'paused');assert.equal(run(c,'DJ.busy'),false);run(c,`DJ.dev=DJ.sdkDev='browser';devicesAnswer([])`);await new Promise(r=>setImmediate(r));assert.equal(run(c,'plays'),0);assert.equal(run(c,'DJ.phase'),'paused');
});
await test('a failed next song saves its intended start rather than the previous song time',async()=>{
 const c=context();ready(c);const b=backend(c);run(c,'Library.capture(true)');await run(c,'DJ.resume()');b.state.pos=70000;await run(c,'DJ.poll(true)');const prior=c.hostAPI;c.hostAPI=async(p,o)=>{if(p.includes('/play?')&&o.body.uris[0].endsWith('song1'))throw Error('Unavailable');return prior(p,o)};run(c,'api=hostAPI');await run(c,'DJ.next()');assert.equal(run(c,'DJ.phase'),'error');assert.equal(run(c,'DJ.pos'),30000);
 const d=context();for(const[k,v]of c.storage)d.storage.set(k,v);run(d,"ST.me={id:'tester'};Library.load()");assert.equal(run(d,'DJ.idx'),1);assert.equal(run(d,'DJ.pos'),30000);
});
await test('reopening a mix that closed during AI wait does not reuse an estimated checkpoint',async()=>{
 const c=context();ready(c);backend(c);run(c,`Library.capture(true);LS.set('ai4','{}');LS.set('aikey','test');AI.call=()=>new Promise(()=>{});globalThis.pending=DJ.go(1);`);await new Promise(r=>setImmediate(r));run(c,'Library.capture()');await run(c,'DJ.pause()');await run(c,'pending');
 const d=context();for(const[k,v]of c.storage)d.storage.set(k,v);run(d,"ST.me={id:'tester'};Library.load()");assert.equal(run(d,'DJ.idx'),1);assert.equal(run(d,'DJ.checkpointId'),null);assert.equal(run(d,'DJ.loadedMix'),null);assert.equal(run(d,'DJ.playing'),false);
});
await test('resume at a completed passage advances rather than playing a half-second tail',async()=>{
 const c=context();ready(c);const b=backend(c);run(c,`DJ.loadedMix=ST.mix;DJ.loadedId=DJ.checkpointId='song0';DJ.pos=75000;DJ.posAt=10000;DJ.setPhase('paused','')`);await run(c,'DJ.resume()');assert.equal(run(c,'DJ.idx'),1);assert.equal(b.plays()[0].o.body.position_ms,30000);
});

await test('Spotify receives the selected song plus bounded upcoming queue in order',async()=>{
 const c=context();ready(c,120);const b=backend(c);await run(c,'DJ.go(3)');
 const uris=b.plays()[0].o.body.uris;assert.equal(uris.length,100);assert.equal(uris[0],'spotify:track:song3');assert.equal(uris[99],'spotify:track:song102');
 assert.equal(run(c,'DJ.nativeQueueMix===ST.mix'),true);
});
await test('native Next follows the selected queued song by seeking, without another Play or AI request',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');b.state.id='song1';b.state.pos=0;
 await run(c,'DJ.poll(true)');assert.equal(run(c,'DJ.idx'),1);assert.equal(run(c,'DJ.phase'),'playing');assert.equal(b.plays().length,1);assert.equal(b.seeks().length,1);assert.equal(b.state.pos>=30000,true);
});
await test('native Next while paused updates the shared song silently and external resume repairs its passage',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');b.state.id='song1';b.state.pos=0;b.state.paused=true;
 await run(c,'DJ.poll(true)');assert.equal(run(c,'DJ.idx'),1);assert.equal(run(c,'DJ.phase'),'paused');assert.equal(b.plays().length,1);assert.equal(b.seeks().length,0);
 b.state.paused=false;await run(c,'DJ.poll(true)');assert.equal(run(c,'DJ.phase'),'playing');assert.equal(b.plays().length,1);assert.equal(b.state.pos>=30000,true);
});
await test('native Next with missing AI pauses audio while waiting and Cancel prevents a late start',async()=>{
 const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');run(c,"LS.set('ai4','{}');LS.set('aikey','test');AI.call=()=>new Promise(()=>{});");b.state.id='song1';b.state.pos=0;
 run(c,'globalThis.nativeWait=DJ.poll(true)');await new Promise(r=>setImmediate(r));assert.equal(b.state.paused,true);assert.equal(run(c,'DJ.phase'),'waiting-ai');
 await run(c,'DJ.pause()');await run(c,'nativeWait');assert.equal(b.plays().length,1);assert.equal(run(c,'DJ.phase'),'paused');
});

await test('rapid native Pause or Next during passage alignment is followed without stopping the new selection',async()=>{
 for(const action of ['pause','next']){
  const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');b.state.id='song1';b.state.pos=0;const original=c.hostAPI;let changed=false;
  c.hostAPI=async(p,o)=>{const r=await original(p,o);if(p.includes('/seek?')&&!changed){changed=true;if(action==='pause')b.state.paused=true;else{b.state.id='song2';b.state.pos=0;}}return r;};run(c,'api=hostAPI');await run(c,'DJ.poll(true)');
  if(action==='pause')assert.equal(run(c,'DJ.phase'),'paused');
  else{await run(c,'DJ.poll(true)');assert.equal(run(c,'DJ.idx'),2);assert.equal(run(c,'DJ.phase'),'playing');assert.equal(b.state.paused,false);}
  assert.equal(b.plays().length,1);assert.equal(b.calls.filter(x=>x.p.includes('/pause?')).length,0);
 }
});
await test('native song changes are not adopted on another output or from an old mix snapshot',async()=>{
 for(const change of ["DJ.dev='other'","DJ.nativeQueueMix=[]"]){const c=context();ready(c);const b=backend(c);await run(c,'DJ.resume()');run(c,change);b.state.id='song1';await run(c,'DJ.poll(true)');assert.equal(run(c,'DJ.phase'),'external');assert.equal(b.seeks().length,0);assert.equal(b.plays().length,1);}
});
await test('browser media controls share transport actions, bounded seeks and actual metadata/position',async()=>{
 const c=context();ready(c);run(c,`globalThis.handlers={};globalThis.actions=[];globalThis.navigator={mediaSession:{setActionHandler:(n,fn)=>handlers[n]=fn,setPositionState:s=>globalThis.mediaPosition=s}};globalThis.MediaMetadata=function(x){Object.assign(this,x)};DJ.sdkDev=DJ.dev='browser';DJ.remote=false;DJ.loadedMix=ST.mix;DJ.pos=40000;DJ.resume=()=>actions.push('play');DJ.pause=()=>actions.push('pause');DJ.next=()=>actions.push('next');DJ.previous=()=>actions.push('previous');DJ.seekTo=v=>actions.push(v);DJ.mediaSession();handlers.play();handlers.pause();handlers.stop();handlers.nexttrack();handlers.previoustrack();handlers.seekto({seekTime:42});handlers.seekbackward({seekOffset:5});handlers.seekforward({});`);
 assert.equal(run(c,'JSON.stringify(actions)'),JSON.stringify(['play','pause','pause','next','previous',42000,35000,50000]));assert.equal(run(c,'navigator.mediaSession.metadata.title'),'Song 0');assert.equal(run(c,'mediaPosition.position'),40);assert.equal(run(c,'mediaPosition.duration'),240);
 run(c,"DJ.phase='checking';DJ.mediaSession()");assert.equal(run(c,'navigator.mediaSession.playbackState'),'paused');
 run(c,"DJ.remote=true;handlers.play();handlers.nexttrack();DJ.idx=1;DJ.mediaSession()");assert.equal(run(c,'actions.length'),8);assert.equal(run(c,'navigator.mediaSession.metadata.title'),'Song 0');
});
await test('unsupported media actions do not prevent other handlers, and stale progress is not Playing',async()=>{
 const c=context();ready(c);run(c,`globalThis.handlers={};globalThis.navigator={mediaSession:{setActionHandler:(n,fn)=>{if(n==='stop')throw Error('unsupported');handlers[n]=fn}}};DJ.sdkDev=DJ.dev='browser';DJ.remote=false;DJ.loadedMix=ST.mix;DJ.phase='playing';DJ.confirmed=true;DJ.lastFrameAt=DJ.lastMotionAt=10000;DJ.mediaSession();`);assert.equal(run(c,"typeof handlers.nexttrack"),'function');assert.equal(run(c,'navigator.mediaSession.playbackState'),'playing');c.setNow(15000);run(c,'DJ.mediaSession()');assert.equal(run(c,'navigator.mediaSession.playbackState'),'paused');
});

console.log(`${count} checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
