/* Свои иконки СЛОВОПАДА: линейные, в одном стиле. Используются вместо эмодзи в Эхо и звонке.
   В тексте иконку можно вставить так: "{mic} Микрофон". */
(function () {
  "use strict";
  var P = {
    echo: '<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
    people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17.2" cy="9" r="2.4"/><path d="M17.6 13.9c2.4.3 4.4 1.9 4.4 4.6"/>',
    bot: '<rect x="4" y="8" width="16" height="11" rx="3.5"/><path d="M12 8V5.5"/><circle cx="12" cy="4.3" r="1.1"/><circle cx="9" cy="13" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1.1" fill="currentColor" stroke="none"/><path d="M9.5 16.2h5M2.5 12.5v2M21.5 12.5v2"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    send: '<path d="M21 3L10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5z"/>',
    phone: '<path d="M5.2 3.5h3.3l1.8 4.6-2.3 1.5a11.5 11.5 0 0 0 5.4 5.4l1.5-2.3 4.6 1.8v3.3a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 3.2 5.6a2 2 0 0 1 2-2.1z"/>',
    hangup: '<g transform="rotate(135 12 12)"><path d="M5.2 3.5h3.3l1.8 4.6-2.3 1.5a11.5 11.5 0 0 0 5.4 5.4l1.5-2.3 4.6 1.8v3.3a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 3.2 5.6a2 2 0 0 1 2-2.1z"/></g>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',
    "mic-off": '<path d="M9 9V6a3 3 0 0 1 5.6-1.5M15 10v1a3 3 0 0 1-4.7 2.5"/><path d="M5.5 11a6.5 6.5 0 0 0 10.3 5.3M18.5 11a6.4 6.4 0 0 1-.5 2.5M12 17.5V21M9 21h6M4 4l16 16"/>',
    cam: '<rect x="3" y="6.5" width="13" height="11" rx="2.6"/><path d="M16 11l5-3v8l-5-3z"/>',
    "cam-off": '<path d="M7.5 6.5H13a3 3 0 0 1 3 3v6M16 11l5-3v8l-3-1.8M3 9.5v5a3 3 0 0 0 3 3h7M4 4l16 16"/>',
    flip: '<path d="M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4"/>',
    speaker: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/>',
    flag: '<path d="M5 21V4M5 4.5h11.5l-2.2 3.8 2.2 3.7H5"/>',
    crown: '<path d="M3.5 8l4.6 4.2L12 5l3.9 7.2L20.5 8 19 18.5H5z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    hash: '<path d="M9.5 4L7.5 20M16.5 4l-2 16M4 9h16.5M3.5 15H20"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    dots: '<circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    reply: '<path d="M10 6L4 12l6 6"/><path d="M4 12h9a7 7 0 0 1 7 7"/>',
    chart: '<path d="M5 20v-9M12 20V4M19 20v-6"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    letters: '<path d="M2.5 18L7.5 6l5 12M4.5 14h6"/><path d="M18 12.2a3 3 0 1 0 0 5.6 3 3 0 0 0 0-5.6zM21 12v6"/>',
    idea: '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/>',
    swords: '<path d="M5 19l9-9M14 4h6v6l-9 9-3 .8.8-3zM19 19l-9-9M10 4H4v6"/>',
    smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 0 0 7 0"/><circle cx="9.3" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10" r=".9" fill="currentColor" stroke="none"/>',
    signal: '<path d="M5 19v-3M10 19v-6M15 19V9M20 19V5"/>'
  };
  function svg(name, cls) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ic" + (cls ? " " + cls : "")); s.setAttribute("aria-hidden", "true");
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.9"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    s.innerHTML = P[name] || ""; return s;
  }
  /* кладёт в элемент текст, где {имя} превращается в иконку */
  function t(el, str) {
    el.textContent = "";
    String(str).split(/(\{[a-z0-9-]+\})/).forEach(function (part) {
      var m = /^\{([a-z0-9-]+)\}$/.exec(part);
      if (m && P[m[1]]) el.appendChild(svg(m[1])); else if (part) el.appendChild(document.createTextNode(part));
    });
    return el;
  }
  function html(name, cls) { return svg(name, cls).outerHTML }
  window.IC = { svg: svg, t: t, html: html, has: function (n) { return !!P[n]; } };
})();
