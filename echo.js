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

  /* ---------- каркас: слева «орбиты» (рейка), справа панель ---------- */
  const hue = s => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 360; return x };
  const tint = s => "linear-gradient(135deg,hsl(" + hue(s) + " 85% 60%),hsl(" + ((hue(s) + 55) % 360) + " 80% 42%))";
  const first = s => ([...String(s || "?")][0] || "?").toUpperCase();
  function build() {
    if (g("o16")) return;
    const hub = h("div", "ov"); hub.id = "o16";
    hub.innerHTML = '<div class="ecw"><nav class="ecrail" id="ecR16"></nav><section class="ecpan"><div class="ecph" id="ecP16"></div>' +
      '<div class="ecset gl" id="ecSetP" hidden></div><div class="frlist" id="ecList"></div><div class="hint" id="ecSt"></div></section></div>';
    const rm = h("div", "ov"); rm.id = "o17";
    rm.innerHTML = '<div class="frh ecrh"><button class="ib" id="rmBk" type="button">←</button><div class="frt"><h2 id="rmT"></h2><div class="sub" id="rmS"></div></div><button class="ib" id="rmMn" type="button">⋯</button></div>' +
      '<div class="chmenu" id="rmMenu" hidden></div>' +
      '<div class="chl ecfeed" id="rmL"></div><div class="hint" id="rmSt"></div>' +
      '<div class="chbar"><input id="rmIn" type="text" maxlength="120" autocomplete="off" enterkeyhint="send"><button class="btn chsn" id="rmSn" type="button">➤</button></div>';
    const after = g("o15") || g("o11");
    after.parentNode.insertBefore(hub, after.nextSibling); hub.parentNode.insertBefore(rm, hub.nextSibling);
    // экран друзей встраиваем в ту же рамку: рейка слева, его содержимое справа
    const o13 = g("o13");
    if (o13 && !g("ecR13")) {
      const wrap = h("div", "ecw"), pan = h("section", "ecpan"), ph = h("div", "ecph"); ph.id = "ecP13";
      const rail = h("nav", "ecrail"); rail.id = "ecR13";
      while (o13.firstChild) pan.appendChild(o13.firstChild);
      pan.insertBefore(ph, pan.firstChild); wrap.appendChild(rail); wrap.appendChild(pan); o13.appendChild(wrap);
    }
    // анимации входа; переход «Чаты ⇄ Друзья» делаем мгновенным (рейка остаётся на месте), иначе экраны дёргаются
    const eo = ["o16", "o13"].map(g).filter(Boolean), was = {};
    eo.forEach(e => { was[e.id] = e.classList.contains("s") });
    const flag = (e, c) => { e.classList.add(c); clearTimeout(e["_" + c]); e["_" + c] = setTimeout(() => e.classList.remove(c), 1200) };
    const mo = new MutationObserver(() => {
      const cur = {}; eo.forEach(e => { cur[e.id] = e.classList.contains("s") });
      const opened = eo.filter(e => cur[e.id] && !was[e.id]);
      const swap = opened.length && eo.some(e => was[e.id] && !cur[e.id]);
      if (swap) { eo.forEach(e => { e.style.transition = "none" }); requestAnimationFrame(() => requestAnimationFrame(() => eo.forEach(e => { e.style.transition = "" }))); opened.forEach(e => flag(e, "ecswap")) }
      else opened.forEach(e => flag(e, "ecopen"));
      eo.forEach(e => { was[e.id] = cur[e.id] });
    });
    eo.forEach(e => mo.observe(e, { attributes: true, attributeFilter: ["class"] }));
    g("rmBk").onclick = roomClose;
    g("rmSn").onclick = roomSend;
    g("rmIn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); roomSend() } });
    g("rmMn").onclick = () => { const m = g("rmMenu"); if (m.hidden) { E.sure = 0; E.panel = ""; menuPaint() } m.hidden = !m.hidden };
    if (window.visualViewport) {
      const fit = () => { const o = g("o17"); if (!o || !o.classList.contains("s")) return; const v = window.visualViewport; o.style.height = v.height + "px"; o.style.transform = "translateY(" + v.offsetTop + "px)"; const l = g("rmL"); l.scrollTop = l.scrollHeight };
      window.visualViewport.addEventListener("resize", fit); window.visualViewport.addEventListener("scroll", fit);
    }
  }

  function badgeOf() { const F = window.SlovopadFriends, bg = F && F.badges ? F.badges() : { r: 0, c: 0, m: 0, k: 0 }; return { dm: bg.m || 0, friends: (bg.r || 0) + (bg.c || 0) } }
  const num = n => n > 9 ? "9+" : String(n);
  function paintRail(box, active) {
    if (!box) return;
    const bd = badgeOf(), F = window.SlovopadFriends;
    const sig = JSON.stringify([active, !!sidTok(), bd, E.rooms.map(r => [r.id, r.name, r.unread])]);
    if (box._sig === sig) return; box._sig = sig; box.textContent = "";
    let idx = 0;
    const add = (key, content, label, fn, badge, bg, cls) => {
      const b = h("button", "orb" + (cls ? " " + cls : "") + (active === key ? " on" : ""), content); b.type = "button"; b.title = label; b.setAttribute("aria-label", label);
      if (bg) b.style.background = bg; b.onclick = fn; b.style.setProperty("--i", Math.min(idx++, 10));
      if (badge) b.appendChild(h("i", "bdg", num(badge)));
      box.appendChild(b); return b;
    };
    add("home", "🌀", T("Личные сообщения", "Direct messages", "Особисті повідомлення"), () => hubOpen(), bd.dm, null, "orb-home");
    add("fr", "👥", T("Друзья", "Friends", "Друзі"), () => { if (F) F.open() }, bd.friends);
    box.appendChild(h("i", "ecdiv"));
    E.rooms.forEach(r => add("r:" + r.id, first(r.name), r.name, () => roomOpen(r.id, r.name), r.unread, tint(r.id), r.unread ? "ping" : ""));
    if (sidTok()) add("mk", "＋", T("Новая комната", "New room", "Нова кімната"), () => { E.panel = "mk"; hubOpen() }, 0, null, "orb-add");
    box.appendChild(h("i", "ecsp"));
    add("ai", "🤖", T("ИИ-помощник", "AI assistant", "ШІ-помічник"), () => { if (window.EchoAI) window.EchoAI.open(hubOpen) });
    add("bell", "🔔", T("Уведомления", "Notifications", "Сповіщення"), () => { E.panel = E.panel === "tg" ? "" : "tg"; hubOpen(); if (E.panel) loadTg() });
  }
  function paintHead(box, title, sub) {
    if (!box) return; box.textContent = "";
    box.appendChild(btn("ib", "←", () => { clearInterval(E.hub); E.hub = 0; ov("o1") }));
    const t = h("div", "frt"); t.appendChild(h("h2", "", title)); t.appendChild(h("div", "sub", sub)); box.appendChild(t);
  }
  function labels() {
    const mine = E.room ? "r:" + E.room.id : "";
    paintRail(g("ecR16"), "home"); paintRail(g("ecR13"), "fr");
    paintHead(g("ecP16"), "🌀 " + T("ЭХО", "ECHO", "ЕХО"), T("ЛИЧНЫЕ · КОМНАТЫ", "DIRECT · ROOMS", "ОСОБИСТІ · КІМНАТИ"));
    paintHead(g("ecP13"), "👥 " + T("ДРУЗЬЯ", "FRIENDS", "ДРУЗІ"), T("ЗАПРОСЫ · ТОП · ВЫЗОВЫ", "REQUESTS · TOP · CHALLENGES", "ЗАПИТИ · ТОП · ВИКЛИКИ"));
  }
  function avatar(txt, on, bg) { const a = h("div", "fav" + (on ? " on" : ""), txt); a.style.width = a.style.height = "42px"; a.style.fontSize = "20px"; if (bg) a.style.background = bg; return a }

  /* ---------- главный экран ---------- */
  function section(l, text) { l.appendChild(h("div", "ecsec", text)) }
  function badgeEl(n) { return h("i", "bdg ecb", num(n)) }
  function paint() {
    const l = g("ecList"); l.textContent = "";
    const done = () => [...l.children].forEach((c, i) => c.style.setProperty("--i", Math.min(i, 10)));
    const ai = h("button", "ecrow ecai2"); ai.type = "button"; ai.appendChild(avatar("🤖", false));
    const at = h("div", "ect"); at.appendChild(h("b", "", T("ИИ-ПОМОЩНИК", "AI ASSISTANT", "ШІ-ПОМІЧНИК"))); at.appendChild(h("span", "", T("Свой ключ · выбор модели", "Your own key · pick a model", "Свій ключ · вибір моделі"))); ai.appendChild(at);
    ai.onclick = () => { if (window.EchoAI) window.EchoAI.open(hubOpen) }; l.appendChild(ai);
    if (!sidTok()) { l.appendChild(h("div", "chem", T("Чтобы писать друзьям и создавать комнаты, нужен аккаунт.", "You need an account to message friends and make rooms.", "Потрібен акаунт, щоб писати друзям і створювати кімнати."))); l.appendChild(btn("btn", T("ВОЙТИ В АККАУНТ", "SIGN IN", "УВІЙТИ В АКАУНТ"), () => sidOpen())); return }
    section(l, T("КОМНАТЫ — ", "ROOMS — ", "КІМНАТИ — ") + E.rooms.length);
    if (!E.rooms.length) l.appendChild(h("div", "ecdim ecnone", T("Комнат пока нет. Нажми ＋ слева и позови друзей.", "No rooms yet. Tap ＋ on the left and invite friends.", "Кімнат поки немає. Натисни ＋ ліворуч і поклич друзів.")));
    E.rooms.forEach(rm => {
      const r = h("button", "ecrow"); r.type = "button"; r.appendChild(avatar("#", false, tint(rm.id)));
      const t = h("div", "ect"); t.appendChild(h("b", "", rm.name)); t.appendChild(h("span", "", rm.last || "👥 " + rm.members)); r.appendChild(t);
      if (rm.unread) r.appendChild(badgeEl(rm.unread));
      r.onclick = () => roomOpen(rm.id, rm.name); l.appendChild(r);
    });
    const onl = E.friends.filter(f => f.online), off = E.friends.filter(f => !f.online);
    const row = f => {
      const r = h("button", "ecrow"); r.type = "button";
      r.appendChild(avatar(f.avatar || first(f.username), f.online, f.avatar ? null : tint(f.username)));
      const t = h("div", "ect"); t.appendChild(h("b", f.unread ? "ecnew" : "", f.username)); t.appendChild(h("span", "", f.unread ? T("новых: ", "new: ", "нових: ") + f.unread : f.online ? T("в сети", "online", "у мережі") : T("не в сети", "offline", "не в мережі"))); r.appendChild(t);
      if (f.unread) r.appendChild(badgeEl(f.unread));
      r.onclick = () => { const F = window.SlovopadFriends; if (F && F.chatOpen) { F.setBack(hubOpen); F.chatOpen(f) } };
      l.appendChild(r);
    };
    if (!E.friends.length) {
      section(l, T("ЛИЧНЫЕ", "DIRECT", "ОСОБИСТІ"));
      l.appendChild(h("div", "ecdim ecnone", T("Здесь будут чаты с друзьями. Сначала добавь друга.", "Chats with friends will appear here. Add a friend first.", "Тут будуть чати з друзями. Спершу додай друга.")));
      l.appendChild(btn("btn a", "👥 " + T("ДОБАВИТЬ ДРУГА", "ADD A FRIEND", "ДОДАТИ ДРУГА"), () => { const F = window.SlovopadFriends; if (F) F.open() }));
      done(); return;
    }
    if (onl.length) { section(l, T("В СЕТИ — ", "ONLINE — ", "У МЕРЕЖІ — ") + onl.length); onl.sort((a, b) => (b.unread || 0) - (a.unread || 0)).forEach(row) }
    if (off.length) { section(l, T("НЕ В СЕТИ — ", "OFFLINE — ", "НЕ В МЕРЕЖІ — ") + off.length); off.sort((a, b) => (b.unread || 0) - (a.unread || 0)).forEach(row) }
    done();
  }
  async function refresh() {
    if (!sidTok()) { labels(); paint(); return }
    try {
      const [f, r] = await Promise.all([cloudRequest("/api/friends"), cloudRequest("/api/echo/rooms")]);
      E.friends = f.friends || []; E.rooms = r.rooms || []; setHint("ecSt", "");
      const sg = JSON.stringify([E.friends.map(x => [x.username, x.online, x.unread, x.avatar]), E.rooms.map(x => [x.id, x.name, x.unread, x.last, x.members])]);
      if (sg === E.sg) { labels(); return }
      E.sg = sg;
    } catch (e) { setHint("ecSt", (e && e.message) || T("Нет связи с сервером.", "Can't reach the server.", "Немає зв'язку з сервером."), true) }
    labels(); paint();
  }
  function hubOpen() {
    build(); paintSet(); labels(); paint(); ov("o16");
    refresh(); clearInterval(E.hub);
    E.hub = setInterval(() => { if (!g("o16").classList.contains("s") || document.hidden) return; refresh() }, 20000);
  }
  async function mkRoom(name) {
    name = String(name || "").trim(); if (!name) return;
    try { const r = await post("/api/echo/room", { name }); E.panel = ""; await refresh(); roomOpen(r.id, r.name) } catch (e) { setHint("ecSt", e.message, true) }
  }

  /* ---------- уведомления ---------- */
  function paintSet() {
    const p = g("ecSetP"); p.hidden = !E.panel; if (!E.panel) return;
    p.textContent = "";
    if (E.panel === "mk") {
      p.appendChild(h("b", "", T("Новая комната", "New room", "Нова кімната")));
      const i = h("input", "aifld"); i.type = "text"; i.maxLength = 24; i.placeholder = T("Название, например «Штаб»", "Name, e.g. “HQ”", "Назва, наприклад «Штаб»"); i.autocomplete = "off";
      i.addEventListener("keydown", e => { if (e.key === "Enter") mkRoom(i.value) });
      p.appendChild(i); p.appendChild(btn("btn", T("СОЗДАТЬ", "CREATE", "СТВОРИТИ"), () => mkRoom(i.value)));
      setTimeout(() => { try { i.focus() } catch (e) { } }, 60); return;
    }
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
    build(); E.room = { id, name: name || "", mine: false, members: [] }; E.last = 0; E.sure = 0; lastMsg = null;
    g("rmL").textContent = ""; g("rmSt").textContent = ""; g("rmMenu").hidden = true; g("rmIn").value = "";
    g("rmIn").placeholder = T("Написать в # ", "Message # ", "Написати в # ") + (name || "");
    g("rmT").textContent = "# " + E.room.name; g("rmS").textContent = " ";
    ov("o17"); const o = g("o17"), v = window.visualViewport; if (v) { o.style.height = v.height + "px"; o.style.transform = "translateY(" + v.offsetTop + "px)" }
    roomPoll(true); clearInterval(E.timer); E.timer = setInterval(() => roomPoll(false), 6000);
  }
  function roomClose() {
    clearInterval(E.timer); E.timer = 0; E.room = null;
    const o = g("o17"); o.style.height = ""; o.style.transform = ""; g("rmIn").blur();
    hubOpen();
  }
  let lastMsg = null;
  function roomAdd(m) {
    const l = g("rmL"), same = lastMsg && lastMsg.who === m.who && m.t - lastMsg.t < 300000;
    const row = h("div", "msg" + (same ? " cont" : "") + (m.mine ? " mine" : ""));
    const av = h("div", "mav", same ? "" : first(m.who)); if (!same) av.style.background = tint(m.who); row.appendChild(av);
    const body = h("div", "mbody");
    if (!same) { const hd = h("div", "mhead"); const nm = h("b", "mnm", m.mine ? m.who + " · " + T("ты", "you", "ти") : m.who); nm.style.color = "hsl(" + hue(m.who) + " 90% 74%)"; hd.appendChild(nm); hd.appendChild(h("i", "mtm", clock(m.t))); body.appendChild(hd) }
    body.appendChild(h("div", "mtx", m.body)); row.appendChild(body); l.appendChild(row); lastMsg = { who: m.who, t: m.t };
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
      g("rmT").textContent = "# " + rm.name; g("rmS").textContent = "👥 " + r.members.map(x => x.name).slice(0, 4).join(", ") + (r.members.length > 4 ? " +" + (r.members.length - 4) : "");
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
