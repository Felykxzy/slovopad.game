/* Кнопка «на весь экран»: прячет рамки браузера сверху и снизу */
(function(){
  var tg=window.Telegram&&Telegram.WebApp,de=document.documentElement;
  var standalone=(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone;
  var can=!!(de.requestFullscreen||de.webkitRequestFullscreen);
  var tgFs=!!(tg&&tg.requestFullscreen&&parseFloat(tg.version||"0")>=8);
  var menu=document.getElementById("o1");
  if(!menu||standalone||(!can&&!tgFs))return;
  var b=document.createElement("button");
  b.className="ib fsb";b.id="fsB";b.setAttribute("aria-label","На весь экран");b.title="На весь экран";
  menu.appendChild(b);
  function on(){
    if(tgFs)return !!tg.isFullscreen;
    return !!(document.fullscreenElement||document.webkitFullscreenElement);
  }
  function paint(){b.textContent=on()?"🗗":"⛶";b.title=on()?"Выйти из полного экрана":"На весь экран"}
  b.onclick=function(){
    try{
      if(tgFs){on()?tg.exitFullscreen():tg.requestFullscreen()}
      else if(on()){(document.exitFullscreen||document.webkitExitFullscreen).call(document)}
      else{var r=(de.requestFullscreen||de.webkitRequestFullscreen).call(de);if(r&&r.catch)r.catch(function(){})}
    }catch(e){}
    setTimeout(paint,150);
  };
  ["fullscreenchange","webkitfullscreenchange"].forEach(function(e){document.addEventListener(e,paint)});
  try{if(tgFs)tg.onEvent("fullscreenChanged",paint)}catch(e){}
  paint();
})();
