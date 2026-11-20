/* СЛОВОПАД — «Эхо»: общие детали сообщений для личного чата (friends.js) и комнат (echo.js):
   цитата-ответ, картинка, текст с @ником, отметки «изм.» и «прочитано», реакции, меню сообщения, стикеры, сжатие фото.
   Подключается ДО friends.js и echo.js. Использует: L3. */
(function () {
  "use strict";
  const T = (a, b, c) => L3(a, b, c);
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const clock = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") };
  const EMO = ["👍", "❤️", "😂", "🔥", "😮", "😢"];
  const STK = ["😀", "😂", "🥹", "😍", "😎", "🤯", "🥳", "😭", "🙏", "👏", "🔥", "💯", "❤️", "💔", "👍", "👎", "🎉", "🤝", "😴", "🤔", "😡", "🫶", "💪", "👀"];
  // сообщение из одних смайликов (1–3 штуки) показываем крупно, как стикер
  const bigRe = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*\s?){1,3}$/u;

  // фото с телефона → маленькая картинка, чтобы чат оставался лёгким (до ~100 КБ)
  async function compress(file) {
    if (!file || !/^image\//.test(file.type)) throw new Error(T("Выбери картинку.", "Pick an image.", "Обери картинку."));
    const url = URL.createObjectURL(file);
    try {
      const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(T("Не удалось открыть картинку.", "Could not open the image.", "Не вдалося відкрити картинку."))); i.src = url });
      let side = 720, out = "";
      for (let k = 0; k < 6; k++) {
        const sc = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.naturalWidth * sc)); c.height = Math.max(1, Math.round(im.naturalHeight * sc));
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        for (const q of [0.72, 0.6, 0.48]) { out = c.toDataURL("image/jpeg", q); if (out.length <= 125000) return out }
        side = Math.round(side * 0.75);
      }
      throw new Error(T("Картинка слишком большая.", "The image is too large.", "Картинка завелика."));
    } finally { URL.revokeObjectURL(url) }
  }

  // фото на весь экран: вырастает из миниатюры; потяни вниз или нажми, чтобы вернуть на место
  function viewer(src, from) {
    const v = h("div", "ekview"), i = h("img"); i.src = src; v.appendChild(i); v.style.background = "rgba(0,0,0,0)"; document.body.appendChild(v);
    let gone = false, moved = false, y0 = 0, dy = 0, on = false;
    const still = matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches;
    const back = () => { const r = from && from.isConnected ? from.getBoundingClientRect() : null, q = i.getBoundingClientRect(); if (!r || !q.width) return ""; return "translate(" + (r.left + r.width / 2 - q.left - q.width / 2 + 0) + "px," + (r.top + r.height / 2 - q.top - q.height / 2) + "px) scale(" + (r.width / q.width) + "," + (r.height / q.height) + ")" };
    const open = () => { if (gone) return; const t = still ? "" : back(); if (t) { i.style.transition = "none"; i.style.transform = t; i.getBoundingClientRect(); requestAnimationFrame(() => { i.style.transition = "transform .32s cubic-bezier(.2,.8,.2,1)"; i.style.transform = "" }) } v.style.transition = "background .3s"; v.style.background = "rgba(0,0,0,.92)" };
    const close = () => { if (gone) return; gone = true; i.style.transition = "transform .26s cubic-bezier(.3,.7,.3,1),opacity .26s"; const t = still ? "" : back(); i.style.transform = t || "scale(.9)"; if (!t) i.style.opacity = "0"; v.style.transition = "background .26s"; v.style.background = "rgba(0,0,0,0)"; setTimeout(() => v.remove(), 280) };
    v.onclick = () => { if (!moved) close() };
    v.addEventListener("touchstart", e => { if (e.touches.length !== 1) return; y0 = e.touches[0].clientY; dy = 0; moved = false; on = true }, { passive: true });
    v.addEventListener("touchmove", e => { if (!on) return; dy = e.touches[0].clientY - y0; if (Math.abs(dy) > 8) moved = true; if (!moved) return; i.style.transition = "none"; i.style.transform = "translateY(" + dy + "px) scale(" + Math.max(.6, 1 - Math.abs(dy) / 1200) + ")"; v.style.transition = "none"; v.style.background = "rgba(0,0,0," + Math.max(0, .92 - Math.abs(dy) / 500) + ")" }, { passive: true });
    v.addEventListener("touchend", () => { if (!on) return; on = false; if (Math.abs(dy) > 90) { close(); return } i.style.transition = "transform .25s cubic-bezier(.2,.8,.2,1)"; i.style.transform = ""; v.style.transition = "background .25s"; v.style.background = "rgba(0,0,0,.92)"; setTimeout(() => { moved = false }, 50) }, { passive: true });
    if (i.decode) i.decode().then(open, open); else i.onload = open; setTimeout(open, 400);
  }
  // плавная перестановка строк списка (ключ строки — data-k)
  function flipStart(box) { const m = {}; if (box) [...box.children].forEach(e => { if (e.dataset && e.dataset.k) m[e.dataset.k] = e.getBoundingClientRect().top }); return m }
  function flipEnd(box, m) {
    if (!box || !m) return; [...box.children].forEach(e => {
      const k = e.dataset && e.dataset.k; if (k === undefined || m[k] === undefined) return; const d = m[k] - e.getBoundingClientRect().top; if (Math.abs(d) < 2) return;
      e.style.animation = "none"; e.style.transition = "none"; e.style.transform = "translateY(" + d + "px)";
      requestAnimationFrame(() => requestAnimationFrame(() => { e.style.transition = "transform .38s cubic-bezier(.2,.8,.2,1)"; e.style.transform = "" })); setTimeout(() => { e.style.transition = ""; e.style.animation = "" }, 440);
    });
  }
  // текст плавно сменяется, когда меняется (например «в сети» → «был(а) 5 мин назад»)
  const swap = (el, txt) => { if (!el || el.textContent === txt) return; el.textContent = txt; el.classList.remove("swp"); void el.offsetWidth; el.classList.add("swp") };
  // черновик: недописанный текст хранится на этом устройстве
  const draft = (key, val) => { try { const k = "slovopad.dr." + key; if (val === undefined) return localStorage.getItem(k) || ""; if (val) localStorage.setItem(k, val); else localStorage.removeItem(k) } catch (e) { return "" } return "" };
  // эффект на весь экран: 🎉 — конфетти, ❤️ — сердечки, 🔥 — искры
  const FX = { "🎉": "c", "🎊": "c", "❤️": "h", "❤": "h", "💕": "h", "💖": "h", "🔥": "f" };
  function fx(host, body) {
    const kind = FX[String(body || "").trim()]; if (!kind || !host || (matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches)) return;
    const box = h("div", "ekfx"); host.appendChild(box); const cols = ["#ff4fd8", "#5ef2ff", "#ffd84f", "#8cff6a", "#b86bff", "#ff7a4f"];
    for (let k = 0; k < 34; k++) {
      const p = h("i", "ekp" + kind); p.style.left = (Math.random() * 100) + "%"; p.style.setProperty("--dx", (Math.random() * 120 - 60) + "px"); p.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
      p.style.animationDelay = (Math.random() * .5) + "s"; p.style.animationDuration = (1.6 + Math.random() * 1.1) + "s";
      if (kind === "c") { p.style.background = cols[k % cols.length]; p.style.width = (6 + Math.random() * 6) + "px"; p.style.height = (9 + Math.random() * 8) + "px" } else p.textContent = kind === "h" ? ["❤️", "💖", "💕"][k % 3] : ["🔥", "✨", "🧡"][k % 3];
      box.appendChild(p);
    }
    setTimeout(() => box.remove(), 3200);
  }
  // три прыгающие точки для «печатает»
  const dots = () => { const s = h("span", "tdots"); for (let k = 0; k < 3; k++) s.appendChild(h("i")); return s };
  // свайп влево по элементу списка: он едет за пальцем, за краем появляется значок; отпустил далеко — действие
  function swipeLeft(box, sel, moving, fire, icon) {
    if (!box || box.__sl) return; box.__sl = 1;
    let it = null, sx = 0, sy = 0, mode = 0, d = 0, els = [], hint = null;
    const reset = anim => { els.forEach(e => { e.style.transition = anim ? "transform .26s cubic-bezier(.2,.8,.2,1)" : ""; e.style.transform = "" }); if (hint) { const hh = hint; hh.style.opacity = "0"; setTimeout(() => hh.remove(), 260) } hint = null; els = [] };
    box.addEventListener("touchstart", e => {
      it = null; mode = 0; d = 0; if (e.touches.length !== 1) return; const t = e.target; if (t.closest && t.closest("input,textarea,.ekview,.mvo,.rxc,.mq,.eksh")) return;
      it = t.closest ? t.closest(sel) : null; if (!it) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    box.addEventListener("touchmove", e => {
      if (!it) return; const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
      if (!mode) { if (Math.abs(x) < 10 && Math.abs(y) < 10) return; if (x < 0 && Math.abs(x) > Math.abs(y) * 1.5) { mode = 1; els = (moving(it) || []).filter(Boolean); hint = h("span", "ekhint", icon || "↩"); it.style.position = it.style.position || "relative"; it.appendChild(hint) } else { mode = 2; it = null; return } }
      if (mode !== 1) return; e.preventDefault(); d = Math.min(86, -x * .55);
      els.forEach(el => { el.style.transition = "none"; el.style.transform = "translateX(" + (-d) + "px)" });
      if (hint) { hint.style.opacity = String(Math.max(0, Math.min(1, (d - 12) / 40))); hint.style.transform = "translateY(-50%) scale(" + (d >= 60 ? 1.2 : .8 + d / 300) + ")"; hint.classList.toggle("go", d >= 60) }
    }, { passive: false });
    const end = () => { if (!it || mode !== 1) { it = null; return } const go = d >= 60, item = it; it = null; mode = 0; reset(true); if (go) { try { navigator.vibrate && navigator.vibrate(10) } catch (x) { } try { fire(item) } catch (x) { } } };
    box.addEventListener("touchend", end, { passive: true }); box.addEventListener("touchcancel", () => { if (it && mode === 1) { it = null; reset(true) } }, { passive: true });
  }

  // kit — свой на каждый чат: помнит сообщения, реакции и картинки
  function create(cfg) {
    const K = { msgs: {}, els: {}, rxbox: {}, react: {}, imgs: {}, readTo: 0, rxp: {}, rxInit: false };
    K.reset = () => { K.msgs = {}; K.els = {}; K.rxbox = {}; K.react = {}; K.readTo = 0; K.rxp = {}; K.rxInit = false };
    K.me = () => (cfg.me ? cfg.me() : "") || "";
    K.quote = (m, jump) => {
      if (!m.rp) return null;
      const q = h("div", "mq"); q.appendChild(h("b", "", m.rp.who || "…"));
      q.appendChild(h("span", "", m.rp.dl ? T("сообщение удалено", "message deleted", "повідомлення видалено") : m.rp.text));
      q.onclick = e => { e.stopPropagation(); if (jump) jump(m.rp.id) };
      return q;
    };
    // голосовое: кнопка ▶, полоска и время; звук скачиваем только когда нажали
    const mmss = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    let cur = null;
    K.voice = m => {
      const box = h("div", "mvo"), bt = h("button", "mvb", "▶"), bar = h("div", "mvbar"), tm = h("span", "mvt", mmss(m.au));
      const bars = []; { let z = (m.id | 0) * 2654435761 >>> 0 || 7; for (let k = 0; k < 30; k++) { z = (z * 1103515245 + 12345) >>> 0; const q = h("s"); q.style.height = (22 + (z >> 8) % 78) + "%"; bars.push(q); bar.appendChild(q) } }
      const fill = { style: {} }; Object.defineProperty(fill.style, "width", { set: v => { const f = parseFloat(v) / 100 || 0; bars.forEach((q, k) => q.classList.toggle("pl", k / bars.length < f)) } });
      bt.type = "button"; box.appendChild(bt); box.appendChild(bar); box.appendChild(tm);
      let a = null;
      const stopUI = () => { bt.textContent = "▶"; box.classList.remove("on") };
      const play = async () => {
        if (cur && cur !== a) { try { cur.pause() } catch (e) { } }
        if (a && !a.paused) { a.pause(); return }
        if (!a) {
          bt.textContent = "…";
          let src = K.imgs[m.id]; if (src === undefined) { src = await cfg.img(m.id) || ""; K.imgs[m.id] = src }
          if (!src) { bt.textContent = "✕"; tm.textContent = T("устарело", "expired", "застаріло"); return }
          a = new Audio(src); a.preload = "auto";
          a.ontimeupdate = () => { fill.style.width = Math.min(100, a.currentTime / m.au * 100) + "%"; tm.textContent = mmss(Math.max(0, m.au - a.currentTime)) };
          a.onended = () => { stopUI(); fill.style.width = "0"; tm.textContent = mmss(m.au); cur = null };
          a.onpause = stopUI; a.onplay = () => { bt.textContent = "❚❚"; box.classList.add("on"); cur = a };
        }
        try { await a.play() } catch (e) { bt.textContent = "⚠" }
      };
      bt.onclick = e => { e.stopPropagation(); play() };
      bar.onclick = e => { e.stopPropagation(); if (a && a.duration && isFinite(a.duration)) { const r = bar.getBoundingClientRect(); a.currentTime = a.duration * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) } };
      return box;
    };
    K.media = m => {
      if (!m.im) return null;
      if (m.au > 0) return K.voice(m);
      const box = h("div", "mimg"), ph = h("div", "mimgp", "📷"); box.appendChild(ph);
      const show = src => { if (!src) { ph.textContent = T("Картинка устарела", "Image expired", "Картинка застаріла"); return } const i = h("img"); i.src = src; i.alt = ""; i.onclick = e => { e.stopPropagation(); viewer(src, i) }; box.textContent = ""; i.draggable = false; i.onload = () => { if (cfg.onsize) cfg.onsize() }; box.appendChild(i) };
      if (K.imgs[m.id]) show(K.imgs[m.id]);
      else Promise.resolve(cfg.img(m.id)).then(s => { K.imgs[m.id] = s || ""; show(s) }).catch(() => { ph.textContent = "⚠" });
      return box;
    };
    // текст: удалено / обычный / стикер; @ник подсвечиваем, а свой — ярче
    K.text = m => {
      if (m.dl) return h("span", "mdel", T("Сообщение удалено", "Message deleted", "Повідомлення видалено"));
      const t = String(m.body || ""), sp = h("span", "mt");
      if (t && bigRe.test(t)) { sp.className = "mt big"; sp.textContent = t; return sp }
      const me = K.me().toLowerCase(); let last = 0; const re = /@[^\s@,.!?;:()]{1,32}/g, x = /./; let r;
      while ((r = re.exec(t))) {
        if (r.index > last) sp.appendChild(document.createTextNode(t.slice(last, r.index)));
        const a = h("b", "men" + (me && r[0].slice(1).toLowerCase() === me ? " me" : ""), r[0]); sp.appendChild(a); last = r.index + r[0].length;
      }
      if (last < t.length) sp.appendChild(document.createTextNode(t.slice(last)));
      return x ? sp : sp;
    };
    K.meta = m => (m.ed && !m.dl ? T("изм. ", "edited ", "зм. ") : "") + clock(m.t) + (cfg.ticks && m.mine && !m.dl ? (K.readTo >= m.id ? " ✓✓" : " ✓") : "");
    K.reg = (id, row, rxbox) => { K.els[id] = row; if (rxbox) K.rxbox[id] = rxbox; K.drawReact(id) };
    K.setReact = list => {
      const next = {}; const first = !K.rxInit;
      (list || []).forEach(([mid, emo, who]) => { const r = next[mid] || (next[mid] = {}); (r[emo] || (r[emo] = [])).push(who) });
      const ids = new Set([...Object.keys(K.react), ...Object.keys(next)]); K.react = next;
      if (first) { ids.forEach(K.drawReact); K.rxInit = true } else ids.forEach(K.drawReact);
    };
    K.drawReact = id => {
      const box = K.rxbox[id]; if (!box) return; box.textContent = "";
      const r = K.react[id] || {}, me = K.me();
      Object.keys(r).forEach(emo => {
        const who = r[emo]; if (!who.length) return;
        const key = id + emo, was = K.rxp[key]; K.rxp[key] = who.length;
        const c = h("button", "rxc" + (who.indexOf(me) >= 0 ? " me" : "") + (K.rxInit && was === undefined ? " rxnew" : ""), emo + " "); c.type = "button"; c.title = who.join(", ");
        const n = h("b", "rxcn" + (K.rxInit && was !== undefined && was !== who.length ? " rxup" : ""), String(who.length)); c.appendChild(n);
        c.onclick = e => { e.stopPropagation(); if (cfg.react) cfg.react(id, emo) }; box.appendChild(c);
      });
      Object.keys(K.rxp).forEach(k => { if (k.indexOf(id) === 0 && !(k.slice(String(id).length) in r)) delete K.rxp[k] });
    };
    // сообщение удаляют: пузырь сжимается и растворяется, потом остаётся плашка «удалено»
    K.vanish = (el, done) => {
      if (!el || (matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches)) { done(); return }
      el.style.transition = "transform .22s ease-in,opacity .22s ease-in"; el.style.transform = "scale(.6)"; el.style.opacity = "0";
      setTimeout(done, 230);
    };
    // выбор нескольких сообщений: кружки на пузырях, внизу панель «скопировать / удалить»
    K.selectInit = o => {
      const S = { on: false, ids: new Set(), sure: 0 }, bar = h("div", "eksb"); bar.hidden = true; o.host.appendChild(bar);
      const items = () => [...S.ids].map(id => K.msgs[id]).filter(Boolean).sort((a, b) => a.id - b.id);
      const mark = () => { Object.keys(K.els).forEach(id => { const e = K.els[id]; if (e) e.classList.toggle("eksel", S.ids.has(+id)) }) };
      const paint = () => {
        bar.textContent = ""; const n = S.ids.size, list = items();
        const x = h("button", "eksx", "✕"); x.type = "button"; x.onclick = () => S.exit();
        const c = h("b", "eksn", n + " " + T("выбрано", "selected", "обрано")); bar.append(x, c);
        const cp = h("button", "eksbtn", T("Копировать", "Copy", "Копіювати")); cp.type = "button"; cp.disabled = !n;
        cp.onclick = () => { try { navigator.clipboard.writeText(list.filter(m => m.body).map(m => m.body).join("\n")) } catch (e) { } S.exit() }; bar.appendChild(cp);
        if (o.del) { const dl = h("button", "eksbtn bad", S.sure ? T("Точно удалить?", "Really delete?", "Точно видалити?") : T("Удалить", "Delete", "Видалити")); dl.type = "button"; dl.disabled = !n || list.some(m => !o.canDel(m));
          dl.onclick = async () => { if (!S.sure) { S.sure = 1; paint(); setTimeout(() => { if (S.sure) { S.sure = 0; if (S.on) paint() } }, 3000); return } const ms = list; S.exit(); for (const m of ms) { try { await o.del(m) } catch (e) { } } if (o.after) o.after() }; bar.appendChild(dl) }
      };
      S.toggle = id => { if (!S.on) return; if (S.ids.has(id)) S.ids.delete(id); else S.ids.add(id); S.sure = 0; mark(); paint() };
      S.enter = m => { S.on = true; S.sure = 0; S.ids = new Set(m ? [m.id] : []); o.list.classList.add("eksm"); o.host.classList.add("eksmode"); bar.hidden = false; bar.classList.remove("out"); mark(); paint() };
      S.exit = () => { if (!S.on) return; S.on = false; S.ids = new Set(); o.list.classList.remove("eksm"); o.host.classList.remove("eksmode"); mark(); bar.classList.add("out"); setTimeout(() => { if (!S.on) bar.hidden = true }, 220) };
      o.list.addEventListener("click", e => { if (!S.on) return; const it = e.target.closest ? e.target.closest(o.itemSel) : null; e.preventDefault(); e.stopPropagation(); if (it && it.dataset.id) S.toggle(+it.dataset.id) }, true);
      K.S = S; return S;
    };
    // круглая кнопка «вниз»: появляется, когда пролистал вверх; на ней счётчик новых
    K.downBtn = (list, host) => {
      const b = h("button", "ekdn"), cnt = h("span", "ekdc"); b.type = "button"; b.setAttribute("aria-label", "down"); b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'; cnt.hidden = true; b.appendChild(cnt); host.appendChild(b);
      let n = 0; const near = () => list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      const upd = () => { b.style.top = Math.max(0, list.offsetTop + list.offsetHeight - 58) + "px"; const far = !near(); b.classList.toggle("on", far); if (!far) { n = 0; cnt.hidden = true } };
      list.addEventListener("scroll", upd, { passive: true });
      b.onclick = () => { try { list.scrollTo({ top: list.scrollHeight, behavior: "smooth" }) } catch (e) { list.scrollTop = list.scrollHeight } };
      return { upd, reset: () => { n = 0; cnt.hidden = true; b.classList.remove("on") }, bump: k => { n += k; cnt.textContent = n > 99 ? "99+" : String(n); cnt.hidden = false; cnt.classList.remove("pop"); void cnt.offsetWidth; cnt.classList.add("pop"); upd() } };
    };
    // долгое нажатие (или правая кнопка) в любом месте сообщения, в том числе на фото, открывает меню; короткое — тоже
    let lpAt = 0;
    K.hold = (el, open) => {
      let tm = 0, sx = 0, sy = 0; const stop = () => { clearTimeout(tm); tm = 0 };
      el.onpointerdown = e => { sx = e.clientX; sy = e.clientY; stop(); tm = setTimeout(() => { tm = 0; lpAt = Date.now(); try { navigator.vibrate && navigator.vibrate(12) } catch (x) { } open() }, 420) };
      el.onpointermove = e => { if (tm && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) stop() };
      el.onpointerup = el.onpointercancel = el.onpointerleave = stop;
      el.oncontextmenu = e => { e.preventDefault(); if (Date.now() - lpAt > 600) { lpAt = Date.now(); open() } };
      if (!el.__hold) { el.__hold = 1; el.addEventListener("click", ev => { if (Date.now() - lpAt < 600) { ev.stopPropagation(); ev.preventDefault() } }, true) }
      el.onclick = open;
    };
    K.jump = id => { const t = K.els[id]; if (t) { t.scrollIntoView({ block: "center", behavior: "smooth" }); t.classList.add("flash"); setTimeout(() => t.classList.remove("flash"), 1200) } };
    // меню сообщения: реакции сверху и действия списком (acts = [[подпись, действие, опасное?]])
    K.sheet = (host, m, acts) => {
      const old = host.querySelector(".eksh"); if (old) old.remove();
      const w = h("div", "eksh"), c = h("div", "eskc"); let row = null, gone = false;
      const close = () => { if (gone) return; gone = true; w.classList.add("out"); setTimeout(() => w.remove(), 160) };
      w.onclick = e => { if (e.target === w) close() };
      if (!m.dl) { row = h("div", "esre"); EMO.forEach((e, k) => { const b = h("button", "", e); b.type = "button"; b.style.animationDelay = (k * 24) + "ms"; b.onclick = () => { close(); if (cfg.react) cfg.react(m.id, e) }; row.appendChild(b) }); w.appendChild(row) }
      acts.forEach(([t, f, bad]) => { const b = h("button", "esa" + (bad ? " bad" : ""), t); b.type = "button"; b.onclick = () => { close(); f() }; c.appendChild(b) });
      w.appendChild(c); host.appendChild(w);
      // как в Телеграме: сообщение «приподнимается» на размытом фоне, реакции над ним, меню под ним
      try {
        const el = K.els && K.els[m.id], hr = host.getBoundingClientRect();
        if (el && hr.height > 0) {
          const r = el.getBoundingClientRect(), mine = el.classList.contains("mine") || el.classList.contains("me"), top = r.top - hr.top, rh = row ? row.offsetHeight + 8 : 0, ch = c.offsetHeight + 10;
          if (r.height + rh + ch < hr.height - 24) {
            const cl = el.cloneNode(true); cl.querySelectorAll("[id]").forEach(x => x.removeAttribute("id")); cl.classList.remove("sel", "flash", "nw");
            cl.classList.add("eslift"); cl.style.cssText = "left:" + (r.left - hr.left) + "px;top:" + top + "px;width:" + r.width + "px;height:" + r.height + "px";
            w.insertBefore(cl, w.firstChild);
            let y = top - rh; const lo = 10 + (parseFloat(getComputedStyle(host).paddingTop) > 20 ? 20 : 0), hi = hr.height - 12 - ch - r.height - rh;
            let dy = 0; if (y < lo) dy = lo - y; else if (y > hi) dy = hi - y;
            if (dy) { cl.style.top = (top + dy) + "px"; y += dy }
            const side = mine ? "right:" + Math.max(10, hr.right - r.right + 6) + "px" : "left:" + Math.max(10, r.left - hr.left + 6) + "px";
            if (row) { row.style.cssText = "top:" + y + "px;" + side; row.classList.add("fl") }
            c.style.cssText = "top:" + (y + rh + r.height + 10) + "px;" + side; c.classList.add("fl"); c.style.transformOrigin = mine ? "top right" : "top left";
            if (row) row.style.transformOrigin = mine ? "bottom right" : "bottom left";
            w.classList.add("lift");
            // не даём меню и реакциям уехать за край экрана
            [row, c].forEach(x => { if (!x) return; const pw = w.clientWidth, ww = x.offsetWidth; let l = x.offsetLeft; if (l + ww > pw - 8) l = pw - 8 - ww; if (l < 8) l = 8; x.style.left = l + "px"; x.style.right = "auto" });
          }
        }
      } catch (e) { }
    };
    // панель стикеров над полем ввода
    K.stickers = (box, send) => {
      box.textContent = ""; STK.forEach(s => { const b = h("button", "stk", s); b.type = "button"; b.onclick = () => { box.hidden = true; send(s) }; box.appendChild(b) });
    };
    // выбор картинки: прячем input[type=file], после выбора сжимаем и отдаём строку
    // запись голоса: поверх строки ввода появляется полоска «● 0:07  ✕  ➤»; до 30 секунд
    K.rec = (bar, done) => {
      if (bar.querySelector(".ekrec")) return;
      const md = navigator.mediaDevices;
      if (!md || !window.MediaRecorder) { done(new Error(T("Запись голоса здесь не работает.", "Voice recording is not available here.", "Запис голосу тут не працює."))); return }
      md.getUserMedia({ audio: true }).then(stream => {
        const mt = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"].find(t => MediaRecorder.isTypeSupported(t)) || "";
        let rec; try { rec = new MediaRecorder(stream, Object.assign(mt ? { mimeType: mt } : {}, { audioBitsPerSecond: 24000 })) } catch (e) { stream.getTracks().forEach(t => t.stop()); done(e); return }
        const chunks = [], t0 = Date.now(); let send = false, dead = false;
        const ui = h("div", "ekrec"), dot = h("i", "ekdot"), tm = h("span", "ekt", "0:00"), no = h("button", "ib ekno", "✕"), ok = h("button", "btn ekok", "➤");
        no.type = ok.type = "button"; no.setAttribute("aria-label", "cancel"); ok.setAttribute("aria-label", "send");
        [dot, tm, no, ok].forEach(x => ui.appendChild(x)); bar.appendChild(ui);
        const tick = setInterval(() => { const s = (Date.now() - t0) / 1000; tm.textContent = mmss(s); if (s >= 30) fin(true) }, 250);
        const fin = go => { if (dead) return; dead = true; send = go; clearInterval(tick); ui.remove(); try { rec.stop() } catch (e) { } stream.getTracks().forEach(t => t.stop()) };
        no.onclick = () => fin(false); ok.onclick = () => fin(true);
        rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) };
        rec.onstop = () => {
          const sec = Math.round((Date.now() - t0) / 1000);
          if (!send) return; if (sec < 1) { done(new Error(T("Слишком коротко. Зажми дольше.", "Too short.", "Занадто коротко."))); return }
          const base = (rec.mimeType || mt || "audio/webm").split(";")[0].replace(/^audio\/(x-)?/, "audio/"), kind = /mp4|aac|m4a/.test(base) ? "mp4" : /ogg/.test(base) ? "ogg" : "webm";
          const fr = new FileReader();
          fr.onload = () => { const b64 = String(fr.result).split(",")[1] || ""; const url = "data:audio/" + kind + ";d=" + Math.min(59, Math.max(1, sec)) + ";base64," + b64; if (url.length > 400000) done(new Error(T("Голосовое слишком длинное.", "Voice message is too long.", "Голосове задовге."))); else done(null, url) };
          fr.onerror = () => done(new Error("read")); fr.readAsDataURL(new Blob(chunks, { type: rec.mimeType || mt || "audio/webm" }));
        };
        rec.start(250);
      }).catch(() => done(new Error(T("Нет доступа к микрофону. Разреши его в настройках.", "No microphone access. Allow it in settings.", "Немає доступу до мікрофона. Дозволь його в налаштуваннях."))));
    };
    K.pick = done => {
      const i = h("input"); i.type = "file"; i.accept = "image/*"; i.style.display = "none";
      i.onchange = async () => { const f = i.files && i.files[0]; i.remove(); if (!f) return; try { done(null, await compress(f)) } catch (e) { done(e) } };
      document.body.appendChild(i); i.click();
    };
    return K;
  }
  // свайп вправо по чату = кнопка «назад»: экран едет за пальцем, отпустил далеко или быстро — выходим
  function swipeBack(ov, back) {
    if (!ov || ov.__sw) return; ov.__sw = 1;
    let sx = 0, sy = 0, st = 0, mode = 0, dx = 0, on = false;
    const reset = anim => { ov.style.transition = anim ? "translate .22s cubic-bezier(.2,.8,.3,1),opacity .22s" : ""; ov.style.translate = ""; ov.style.opacity = ""; if (anim) setTimeout(() => { ov.style.transition = "" }, 260) };
    ov.addEventListener("touchstart", e => {
      on = false; mode = 0; dx = 0; if (e.touches.length !== 1) return;
      const t = e.target; if (t.closest && t.closest("input,textarea,button,.chbar,.eksh,.chrp,.ekview,.rxc,.mq")) return;
      if (document.querySelector(".ekview")) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); on = true;
    }, { passive: true });
    ov.addEventListener("touchmove", e => {
      if (!on) return; const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
      if (!mode) { if (Math.abs(x) < 10 && Math.abs(y) < 10) return; mode = (x > 0 && Math.abs(x) > Math.abs(y) * 1.6) ? 1 : 2 }
      if (mode !== 1) return; e.preventDefault(); dx = Math.max(0, x);
      ov.style.transition = "none"; ov.style.translate = dx + "px 0"; ov.style.opacity = String(Math.max(.35, 1 - dx / 420));
    }, { passive: false });
    const end = () => {
      if (!on || mode !== 1) { on = false; return } on = false;
      const fast = dx / Math.max(1, Date.now() - st) > 0.55;
      if (dx > 110 || (fast && dx > 40)) {
        ov.style.transition = "translate .18s ease-out,opacity .18s"; ov.style.translate = "100vw 0"; ov.style.opacity = "0";
        setTimeout(() => { reset(false); try { back() } catch (x) { } }, 170);
      } else reset(true);
    };
    ov.addEventListener("touchend", end, { passive: true }); ov.addEventListener("touchcancel", () => { if (on && mode === 1) { on = false; reset(true) } }, { passive: true });
  }
  window.EchoKit = { create, compress, swipeBack, swipeLeft, flipStart, flipEnd, dots, swap, draft, fx, EMO, clock };
})();
