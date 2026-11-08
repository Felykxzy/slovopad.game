/* СЛОВОПАД — обучение на живом игровом экране (последний этап цепочки: экскурсия → правила → практика).
   Награду за обучение выдаёт achievements.js, когда игрок вернулся в меню.
   Подключается после app.js. Использует глобалы игры: $, CFG, T, W, H, SY, ctx, FONT, items, state, GL, TH, WL, best,
   spawnT, ti, size, start, lw, toMenu, pickTheme, THEMES, burst, snd, arp, hap, PR, prHook. */
(function () {
  "use strict";

  const LS_PR = "tutPr";
  const PW = [["луна", "ветер", "звезда"], ["moon", "wind", "star"], ["зірка", "вітер", "місяць"]]; // слова для практики по языку СЛОВ
  const KINDS = ["n", "n", "g"], SPEED = [.7, .8, .85];

  const TX = [
    { next: "ДАЛЕЕ", go: "ПОПРОБОВАТЬ ✋", skip: "ПРОПУСТИТЬ",
      ex: [
        ["ОЧКИ", "Здесь копится твой счёт. За каждое слово даются очки, а за золотые втрое больше."],
        ["КОМБО И РЕКОРД", "Печатай без ошибок, и здесь вырастет комбо с множителем очков. Пока комбо нет, тут твой рекорд."],
        ["УРОВЕНЬ", "Шкала заполняется с каждым словом. Каждые 8 слов начинается новый уровень, и слова падают быстрее."],
        ["ЗВУК И ПАУЗА", "Кнопка 🔊 включает и выключает звук, а ⏸ ставит игру на паузу. Пауза ещё и на клавише Esc."],
        ["ЩИТ", "Это твой щит. Три сегмента — три жизни. Слово, которое долетит сюда, пробьёт один сегмент."]
      ],
      hint: [
        ["СЛОВО 1 / 3", "Набери «{w}» буква за буквой. Ошибся — просто продолжай."],
        ["СЛОВО 2 / 3", "Ещё одно! Набери «{w}» без ошибок, и сверху появится комбо."],
        ["СЛОВО 3 / 3", "Золотое слово «{w}»: за него втрое больше очков!"]
      ],
      good: ["ОТЛИЧНО!", "ТАК ДЕРЖАТЬ!", "ЗОЛОТО!"],
      lose: ["ЩИТ ВЫДЕРЖАЛ", "В обучении жизни не тратятся. Попробуй ещё раз!"],
      done: ["ОБУЧЕНИЕ ПРОЙДЕНО", "Ты освоил всё главное. Выйди в меню — там тебя ждёт награда!"], menu: "В МЕНЮ", play: "▶ ИГРАТЬ" },
    { next: "NEXT", go: "TRY IT ✋", skip: "SKIP",
      ex: [
        ["SCORE", "Your score builds up here. Every word earns points, and golden words give triple."],
        ["COMBO AND RECORD", "Type without mistakes and a combo with a score multiplier grows here. With no combo, this shows your record."],
        ["LEVEL", "The bar fills with every word. Every 8 words you reach a new level and words fall faster."],
        ["SOUND AND PAUSE", "The 🔊 button turns sound on and off, ⏸ pauses the game. You can also pause with Esc."],
        ["SHIELD", "This is your shield. Three segments, three lives. A word that reaches it breaks one segment."]
      ],
      hint: [
        ["WORD 1 / 3", "Type “{w}” letter by letter. Made a typo? Just keep going."],
        ["WORD 2 / 3", "One more! Type “{w}” with no mistakes and a combo appears at the top."],
        ["WORD 3 / 3", "A golden word, “{w}”: it gives triple points!"]
      ],
      good: ["GREAT!", "KEEP GOING!", "GOLDEN!"],
      lose: ["SHIELD HELD", "You don't lose lives in the tutorial. Try again!"],
      done: ["TUTORIAL COMPLETE", "You've learned the basics. Go back to the menu: a reward is waiting!"], menu: "TO MENU", play: "▶ PLAY" },
    { next: "ДАЛІ", go: "СПРОБУВАТИ ✋", skip: "ПРОПУСТИТИ",
      ex: [
        ["ОЧКИ", "Тут збирається твій рахунок. За кожне слово дають очки, а за золоті втричі більше."],
        ["КОМБО І РЕКОРД", "Друкуй без помилок, і тут зросте комбо з множником очок. Поки комбо немає, тут твій рекорд."],
        ["РІВЕНЬ", "Шкала заповнюється з кожним словом. Кожні 8 слів починається новий рівень, і слова падають швидше."],
        ["ЗВУК І ПАУЗА", "Кнопка 🔊 вмикає й вимикає звук, а ⏸ ставить гру на паузу. Пауза ще й на клавіші Esc."],
        ["ЩИТ", "Це твій щит. Три сегменти — три життя. Слово, яке долетить сюди, пробʼє один сегмент."]
      ],
      hint: [
        ["СЛОВО 1 / 3", "Набери «{w}» літера за літерою. Помилився — просто продовжуй."],
        ["СЛОВО 2 / 3", "Ще одне! Набери «{w}» без помилок, і вгорі зʼявиться комбо."],
        ["СЛОВО 3 / 3", "Золоте слово «{w}»: за нього втричі більше очок!"]
      ],
      good: ["ЧУДОВО!", "ТАК ТРИМАТИ!", "ЗОЛОТО!"],
      lose: ["ЩИТ ВИТРИМАВ", "У навчанні життя не витрачаються. Спробуй ще раз!"],
      done: ["НАВЧАННЯ ПРОЙДЕНО", "Ти засвоїв усе головне. Вийди в меню — там на тебе чекає нагорода!"], menu: "В МЕНЮ", play: "▶ ГРАТИ" }
  ];
  const tt = () => TX[CFG.lang | 0] || TX[0];

  /* ---------- обучение на живом экране ---------- */
  let act = false, phase = "", si = 0, wi = 0, cur = null, timers = [];
  let root, sp, card, ct, cp, cx, dots, btnN, btnS;

  const later = (ms, fn) => { timers.push(setTimeout(fn, ms)); };
  const clearT = () => { timers.forEach(clearTimeout); timers = []; };

  function build() {
    if (root) return;
    root = document.createElement("div"); root.id = "coach";
    root.innerHTML = '<div id="csp"></div><div id="ccard"><div class="cce">🎓</div><div class="cct"></div><div class="ccp"></div>' +
      '<div class="cdots"><i></i><i></i><i></i></div><div class="ccb"><button class="tsk" id="ccS"></button><button class="btn" id="ccN"></button></div></div>';
    document.body.appendChild(root);
    sp = $("csp"); card = $("ccard"); ct = root.querySelector(".cct"); cp = root.querySelector(".ccp"); dots = [...root.querySelectorAll(".cdots i")];
    btnN = $("ccN"); btnS = $("ccS");
    btnN.onclick = function () { this.blur(); if (phase === "ex") { if (si < 4) { si++; showEx(); } else toHints(); } else if (phase === "dn") toMenu(); };
    btnS.onclick = function () { this.blur(); if (phase === "ex") toHints(); else if (phase === "dn") { cleanup(); pickTheme(THEMES[THEMES.length - 1]); } };
    addEventListener("resize", place);
    if (window.visualViewport) visualViewport.addEventListener("resize", place);
    // во время пояснений блокируем клавиатуру и даём управлять стрелками/Enter
    document.addEventListener("keydown", e => {
      if (!act || (phase !== "ex" && phase !== "dn") || root.classList.contains("off")) return;
      const k = e.key;
      if (k === "Enter" || k === " " || k === "ArrowRight") btnN.click();
      else if (k === "Escape") { if (phase === "ex") toHints(); }
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    setInterval(() => {
      if (!act) return;
      if (state === "idle" || state === "over") { cleanup(); return; }
      const tutOpen = $("tut") && $("tut").classList.contains("s");
      root.classList.toggle("off", state !== "play" || !!tutOpen);
    }, 250);
  }

  function box(els, pad, minW, txt) {
    let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
    els.forEach(e => {
      let q; if (txt) { const rg = document.createRange(); rg.selectNodeContents(e); q = rg.getBoundingClientRect(); } else q = e.getBoundingClientRect(); l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); });
    if (r - l < minW) { const m = (l + r) / 2; l = m - minW / 2; r = m + minW / 2; }
    l = Math.max(l, pad + 4); // не вылезаем за левый край экрана
    return { left: l - pad, top: t - pad, width: r - l + pad * 2, height: b - t + pad * 2 };
  }
  function rect(i) {
    if (i === 0) return box([$("score")], 10, 84, true);
    if (i === 1) return box([$("cm")], 9, 130, true);
    if (i === 2) return box([$("lvl")], 10, 0);
    if (i === 3) return box([$("mu"), $("ps")], 8, 0);
    const q = $("g").getBoundingClientRect();
    return { left: q.left + 6, top: q.top + H - SY - 30, width: q.width - 12, height: 60 };
  }

  function place() {
    if (!act || !card) return;
    if (phase === "ex") {
      const r = rect(si);
      sp.style.left = r.left + "px"; sp.style.top = r.top + "px"; sp.style.width = r.width + "px"; sp.style.height = r.height + "px";
      const ch = card.offsetHeight, below = r.top + r.height / 2 < innerHeight * .5;
      let top = below ? r.top + r.height + 18 : r.top - ch - 18;
      card.style.top = Math.max(8, Math.min(innerHeight - ch - 8, top)) + "px";
      // на широких экранах карточка стоит рядом с подсвеченным элементом, на телефоне — по центру
      const cw = card.offsetWidth, mid = Math.max(cw / 2 + 12, Math.min(innerWidth - cw / 2 - 12, r.left + r.width / 2));
      card.style.left = mid + "px";
    } else if (phase === "hn") {
      card.style.left = "50%";
      card.style.top = ($("fw").getBoundingClientRect().top + 10) + "px";
    } else if (phase === "dn") {
      card.style.left = "50%";
      card.style.top = Math.max(8, (innerHeight - card.offsetHeight) / 2) + "px";
    }
  }

  function pop() { card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop"); }

  function showEx() {
    const t = tt(), e = t.ex[si];
    ct.textContent = e[0]; cp.textContent = e[1];
    btnN.textContent = si < 4 ? t.next + " →" : t.go; btnS.textContent = t.skip;
    pop(); place(); requestAnimationFrame(place);
    try { snd(500 + si * 70, .07, "triangle", .05); hap("light", 1); } catch (e2) {}
  }

  function spawnCur() {
    cur = { w: PW[GL][wi], type: KINDS[wi], v: SPEED[wi] };
    ctx.font = FONT;
    const up = cur.w.toUpperCase(), lx = []; let a = 0;
    for (const ch of up) { lx.push(a); a += ctx.measureText(ch).width + 2; }
    const x = Math.min(W - 80, Math.max(80, W * (.3 + Math.random() * .4)));
    // слово появляется сразу под подсказкой (со вспышкой), чтобы его не закрывала карточка
    const y = Math.max(-70, 10 + card.offsetHeight - 14);
    items.push({ name: cur.w, up, type: cur.type, lx, pw: a + 20, x, cx: x, y, lane: 0, v: cur.v, ph: Math.random() * 6, k: 0 });
    if (y > 0) { burst(x, y, 16, T[cur.type]); try { snd(700, .06, "sine", .04); } catch (e) {} }
  }

  function showHint() {
    const t = tt(), h = t.hint[wi];
    ct.textContent = h[0]; cp.textContent = h[1].replace("{w}", PW[GL][wi].toUpperCase());
    card.classList.remove("good", "bad");
    dots.forEach((d, i) => { d.className = i < wi ? "ok" : i === wi ? "on" : ""; });
    pop(); place();
  }

  function toHints() {
    phase = "hn"; root.className = ""; root.classList.add("hn"); wi = 0;
    ti.value = ""; foc(); showHint(); spawnCur();
    try { arp([392, 523], .07, "triangle", .05); } catch (e) {}
  }

  function onKill() {
    if (phase !== "hn") return;
    const t = tt(); ct.textContent = t.good[wi]; cp.textContent = "✔"; card.classList.add("good"); dots[wi].className = "ok"; pop();
    if (wi < 2) later(1000, () => { wi++; showHint(); spawnCur(); });
    else later(1100, showDone);
  }

  function onLose(it) {
    if (phase !== "hn") return;
    const t = tt(); burst(it.cx, H - SY, 22, T.r); try { snd(160, .2, "square", .05); } catch (e) {}
    ct.textContent = t.lose[0]; cp.textContent = t.lose[1]; card.classList.add("bad"); pop();
    later(1500, () => { showHint(); spawnCur(); });
  }

  function showDone() {
    phase = "dn"; root.className = ""; root.classList.add("dn"); card.classList.remove("good", "bad"); ti.blur(); ti.value = "";
    try { localStorage.setItem(LS_PR, "1"); localStorage.setItem("tutDone", "1"); } catch (e) {}
    const t = tt(); ct.textContent = t.done[0]; cp.textContent = t.done[1]; btnN.textContent = t.menu; btnS.textContent = t.play;
    pop(); place(); requestAnimationFrame(place);
    burst(W / 2, H * .4, 60, T.g); burst(W / 2, H * .45, 40, T.n);
    try { arp([523, 659, 784, 1047, 1319], .09, "triangle", .06); hap("success"); } catch (e) {}
  }

  function cleanup() {
    if (!act) return;
    act = false; PR = 0; prHook = null; clearT();
    if (root) { root.className = ""; }
  }

  function hook(ev, it) {
    if (ev === "kill") onKill(it);
    else if (ev === "lose") onLose(it);
    else if (ev === "over") toMenu();   // «Завершить» из паузы → просто в меню, без экрана результата
    else if (ev === "menu") cleanup();
  }

  window.startPractice = function () {
    if (act || state !== "idle") return;
    build();
    act = true; PR = 1; prHook = hook;
    TH = THEMES[THEMES.length - 1]; GL = CFG.wl; WL = lw(TH).split(" "); best = 0;
    size(); start();          // PR=1: не трогает статистику, серию дней и рекорды
    spawnT = 1e9; ti.blur();  // обычные слова не появляются, всё по сценарию
    phase = "ex"; si = 0; root.className = ""; root.classList.add("ex"); cur = null;
    showEx();
  };
})();
