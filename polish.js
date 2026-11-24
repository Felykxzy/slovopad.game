/* 4.18: красота вне геймплея (всё мягко: если чего-то нет, просто пропускаем) */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const calm = () => { try { return matchMedia("(prefers-reduced-motion:reduce)").matches } catch (e) { return false } };
  const num = s => parseInt(String(s).replace(/\D/g, ""), 10) || 0;

  /* 5. рамка аватарки по рангу (только твои аватарки) */
  function rankFrames() {
    let r = 0;
    try { r = rki(tw()) } catch (e) { return }
    const els = [$("pcA"), $("eAv")].concat([].slice.call(document.querySelectorAll("#o7 .phero .av")));
    els.forEach(e => { if (!e) return; if (r > 0) e.setAttribute("data-rk", r); else e.removeAttribute("data-rk") });
  }

  /* 8. серия: растущий огонёк */
  function flame() {
    const c = $("hC"); if (!c || !c.parentNode) return;
    const i = c.parentNode, f = i;
    const n = num(c.textContent), lv = n >= 100 ? 5 : n >= 30 ? 4 : n >= 7 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
    if (lv) i.setAttribute("data-fl", lv); else i.removeAttribute("data-fl");
    let seen = ""; try { seen = localStorage.getItem("plFlame") || "" } catch (e) { }
    if ([7, 30, 100].indexOf(n) >= 0 && seen !== String(n) && !calm()) {
      try { localStorage.setItem("plFlame", String(n)) } catch (e) { }
      const r = f.getBoundingClientRect();
      for (let k = 0; k < 18; k++) {
        const p = document.createElement("i"); p.className = "plspark"; p.style.left = r.left + r.width / 2 + "px"; p.style.top = r.top + r.height / 2 + "px";
        const a = Math.random() * 6.283, d = 30 + Math.random() * 60; p.style.setProperty("--dx", Math.cos(a) * d + "px"); p.style.setProperty("--dy", Math.sin(a) * d - 20 + "px");
        document.body.appendChild(p); setTimeout(() => p.remove(), 1100);
      }
    }
  }

  /* 2. конец игры: счёт набегает; при рекорде — дождь звёзд */
  function overFx() {
    const o3 = $("o3"), s = $("oS"), b = $("oB"); if (!o3 || !s) return;
    let busy = false;
    const run = () => {
      if (busy || !o3.classList.contains("s")) return;
      const v = num(s.textContent); if (v < 20 || calm()) return;
      busy = true; const t0 = performance.now(), D = Math.min(1300, 500 + v * 0.35);
      const step = t => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); s.textContent = Math.round(v * e); if (k < 1 && o3.classList.contains("s")) requestAnimationFrame(step); else { s.textContent = v; busy = false } };
      s.textContent = 0; requestAnimationFrame(step);
      if (b && b.textContent && /РЕКОРД|RECORD|РЕКОРД/i.test(b.textContent)) { b.classList.add("plrec"); stars() } else if (b) b.classList.remove("plrec");
    };
    new MutationObserver(() => { if (o3.classList.contains("s")) setTimeout(run, 60); else busy = false }).observe(o3, { attributes: true, attributeFilter: ["class"] });
  }
  function stars() {
    if (calm()) return;
    const W = innerWidth, H = innerHeight, em = ["⭐", "✨", "🌟"];
    for (let k = 0; k < 22; k++) setTimeout(() => {
      const p = document.createElement("i"); p.className = "plstar"; p.style.fontStyle = "normal"; p.textContent = em[k % 3];
      p.style.left = W * (.2 + Math.random() * .6) + "px"; p.style.top = H * .36 + "px";
      p.style.setProperty("--dx", (Math.random() - .5) * 220 + "px"); p.style.setProperty("--dy", -80 - Math.random() * 160 + "px");
      document.body.appendChild(p); setTimeout(() => p.remove(), 1400);
    }, k * 45);
  }

  /* 3. магазин: дорогие вещи — в золотой рамке */
  function shopRare() {
    try {
      const cards = document.querySelectorAll("#o12 .sx"); if (!cards.length || typeof SHOP === "undefined" || typeof shTab === "undefined") return;
      const list = SHOP.filter(x => x[1] === shTab);
      cards.forEach((c, i) => { const x = list[i]; c.classList.toggle("rare", !!(x && x[2] >= 1500)) });
    } catch (e) { }
  }

  /* 6. темы чатов: обычная / неон / космос */
  const TH = ["", "neon", "space"], THN = ["🎨", "💗", "🌌"];
  function theme(set) {
    let t = 0; try { t = +localStorage.getItem("plCt") || 0 } catch (e) { }
    if (set != null) { t = set; try { localStorage.setItem("plCt", String(t)) } catch (e) { } }
    if (TH[t]) document.body.setAttribute("data-ct", TH[t]); else document.body.removeAttribute("data-ct");
    const b = $("plCt"); if (b) b.textContent = THN[t];
    return t;
  }
  function themeBtn() {
    if ($("plCt")) return true;
    const sb = $("ecSb"); if (!sb || !sb.parentNode) return false;
    const b = document.createElement("button"); b.type = "button"; b.id = "plCt"; b.className = "ib ecsb"; b.setAttribute("aria-label", "chat theme");
    b.onclick = () => theme((theme() + 1) % TH.length);
    sb.parentNode.insertBefore(b, sb.nextSibling); theme(); return true;
  }


  /* 4.20: сундук с наградой */
  function chest(o) {
    const old = $("chO"); if (old) old.remove();
    const el = document.createElement("div"); el.id = "chO";
    el.innerHTML = '<div class="chRays"></div><div class="chStage"><div class="chBox"><i class="chBody"></i><i class="chBand"></i><i class="chLid"></i><i class="chLock"></i></div><div class="chGlow"></div><div class="chCard"><canvas></canvas><b></b><span></span></div></div><div class="chBt"><button type="button" class="btn" id="chEq"></button><button type="button" class="btn sec" id="chOk"></button></div>';
    el.querySelector("b").textContent = o.title || ""; el.querySelector(".chCard span").textContent = o.name || "";
    el.querySelector("#chOk").textContent = o.ok || "OK"; const eqb = el.querySelector("#chEq"); eqb.textContent = o.eq || "";
    if (!o.onEq) eqb.style.display = "none";
    document.body.appendChild(el);
    const cv = el.querySelector("canvas"), D = 2; cv._D = D; cv.width = 260 * D; cv.height = 150 * D; cv.style.width = "260px"; cv.style.height = "150px";
    let alive = true; const t0 = performance.now();
    const loop = () => { if (!alive) return; try { shPrev(cv, shI(o.id), (performance.now() - t0) / 1000 + 2) } catch (e) { } requestAnimationFrame(loop) };
    if (o.id) loop();
    try { if (typeof arp === "function") { arp([392, 494, 587], .1); setTimeout(() => arp([784, 988, 1175, 1568], .07), 1100) } } catch (e) { }
    requestAnimationFrame(() => el.classList.add("s"));
    setTimeout(() => el.classList.add("open"), 900);
    const close = fn => { alive = false; el.classList.remove("s"); setTimeout(() => { el.remove(); if (fn) fn() }, 350) };
    el.querySelector("#chOk").onclick = () => close(o.done);
    eqb.onclick = () => { try { o.onEq() } catch (e) { } close(o.done) };
    if (!calm()) setTimeout(() => stars(), 1000);
  }
  /* 5.0.1: кнопка «Обновить игру» прячет настройки. Когда окно закрыли («Не надо», «Позже»),
     а на экране не осталось ни одного окна, возвращаем экран, с которого его открыли (иначе пустой фон до перезагрузки) */
  function updBack() {
    const up = $("up"); if (!up) return;
    new MutationObserver(() => {
      if (up.classList.contains("s")) return;
      setTimeout(() => {
        try {
          if (up.classList.contains("s") || document.querySelector(".ov.s") || state === "play") return;
          ov(ov.cur && $(ov.cur) ? ov.cur : "o1");
        } catch (e) { }
      }, 0);
    }).observe(up, { attributes: true, attributeFilter: ["class"] });
  }
  window.SlovopadPolish = { chest: chest, themeBtn: themeBtn, theme: theme, stars: stars };
  function init() {
    theme();
    updBack();
    rankFrames(); flame(); overFx();
    const hc = $("hC"); if (hc) new MutationObserver(flame).observe(hc, { childList: true, characterData: true, subtree: true });
    ["pc", "c7x"].forEach(id => { const e = $(id); if (e) e.addEventListener("click", () => setTimeout(rankFrames, 400)) });
    ["o7", "o8", "o1"].forEach(id => { const e = $(id); if (e) new MutationObserver(() => setTimeout(rankFrames, 50)).observe(e, { attributes: true, attributeFilter: ["class"] }) });
    const sh = $("o12"); if (sh) { new MutationObserver(() => shopRare()).observe(sh, { childList: true, subtree: true }); shopRare() }
    themeBtn(); let q = 0; new MutationObserver(() => { if (q || $("plCt")) return; q = setTimeout(() => { q = 0; themeBtn() }, 200) }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0)); else setTimeout(init, 0);
})();
