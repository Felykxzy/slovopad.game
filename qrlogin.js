/* СЛОВОПАД — вход в Slovopad ID по QR-коду.
   Как это работает:
   1. На компьютере (где входа ещё нет) жмём «Войти по QR»: сервер выдаёт короткий код, мы рисуем из него QR и опрашиваем сервер.
   2. На телефоне, где уже выполнен вход, QR сканируется (камерой телефона, внутри игры или кодом вручную) и вход подтверждается.
   3. Компьютер получает свой токен и входит. Секрет опроса знает только компьютер, поэтому подсмотренный QR ничего не даёт.
   Подключается после app.js и qr.js. Использует глобалы игры: $, L3, ask, tg, cloudRequest, sidApply, sidInfo, sidTok, sidStatus,
   sidRender, sidOpen, cloudSync, pfOpen, CLOUD_TOKEN_KEY, cloudBusy, ACH, SlovopadQR. */
(function () {
  "use strict";

  // запасной адрес игры на случай, когда она открыта не из браузера (десктопное приложение, file://)
  const SITE_URL = "https://felykxzy.github.io/slovopad.game/";

  const T = L3;
  const base = () => (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : SITE_URL);
  const vis = () => $("o11").classList.contains("s");
  const fmt = c => c.slice(0, 4) + "-" + c.slice(4);
  const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return (s / 60 | 0) + ":" + String(s % 60).padStart(2, "0"); };
  // из ссылки, из «ABCD-EFGH» или из «abcdefgh» достаём 8-символьный код
  const norm = v => { const m = String(v).match(/[?&#]qr=([A-Za-z0-9]+)/), c = (m ? m[1] : String(v)).toUpperCase().replace(/[^A-Z0-9]/g, ""); return c.length === 8 ? c : ""; };

  let sess = null, timer = 0, polling = false, camStream = null, camTimer = 0, pending = "";

  /* ---------- тексты ---------- */
  function texts() {
    const set = (id, a, b, c) => { const e = $(id); if (e) e.textContent = T(a, b, c); };
    set("sidQrBtn", "📱 ВОЙТИ ПО QR", "📱 LOG IN WITH QR", "📱 УВІЙТИ ЗА QR");
    set("sidQrX", "ОТМЕНА", "CANCEL", "СКАСУВАТИ");
    set("sidQrNew", "НОВЫЙ КОД", "NEW CODE", "НОВИЙ КОД");
    set("sidScanT", "ВХОД НА ДРУГОМ УСТРОЙСТВЕ", "LOG IN ON ANOTHER DEVICE", "ВХІД НА ІНШОМУ ПРИСТРОЇ");
    set("sidScanH", "Открой игру на компьютере, нажми «Войти по QR» и отсканируй код здесь.", "Open the game on your computer, tap “Log in with QR” and scan the code here.", "Відкрий гру на комп’ютері, натисни «Увійти за QR» і скануй код тут.");
    set("sidScan", "📷 СКАНИРОВАТЬ QR", "📷 SCAN QR", "📷 СКАНУВАТИ QR");
    set("sidCodeOk", "ПОДТВЕРДИТЬ", "CONFIRM", "ПІДТВЕРДИТИ");
    set("sidScanX", "ЗАКРЫТЬ", "CLOSE", "ЗАКРИТИ");
    const i = $("sidCodeIn"); if (i) i.placeholder = T("ИЛИ ВВЕДИ КОД: ABCD-EFGH", "OR TYPE THE CODE: ABCD-EFGH", "АБО ВВЕДИ КОД: ABCD-EFGH");
  }

  /* ---------- компьютер: показываем QR и ждём подтверждения ---------- */
  function qrStop() {
    clearInterval(timer); timer = 0; sess = null; polling = false;
    const p = $("sidQr"); if (p) p.hidden = true;
    const b = $("sidQrBtn"); if (b) b.hidden = false;
  }

  function expired() {
    clearInterval(timer); timer = 0; sess = null;
    $("sidQrHint").textContent = T("Код устарел. Создай новый.", "The code has expired. Create a new one.", "Код застарів. Створи новий.");
    $("sidQrNew").hidden = false; $("sidQr").classList.add("old");
  }

  async function qrStart() {
    qrStop();
    const panel = $("sidQr"); panel.hidden = false; panel.classList.remove("old"); $("sidQrNew").hidden = true; $("sidQrBtn").hidden = true;
    $("sidQrCode").textContent = "········";
    $("sidQrHint").textContent = T("Создаю код…", "Creating a code…", "Створюю код…");
    let d;
    try { d = await cloudRequest("/api/qr/new", { method: "POST", body: "{}" }); }
    catch (e) { qrStop(); sidStatus(e.message, "er"); return; }
    const s = sess = { code: d.code, secret: d.secret, end: Date.now() + d.expiresIn * 1000, n: 0 };
    try { SlovopadQR.draw($("sidQrCv"), base() + "?qr=" + d.code, 480); }
    catch (e) { qrStop(); sidStatus(e.message, "er"); return; }
    $("sidQrCode").textContent = fmt(d.code);
    const left = () => T("Открой игру на телефоне, где ты уже вошёл: Профиль → Slovopad ID → «Сканировать QR». Или просто наведи камеру телефона на код. Действует: ",
      "Open the game on the phone where you are already logged in: Profile → Slovopad ID → “Scan QR”. Or just point the phone camera at the code. Valid for: ",
      "Відкрий гру на телефоні, де ти вже увійшов: Профіль → Slovopad ID → «Сканувати QR». Або просто наведи камеру телефона на код. Діє: ") + clock(s.end - Date.now());
    $("sidQrHint").textContent = left();
    timer = setInterval(async () => {
      if (sess !== s) return;
      if (!vis()) { qrStop(); return; }
      if (Date.now() >= s.end) { expired(); return; }
      $("sidQrHint").textContent = left();
      if (++s.n % 2 || polling) return;           // опрашиваем сервер раз в 2 секунды
      polling = true;
      try {
        const r = await cloudRequest("/api/qr/poll?code=" + s.code + "&secret=" + encodeURIComponent(s.secret));
        if (sess !== s) return;
        if (r.status === "expired") expired();
        else if (r.status === "ok") await done(r);
      } catch (e) { /* временный сбой связи: попробуем в следующий раз */ }
      finally { polling = false; }
    }, 1000);
  }

  async function done(r) {
    qrStop();
    try { localStorage.setItem(CLOUD_TOKEN_KEY, r.token); } catch (e) {}
    sidApply(r); if (window.ACH) ACH.cloud();
    cloudBusy = false; await cloudSync(true); pfOpen();
  }

  /* ---------- телефон: подтверждаем вход ---------- */
  async function approve(raw) {
    const code = norm(raw);
    if (!code) { sidStatus(T("Не похоже на код входа", "That doesn’t look like a login code", "Не схоже на код входу"), "er"); return; }
    const nm = (sidInfo() || {}).username || "";
    ask(T("Войти в «" + nm + "» на другом устройстве? Подтверждай, только если этот QR показан на твоём экране.",
      "Log in as “" + nm + "” on another device? Only confirm if this QR is on your own screen.",
      "Увійти в «" + nm + "» на іншому пристрої? Підтверджуй, лише якщо цей QR показано на твоєму екрані."), async ok => {
      if (!ok) return;
      try {
        await cloudRequest("/api/qr/approve", { method: "POST", body: JSON.stringify({ code }) });
        scanClose(); sidStatus(T("Готово: другое устройство вошло ✓", "Done: the other device is logged in ✓", "Готово: інший пристрій увійшов ✓"), "ok");
      } catch (e) { sidStatus(e.message, "er"); }
    });
  }

  function scanClose() {
    clearInterval(camTimer); camTimer = 0;
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
    const p = $("sidScanP"); if (p) p.hidden = true;
    const v = $("sidVid"); if (v) v.srcObject = null;
  }

  function scanMsg(m, kind) { const e = $("sidScanMsg"); e.textContent = m || ""; e.className = "hint" + (kind ? " " + kind : ""); e.hidden = !m; }

  async function scanOpen() {
    const panel = $("sidScanP"), vid = $("sidVid");
    panel.hidden = false; $("sidCodeIn").value = ""; vid.hidden = true; scanMsg("");
    setTimeout(() => { try { panel.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {} }, 50);
    // внутри Telegram есть встроенный сканер
    try {
      if (typeof tg !== "undefined" && tg && tg.showScanQrPopup) {
        tg.showScanQrPopup({ text: T("Наведи на QR на компьютере", "Point at the QR on your computer", "Наведи на QR на комп’ютері") }, t => { tg.closeScanQrPopup(); approve(t); return true; });
        return;
      }
    } catch (e) {}
    if (!(window.BarcodeDetector && navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      scanMsg(T("Сканер внутри игры в этом браузере не работает (так бывает в Safari, Firefox и в некоторых встроенных браузерах). Открой обычное приложение «Камера» на телефоне и наведи на QR на компьютере: игра откроется сама. Или введи код вручную.",
        "The in-game scanner does not work in this browser (it happens in Safari, Firefox and some in-app browsers). Open your phone’s regular Camera app and point it at the QR on the computer: the game will open by itself. Or type the code by hand.",
        "Сканер усередині гри в цьому браузері не працює (так буває в Safari, Firefox і деяких вбудованих браузерах). Відкрий звичайну програму «Камера» на телефоні й наведи на QR на комп’ютері: гра відкриється сама. Або введи код вручну."), "er");
      return;
    }
    try {
      const det = new BarcodeDetector({ formats: ["qr_code"] });
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      vid.hidden = false; vid.srcObject = camStream; await vid.play();
      scanMsg(T("Наведи камеру на QR на компьютере", "Point the camera at the QR on the computer", "Наведи камеру на QR на комп’ютері"));
      camTimer = setInterval(async () => {
        if (!vis()) { scanClose(); return; }
        try { const r = await det.detect(vid); const c = r.length && norm(r[0].rawValue); if (c) { scanClose(); approve(c); } } catch (e) {}
      }, 350);
    } catch (e) {
      scanClose(); $("sidScanP").hidden = false; vid.hidden = true;
      scanMsg(T("Нет доступа к камере. Разреши камеру для сайта в настройках браузера, либо открой обычное приложение «Камера» и наведи на QR, либо введи код вручную.",
        "No camera access. Allow the camera for this site in your browser settings, or open the regular Camera app and point it at the QR, or type the code by hand.",
        "Немає доступу до камери. Дозволь камеру для сайту в налаштуваннях браузера, або відкрий звичайну програму «Камера» й наведи на QR, або введи код вручну."), "er");
    }
  }

  /* ---------- ссылка из QR открыла игру (?qr=КОД) ---------- */
  function deepLink() {
    let c = "";
    try {
      const u = new URL(location.href); c = u.searchParams.get("qr") || "";
      const m = location.hash.match(/qr=([A-Za-z0-9]+)/); if (!c && m) c = m[1];
      if (c) { u.searchParams.delete("qr"); history.replaceState(null, "", u.pathname + u.search + (m ? "" : u.hash)); }
    } catch (e) {}
    c = norm(c); if (!c) return;
    pending = c;
    setTimeout(() => {
      sidOpen();
      if (sidTok()) { const p = pending; pending = ""; approve(p); }
      else sidStatus(T("Сначала войди в Slovopad ID на этом устройстве, потом подтвердим вход на компьютере.", "First log in to Slovopad ID on this device, then we’ll confirm the login on the computer.", "Спершу увійди в Slovopad ID на цьому пристрої, потім підтвердимо вхід на комп’ютері."));
    }, 700);
  }

  /* ---------- подключение к экрану ID ---------- */
  $("sidQrBtn").onclick = qrStart; $("sidQrNew").onclick = qrStart;
  $("sidQrX").onclick = () => { qrStop(); sidStatus(""); };
  $("sidScan").onclick = scanOpen; $("sidScanX").onclick = scanClose;
  $("sidCodeOk").onclick = () => approve($("sidCodeIn").value);
  $("sidCodeIn").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9); });
  $("sidClose").addEventListener("click", () => { qrStop(); scanClose(); });

  { const _ia = i18nApply; i18nApply = function () { _ia(); try { texts(); } catch (e) {} }; }
  // после входа на этом устройстве ждавший подтверждения QR-код предлагаем подтвердить сразу
  { const _sr = sidRender; sidRender = function () { _sr.apply(this, arguments); if (pending && sidTok()) { const p = pending; pending = ""; setTimeout(() => approve(p), 400); } }; }

  texts(); deepLink();
})();
