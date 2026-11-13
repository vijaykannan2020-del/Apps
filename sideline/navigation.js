$('#menuToggle').onclick=()=>{const open=$('#sideMenu').classList.toggle('open');$('#menuToggle').setAttribute('aria-expanded',String(open))};
$('#homeServer').onclick=()=>openBridgeSettings();
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#sideMenu').classList.remove('open');$('#menuToggle').setAttribute('aria-expanded','false')}});
document.addEventListener('click',e=>{if(!e.target.closest('#sideMenu, #menuToggle')){$('#sideMenu').classList.remove('open');$('#menuToggle').setAttribute('aria-expanded','false')}});

document.querySelector('nav').onclick=e=>{
 const button=e.target.closest('[data-nav]');
 if(!button)return;
 setNav(button.dataset.nav);
 document.querySelector('main').scrollTop=0;
 document.querySelectorAll('[data-nav]').forEach(b=>{if(b===button)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
};

document.querySelectorAll('[data-content-type]').forEach(button=>button.onclick=()=>{
 $('#libraryType').value=button.dataset.contentType;
 document.querySelectorAll('[data-content-type]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 $('#libraryType').dispatchEvent(new Event('change'));
});
(function(){
 const isTextField=el=>el&&el.matches('input:not([type="checkbox"]):not([type="button"]):not([type="submit"]),textarea');
 const viewport=window.visualViewport;
 let fullHeight=window.innerHeight;
 function updateKeyboard(){
  const focused=isTextField(document.activeElement);
  if(!focused)fullHeight=window.innerHeight;
  const keyboard=focused&&(!viewport||fullHeight-viewport.height>120);
  document.body.classList.toggle('keyboard-open',keyboard);
 }
 document.addEventListener('focusin',()=>{updateKeyboard();setTimeout(updateKeyboard,250)});
 document.addEventListener('focusout',()=>setTimeout(updateKeyboard,150));
 if(viewport)viewport.addEventListener('resize',updateKeyboard);
 window.addEventListener('resize',updateKeyboard);
 $('#librarySearchForm').addEventListener('submit',()=>{if(isTextField(document.activeElement))document.activeElement.blur()});
})();
