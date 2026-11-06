/* СЛОВОПАД — анимированное обучение «Как играть».
   Подключается после app.js и использует его глобальные объекты:
   $, CFG, S, T, THEMES, RK, HW, PF, state, tx, snd, hap, pickTheme, tw. */
(function () {
  "use strict";

  const KEY = "tutDone", COL = T, TAU = Math.PI * 2;
  const SANS = "-apple-system,system-ui,'Segoe UI',sans-serif", FNT = "700 19px " + SANS;

  /* ---------- тексты: 0 = русский, 1 = английский, 2 = украинский ---------- */
  const D = [
    { sk: "ПРОПУСТИТЬ", nx: "ДАЛЕЕ", go: "▶ ИГРАТЬ", ok: "ГОТОВО", bad: "Ы", gold: "ЗОЛОТО",
      w: ["КОМЕТА", "ЛУНА", "РОБОТ", "ПИЦЦА", "ЗВЕЗДА"],
      st: [
        ["ДОБРО ПОЖАЛОВАТЬ", "С неба падают слова. Твоя задача — успеть напечатать их все, пока они не долетели до щита."],
        ["ПЕЧАТАЙ СЛОВА", "Набирай буквы слова по порядку. Набрал целиком — оно взрывается и приносит очки. На телефоне печатай на экранной клавиатуре, на компьютере — на обычной."],
        ["БЕРЕГИ ЩИТ", "Если слово долетело до щита, ты теряешь одну жизнь из трёх. Жизней не осталось — игра окончена."],
        ["СОБИРАЙ КОМБО", "Печатай слова подряд без ошибок: растёт комбо и множитель очков, до ×5. Любая ошибка сбрасывает комбо."],
        ["ОСОБЫЕ СЛОВА", "Золотые слова дают тройные очки. Слово «ЖИЗНЬ» возвращает одну потерянную жизнь, лови его!"],
        ["УРОВНИ И РАНГИ", "Каждые 8 слов начинается новый уровень, и игра ускоряется. Чем больше слов ты напечатал, тем выше ранг: от Новичка до Легенды."],
        ["ГОТОВ?", "Выбери тему в «Тематиках» или жми «Быстрая» для случайного микса. Пауза: Esc или кнопка ⏸."]
      ] },
    { sk: "SKIP", nx: "NEXT", go: "▶ PLAY", ok: "DONE", bad: "Q", gold: "GOLD",
      w: ["COMET", "MOON", "ROBOT", "PIZZA", "STAR"],
      st: [
        ["WELCOME", "Words rain down from the sky. Type every one of them before it reaches your shield."],
        ["TYPE THE WORDS", "Type a word's letters in order. Finish it and it explodes for points. On a phone use the on-screen keyboard, on a computer use your own."],
        ["GUARD THE SHIELD", "If a word reaches the shield you lose one of your three lives. Lose them all and the game is over."],
        ["BUILD COMBOS", "Type words back to back without mistakes: your combo and score multiplier grow, up to ×5. Any typo resets the combo."],
        ["SPECIAL WORDS", "Golden words give triple points. The word “LIFE” brings back one lost life, so catch it!"],
        ["LEVELS AND RANKS", "Every 8 words you reach a new level and the game speeds up. The more words you type, the higher your rank: from Rookie to Legend."],
        ["READY?", "Pick a theme in “Themes” or hit “Quick play” for a random mix. Pause with Esc or the ⏸ button."]
      ] },
    { sk: "ПРОПУСТИТИ", nx: "ДАЛІ", go: "▶ ГРАТИ", ok: "ГОТОВО", bad: "Ї", gold: "ЗОЛОТО",
      w: ["КОМЕТА", "МІСЯЦЬ", "РОБОТ", "ПІЦА", "ЗІРКА"],
      st: [
        ["ЛАСКАВО ПРОСИМО", "З неба падають слова. Твоє завдання — встигнути надрукувати їх усі, поки вони не долетіли до щита."],
        ["ДРУКУЙ СЛОВА", "Набирай літери слова по порядку. Набрав повністю — воно вибухає й приносить очки. На телефоні друкуй на екранній клавіатурі, на комп’ютері — на звичайній."],
        ["БЕРЕЖИ ЩИТ", "Якщо слово долетіло до щита, ти втрачаєш одне з трьох життів. Життів не лишилось — гру закінчено."],
        ["ЗБИРАЙ КОМБО", "Друкуй слова підряд без помилок: росте комбо й множник очок, до ×5. Будь-яка помилка скидає комбо."],
        ["ОСОБЛИВІ СЛОВА", "Золоті слова дають потрійні очки. Слово «ЖИТТЯ» повертає одне втрачене життя, лови його!"],
        ["РІВНІ ТА РАНГИ", "Кожні 8 слів починається новий рівень, і гра пришвидшується. Чим більше слів ти надрукував, тим вищий ранг: від Новачка до Легенди."],
        ["ГОТОВИЙ?", "Обери тему в «Тематиках» або тисни «Швидка» для випадкового міксу. Пауза: Esc або кнопка ⏸."]
      ] }
  ];
  const N = D[0].st.length;
  const LEN = [6, 6.4, 5.6, 6.2, 6.2, 6.6, 5]; // длина зацикленной анимации каждого шага, сек
  const dd = () => D[CFG.lang | 0] || D[0];

  /* ---------- состояние ---------- */
  let el = null, cvs = null, c = null, W = 0, H = 0, dpr = 1, ro = null;
  let isOpen = false, step = 0, from = "menu", t0 = 0, raf = 0, sx = null;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rnd = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const seen = () => { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return true; } };
  const mark = () => { try { localStorage.setItem(KEY, "1"); } catch (e) {} const b = $("hwB"); if (b) b.classList.remove("new"); };

  /* ---------- примитивы рисования ---------- */
  function rr(x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function ln(x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }

  function bg(tm) {
    let g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#04050d"); g.addColorStop(1, "#0c1038");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createRadialGradient(W / 2, H, 0, W / 2, H, H * .95); g.addColorStop(0, "rgba(120,70,255,.38)"); g.addColorStop(1, "rgba(120,70,255,0)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 34; i++) {
      const x = rnd(i) * W, y = (rnd(i + 50) * H + tm * 6 * (.4 + rnd(i + 9))) % H, a = .2 + .45 * Math.abs(Math.sin(tm * 1.3 + i));
      c.fillStyle = "rgba(200,220,255," + a + ")"; c.fillRect(x, y, 1.6, 1.6);
    }
  }

  function shield(lives, tm) {
    const oy = H - 18, sw = (W - 32) / 3;
    c.save(); c.globalCompositeOperation = "lighter"; c.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const x1 = 16 + i * sw + 6, x2 = 16 + (i + 1) * sw - 6, on = i < lives;
      c.strokeStyle = on ? "rgba(94,242,255,.16)" : "rgba(255,77,109,.08)"; c.lineWidth = 12; ln(x1, oy, x2, oy);
      c.strokeStyle = on ? "rgba(94,242,255,.95)" : "rgba(255,77,109,.35)"; c.lineWidth = on ? 3 : 1.5; ln(x1, oy, x2, oy);
    }
    c.drawImage(S.n.orb, W / 2 - 24, oy - 24, 48, 48);
    c.strokeStyle = "rgba(94,242,255,.8)"; c.lineWidth = 1.5; c.beginPath(); c.arc(W / 2, oy, 13, tm * 2, tm * 2 + 4); c.stroke();
    c.restore();
  }

  function word(x, y, txt, k, type, pa, alpha) {
    const col = COL[type], s = S[type], up = txt.toUpperCase();
    c.save(); if (alpha != null) c.globalAlpha = alpha;
    c.globalCompositeOperation = "lighter"; c.drawImage(s.tr, x - 15, y - 102, 30, 110); c.drawImage(s.orb, x - 32, y - 32, 64, 64);
    c.globalCompositeOperation = "source-over";
    c.font = FNT; c.textBaseline = "middle"; c.textAlign = "left";
    const lx = []; let a = 0; for (const ch of up) { lx.push(a); a += c.measureText(ch).width + 2; }
    const bw = a + 20, bx = x - bw / 2, by = y + 22;
    c.fillStyle = "rgba(6,9,30,.84)"; rr(bx, by, bw, 30, 9); c.fill();
    c.lineWidth = k ? 1.8 : 1; c.strokeStyle = k ? "rgb(" + col + ")" : "rgba(255,255,255,.15)"; c.stroke();
    for (let i = 0; i < up.length; i++) {
      const hot = pa > 0 && i === k - 1;
      c.fillStyle = hot ? "#fff" : i < k ? "rgb(" + col + ")" : "rgba(232,236,255,.93)";
      c.fillText(up[i], bx + 10 + lx[i], by + 16 - (hot ? 5 * pa : 0));
    }
    if (k) { c.fillStyle = "rgb(" + col + ")"; c.fillRect(bx + 6, by + 26, (bw - 12) * k / up.length, 2); }
    c.restore();
    return up;
  }

  function beam(x, y) {
    c.save(); c.globalCompositeOperation = "lighter"; c.lineCap = "round";
    c.strokeStyle = "rgba(94,242,255,.2)"; c.lineWidth = 9; ln(W / 2, H - 18, x, y);
    c.strokeStyle = "rgba(180,250,255,.95)"; c.lineWidth = 1.6; ln(W / 2, H - 18, x, y);
    c.restore();
  }

  function burst(x, y, age, col, n, life) {
    if (age < 0 || age > life) return;
    c.save(); c.globalCompositeOperation = "lighter"; c.fillStyle = "rgb(" + col + ")";
    for (let i = 0; i < n; i++) {
      const a = rnd(i * 3 + 1) * TAU, sp = 60 + rnd(i * 3 + 2) * 170, z = 2 + rnd(i * 3 + 3) * 3;
      c.globalAlpha = clamp(1 - age / life, 0, 1);
      c.fillRect(x + Math.cos(a) * sp * age, y + Math.sin(a) * sp * age - 50 * age + 320 * age * age / 2, z, z);
    }
    c.restore();
  }
  function ring(x, y, age, col, life) {
    life = life || .4; if (age < 0 || age > life) return;
    c.save(); c.globalAlpha = clamp(1 - age / life, 0, 1); c.strokeStyle = "rgb(" + col + ")"; c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, 8 + 260 * age, 0, TAU); c.stroke(); c.restore();
  }
  function flo(x, y, age, txt, sz, col, life) {
    if (age < 0 || age > life) return;
    c.save(); c.globalAlpha = clamp((1 - age / life) * 1.5, 0, 1); c.font = "800 " + sz + "px " + SANS;
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "rgb(" + col + ")"; c.fillText(txt, x, y - 38 * age); c.restore();
  }
  function hearts(n, popAge, popIdx, y) {
    c.save(); c.font = "800 22px " + SANS; c.textAlign = "center"; c.textBaseline = "middle";
    for (let i = 0; i < 3; i++) {
      let s = 1; if (i === popIdx && popAge >= 0 && popAge < .4) s = 1 + .5 * Math.sin(popAge / .4 * Math.PI);
      c.save(); c.translate(W / 2 + (i - 1) * 30, y); c.scale(s, s);
      c.fillStyle = i < n ? "#ff4fd8" : "rgba(255,255,255,.18)";
      if (i < n) { c.shadowColor = "rgba(255,79,216,.85)"; c.shadowBlur = 12; }
      c.fillText("♥", 0, 0); c.restore();
    }
    c.restore();
  }
  function keycap(x, y, label, age, bad) {
    const w = label.length > 1 ? 48 : 36, h = 36, hit = age >= 0 && age < .25, s = hit ? 1 + .22 * Math.sin(age / .25 * Math.PI) : 1;
    c.save(); c.translate(x, y); c.scale(s, s);
    rr(-w / 2, -h / 2, w, h, 10);
    c.fillStyle = hit ? (bad ? "rgba(255,77,109,.9)" : "rgba(94,242,255,.9)") : "rgba(255,255,255,.08)"; c.fill();
    c.lineWidth = 1.2; c.strokeStyle = bad && hit ? "#ff4d6d" : "rgba(255,255,255,.3)"; c.stroke();
    c.font = "700 " + (label.length > 1 ? 13 : 18) + "px " + SANS; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = hit ? "#001018" : "rgba(232,236,255,.9)"; c.fillText(label, 0, 1); c.restore();
  }
  function flash(a, col) {
    if (a <= 0) return;
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
    g.addColorStop(0, "rgba(" + col + ",0)"); g.addColorStop(1, "rgba(" + col + ",.9)");
    c.save(); c.globalAlpha = a; c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
  }

  /* Слово, которое падает, набирается и взрывается. Возвращает число набранных букв. */
  function demo(tm, o) {
    const st = o.st || 0, tk = o.tk, ts = o.ts, len = o.txt.length, type = o.type || "n", col = COL[type];
    const X = t => o.x + Math.sin(t * 2 + o.x) * 6;
    if (tm >= st && tm < tk) {
      const p = (tm - st) / (tk - st), y = -36 + (o.y + 36) * p, x = X(tm), per = (tk - ts) / len;
      const k = tm < ts ? 0 : Math.min(len, Math.floor((tm - ts) / per) + 1), pa = k ? Math.max(0, 1 - ((tm - ts) % per) * 7) : 0;
      if (k) beam(x, y);
      word(x, y, o.txt, k, type, pa, clamp((tm - st) * 4, 0, 1));
      if (o.tag) {
        c.save(); c.globalAlpha = clamp((tm - st - .5) * 2, 0, 1); c.font = "800 12px " + SANS; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillStyle = "rgb(" + col + ")"; c.fillText(o.tag, x, y + 68); c.restore();
      }
      return k;
    }
    if (tm >= tk) {
      const a = tm - tk, x = X(tk), y = o.y;
      burst(x, y, a, col, o.n || 26, .8); ring(x, y, a, col);
      flo(x, y - 24, a, o.lbl || "+10", 22, col, .9);
    }
    return 0;
  }

  /* ---------- сцены ---------- */
  function s0(tm) {
    const w = dd().w, xs = [.3, .7, .46, .74, .26];
    for (let i = 0; i < 5; i++) {
      const per = 5.2 + i * .5, p = ((tm / per + i * .21) % 1), y = -40 + p * (H + 10), x = W * xs[i] + Math.sin(tm * 2 + i) * 8;
      word(x, y, w[i], 0, "n", 0, clamp(Math.min(p * 8, (1 - p) * 6), 0, 1));
    }
    shield(3, tm);
  }

  function s1(tm) {
    const w = dd().w[0], len = w.length, ts = 1.1, per = .42, tk = ts + len * per;
    shield(3, tm);
    const k = demo(tm, { txt: w, x: W / 2, y: H * .42, ts, tk, pts: 10 });
    if (k) keycap(W - 40, H - 58, w[k - 1].toUpperCase(), (tm - ts) % per, false);
    else if (tm < ts) keycap(W - 40, H - 58, "?", -1, false);
  }

  function s2(tm) {
    const th = 3.3, hx = W / 2 + Math.sin(th * 2) * 8, lives = tm >= th ? 2 : 3, a = tm - th;
    c.save();
    if (a >= 0 && a < .35) c.translate((rnd(Math.floor(tm * 60)) - .5) * (.35 - a) * 36, (rnd(Math.floor(tm * 60) + 7) - .5) * (.35 - a) * 36);
    shield(lives, tm);
    if (tm < th) {
      const p = tm / th, y = -36 + (H - 76 + 36) * p, x = W / 2 + Math.sin(tm * 2) * 8;
      word(x, y, dd().w[2], 0, "n", 0, clamp(tm * 4, 0, 1));
      if (p > .55) {
        c.save(); c.globalAlpha = (p - .55) / .45 * (.5 + .5 * Math.sin(tm * 12)); c.globalCompositeOperation = "lighter";
        c.drawImage(S.r.orb, x - 60, H - 78, 120, 120); c.restore();
      }
    } else {
      if (a < .5) { c.save(); c.globalAlpha = (.5 - a) * 2; c.globalCompositeOperation = "lighter"; c.drawImage(S.r.orb, hx - 70, H - 88, 140, 140); c.restore(); }
      burst(hx, H - 18, a, COL.r, 26, .7); ring(hx, H - 18, a, COL.r);
    }
    c.restore();
    hearts(lives, a, 2, 24);
    flo(W / 2 + 62, 30, a, "−1", 18, COL.r, .9);
    if (a >= 0) flash(.5 - a * 1.4, "255,40,80");
  }

  function s3(tm) {
    const w = dd().w, kt = [], xs = [.26, .72, .42, .74, .3, .58], ys = [.5, .44, .56, .48, .54, .44];
    for (let i = 0; i < 6; i++) kt.push(.9 + .6 * i);
    const er = 4.5; let n = 0, last = -9;
    kt.forEach(t => { if (t <= tm) { n++; last = t; } });
    const reset = tm >= er; if (reset) n = 0;
    shield(3, tm);
    kt.forEach((t, i) => {
      if (tm < t - .9 || tm > t + 1.1) return;
      const m = Math.min(5, 1 + ((i / 5) | 0));
      demo(tm, { txt: w[i % 5], x: W * xs[i], y: H * ys[i], st: t - .9, ts: t - .45, tk: t, pts: 10 * m, lbl: "+" + 10 * m, n: 16 });
    });
    const m = Math.min(5, 1 + ((n / 5) | 0)), age = reset ? tm - er : tm - last;
    if (n > 0 || reset) {
      c.save(); c.textAlign = "center"; c.textBaseline = "middle";
      const s = !reset && age < .25 ? 1 + .2 * Math.sin(age / .25 * Math.PI) : 1, sh = reset && age < .4 ? (rnd(Math.floor(tm * 60)) - .5) * 10 * (1 - age / .4) : 0;
      c.translate(W / 2 + sh, 26); c.scale(s, s); c.font = "800 16px " + SANS;
      c.fillStyle = reset ? "rgb(" + COL.r + ")" : "rgb(" + (m > 1 ? COL.g : COL.n) + ")"; c.shadowBlur = 14; c.shadowColor = c.fillStyle;
      c.fillText(tx("КОМБО") + " ×" + m + " · " + n, 0, 0); c.restore();
    }
    if (tm >= er - .1 && tm < er + 1.1) keycap(W - 40, H - 58, dd().bad, tm - er, true);
    if (tm >= er) flash(.32 - (tm - er) * 1.4, "255,40,80");
  }

  function s4(tm) {
    const D0 = dd(), tkL = 5, a = tm - tkL;
    shield(3, tm);
    demo(tm, { txt: D0.gold, x: W * .28, y: H * .46, st: .1, ts: .8, tk: 2.5, type: "g", pts: 30, lbl: "+30", tag: "★ ×3" });
    demo(tm, { txt: HW[CFG.lang | 0], x: W * .72, y: H * .46, st: 2.9, ts: 3.6, tk: tkL, type: "h", pts: 0, lbl: tx("+ЖИЗНЬ"), tag: "♥ +1" });
    hearts(tm >= tkL ? 3 : 2, a, 2, 24);
  }

  function s5(tm) {
    const up = tm >= 3.2, a = tm - 3.2, dist = tm < 3.2 ? tm * 60 : 3.2 * 60 + a * 280;
    c.save(); c.strokeStyle = "rgba(160,200,255,.4)"; c.lineWidth = 1.4; c.lineCap = "round";
    for (let i = 0; i < 16; i++) {
      const x = rnd(i + 3) * W, y = (rnd(i + 30) * (H + 80) + dist * (.6 + rnd(i + 60) * .8)) % (H + 80) - 40, L = up ? 36 : 6;
      ln(x, y, x, y + L);
    }
    c.restore();
    const lvl = up ? 2 : 1, words = up ? Math.min(7, Math.floor(a / .7)) : Math.min(8, Math.floor(tm / .4));
    c.save(); c.textAlign = "center"; c.textBaseline = "middle"; c.font = "800 15px " + SANS;
    const s = up && a < .35 ? 1 + .3 * Math.sin(a / .35 * Math.PI) : 1; c.translate(W / 2, H * .12); c.scale(s, s);
    c.fillStyle = up ? "rgb(" + COL.g + ")" : "rgb(" + COL.n + ")"; c.shadowBlur = 12; c.shadowColor = c.fillStyle;
    c.fillText(tx("УРОВЕНЬ") + " " + lvl, 0, 0); c.restore();
    ring(W / 2, H * .12, a, COL.g, .6);
    const bx = W * .16, bw = W * .68, by = H * .22;
    c.save(); rr(bx, by, bw, 8, 4); c.fillStyle = "rgba(255,255,255,.12)"; c.fill();
    const fw = bw * words / 8; if (fw > 0) { rr(bx, by, Math.max(8, fw), 8, 4); c.fillStyle = "rgb(" + (up ? COL.g : COL.n) + ")"; c.shadowBlur = 10; c.shadowColor = c.fillStyle; c.fill(); }
    c.restore();
    // ранги
    const cur = tm < 3.6 ? 0 : Math.min(5, Math.floor((tm - 3.6) / .45)), ry = H * .6, gap = (W - 40) / 6;
    c.save(); c.strokeStyle = "rgba(255,255,255,.14)"; c.lineWidth = 2; ln(20 + gap / 2, ry, W - 20 - gap / 2, ry);
    c.strokeStyle = "rgb(" + COL.n + ")"; c.shadowBlur = 8; c.shadowColor = c.strokeStyle; ln(20 + gap / 2, ry, 20 + gap / 2 + gap * cur, ry); c.restore();
    c.textAlign = "center"; c.textBaseline = "middle";
    RK.forEach((k, i) => {
      const x = 20 + gap * (i + .5), on = i <= cur, pa = i === cur && tm >= 3.6 ? tm - (3.6 + i * .45) : 9, s2 = pa >= 0 && pa < .35 ? 1 + .45 * Math.sin(pa / .35 * Math.PI) : 1;
      c.save(); c.translate(x, ry); c.scale(s2, s2); c.globalAlpha = on ? 1 : .28;
      c.beginPath(); c.arc(0, 0, 21, 0, TAU); c.fillStyle = "rgba(6,9,30,.9)"; c.fill(); c.lineWidth = i === cur ? 2 : 1;
      c.strokeStyle = i === cur ? "rgb(" + COL.n + ")" : "rgba(255,255,255,.2)"; c.stroke();
      c.font = "22px " + SANS; c.fillStyle = "#fff"; c.fillText(k.i, 0, 1); c.restore();
    });
    c.save(); c.textAlign = "center"; c.textBaseline = "middle"; c.font = "800 12px " + SANS; c.fillStyle = "rgb(" + COL.n + ")";
    c.fillText(tx(RK[cur].n), W / 2, H * .82); c.restore();
  }

  function s6(tm) {
    const gw = Math.min(W - 36, 420), x0 = (W - gw) / 2, tw_ = (gw - 20) / 3, avail = H - 26 - 50, th = Math.min(70, (avail - 12) / 2), lit = Math.floor(tm / .55) % 6;
    THEMES.forEach((t, i) => {
      const x = x0 + (i % 3) * (tw_ + 10), y = 22 + ((i / 3) | 0) * (th + 12) + Math.sin(tm * 2.2 + i) * 3, on = i === lit, age = tm - (Math.floor(tm / .55) * .55);
      c.save();
      if (on) { c.translate(x + tw_ / 2, y + th / 2); const s = 1 + .07 * Math.sin(clamp(age / .4, 0, 1) * Math.PI); c.scale(s, s); c.translate(-x - tw_ / 2, -y - th / 2); c.shadowColor = "rgba(" + t.c + ",.9)"; c.shadowBlur = 18; }
      rr(x, y, tw_, th, 16); c.fillStyle = "rgba(" + t.c + "," + (on ? .42 : .24) + ")"; c.fill();
      c.lineWidth = on ? 1.8 : 1; c.strokeStyle = "rgba(" + t.c + "," + (on ? 1 : .55) + ")"; c.stroke(); c.shadowBlur = 0;
      c.textAlign = "center"; c.textBaseline = "middle"; c.font = Math.round(th * .4) + "px " + SANS; c.fillStyle = "#fff"; c.fillText(t.i, x + tw_ / 2, y + th * .38);
      c.font = "800 " + (th > 56 ? 10 : 9) + "px " + SANS; c.fillStyle = "rgba(255,255,255,.92)"; c.fillText(tx(t.n), x + tw_ / 2, y + th * .78, tw_ - 8);
      c.restore();
    });
    keycap(W / 2 - 24, H - 26, "Esc", (tm % 2.5), false);
    c.save(); c.font = "700 16px " + SANS; c.textAlign = "left"; c.textBaseline = "middle"; c.fillStyle = "rgba(232,236,255,.85)"; c.fillText("=", W / 2 + 12, H - 25);
    c.fillStyle = "rgba(232,236,255,.9)"; rr(W / 2 + 30, H - 33, 5, 16, 2); c.fill(); rr(W / 2 + 40, H - 33, 5, 16, 2); c.fill(); c.restore();
  }
  const SC = [s0, s1, s2, s3, s4, s5, s6];

  /* ---------- интерфейс ---------- */
  function build() {
    el = document.createElement("div"); el.id = "tut"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = '<div class="tc"><div class="ttop"><span id="tCt"></span><button class="tsk" id="tSk"></button></div>' +
      '<div class="tstage" id="tSt"><canvas id="tCv"></canvas></div>' +
      '<div class="ttxt" id="tTx"><h3 id="tH"></h3><p id="tP"></p></div><div class="tdots" id="tDt"></div>' +
      '<div class="tnav"><button class="btn a" id="tPv" aria-label="←">←</button><button class="btn" id="tNx"></button></div></div>';
    document.body.appendChild(el);
    cvs = $("tCv"); c = cvs.getContext("2d");
    const dt = $("tDt"); for (let i = 0; i < N; i++) { const b = document.createElement("i"); b.onclick = () => go(i); dt.appendChild(b); }
    $("tSk").onclick = () => finish(false);
    $("tPv").onclick = function () { this.blur(); go(step - 1); };
    $("tNx").onclick = function () { this.blur(); if (step < N - 1) go(step + 1); else finish(true); };
    // свайп влево/вправо
    const tc = el.querySelector(".tc");
    tc.addEventListener("pointerdown", e => { sx = e.target.closest("button") ? null : e.clientX; });
    tc.addEventListener("pointerup", e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 50) go(step + (dx < 0 ? 1 : -1)); });
    ro = new ResizeObserver(resize); ro.observe($("tSt"));
  }

  function resize() {
    if (!cvs) return; const r = $("tSt").getBoundingClientRect(); if (!r.width || !r.height) return;
    W = r.width; H = r.height; dpr = CFG.q ? Math.min(devicePixelRatio || 1, 2) : 1;
    cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
  }

  function show(n, dir) {
    step = n; t0 = performance.now();
    const D0 = dd(), s = D0.st[n], tb = $("tTx"), sg = $("tSt");
    $("tCt").textContent = (n + 1) + " / " + N; $("tH").textContent = s[0]; $("tP").textContent = s[1];
    tb.style.setProperty("--dx", (dir || 1) * 28 + "px"); tb.classList.remove("in"); void tb.offsetWidth; tb.classList.add("in");
    sg.classList.add("sw"); setTimeout(() => sg.classList.remove("sw"), 140);
    [...$("tDt").children].forEach((d, i) => d.classList.toggle("on", i === n));
    $("tPv").style.visibility = n ? "visible" : "hidden";
    $("tNx").textContent = n < N - 1 ? D0.nx + " →" : (from === "menu" ? D0.go : D0.ok);
  }

  function go(n) {
    if (n < 0 || n >= N || n === step) return;
    const dir = n > step ? 1 : -1; show(n, dir);
    try { snd(440 + n * 55, .07, "triangle", .05); hap("light", 1); } catch (e) {}
  }

  function frame(now) {
    if (!isOpen) return; raf = requestAnimationFrame(frame); if (!W) return;
    const tm = Math.max(0, (now - t0) / 1000) % LEN[step];
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); bg(tm); SC[step](tm);
  }

  function openTut(f) {
    if (isOpen) return; from = f || "menu"; if (!el) build();
    const D0 = dd(); $("tSk").textContent = D0.sk; el.setAttribute("aria-label", tx("❓ КАК ИГРАТЬ"));
    isOpen = true; el.classList.add("s"); resize(); show(0, 1);
    raf = requestAnimationFrame(frame);
    try { snd(523, .08, "triangle", .05); setTimeout(() => snd(784, .1, "triangle", .05), 70); } catch (e) {}
  }

  function finish(play) {
    if (!isOpen) return; isOpen = false; cancelAnimationFrame(raf); el.classList.remove("s"); mark();
    if (play && from === "menu" && state === "idle") pickTheme(THEMES[THEMES.length - 1]);
  }

  // клавиатура: приоритет над паузой по Esc из app.js (слушатель в фазе перехвата)
  document.addEventListener("keydown", e => {
    if (!isOpen) return;
    const k = e.key;
    if (k === "Escape") finish(false);
    else if (k === "ArrowRight" || k === "Enter" || k === " ") { if (step < N - 1) go(step + 1); else if (k !== "ArrowRight") finish(true); }
    else if (k === "ArrowLeft") go(step - 1);
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);

  $("hwB").onclick = () => openTut("menu");
  $("hwB2").onclick = () => openTut("pause");

  // первый запуск: подсветка кнопки и автозапуск обучения
  if (!seen()) {
    if (PF.g > 0 || tw() > 0) mark(); // игрок уже играл до появления обучения
    else {
      $("hwB").classList.add("new");
      setTimeout(() => { if (!seen() && !isOpen && state === "idle" && !document.querySelector("#up.s")) openTut("menu"); }, 1800);
    }
  }
})();
