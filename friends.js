/* СЛОВОПАД — друзья.
   Экран «Друзья»: список со статусом «в сети», топ среди друзей, запросы (с подтверждением), профиль друга и вызовы «побей мой счёт».
   Подключается после app.js. Использует: cloudRequest, sidTok, sidOpen, ov, L3, THEMES, gbest, CFG, TH, GL, WL, lw, best, size, start, state, score, PR, tx. */
(function () {
  "use strict";
  const T = (a, b, c) => L3(a, b, c);
  const g = id => document.getElementById(id);
  let data = null, tab = 0, pick = null, cur = null, busy = false, CH = null, lastErr = "";
  const badge = { r: 0, c: 0 };

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
    const after = g("o11");
    after.parentNode.insertBefore(o, after.nextSibling); o.parentNode.insertBefore(p, o.nextSibling);
    g("frBk").onclick = () => { pick = null; ov("o1"); };
    g("fpBk").onclick = () => { render(); ov("o13"); };
    g("frAdd").onclick = addFriend;
    g("frIn").addEventListener("keydown", e => { if (e.key === "Enter") addFriend(); });
    const fb = g("frB"); if (fb) fb.onclick = () => open();
  }

  function labels() {
    const o = g("o13"); o.querySelector("h2").textContent = T("ДРУЗЬЯ", "FRIENDS", "ДРУЗІ");
    g("frIn").placeholder = T("Код SP-… или ник друга", "Friend's SP-code or nickname", "Код SP-… або нік друга");
    g("fpBk").textContent = T("← НАЗАД", "← BACK", "← НАЗАД");
  }

  /* ---------- загрузка и отрисовка ---------- */
  async function load(silent) {
    if (!sidTok() || busy) return;
    busy = true;
    try { data = await cloudRequest("/api/friends"); badge.r = data.incoming.length; badge.c = data.challenges.incoming.length; paintBadge(); if (!silent) setStatus(""); }
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
      const act = pick ? btn("frgo", T("ВЫЗВАТЬ", "CHALLENGE", "ВИКЛИК"), e => { e.stopPropagation(); sendChallenge(f, pick) }) : scoreTag(f);
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

  /* ---------- вход на экран, значок, «я здесь» ---------- */
  async function open(fromPick) {
    build(); labels(); if (!fromPick) pick = null;
    cur = null; render(); ov("o13"); g("o13").scrollTop = 0;
    if (sidTok()) { setStatus(""); await load() }
  }
  function paintBadge() {
    const b = g("frBd"); if (!b) return; const n = badge.r + badge.c; b.hidden = !n; b.textContent = n > 9 ? "9+" : String(n);
  }
  let lastPing = 0;
  async function ping(force) {
    if (!sidTok() || document.hidden || (force !== true && Date.now() - lastPing < 20000)) return;
    lastPing = Date.now();
    try { const r = await post("/api/ping"); badge.r = r.requests; badge.c = r.challenges; paintBadge() } catch (e) { }
  }

  build();
  window.SlovopadFriends = { open, load };
  const _over = window.over;
  if (typeof _over === "function") window.over = function (q) { const r = _over.apply(this, arguments); try { if (state === "over") afterOver(q) } catch (e) { } return r };
  const _menu = window.menu;
  if (typeof _menu === "function") window.menu = function () { CH = null; const r = _menu.apply(this, arguments); ping(); return r };
  setTimeout(() => ping(true), 1500); setInterval(() => ping(true), 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) ping(true) });
})();
