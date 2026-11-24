// Moderator page (GET /moderate): a small iPhone-friendly page for the owner to review Community reports and
// messages and to hide, restore, remove or ban. It holds no data itself: it asks for the moderator password,
// keeps it only in this browser, and calls the admin API (/api/admin/forum/*) with it.
export function moderatePage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex">
<title>Moderation · Immigration Wallet</title>
<style>
:root{--bg:#000;--card:#1C1C1E;--sep:#38383A;--t:#fff;--t2:#8E8E93;--acc:#0A84FF;--red:#FF453A;--grn:#30D158}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:16px/1.4 -apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:640px;margin:0 auto;padding:calc(16px + env(safe-area-inset-top)) 16px 48px}
h1{font-size:30px;margin:8px 0 2px;letter-spacing:-.4px}.sub{color:var(--t2);margin:0 0 18px;font-size:14px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.3px;color:var(--t2);font-weight:500;margin:26px 4px 8px}
.card{background:var(--card);border-radius:14px;padding:14px;margin-bottom:10px}
.meta{color:var(--t2);font-size:13px}.ttl{font-weight:600;margin:4px 0}.body{white-space:pre-wrap;font-size:15px;color:#E5E5EA;margin:6px 0}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
button{font:inherit;font-size:14px;font-weight:600;border:0;border-radius:10px;padding:9px 14px;background:#2C2C2E;color:var(--t)}
button.red{color:var(--red)}button.acc{background:var(--acc)}button:active{opacity:.6}
input{font:inherit;width:100%;padding:12px;border-radius:10px;border:0;background:var(--card);color:var(--t)}
.pill{display:inline-block;font-size:12px;padding:2px 8px;border-radius:99px;background:#2C2C2E;color:var(--t2);margin-right:6px}
.empty{color:var(--t2);text-align:center;padding:24px}.err{color:var(--red);margin:10px 4px}
.top{display:flex;justify-content:space-between;align-items:center}.tabs{display:flex;gap:8px;margin:6px 0 0}
.tabs button.on{background:#3A3A3C}
</style></head><body><main>
<div class="top"><h1>Moderation</h1><button id="out" hidden>Sign out</button></div>
<p class="sub">Immigration Wallet Community · act on reports within 24 hours</p>
<div id="login"><input id="pw" type="password" autocomplete="current-password" placeholder="Moderator password">
<div class="row"><button class="acc" id="go">Open</button></div><p class="err" id="lerr"></p></div>
<div id="app" hidden>
<div class="tabs"><button id="t-open" class="on">Open reports</button><button id="t-all">All reports</button><button id="t-msg">Messages</button></div>
<p class="err" id="err"></p><div id="list"></div></div>
</main><script>
const $=(i)=>document.getElementById(i); let pw=''; let tab='open';
try{pw=localStorage.getItem('iw-mod')||''}catch(e){}
const esc=(s)=>String(s??'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const when=(s)=>{try{return new Date(s).toLocaleString()}catch(e){return s}};
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:{'Authorization':'Bearer '+pw,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const j=await r.json().catch(()=>({})); if(r.status===401){throw Object.assign(new Error('Wrong password'),{auth:true})} if(!r.ok) throw new Error(j.error||('Error '+r.status)); return j;}
function show(ok){$('login').hidden=ok;$('app').hidden=!ok;$('out').hidden=!ok}
async function load(){ $('err').textContent=''; const L=$('list'); L.innerHTML='<p class="empty">Loading…</p>';
 ['open','all','msg'].forEach(t=>$('t-'+t).classList.toggle('on',t===tab));
 try{
  if(tab==='msg'){const j=await api('/api/admin/forum/messages'); L.innerHTML=j.messages.length?j.messages.map(m=>'<div class="card"><div class="meta">'+esc(when(m.at))+(m.about?' · '+esc(m.about):'')+(m.uid?' · user '+esc(m.uid):'')+'</div><div class="body">'+esc(m.message)+'</div></div>').join(''):'<p class="empty">No messages.</p>'; return;}
  const j=await api('/api/admin/forum/reports'+(tab==='all'?'?status=all':'')); show(true);
  L.innerHTML=j.items.length?j.items.map(card).join(''):'<p class="empty">Nothing to review. 🎉</p>';
 }catch(e){ if(e.auth){try{localStorage.removeItem('iw-mod')}catch(_){} show(false); $('lerr').textContent='Wrong password.'; return;} $('err').textContent=e.message; L.innerHTML=''; }
}
function card(it){ const a=it.author||{}; const reasons=[...new Set((it.reports||[]).map(r=>r.reason))].join(', ');
 const k=esc(it.kind), id=esc(it.id);
 let btns='';
 if(it.kind!=='user'&&it.exists){ btns+=it.hidden?'<button data-a="restore" data-k="'+k+'" data-i="'+id+'">Restore</button>':'<button data-a="hide" data-k="'+k+'" data-i="'+id+'">Hide</button>';
  btns+='<button class="red" data-a="delete" data-k="'+k+'" data-i="'+id+'">Remove</button>'; }
 if(a.id&&a.id!=='gone') btns+='<button class="red" data-a="ban" data-u="'+esc(a.id)+'" data-b="'+(a.banned?'0':'1')+'">'+(a.banned?'Unban':'Ban')+' '+esc(a.name||'user')+'</button>';
 return '<div class="card"><div><span class="pill">'+k+'</span><span class="pill">'+(it.count||0)+' report'+(it.count===1?'':'s')+'</span>'+(it.hidden?'<span class="pill">hidden: '+esc(it.hidden)+'</span>':'')+(it.exists?'':'<span class="pill">deleted</span>')+'</div>'+
  (it.title?'<div class="ttl">'+esc(it.title)+'</div>':'')+(it.body?'<div class="body">'+esc(it.body)+'</div>':'')+
  '<div class="meta">By '+esc(a.name||'—')+(a.banned?' (banned)':'')+(reasons?' · '+esc(reasons):'')+'</div>'+
  ((it.reports||[]).filter(r=>r.note).map(r=>'<div class="meta">“'+esc(r.note)+'”</div>').join(''))+
  '<div class="row">'+btns+'</div></div>'; }
document.addEventListener('click',async(e)=>{ const b=e.target.closest('button[data-a]'); if(!b) return; const a=b.dataset.a;
 const label=b.textContent; if(a==='delete'&&!confirm('Remove this for everyone?')) return; if(a==='ban'&&b.dataset.b==='1'&&!confirm(label+'? They are signed out and can’t post.')) return;
 b.disabled=true; try{ await api('/api/admin/forum/'+a, a==='ban'?{userId:b.dataset.u,banned:b.dataset.b==='1'}:{kind:b.dataset.k,id:b.dataset.i}); await load(); }catch(err){ $('err').textContent=err.message; b.disabled=false; } });
$('go').onclick=async()=>{ pw=$('pw').value.trim(); $('lerr').textContent=''; try{localStorage.setItem('iw-mod',pw)}catch(e){} show(true); await load(); };
$('pw').addEventListener('keydown',(e)=>{ if(e.key==='Enter') $('go').click(); });
$('out').onclick=()=>{ try{localStorage.removeItem('iw-mod')}catch(e){} pw=''; $('pw').value=''; show(false); };
['open','all','msg'].forEach(t=>$('t-'+t).onclick=()=>{tab=t;load()});
if(pw){show(true);load()}else show(false);
</script></body></html>`;
}
