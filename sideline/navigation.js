$('#menuToggle').onclick=()=>{const open=$('#sideMenu').classList.toggle('open');$('#menuToggle').setAttribute('aria-expanded',String(open))};
$('#homeServer').onclick=()=>openBridgeSettings();
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#sideMenu').classList.remove('open');$('#menuToggle').setAttribute('aria-expanded','false')}});
document.addEventListener('click',e=>{if(!e.target.closest('#sideMenu, #menuToggle')){$('#sideMenu').classList.remove('open');$('#menuToggle').setAttribute('aria-expanded','false')}});
