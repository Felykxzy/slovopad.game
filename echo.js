/* СЛОВОПАД — «Эхо»: мессенджер игры.
   Главный экран Эха: личные чаты с друзьями, комнаты на несколько человек, ИИ-помощник (echo-ai.js), уведомления.
   Подключается после friends.js. Использует: cloudRequest, sidTok, sidOpen, ov, L3, SlovopadFriends. */
(function () {
  "use strict";
  const T = (a, b, c) => L3(a, b, c);
  const g = id => document.getElementById(id);
  const E = { rooms: [], friends: [], room: null, last: 0, timer: 0, hub: 0, busy: false, tg: null, sure: 0, panel: "" };
  function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function btn(cls, text, fn) { const b = h("button", cls, text); b.type = "button"; b.onclick = fn; return b; }
  const post = (path, body) => cloudRequest(path, { method: "POST", body: JSON.stringify(body || {}) });
  const clock = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") };
  const tgData = () => { try { return (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) || "" } catch (e) { return "" } };
  const setHint = (id, msg, bad) => { const e = g(id); if (e) { e.textContent = msg || ""; e.classList.toggle("bad", !!bad) } };

  /* ---------- каркас ---------- */
  function build() {
    if (g("o16")) return;
    const hub = h("div", "ov sc"); hub.id = "o16";
    hub.innerHTML = '<div class="ech" id="ecH16"></div>' +
      '<div class="ecset gl" id="ecSetP" hidden></div>' +
      '<div class="frlist" id="ecList"></div><div class="hint" id="ecSt"></div>' +
      '<div class="mb" id="ecNew" hidden><button class="btn" id="ecMk" type="button"></button></div>';
    const rm = h("div", "ov"); rm.id = "o17";
    rm.innerHTML = '<div class="frh"><button class="ib" id="rmBk" type="button">←</button><div class="frt"><h2 id="rmT"></h2><div class="sub" id="rmS"></div></div><button class="ib" id="rmMn" type="button">⋯</button></div>' +
      '<div class="chmenu" id="rmMenu" hidden></div>' +
      '<div class="chl" id="rmL"></div><div class="hint" id="rmSt"></div>' +
      '<div class="chbar"><input id="rmIn" type="text" maxlength="120" autocomplete="off" enterkeyhint="send"><button class="btn chsn" id="rmSn" type="button">➤</button></div>';
    const after = g("o15") || g("o11");
    after.parentNode.insertBefore(hub, after.nextSibling); hub.parentNode.insertBefore(rm, hub.nextSibling);
    const o13 = g("o13"); if (o13 && !g("ecH13")) { const d = h("div", "ech"); d.id = "ecH13"; o13.insertBefore(d, o13.firstChild) }
    g("ecMk").onclick = mkRoom;
    g("rmBk").onclick = roomClose;
    g("rmSn").onclick = roomSend;
    g("rmIn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); roomSend() } });
    g("rmMn").onclick = () => { const m = g("rmMenu"); if (m.hidden) { E.sure = 0; E.panel = ""; menuPaint() } m.hidden = !m.hidden };
    if (window.visualViewport) {
      const fit = () => { const o = g("o17"); if (!o || !o.classList.contains("s")) return; const v = window.visualViewport; o.style.height = v.height + "px"; o.style.transform = "translateY(" + v.offsetTop + "px)"; const l = g("rmL"); l.scrollTop = l.scrollHeight };
      window.visualViewport.addEventListener("resize", fit); window.visualViewport.addEventListener("scroll", fit);
    }
  }

  /* ---------- главный экран ---------- */
  function badgeOf() { const F = window.SlovopadFriends, bg = F && F.badges ? F.badges() : { r: 0, c: 0, m: 0, k: 0 }; return { chats: (bg.m || 0) + (bg.k || 0), friends: (bg.r || 0) + (bg.c || 0) } }
  // общая шапка Эха: на экране чатов и на экране друзей выглядит одинаково
  function paintHead(box, active) {
    if (!box) return; box.textContent = "";
    const top = h("div", "frh");
    top.appendChild(btn("ib", "←", () => { clearInterval(E.hub); E.hub = 0; ov("o1") }));
    const t = h("div", "frt"); t.appendChild(h("h2", "", "🌀 " + T("ЭХО", "ECHO", "ЕХО"))); t.appendChild(h("div", "sub", T("ЧАТЫ · ДРУЗЬЯ · ИИ", "CHATS · FRIENDS · AI", "ЧАТИ · ДРУЗІ · ШІ"))); top.appendChild(t);
    top.appendChild(btn("ib", "🔔", () => { E.panel = active === 0 && E.panel === "tg" ? "" : "tg"; if (active !== 0) hubOpen(); else paintSet(); if (E.panel) loadTg() }));
    box.appendChild(top);
    const bd = badgeOf(), tabs = h("div", "frtabs");
    [["💬 " + T("ЧАТЫ", "CHATS", "ЧАТИ"), bd.chats, () => hubOpen()], ["👥 " + T("ДРУЗЬЯ", "FRIENDS", "ДРУЗІ"), bd.friends, () => { const F = window.SlovopadFriends; if (F) F.open() }]].forEach((x, i) => {
      const b = h("button", "frtab" + (active === i ? " a" : ""), x[0]); b.type = "button";
      if (x[1]) b.appendChild(h("i", "bdg", x[1] > 9 ? "9+" : String(x[1])));
      b.onclick = x[2]; tabs.appendChild(b);
    });
    box.appendChild(tabs);
  }
  function labels() {
    paintHead(g("ecH16"), 0); paintHead(g("ecH13"), 1);
    g("ecMk").textContent = "＋ " + T("НОВАЯ КОМНАТА", "NEW ROOM", "НОВА КІМНАТА");
    g("ecNew").hidden = !sidTok();
  }
  function avatar(txt, on) { const a = h("div", "fav" + (on ? " on" : ""), txt); a.style.width = a.style.height = "44px"; a.style.fontSize = "22px"; return a }
  function section(l, text) { l.appendChild(h("div", "ecsec", text)) }
  function badgeEl(n) { return h("i", "bdg ecb", n > 9 ? "9+" : String(n)) }
  function paint() {
    const l = g("ecList"); l.textContent = "";
    // ИИ-помощник всегда сверху, работает и без аккаунта
    const ai = h("button", "ecrow ecai2"); ai.type = "button"; ai.appendChild(avatar("🤖", false));
    const at = h("div", "ect"); at.appendChild(h("b", "", T("ИИ-ПОМОЩНИК", "AI ASSISTANT", "ШІ-ПОМІЧНИК"))); at.appendChild(h("span", "", T("Свой ключ · выбор модели", "Your own key · pick a model", "Свій ключ · вибір моделі"))); ai.appendChild(at);
    ai.onclick = () => { if (window.EchoAI) window.EchoAI.open(hubOpen) }; l.appendChild(ai);
    if (!sidTok()) { l.appendChild(h("div", "chem", T("Чтобы писать друзьям и создавать комнаты, нужен аккаунт.", "You need an account to message friends and make rooms.", "Потрібен акаунт, щоб писати друзям і створювати кімнати."))); l.appendChild(btn("btn", T("ВОЙТИ В АККАУНТ", "SIGN IN", "УВІЙТИ В АКАУНТ"), () => sidOpen())); return }
    section(l, T("КОМНАТЫ", "ROOMS", "КІМНАТИ"));
    if (!E.rooms.length) l.appendChild(h("div", "ecdim ecnone", T("Комнат пока нет. Создай свою кнопкой внизу и позови друзей.", "No rooms yet. Make one with the button below and invite friends.", "Кімнат поки немає. Створи свою кнопкою внизу й поклич друзів.")));
    E.rooms.forEach(rm => {
      const r = h("button", "ecrow"); r.type = "button"; r.appendChild(avatar("#", false));
      const t = h("div", "ect"); t.appendChild(h("b", "", rm.name)); t.appendChild(h("span", "", rm.last || "👥 " + rm.members)); r.appendChild(t);
      if (rm.unread) r.appendChild(badgeEl(rm.unread));
      r.onclick = () => roomOpen(rm.id, rm.name); l.appendChild(r);
    });
    section(l, T("ЛИЧНЫЕ", "DIRECT", "ОСОБИСТІ"));
    if (!E.friends.length) {
      l.appendChild(h("div", "ecdim ecnone", T("Здесь будут чаты с друзьями. Сначала добавь друга.", "Chats with friends will appear here. Add a friend first.", "Тут будуть чати з друзями. Спершу додай друга.")));
      l.appendChild(btn("btn a", "👥 " + T("ДОБАВИТЬ ДРУГА", "ADD A FRIEND", "ДОДАТИ ДРУГА"), () => { const F = window.SlovopadFriends; if (F) F.open() }));
    }
    E.friends.slice().sort((a, b) => (b.unread || 0) - (a.unread || 0) || (b.online ? 1 : 0) - (a.online ? 1 : 0)).forEach(f => {
      const r = h("button", "ecrow"); r.type = "button";
      r.appendChild(avatar(f.avatar || (f.username || "?").charAt(0).toUpperCase(), f.online));
      const t = h("div", "ect"); t.appendChild(h("b", "", f.username)); t.appendChild(h("span", "", f.online ? T("в сети", "online", "у мережі") : T("не в сети", "offline", "не в мережі"))); r.appendChild(t);
      if (f.unread) r.appendChild(badgeEl(f.unread));
      r.onclick = () => { const F = window.SlovopadFriends; if (F && F.chatOpen) { F.setBack(hubOpen); F.chatOpen(f) } };
      l.appendChild(r);
    });
  }
  async function refresh() {
    if (!sidTok()) { labels(); paint(); return }
    try {
      const [f, r] = await Promise.all([cloudRequest("/api/friends"), cloudRequest("/api/echo/rooms")]);
      E.friends = f.friends || []; E.rooms = r.rooms || []; setHint("ecSt", "");
    } catch (e) { setHint("ecSt", (e && e.message) || T("Нет связи с сервером.", "Can't reach the server.", "Немає зв'язку з сервером."), true) }
    labels(); paint();
  }
  function hubOpen() {
    build(); paintSet(); labels(); paint(); ov("o16");
    refresh(); clearInterval(E.hub);
    E.hub = setInterval(() => { if (!g("o16").classList.contains("s") || document.hidden) return; refresh() }, 20000);
  }
  async function mkRoom() {
    const name = prompt(T("Название комнаты (до 24 символов)", "Room name (up to 24 chars)", "Назва кімнати (до 24 символів)"), "");
    if (!name || !name.trim()) return;
    try { const r = await post("/api/echo/room", { name: name.trim() }); await refresh(); roomOpen(r.id, r.name) } catch (e) { setHint("ecSt", e.message, true) }
  }

  /* ---------- уведомления ---------- */
  function paintSet() {
    const p = g("ecSetP"); p.hidden = !E.panel; if (!E.panel) return;
    p.textContent = "";
    p.appendChild(h("b", "", T("Уведомления", "Notifications", "Сповіщення")));
    p.appendChild(h("span", "", T("Красная цифра на кнопке ЭХО показывает новые сообщения. Если открыть игру из Telegram, бот ещё и пришлёт сообщение, когда тебе напишут или позовут в комнату (без самого текста).", "The red number on the ECHO button shows new messages. If you open the game from Telegram, the bot also pings you when someone writes or invites you to a room (without the message text).", "Червона цифра на кнопці ЕХО показує нові повідомлення. Якщо відкрити гру з Telegram, бот ще й надішле сповіщення, коли тобі напишуть або запросять до кімнати (без самого тексту).")));
    if (!sidTok()) return;
    if (!tgData()) { p.appendChild(h("span", "ecdim", T("Сейчас игра открыта не из Telegram, поэтому Telegram-уведомления недоступны.", "The game isn't opened from Telegram right now, so Telegram alerts are unavailable.", "Зараз гру відкрито не з Telegram, тому сповіщення Telegram недоступні."))); return }
    if (!E.tg) { p.appendChild(h("span", "ecdim", "…")); return }
    if (!E.tg.available) { p.appendChild(h("span", "ecdim", T("Автор ещё не включил Telegram-уведомления на сервере.", "The author hasn't enabled Telegram alerts on the server yet.", "Автор ще не ввімкнув сповіщення Telegram на сервері."))); return }
    p.appendChild(btn("btn" + (E.tg.linked ? " a" : ""), E.tg.linked ? T("ВЫКЛЮЧИТЬ TELEGRAM-УВЕДОМЛЕНИЯ", "TURN OFF TELEGRAM ALERTS", "ВИМКНУТИ СПОВІЩЕННЯ TELEGRAM") : T("ВКЛЮЧИТЬ TELEGRAM-УВЕДОМЛЕНИЯ", "TURN ON TELEGRAM ALERTS", "УВІМКНУТИ СПОВІЩЕННЯ TELEGRAM"), tgToggle));
  }
  async function loadTg() { if (!sidTok()) return; try { E.tg = await cloudRequest("/api/tg") } catch (e) { E.tg = { available: false, linked: false } } paintSet() }
  async function tgToggle() {
    try {
      if (E.tg.linked) { await post("/api/tg/link", { off: true }); E.tg.linked = false }
      else {
        try { if (Telegram.WebApp.requestWriteAccess) Telegram.WebApp.requestWriteAccess() } catch (e) { }
        await post("/api/tg/link", { initData: tgData() }); E.tg.linked = true
      }
    } catch (e) { setHint("ecSt", e.message, true) }
    paintSet();
  }

  /* ---------- комната ---------- */
  function roomOpen(id, name) {
    build(); E.room = { id, name: name || "", mine: false, members: [] }; E.last = 0; E.sure = 0;
    g("rmL").textContent = ""; g("rmSt").textContent = ""; g("rmMenu").hidden = true; g("rmIn").value = "";
    g("rmIn").placeholder = T("Сообщение…", "Message…", "Повідомлення…");
    g("rmT").textContent = E.room.name; g("rmS").textContent = " ";
    ov("o17"); const o = g("o17"), v = window.visualViewport; if (v) { o.style.height = v.height + "px"; o.style.transform = "translateY(" + v.offsetTop + "px)" }
    roomPoll(true); clearInterval(E.timer); E.timer = setInterval(() => roomPoll(false), 6000);
  }
  function roomClose() {
    clearInterval(E.timer); E.timer = 0; E.room = null;
    const o = g("o17"); o.style.height = ""; o.style.transform = ""; g("rmIn").blur();
    hubOpen();
  }
  function roomAdd(m) {
    const box = h("div", "chm" + (m.mine ? " me" : ""));
    if (!m.mine) box.appendChild(h("i", "chw", m.who));
    box.appendChild(h("span", "chb", m.body)); box.appendChild(h("i", "cht", clock(m.t)));
    g("rmL").appendChild(box);
  }
  async function roomPoll(first) {
    const rm = E.room; if (!rm) return;
    if (!g("o17").classList.contains("s")) { clearInterval(E.timer); E.timer = 0; E.room = null; return }
    if (E.busy || document.hidden) return;
    E.busy = true;
    try {
      const r = await cloudRequest("/api/echo/room/msgs?room=" + encodeURIComponent(rm.id) + "&after=" + E.last);
      if (E.room !== rm) return;
      rm.name = r.room.name; rm.mine = r.room.mine; rm.members = r.members;
      g("rmT").textContent = rm.name; g("rmS").textContent = "👥 " + r.members.length;
      const l = g("rmL"), stick = first || l.scrollHeight - l.scrollTop - l.clientHeight < 80;
      r.messages.forEach(m => { E.last = Math.max(E.last, m.id); roomAdd(m) });
      if (!l.children.length) l.appendChild(h("div", "chem", T("Здесь пока тихо. Напиши первым 👋", "It's quiet here. Write first 👋", "Тут поки тихо. Напиши першим 👋")));
      else if (r.messages.length && l.querySelector(".chem")) l.querySelector(".chem").remove();
      if (stick) l.scrollTop = l.scrollHeight;
      setHint("rmSt", "");
    } catch (e) {
      if (/состоишь|не найден|not found/i.test((e && e.message) || "")) { roomClose(); return }
      setHint("rmSt", (e && e.message) || "", true);
    } finally { E.busy = false }
  }
  async function roomSend() {
    const rm = E.room, inp = g("rmIn"), text = inp.value.trim(); if (!rm || !text) return;
    inp.value = ""; inp.focus();
    try { await post("/api/echo/room/send", { room: rm.id, text }); E.busy = false; roomPoll(false) } catch (e) { inp.value = text; setHint("rmSt", e.message, true) }
  }

  /* меню комнаты */
  function menuPaint() {
    const m = g("rmMenu"), rm = E.room; if (!rm) return; m.textContent = "";
    if (E.panel === "inv") {
      const have = new Set((rm.members || []).map(x => x.name.toLowerCase()));
      const list = E.friends.filter(f => !have.has((f.username || "").toLowerCase()));
      if (!list.length) m.appendChild(h("div", "ecdim", T("Все твои друзья уже здесь (или друзей пока нет).", "All your friends are already here (or you have none yet).", "Усі твої друзі вже тут (або друзів ще немає).")));
      list.forEach(f => m.appendChild(btn("btn a", "＋ " + f.username, async () => {
        try { await post("/api/echo/room/invite", { room: rm.id, code: f.spCode }); setHint("rmSt", T("Приглашение отправлено: ", "Invited: ", "Запрошення надіслано: ") + f.username); E.panel = ""; roomPoll(false); m.hidden = true } catch (e) { setHint("rmSt", e.message, true) }
      })));
      m.appendChild(btn("btn a", "←", () => { E.panel = ""; menuPaint() })); return;
    }
    if (E.panel === "mem") {
      (rm.members || []).forEach(x => {
        const r = h("div", "ecmem"); r.appendChild(h("span", "", (x.owner ? "👑 " : "") + x.name + (x.me ? " ✓" : "")));
        if (rm.mine && !x.me) r.appendChild(btn("ecx", "✕", async () => { try { await post("/api/echo/room/kick", { room: rm.id, code: x.name }); roomPoll(false); E.panel = ""; m.hidden = true } catch (e) { setHint("rmSt", e.message, true) } }));
        m.appendChild(r);
      });
      m.appendChild(btn("btn a", "←", () => { E.panel = ""; menuPaint() })); return;
    }
    m.appendChild(btn("btn a", "＋ " + T("ПРИГЛАСИТЬ ДРУГА", "INVITE A FRIEND", "ЗАПРОСИТИ ДРУГА"), () => { E.panel = "inv"; menuPaint() }));
    m.appendChild(btn("btn a", "👥 " + T("УЧАСТНИКИ", "MEMBERS", "УЧАСНИКИ"), () => { E.panel = "mem"; menuPaint() }));
    m.appendChild(btn("btn a", E.sure === 1 ? T("ТОЧНО ПОЖАЛОВАТЬСЯ?", "REALLY REPORT?", "ТОЧНО СКАРЖИТИСЬ?") : T("ПОЖАЛОВАТЬСЯ", "REPORT", "СКАРЖИТИСЬ"), async () => {
      if (E.sure !== 1) { E.sure = 1; menuPaint(); return }
      try { await post("/api/echo/room/report", { room: rm.id }); setHint("rmSt", T("Жалоба отправлена.", "Report sent.", "Скаргу надіслано.")) } catch (e) { setHint("rmSt", e.message, true) }
      E.sure = 0; m.hidden = true;
    }));
    m.appendChild(btn("btn a", E.sure === 2 ? T("ТОЧНО ВЫЙТИ?", "REALLY LEAVE?", "ТОЧНО ВИЙТИ?") : T("ВЫЙТИ ИЗ КОМНАТЫ", "LEAVE ROOM", "ВИЙТИ З КІМНАТИ"), async () => {
      if (E.sure !== 2) { E.sure = 2; menuPaint(); return }
      try { await post("/api/echo/room/leave", { room: rm.id }); roomClose() } catch (e) { setHint("rmSt", e.message, true) }
    }));
  }

  /* ---------- кнопка в меню ---------- */
  function wireMenuBtn() {
    const b = g("echoB"); if (!b) return;
    b.firstChild.nodeType === 3 && (b.firstChild.textContent = "🌀 " + T("ЭХО", "ECHO", "ЕХО"));
    b.onclick = hubOpen;
  }
  build(); wireMenuBtn();
  window.SlovopadEcho = { open: hubOpen, relabel: wireMenuBtn, badge: () => { labels() } };
  const _menu = window.menu;
  if (typeof _menu === "function") window.menu = function () { const r = _menu.apply(this, arguments); try { wireMenuBtn() } catch (e) { } return r };
})();
