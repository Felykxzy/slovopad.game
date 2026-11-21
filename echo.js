/* СЛОВОПАД — «Эхо»: мессенджер игры.
   Главный экран Эха: личные чаты с друзьями, комнаты на несколько человек, ИИ-помощник (echo-ai.js), уведомления.
   Подключается после friends.js. Использует: cloudRequest, sidTok, sidOpen, ov, L3, SlovopadFriends. */
(function () {
  "use strict";
  const T = (a, b, c) => L3(a, b, c);
  const g = id => document.getElementById(id);
  const E = { els: {}, msgs: {}, races: {}, react: {}, sel: null, reply: null, edit: null, since: 0, typedAt: 0, day: "", lastRoom: null, rooms: [], friends: [], room: null, last: 0, timer: 0, hub: 0, busy: false, tg: null, sure: 0, panel: "" };
  function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) { if (window.IC && typeof text === "string" && text.indexOf("{") >= 0) IC.t(e, text); else e.textContent = text } return e; }
  function btn(cls, text, fn) { const b = h("button", cls, text); b.type = "button"; b.onclick = fn; return b; }
  const post = (path, body) => cloudRequest(path, { method: "POST", body: JSON.stringify(body || {}) });
  const clock = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") };
  const tgData = () => { try { return (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) || "" } catch (e) { return "" } };
  const setHint = (id, msg, bad) => { const e = g(id); if (e) { e.textContent = msg || ""; e.classList.toggle("bad", !!bad) } };

  /* ---------- протокол: служебные сообщения в комнате (сервер хранит их как обычный текст) ---------- */
  try { g("rmL").addEventListener("scroll", () => { const l = g("rmL"); E.atB = l.scrollHeight - l.scrollTop - l.clientHeight < 80 }, { passive: true }) } catch (e) { }
  const kit = EchoKit.create({ me: () => E.me || "", onsize: () => { const l = g("rmL"); if (l && E.atB !== false) l.scrollTop = l.scrollHeight }, img: id => cloudRequest("/api/echo/room/img?room=" + encodeURIComponent(E.room.id) + "&id=" + id).then(r => r.img), react: (id, emo) => roomReact(id, emo), poll: ids => cloudRequest("/api/echo/room/poll/get?room=" + encodeURIComponent(E.room.id) + "&ids=" + ids.join(",")).then(r => r.polls), vote: (pid, opt) => post("/api/echo/room/poll/vote", { room: E.room.id, poll: pid, opt }), onrec: () => { if (E.room) post("/api/echo/room/typing", { room: E.room.id, k: "voice" }).catch(() => { }) } });
  const PX = "§", EMO = ["👍", "❤️", "😂", "🔥", "😮"];
  function parse(body) {
    body = String(body || "");
    if (body[0] !== PX) return { t: "m", text: body };
    const p = body.slice(1).split("|"), k = p[0];
    if (k === "K" && p.length >= 5) return { t: "K", id: p[1], theme: p[2], lang: p[3], seed: +p[4] | 0 };
    if (k === "S" && p.length >= 3) return { t: "S", id: p[1], v: +p[2] | 0 };
    if (k === "R" && p.length >= 3) return { t: "R", mid: p[1], emo: p.slice(2).join("|") };
    if (k === "Q" && p.length >= 3) return { t: "Q", mid: p[1], text: p.slice(2).join("|") };
    return { t: "m", text: body };
  }
  function pretty(body) {
    { const SK = window.SlovopadStickers, GF = window.SlovopadGif, l = (SK && SK.label(body)) || (GF && GF.label(body)); if (l) return l }
    if (/^:p:[a-z0-9]{8}:$/.test(String(body).trim())) return "📊 " + T("Опрос", "Poll", "Опитування");
    const p = parse(body);
    if (p.t === "K") return T("Заезд", "Race", "Заїзд");
    if (p.t === "S") return T("результат заезда", "race result", "результат заїзду");
    if (p.t === "R") return p.emo;
    if (p.t === "Q") return "↩ " + p.text;
    return p.text;
  }
  const dayName = ms => {
    const d = new Date(ms), n = new Date(), k = x => x.getFullYear() * 400 + x.getMonth() * 32 + x.getDate(), y = new Date(n); y.setDate(n.getDate() - 1);
    if (k(d) === k(n)) return T("Сегодня", "Today", "Сьогодні"); if (k(d) === k(y)) return T("Вчера", "Yesterday", "Вчора");
    try { return d.toLocaleDateString(L3("ru", "en", "uk"), { day: "numeric", month: "long" }) } catch (e) { return d.toDateString() }
  };

  /* ---------- каркас: слева «орбиты» (рейка), справа панель ---------- */
  const hue = s => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 360; return x };
  const tint = s => "linear-gradient(135deg,hsl(" + hue(s) + " 85% 60%),hsl(" + ((hue(s) + 55) % 360) + " 80% 42%))";
  const first = s => ([...String(s || "?")][0] || "?").toUpperCase();
  function build() {
    if (g("o16")) return;
    const hub = h("div", "ov"); hub.id = "o16";
    hub.innerHTML = '<div class="ecw"><nav class="ecrail" id="ecR16"></nav><section class="ecpan"><div class="ecph" id="ecP16"></div>' +
      '<div class="ecset gl" id="ecSetP" hidden></div><div class="ecsr" id="ecSr" hidden><input id="ecSrI" type="search" maxlength="40" autocomplete="off"><div class="frlist" id="ecSrL"></div></div><div class="frlist" id="ecList"></div><div class="hint" id="ecSt"></div></section></div>';
    const rm = h("div", "ov"); rm.id = "o17";
    rm.innerHTML = '<div class="frh ecrh"><button class="ib" id="rmBk" type="button" aria-label="back">'+IC.html("back")+'</button><div class="frt"><h2 id="rmT"></h2><div class="sub" id="rmS"></div></div><button class="ib" id="rmCl" type="button" aria-label="call">'+IC.html("phone")+'</button><button class="ib" id="rmMn" type="button" aria-label="menu">'+IC.html("dots")+'</button></div>' +
      '<div class="chmenu" id="rmMenu" hidden></div><div class="pinb" id="rmPin" hidden></div><div class="rmabout" id="rmAb" hidden></div>' +
      '<div class="rmcall" id="rmCall" hidden></div><div class="chl ecfeed" id="rmL"></div><div class="hint" id="rmSt"></div>' +
      '<div class="rmbar" id="rmBar" hidden></div><div class="rmrp" id="rmRp" hidden></div>' +
      '<div class="chrp stkp" id="rmSk" hidden></div><div class="chbar"><button class="ib chrx" id="rmStk" type="button" aria-label="stickers">😊</button><button class="ib chph" id="rmPh" type="button" aria-label="photo">📷</button><button class="ib chph chmc" id="rmMc" type="button" aria-label="voice">🎤</button><input id="rmIn" type="text" maxlength="120" autocomplete="off" enterkeyhint="send"><button class="btn chsn" id="rmSn" type="button" aria-label="send">'+IC.html("send")+'</button></div>';
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
    if (EchoKit.swipeBack) EchoKit.swipeBack(g("o16"), hubOut);
    if (EchoKit.swipeBack) EchoKit.swipeBack(g("o17"), roomClose);
    if (kit.downBtn && !E.dn) E.dn = kit.downBtn(g("rmL"), g("o17"));
    if (kit.searchBar && !kit.SR) { kit.searchBar(g("o17"), g("rmL")); const sb = h("button", "ib", "🔍"); sb.id = "rmSrb"; sb.type = "button"; sb.setAttribute("aria-label", "search"); sb.onclick = () => kit.SR.toggle(); g("rmMn").parentNode.insertBefore(sb, g("rmMn")) }
    if (kit.selectInit && !kit.S) kit.selectInit({ host: g("o17"), list: g("rmL"), itemSel: ".msg", canDel: m => { const rm = E.room, mod = rm && rm.canMod, ow = ((rm && rm.members) || []).find(x => x.owner); return !m.dl && (m.mine || (mod && !(ow && ow.name === m.who))) }, del: m => post("/api/echo/room/del", { room: E.room.id, id: m.id }), after: () => { E.busy = false; roomPoll(false) } });
    try { g("rmL").addEventListener("scroll", () => { const l = g("rmL"); g("o17").classList.toggle("chsm", l.scrollHeight - l.scrollTop - l.clientHeight > 160) }, { passive: true }) } catch (e) { }
    if (EchoKit.swipeLeft) EchoKit.swipeLeft(g("rmL"), ".msg:not(.dl)", it => [it.querySelector(".mbody")], it => { const m = kit.msgs[it.dataset.id]; if (m && !m.dl) { E.reply = m; E.edit = null; replyPaint(); try { g("rmIn").focus() } catch (e) { } } }, "↩");
    g("rmSn").onclick = () => roomSend();
    g("rmStk").onclick = () => { const r = g("rmSk"); if (r.hidden) kit.stickers(r, (x, im) => roomSend(x, im)); r.hidden = !r.hidden };
    if (kit.mic) kit.mic(g("rmMc"), g("o17").querySelector(".chbar"), (e, au) => { if (e) { setHint("rmSt", e.message, true); return } roomSend(null, au) });
    g("rmPh").onclick = () => kit.pick((e, img) => { if (e) { setHint("rmSt", e.message, true); return } roomSend(null, img) });
    g("rmIn").addEventListener("input", () => { if (E.room && !E.edit && EchoKit.draft) EchoKit.draft("r." + E.room.id, g("rmIn").value); const n = Date.now(); if (!E.room || !g("rmIn").value || n - E.typedAt < 3000) return; E.typedAt = n; post("/api/echo/room/typing", { room: E.room.id }).catch(() => { }) });
    g("rmIn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); roomSend() } });
    { // подсказка @имён: пишешь @ — над строкой ввода появляются участники комнаты
      const bar = g("o17").querySelector(".chbar"), pop = h("div", "atp"); pop.hidden = true; bar.parentNode.insertBefore(pop, bar);
      const upd = () => {
        const i = g("rmIn"), pos = i.selectionStart == null ? i.value.length : i.selectionStart, m = /(^|\s)@([^\s@]*)$/.exec(i.value.slice(0, pos));
        pop.textContent = ""; if (!m || !E.room) { pop.hidden = true; return }
        const q = m[2].toLowerCase(), list = ((E.room.members || []).filter(x => !x.me && x.name.toLowerCase().startsWith(q))).slice(0, 6);
        if (!list.length) { pop.hidden = true; return }
        list.forEach(x => { const b = h("button", "atc", "@" + x.name); b.type = "button"; b.onpointerdown = e => e.preventDefault(); b.onclick = () => { const v = i.value, st = pos - m[2].length - 1; i.value = v.slice(0, st) + "@" + x.name + " " + v.slice(pos); const np = st + x.name.length + 2; i.focus(); try { i.setSelectionRange(np, np) } catch (e) { } pop.hidden = true; i.dispatchEvent(new Event("input")) }; pop.appendChild(b) });
        pop.hidden = false;
      };
      g("rmIn").addEventListener("input", upd); g("rmIn").addEventListener("blur", () => setTimeout(() => { pop.hidden = true }, 150));
    }
    g("rmCl").onclick = () => { const rm = E.room; if (rm && window.EchoCall) EchoCall.join(rm.id, rm.name, () => roomOpen(rm.id, rm.name)) };
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
    add("home", "{echo}", T("Личные сообщения", "Direct messages", "Особисті повідомлення"), () => hubOpen(), bd.dm, null, "orb-home");
    add("fr", "{people}", T("Друзья", "Friends", "Друзі"), () => { if (F) F.open() }, bd.friends);
    box.appendChild(h("i", "ecdiv"));
    E.rooms.forEach(r => add("r:" + r.id, first(r.name), r.name, () => roomOpen(r.id, r.name), r.unread, tint(r.id), r.unread ? "ping" : ""));
    if (sidTok()) add("mk", "{plus}", T("Новая комната", "New room", "Нова кімната"), () => { E.panel = "mk"; hubOpen() }, 0, null, "orb-add");
    box.appendChild(h("i", "ecsp"));
    add("ai", "{bot}", T("ИИ-помощник", "AI assistant", "ШІ-помічник"), () => { if (window.EchoAI) window.EchoAI.open(hubOpen) });
    add("bell", "{bell}", T("Уведомления", "Notifications", "Сповіщення"), () => { E.panel = E.panel === "tg" ? "" : "tg"; hubOpen(); if (E.panel) loadTg() });
  }
  function hubOut() { clearInterval(E.hub); E.hub = 0; ov("o1") }
  // поиск по всем чатам и комнатам сразу
  function hubSearch() {
    const sr = g("ecSr"), inp = g("ecSrI"), list = g("ecList"); if (!sr) return;
    sr.hidden = !sr.hidden; list.hidden = !sr.hidden; { const sp = g("ecSetP"); if (sp) sp.style.display = sr.hidden ? "" : "none" } g("ecSb").classList.toggle("on", !sr.hidden);
    if (sr.hidden) return; inp.placeholder = T("Искать во всех чатах", "Search all chats", "Шукати в усіх чатах"); inp.value = ""; g("ecSrL").textContent = ""; try { inp.focus() } catch (e) { }
    if (inp.__w) return; inp.__w = 1; let tm = 0, seq = 0;
    const when = t => { const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? d.toTimeString().slice(0, 5) : d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) };
    const hl = (box, text, q) => { const i = text.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) { box.textContent = text; return } box.append(text.slice(0, i)); const m = h("mark", "", text.slice(i, i + q.length)); box.append(m, text.slice(i + q.length)) };
    inp.addEventListener("input", () => { clearTimeout(tm); const q = inp.value.trim(), L = g("ecSrL"), my = ++seq;
      if (q.length < 2) { L.textContent = ""; return }
      tm = setTimeout(async () => {
        try {
          const r = await cloudRequest("/api/search?q=" + encodeURIComponent(q)); if (my !== seq) return; L.textContent = "";
          if (!r.results.length) { L.appendChild(h("div", "hint", T("Ничего не нашлось.", "Nothing found.", "Нічого не знайшлось."))); return }
          r.results.forEach((x, k) => {
            const row = h("button", "ecrow ecsrr"); row.type = "button"; row.style.setProperty("--i", Math.min(k, 10));
            row.appendChild(avatar(x.kind === "room" ? "#" : (x.name || "?").slice(0, 1).toUpperCase(), false, x.kind === "room" ? tint(x.room) : undefined));
            const t = h("div", "ect"), top = h("b", "", (x.kind === "room" ? "# " : "") + x.name), sn = h("span", ""); hl(sn, (x.mine ? T("Вы: ", "You: ", "Ви: ") : "") + x.text, q); t.append(top, sn); row.appendChild(t); row.appendChild(h("i", "ecsrt", when(x.t)));
            row.onclick = () => { if (x.kind === "room") roomOpen(x.room, x.name); else { const F = window.SlovopadFriends, f = F && F.list().find(y => y.spCode === x.code); if (f && F.chatOpen) { F.setBack(hubOpen); F.chatOpen(f) } } };
            L.appendChild(row);
          });
        } catch (e) { if (my === seq) { L.textContent = ""; L.appendChild(h("div", "hint bad", e.message)) } }
      }, 400);
    });
  }
  function paintHead(box, title, sub) {
    if (!box) return; box.textContent = "";
    box.appendChild(btn("ib", "{back}", hubOut));
    const t = h("div", "frt"); t.appendChild(h("h2", "", title)); t.appendChild(h("div", "sub", sub)); box.appendChild(t);
  }
  function labels() {
    const mine = E.room ? "r:" + E.room.id : "";
    paintRail(g("ecR16"), "home"); paintRail(g("ecR13"), "fr");
    paintHead(g("ecP16"), "{echo}" + T("ЭХО", "ECHO", "ЕХО"), T("ЛИЧНЫЕ · КОМНАТЫ", "DIRECT · ROOMS", "ОСОБИСТІ · КІМНАТИ"));
    { const sb = btn("ib ecsb", "🔍", hubSearch); sb.id = "ecSb"; sb.setAttribute("aria-label", "search"); g("ecP16").appendChild(sb) }
    paintHead(g("ecP13"), "{people}" + T("ДРУЗЬЯ", "FRIENDS", "ДРУЗІ"), T("ЗАПРОСЫ · ТОП · ВЫЗОВЫ", "REQUESTS · TOP · CHALLENGES", "ЗАПИТИ · ТОП · ВИКЛИКИ"));
  }
  function avatar(txt, on, bg, user) { const a = h("div", "fav" + (on ? " on" : ""), txt); a.style.width = a.style.height = "42px"; a.style.fontSize = "20px"; if (bg) a.style.background = bg; if (user) try { spPhoto(a, user) } catch (e) { } return a }

  /* ---------- главный экран ---------- */
  function section(l, text) { l.appendChild(h("div", "ecsec", text)) }
  const prevU = {};
  function badgeEl(n, key) { const b = h("i", "bdg ecb", num(n)); if (key !== undefined) { if (prevU[key] !== undefined && n > prevU[key]) b.classList.add("bnc"); prevU[key] = n } return b }
  function paint() { const l = g("ecList"), sn = EchoKit.flipStart ? EchoKit.flipStart(l) : null; paintRaw(); if (sn && EchoKit.flipEnd) EchoKit.flipEnd(l, sn) }
  /* закреплённые чаты: список на сервере, копия в памяти для быстрого показа */
  E.pins = (() => { try { return JSON.parse(localStorage.getItem("spPins") || "[]").filter(x => typeof x === "string") } catch (e) { return [] } })();
  const isPinned = k => E.pins.includes(k);
  const savePins = () => { try { localStorage.setItem("spPins", JSON.stringify(E.pins)) } catch (e) { } };
  async function togglePin(k) {
    const on = !isPinned(k), was = E.pins.slice();
    if (on && E.pins.length >= 5) { setHint("ecSt", T("Можно закрепить не больше 5 чатов.", "You can pin up to 5 chats.", "Можна закріпити не більше 5 чатів."), true); return }
    E.pins = on ? [k].concat(E.pins) : E.pins.filter(x => x !== k); savePins(); E.sg = ""; paint();
    try { await post("/api/my/pin", { key: k, on: on ? 1 : 0 }) } catch (e) { E.pins = was; savePins(); E.sg = ""; paint(); setHint("ecSt", (e && e.message) || "", true) }
  }
  function pinHold(r, k) {
    let tm = 0, x0 = 0, y0 = 0;
    const stop = () => { clearTimeout(tm); tm = 0 };
    r.addEventListener("pointerdown", e => { r._held = false; x0 = e.clientX; y0 = e.clientY; stop(); tm = setTimeout(() => { tm = 0; r._held = true; try { navigator.vibrate && navigator.vibrate(15) } catch (x) { } togglePin(k); setTimeout(() => { r._held = false }, 400) }, 550) });
    r.addEventListener("pointermove", e => { if (tm && (Math.abs(e.clientX - x0) > 8 || Math.abs(e.clientY - y0) > 8)) stop() });
    ["pointerup", "pointercancel", "pointerleave"].forEach(n => r.addEventListener(n, stop));
    r.addEventListener("contextmenu", e => { e.preventDefault(); togglePin(k) });
  }
  function paintRaw() {
    const l = g("ecList"); l.textContent = "";
    const done = () => [...l.children].forEach((c, i) => c.style.setProperty("--i", Math.min(i, 10)));
    const ai = h("button", "ecrow ecai2"); ai.type = "button"; ai.appendChild(avatar("{bot}", false));
    const at = h("div", "ect"); at.appendChild(h("b", "", T("ИИ-ПОМОЩНИК", "AI ASSISTANT", "ШІ-ПОМІЧНИК"))); at.appendChild(h("span", "", T("Свой ключ · выбор модели", "Your own key · pick a model", "Свій ключ · вибір моделі"))); ai.appendChild(at);
    ai.onclick = () => { if (window.EchoAI) window.EchoAI.open(hubOpen) }; l.appendChild(ai);
    if (!sidTok()) { l.appendChild(h("div", "chem", T("Чтобы писать друзьям и создавать комнаты, нужен аккаунт.", "You need an account to message friends and make rooms.", "Потрібен акаунт, щоб писати друзям і створювати кімнати."))); l.appendChild(btn("btn", T("ВОЙТИ В АККАУНТ", "SIGN IN", "УВІЙТИ В АКАУНТ"), () => sidOpen())); return }
    const rest = E.rooms.filter(rm => !isPinned("r:" + rm.id));
    if (rest.length || !E.rooms.length) section(l, T("КОМНАТЫ — ", "ROOMS — ", "КІМНАТИ — ") + rest.length);
    if (!E.rooms.length) l.appendChild(h("div", "ecdim ecnone", T("Комнат пока нет. Нажми ＋ слева и позови друзей.", "No rooms yet. Tap ＋ on the left and invite friends.", "Кімнат поки немає. Натисни ＋ ліворуч і поклич друзів.")));
    const rrow = rm => {
      const r = h("button", "ecrow"); r.type = "button"; r.dataset.k = rm.id; pinHold(r, "r:" + rm.id); r.appendChild(avatar("#", false, tint(rm.id)));
      const t = h("div", "ect"); t.appendChild(h("b", "", rm.name)); { const dr = EchoKit.draft ? EchoKit.draft("r." + rm.id) : ""; const sp = h("span", "", dr ? dr.slice(0, 40) : rm.last ? pretty(rm.last) : "{people}" + rm.members); if (dr) sp.prepend(h("em", "ecdr", T("Черновик: ", "Draft: ", "Чернетка: "))); t.appendChild(sp) } r.appendChild(t);
      if (rm.ment) r.appendChild(h("i", "ecat", "@")); if (rm.unread) r.appendChild(badgeEl(rm.unread, "r" + rm.id)); else prevU["r" + rm.id] = 0;
      r.onclick = () => { if (r._held) return; roomOpen(rm.id, rm.name) }; l.appendChild(r);
    };
    const anchor = ai, after = () => { const ps = []; const st = l.children.length; E.pins.forEach(k => { if (k[0] === "r") { const rm = E.rooms.find(x => x.id === k.slice(2)); if (rm) ps.push(() => rrow(rm)) } else { const f = E.friends.find(x => String(x.spCode) === k.slice(2)); if (f) ps.push(() => row(f)) } }); if (!ps.length) return; section(l, "📌 " + T("ЗАКРЕПЛЁННЫЕ", "PINNED", "ЗАКРІПЛЕНІ")); ps.forEach(p => p()); const mv = [...l.children].slice(st), ref = anchor.nextSibling; mv.forEach(n => l.insertBefore(n, ref)) };
    rest.forEach(rrow);
    const onl = E.friends.filter(f => f.online), off = E.friends.filter(f => !f.online);
    const row = f => {
      const r = h("button", "ecrow"); r.type = "button"; r.dataset.k = f.spCode || f.username; pinHold(r, "d:" + f.spCode);
      r.appendChild(avatar(f.avatar || first(f.username), f.online, f.avatar ? null : tint(f.username), f.username));
      const t = h("div", "ect"); t.appendChild(h("b", f.unread ? "ecnew" : "", f.username)); { const te = window.TagUI && TagUI.el(f.tag); if (te) t.firstChild.appendChild(te) } { const dr = EchoKit.draft ? EchoKit.draft("d." + f.spCode) : ""; if (dr) { const sp = h("span", "", dr.slice(0, 40)); sp.prepend(h("em", "ecdr", T("Черновик: ", "Draft: ", "Чернетка: "))); t.appendChild(sp) } else t.appendChild(h("span", "", f.unread ? T("новых: ", "new: ", "нових: ") + f.unread : f.online ? T("в сети", "online", "у мережі") : T("не в сети", "offline", "не в мережі"))) } r.appendChild(t);
      if (f.unread) r.appendChild(badgeEl(f.unread, "f" + f.spCode)); else prevU["f" + f.spCode] = 0;
      r.onclick = () => { if (r._held) return; const F = window.SlovopadFriends; if (F && F.chatOpen) { F.setBack(hubOpen); F.chatOpen(f) } };
      l.appendChild(r);
    };
    if (!E.friends.length) {
      section(l, T("ЛИЧНЫЕ", "DIRECT", "ОСОБИСТІ"));
      l.appendChild(h("div", "ecdim ecnone", T("Здесь будут чаты с друзьями. Сначала добавь друга.", "Chats with friends will appear here. Add a friend first.", "Тут будуть чати з друзями. Спершу додай друга.")));
      l.appendChild(btn("btn a", "{plus}" + T("ДОБАВИТЬ ДРУГА", "ADD A FRIEND", "ДОДАТИ ДРУГА"), () => { const F = window.SlovopadFriends; if (F) F.open() }));
      after(); done(); return;
    }
    const fp = f => !isPinned("d:" + f.spCode), onl2 = onl.filter(fp), off2 = off.filter(fp);
    if (onl2.length) { section(l, T("В СЕТИ — ", "ONLINE — ", "У МЕРЕЖІ — ") + onl2.length); onl2.sort((a, b) => (b.unread || 0) - (a.unread || 0)).forEach(row) }
    if (off2.length) { section(l, T("НЕ В СЕТИ — ", "OFFLINE — ", "НЕ В МЕРЕЖІ — ") + off2.length); off2.sort((a, b) => (b.unread || 0) - (a.unread || 0)).forEach(row) }
    after();
    if (!E.pins.length) l.appendChild(h("div", "ecdim ecnone", T("Зажми чат пальцем, чтобы закрепить его вверху.", "Hold a chat to pin it to the top.", "Затисни чат, щоб закріпити його вгорі.")));
    done();
  }
  async function refresh() {
    if (!sidTok()) { labels(); paint(); return }
    try {
      const [f, r] = await Promise.all([cloudRequest("/api/friends"), cloudRequest("/api/echo/rooms")]);
      E.friends = f.friends || []; E.rooms = r.rooms || []; setHint("ecSt", "");
      if (!E.pinsAt || Date.now() - E.pinsAt > 60000) { E.pinsAt = Date.now(); cloudRequest("/api/my/all").then(a => { if (Array.isArray(a.pins) && JSON.stringify(a.pins) !== JSON.stringify(E.pins)) { E.pins = a.pins; savePins(); E.sg = ""; paint() } }).catch(() => { }) }
      const sg = JSON.stringify([E.friends.map(x => [x.username, x.online, x.unread, x.avatar]), E.rooms.map(x => [x.id, x.name, x.unread, x.ment, x.last, x.members]), E.pins]);
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
    build(); E.room = { id, name: name || "", mine: false, members: [] }; E.lastRoom = { id, name: name || "" }; E.last = 0; E.sure = 0; lastMsg = null; E.els = {}; E.msgs = {}; if (E.dn) E.dn.reset(); if (kit.S) kit.S.exit(); g("o17").classList.remove("chsm"); E.races = {}; E.react = {}; E.sel = null; E.reply = null; E.edit = null; E.since = 0; E.day = ""; kit.reset(); replyPaint(); g("rmSk").hidden = true; g("rmPin").hidden = true; g("rmAb").hidden = true;
    g("rmL").textContent = ""; g("rmSt").textContent = ""; g("rmMenu").hidden = true; g("rmIn").value = EchoKit.draft ? EchoKit.draft("r." + id) : "";
    g("rmIn").placeholder = T("Написать в # ", "Message # ", "Написати в # ") + (name || "");
    g("rmT").textContent = "# " + E.room.name; g("rmS").textContent = " ";
    ov("o17"); const o = g("o17"), v = window.visualViewport; if (v) { o.style.height = v.height + "px"; o.style.transform = "translateY(" + v.offsetTop + "px)" }
    roomPoll(true); clearInterval(E.timer); E.timer = setInterval(() => roomPoll(false), 6000);
  }
  function roomClose() {
    if (kit.S) kit.S.exit(); if (kit.SR) kit.SR.toggle(false);
    clearInterval(E.timer); E.timer = 0; E.room = null;
    const o = g("o17"); o.style.height = ""; o.style.transform = ""; g("rmIn").blur();
    hubOpen();
  }
  /* профиль участника комнаты */
  async function whoOpen(name) {
    if (!E.room) return;
    let d; try { d = await post("/api/echo/room/who", { room: E.room.id, code: name }) } catch (e) { setHint("rmSt", e.message, true); return }
    const o = g("o17"); let w = g("ewho"); if (w) w.remove();
    w = h("div", "ewho"); w.id = "ewho"; w.onclick = e => { if (e.target === w) w.remove() };
    const c = h("div", "ewc"); w.appendChild(c);
    const av = h("div", "fav"); av.style.width = av.style.height = "96px"; av.style.fontSize = "48px"; av.textContent = d.avatar || d.username.charAt(0).toUpperCase(); try { spPhoto(av, d.username) } catch (e) { } if (d.online) av.classList.add("on");
    const nm = h("div", "ewn", d.username); { const te = window.TagUI && TagUI.el(d.tag); if (te) nm.appendChild(te) }
    const st = d.online ? T("в сети", "online", "в мережі") : (d.seen ? T("был(а) недавно", "seen recently", "був(ла) нещодавно") : "");
    c.append(av, nm, h("div", "ews", st || " "), h("div", "ewc2", d.spCode));
    if (d.bestScore !== null && d.bestScore !== undefined) {
      const sx = h("div", "fpst");
      [[T("РЕКОРД", "BEST", "РЕКОРД"), d.bestScore], [T("СЛОВ ВСЕГО", "WORDS", "СЛІВ УСЬОГО"), d.totalWords]].forEach(([k, v]) => { const x = h("div", "gl"); x.append(h("b", "", v === null || v === undefined ? "—" : String(v)), h("span", "", k)); sx.appendChild(x) });
      c.appendChild(sx);
    }
    const msg = h("div", "hint", ""); 
    if (d.rel === "friend") c.appendChild(btn("btn", "{chat}" + T("НАПИСАТЬ", "MESSAGE", "НАПИСАТИ"), () => { w.remove(); if (window.SlovopadFriends) SlovopadFriends.chatOpen({ username: d.username, spCode: d.spCode, avatar: d.avatar, online: d.online }) }));
    else if (d.rel === "sent") msg.textContent = T("Запрос в друзья отправлен.", "Friend request sent.", "Запит у друзі надіслано.");
    else if (!d.me) {
      const add = btn("btn", "＋ " + T("ДОБАВИТЬ В ДРУЗЬЯ", "ADD FRIEND", "ДОДАТИ В ДРУЗІ"), async () => {
        add.disabled = true;
        try { const r = await post("/api/friends/request", { q: d.spCode }); add.remove(); msg.textContent = r.state === "accepted" ? T("Теперь вы друзья ✓", "You are friends now ✓", "Тепер ви друзі ✓") : T("Запрос отправлен.", "Request sent.", "Запит надіслано.") }
        catch (e) { add.disabled = false; msg.textContent = e.message; msg.classList.add("bad") }
      }); c.appendChild(add);
    }
    c.appendChild(msg); c.appendChild(btn("btn a", T("ЗАКРЫТЬ", "CLOSE", "ЗАКРИТИ"), () => w.remove()));
    o.appendChild(w);
  }
  let lastMsg = null;
  function roomAdd(m) {
    const l = g("rmL"), p = parse(m.body);
    if (p.t === "S") { const rc = E.races[p.id]; if (rc) { if (p.v > (rc.sc[m.who] || 0)) rc.sc[m.who] = p.v; raceDraw(rc) } return }
    if (p.t === "R") return;
    const dn = dayName(m.t); if (dn !== E.day) { E.day = dn; l.appendChild(h("div", "dday", dn)); lastMsg = null }
    if (p.t === "K") { raceAdd(m, p); lastMsg = null; return }
    const same = lastMsg && lastMsg.who === m.who && m.t - lastMsg.t < 300000;
    const row = h("div", "msg" + (same ? " cont" : "") + (m.mine ? " mine" : "") + (E.live ? " nw" : "")); row.dataset.id = m.id; E.els[m.id] = row;
    const av = h("div", "mav", same ? "" : first(m.who)); if (!same) { av.style.background = tint(m.who); try { if (m.mine && PF && PF.p) { avSet(av, "", PF.p); av.classList.add("hasph") } else spPhoto(av, m.who) } catch (e) { } if (!m.mine) { av.classList.add("tap"); av.onclick = e => { e.stopPropagation(); whoOpen(m.who) } } } row.appendChild(av);
    const body = h("div", "mbody");
    if (!same && !m.mine) { const hd = h("div", "mhead"); const nm = h("b", "mnm", m.who); nm.style.color = "hsl(" + hue(m.who) + " 90% 74%)"; nm.classList.add("tap"); nm.onclick = e => { e.stopPropagation(); whoOpen(m.who) }; hd.appendChild(nm); { const mb = ((E.room && E.room.members) || []).find(x => x.name === m.who), te = window.TagUI && mb && TagUI.el(mb.tag); if (te) hd.appendChild(te) } body.appendChild(hd) }
    if (p.t === "Q") { const o = kit.msgs[p.mid]; m = { ...m, body: p.text, rp: { id: +p.mid, who: o ? o.who : "", text: o ? String(o.body || "").slice(0, 60) : "", dl: !o } } }
    const mc = h("div", "mc"); body.appendChild(mc); row.appendChild(body);
    kit.msgs[m.id] = m; roomFill(row, m);
    if (E.live && !m.mine && window.EchoCall) EchoCall.sfx("msg");
    if (E.live && EchoKit.fx && !m.dl) EchoKit.fx(g("o17"), m.body);
    l.appendChild(row); lastMsg = { who: m.who, t: m.t };
  }

  /* ---------- сообщение: наполнение, меню, реакции ---------- */
  function roomFill(row, m) {
    const mc = row.querySelector(".mc"); if (!mc) return; mc.textContent = "";
    const q = kit.quote(m, kit.jump); if (q) mc.appendChild(q);
    const im = kit.media(m); if (im) mc.appendChild(im);
    const tx = h("div", "mtx"); if (m.body || m.dl) tx.appendChild(kit.text(m)); tx.appendChild(h("i", "mts", kit.meta(m))); mc.appendChild(tx);
    const rx = h("div", "rxs"); mc.appendChild(rx); kit.reg(m.id, row, rx);
    row.classList.toggle("dl", !!m.dl); E.els[m.id] = row;
    row.onclick = null; if (!m.dl) (kit.hold ? kit.hold(row, () => roomSheet(m)) : (row.onclick = () => roomSheet(m)));
  }
  function roomChanged(m) {
    const row = E.els[m.id], was = kit.msgs[m.id]; kit.msgs[m.id] = { ...(kit.msgs[m.id] || {}), ...m }; if (!row) return;
    const fill = () => { roomFill(row, kit.msgs[m.id]); if (m.dl) { row.classList.add("dlin"); setTimeout(() => row.classList.remove("dlin"), 420) } };
    if (m.dl && was && !was.dl && kit.vanish) kit.vanish(row.querySelector(".mbody"), () => { const b = row.querySelector(".mbody"); if (b) { b.style.transition = ""; b.style.transform = ""; b.style.opacity = "" } fill() }); else fill();
  }
  function roomSheet(m) {
    if (kit.S && kit.S.on) { kit.S.toggle(m.id); return }
    const rm = E.room, mod = rm && rm.canMod, acts = [[T("↩ Ответить", "↩ Reply", "↩ Відповісти"), () => { E.reply = m; E.edit = null; replyPaint(); try { g("rmIn").focus() } catch (e) { } }]];
    if (m.body) acts.push([T("Скопировать", "Copy", "Копіювати"), () => { try { navigator.clipboard.writeText(m.body) } catch (e) { } }]);
    if (m.mine && m.body) acts.push([T("✎ Изменить", "✎ Edit", "✎ Змінити"), () => { E.edit = m; E.reply = null; replyPaint(); const i = g("rmIn"); i.value = m.body; try { i.focus() } catch (e) { } }]);
    if (mod) acts.push([rm.pin && rm.pin.id === m.id ? T("📌 Открепить", "📌 Unpin", "📌 Відкріпити") : T("📌 Закрепить", "📌 Pin", "📌 Закріпити"), () => post("/api/echo/room/pin", { room: rm.id, id: rm.pin && rm.pin.id === m.id ? 0 : m.id }).then(() => { E.busy = false; roomPoll(false) }).catch(e => setHint("rmSt", e.message, true))]);
    const ow = ((rm && rm.members) || []).find(x => x.owner);
    if (m.mine || (mod && !(ow && ow.name === m.who))) acts.push([T("🗑 Удалить", "🗑 Delete", "🗑 Видалити"), () => post("/api/echo/room/del", { room: rm.id, id: m.id }).then(() => { E.busy = false; roomPoll(false) }).catch(e => setHint("rmSt", e.message, true)), true]);
    if (m.body && !m.dl) acts.push([T("↪ Переслать", "↪ Forward", "↪ Переслати"), () => { const F = window.SlovopadFriends; kit.forward(g("o17"), m, [...((F && F.list && F.list()) || []).map(f => ({ kind: "friend", name: f.username, code: f.spCode })), ...(E.rooms || []).filter(r => !E.room || r.id !== E.room.id).map(r => ({ kind: "room", name: r.name, id: r.id }))], t => { const f = kit.fwd(m, "↪ " + (m.who || "?") + ":"); return t.kind === "room" ? post("/api/echo/room/send", Object.assign({ room: t.id }, f)) : post("/api/chat/send", Object.assign({ to: t.code }, f)) }) }]);
    acts.push([T("☑ Выбрать", "☑ Select", "☑ Обрати"), () => { if (kit.S) kit.S.enter(m) }]);
    kit.sheet(g("o17"), m, acts);
  }
  async function roomReact(id, emo) {
    const rm = E.room; if (!rm) return;
    try { await post("/api/echo/room/react", { room: rm.id, id, emo }); E.busy = false; roomPoll(false) } catch (e) { setHint("rmSt", e.message, true) }
  }
  function replyPaint() {
    const r = g("rmRp"), q = E.edit || E.reply; if (!r) return; r.textContent = ""; r.hidden = !q;
    if (!q) { if (E.editWas) g("rmIn").value = ""; E.editWas = false; return }
    E.editWas = !!E.edit;
    r.appendChild(h("span", "", (E.edit ? "✎ " + T("Изменить: ", "Edit: ", "Змінити: ") : "↩ " + q.who + ": ") + String(q.body || (q.au ? "🎤" : "📷")).slice(0, 50)));
    r.appendChild(btn("ecx", "{close}", () => { E.reply = E.edit = null; replyPaint() }));
  }
  async function sendRaw(text) {
    const rm = E.room; if (!rm) return;
    try { await post("/api/echo/room/send", { room: rm.id, text }); E.busy = false; roomPoll(false) } catch (e) { setHint("rmSt", e.message, true) }
  }

  /* ---------- заезд: все играют одни и те же слова ---------- */
  function raceAdd(m, p) {
    const th = typeof THEMES !== "undefined" ? THEMES.find(x => x.id === p.theme) : null;
    const rc = { id: p.id, theme: p.theme, lang: p.lang, seed: p.seed, by: m.who, sc: {}, th };
    E.races[p.id] = rc;
    const card = h("div", "race"); rc.el = card; g("rmL").appendChild(card); raceDraw(rc);
  }
  function raceDraw(rc) {
    const c = rc.el; if (!c) return; c.textContent = "";
    const lang = String(rc.lang || "").toUpperCase();
    c.appendChild(h("div", "rach", "{flag}" + T("ЗАЕЗД", "RACE", "ЗАЇЗД") + " · " + (rc.th ? rc.th.i + " " + tx(rc.th.n) : rc.theme) + " · " + lang));
    c.appendChild(h("div", "rasub", T("Запустил ", "Started by ", "Запустив ") + rc.by + T(". Все печатают одни и те же слова.", ". Everyone types the same words.", ". Усі друкують одні й ті самі слова.")));
    const rows = Object.keys(rc.sc).map(n => [n, rc.sc[n]]).sort((a, b) => b[1] - a[1]);
    if (!rows.length) c.appendChild(h("div", "ecdim", T("Пока никто не сыграл. Будь первым!", "Nobody played yet. Be the first!", "Поки ніхто не грав. Будь першим!")));
    rows.forEach((r, i) => { const row = h("div", "rarow" + (E.me && r[0] === E.me ? " me" : "")); row.appendChild(h("i", "mdl m" + (i + 1), String(i + 1))); row.appendChild(h("span", "", r[0])); row.appendChild(h("b", "", String(r[1]))); c.appendChild(row) });
    if (rc.th && E.me !== undefined) c.appendChild(btn("btn" + (E.me && rc.sc[E.me] ? " a" : ""), "▶ " + (E.me && rc.sc[E.me] ? T("ЕЩЁ РАЗ", "AGAIN", "ЩЕ РАЗ") : T("ИГРАТЬ", "PLAY", "ГРАТИ")), () => raceGo(rc)));
    else if (rc.th) c.appendChild(btn("btn", "▶ " + T("ИГРАТЬ", "PLAY", "ГРАТИ"), () => raceGo(rc)));
    else c.appendChild(h("div", "ecdim", T("Эта тема есть только в новой версии игры.", "This theme needs a newer version.", "Ця тема є лише в новій версії гри.")));
  }
  function raceGo(rc) {
    const rm = E.room; if (!rm || typeof raceBegin !== "function") return;
    clearInterval(E.timer); E.timer = 0;
    raceBegin({ id: rc.id, seed: rc.seed, room: rm.id, theme: rc.theme, lang: rc.lang });
  }
  function raceNew(themeId) {
    const id = Math.random().toString(36).slice(2, 6), seed = Math.floor(Math.random() * 2147483647), lang = (typeof CFG !== "undefined" && CFG.wl) || "ru";
    E.panel = ""; const m = g("rmMenu"); m.hidden = true;
    sendRaw(PX + "K|" + id + "|" + themeId + "|" + lang + "|" + seed);
  }
  // конец раунда: отправляем результат в комнату и показываем кнопку «В комнату»
  function raceDone(rc, q) {
    if (q || !(score > 0)) return;
    const sc = score, room = rc.room, name = (E.lastRoom && E.lastRoom.id === room ? E.lastRoom.name : "");
    post("/api/echo/room/send", { room, text: PX + "S|" + rc.id + "|" + sc }).catch(() => { });
    let res = g("raceRes");
    if (!res) { res = h("div", "chres w"); res.id = "raceRes"; const a = g("bA"); a.parentNode.insertBefore(res, a) }
    res.textContent = ""; res.className = "chres w";
    res.appendChild(h("div", "", "{flag}" + T("Результат заезда отправлен: ", "Race result sent: ", "Результат заїзду надіслано: ") + sc));
    res.appendChild(btn("btn a", "↩ " + T("В КОМНАТУ", "BACK TO ROOM", "ДО КІМНАТИ"), () => roomOpen(room, name)));
  }

  async function roomPoll(first) {
    const rm = E.room; if (!rm) return;
    if (!g("o17").classList.contains("s")) { clearInterval(E.timer); E.timer = 0; E.room = null; return }
    if (E.busy || document.hidden) return;
    E.busy = true;
    try {
      const r = await cloudRequest("/api/echo/room/msgs?room=" + encodeURIComponent(rm.id) + "&after=" + E.last + "&since=" + (first ? 0 : E.since));
      if (E.room !== rm) return;
      rm.name = r.room.name; rm.mine = r.room.mine; rm.canMod = r.room.mod; rm.about = r.room.about; rm.pin = r.room.pin; rm.members = r.members; E.since = r.now || 0; { const me = r.members.find(x => x.me); if (me) E.me = me.name }
      g("rmT").textContent = "# " + rm.name; IC.t(g("rmS"), "{people}" + r.members.map(x => x.name).slice(0, 4).join(", ") + (r.members.length > 4 ? " +" + (r.members.length - 4) : ""));
      const l = g("rmL"), stick = first || l.scrollHeight - l.scrollTop - l.clientHeight < 80;
      E.live = !first; r.messages.forEach(m => { E.last = Math.max(E.last, m.id); roomAdd(m) }); E.live = false;
      if (E.dn) { if (stick) E.dn.reset(); else { const k = r.messages.filter(m => !m.mine).length; if (k) E.dn.bump(k); else E.dn.upd() } }
      (r.changed || []).forEach(roomChanged); if (r.react) kit.setReact(r.react); if (!first && kit.pollLoad) kit.pollLoad();
      { const pn = g("rmPin"), ab = g("rmAb"); pn.hidden = !rm.pin; if (rm.pin) { pn.textContent = ""; pn.appendChild(h("span", "", "📌 " + rm.pin.who + ": " + rm.pin.text)); pn.onclick = () => kit.jump(rm.pin.id) }
        ab.hidden = !rm.about; ab.textContent = rm.about || ""; }
      { let ty = l.querySelector(".chty"); if (r.typing && r.typing.length && !ty) { ty = h("div", "chty"); l.appendChild(ty) } else if ((!r.typing || !r.typing.length) && ty) { ty.remove(); ty = null } if (ty) { ty.textContent = r.typing.join(", ") + (r.typingK === "voice" ? T(" записывает голосовое", " is recording a voice message", " записує голосове") : T(" печатает", " is typing", " друкує")); if (EchoKit.dots) ty.appendChild(EchoKit.dots()); l.appendChild(ty) } }
      if (!l.querySelector(".msg") && !l.querySelector(".race") && !l.querySelector(".chem")) l.appendChild(h("div", "chem", T("Здесь пока тихо. Напиши первым", "It's quiet here. Write first", "Тут поки тихо. Напиши першим")));
      else if (r.messages.length && l.querySelector(".chem")) l.querySelector(".chem").remove();
      if (stick) l.scrollTop = l.scrollHeight;
      if (window.EchoCall) EchoCall.banner(rm.id, g("rmCall"), () => roomOpen(rm.id, rm.name), rm.name);
      setHint("rmSt", "");
    } catch (e) {
      if (/состоишь|не найден|not found/i.test((e && e.message) || "")) { roomClose(); return }
      setHint("rmSt", (e && e.message) || "", true);
    } finally { E.busy = false }
  }
  async function roomSend(sticker, img) {
    const rm = E.room, inp = g("rmIn"), text = typeof sticker === "string" ? sticker : inp.value.trim(); if (!rm || (!text && !img)) return;
    const was = inp.value; if (typeof sticker !== "string") { inp.value = ""; if (!img) inp.focus() }
    try {
      if (E.edit) { await post("/api/echo/room/edit", { room: rm.id, id: E.edit.id, text }); E.edit = null; E.editWas = false; replyPaint() }
      else { const pl = { room: rm.id, text, img: img || undefined, reply: E.reply ? E.reply.id : undefined };
        try { await post("/api/echo/room/send", pl) }
        catch (e) { if (!(e && e.net)) throw e; const SKx = window.SlovopadStickers; kit.pend.add(g("rmL"), img ? (/^data:audio/.test(img) ? "🎤" : "📷") : ((SKx && SKx.label(text)) || (window.SlovopadGif && SlovopadGif.label(text)) || text), () => post("/api/echo/room/send", pl), () => roomPoll(false)); setHint("rmSt", "", false) }
        E.reply = null; replyPaint() }
      if (typeof sticker !== "string" && EchoKit.draft) EchoKit.draft("r." + rm.id, "");
      E.busy = false; try { await roomPoll(false) } catch (e) { } const l = g("rmL"); l.scrollTop = l.scrollHeight;
    } catch (e) { if (typeof sticker !== "string") inp.value = was; setHint("rmSt", e.message, true) }
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
        const r = h("div", "ecmem"); { const sp = h("span", "", (x.owner ? "{crown}" : x.mod ? "⭐" : "") + x.name + (x.me ? " {check}" : "")), te = window.TagUI && TagUI.el(x.tag); if (te) sp.appendChild(te); if (!x.me) { sp.classList.add("tap"); sp.onclick = () => whoOpen(x.name) } r.appendChild(sp) }
        if (rm.mine && !x.me) r.appendChild(btn("ecx", x.mod ? "⭐" : "☆", async () => { try { await post("/api/echo/room/mod", { room: rm.id, code: x.name, on: !x.mod }); E.panel = ""; m.hidden = true; roomPoll(false) } catch (e) { setHint("rmSt", e.message, true) } }));
        if (rm.canMod && !x.me && !x.owner && (rm.mine || !x.mod)) r.appendChild(btn("ecx", "{close}", async () => { try { await post("/api/echo/room/kick", { room: rm.id, code: x.name }); roomPoll(false); E.panel = ""; m.hidden = true } catch (e) { setHint("rmSt", e.message, true) } }));
        m.appendChild(r);
      });
      m.appendChild(btn("btn a", "←", () => { E.panel = ""; menuPaint() })); return;
    }
    if (E.panel === "about") {
      const inp = h("input", "ecin"); inp.type = "text"; inp.maxLength = 120; inp.value = rm.about || ""; inp.placeholder = T("О чём эта комната", "What this room is about", "Про що ця кімната");
      m.appendChild(inp); m.appendChild(btn("btn", T("СОХРАНИТЬ", "SAVE", "ЗБЕРЕГТИ"), async () => { try { await post("/api/echo/room/about", { room: rm.id, about: inp.value }); E.panel = ""; m.hidden = true; E.busy = false; roomPoll(false) } catch (e) { setHint("rmSt", e.message, true) } }));
      m.appendChild(btn("btn a", "←", () => { E.panel = ""; menuPaint() })); return;
    }
    if (E.panel === "race") {
      (typeof THEMES !== "undefined" ? THEMES : []).forEach(t => m.appendChild(btn("btn a", t.i + " " + tx(t.n), () => raceNew(t.id))));
      m.appendChild(btn("btn a", "←", () => { E.panel = ""; menuPaint() })); return;
    }
    if (E.panel === "poll") {
      const q = h("input", "inp"); q.placeholder = T("Вопрос", "Question", "Питання"); q.maxLength = 120; m.appendChild(q);
      const os = []; for (let i = 0; i < 4; i++) { const o = h("input", "inp"); o.placeholder = T("Вариант ", "Option ", "Варіант ") + (i + 1); o.maxLength = 60; os.push(o); m.appendChild(o) }
      const msg = h("div", "ecdim"); m.appendChild(msg);
      m.appendChild(btn("btn", "📊 " + T("ОТПРАВИТЬ ОПРОС", "SEND POLL", "НАДІСЛАТИ ОПИТУВАННЯ"), async () => {
        const opts = os.map(x => x.value.trim()).filter(Boolean);
        if (!q.value.trim() || opts.length < 2) { msg.textContent = T("Нужен вопрос и минимум два варианта.", "Add a question and at least two options.", "Потрібне питання і мінімум два варіанти."); return }
        try { await post("/api/echo/room/poll/new", { room: rm.id, q: q.value.trim(), opts }); E.panel = ""; g("rmMenu").hidden = true; roomPoll(false) } catch (e) { msg.textContent = (e && e.message) || "" }
      }));
      m.appendChild(btn("btn a", "←", () => { E.panel = ""; menuPaint() })); return;
    }
    m.appendChild(btn("btn", "📊 " + T("СОЗДАТЬ ОПРОС", "CREATE A POLL", "СТВОРИТИ ОПИТУВАННЯ"), () => { E.panel = "poll"; menuPaint() }));
    m.appendChild(btn("btn a", "📌 " + (isPinned("r:" + rm.id) ? T("ОТКРЕПИТЬ ЧАТ", "UNPIN CHAT", "ВІДКРІПИТИ ЧАТ") : T("ЗАКРЕПИТЬ ЧАТ", "PIN CHAT", "ЗАКРІПИТИ ЧАТ")), () => { togglePin("r:" + rm.id); menuPaint() }));
    m.appendChild(btn("btn", "{flag}" + T("НАЧАТЬ ЗАЕЗД", "START A RACE", "ПОЧАТИ ЗАЇЗД"), () => { E.panel = "race"; menuPaint() }));
    m.appendChild(btn("btn a", "＋ " + T("ПРИГЛАСИТЬ ДРУГА", "INVITE A FRIEND", "ЗАПРОСИТИ ДРУГА"), () => { E.panel = "inv"; menuPaint() }));
    if (rm.canMod) m.appendChild(btn("btn a", "✎ " + T("ОПИСАНИЕ КОМНАТЫ", "ROOM DESCRIPTION", "ОПИС КІМНАТИ"), () => { E.panel = "about"; menuPaint() }));
    m.appendChild(btn("btn a", "{people}" + T("УЧАСТНИКИ", "MEMBERS", "УЧАСНИКИ"), () => { E.panel = "mem"; menuPaint() }));
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
    b.firstChild.nodeType === 3 && (b.firstChild.textContent = T("ЭХО", "ECHO", "ЕХО"));
    b.onclick = hubOpen;
  }
  const _over = window.over;
  if (typeof _over === "function") window.over = function (q) { const rc = typeof RACE !== "undefined" ? RACE : null; const r = _over.apply(this, arguments); try { if (state === "over") { const old = g("raceRes"); if (old) old.remove(); if (rc) { RACE = null; raceDone(rc, q) } } } catch (e) { } return r };
  build(); wireMenuBtn();
  window.SlovopadEcho = { rooms: () => (E.rooms || []).slice(), open: hubOpen, roomOpen, relabel: wireMenuBtn, badge: () => { labels() } };
  const _menu = window.menu;
  if (typeof _menu === "function") window.menu = function () { const r = _menu.apply(this, arguments); try { wireMenuBtn() } catch (e) { } return r };
})();
