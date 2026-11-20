/* СЛОВОПАД — стикеры.
   Свои нарисованные стикеры-человечки (SVG, глаза моргают). Стикер уходит в чат как короткий код вида :s:privet:
   и у всех, у кого есть эта версия, рисуется картинкой. window.SlovopadStickers: list, has, uri, token, parse, label. */
(function () {
  "use strict";
  // id, подпись, цвет (0–360), лицо
  const LIST = [
    ["privet", "ПРИВЕТ", 205, "wave"], ["da", "ДА!", 135, "happy"], ["net", "НЕТ", 8, "stern"], ["haha", "ХА-ХА", 48, "laugh"],
    ["lyublyu", "ЛЮБЛЮ", 335, "love"], ["ok", "ОК", 160, "cool"], ["shok", "ШОК", 280, "shock"], ["plachu", "ПЛАЧУ", 215, "cry"],
    ["zlyus", "ЗЛЮСЬ", 0, "angry"], ["splyu", "СПЛЮ", 250, "sleep"], ["dumayu", "ДУМАЮ", 35, "think"], ["ladno", "ЛАДНО", 95, "wink"],
    ["gg", "GG", 190, "cool"], ["spasibo", "СПАСИБО", 320, "shy"], ["poka", "ПОКА", 25, "wave"], ["ura", "УРА!", 300, "party"],
    ["grust", "ГРУСТНО", 225, "sad"], ["go", "ГО!", 15, "happy"], ["zhdu", "ЖДУ", 175, "think"], ["top", "ТОП", 52, "star"]
  ];
  const INK = "#1b1033";
  const eye = (cx, o) => '<g><ellipse cx="' + cx + '" cy="66" rx="13" ry="13" fill="#fff" stroke="' + INK + '" stroke-width="3"><animate attributeName="ry" values="13;13;1.5;13" keyTimes="0;.92;.96;1" dur="' + (o || 4) + 's" repeatCount="indefinite"/></ellipse><circle cx="' + (cx + 1) + '" cy="68" r="6" fill="' + INK + '"/></g>';
  const arc = (x1, y1, cx, cy, x2, y2, w) => '<path d="M' + x1 + ' ' + y1 + ' Q' + cx + ' ' + cy + ' ' + x2 + ' ' + y2 + '" fill="none" stroke="' + INK + '" stroke-width="' + (w || 5) + '" stroke-linecap="round"/>';
  const heart = (cx, cy, s, col) => '<path transform="translate(' + cx + ' ' + cy + ') scale(' + s + ')" d="M0 8 C-14 -2 -12 -14 -4 -14 C-1 -14 0 -11 0 -9 C0 -11 1 -14 4 -14 C12 -14 14 -2 0 8Z" fill="' + col + '" stroke="' + INK + '" stroke-width="2.4"/>';
  const star = (cx, cy, s) => '<path transform="translate(' + cx + ' ' + cy + ') scale(' + s + ')" d="M0 -14 L4 -4 L15 -4 L6 3 L9 14 L0 7 L-9 14 L-6 3 L-15 -4 L-4 -4Z" fill="#ffd84f" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/>';
  const FACE = {
    happy: () => eye(58) + eye(102) + arc(56, 92, 80, 118, 104, 92),
    laugh: () => arc(46, 66, 58, 54, 70, 66, 5) + arc(90, 66, 102, 54, 114, 66, 5) + '<path d="M52 86 Q80 132 108 86Z" fill="' + INK + '"/><path d="M62 106 Q80 120 98 106 Q80 98 62 106Z" fill="#ff6b81"/>',
    love: () => heart(58, 66, 1.35, "#ff4f7a") + heart(102, 66, 1.35, "#ff4f7a") + arc(60, 94, 80, 114, 100, 94),
    cool: () => '<rect x="38" y="52" width="84" height="26" rx="12" fill="' + INK + '"/><rect x="45" y="56" width="30" height="8" rx="4" fill="#5ef2ff" opacity=".7"/><rect x="85" y="56" width="30" height="8" rx="4" fill="#5ef2ff" opacity=".7"/>' + arc(58, 96, 80, 112, 102, 94),
    shock: () => eye(58, 3) + eye(102, 3) + arc(44, 44, 56, 36, 70, 46, 4) + arc(90, 46, 104, 36, 116, 44, 4) + '<ellipse cx="80" cy="102" rx="11" ry="14" fill="' + INK + '"><animate attributeName="ry" values="14;11;14" dur="1.2s" repeatCount="indefinite"/></ellipse>',
    cry: () => eye(58) + eye(102) + arc(58, 106, 80, 90, 102, 106) + '<path d="M54 80 q-6 14 0 20 q6 -6 0 -20Z" fill="#6ec8ff" stroke="' + INK + '" stroke-width="2"><animateTransform attributeName="transform" type="translate" values="0 0;0 12;0 0" dur="1.4s" repeatCount="indefinite"/></path><path d="M106 80 q-6 14 0 20 q6 -6 0 -20Z" fill="#6ec8ff" stroke="' + INK + '" stroke-width="2"><animateTransform attributeName="transform" type="translate" values="0 0;0 12;0 0" dur="1.4s" begin=".5s" repeatCount="indefinite"/></path>',
    angry: () => eye(58) + eye(102) + arc(40, 44, 54, 52, 72, 58, 6) + arc(120, 44, 106, 52, 88, 58, 6) + arc(58, 106, 80, 90, 102, 106) + '<path d="M70 20 l6 -12 l4 10 l6 -10 l4 12" fill="none" stroke="#ff3b3b" stroke-width="4" stroke-linecap="round"/>',
    sleep: () => arc(46, 68, 58, 78, 70, 68, 5) + arc(90, 68, 102, 78, 114, 68, 5) + '<ellipse cx="80" cy="98" rx="8" ry="6" fill="' + INK + '"/><text x="112" y="40" font-size="22" font-weight="900" fill="' + INK + '" font-family="sans-serif">z<animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/></text><text x="126" y="24" font-size="16" font-weight="900" fill="' + INK + '" font-family="sans-serif">z<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin=".8s" repeatCount="indefinite"/></text>',
    think: () => eye(58) + eye(102) + arc(88, 46, 102, 38, 118, 46, 4) + arc(62, 98, 74, 90, 86, 100, 4) + arc(86, 100, 96, 108, 104, 98, 4) + '<text x="110" y="40" font-size="22" font-weight="900" fill="' + INK + '" font-family="sans-serif">?<animate attributeName="y" values="40;34;40" dur="1.6s" repeatCount="indefinite"/></text>',
    wink: () => eye(58) + arc(90, 66, 102, 56, 114, 66, 5) + arc(54, 92, 80, 118, 108, 88),
    stern: () => eye(58) + eye(102) + arc(42, 50, 56, 50, 72, 54, 5) + arc(118, 50, 104, 50, 88, 54, 5) + arc(62, 102, 80, 100, 98, 102, 5),
    shy: () => eye(58) + eye(102) + '<ellipse cx="42" cy="86" rx="10" ry="6" fill="#ff7aa8" opacity=".75"/><ellipse cx="118" cy="86" rx="10" ry="6" fill="#ff7aa8" opacity=".75"/>' + arc(66, 96, 80, 106, 94, 96),
    sad: () => eye(58) + eye(102) + arc(40, 54, 52, 46, 72, 50, 4) + arc(120, 54, 108, 46, 88, 50, 4) + arc(58, 106, 80, 88, 102, 106),
    star: () => star(58, 66, 1.3) + star(102, 66, 1.3) + arc(54, 90, 80, 120, 106, 90),
    party: () => eye(58) + eye(102) + arc(56, 92, 80, 118, 104, 92) + '<path d="M56 24 L80 -12 L104 24Z" fill="#ff4fd8" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/><circle cx="80" cy="-12" r="6" fill="#ffd84f" stroke="' + INK + '" stroke-width="2"/><circle cx="20" cy="30" r="4" fill="#ffd84f"><animate attributeName="cy" values="30;38;30" dur="1.2s" repeatCount="indefinite"/></circle><circle cx="142" cy="40" r="4" fill="#5ef2ff"><animate attributeName="cy" values="40;32;40" dur="1.4s" repeatCount="indefinite"/></circle><rect x="130" y="64" width="8" height="4" fill="#8cff6a" transform="rotate(30 134 66)"/>',
    wave: () => eye(58) + eye(102) + arc(56, 92, 80, 118, 104, 92) + '<g><ellipse cx="146" cy="74" rx="11" ry="16" fill="#ffd9a8" stroke="' + INK + '" stroke-width="3"/><animateTransform attributeName="transform" type="rotate" values="-14 142 96;14 142 96;-14 142 96" dur=".9s" repeatCount="indefinite"/></g>'
  };
  function svg(it) {
    const [, cap, hue, face] = it, h2 = (hue + 28) % 360, fs = cap.length > 6 ? 15 : cap.length > 4 ? 18 : 22;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -22 172 190" width="172" height="190">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(' + hue + ' 90% 70%)"/><stop offset="1" stop-color="hsl(' + h2 + ' 82% 52%)"/></linearGradient></defs>' +
      '<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="2.6s" repeatCount="indefinite"/>' +
      '<rect x="18" y="14" width="124" height="108" rx="46" fill="#fff" stroke="#fff" stroke-width="14" stroke-linejoin="round"/>' +
      '<rect x="18" y="14" width="124" height="108" rx="46" fill="url(#g)" stroke="' + INK + '" stroke-width="4"/>' +
      '<ellipse cx="52" cy="30" rx="22" ry="8" fill="#fff" opacity=".35" transform="rotate(-16 52 30)"/>' +
      (FACE[face] || FACE.happy)() +
      '<rect x="12" y="124" width="136" height="32" rx="16" fill="#fff" stroke="' + INK + '" stroke-width="3.5"/>' +
      '<text x="80" y="146" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="' + fs + '" fill="' + INK + '">' + cap + '</text></g></svg>';
  }
  const cache = {}, byId = {}; LIST.forEach(x => { byId[x[0]] = x });
  window.SlovopadStickers = {
    list: LIST.map(x => ({ id: x[0], cap: x[1] })),
    has: id => !!byId[id],
    uri: id => { if (!byId[id]) return ""; return cache[id] || (cache[id] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg(byId[id]))) },
    token: id => ":s:" + id + ":",
    parse: body => { const m = /^:s:([a-z0-9-]{1,24}):$/.exec(String(body || "").trim()); return m ? m[1] : "" },
    label: body => { const id = window.SlovopadStickers.parse(body); return id && byId[id] ? "🖼 " + byId[id][1] : "" }
  };
})();
