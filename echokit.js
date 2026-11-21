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
    let cur = null, voiceSpd = 1; try { voiceSpd = [1, 1.5, 2].includes(Number(localStorage.getItem("spVoiceSpd"))) ? Number(localStorage.getItem("spVoiceSpd")) : 1 } catch (e) { }
    K.voice = m => {
      const box = h("div", "mvo"), bt = h("button", "mvb", "▶"), bar = h("div", "mvbar"), tm = h("span", "mvt", mmss(m.au)), spb = h("button", "mvs", voiceSpd + "×");
      const bars = []; { let z = (m.id | 0) * 2654435761 >>> 0 || 7; for (let k = 0; k < 30; k++) { z = (z * 1103515245 + 12345) >>> 0; const q = h("s"); q.style.height = (22 + (z >> 8) % 78) + "%"; bars.push(q); bar.appendChild(q) } }
      const fill = { style: {} }; Object.defineProperty(fill.style, "width", { set: v => { const f = parseFloat(v) / 100 || 0; bars.forEach((q, k) => q.classList.toggle("pl", k / bars.length < f)) } });
      bt.type = "button"; spb.type = "button"; spb.setAttribute("aria-label", "speed"); box.appendChild(bt); box.appendChild(bar); box.appendChild(tm); box.appendChild(spb);
      let a = null;
      const stopUI = () => { bt.textContent = "▶"; box.classList.remove("on") };
      const play = async () => {
        if (cur && cur !== a) { try { cur.pause() } catch (e) { } }
        if (a && !a.paused) { a.pause(); return }
        if (!a) {
          bt.textContent = "…";
          let src = K.imgs[m.id]; if (src === undefined) { src = await cfg.img(m.id) || ""; K.imgs[m.id] = src }
          if (!src) { bt.textContent = "✕"; tm.textContent = T("устарело", "expired", "застаріло"); return }
          a = new Audio(src); a.preload = "auto"; a.playbackRate = voiceSpd;
          a.ontimeupdate = () => { fill.style.width = Math.min(100, a.currentTime / m.au * 100) + "%"; tm.textContent = mmss(Math.max(0, m.au - a.currentTime)) };
          a.onended = () => { stopUI(); fill.style.width = "0"; tm.textContent = mmss(m.au); cur = null };
          a.onpause = stopUI; a.onplay = () => { bt.textContent = "❚❚"; box.classList.add("on"); cur = a };
        }
        try { await a.play() } catch (e) { bt.textContent = "⚠" }
      };
      bt.onclick = e => { e.stopPropagation(); play() };
      spb.onclick = e => { e.stopPropagation(); voiceSpd = voiceSpd === 1 ? 1.5 : voiceSpd === 1.5 ? 2 : 1; try { localStorage.setItem("spVoiceSpd", String(voiceSpd)) } catch (x) { } spb.textContent = voiceSpd + "×"; if (a) a.playbackRate = voiceSpd };
      let drag = false; const seekTo = x => { if (a && a.duration && isFinite(a.duration)) { const r = bar.getBoundingClientRect(); a.currentTime = a.duration * Math.min(1, Math.max(0, (x - r.left) / r.width)) } };
      bar.addEventListener("pointerdown", e => { e.stopPropagation(); if (!a) return; drag = true; try { bar.setPointerCapture(e.pointerId) } catch (x) { } seekTo(e.clientX) });
      bar.addEventListener("pointermove", e => { if (drag) seekTo(e.clientX) });
      ["pointerup", "pointercancel"].forEach(n => bar.addEventListener(n, () => { drag = false }));
      bar.onclick = e => e.stopPropagation();
      return box;
    };
    K.media = m => {
      if (!m.im) return null;
      if (m.au > 0) return K.voice(m);
      const mys = String(m.body || "").trim() === ":ms:", box = h("div", "mimg" + (mys ? " mystk" : "")), ph = h("div", "mimgp", "📷"); box.appendChild(ph);
      const show = src => { if (!src) { ph.textContent = T("Картинка устарела", "Image expired", "Картинка застаріла"); return } const i = h("img"); i.src = src; i.alt = ""; i.onclick = e => { e.stopPropagation(); viewer(src, i) }; box.textContent = ""; i.draggable = false; i.onload = () => { if (cfg.onsize) cfg.onsize() }; box.appendChild(i) };
      if (K.imgs[m.id]) show(K.imgs[m.id]);
      else Promise.resolve(cfg.img(m.id)).then(s => { K.imgs[m.id] = s || ""; show(s) }).catch(() => { ph.textContent = "⚠" });
      return box;
    };
    // текст: удалено / обычный / стикер; @ник подсвечиваем, а свой — ярче
    K.text = m => {
      if (m.dl) return h("span", "mdel", T("Сообщение удалено", "Message deleted", "Повідомлення видалено"));
      const t = String(m.body || ""), sp = h("span", "mt");
      if (t.trim() === ":ms:") { if (m.im) { sp.className = "mt mystk0"; return sp } sp.textContent = "🖼 " + T("Стикер устарел", "Sticker expired", "Стікер застарів"); return sp }
      { const SK = window.SlovopadStickers, mid = SK && SK.myParse(t); if (mid) { sp.className = "mt stki"; const im = h("img", "stkimg"); im.alt = T("Стикер", "Sticker", "Стікер"); im.draggable = false; im.style.minHeight = "60px"; SK.myImg(mid).then(u => { if (u) { im.onload = () => { im.style.minHeight = ""; if (K.onsize) K.onsize() }; im.src = u } else { sp.className = "mt"; sp.textContent = "🖼 " + T("Стикер", "Sticker", "Стікер") } }); sp.appendChild(im); return sp } }
      { const GF = window.SlovopadGif, gid = GF && GF.parse(t); if (gid) { sp.className = "mt stki"; const im = h("img", "gifimg"); im.src = GF.url(gid); im.alt = "GIF"; im.draggable = false; im.loading = "lazy"; im.onerror = () => { sp.textContent = "GIF"; sp.className = "mt" }; im.onload = () => { if (K.onsize) K.onsize() }; sp.appendChild(im); return sp } }
      { const SK = window.SlovopadStickers, sid = SK && SK.parse(t); if (sid && SK.has(sid)) { sp.className = "mt stki"; const im = h("img", "stkimg"); im.src = SK.uri(sid); im.alt = SK.label(t); im.draggable = false; sp.appendChild(im); return sp } }
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
    // пересылка: выбираешь, кому, сообщение «улетает» вверх, внизу выезжает подтверждение
    // «не отправлено»: сообщение, которое не ушло из-за сети, остаётся в чате с кнопкой «повторить» и уходит само, когда связь вернётся
    const pend = [];
    K.pend = {
      add: (list, label, fn, after) => {
        const el = h("div", "chm me pend"), b = h("span", "chb"), meta = h("i", "cht"), rt = h("button", "pendr", "⟳ " + T("Повторить", "Retry", "Повторити")), cx = h("button", "pendr pendx", "✕"); rt.type = cx.type = "button"; b.textContent = label; cx.setAttribute("aria-label", "cancel");
        const note = h("span", "", T("Не отправлено", "Not sent", "Не надіслано") + " · "); meta.append(note, rt, " ", cx); el.append(b, meta); list.appendChild(el); list.scrollTop = list.scrollHeight;
        const it = { el, busy: false };
        it.run = async () => { if (it.busy) return false; it.busy = true; el.classList.add("busy");
          try { await fn(); el.classList.add("gone"); setTimeout(() => el.remove(), 220); const k = pend.indexOf(it); if (k >= 0) pend.splice(k, 1); if (after) { try { await after() } catch (e) { } } return true }
          catch (e) { el.classList.remove("busy");
            if (e && e.net) return false;
            // сервер ответил отказом (заблокировали, комнаты нет): повторять бесполезно, убираем из очереди и показываем причину
            const k = pend.indexOf(it); if (k >= 0) pend.splice(k, 1); el.classList.add("dead"); note.textContent = ((e && e.message) || T("Не отправлено", "Not sent", "Не надіслано")) + " "; rt.remove(); return "dead" } finally { it.busy = false } };
        rt.onclick = e => { e.stopPropagation(); it.run() };
        cx.onclick = e => { e.stopPropagation(); const k = pend.indexOf(it); if (k >= 0) pend.splice(k, 1); el.classList.add("gone"); setTimeout(() => el.remove(), 220) };
        pend.push(it); return it;
      },
      flush: async () => { for (const it of pend.slice()) { if ((await it.run()) === false) break } },
      count: () => pend.length
    };
    window.addEventListener("online", () => K.pend.flush()); setInterval(() => { if (pend.length && !document.hidden) K.pend.flush() }, 10000);
    // что отправлять при пересылке: стикер, гифка и свой стикер уходят как есть, обычный текст получает подпись «от кого»
    K.fwd = (m, pre) => {
      const b = String(m.body || "").trim(), SK = window.SlovopadStickers, GF = window.SlovopadGif;
      if ((SK && (SK.parse(b) || SK.myParse(b))) || (GF && GF.parse(b))) return { text: b };
      if (b === ":ms:") return m.im && K.imgs[m.id] ? { text: b, img: K.imgs[m.id] } : { text: pre + "\n🖼 " + T("Стикер", "Sticker", "Стікер") };
      return { text: pre + "\n" + m.body };
    };
    K.forward = (host, m, targets, send, from) => {
      const old = host.querySelector(".ekfw"); if (old) old.remove();
      const w = h("div", "ekfw"), c = h("div", "ekfc"); let gone = false;
      const close = () => { if (gone) return; gone = true; w.classList.add("out"); setTimeout(() => w.remove(), 180) };
      w.onclick = e => { if (e.target === w) close() };
      c.appendChild(h("h3", "", T("Переслать", "Forward", "Переслати")));
      const box = h("div", "ekfl"); c.appendChild(box);
      if (!targets.length) box.appendChild(h("div", "hint", T("Некому пересылать: добавь друзей или вступи в комнату.", "Nobody to forward to yet.", "Нікому пересилати.")));
      targets.forEach((t, k) => {
        const b = h("button", "ekft"); b.type = "button"; b.style.animationDelay = (k * 22) + "ms";
        const a = h("i", "", (t.name || "?").slice(0, 1).toUpperCase()); b.append(a, h("b", "", t.name), h("em", "", t.kind === "room" ? T("комната", "room", "кімната") : T("друг", "friend", "друг")));
        b.onclick = async () => {
          const el = K.els[m.id]; close();
          if (el && !(matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches)) {
            const r = el.getBoundingClientRect(), cl = el.cloneNode(true); cl.querySelectorAll("[id]").forEach(x => x.removeAttribute("id")); cl.classList.remove("sel", "flash", "nw", "eksel");
            cl.className += " ekfly"; cl.style.cssText = "position:fixed;left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;margin:0;z-index:99999;pointer-events:none;transition:transform .6s cubic-bezier(.5,0,.8,.4),opacity .6s ease-in;transform-origin:100% 0";
            document.body.appendChild(cl); cl.getBoundingClientRect(); requestAnimationFrame(() => { cl.style.transform = "translate(" + (innerWidth - r.left - r.width * .2) + "px," + (-r.top - 40) + "px) scale(.25) rotate(14deg)"; cl.style.opacity = "0" }); setTimeout(() => cl.remove(), 700);
          }
          let ok = true; try { await send(t) } catch (e) { ok = false; toast(e && e.message || "Ошибка", true) }
          if (ok) toast(T("Переслано: ", "Forwarded to ", "Переслано: ") + t.name);
        };
        box.appendChild(b);
      });
      w.appendChild(c); host.appendChild(w);
    };
    const toast = (msg, bad) => { const t = h("div", "ekto" + (bad ? " bad" : ""), (bad ? "" : "✓ ") + msg); document.body.appendChild(t); setTimeout(() => t.classList.add("out"), 2400); setTimeout(() => t.remove(), 2800) };
    // поиск по чату: лупа в шапке, поле выезжает, найденное подсвечивается, стрелки ведут по совпадениям
    K.searchBar = (host, list) => {
      const bar = h("div", "eksr"), inp = h("input"), cnt = h("span", "eksc"), up = h("button", "eksa", "↑"), dn = h("button", "eksa", "↓"), x = h("button", "eksa", "✕");
      inp.type = "search"; inp.placeholder = T("Поиск по чату", "Search chat", "Пошук у чаті"); inp.autocomplete = "off"; [up, dn, x].forEach(b => b.type = "button");
      bar.append(inp, cnt, up, dn, x); host.insertBefore(bar, list);
      let hits = [], cur = -1;
      const clear = () => Object.keys(K.els).forEach(id => { const e = K.els[id]; if (e) e.classList.remove("ekhit", "ekcur") });
      const show = () => { Object.keys(K.els).forEach(id => { const e = K.els[id]; if (e) e.classList.remove("ekcur") }); cnt.textContent = hits.length ? (cur + 1) + " / " + hits.length : (inp.value.trim() ? "0" : ""); if (hits.length && K.els[hits[cur]]) { K.els[hits[cur]].classList.add("ekcur"); K.jump(hits[cur]) } };
      const run = () => { clear(); const q = inp.value.trim().toLowerCase(); hits = []; if (q) Object.keys(K.msgs).map(Number).sort((a, b) => a - b).forEach(id => { const m = K.msgs[id]; if (m && !m.dl && m.body && String(m.body).toLowerCase().indexOf(q) >= 0) { hits.push(id); if (K.els[id]) K.els[id].classList.add("ekhit") } }); cur = hits.length - 1; show() };
      inp.addEventListener("input", run); inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); dn.click() } });
      up.onclick = () => { if (hits.length) { cur = (cur - 1 + hits.length) % hits.length; show() } }; dn.onclick = () => { if (hits.length) { cur = (cur + 1) % hits.length; show() } };
      const S = { on: false, toggle: on => { S.on = on === undefined ? !S.on : on; bar.classList.toggle("on", S.on); if (S.on) setTimeout(() => inp.focus(), 60); else { clear(); inp.value = ""; cnt.textContent = ""; hits = []; inp.blur() } } };
      x.onclick = () => S.toggle(false); K.SR = S; return S;
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
    const lsR = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") || d } catch (e) { return d } };
    const lsW = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true } catch (e) { return false } };
    // свой стикер: любая картинка ужимается до 256 пикселей, прозрачность сохраняется
    const mkSticker = file => new Promise((ok, no) => {
      if (!file || !/^image\//.test(file.type)) { no(new Error(T("Выбери картинку.", "Pick an image.", "Обери картинку."))); return }
      const u = URL.createObjectURL(file), im = new Image();
      im.onerror = () => { URL.revokeObjectURL(u); no(new Error(T("Не удалось открыть картинку.", "Could not open the image.", "Не вдалося відкрити картинку."))) };
      im.onload = () => {
        URL.revokeObjectURL(u); let side = 256;
        for (let k = 0; k < 4; k++, side = Math.round(side * .75)) {
          const sc = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(im.naturalWidth * sc)); c.height = Math.max(1, Math.round(im.naturalHeight * sc));
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          let out = c.toDataURL("image/webp", .82); if (!/^data:image\/webp/.test(out)) out = c.toDataURL("image/png");
          if (out.length <= 60000) { ok(out); return }
        }
        no(new Error(T("Картинка слишком тяжёлая.", "The image is too heavy.", "Картинка задовга.")));
      };
      im.src = u;
    });
    K.stickers = (box, send) => {
      box.textContent = ""; const SK = window.SlovopadStickers, GF = window.SlovopadGif;
      const tabs = h("div", "stkt"), body = h("div", "stkbody"); box.append(tabs, body);
      const tab = (name, fn) => { const b = h("button", "stkta", name); b.type = "button"; b.onclick = () => { [...tabs.children].forEach(x => x.classList.toggle("on", x === b)); body.textContent = ""; fn() }; tabs.appendChild(b); return b };
      const grid = (list, cls) => { const g = h("div", "stkg" + (cls ? " " + cls : "")); list.forEach((x, k) => { const b = h("button", "stkb" + (x.open === false ? " lock" : "")); b.type = "button"; b.title = x.cap; b.style.animationDelay = Math.min(k, 14) * 18 + "ms"; const im = h("img"); im.src = SK.uri(x.id); im.alt = x.cap; im.draggable = false; im.loading = "lazy"; b.appendChild(im); if (x.open === false) b.appendChild(h("i", "stkl", "🔒")); b.onclick = () => { if (x.open === false) { hint.textContent = T("Откроется за достижения: нужно " + x.need + ", у тебя " + SK.achCount() + ".", "Unlocks with achievements: " + x.need + " needed, you have " + SK.achCount() + ".", "Відкриється за досягнення: потрібно " + x.need + ", у тебе " + SK.achCount() + "."); b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); return } box.hidden = true; send(SK.token(x.id)) }; g.appendChild(b) }); return g };
      const hint = h("div", "hint stkh");
      const stickers = () => {
        if (SK) {
          const se = SK.seasonal && SK.seasonal(); if (se && se.list.length) { body.appendChild(h("div", "stks", se.icon + " " + T("Сезон: ", "Season: ", "Сезон: ") + se.name)); body.appendChild(grid(se.list, "stkse")) }
          body.appendChild(h("div", "stks", T("Стикеры", "Stickers", "Стікери"))); body.appendChild(grid(SK.list));
          body.appendChild(h("div", "stks", "🏆 " + T("За достижения", "Achievement rewards", "За досягнення"))); body.appendChild(grid(SK.rewards()));
          body.appendChild(hint);
        }
        const er = h("div", "stke"); STK.forEach(s => { const b = h("button", "stk", s); b.type = "button"; b.onclick = () => { box.hidden = true; send(s) }; er.appendChild(b) }); body.appendChild(er);
      };
      const favs = () => lsR("spFavGif", []);
      let pf = 0; const pushFav = () => { clearTimeout(pf); pf = setTimeout(() => { try { cloudRequest("/api/my/gifs", { method: "POST", body: JSON.stringify({ gifs: favs() }) }).catch(() => { }) } catch (e) { } }, 500) };
      const gifTile = (x, k, onStar) => {
        const w = h("div", "gifw"), b = h("button", "gifb"); b.type = "button"; b.style.animationDelay = Math.min(k, 12) * 20 + "ms";
        const im = h("img"); im.src = GF.thumb(x.id); im.alt = "GIF"; im.loading = "lazy"; im.draggable = false; im.style.aspectRatio = (x.w || 100) + "/" + (x.h || 100); b.appendChild(im);
        b.onclick = () => { box.hidden = true; send(GF.token(x.id)) };
        const on = () => favs().some(f => f.id === x.id), st = h("button", "gifst" + (on() ? " on" : ""), on() ? "★" : "☆"); st.type = "button"; st.setAttribute("aria-label", "favorite");
        st.onclick = e => { e.stopPropagation(); let l = favs(); if (on()) l = l.filter(f => f.id !== x.id); else l = [{ id: x.id, w: x.w, h: x.h }].concat(l).slice(0, 40); lsW("spFavGif", l); pushFav(); st.classList.toggle("on", on()); st.textContent = on() ? "★" : "☆"; if (onStar) onStar() };
        w.append(b, st); return w;
      };
      const gifs = () => {
        if (!GF || !GF.ready()) { body.appendChild(h("div", "hint", T("Гифки пока не подключены: нужен ключ Giphy.", "GIFs are not set up yet: a Giphy key is needed.", "Гіфки ще не підключені: потрібен ключ Giphy."))); return }
        const q = h("input", "gifq"); q.type = "search"; q.placeholder = T("Найти гифку", "Search GIFs", "Знайти гіфку"); q.autocomplete = "off";
        const grid = h("div", "gifg"), st = h("div", "hint gifs"), pw = h("div", "gifpw", "Powered by GIPHY"); body.append(q, grid, st, pw);
        let seq = 0, tm = 0;
        const show = async fn => {
          const my = ++seq; st.textContent = T("Ищу…", "Searching…", "Шукаю…"); grid.textContent = "";
          try {
            const list = await fn(); if (my !== seq) return; st.textContent = list.length ? "" : T("Ничего не нашлось.", "Nothing found.", "Нічого не знайшлось.");
            list.forEach((x, k) => grid.appendChild(gifTile(x, k)));
          } catch (e) { if (my === seq) st.textContent = e && e.message === "limit" ? T("Слишком много запросов, подожди минутку.", "Too many requests, wait a minute.", "Забагато запитів, зачекай хвилину.") : T("Гифки не загрузились. Проверь интернет.", "GIFs did not load. Check your connection.", "Гіфки не завантажились. Перевір інтернет.") }
        };
        q.addEventListener("input", () => { clearTimeout(tm); const v = q.value.trim(); tm = setTimeout(() => show(() => v ? GF.search(v) : GF.trending()), 350) });
        show(() => GF.trending());
      };
      const mine = () => {
        const msg = h("div", "hint stkh");
        body.appendChild(h("div", "stks", T("Мои стикеры", "My stickers", "Мої стікери")));
        const g = h("div", "stkg stkmy"); body.append(g, msg);
        let list = lsR("spMyStk2", []);
        const draw = () => {
          g.textContent = "";
          const add = h("button", "stkb stkadd", "＋"); add.type = "button"; add.setAttribute("aria-label", "add");
          add.onclick = () => { if (list.length >= 24) { msg.textContent = T("Хватит, максимум 24. Удали лишний.", "Enough, max 24. Remove one first.", "Досить, максимум 24. Видали зайвий."); return }
            const i = h("input"); i.type = "file"; i.accept = "image/*"; i.style.display = "none";
            i.onchange = async () => { const f = i.files && i.files[0]; i.remove(); if (!f) return; msg.textContent = T("Сохраняю…", "Saving…", "Зберігаю…");
              try { const u = await mkSticker(f); const r = await cloudRequest("/api/my/stk/add", { method: "POST", body: JSON.stringify({ img: u }) }); list.unshift({ id: r.id, img: u }); lsW("spMyStk2", list); msg.textContent = ""; draw() } catch (e) { msg.textContent = e.message } };
            document.body.appendChild(i); i.click() };
          g.appendChild(add);
          list.forEach(x => { const w = h("div", "gifw"), b = h("button", "stkb"); b.type = "button"; const im = h("img"); im.src = x.img; im.alt = ""; im.draggable = false; b.appendChild(im); b.onclick = () => { box.hidden = true; send(SK.myToken(x.id)) };
            const d = h("button", "gifst on", "✕"); d.type = "button"; d.setAttribute("aria-label", "remove"); d.onclick = async e => { e.stopPropagation(); list = list.filter(y => y.id !== x.id); lsW("spMyStk2", list); draw(); try { await cloudRequest("/api/my/stk/del", { method: "POST", body: JSON.stringify({ id: x.id }) }) } catch (er) { } }; w.append(b, d); g.appendChild(w) });
        };
        draw();
        let drawF = () => { };
        if (GF) {
          body.appendChild(h("div", "stks", "★ " + T("Избранные гифки", "Favorite GIFs", "Обрані гіфки")));
          const fg = h("div", "gifg"); body.appendChild(fg);
          drawF = () => { fg.textContent = ""; const l = favs(); if (!l.length) { fg.appendChild(h("div", "hint", T("Нажми ☆ на гифке, и она появится здесь.", "Tap ☆ on a GIF and it shows up here.", "Натисни ☆ на гіфці, і вона з'явиться тут."))); return } l.forEach((x, k) => fg.appendChild(gifTile(x, k, () => setTimeout(drawF, 120)))) };
          drawF();
        }
        // сверяем с сервером: стикеры и избранное живут в аккаунте и есть на всех устройствах
        (async () => {
          try {
            const r = await cloudRequest("/api/my/all"); list = r.stk || []; 
            try { const old = (JSON.parse(localStorage.getItem("spMyStk") || "[]") || []).filter(u => typeof u === "string" && u.startsWith("data:image/")); let left = old.slice(); while (left.length && list.length < 24) { try { const a = await cloudRequest("/api/my/stk/add", { method: "POST", body: JSON.stringify({ img: left[0] }) }); list.unshift({ id: a.id, img: left[0] }); left.shift() } catch (e) { if (e && e.net || /много/.test(e.message || "")) break; left.shift() } } if (left.length && list.length >= 24) left = []; if (left.length) localStorage.setItem("spMyStk", JSON.stringify(left)); else localStorage.removeItem("spMyStk") } catch (e) { }
            lsW("spMyStk2", list); draw();
            const srv = r.gifs || [], loc = favs(), merged = srv.concat(loc.filter(x => !srv.some(y => y.id === x.id))).slice(0, 40);
            lsW("spFavGif", merged); if (merged.length !== srv.length) pushFav(); drawF();
          } catch (e) { }
        })();
      };
      const first = tab("🖼 " + T("Стикеры", "Stickers", "Стікери"), stickers); tab("GIF", gifs); tab("⭐ " + T("Мои", "Mine", "Мої"), mine); first.click();
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
        const chunks = [], t0 = Date.now(); let send = false, dead = false, pi = 0;
        const ui = h("div", "ekrec"), dot = h("i", "ekdot"), tm = h("span", "ekt", "0:00"), no = h("button", "ib ekno", "✕"), ok = h("button", "btn ekok", "➤");
        no.type = ok.type = "button"; no.setAttribute("aria-label", "cancel"); ok.setAttribute("aria-label", "send");
        [dot, tm, no, ok].forEach(x => ui.appendChild(x)); bar.appendChild(ui);
        const tick = setInterval(() => { const s = (Date.now() - t0) / 1000; tm.textContent = mmss(s); if (s >= 30) fin(true) }, 250);
        const fin = go => { if (dead) return; dead = true; send = go; clearInterval(tick); clearInterval(pi); bar.__rc = null; ui.remove(); try { rec.stop() } catch (e) { } stream.getTracks().forEach(t => t.stop()) };
        no.onclick = () => fin(false); ok.onclick = () => fin(true);
        const hintEl = h("span", "ekhl", "⬆ " + T("замок", "lock", "замок") + "   ⬅ " + T("отмена", "cancel", "скасувати")); ui.insertBefore(hintEl, no);
        bar.__rc = { fin, lock: () => { ui.classList.add("locked"); hintEl.textContent = "🔒 " + T("запись закреплена", "recording locked", "запис закріплено") }, slide: (dx, dy) => { if (!ui.classList.contains("locked")) { ui.style.setProperty("--ekx", Math.max(-120, Math.min(0, dx)) + "px"); ui.style.setProperty("--eky", Math.max(-80, Math.min(0, dy)) + "px") } }, ui };
        if (bar.__want) { const w = bar.__want; bar.__want = null; if (w === "send") fin(true); else if (w === "cancel") fin(false); else if (w === "lock") bar.__rc.lock() }
        rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) };
        rec.onstop = () => {
          const sec = Math.round((Date.now() - t0) / 1000);
          if (!send) return; if (sec < 1) { done(new Error(T("Слишком коротко. Зажми дольше.", "Too short.", "Занадто коротко."))); return }
          const base = (rec.mimeType || mt || "audio/webm").split(";")[0].replace(/^audio\/(x-)?/, "audio/"), kind = /mp4|aac|m4a/.test(base) ? "mp4" : /ogg/.test(base) ? "ogg" : "webm";
          const fr = new FileReader();
          fr.onload = () => { const b64 = String(fr.result).split(",")[1] || ""; const url = "data:audio/" + kind + ";d=" + Math.min(59, Math.max(1, sec)) + ";base64," + b64; if (url.length > 400000) done(new Error(T("Голосовое слишком длинное.", "Voice message is too long.", "Голосове задовге."))); else done(null, url) };
          fr.onerror = () => done(new Error("read")); fr.readAsDataURL(new Blob(chunks, { type: rec.mimeType || mt || "audio/webm" }));
        };
        rec.start(250); const ping = () => { try { cfg.onrec && cfg.onrec() } catch (e) { } }; ping(); pi = setInterval(ping, 3000);
      }).catch(() => done(new Error(T("Нет доступа к микрофону. Разреши его в настройках.", "No microphone access. Allow it in settings.", "Немає доступу до мікрофона. Дозволь його в налаштуваннях."))));
    };
    // микрофон как в Телеграме: зажал и говори, отпустил — отправилось; вверх — замок; влево — отмена; короткое нажатие включает запись с кнопками
    K.mic = (btn, bar, done) => {
      if (btn.__mic) return; btn.__mic = 1;
      let t0 = 0, sx = 0, sy = 0, down = false, locked = false, touch = false;
      const ctl = () => bar.__rc;
      btn.addEventListener("pointerdown", e => { if (e.button > 0 || down) return; down = true; locked = false; touch = e.pointerType !== "mouse"; t0 = Date.now(); sx = e.clientX; sy = e.clientY; try { btn.setPointerCapture(e.pointerId) } catch (x) { } bar.__want = null; K.rec(bar, done); btn.classList.add("hold"); e.preventDefault() });
      btn.addEventListener("pointermove", e => {
        if (!down || locked) return; const dx = e.clientX - sx, dy = e.clientY - sy, c = ctl();
        if (c) c.slide(dx, dy);
        if (dx < -90) { down = false; btn.classList.remove("hold"); if (c) c.fin(false); else bar.__want = "cancel" }
        else if (dy < -70) { locked = true; btn.classList.remove("hold"); try { navigator.vibrate && navigator.vibrate(12) } catch (x) { } if (c) c.lock(); else bar.__want = "lock" }
      });
      const up = e => { if (!down) return; down = false; btn.classList.remove("hold"); if (locked) return; const c = ctl(), long = Date.now() - t0 > 450;
        if (c) { c.ui.style.removeProperty("--ekx"); c.ui.style.removeProperty("--eky"); if (long) c.fin(e.type !== "pointercancel"); else c.lock() }
        else bar.__want = long && e.type !== "pointercancel" ? "send" : "lock" };
      btn.addEventListener("pointerup", up); btn.addEventListener("pointercancel", up);
      btn.addEventListener("contextmenu", e => e.preventDefault());
      btn.addEventListener("click", e => { if (e.detail === 0) K.rec(bar, done) });
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
