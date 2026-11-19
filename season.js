/* СЛОВОПАД — сезон.
   Тема месяца одна для всех, таблица лидеров месяца, награды (значок и монеты) за прошлый месяц.
   Подключается после app.js. Использует: cloudRequest, sidTok, sidOpen, ov, L3, THEMES, pickTheme, coG, coS, TH, score, state, RACE, PR, tx. */
(function () {
  "use strict";
  const T = (a, b, c) => L3(a, b, c);
  const g = id => document.getElementById(id);
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e };
  const MON = [["январь", "January", "січень"], ["февраль", "February", "лютий"], ["март", "March", "березень"], ["апрель", "April", "квітень"], ["май", "May", "травень"], ["июнь", "June", "червень"], ["июль", "July", "липень"], ["август", "August", "серпень"], ["сентябрь", "September", "вересень"], ["октябрь", "October", "жовтень"], ["ноябрь", "November", "листопад"], ["декабрь", "December", "грудень"]];
  const BADGE = { gold: ["🥇", "Золото", "Gold", "Золото"], silver: ["🥈", "Серебро", "Silver", "Срібло"], bronze: ["🥉", "Бронза", "Bronze", "Бронза"], top10: ["🏅", "Топ-10", "Top 10", "Топ-10"], play: ["🎖️", "Участник", "Player", "Учасник"] };
  const monthName = m => { const i = (+String(m).split("-")[1] || 1) - 1; return T(MON[i][0], MON[i][1], MON[i][2]) };
  // тема месяца считается одинаково у всех по номеру месяца (по UTC, как на сервере)
  const monthTheme = () => { const d = new Date(); return THEMES[(d.getUTCFullYear() * 12 + d.getUTCMonth()) % THEMES.length] };
  let data = null, busy = false;

  function build() {
    if (g("o21")) return;
    const o = h("div", "ov sc"); o.id = "o21";
    o.innerHTML = '<div class="frh"><button class="ib" id="seBk" type="button">←</button><div class="frt"><h2 id="seT"></h2><div class="sub" id="seS"></div></div></div><div id="seC"></div>';
    document.body.appendChild(o); const a = g("app"); if (a && o.parentNode !== a) a.appendChild(o);
    g("seBk").onclick = () => ov("o1");
  }
  function menuBtn() {
    if (g("seB")) return; const mb = document.querySelector("#o1 .mb"), hw = g("hwB"); if (!mb) return;
    const b = h("button", "btn a", ""); b.id = "seB"; b.type = "button"; b.textContent = "🏆 " + T("СЕЗОН", "SEASON", "СЕЗОН");
    b.onclick = open; mb.insertBefore(b, hw || null);
  }
  const daysLeft = () => { const d = Math.max(0, ((data && data.endsAt) || 0) - Date.now()); return Math.ceil(d / 864e5) };
  function toast(msg) { try { const t = h("div", "setoast", msg); document.body.appendChild(t); setTimeout(() => t.classList.add("out"), 3200); setTimeout(() => t.remove(), 3600) } catch (e) { } }

  function paint() {
    const c = g("seC"); c.textContent = "";
    const th = monthTheme(), mo = data ? data.month : (new Date().getUTCFullYear() + "-" + String(new Date().getUTCMonth() + 1).padStart(2, "0"));
    g("seT").textContent = T("СЕЗОН", "SEASON", "СЕЗОН") + " · " + monthName(mo);
    g("seS").textContent = data ? T("Осталось дней: ", "Days left: ", "Залишилось днів: ") + daysLeft() : "";
    const card = h("div", "gl secard");
    const ic = h("span", "ic", th.i); const nm = h("b", "", tx(th.n));
    card.append(ic, h("div", "sectl", T("ТЕМА МЕСЯЦА", "THEME OF THE MONTH", "ТЕМА МІСЯЦЯ")), nm);
    c.appendChild(card);
    const play = h("button", "btn", "▶ " + T("ИГРАТЬ", "PLAY", "ГРАТИ")); play.type = "button"; play.id = "sePlay";
    play.onclick = () => { try { ov(""); pickTheme(th) } catch (e) { ov("o1") } };
    c.appendChild(play);
    if (!sidTok()) { c.appendChild(h("div", "hint", T("Чтобы попасть в таблицу, войди в аккаунт.", "Sign in to join the leaderboard.", "Щоб потрапити в таблицю, увійди в акаунт."))); const b = h("button", "btn a", T("ВОЙТИ", "SIGN IN", "УВІЙТИ")); b.type = "button"; b.onclick = () => { try { sidOpen() } catch (e) { } }; c.appendChild(b); return }
    if (!data) { c.appendChild(h("div", "hint", T("Загружаю таблицу…", "Loading the table…", "Завантажую таблицю…"))); return }
    const me = data.me;
    c.appendChild(h("div", "hint seme", me ? T("Твой результат: ", "Your score: ", "Твій результат: ") + me.score + " · " + T("место ", "rank ", "місце ") + me.rank + " / " + data.size : T("Сыграй в тему месяца, и ты появишься в таблице.", "Play the theme of the month to join the table.", "Зіграй у тему місяця, і ти з’явишся в таблиці.")));
    const list = h("div", "frlist selist");
    if (!data.top.length) list.appendChild(h("div", "hint", T("Пока никого. Ты можешь стать первым!", "Nobody yet. Be the first!", "Поки нікого. Ти можеш стати першим!")));
    data.top.forEach((r, i) => {
      const row = h("div", "gl serow" + (me && r.username === ((sidInfo() || {}).username) ? " me" : ""));
      row.append(h("span", "sen", i < 3 ? ["🥇", "🥈", "🥉"][i] : String(i + 1)), h("span", "ser", r.avatar || (r.username || "?").charAt(0).toUpperCase()), h("span", "seu", r.username), h("b", "ses", String(r.score)));
      list.appendChild(row);
    });
    c.appendChild(list);
    c.appendChild(h("div", "hint", T("Награда за месяц: 🥇 300 монет, 🥈 200, 🥉 150, топ-10 — 75, остальным — 25. И значок в коллекцию.", "Monthly prize: 🥇 300 coins, 🥈 200, 🥉 150, top 10 — 75, everyone else — 25. Plus a badge.", "Нагорода за місяць: 🥇 300 монет, 🥈 200, 🥉 150, топ-10 — 75, решті — 25. І значок у колекцію.")));
    if (data.badges && data.badges.length) {
      c.appendChild(h("h3", "sebh", T("Твои значки", "Your badges", "Твої значки")));
      const row = h("div", "sebs");
      data.badges.forEach(b => { const x = BADGE[b.badge] || BADGE.play; const d = h("div", "gl sebd"); d.append(h("span", "ic", x[0]), h("b", "", T(x[1], x[2], x[3])), h("i", "", monthName(b.m) + " · #" + b.rk)); row.appendChild(d) });
      c.appendChild(row);
    }
  }

  async function load() {
    if (!sidTok()) { data = null; paint(); return }
    try { data = await cloudRequest("/api/season"); } catch (e) { data = null; g("seC").appendChild(h("div", "hint bad", e && e.message || "")); return }
    paint();
    // награда за прошлый месяц: забираем один раз
    if (data.prev && !data.prev.claimed) {
      try {
        const r = await cloudRequest("/api/season/claim", { method: "POST", body: "{}" });
        if (r && r.coins) { coS(coG() + r.coins); const x = BADGE[r.badge] || BADGE.play; toast(x[0] + " " + T("Сезон закончился: место ", "Season over: rank ", "Сезон закінчився: місце ") + r.rank + ", +" + r.coins + " " + T("монет", "coins", "монет")); data.prev.claimed = true; data = await cloudRequest("/api/season"); paint() }
      } catch (e) {  }
    }
  }
  function open() { build(); paint(); ov("o21"); g("o21").scrollTop = 0; load() }

  // после раунда в тему месяца результат уходит в таблицу
  const _over = window.over;
  if (typeof _over === "function") window.over = function (q) {
    const r = _over.apply(this, arguments);
    try { if (state === "over" && !q && !RACE && !PR && sidTok() && score > 0 && TH && TH.id === monthTheme().id) cloudRequest("/api/season/score", { method: "POST", body: JSON.stringify({ score }) }).then(x => { if (x && x.rank) { const el = g("oB"); if (el) { let n = g("seRes"); if (!n) { n = h("div", "hint", ""); n.id = "seRes"; el.parentNode.insertBefore(n, el.nextSibling) } n.textContent = "🏆 " + T("Сезон: место ", "Season: rank ", "Сезон: місце ") + x.rank } } }).catch(() => { }) } catch (e) { }
    return r;
  };
  window.SlovopadSeason = { open, monthTheme };
  menuBtn(); document.addEventListener("DOMContentLoaded", menuBtn);
})();
