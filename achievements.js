/* СЛОВОПАД — система достижений.
   Подключается после app.js. Использует глобалы игры: $, CFG, PF, RK, THEMES, TH, GL, state, tx, arp, hap,
   tw, rki, streakGet, streakNow, owG, coG, coS, shUI, SlovopadCore.
   Игра сообщает о событиях через ACH.start / kill / lose / over / check / cloud / render,
   а прогресс считается здесь: каждое достижение — это функция прогресса «сколько из скольких». */
(function () {
  "use strict";

  const LS_ACH = "ach", LS_S = "achS", LS_PR = "tutPr";
  const L = () => CFG.lang | 0;

  /* ---------- хранилище ---------- */
  const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const have = () => rd(LS_ACH, {});
  // счётчики, которые нельзя восстановить из остальной статистики игры
  const stats = () => Object.assign({ fin: 0, gold: 0, life: 0, rec: 0, ml: 0, nl: 0, fl: 0, nt: 0, cu: 0, cl: 0, themes: {}, langs: {}, init: 0 }, rd(LS_S, {}));
  const saveS = s => wr(LS_S, s);

  /* ---------- ИСТОЧНИКИ ПРОГРЕССА ---------- */
  const mxScore = () => {
    let m = 0;
    THEMES.forEach(t => ["", "en_", "uk_"].forEach(q => { try { m = Math.max(m, +localStorage.getItem("best_" + q + t.id) || 0); } catch (e) {} }));
    return m;
  };
  const wpm = () => (tw() >= 100 && SlovopadCore.wordsPerMinute(PF.w, PF.t)) || 0;
  const streak = () => { const r = streakGet(); return Math.max(r.max || 0, streakNow()); };
  const own = () => { try { return Math.max(0, owG().length - 2); } catch (e) { return 0; } };

  /* ---------- КАТАЛОГ ----------
     [id, значок, категория, цель, награда ✨, функция прогресса(S, have), секретное?,
      ru-название, ru-условие, en-название, en-условие, uk-название, uk-условие]
     «{r}» в названии заменяется названием ранга RK[k]. Награды — просто числа, их легко править. */
  const CATS = [
    ["СТАРТ", "START", "СТАРТ"],
    ["СЛОВА И РАНГИ", "WORDS AND RANKS", "СЛОВА ТА РАНГИ"],
    ["СЧЁТ И КОМБО", "SCORE AND COMBO", "РАХУНОК І КОМБО"],
    ["МАСТЕРСТВО", "MASTERY", "МАЙСТЕРНІСТЬ"],
    ["ПОСТОЯНСТВО", "CONSISTENCY", "ПОСТІЙНІСТЬ"],
    ["ИССЛЕДОВАНИЕ", "EXPLORATION", "ДОСЛІДЖЕННЯ"],
    ["СЕКРЕТНЫЕ", "SECRET", "СЕКРЕТНІ"]
  ];
  const DEF = [
    // 0 · СТАРТ
    ["tut", "🎓", 0, 1, 30, (s, h) => h.tut ? 1 : 0, 0,
      "ТУТОРИАЛ ПРОЙДЕН", "Пройди обучение «Как играть» до конца", "TUTORIAL COMPLETE", "Finish the “How to play” tutorial", "ТУТОРІАЛ ПРОЙДЕНО", "Пройди навчання «Як грати» до кінця"],
    ["prof", "🪪", 0, 1, 20, () => PF.n ? 1 : 0, 0,
      "ЗНАКОМСТВО", "Придумай себе ник в профиле", "NICE TO MEET YOU", "Pick a nickname in your profile", "ЗНАЙОМСТВО", "Придумай собі нік у профілі"],
    ["g1", "🎮", 0, 1, 15, s => s.fin, 0,
      "ПЕРВАЯ ИГРА", "Сыграй свою первую игру", "FIRST GAME", "Play your first game", "ПЕРША ГРА", "Зіграй свою першу гру"],
    ["g25", "🕹️", 0, 25, 80, s => s.fin, 0,
      "ЗАВСЕГДАТАЙ", "Сыграй 25 игр", "REGULAR", "Play 25 games", "ЗАВЗЯТИЙ ГРАВЕЦЬ", "Зіграй 25 ігор"],
    ["rec1", "🏆", 0, 1, 25, s => s.rec, 0,
      "НОВЫЙ РЕКОРД", "Побей свой прежний рекорд", "NEW RECORD", "Beat your previous record", "НОВИЙ РЕКОРД", "Побий свій попередній рекорд"],
    // 1 · СЛОВА И РАНГИ
    ["w100", "📝", 1, 100, 20, () => tw(), 0,
      "СТО СЛОВ", "Напечатай 100 слов", "ONE HUNDRED WORDS", "Type 100 words", "СТО СЛІВ", "Надрукуй 100 слів"],
    ["r2", RK[2].i, 1, RK[2].w, 40, () => tw(), 0,
      "РАНГ: {r}", "Напечатай {n} слов и получи ранг", "RANK: {r}", "Type {n} words to reach this rank", "РАНГ: {r}", "Надрукуй {n} слів і здобудь ранг", 2],
    ["r4", RK[4].i, 1, RK[4].w, 150, () => tw(), 0,
      "РАНГ: {r}", "Напечатай {n} слов и получи ранг", "RANK: {r}", "Type {n} words to reach this rank", "РАНГ: {r}", "Надрукуй {n} слів і здобудь ранг", 4],
    ["r5", RK[5].i, 1, RK[5].w, 300, () => tw(), 0,
      "РАНГ: {r}", "Напечатай {n} слов и получи высший ранг", "RANK: {r}", "Type {n} words to reach the top rank", "РАНГ: {r}", "Надрукуй {n} слів і здобудь найвищий ранг", 5],
    // 2 · СЧЁТ И КОМБО
    ["s300", "💯", 2, 300, 30, () => mxScore(), 0,
      "ТРИСТА ОЧКОВ", "Набери 300 очков за одну игру", "THREE HUNDRED", "Score 300 points in one game", "ТРИСТА ОЧОК", "Набери 300 очок за одну гру"],
    ["s600", "⭐", 2, 600, 60, () => mxScore(), 0,
      "ТРИ ЗВЕЗДЫ", "Набери 600 очков за одну игру", "THREE STARS", "Score 600 points in one game", "ТРИ ЗІРКИ", "Набери 600 очок за одну гру"],
    ["s1500", "🚀", 2, 1500, 200, () => mxScore(), 0,
      "ЗА ГРАНИЦЕЙ КАРТЫ", "Набери 1500 очков за одну игру", "OFF THE CHARTS", "Score 1500 points in one game", "ЗА МЕЖЕЮ КАРТИ", "Набери 1500 очок за одну гру"],
    ["c10", "💥", 2, 10, 20, () => PF.c, 0,
      "РАЗГОН", "Набери комбо из 10 слов", "WARM-UP", "Reach a 10-word combo", "РОЗГІН", "Набери комбо з 10 слів"],
    ["c25", "⚡", 2, 25, 60, () => PF.c, 0,
      "В ПОТОКЕ", "Набери комбо из 25 слов", "IN THE FLOW", "Reach a 25-word combo", "У ПОТОЦІ", "Набери комбо з 25 слів"],
    ["c50", "🌪️", 2, 50, 150, () => PF.c, 0,
      "НЕУДЕРЖИМЫЙ", "Набери комбо из 50 слов", "UNSTOPPABLE", "Reach a 50-word combo", "НЕСТРИМНИЙ", "Набери комбо з 50 слів"],
    // 3 · МАСТЕРСТВО
    ["l5", "🧗", 3, 5, 30, s => s.ml, 0,
      "ВОСХОЖДЕНИЕ", "Дойди до 5 уровня в одной игре", "CLIMBER", "Reach level 5 in one game", "ПІДНЕСЕННЯ", "Дійди до 5 рівня в одній грі"],
    ["l10", "🏔️", 3, 10, 100, s => s.ml, 0,
      "НА ВЕРШИНЕ", "Дойди до 10 уровня в одной игре", "ON THE SUMMIT", "Reach level 10 in one game", "НА ВЕРШИНІ", "Дійди до 10 рівня в одній грі"],
    ["nl4", "🛡️", 3, 4, 50, s => s.nl, 0,
      "НЕПРОБИВАЕМЫЙ", "Дойди до 4 уровня, не потеряв ни одной жизни", "IMPENETRABLE", "Reach level 4 without losing a life", "НЕПРОБИВНИЙ", "Дійди до 4 рівня, не втративши жодного життя"],
    ["fl", "🎯", 3, 1, 100, s => s.fl, 0,
      "СНАЙПЕР", "Напечатай 30 слов за игру без единой ошибки", "SNIPER", "Type 30 words in one game with no mistakes", "СНАЙПЕР", "Надрукуй 30 слів за гру без жодної помилки"],
    ["wpm30", "⌨️", 3, 30, 50, () => wpm(), 0,
      "БЫСТРЫЕ ПАЛЬЦЫ", "Разгонись до 30 слов в минуту (от 100 слов)", "FAST FINGERS", "Reach 30 words per minute (100+ words typed)", "ШВИДКІ ПАЛЬЦІ", "Розженись до 30 слів на хвилину (від 100 слів)"],
    ["wpm50", "🏎️", 3, 50, 150, () => wpm(), 0,
      "СКОРОСТНОЙ РЕЖИМ", "Разгонись до 50 слов в минуту (от 100 слов)", "SPEED DEMON", "Reach 50 words per minute (100+ words typed)", "ШВИДКІСНИЙ РЕЖИМ", "Розженись до 50 слів на хвилину (від 100 слів)"],
    ["gold10", "✨", 3, 10, 30, s => s.gold, 0,
      "ЗОЛОТАЯ ЖИЛА", "Поймай 10 золотых слов", "GOLD RUSH", "Catch 10 golden words", "ЗОЛОТА ЖИЛА", "Упіймай 10 золотих слів"],
    ["life5", "💗", 3, 5, 40, s => s.life, 0,
      "ЦЕЛИТЕЛЬ", "Поймай 5 слов «ЖИЗНЬ»", "HEALER", "Catch 5 “LIFE” words", "ЦІЛИТЕЛЬ", "Упіймай 5 слів «ЖИТТЯ»"],
    // 4 · ПОСТОЯНСТВО
    ["st3", "🔥", 4, 3, 30, () => streak(), 0,
      "РАЗОГРЕВ", "Играй 3 дня подряд", "WARMING UP", "Play 3 days in a row", "РОЗІГРІВ", "Грай 3 дні поспіль"],
    ["st7", "📅", 4, 7, 100, () => streak(), 0,
      "НЕДЕЛЯ БЕЗ ПРОПУСКОВ", "Играй 7 дней подряд", "A WEEK STRONG", "Play 7 days in a row", "ТИЖДЕНЬ БЕЗ ПРОПУСКІВ", "Грай 7 днів поспіль"],
    ["st30", "🗓️", 4, 30, 400, () => streak(), 0,
      "ЖЕЛЕЗНАЯ ПРИВЫЧКА", "Играй 30 дней подряд", "IRON HABIT", "Play 30 days in a row", "ЗАЛІЗНА ЗВИЧКА", "Грай 30 днів поспіль"],
    // 5 · ИССЛЕДОВАНИЕ
    ["themes5", "🧭", 5, 5, 60, s => Object.keys(s.themes).length, 0,
      "ПУТЕШЕСТВЕННИК", "Сыграй в каждой из 5 тематик", "TRAVELLER", "Play each of the 5 themes", "МАНДРІВНИК", "Зіграй у кожній із 5 тематик"],
    ["poly3", "🌐", 5, 3, 80, s => Object.keys(s.langs).length, 0,
      "ПОЛИГЛОТ", "Сыграй со словами на русском, английском и украинском", "POLYGLOT", "Play with Russian, English and Ukrainian words", "ПОЛІГЛОТ", "Зіграй зі словами російською, англійською та українською"],
    ["shop1", "🛍️", 5, 1, 25, () => own(), 0,
      "ПЕРВАЯ ПОКУПКА", "Купи что-нибудь в магазине", "FIRST PURCHASE", "Buy something in the shop", "ПЕРША ПОКУПКА", "Купи щось у магазині"],
    // «В облаках» (вход в облачный аккаунт) добавим, когда вернём облако в интерфейс: ACH.cloud() в app.js уже вызывается
    // 6 · СЕКРЕТНЫЕ
    ["night", "🦉", 6, 1, 50, s => s.nt, 1,
      "НОЧНАЯ СОВА", "Напечатай 10 слов в игре между полуночью и 5 утра", "NIGHT OWL", "Type 10 words in a game between midnight and 5 AM", "НІЧНА СОВА", "Надрукуй 10 слів у грі між північчю та 5 ранку"],
    ["clutch", "❤️‍🔥", 6, 1, 60, s => s.cu, 1,
      "НА ВОЛОСКЕ", "Поймай слово «ЖИЗНЬ», когда осталась всего одна жизнь", "CLOSE CALL", "Catch a “LIFE” word when only one life is left", "НА ЛЕДВЕ", "Упіймай слово «ЖИТТЯ», коли лишилося лише одне життя"],
    ["all", "👑", 6, 0, 300, (s, h) => DEF.filter(d => d[0] !== "all" && h[d[0]]).length, 0,
      "КОЛЛЕКЦИОНЕР", "Открой все остальные достижения", "COLLECTOR", "Unlock every other achievement", "КОЛЕКЦІОНЕР", "Відкрий усі інші досягнення"]
  ];
  DEF.find(d => d[0] === "all")[3] = DEF.length - 1;

  const UI = [
    { sect: "ДОСТИЖЕНИЯ", got: "ДОСТИЖЕНИЕ ПОЛУЧЕНО", next: "СЛЕДУЮЩАЯ ЦЕЛЬ", all: "ВСЕ ДОСТИЖЕНИЯ ОТКРЫТЫ", secret: "СЕКРЕТНОЕ ДОСТИЖЕНИЕ", secretD: "Подсказка: просто играй, и оно найдёт тебя", reward: "Награда", old: "ЗАСЛУГИ ПРОШЛЫХ ИГР", oldD: "Открыто достижений: " },
    { sect: "ACHIEVEMENTS", got: "ACHIEVEMENT UNLOCKED", next: "NEXT GOAL", all: "ALL ACHIEVEMENTS UNLOCKED", secret: "SECRET ACHIEVEMENT", secretD: "Hint: just keep playing and it will find you", reward: "Reward", old: "PAST DEEDS", oldD: "Achievements unlocked: " },
    { sect: "ДОСЯГНЕННЯ", got: "ДОСЯГНЕННЯ ОТРИМАНО", next: "НАСТУПНА МЕТА", all: "УСІ ДОСЯГНЕННЯ ВІДКРИТО", secret: "СЕКРЕТНЕ ДОСЯГНЕННЯ", secretD: "Підказка: просто грай, і воно тебе знайде", reward: "Нагорода", old: "ЗАСЛУГИ МИНУЛИХ ІГОР", oldD: "Відкрито досягнень: " }
  ];
  const ui = () => UI[L()] || UI[0];

  const byId = id => DEF.find(d => d[0] === id);
  const title = d => { const t = d[7 + L() * 2]; return d[13] != null ? t.replace("{r}", tx(RK[d[13]].n)) : t; };
  const desc = d => d[8 + L() * 2].replace("{n}", d[3]);
  const prog = (d, s, h) => { let v = 0; try { v = +d[5](s, h) || 0; } catch (e) {} return [Math.min(v, d[3]), d[3]]; };

  /* ---------- состояние одной игры ---------- */
  let G = { lost: 0, m0: 0 };

  /* ---------- проверка и выдача ---------- */
  const queue = [];
  function check() {
    const h = have(), s = stats(), fresh = [];
    DEF.forEach(d => {
      if (h[d[0]]) return;
      const p = prog(d, s, h);
      if (p[0] >= p[1]) { h[d[0]] = Date.now(); fresh.push(d); }
    });
    if (fresh.length) {   // «Коллекционер» стоит в каталоге последним и видит остальные, открытые в этом же проходе
      wr(LS_ACH, h);
      let sum = 0; fresh.forEach(d => { sum += d[4]; });
      try { coS(coG() + sum); if (window.shUI) shUI(); } catch (e) {}
      if (!s.init) { s.init = 1; saveS(s); queue.push({ old: fresh.length, sum }); }   // первый запуск у старого игрока — одно общее сообщение
      else fresh.forEach(d => queue.push({ d }));
    } else if (!s.init) { s.init = 1; saveS(s); }
    render();
  }

  // выдать достижение вручную (обучение)
  function unlock(id) {
    const h = have(); if (h[id]) return;
    const d = byId(id); if (!d) return;
    h[id] = Date.now(); wr(LS_ACH, h);
    try { coS(coG() + d[4]); if (window.shUI) shUI(); } catch (e) {}
    queue.push({ d }); check();
  }

  /* ---------- плашка ---------- */
  let showing = false, tmr = 0;
  function toast(q) {
    const t = ui(); let el = $("achT");
    if (!el) { el = document.createElement("div"); el.id = "achT"; document.body.appendChild(el); el.onclick = () => hide(el); }
    el.innerHTML = q.d
      ? '<div class="aci">' + q.d[1] + '</div><div class="acx"><small>' + t.got + "</small><b>" + title(q.d) + "</b><span>" + desc(q.d) + '</span><em class="acr">+' + q.d[4] + " ✨</em></div>"
      : '<div class="aci">🏅</div><div class="acx"><small>' + t.got + "</small><b>" + t.old + "</b><span>" + t.oldD + q.old + '</span><em class="acr">+' + q.sum + " ✨</em></div>";
    const cols = ["#5ef2ff", "#ff4fd8", "#ffd166", "#b8ff5c", "#a082ff"];
    for (let i = 0; i < 30; i++) {
      const p = document.createElement("i"), a = Math.random() * 6.283, dd = 70 + Math.random() * 130;
      p.className = "cf"; p.style.background = cols[i % 5];
      p.style.setProperty("--x", Math.cos(a) * dd + "px"); p.style.setProperty("--y", (Math.sin(a) * dd * .8 + 20) + "px"); p.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
      p.style.animationDelay = (Math.random() * .15) + "s"; el.appendChild(p);
    }
    void el.offsetWidth; el.classList.add("s"); showing = true;
    try { arp([523, 659, 784, 1047, 1319], .09, "triangle", .06); hap("success"); } catch (e) {}
    clearTimeout(tmr); tmr = setTimeout(() => hide(el), 4200);
  }
  function hide(el) { el.classList.remove("s"); clearTimeout(tmr); tmr = setTimeout(() => { showing = false; }, 800); }

  // плашки не мешают самой игре: показываем, пока игра не идёт, и по одной
  setInterval(() => {
    if (showing || !queue.length) return;
    if (state === "play") return;
    const tut = $("tut"), tour = $("tour");
    if ((tut && tut.classList.contains("s")) || (tour && tour.classList.contains("s"))) return;
    toast(queue.shift());
  }, 450);

  /* ---------- события игры ---------- */
  const API = {
    start() { G = { lost: 0, m0: PF.m }; },
    lose() { G.lost++; },
    kill(it, c) {
      const s = stats(); let ch = 0;
      if (it.type === "g") { s.gold++; ch = 1; }
      if (it.type === "h") { s.life++; ch = 1; if (c.lives === 2) { s.cu = 1; ch = 1; } }
      if (c.level > s.ml) { s.ml = c.level; ch = 1; }
      if (!G.lost && c.level > s.nl) { s.nl = c.level; ch = 1; }
      if (ch) saveS(s);
      check();
    },
    over(o) {
      const s = stats();
      if (o.words > 0) {
        s.fin++;
        if (typeof TH === "object" && TH && TH.id !== "mix") s.themes[TH.id] = 1;
        s.langs[GL | 0] = 1;
        if (o.nb && o.pb > 0) s.rec++;
        if (o.words >= 30 && PF.m - G.m0 === 0) s.fl = 1;
        const hr = new Date().getHours();
        if (o.words >= 10 && hr < 5) s.nt = 1;
      }
      saveS(s); check();
    },
    cloud() { const s = stats(); s.cl = 1; saveS(s); check(); },
    check, unlock, render,
    open() { sel = null; render(); }   // профиль открыт: сбрасываем выбор на «следующую цель»
  };

  /* ---------- экран «Достижения» в профиле ---------- */
  let sel = null;
  function pct(a) { return Math.round(a[0] / a[1] * 100); }
  function nextGoal(h, s) {
    let best = null, bp = -1;
    DEF.forEach(d => { if (h[d[0]] || d[6] || d[0] === "all") return; const p = pct(prog(d, s, h)); if (p > bp) { bp = p; best = d[0]; } });
    return best;
  }
  function detail(h, s) {
    const t = ui(), box = $("achDt"); if (!box) return;
    const d = byId(sel);
    if (!d) { box.innerHTML = '<div class="adh">' + t.all + "</div>"; return; }
    const on = !!h[d[0]], hid = d[6] && !on, p = prog(d, s, h);
    let dt = ""; if (on) { try { dt = new Date(h[d[0]]).toLocaleDateString(["ru", "en", "uk"][L()] || "ru"); } catch (e) {} }
    box.className = "adt" + (on ? " on" : "");
    box.innerHTML =
      '<div class="adh">' + (on ? t.got : hid ? t.secret : t.next) + "</div>" +
      '<div class="adr"><div class="aci">' + (hid ? "❔" : d[1]) + '</div><div class="acx"><b>' + (hid ? "???" : title(d)) + "</b><span>" + (hid ? t.secretD : desc(d)) + "</span></div></div>" +
      (on || hid ? "" : '<div class="apb"><i style="width:' + pct(p) + '%"></i></div><div class="apn">' + p[0] + " / " + p[1] + "</div>") +
      '<div class="apw">' + t.reward + ": +" + d[4] + " ✨" + (dt ? " · " + dt : "") + "</div>";
  }
  function render() {
    const o7 = $("o7"); if (!o7) return;
    let b = $("pAch");
    if (!b) { b = document.createElement("div"); b.id = "pAch"; o7.insertBefore(b, o7.querySelector(".mb")); }
    if (!o7.classList.contains("s")) return;
    const h = have(), s = stats(), t = ui(), done = DEF.filter(d => h[d[0]]).length;
    if (!sel || !byId(sel)) sel = nextGoal(h, s);
    let html = '<div class="psec">' + t.sect + " · " + done + " / " + DEF.length + '</div><div class="apt"><i style="width:' + Math.round(done / DEF.length * 100) + '%"></i></div><div class="adt" id="achDt"></div>';
    CATS.forEach((c, ci) => {
      html += '<div class="acat">' + c[L()] + '</div><div class="abg">';
      DEF.filter(d => d[2] === ci).forEach(d => {
        const on = !!h[d[0]], hid = d[6] && !on, p = prog(d, s, h);
        html += '<button class="abd' + (on ? " on" : "") + (sel === d[0] ? " sel" : "") + '" data-id="' + d[0] + '"><span>' + (hid ? "❔" : d[1]) + "</span>" +
          (on ? "" : '<i><u style="width:' + (hid ? 0 : pct(p)) + '%"></u></i>') + "</button>";
      });
      html += "</div>";
    });
    b.innerHTML = html;
    b.querySelectorAll(".abd").forEach(x => { x.onclick = () => { sel = x.dataset.id; render(); try { hap("light", 1); } catch (e) {} }; });
    detail(h, s);
  }

  // обучение пройдено → награда, когда игрок вернулся в меню
  new MutationObserver(() => {
    if (!$("o1").classList.contains("s")) return;
    let pr = false; try { pr = localStorage.getItem(LS_PR) === "1"; } catch (e) {}
    if (pr && !have().tut) setTimeout(() => { if (state === "idle" && $("o1").classList.contains("s") && !have().tut) unlock("tut"); }, 700);
  }).observe($("o1"), { attributes: true, attributeFilter: ["class"] });

  window.ACH = API;
  // старые игроки получают то, что уже заслужили, а новые — просто пустой список
  setTimeout(check, 300);
})();
