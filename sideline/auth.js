/* Sideline v3: shared Cinema Book Firebase authentication. */
(function(){
'use strict';
const q=s=>document.querySelector(s);
const gate=q('#authGate'),form=q('#sidelineLogin'),message=q('#authMessage'),submit=q('#authSubmit');
let auth,db,booted=false,activeUid=null,generation=0;
const status=(text,error=false)=>{message.textContent=text;message.classList.toggle('auth-error',error)};
function clearServerKey(){try{sessionStorage.removeItem('sideline-bridge-key')}catch{}}
function showGate(){document.body.classList.add('auth-locked');gate.hidden=false;document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function scopeStorage(uid){
 // Adopt legacy settings only for the first account to sign in on this browser.
 const keys=['sideline-favorites','sideline-sources','sideline-reminders','sideline-region','sideline-providers','sideline-bridge-url'];
 window.sidelineStorageKey=key=>'sideline-user:'+uid+':'+key;
 try{
  const owner=localStorage.getItem('sideline-legacy-owner');
  if(!owner||owner===uid){
   localStorage.setItem('sideline-legacy-owner',uid);
   for(const key of keys){const value=localStorage.getItem(key);if(value!==null){if(localStorage.getItem(window.sidelineStorageKey(key))===null)localStorage.setItem(window.sidelineStorageKey(key),value);localStorage.removeItem(key)}}
  }
 }catch{}
}
function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src+'?v=6';script.onload=resolve;script.onerror=()=>reject(new Error('app-load'));document.body.appendChild(script)})}
form.onsubmit=async e=>{
 e.preventDefault();if(!auth)return;submit.disabled=true;status('Signing in…');
 try{await auth.signInWithEmailAndPassword(q('#authEmail').value.trim(),q('#authPassword').value);q('#authPassword').value=''}
 catch(error){status(error.code==='auth/network-request-failed'?'Unable to connect. Check your internet and try again.':error.code==='auth/too-many-requests'?'Too many attempts. Wait a little before trying again.':'Unable to sign in. Check your Cinema Book email and password.',true)}
 finally{submit.disabled=false}
};
q('#authReload').onclick=()=>location.reload();
q('#authSwitch').onclick=async()=>{if(auth){clearServerKey();await auth.signOut()}};
q('#sidelineSignOut').onclick=async()=>{
 if(!auth)return;
 try{clearServerKey();await auth.signOut()}catch{q('#accountStatus').textContent='Sign-out failed. Check your connection and retry.'}
};
try{
 if(!window.firebase?.auth||!window.firebase?.firestore)throw new Error('sdk');
 const app=firebase.apps.length?firebase.app():firebase.initializeApp({"apiKey":"AIzaSyAxCgkTuz8RS93U9mwb6bqjBgvARM69DYY","authDomain":"my-apps-1ed9e.firebaseapp.com","projectId":"my-apps-1ed9e","storageBucket":"my-apps-1ed9e.firebasestorage.app","messagingSenderId":"253592763233","appId":"1:253592763233:web:2edd357a442c0e0c42a320"});
 auth=app.auth();db=app.firestore();
 auth.onAuthStateChanged(async user=>{
  const turn=++generation;
  if(booted||activeUid){clearServerKey();showGate();location.reload();return}
  showGate();q('#authSwitch').hidden=!user;
  if(!user){activeUid=null;status('Use the same email and password as Cinema Book.');form.hidden=false;submit.disabled=false;return}
  form.hidden=true;status('Checking your account…');
  try{
   // Reuse Cinema Book's existing Firestore access rules. Read profile only; no diary writes.
   await db.doc('apps/cinemabook/users/'+user.uid).get({source:'server'});
   if(turn!==generation)return;
   if(activeUid&&activeUid!==user.uid)clearServerKey();
   activeUid=user.uid;scopeStorage(user.uid);
   q('#accountStatus').textContent='Signed in as '+(user.email||'your Cinema Book account')+'. Settings are saved on this browser.';
   status('Opening Sideline…');
   for(const src of ['directory.js','adaptive.js','app.js','providers.js','bridge.js','navigation.js']){await loadScript(src);if(turn!==generation)return}
   booted=true;gate.hidden=true;document.body.classList.remove('auth-locked');
  }catch(error){
   if(turn!==generation)return;
   showGate();form.hidden=true;q('#authReload').hidden=false;
   status(error.code==='permission-denied'?'This account does not have access through the existing Cinema Book permissions. Sign in with an approved account.':error.message==='app-load'?'An app file could not load. Reload to try again.':'Could not verify your account. Check your connection and reload.',true);
  }
 },()=>status('Unable to restore sign-in. Reload to try again.',true));
}catch{status('Firebase could not load. Check your connection, then reload.',true);q('#authReload').hidden=false;form.hidden=true}
})();