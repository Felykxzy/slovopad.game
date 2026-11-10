/* СЛОВОПАД — экскурсия по меню: по очереди подсвечивает кнопки и объясняет, что они делают.
   Подключается после tutorial.js. Цепочка обучения целиком:
   экскурсия по меню (этот файл) → анимированные правила (tutorial.js) → практика на живом экране → достижение (practice.js, achievements.js).
   Использует глобалы игры: $, CFG, state. Запуск: startTour(done), done() вызывается, когда экскурсия закончилась или её пропустили. */
(function () {
  "use strict";

  /* шаги: какие элементы подсвечивать (если их несколько — рамка охватит все видимые) */
  const STEPS = [
    ["pc"], ["gs"], ["rk"], ["tp"], ["qp"], ["shopB"], ["idB", "tgB"], ["hwB"]
  ];

  /* тексты: 0 = русский, 1 = английский, 2 = украинский */
  const D = [
    { sk: "ПРОПУСТИТЬ", nx: "ДАЛЕЕ", rules: "К ПРАВИЛАМ ▶", st: [
      ["ПРОФИЛЬ", "Здесь твой Slovopad ID: один аккаунт на всех устройствах, ник, аватарка, статистика и достижения. Чтобы открыть профиль, нужно создать ID, это бесплатно. А играть можно и без него."],
      ["НАСТРОЙКИ", "Звук, вибрация, скорость слов, качество графики и язык интерфейса. Подстрой игру под себя."],
      ["РАНГИ", "Чем больше слов ты напечатал, тем выше ранг: от Новичка до Легенды. Каждый ранг открывает новые аватарки, но слова падают чуть быстрее."],
      ["ТЕМАТИКИ", "Выбери тему: бренды, игры, города, страны, животные или всё подряд. Здесь же переключаются слова: русские, английские или украинские."],
      ["БЫСТРАЯ ИГРА", "Одно нажатие, и игра стартует со словами изо всех тем. Самый быстрый способ сыграть."],
      ["МАГАЗИН", "За очки ✨, которые ты зарабатываешь в играх и за достижения, покупай скины щита и анимированные фоны."],
      ["ИДЕЯ И TELEGRAM", "Лампочка — отправить свою идею для игры. Значок Telegram — канал автора с новостями."],
      ["КАК ИГРАТЬ", "Обучение всегда под рукой: эта кнопка запускает его заново. А сейчас перейдём к правилам игры."]
    ] },
    { sk: "SKIP", nx: "NEXT", rules: "TO THE RULES ▶", st: [
      ["PROFILE", "Your Slovopad ID lives here: one account for all devices, nickname, avatar, stats and achievements. Create an ID to open your profile, it's free. You can play without it."],
      ["SETTINGS", "Sound, vibration, word speed, graphics quality and interface language. Tune the game to your liking."],
      ["RANKS", "The more words you type, the higher your rank: from Rookie to Legend. Every rank unlocks new avatars, but words fall a bit faster."],
      ["THEMES", "Pick a theme: brands, games, cities, countries, animals or everything at once. You can also switch the words here: Russian, English or Ukrainian."],
      ["QUICK PLAY", "One tap and the game starts with words from every theme. The fastest way to play."],
      ["SHOP", "Spend the ✨ you earn in games and for achievements on shield skins and animated backgrounds."],
      ["IDEAS AND TELEGRAM", "The light bulb sends your idea for the game. The Telegram icon opens the author's news channel."],
      ["HOW TO PLAY", "The tutorial is always at hand: this button replays it. Now let's move on to the rules of the game."]
    ] },
    { sk: "ПРОПУСТИТИ", nx: "ДАЛІ", rules: "ДО ПРАВИЛ ▶", st: [
      ["ПРОФІЛЬ", "Тут твій Slovopad ID: один акаунт на всіх пристроях, нік, аватарка, статистика та досягнення. Щоб відкрити профіль, треба створити ID, це безкоштовно. А грати можна й без нього."],
      ["НАЛАШТУВАННЯ", "Звук, вібрація, швидкість слів, якість графіки та мова інтерфейсу. Налаштуй гру під себе."],
      ["РАНГИ", "Чим більше слів ти надрукував, тим вищий ранг: від Новачка до Легенди. Кожен ранг відкриває нові аватарки, але слова падають трохи швидше."],
      ["ТЕМАТИКИ", "Обери тему: бренди, ігри, міста, країни, тварини або все підряд. Тут же перемикаються слова: російські, англійські чи українські."],
      ["ШВИДКА ГРА", "Одне натискання, і гра стартує зі словами з усіх тем. Найшвидший спосіб зіграти."],
      ["МАГАЗИН", "За очки ✨, які ти заробляєш в іграх і за досягнення, купуй скіни щита та анімовані фони."],
      ["ІДЕЯ І TELEGRAM", "Лампочка — надіслати свою ідею для гри. Значок Telegram — канал автора з новинами."],
      ["ЯК ГРАТИ", "Навчання завжди під рукою: ця кнопка запускає його знову. А зараз перейдемо до правил гри."]
    ] }
  ];
  const dd = () => D[CFG.lang | 0] || D[0];

  let root, sp, card, ct, cp, cn, dots, bS, bP, bN;
  let isOpen = false, step = 0, done = null, timers = [], act = [];   // act — номера шагов, у которых кнопка сейчас есть на экране

  const later = (ms, fn) => { timers.push(setTimeout(fn, ms)); };
  const clearT = () => { timers.forEach(clearTimeout); timers = []; };
  const vis = id => { const e = $(id); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? e : null; };

  function build() {
    if (root) return;
    root = document.createElement("div"); root.id = "tour"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true");
    root.innerHTML = '<div id="tsp"></div><div id="tcard"><div class="tcn"></div><div class="cct"></div><div class="ccp"></div>' +
      '<div class="tdd"></div><div class="tcb"><button class="tsk" id="tourS"></button><button class="btn a" id="tourP" aria-label="←">←</button><button class="btn" id="tourN"></button></div></div>';
    document.body.appendChild(root);
    sp = $("tsp"); card = $("tcard"); ct = card.querySelector(".cct"); cp = card.querySelector(".ccp"); cn = card.querySelector(".tcn");
    dots = card.querySelector(".tdd"); bS = $("tourS"); bP = $("tourP"); bN = $("tourN");
    bS.onclick = function () { this.blur(); finish(); };
    bP.onclick = function () { this.blur(); go(step - 1); };
    bN.onclick = function () { this.blur(); if (step < act.length - 1) go(step + 1); else finish(); };
    addEventListener("resize", place);
    if (window.visualViewport) visualViewport.addEventListener("resize", place);
    // пока идёт экскурсия, клавиатура управляет только ею (приоритет над паузой по Esc)
    document.addEventListener("keydown", e => {
      if (!isOpen) return;
      const k = e.key;
      if (k === "Enter" || k === " " || k === "ArrowRight") bN.click();
      else if (k === "ArrowLeft") bP.click();
      else if (k === "Escape") finish();
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
  }

  // рамка вокруг нужных элементов (радиус скругления берём у самой кнопки)
  function box(els, pad) {
    let l = 1e9, t = 1e9, r = -1e9, b = -1e9, rad = 0;
    els.forEach(e => {
      const q = e.getBoundingClientRect(); l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
      rad = Math.max(rad, parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0);
    });
    l = Math.max(l - pad, 4); t = Math.max(t - pad, 4); r = Math.min(r + pad, innerWidth - 4); b = Math.min(b + pad, innerHeight - 4);
    return { left: l, top: t, width: r - l, height: b - t, rad: Math.min(rad + pad, 26, (r - l) / 2, (b - t) / 2) };
  }

  function place() {
    if (!isOpen) return;
    const els = STEPS[act[step]].map(vis).filter(Boolean);
    if (!els.length) return;
    const r = box(els, 8);
    sp.style.left = r.left + "px"; sp.style.top = r.top + "px"; sp.style.width = r.width + "px"; sp.style.height = r.height + "px"; sp.style.borderRadius = r.rad + "px";
    const ch = card.offsetHeight, below = r.top + r.height / 2 < innerHeight * .5;
    const top = below ? r.top + r.height + 18 : r.top - ch - 18;
    card.style.top = Math.max(8, Math.min(innerHeight - ch - 8, top)) + "px";
    const cw = card.offsetWidth;
    card.style.left = Math.max(cw / 2 + 12, Math.min(innerWidth - cw / 2 - 12, r.left + r.width / 2)) + "px";
  }

  function show(n) {
    step = n;
    const t = dd(), s = t.st[act[n]], last = n === act.length - 1;
    cn.textContent = (n + 1) + " / " + act.length; ct.textContent = s[0]; cp.textContent = s[1];
    bS.textContent = t.sk; bN.textContent = last ? t.rules : t.nx + " →"; bP.style.visibility = n ? "visible" : "hidden";
    [...dots.children].forEach((d, i) => { d.className = i < n ? "ok" : i === n ? "on" : ""; });
    card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
    place(); requestAnimationFrame(place); later(120, place); later(600, place);   // повторно: кнопки меню ещё могут анимироваться
  }

  function go(n) {
    if (n < 0 || n >= act.length || n === step) return;
    show(n);
    try { snd(440 + n * 45, .07, "triangle", .05); hap("light", 1); } catch (e) {}
  }

  function finish() {
    if (!isOpen) return;
    isOpen = false; clearT(); document.body.classList.remove("hold"); root.classList.remove("s");
    const cb = done; done = null; if (cb) cb();
  }

  window.startTour = function (cb) {
    // экскурсия имеет смысл только в меню: иначе сразу переходим к следующему этапу
    act = STEPS.map((s, i) => i).filter(i => STEPS[i].some(vis));
    if (isOpen || state !== "idle" || !$("o1").classList.contains("s") || !act.length) { if (cb) cb(); return; }
    build(); done = cb || null; isOpen = true;
    dots.innerHTML = ""; act.forEach(() => dots.appendChild(document.createElement("i")));
    document.body.classList.add("hold"); root.classList.add("s"); show(0);
    try { snd(523, .08, "triangle", .05); later(70, () => snd(784, .1, "triangle", .05)); } catch (e) {}
  };
})();
