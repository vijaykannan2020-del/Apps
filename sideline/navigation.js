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
