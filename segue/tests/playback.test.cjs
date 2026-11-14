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
    setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},fetch(){throw Error('Unexpected network request')},window:{}});
  // Replace only time/network boundaries; keep production algorithms and retry control flow.
  vm.runInContext(source.replace('const tfetch =','let tfetch =').replace('const sleep = ms => new Promise(r => setTimeout(r, ms));','const sleep = async () => {};'),c);
  c.setNow = x => now = x;
  vm.runInContext('renderDeck=()=>{};showNow=()=>{};drawCurve=()=>{};aiStatus=()=>{};aiAhead=()=>{};',c);
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
 const c=context();run(c,`ST.mix=[${track}];LS.set('aikey','test');AI.call=async()=>{throw Error('quota exhausted')};globalThis.calls=[];api=async(p,o)=>calls.push(p);`);
 await run(c,'DJ.go(0)');assert.equal(run(c,'DJ.playing'),false);assert.equal(run(c,'DJ.retryIdx'),0);assert.equal(run(c,'calls.length'),0);
});
await test('pause freezes elapsed position and resume includes URI and position',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='device';DJ.loadedMix=ST.mix;DJ.loadedId='one';DJ.pos=30000;DJ.posAt=1000;DJ.playing=true;globalThis.calls=[];api=async(p,o)=>calls.push({p,o});`);
 await run(c,'DJ.pause()');assert.equal(run(c,'DJ.pos'),39000);c.setNow(20000);await run(c,'DJ.resume()');assert.equal(run(c,'calls[1].o.body.position_ms'),39000);assert.equal(run(c,'calls[1].o.body.uris[0]'),'spotify:track:one');
});
await test('new mix cannot resume old Spotify context',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.dev='device';DJ.pos=90000;DJ.posAt=1000;LS.set('ai4',JSON.stringify({one:{start:30000,end:75000}}));globalThis.calls=[];api=async(p,o)=>calls.push(o);`);
 await run(c,'DJ.resume()');assert.equal(run(c,'calls[0].body.position_ms'),30000);assert.equal(run(c,'calls[0].body.uris[0]'),'spotify:track:one');
});
await test('wrong SDK track is never used and does not advance mix',async()=>{
 const c=context();run(c,`ST.mix=[${track}];DJ.loadedMix=ST.mix;DJ.playing=true;DJ.pos=30000;DJ.posAt=1000;DJ.startedAt=1000;DJ.player={getCurrentState:async()=>({position:41000,paused:false,track_window:{current_track:{id:'wrong'}}})};DJ.loop();`);
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
console.log(`${count} checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
