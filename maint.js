/* СЛОВОПАД — режим техработ.
   Раз в минуту (и при возвращении на вкладку) игра спрашивает у сервера /api/status.
   Если владелец выключил игру в админ-панели (admin.html), поверх всего показывается чёрный экран, а раунд ставится на паузу.
   Когда игру включают обратно, страница обновляется сама. Кнопка «Перезапустить» в админке увеличивает epoch: открытые игры тоже перезагружаются.
   Если связи с сервером нет, игре это не мешает (она работает и без сети). Подключается после app.js, использует CLOUD_URL, L3, pause, state. */
(function () {
  "use strict";
  const EVERY = 60000;
  const T = (a, b, c) => (typeof L3 === "function" ? L3(a, b, c) : a);
  let epoch = null, shown = false, el = null, busy = false, reloadTimer = 0;

  function build() {
    const css = document.createElement("style");
    css.textContent = "#maint{position:fixed;inset:0;z-index:2147483647;background:#000;color:#e8ecff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;font-family:-apple-system,system-ui,'Segoe UI',sans-serif;touch-action:none}" +
      "#maint[hidden]{display:none}#maint h1{margin:0;font-size:clamp(20px,6vw,32px);letter-spacing:.18em;font-weight:800}#maint p{margin:0;max-width:420px;font-size:14px;line-height:1.6;opacity:.75}" +
      "#maint .d{width:10px;height:10px;border-radius:50%;background:#5ef2ff;box-shadow:0 0 18px #5ef2ff;animation:mt 1.6s ease-in-out infinite}@keyframes mt{50%{opacity:.2}}";
    document.head.appendChild(css);
    el = document.createElement("div"); el.id = "maint"; el.hidden = true; el.setAttribute("role", "alert");
    el.innerHTML = '<div class="d"></div><h1></h1><p class="m"></p><p class="n"></p>';
    document.body.appendChild(el);
  }

  function show(msg) {
    if (!el) build();
    el.querySelector("h1").textContent = T("СЛОВОПАД ВРЕМЕННО НЕ РАБОТАЕТ", "SLOVOPAD IS TEMPORARILY DOWN", "СЛОВОПАД ТИМЧАСОВО НЕ ПРАЦЮЄ");
    el.querySelector(".m").textContent = msg || T("Идёт обновление. Загляни чуть позже.", "An update is in progress. Please come back soon.", "Триває оновлення. Зазирни трохи згодом.");
    el.querySelector(".n").textContent = T("Страница обновится сама, когда игра снова заработает.", "This page will refresh by itself when the game is back.", "Сторінка оновиться сама, коли гра знову запрацює.");
    el.hidden = false;
    if (!shown) {
      shown = true;
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
      try { if (typeof pause === "function") pause(); } catch (e) {}   // раунд встаёт на паузу и сохраняется
    }
  }

  // перезагружаем, но не посреди раунда: ждём, пока игрок не закончит
  function reloadSoon() {
    if (reloadTimer) return;
    const go = () => {
      let playing = false; try { playing = typeof state !== "undefined" && state === "play"; } catch (e) {}
      if (playing) { reloadTimer = setTimeout(go, 2000); return; }
      location.reload();
    };
    reloadTimer = 1; go();
  }

  function apply(d) {
    const ep = Number(d.epoch) || 0;
    if (epoch === null) epoch = ep;
    if (d.off) { show(String(d.msg || "").slice(0, 200)); if (ep !== epoch) { epoch = ep; reloadSoon(); } return; }
    if (shown || ep !== epoch) reloadSoon();   // игру включили обратно или нажали «Перезапустить»
  }

  async function check() {
    if (busy || typeof CLOUD_URL === "undefined") return;
    busy = true;
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(CLOUD_URL + "/api/status", { cache: "no-store", signal: ctl.signal });
      if (r.ok) apply(await r.json());
    } catch (e) { /* нет связи — не мешаем игре */ }
    finally { clearTimeout(tm); busy = false; }
  }

  setInterval(() => { if (!document.hidden) check(); }, EVERY);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  check();
})();
