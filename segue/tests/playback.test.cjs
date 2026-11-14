// Run with Node: no credentials, real network, music, or dependencies.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].split('(async function boot(){')[0];
function context() {
  const els = new Map(), storage = new Map(); let now = 10000;
  const element = () => ({value:'',dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelectorAll(){return []}});
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
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='device';LS.set('aikey','test');globalThis.calls=[];api=async(p,o)=>calls.push({p,o});AI.call=()=>new Promise(r=>globalThis.answer=r);globalThis.pending=DJ.go(0);`);
 await new Promise(r=>setImmediate(r));assert.equal(run(c,'calls.length'),0);
 run(c,`answer(JSON.stringify([{id:'one',start:100,end:140}]))`);await run(c,'pending');assert.equal(run(c,'calls[0].o.body.position_ms'),100000);assert.equal(run(c,'DJ.playing'),true);
});
await test('pause cancels an AI wait without a late start',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='device';LS.set('aikey','test');globalThis.calls=[];api=async(p,o)=>calls.push(p);AI.call=()=>new Promise(r=>globalThis.answer=r);globalThis.pending=DJ.go(0);`);
 await new Promise(r=>setImmediate(r));await run(c,'DJ.pause()');await run(c,'pending');assert.equal(run(c,'DJ.busy'),false);
 run(c,`answer(JSON.stringify([{id:'one',start:100,end:140}]))`);await run(c,'AI.q');assert.equal(run(c,"calls.filter(x=>x.includes('/play?')).length"),0);
});
await test('AI failure never plays an estimated replacement',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='device';LS.set('aikey','test');AI.call=async()=>{throw Error('quota exhausted')};globalThis.calls=[];api=async(p,o)=>calls.push(p);`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'DJ.playing'),false);assert.equal(run(c,'DJ.retryIdx'),0);assert.equal(run(c,"calls.filter(p=>p.includes('/play?')).length"),0);
});
await test('pause freezes elapsed position and resume includes URI and position',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='device';DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.pos=30000;DJ.posAt=1000;DJ.playing=true;LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.calls=[];api=async(p,o)=>calls.push({p,o});`);
 await run(c,'DJ.pause()');assert.equal(run(c,'DJ.pos'),39000);c.setNow(20000);await run(c,'DJ.resume()');assert.equal(run(c,'calls[1].o.body.position_ms'),39000);assert.equal(run(c,'calls[1].o.body.uris[0]'),'spotify:track:one');
});
await test('new mix cannot resume old Spotify context',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='device';DJ.pos=90000;DJ.posAt=1000;LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.calls=[];api=async(p,o)=>calls.push(o);`);
 await run(c,'DJ.resume()');assert.equal(run(c,'calls[0].body.position_ms'),30000);assert.equal(run(c,'calls[0].body.uris[0]'),'spotify:track:one');
});
await test('wrong SDK track is never used and does not advance mix',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.loadedMix=ST.mix;DJ.playing=true;DJ.pos=30000;DJ.posAt=1000;DJ.startedAt=1000;DJ.player={getCurrentState:async()=>({position:41000,paused:false,track_window:{current_track:{id:'wrong'}}})};api=async()=>({item:{id:'wrong'},progress_ms:41000,is_playing:true});DJ.loop();`);
 await run(c,'DJ.tickFn()');assert.equal(run(c,'DJ.idx'),0);assert.equal(run(c,'DJ.playing'),false);assert.equal(run(c,'DJ.pos'),39000);
});
await test('external Spotify pause and resume synchronize',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.loadedMix=ST.mix;DJ.playing=true;DJ.pos=30000;DJ.posAt=1000;DJ.startedAt=1000;globalThis.paused=true;DJ.player={getCurrentState:async()=>({position:32000,paused,track_window:{current_track:{id:'one'}}})};DJ.loop();`);
 await run(c,'DJ.tickFn()');assert.equal(run(c,'DJ.playing'),false);assert.equal(run(c,'DJ.pos'),32000);
 run(c,'paused=false');await run(c,'DJ.tickFn()');assert.equal(run(c,'DJ.playing'),true);
});
await test('failed next song is retried but never skipped',async()=>{
 const c=context();run(c,`ST.mix=[${track},{...${track},id:'two',uri:'spotify:track:two'},{...${track},id:'three',uri:'spotify:track:three'}];DJ.dev='device';DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.playing=true;DJ.posAt=1000;LS.set('ai4',JSON.stringify({two:{start:40000,end:80000}}));globalThis.uris=[];api=async(p,o)=>{if(o.body?.uris){uris.push(o.body.uris[0]);throw Error('unavailable')}return null};`);
 await run(c,'DJ.transition()');assert.equal(run(c,'JSON.stringify(uris)'),'["spotify:track:two","spotify:track:two"]');assert.equal(run(c,'DJ.idx'),0);assert.equal(run(c,'DJ.retryIdx'),1);assert.equal(run(c,'DJ.playing'),false);
});
await test('automatic transition does not wait for AI when next pick is cached',async()=>{
 const c=context();run(c,`ST.mix=[${track},{...${track},id:'two',uri:'spotify:track:two'}];DJ.dev='device';DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.playing=true;LS.set('ai4',JSON.stringify({two:{start:40000,end:80000}}));globalThis.calls=[];api=async(p,o)=>calls.push({p,o});`);
 await run(c,'DJ.transition()');assert.equal(run(c,'DJ.idx'),1);assert.equal(run(c,'calls.length'),1);assert.equal(run(c,'calls[0].o.body.position_ms'),40000);
});
await test('late play acknowledgement cannot undo pause',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='device';LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.calls=[];api=(p,o)=>{calls.push(p);return p.includes('/play?')?new Promise(r=>globalThis.ack=r):Promise.resolve()};globalThis.pending=DJ.go(0);`);
 await new Promise(r=>setImmediate(r));await run(c,'DJ.pause()');run(c,'ack()');await run(c,'pending');assert.equal(run(c,'DJ.playing'),false);assert.equal(run(c,"calls.filter(x=>x.includes('/pause?')).length"),2);
});
await test('final song pauses and Play restarts first AI passage',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='device';DJ.playing=true;DJ.loadedMix=ST.mix;DJ.loadedId='one';LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.calls=[];api=async(p,o)=>calls.push({p,o});`);
 await run(c,'DJ.transition()');assert.equal(run(c,'DJ.finished'),true);await run(c,'DJ.resume()');assert.equal(run(c,'calls[1].o.body.position_ms'),30000);assert.equal(run(c,'DJ.idx'),0);
});
await test('late AI at a boundary pauses, then plays that next song',async()=>{
 const c=context();run(c,`ST.mix=[${track},{...${track},id:'two',uri:'spotify:track:two'}];DJ.dev='device';DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.playing=true;LS.set('aikey','test');globalThis.calls=[];api=async(p,o)=>calls.push({p,o});AI.call=()=>new Promise(r=>globalThis.answer=r);globalThis.pending=DJ.transition();`);
 await new Promise(r=>setImmediate(r));assert.equal(run(c,'calls.length'),1);assert.match(run(c,'calls[0].p'),/pause/);assert.equal(run(c,'DJ.playing'),false);
 run(c,`answer(JSON.stringify([{id:'two',start:50000/1000,end:90000/1000}]))`);await run(c,'pending');assert.equal(run(c,'DJ.idx'),1);assert.equal(run(c,'calls[1].o.body.uris[0]'),'spotify:track:two');
});
await test('remote state pauses and does not take over a different device',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='phone';DJ.loadedMix=ST.mix;DJ.playing=true;DJ.startedAt=1000;`);
 run(c,`DJ.acceptState({item:{id:'one'},progress_ms:32000,is_playing:false,device:{id:'phone'}},ST.mix[0],true)`);assert.equal(run(c,'DJ.externalPaused'),true);assert.equal(run(c,'DJ.pos'),32000);
 run(c,`DJ.acceptState({item:{id:'one'},progress_ms:33000,is_playing:true,device:{id:'other'}},ST.mix[0],true)`);assert.equal(run(c,'DJ.playing'),false);assert.equal(run(c,'DJ.loadedMix'),null);
});
await test('background AI cannot change the current passage or running order',async()=>{
 const c=context();run(c,`ST.mix=[${track},{...${track},id:'two',start:40000,end:80000,aiStart:100000,aiEnd:140000}];DJ.idx=0;DJ.playing=true;ST.mix[0].aiStart=90000;ST.mix[0].aiEnd=130000;replanAhead(DJ.idx);`);
 assert.equal(run(c,'ST.mix[0].start'),30000);assert.equal(run(c,'ST.mix[0].end'),75000);assert.equal(run(c,'ST.mix[1].start'),100000);assert.equal(run(c,"ST.mix.map(t=>t.id).join(',')"),'one,two');
});
await test('empty device list clears stale selection instead of retaining phantom output',async()=>{
 const c=context();run(c,`DJ.dev='stale';api=async()=>({devices:[]});`);
 await run(c,'DJ.devices()');assert.equal(run(c,'DJ.dev'),null);assert.equal(run(c,'DJ.devList.length'),0);
 await assert.rejects(run(c,'DJ.devices({required:true})'),/No playback device/);
});
await test('phone prefers active Spotify device and dropdown matches playback target',async()=>{
 const c=context();c.navigator={userAgent:'iPhone',platform:'iPhone',maxTouchPoints:1};
 run(c,`DJ.dev=DJ.sdkDev='browser';api=async()=>({devices:[{id:'phone',name:'My iPhone',type:'Smartphone',is_active:true}]});`);
 await run(c,'DJ.devices()');assert.equal(run(c,'DJ.dev'),'phone');assert.equal(run(c,'DJ.remote'),true);assert.equal(run(c,"$('#devSel').value"),'phone');
});
await test('explicit device preference respected and restricted outputs excluded',async()=>{
 const c=context();c.navigator={userAgent:'iPhone'};
 run(c,`DJ.sdkDev='browser';LS.set('device','browser');api=async()=>({devices:[{id:'blocked',name:'Blocked',is_restricted:true},{id:'phone',name:'My iPhone',type:'Smartphone',is_active:true}]});`);
 await run(c,'DJ.devices()');assert.equal(run(c,'DJ.dev'),'browser');assert.equal(run(c,'DJ.devList.length'),2);
});
await test('404 browser device recovers to phone, retrying only requested song',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev=DJ.sdkDev='ghost-browser';LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.plays=[];api=async(p,o)=>{if(p.includes('/devices'))return {devices:[{id:'phone',name:'My iPhone',type:'Smartphone',is_active:true}]};if(p.includes('/play?')){plays.push(p);if(plays.length===1){const e=Error('Device not found');e.status=404;throw e}}return null};`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'DJ.sdkDev'),null);assert.equal(run(c,'DJ.dev'),'phone');assert.equal(run(c,'DJ.playing'),true);assert.equal(run(c,'plays.length'),2);assert.match(run(c,'plays[1]'),/device_id=phone/);
});
await test('device API errors remain visible instead of pretending no outputs exist',async()=>{
 const c=context();run(c,`api=async()=>{throw Error('Spotify is limiting requests')};`);
 await assert.rejects(run(c,'DJ.devices({required:true})'),/limiting/);assert.match(run(c,"$('#deviceNote').textContent"),/limiting/);
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
 assert.equal(run(second,"ST.mix.map(t=>t.id).join(',')"),'one,two');assert.equal(run(second,'DJ.idx'),1);assert.equal(run(second,'DJ.pos'),54000);assert.equal(run(second,'DJ.playing'),false);assert.equal(run(second,'ST.crate[0].name'),'Night drive');assert.equal(run(second,'ST.view'),'home');
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
await test('ignored Spotify start position is repaired once and confirmed before Live',async()=>{
 const c=context();run(c,`DJ.verifyStart=realVerifyStart;ST.mix=[${track}];DJ.dev='phone';DJ.remote=true;LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.position=0;globalThis.seeks=0;globalThis.liveDuringSeek=null;api=async(p,o)=>{if(p.includes('/seek?')){seeks++;liveDuringSeek=DJ.playing;position=30000;return null}if(p==='/me/player')return {item:{id:'one'},progress_ms:position,is_playing:true,device:{id:'phone'}};return null};`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'seeks'),1);assert.equal(run(c,'liveDuringSeek'),false);assert.equal(run(c,'DJ.confirmed'),true);assert.equal(run(c,'DJ.pos'),30000);assert.equal(run(c,'DJ.playing'),true);
});
await test('correct Spotify start position needs no corrective seek',async()=>{
 const c=context();run(c,`DJ.verifyStart=realVerifyStart;ST.mix=[${track}];DJ.dev='phone';DJ.remote=true;LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.seeks=0;api=async(p,o)=>{if(p.includes('/seek?'))seeks++;if(p==='/me/player')return {item:{id:'one'},progress_ms:31000,is_playing:true,device:{id:'phone'}};return null};`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'seeks'),0);assert.equal(run(c,'DJ.pos'),31000);assert.equal(run(c,'DJ.playing'),true);
});
await test('a different track is never seeked as if it were the AI-picked song',async()=>{
 const c=context();run(c,`DJ.verifyStart=realVerifyStart;ST.mix=[${track}];DJ.dev='phone';DJ.remote=true;LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.seeks=0;api=async(p,o)=>{if(p.includes('/seek?'))seeks++;if(p==='/me/player')return {item:{id:'other-song'},progress_ms:0,is_playing:true,device:{id:'phone'}};return null};`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'seeks'),0);assert.equal(run(c,'DJ.playing'),false);assert.equal(run(c,'DJ.retryIdx'),0);
});
await test('ignored corrective seek stops safely without looping or skipping',async()=>{
 const c=context();run(c,`DJ.verifyStart=realVerifyStart;ST.mix=[${track},{...${track},id:'two',uri:'spotify:track:two'}];DJ.dev='phone';DJ.remote=true;LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.seeks=0;globalThis.pauses=0;globalThis.reads=0;api=async(p,o)=>{if(p.includes('/seek?'))seeks++;if(p.includes('/pause?'))pauses++;if(p==='/me/player'){reads++;return {item:{id:'one'},progress_ms:0,is_playing:true,device:{id:'phone'}}}return null};`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'seeks'),1);assert.equal(run(c,'reads'),8);assert.equal(run(c,'pauses'),1);assert.equal(run(c,'DJ.playing'),false);assert.equal(run(c,'DJ.idx'),0);
});
await test('pause during position verification prevents a corrective seek or late start',async()=>{
 const c=context();run(c,`DJ.verifyStart=realVerifyStart;ST.mix=[${track}];DJ.dev='phone';DJ.remote=true;LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.seeks=0;api=async(p,o)=>{if(p.includes('/seek?'))seeks++;if(p==='/me/player')return new Promise(r=>globalThis.reply=r);return null};globalThis.pending=DJ.go(0);`);
 await new Promise(r=>setImmediate(r));await run(c,'DJ.pause()');run(c,`reply({item:{id:'one'},progress_ms:0,is_playing:true,device:{id:'phone'}})`);await run(c,'pending');assert.equal(run(c,'seeks'),0);assert.equal(run(c,'DJ.playing'),false);
});
await test('a restored undecided mix waits for AI instead of resuming an estimate',async()=>{
 const c=context();run(c,`ST.mix=[{...${track},hookSrc:'estimate'}];DJ.dev='phone';DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.pos=30000;DJ.posAt=1000;LS.set('aikey','test');globalThis.plays=[];api=async(p,o)=>{if(o?.body?.uris)plays.push(o.body.position_ms);return null};AI.call=()=>new Promise(r=>globalThis.answer=r);globalThis.pending=DJ.resume();`);
 await new Promise(r=>setImmediate(r));assert.equal(run(c,'plays.length'),0);run(c,`answer(JSON.stringify([{id:'one',start:90,end:135}]))`);await run(c,'pending');assert.equal(run(c,'plays[0]'),90000);
});
await test('resume verifies and repairs the saved listening position, not only track identity',async()=>{
 const c=context();run(c,`DJ.verifyStart=realVerifyStart;ST.mix=[{...${track},end:140000}];DJ.dev='phone';DJ.remote=true;DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.pos=100000;DJ.posAt=1000;LS.set('ai4',JSON.stringify({one:{start:30000,end:140000}}));globalThis.position=0;globalThis.target=null;api=async(p,o)=>{if(p.includes('/seek?')){target=Number(new URL('https://x'+p).searchParams.get('position_ms'));position=target}if(p==='/me/player')return {item:{id:'one'},progress_ms:position,is_playing:true,device:{id:'phone'}};return null};`);
 await run(c,'DJ.resume()');assert.equal(run(c,'target'),100000);assert.equal(run(c,'DJ.pos'),100000);assert.equal(run(c,'DJ.playing'),true);
});
await test('invalid cached timestamps are refreshed rather than played from zero',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='phone';LS.set('aikey','test');LS.set('ai4',JSON.stringify({one:{start:-1000,end:45000}}));globalThis.aiCalls=0;globalThis.positions=[];AI.call=async()=>{aiCalls++;return JSON.stringify([{id:'one',start:90,end:135}])};api=async(p,o)=>{if(o?.body?.uris)positions.push(o.body.position_ms);return null};`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'aiCalls'),1);assert.equal(run(c,'positions[0]'),90000);
});
await test('a valid AI pick at the actual beginning is not arbitrarily changed',async()=>{
 const c=context();run(c,`DJ.verifyStart=realVerifyStart;ST.mix=[${track}];DJ.dev='phone';DJ.remote=true;LS.set('ai4',JSON.stringify({one:{start:0,end:45000}}));globalThis.seeks=0;api=async(p,o)=>{if(p.includes('/seek?'))seeks++;if(p==='/me/player')return {item:{id:'one'},progress_ms:0,is_playing:true,device:{id:'phone'}};return null};`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'DJ.pos'),0);assert.equal(run(c,'seeks'),0);assert.equal(run(c,'DJ.playing'),true);
});
await test('a late Spotify reset to the intro is corrected without skipping the song',async()=>{
 const c=context();run(c,`DJ.verifyStart=realVerifyStart;ST.mix=[${track}];DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.dev='phone';DJ.remote=true;DJ.playing=true;DJ.confirmed=true;DJ.startedAt=1000;DJ.pos=40000;DJ.posAt=1000;globalThis.position=0;globalThis.seeks=0;api=async(p,o)=>{if(p.includes('/seek?')){seeks++;position=30000}if(p==='/me/player')return {item:{id:'one'},progress_ms:position,is_playing:true,device:{id:'phone'}};return null};DJ.loop();`);
 await run(c,'DJ.tickFn()');assert.equal(run(c,'seeks'),1);assert.equal(run(c,'DJ.pos'),30000);assert.equal(run(c,'DJ.idx'),0);assert.equal(run(c,'DJ.playing'),true);
});
await test('stale SDK intro position is checked against Spotify before a seek',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.dev=DJ.sdkDev='browser';DJ.remote=false;DJ.playing=true;DJ.confirmed=true;DJ.startedAt=1000;DJ.pos=40000;DJ.posAt=1000;DJ.player={getCurrentState:async()=>({position:0,paused:false,track_window:{current_track:{id:'one'}}})};globalThis.seeks=0;api=async(p,o)=>{if(p.includes('/seek?'))seeks++;return {item:{id:'one'},progress_ms:40000,is_playing:true,device:{id:'browser'}}};DJ.loop();`);
 await run(c,'DJ.tickFn()');assert.equal(run(c,'seeks'),0);assert.equal(run(c,'DJ.pos'),40000);assert.equal(run(c,'DJ.playing'),true);
});
await test('repeated device resets cannot cause an endless corrective-seek loop',async()=>{
 const c=context();run(c,`DJ.verifyStart=realVerifyStart;ST.mix=[${track}];DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.dev='phone';DJ.remote=true;DJ.playing=true;DJ.confirmed=true;DJ.positionRepairs=1;DJ.startedAt=1000;DJ.pos=40000;DJ.posAt=1000;globalThis.seeks=0;api=async(p,o)=>{if(p.includes('/seek?'))seeks++;if(p==='/me/player')return {item:{id:'one'},progress_ms:0,is_playing:true,device:{id:'phone'}};return null};DJ.loop();`);
 await run(c,'DJ.tickFn()');assert.equal(run(c,'seeks'),0);assert.equal(run(c,'DJ.idx'),0);assert.equal(run(c,'DJ.playing'),false);
});
await test('a failed SDK state read falls back to Spotify API confirmation',async()=>{
 const c=context();run(c,`DJ.verifyStart=realVerifyStart;ST.mix=[${track}];DJ.dev=DJ.sdkDev='browser';DJ.remote=false;DJ.player={getCurrentState:async()=>{throw Error('SDK stale')}};LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));api=async(p,o)=>p==='/me/player'?{item:{id:'one'},progress_ms:30000,is_playing:true,device:{id:'browser'}}:null;`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'DJ.playing'),true);assert.equal(run(c,'DJ.confirmed'),true);assert.equal(run(c,'DJ.pos'),30000);
});
await test('a stuck token refresh cannot hold a Spotify request indefinitely',async()=>{
 const c=context();c.setTimeout=fn=>{queueMicrotask(fn);return 1};run(c,`token=()=>new Promise(()=>{});`);
 await assert.rejects(run(c,"api('/me/player',{retry:0,timeout:1})"),/Spotify did not answer/);
});
await test('resume cannot use a zero checkpoint before the saved AI passage',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='phone';DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.pos=0;DJ.posAt=1000;LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.target=null;api=async(p,o)=>{if(o?.body?.uris)target=o.body.position_ms;return null};`);
 await run(c,'DJ.resume()');assert.equal(run(c,'target'),30000);assert.equal(run(c,'DJ.pos'),30000);
});
console.log(`${count} checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
