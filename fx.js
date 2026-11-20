/* СЛОВОПАД — эффекты: счёт набегает в конце игры, вспышка рекорда, монеты летят в магазине, брызги подарка.
   Подключается после app.js и season.js. Использует: over, state, $("oS"), $("oB"), coG. */
(function () {
  "use strict";
  const still = () => { try { return matchMedia("(prefers-reduced-motion:reduce)").matches } catch (e) { return false } };
  const g = id => document.getElementById(id);
  // брызги из элемента: эмодзи разлетаются и гаснут
  function burst(el, list, n) {
    if (!el || still()) return; const r = el.getBoundingClientRect(); if (!r.width && !r.height) return; n = n || 14;
    for (let k = 0; k < n; k++) {
      const p = document.createElement("i"); p.className = "spfx"; p.textContent = list[k % list.length];
      p.style.left = (r.left + r.width / 2) + "px"; p.style.top = (r.top + r.height / 2) + "px";
      const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90;
      p.style.setProperty("--dx", Math.cos(a) * d + "px"); p.style.setProperty("--dy", (Math.sin(a) * d - 30) + "px"); p.style.animationDelay = (Math.random() * .12) + "s";
      document.body.appendChild(p); setTimeout(() => p.remove(), 1200);
    }
  }
  // число плавно набегает
  function count(el, to, ms, done) {
    if (!el) return; to = Math.round(to); if (still() || to <= 0) { el.textContent = to; if (done) done(); return }
    const t0 = performance.now(); el.textContent = "0";
    const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(step); else { el.textContent = to; if (done) done() } };
    requestAnimationFrame(step);
  }
  // покупка в магазине: монеты летят от кнопки к счётчику, счётчик «подпрыгивает», карточка вспыхивает
  function buy(was) {
    try {
      const c = g("shC"), b = document.querySelector("#o12 .shHb"), now = (typeof coG === "function") ? coG() : 0;
      if (c) { c.classList.remove("shpop"); void c.offsetWidth; c.classList.add("shpop"); if (!still() && was > now) { const t0 = performance.now(), step = t => { const k = Math.min(1, (t - t0) / 650); c.textContent = "✨ " + Math.round(was + (now - was) * k); if (k < 1) requestAnimationFrame(step); else c.textContent = "✨ " + now }; requestAnimationFrame(step) } }
      const card = document.querySelector("#o12 .shH"); if (card) { card.classList.remove("shflash"); void card.offsetWidth; card.classList.add("shflash") }
      if (c && !still()) { const a = (b || card || document.body).getBoundingClientRect(), z = c.getBoundingClientRect(); for (let k = 0; k < 8; k++) { const p = document.createElement("i"); p.className = "spcoin"; p.textContent = "✨"; p.style.left = (a.left + a.width / 2) + "px"; p.style.top = (a.top + a.height / 2) + "px"; p.style.setProperty("--tx", (z.left + z.width / 2 - a.left - a.width / 2) + "px"); p.style.setProperty("--ty", (z.top + z.height / 2 - a.top - a.height / 2) + "px"); p.style.animationDelay = (k * 55) + "ms"; document.body.appendChild(p); setTimeout(() => p.remove(), 1100) } }
    } catch (e) { }
  }
  window.SpFx = { burst, count, buy };
  // конец игры: счёт, слова и уровень набегают, рекорд вспыхивает
  const _over = window.over;
  if (typeof _over === "function") window.over = function () {
    const r = _over.apply(this, arguments);
    try {
      const S = g("oS"), W = g("oW"), L = g("oL"), B = g("oB"); if (!S || still()) return r;
      const s = +S.textContent || 0, w = +W.textContent || 0, l = +L.textContent || 0;
      S.dataset.v = s; count(S, s, Math.min(1400, 500 + s * 4)); count(W, w, 700); count(L, l, 500);
      S.classList.remove("ovpop"); void S.offsetWidth; S.classList.add("ovpop");
      if (B && /РЕКОРД|RECORD|РЕКОРД/i.test(B.textContent) && /НОВЫЙ|NEW|НОВИЙ/i.test(B.textContent)) { B.classList.remove("ovrec"); void B.offsetWidth; B.classList.add("ovrec"); setTimeout(() => burst(B, ["⭐", "✨", "🏆"], 16), 650) }
    } catch (e) { }
    return r;
  };
})();
