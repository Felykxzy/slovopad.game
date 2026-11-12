/* СЛОВОПАД — друзья.
   Экран «Друзья»: список со статусом «в сети», топ среди друзей, запросы (с подтверждением), профиль друга и вызовы «побей мой счёт».
   Подключается после app.js. Использует: cloudRequest, sidTok, sidOpen, ov, L3, THEMES, gbest, CFG, TH, GL, WL, lw, best, size, start, state, score, PR, tx. */
(function () {
  "use strict";
  const T = (a, b, c) => L3(a, b, c);
  const g = id => document.getElementById(id);
  let data = null, tab = 0, pick = null, cur = null, busy = false, CH = null, lastErr = "";
  const badge = { r: 0, c: 0, m: 0, k: 0 };
  let backFn = null, openFrom = null;
  const REACTS = ["🔥", "👏", "😂", "😎", "💪", "🎯", "❤️", "👋", "🤯", "🥳"];
  const chat = { p: null, last: 0, timer: 0, blocked: false, busy: false, sure: 0 };

  function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function btn(cls, text, fn) { const b = h("button", cls, text); b.type = "button"; b.onclick = fn; return b; }
  const post = (path, body) => cloudRequest(path, { method: "POST", body: JSON.stringify(body || {}) });
  const themeOf = id => THEMES.find(t => t.id === id);
  const wordLang = i => ["РУС", "ENG", "УКР"][i] || "";

  function ago(ms) {
    const m = Math.max(1, Math.round((Date.now() - ms) / 60000));
    if (m < 60) return T(m + " мин назад", m + " min ago", m + " хв тому");
    const hh = Math.round(m / 60); if (hh < 24) return T(hh + " ч назад", hh + " h ago", hh + " год тому");
    const d = Math.round(hh / 24); return T(d + " дн. назад", d + " d ago", d + " дн. тому");
  }
  function status(p) {
    if (p.online) return T("в сети", "online", "у мережі");
    if (p.seen) return T("был(а) ", "seen ", "був(ла) ") + ago(p.seen);
    return "";
  }
  function avatar(p, size) {
    const a = h("div", "fav"); a.style.width = a.style.height = size + "px"; a.style.fontSize = Math.round(size * .5) + "px";
    a.textContent = p.avatar || (p.username || "?").charAt(0).toUpperCase();
    if (p.online) a.classList.add("on");
    return a;
  }
  const setStatus = (msg, bad) => { lastErr = msg || ""; const e = g("frSt"); if (e) { e.textContent = lastErr; e.classList.toggle("bad", !!bad) } };

  /* ---------- каркас экранов ---------- */
  function build() {
    if (g("o13")) return;
    const o = h("div", "ov sc"); o.id = "o13";
    o.innerHTML = '<div class="frh"><button class="ib" id="frBk" type="button">←</button><div class="frt"><h2></h2><div class="sub" id="frMe"></div></div></div>' +
      '<div class="fradd gl"><input id="frIn" type="text" maxlength="30" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn" id="frAdd" type="button">＋</button></div>' +
      '<div class="frtabs" id="frTabs"></div><div class="frlist" id="frList"></div><div class="hint" id="frSt"></div>';
    const p = h("div", "ov sc"); p.id = "o14";
    p.innerHTML = '<div class="fph" id="fpH"></div><div class="frlist" id="fpB"></div><div class="hint" id="fpSt"></div><div class="mb"><button class="btn" id="fpBk" type="button"></button></div>';
    const c15 = h("div", "ov"); c15.id = "o15";
    c15.innerHTML = '<div class="frh"><button class="ib" id="chBk" type="button">←</button><div class="frt"><h2 id="chT"></h2><div class="sub" id="chS"></div></div><button class="ib" id="chMn" type="button">⋯</button></div>' +
      '<div class="chmenu" id="chMenu" hidden><button class="btn a" id="chBl" type="button"></button><button class="btn a" id="chRpb" type="button"></button></div>' +
      '<div class="chl" id="chL"></div><div class="hint" id="chSt"></div>' +
      '<div class="chrp" id="chRp" hidden></div>' +
      '<div class="chbar"><button class="ib chrx" id="chRx" type="button" aria-label="reactions">😊</button><input id="chIn" type="text" maxlength="120" autocomplete="off" enterkeyhint="send"><button class="btn chsn" id="chSn" type="button">➤</button></div>';
    const after = g("o11");
    after.parentNode.insertBefore(o, after.nextSibling); o.parentNode.insertBefore(p, o.nextSibling); p.parentNode.insertBefore(c15, p.nextSibling);
    chatWire();
    g("frBk").onclick = () => { pick = null; if (openFrom) { const f = openFrom; openFrom = null; f(); return } ov("o1"); };
    g("fpBk").onclick = () => { render(); ov("o13"); };
    g("frAdd").onclick = addFriend;
    g("frIn").addEventListener("keydown", e => { if (e.key === "Enter") addFriend(); });
    const fb = g("frB"); if (fb) fb.onclick = () => open();
  }

  function labels() {
    g("frBk").parentNode.querySelector("h2").textContent = T("ДРУЗЬЯ", "FRIENDS", "ДРУЗІ");
    g("frIn").placeholder = T("Код SP-… или ник друга", "Friend's SP-code or nickname", "Код SP-… або нік друга");
    g("fpBk").textContent = T("← НАЗАД", "← BACK", "← НАЗАД");
  }

  /* ---------- загрузка и отрисовка ---------- */
  async function load(silent) {
    if (!sidTok() || busy) return;
    busy = true;
    try { data = await cloudRequest("/api/friends"); badge.r = data.incoming.length; badge.c = data.challenges.incoming.length; badge.m = data.friends.reduce((s, x) => s + (x.unread || 0), 0); paintBadge(); if (!silent) setStatus(""); }
    catch (e) { if (!silent) setStatus(e.message, true); }
    finally { busy = false }
    if (g("o13").classList.contains("s")) render();
    if (g("o14").classList.contains("s") && cur) profile(cur.spCode, true);
  }

  function tabsRender() {
    const box = g("frTabs"); box.textContent = "";
    const reqN = data ? data.incoming.length + data.challenges.incoming.length : 0;
    [T("ДРУЗЬЯ", "FRIENDS", "ДРУЗІ"), T("ТОП", "TOP", "ТОП"), T("ЗАПРОСЫ", "REQUESTS", "ЗАПИТИ")].forEach((n, i) => {
      const b = btn("frtab" + (tab === i ? " a" : ""), n, () => { tab = i; render(); });
      if (i === 2 && reqN) { const d = h("i", "bdg", String(reqN)); b.appendChild(d) }
      box.appendChild(b);
    });
  }

  function render() {
    const box = g("frList"); box.textContent = "";
    labels();
    const logged = !!sidTok();
    g("frTabs").style.display = g("frAdd").parentNode.style.display = logged ? "" : "none";
    if (!logged) {
      g("frMe").textContent = "";
      const c = h("div", "frempty gl"); c.append(h("div", "fre-i", "👥"), h("div", "fre-t", T("Друзья живут в Slovopad ID", "Friends live in Slovopad ID", "Друзі живуть у Slovopad ID")),
        h("div", "fre-s", T("Войди в аккаунт, чтобы добавлять друзей, видеть, кто в сети, и бросать вызовы.", "Log in to add friends, see who is online and send challenges.", "Увійди в акаунт, щоб додавати друзів, бачити, хто в мережі, і кидати виклики.")),
        btn("btn", T("ВОЙТИ", "LOG IN", "УВІЙТИ"), () => sidOpen()));
      box.appendChild(c); return;
    }
    if (!data) { box.appendChild(h("div", "hint", "…")); return }
    const me = g("frMe"); me.textContent = ""; me.append(T("ТВОЙ КОД: ", "YOUR CODE: ", "ТВІЙ КОД: "));
    const code = h("b", "frcode", data.me.spCode); code.title = T("Нажми, чтобы скопировать", "Tap to copy", "Натисни, щоб скопіювати");
    code.onclick = () => { try { navigator.clipboard.writeText(data.me.spCode); setStatus(T("Код скопирован", "Code copied", "Код скопійовано")) } catch (e) { } };
    me.appendChild(code);
    tabsRender();
    if (tab === 0) listTab(box); else if (tab === 1) topTab(box); else reqTab(box);
    if (pick) { const n = h("div", "frpick gl", T("Выбери друга, которого вызвать: ", "Pick a friend to challenge: ", "Обери друга для виклику: ") + tx((themeOf(pick.theme) || {}).n || "") + " · " + pick.score); box.insertBefore(n, box.firstChild) }
  }

  function row(p, right, onTap, extra) {
    const r = h("div", "frrow gl" + (onTap ? " tap" : ""));
    r.appendChild(avatar(p, 44));
    const m = h("div", "frm"); m.appendChild(h("div", "frn", p.username));
    const st = extra || status(p); if (st) m.appendChild(h("div", "frs" + (p.online && !extra ? " on" : ""), st));
    r.appendChild(m); if (right) r.appendChild(right);
    if (onTap) r.onclick = onTap;
    return r;
  }
  const scoreTag = p => h("div", "frsc", p.bestScore === null || p.bestScore === undefined ? "—" : String(p.bestScore));

  function listTab(box) {
    if (!data.friends.length) {
      const c = h("div", "frempty gl"); c.append(h("div", "fre-i", "🤝"), h("div", "fre-t", T("Пока нет друзей", "No friends yet", "Поки немає друзів")),
        h("div", "fre-s", T("Введи код SP-… или ник друга сверху. Он получит запрос и должен его принять. Свой код отправь другу.", "Enter a friend's SP-code or nickname above. They get a request and must accept it. Send your own code to a friend.", "Введи код SP-… або нік друга вгорі. Він отримає запит і має його прийняти. Свій код надішли другу.")));
      box.appendChild(c); return;
    }
    const on = data.friends.filter(f => f.online).length;
    box.appendChild(h("div", "frsec", T("В СЕТИ: ", "ONLINE: ", "У МЕРЕЖІ: ") + on + " / " + data.friends.length));
    const sorted = [...data.friends].sort((a, b) => (b.online - a.online) || ((b.bestScore || 0) - (a.bestScore || 0)));
    sorted.forEach(f => {
      let act;
      if (pick) act = btn("frgo", T("ВЫЗВАТЬ", "CHALLENGE", "ВИКЛИК"), e => { e.stopPropagation(); sendChallenge(f, pick) });
      else {
        act = h("div", "fracts"); const cb = btn("frchat", "💬", e => { e.stopPropagation(); chatOpen(f) });
        if (f.unread) cb.appendChild(h("i", "bdg", f.unread > 9 ? "9+" : String(f.unread)));
        act.append(scoreTag(f), cb);
      }
      box.appendChild(row(f, act, () => profile(f.spCode)));
    });
  }

  function topTab(box) {
    const all = data.friends.map(f => ({ ...f, me: false })); all.push({ username: data.me.username, spCode: data.me.spCode, avatar: (typeof PF === "object" && PF && PF.a) || "", bestScore: data.me.bestScore, online: false, me: true });
    all.sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0) || a.username.localeCompare(b.username));
    if (all.length === 1) box.appendChild(h("div", "hint", T("Добавь друзей — здесь появится ваш общий рейтинг.", "Add friends to see your shared ranking here.", "Додай друзів — тут з’явиться ваш спільний рейтинг.")));
    all.forEach((p, i) => {
      const medal = h("div", "frmed", i < 3 ? ["🥇", "🥈", "🥉"][i] : String(i + 1));
      const r = row(p, scoreTag(p), p.me ? null : () => profile(p.spCode), p.me ? T("это ты", "that's you", "це ти") : null);
      r.insertBefore(medal, r.firstChild); if (p.me) r.classList.add("me");
      box.appendChild(r);
    });
    box.appendChild(h("div", "hint", T("Рекорды видны, если игрок их не скрыл в настройках приватности.", "Records are visible unless the player hid them in privacy settings.", "Рекорди видно, якщо гравець не сховав їх у налаштуваннях приватності.")));
  }

  function reqTab(box) {
    const chIn = data.challenges.incoming, inc = data.incoming, out = data.outgoing, sent = data.challenges.sent;
    if (!chIn.length && !inc.length && !out.length && !sent.length) { box.appendChild(h("div", "hint", T("Пока пусто. Здесь будут запросы в друзья и вызовы.", "Nothing here yet. Friend requests and challenges will show up here.", "Поки порожньо. Тут будуть запити в друзі та виклики."))); return }
    if (chIn.length) box.appendChild(h("div", "frsec", T("ВЫЗОВЫ ТЕБЕ", "CHALLENGES FOR YOU", "ВИКЛИКИ ТОБІ")));
    chIn.forEach(c => {
      const t = themeOf(c.theme), name = t ? tx(t.n) : c.theme;
      const acts = h("div", "fracts");
      acts.append(btn("frgo", T("ИГРАТЬ", "PLAY", "ГРАТИ"), () => playChallenge(c)), btn("frno", "✕", () => act(() => post("/api/challenge/remove", { id: c.id }))));
      box.appendChild(row(c.from, acts, null, "⚔ " + (t ? t.i + " " : "") + name + " · " + T("побей ", "beat ", "поб’й ") + c.score + " (" + wordLang(c.lang) + ")"));
    });
    if (inc.length) box.appendChild(h("div", "frsec", T("ХОТЯТ В ДРУЗЬЯ", "WANT TO BE FRIENDS", "ХОЧУТЬ У ДРУЗІ")));
    inc.forEach(p => {
      const acts = h("div", "fracts");
      acts.append(btn("frgo", "✓", () => act(() => post("/api/friends/respond", { code: p.spCode, accept: true }))), btn("frno", "✕", () => act(() => post("/api/friends/respond", { code: p.spCode, accept: false }))));
      box.appendChild(row(p, acts, null, p.spCode));
    });
    if (out.length) box.appendChild(h("div", "frsec", T("ОТПРАВЛЕНО — ЖДЁМ ОТВЕТА", "SENT — WAITING FOR A REPLY", "НАДІСЛАНО — ЧЕКАЄМО ВІДПОВІДІ")));
    out.forEach(p => box.appendChild(row(p, btn("frno", "✕", () => act(() => post("/api/friends/remove", { code: p.spCode }))), null, p.spCode)));
    if (sent.length) box.appendChild(h("div", "frsec", T("МОИ ВЫЗОВЫ", "MY CHALLENGES", "МОЇ ВИКЛИКИ")));
    sent.forEach(c => {
      const t = themeOf(c.theme), won = c.state === "won";
      const tag = h("div", "frsc " + (won ? "w" : ""), won ? "✓ " + c.result : T("ждёт", "waiting", "чекає"));
      box.appendChild(row(c.to, tag, null, "⚔ " + (t ? t.i + " " : "") + (t ? tx(t.n) : c.theme) + " · " + c.score));
    });
  }

  async function act(fn) { try { await fn(); setStatus("") } catch (e) { setStatus(e.message, true) } await load(true); render() }

  async function addFriend() {
    const q = g("frIn").value.trim(); if (!q) return;
    g("frAdd").disabled = true;
    try {
      const r = await post("/api/friends/request", { q });
      g("frIn").value = "";
      setStatus(r.state === "accepted" ? T("Теперь вы друзья с ", "You are now friends with ", "Тепер ви друзі з ") + r.username + " ✓" : T("Запрос отправлен: ", "Request sent: ", "Запит надіслано: ") + r.username + T(". Ждём, когда он согласится.", ". Waiting for them to accept.", ". Чекаємо, коли він погодиться."));
      await load(true); render();
    } catch (e) { setStatus(e.message, true) }
    finally { g("frAdd").disabled = false }
  }

  /* ---------- профиль друга ---------- */
  async function profile(spCode, quiet) {
    if (!data) return;
    const p = data.friends.find(f => f.spCode === spCode); if (!p) { if (quiet) { render(); ov("o13") } return }
    cur = p;
    const head = g("fpH"); head.textContent = "";
    head.append(avatar(p, 112), h("div", "fpn", p.username), h("div", "fps" + (p.online ? " on" : ""), status(p) || " "), h("div", "fpc", p.spCode));
    const box = g("fpB"); box.textContent = "";
    const stats = h("div", "fpst");
    [[T("РЕКОРД", "BEST", "РЕКОРД"), p.bestScore], [T("СЛОВ ВСЕГО", "WORDS", "СЛІВ УСЬОГО"), p.totalWords]].forEach(([k, v]) => { const d = h("div", "gl"); d.append(h("b", "", v === null || v === undefined ? "—" : String(v)), h("span", "", k)); stats.appendChild(d) });
    box.appendChild(stats);
    if (p.bestScore === null) box.appendChild(h("div", "hint", T("Друг скрыл цифры в настройках приватности.", "This friend hides numbers in privacy settings.", "Друг сховав цифри в налаштуваннях приватності.")));
    const mine = data.challenges.sent.filter(c => c.to.spCode === spCode && c.state === "won").length;
    if (mine) box.appendChild(h("div", "hint", T("Вызовов, которые он побил: ", "Challenges they beat: ", "Викликів, які він побив: ") + mine));
    box.appendChild(btn("btn", "💬 " + T("НАПИСАТЬ", "MESSAGE", "НАПИСАТИ"), () => chatOpen(p)));
    const c = h("div", "fpchal"); box.appendChild(c);
    c.appendChild(btn("btn", "⚔ " + T("ВЫЗВАТЬ", "CHALLENGE", "КИНУТИ ВИКЛИК"), () => themeChooser(p, c)));
    let sure = 0;
    const del = btn("btn a fpdel", T("УДАЛИТЬ ИЗ ДРУЗЕЙ", "REMOVE FRIEND", "ВИДАЛИТИ З ДРУЗІВ"), () => {
      if (!sure) { sure = 1; del.textContent = T("ТОЧНО УДАЛИТЬ?", "REALLY REMOVE?", "ТОЧНО ВИДАЛИТИ?"); setTimeout(() => { sure = 0; del.textContent = T("УДАЛИТЬ ИЗ ДРУЗЕЙ", "REMOVE FRIEND", "ВИДАЛИТИ З ДРУЗІВ") }, 3000); return }
      post("/api/friends/remove", { code: p.spCode }).then(() => load(true)).then(() => { cur = null; render(); ov("o13") }).catch(e => { g("fpSt").textContent = e.message });
    });
    box.appendChild(del);
    g("fpBk").textContent = T("← НАЗАД", "← BACK", "← НАЗАД");
    g("fpSt").textContent = "";
    ov("o14"); g("o14").scrollTop = 0;
  }

  function themeChooser(p, host) {
    host.textContent = "";
    const list = THEMES.filter(t => gbest(t) > 0);
    if (!list.length) { host.appendChild(h("div", "hint", T("Сначала сыграй хотя бы один раунд — вызов отправляется с твоим рекордом в теме.", "Play at least one round first — a challenge is sent with your best score in a theme.", "Спершу зіграй хоча б один раунд — виклик надсилається з твоїм рекордом у темі."))); return }
    host.appendChild(h("div", "frsec", T("ТВОЙ РЕКОРД В ТЕМЕ — ЧТО ПОБИВАТЬ", "YOUR BEST IN A THEME — WHAT TO BEAT", "ТВІЙ РЕКОРД У ТЕМІ — ЩО ПОБИВАТИ")));
    list.forEach(t => {
      const b = btn("frth gl", "", () => sendChallenge(p, { theme: t.id, score: gbest(t), lang: CFG.wl }));
      b.append(h("span", "", t.i + " " + tx(t.n)), h("b", "", String(gbest(t)))); host.appendChild(b);
    });
  }

  async function sendChallenge(p, payload) {
    try {
      const r = await post("/api/challenge", { code: p.spCode, theme: payload.theme, score: payload.score, lang: payload.lang });
      pick = null; await load(true);
      toast(T("Вызов отправлен: ", "Challenge sent: ", "Виклик надіслано: ") + r.username + " ⚔");
      render(); ov("o13");
    } catch (e) { setStatus(e.message, true); const f = g("fpSt"); if (f) f.textContent = e.message }
  }
  function toast(m) { setStatus(m) }

  /* ---------- принять вызов ---------- */
  function playChallenge(c) {
    const t = themeOf(c.theme); if (!t) return;
    CH = { id: c.id, score: c.score, from: c.from.username };
    const old = CFG.wl; CFG.wl = c.lang;
    try { TH = t; GL = c.lang; WL = lw(t).split(" "); best = gbest(t); } finally { CFG.wl = old }
    size(); start();
  }

  /* ---------- конец раунда ---------- */
  function afterOver(q) {
    build();
    let res = g("chRes"), bt = g("frCh");
    if (!res) { res = h("div", "chres"); res.id = "chRes"; const a = g("bA"); a.parentNode.insertBefore(res, a) }
    if (!bt) { bt = btn("btn a", "", () => { pick = { theme: TH.id, score: score, lang: GL }; open(true) }); bt.id = "frCh"; const sh = g("bH"); sh.parentNode.insertBefore(bt, sh) }
    res.textContent = ""; res.className = "chres";
    bt.textContent = "⚔ " + T("ВЫЗВАТЬ ДРУГА", "CHALLENGE A FRIEND", "КИНУТИ ВИКЛИК ДРУГУ");
    bt.hidden = !(sidTok() && score > 0 && !q);
    if (CH) {
      const mine = CH;
      if (score > mine.score) { res.classList.add("w"); res.textContent = "⚔ " + T("Вызов выполнен! Ты побил ", "Challenge complete! You beat ", "Виклик виконано! Ти побив ") + mine.from + " ✓"; CH = null }
      else { res.classList.add("l"); res.textContent = "⚔ " + T("Не хватило. Нужно больше ", "Not enough. You need more than ", "Не вистачило. Потрібно більше ") + mine.score }
      post("/api/challenge/done", { id: mine.id, score }).then(load.bind(null, true)).catch(() => { });
    }
  }


  /* ---------- чат с другом ---------- */
  const clock = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") };
  function chatWire() {
    g("chBk").onclick = chatClose;
    g("chSn").onclick = chatSend;
    g("chIn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); chatSend() } });
    g("chRx").onclick = () => { const r = g("chRp"); r.hidden = !r.hidden; g("chMenu").hidden = true };
    g("chMn").onclick = () => { g("chMenu").hidden = !g("chMenu").hidden; g("chRp").hidden = true; chatMenuLabels() };
    g("chBl").onclick = chatBlock;
    g("chRpb").onclick = chatReport;
    const r = g("chRp"); REACTS.forEach(x => r.appendChild(btn("chre", x, () => { r.hidden = true; chatSend(x) })));
    if (window.visualViewport) {
      const fit = () => { const o = g("o15"); if (!o || !o.classList.contains("s")) return; const v = window.visualViewport; o.style.height = v.height + "px"; o.style.transform = "translateY(" + v.offsetTop + "px)"; const l = g("chL"); l.scrollTop = l.scrollHeight };
      window.visualViewport.addEventListener("resize", fit); window.visualViewport.addEventListener("scroll", fit);
    }
  }
  function chatLabels() {
    g("chIn").placeholder = T("Сообщение…", "Message…", "Повідомлення…");
    g("chBl").textContent = chat.blocked ? T("РАЗБЛОКИРОВАТЬ", "UNBLOCK", "РОЗБЛОКУВАТИ") : T("ЗАБЛОКИРОВАТЬ", "BLOCK", "ЗАБЛОКУВАТИ");
    chatMenuLabels();
  }
  function chatMenuLabels() {
    g("chBl").textContent = chat.blocked ? T("РАЗБЛОКИРОВАТЬ", "UNBLOCK", "РОЗБЛОКУВАТИ") : T("ЗАБЛОКИРОВАТЬ", "BLOCK", "ЗАБЛОКУВАТИ");
    g("chRpb").textContent = chat.sure ? T("ТОЧНО ПОЖАЛОВАТЬСЯ?", "REALLY REPORT?", "ТОЧНО СКАРЖИТИСЬ?") : T("ПОЖАЛОВАТЬСЯ", "REPORT", "СКАРЖИТИСЬ");
  }
  function chatOpen(p) {
    build(); chat.p = p; chat.last = 0; chat.blocked = false; chat.sure = 0;
    g("chL").textContent = ""; g("chSt").textContent = ""; g("chMenu").hidden = true; g("chRp").hidden = true; g("chIn").value = "";
    g("chT").textContent = p.username; g("chS").textContent = status(p) || " ";
    chatLabels(); ov("o15"); chatFit();
    chatPoll(true);
    clearInterval(chat.timer); chat.timer = setInterval(() => chatPoll(false), 8000);
  }
  function chatFit() { const o = g("o15"), v = window.visualViewport; if (v) { o.style.height = v.height + "px"; o.style.transform = "translateY(" + v.offsetTop + "px)" } }
  function chatClose() {
    clearInterval(chat.timer); chat.timer = 0; chat.p = null;
    const o = g("o15"); o.style.height = ""; o.style.transform = "";
    g("chIn").blur();
    if (backFn) { const f = backFn; backFn = null; f(); return }
    g("chIn").blur(); load(true).then(() => { render() }); render(); ov("o13");
  }
  function chatAdd(m) {
    const l = g("chL"), box = h("div", "chm" + (m.mine ? " me" : "") + (m.kind === "react" ? " rx" : ""));
    box.appendChild(h("span", "chb", m.body)); box.appendChild(h("i", "cht", clock(m.t)));
    l.appendChild(box);
  }
  async function chatPoll(first) {
    if (!chat.p) return;
    if (!g("o15").classList.contains("s")) { clearInterval(chat.timer); chat.timer = 0; chat.p = null; return }
    if (chat.busy || document.hidden) return;
    chat.busy = true; const who = chat.p;
    try {
      const r = await cloudRequest("/api/chat?with=" + encodeURIComponent(who.spCode) + "&after=" + chat.last);
      if (chat.p !== who) return;
      chat.blocked = !!r.blocked; chatLabels();
      const l = g("chL"), stick = first || l.scrollHeight - l.scrollTop - l.clientHeight < 80;
      r.messages.forEach(m => { chat.last = Math.max(chat.last, m.id); chatAdd(m) });
      if (!l.children.length && !l.querySelector(".chem")) { const e = h("div", "chem", T("Напиши первым или отправь реакцию 😊", "Write first or send a reaction 😊", "Напиши першим або надішли реакцію 😊")); l.appendChild(e) }
      else if (r.messages.length && l.querySelector(".chem")) l.querySelector(".chem").remove();
      if (stick) l.scrollTop = l.scrollHeight;
      g("chIn").disabled = g("chSn").disabled = g("chRx").disabled = chat.blocked;
      g("chSt").textContent = chat.blocked ? T("Ты заблокировал этого игрока.", "You blocked this player.", "Ти заблокував цього гравця.") : "";
      who.unread = 0;
    } catch (e) { if (chat.p === who) g("chSt").textContent = e.message }
    finally { chat.busy = false }
  }
  async function chatSend(react) {
    if (!chat.p || chat.blocked) return;
    const inp = g("chIn"), text = typeof react === "string" ? "" : inp.value.trim();
    if (typeof react !== "string" && !text) return;
    g("chSn").disabled = true;
    try {
      await post("/api/chat/send", typeof react === "string" ? { to: chat.p.spCode, react } : { to: chat.p.spCode, text });
      if (typeof react !== "string") inp.value = "";
      g("chSt").textContent = ""; chat.busy = false; await chatPoll(true);
    } catch (e) { g("chSt").textContent = e.message }
    finally { g("chSn").disabled = chat.blocked }
    if (typeof react !== "string" && !("ontouchstart" in window)) inp.focus();
  }
  async function chatBlock() {
    if (!chat.p) return;
    try { const r = await post("/api/chat/block", { to: chat.p.spCode, on: !chat.blocked }); chat.blocked = r.blocked; g("chMenu").hidden = true; chat.busy = false; await chatPoll(false) }
    catch (e) { g("chSt").textContent = e.message }
  }
  async function chatReport() {
    if (!chat.p) return;
    if (!chat.sure) { chat.sure = 1; chatMenuLabels(); setTimeout(() => { chat.sure = 0; chatMenuLabels() }, 4000); return }
    chat.sure = 0; chatMenuLabels();
    try { await post("/api/chat/report", { to: chat.p.spCode }); g("chMenu").hidden = true; g("chSt").textContent = T("Жалоба отправлена. Можно ещё и заблокировать игрока.", "Report sent. You can also block the player.", "Скаргу надіслано. Можна ще й заблокувати гравця.") }
    catch (e) { g("chSt").textContent = e.message }
  }

  /* ---------- вход на экран, значок, «я здесь» ---------- */
  async function open(fromPick) {
    build(); labels(); if (!fromPick) pick = null;
    cur = null; render(); ov("o13"); g("o13").scrollTop = 0;
    if (sidTok()) { setStatus(""); await load() }
  }
  function paintBadge() {
    const b = g("frBd"); if (b) { const n = badge.r + badge.c; b.hidden = !n; b.textContent = n > 9 ? "9+" : String(n) }
    const e = g("echoBd"); if (e) { const k = badge.r + badge.c + badge.m + badge.k; e.hidden = !k; e.textContent = k > 9 ? "9+" : String(k) }
    try { if (window.SlovopadEcho) window.SlovopadEcho.badge() } catch (x) { }
  }
  let lastPing = 0;
  async function ping(force) {
    if (!sidTok() || document.hidden || (force !== true && Date.now() - lastPing < 20000)) return;
    lastPing = Date.now();
    try { const r = await post("/api/ping"); badge.r = r.requests; badge.c = r.challenges; badge.m = r.messages || 0; badge.k = r.rooms || 0; paintBadge() } catch (e) { }
  }

  build();
  window.SlovopadFriends = { open, load, chatOpen, badges: () => badge, openFriends: f => { openFrom = f; open() }, setBack: f => { backFn = f } };
  const _over = window.over;
  if (typeof _over === "function") window.over = function (q) { const r = _over.apply(this, arguments); try { if (state === "over") afterOver(q) } catch (e) { } return r };
  const _menu = window.menu;
  if (typeof _menu === "function") window.menu = function () { CH = null; const r = _menu.apply(this, arguments); ping(); return r };
  setTimeout(() => ping(true), 1500); setInterval(() => ping(true), 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) ping(true) });
})();
