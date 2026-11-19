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

  function viewer(src) {
    const v = h("div", "ekview"); v.onclick = () => v.remove();
    const i = h("img"); i.src = src; v.appendChild(i); document.body.appendChild(v);
  }

  // kit — свой на каждый чат: помнит сообщения, реакции и картинки
  function create(cfg) {
    const K = { msgs: {}, els: {}, rxbox: {}, react: {}, imgs: {}, readTo: 0 };
    K.reset = () => { K.msgs = {}; K.els = {}; K.rxbox = {}; K.react = {}; K.readTo = 0 };
    K.me = () => (cfg.me ? cfg.me() : "") || "";
    K.quote = (m, jump) => {
      if (!m.rp) return null;
      const q = h("div", "mq"); q.appendChild(h("b", "", m.rp.who || "…"));
      q.appendChild(h("span", "", m.rp.dl ? T("сообщение удалено", "message deleted", "повідомлення видалено") : m.rp.text));
      q.onclick = e => { e.stopPropagation(); if (jump) jump(m.rp.id) };
      return q;
    };
    K.media = m => {
      if (!m.im) return null;
      const box = h("div", "mimg"), ph = h("div", "mimgp", "📷"); box.appendChild(ph);
      const show = src => { if (!src) { ph.textContent = T("Картинка устарела", "Image expired", "Картинка застаріла"); return } const i = h("img"); i.src = src; i.alt = ""; i.onclick = e => { e.stopPropagation(); viewer(src) }; box.textContent = ""; i.draggable = false; i.onload = () => { if (cfg.onsize) cfg.onsize() }; box.appendChild(i) };
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
      const next = {};
      (list || []).forEach(([mid, emo, who]) => { const r = next[mid] || (next[mid] = {}); (r[emo] || (r[emo] = [])).push(who) });
      const ids = new Set([...Object.keys(K.react), ...Object.keys(next)]); K.react = next;
      ids.forEach(K.drawReact);
    };
    K.drawReact = id => {
      const box = K.rxbox[id]; if (!box) return; box.textContent = "";
      const r = K.react[id] || {}, me = K.me();
      Object.keys(r).forEach(emo => {
        const who = r[emo]; if (!who.length) return;
        const c = h("button", "rxc" + (who.indexOf(me) >= 0 ? " me" : ""), emo + " " + who.length); c.type = "button"; c.title = who.join(", ");
        c.onclick = e => { e.stopPropagation(); if (cfg.react) cfg.react(id, emo) }; box.appendChild(c);
      });
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
      const w = h("div", "eksh"), c = h("div", "eskc"); w.appendChild(c); w.onclick = e => { if (e.target === w) w.remove() };
      if (!m.dl) { const row = h("div", "esre"); EMO.forEach(e => { const b = h("button", "", e); b.type = "button"; b.onclick = () => { w.remove(); if (cfg.react) cfg.react(m.id, e) }; row.appendChild(b) }); c.appendChild(row) }
      acts.forEach(([t, f, bad]) => { const b = h("button", "esa" + (bad ? " bad" : ""), t); b.type = "button"; b.onclick = () => { w.remove(); f() }; c.appendChild(b) });
      host.appendChild(w);
    };
    // панель стикеров над полем ввода
    K.stickers = (box, send) => {
      box.textContent = ""; STK.forEach(s => { const b = h("button", "stk", s); b.type = "button"; b.onclick = () => { box.hidden = true; send(s) }; box.appendChild(b) });
    };
    // выбор картинки: прячем input[type=file], после выбора сжимаем и отдаём строку
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
  window.EchoKit = { create, compress, swipeBack, EMO, clock };
})();
