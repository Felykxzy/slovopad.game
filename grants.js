/* СЛОВОПАД — подарки и объявления от создателя.
   Раз в минуту (если игрок вошёл в аккаунт) игра забирает с сервера подарки (монеты, фоны, щиты) и начисляет их у себя.
   Объявление для всех приходит вместе со статусом игры (см. maint.js). */
(function () {
  "use strict";
  const g = id => document.getElementById(id);
  const ls = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d } catch (e) { return d } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } }
  };
  const T = (a, b, c) => { try { return L3(a, b, c) } catch (e) { return a } };
  let q = [], showing = false;

  function pump() {
    if (showing || !q.length) return;
    showing = true;
    const it = q.shift(), el = document.createElement("div");
    el.className = "spbn"; el.setAttribute("role", "status");
    const ic = document.createElement("i"); ic.textContent = it.icon;
    const tx = document.createElement("div"); tx.className = "spbt";
    const b = document.createElement("b"); b.textContent = it.title; tx.appendChild(b);
    if (it.text) { const s = document.createElement("span"); s.textContent = it.text; tx.appendChild(s) }
    el.appendChild(ic); el.appendChild(tx); document.body.appendChild(el);
    let done = false;
    const close = () => { if (done) return; done = true; el.classList.add("out"); setTimeout(() => { el.remove(); showing = false; pump() }, 350) };
    el.onclick = close; setTimeout(close, it.ms || 8000);
  }
  const banner = (icon, title, text, ms) => { q.push({ icon, title, text, ms }); pump() };

  /* объявление для всех */
  window.SpNews = {
    show(n) {
      if (!n || !n.id || !n.text) return;
      if (String(ls.get("newsSeen", "")) === String(n.id)) return;
      ls.set("newsSeen", String(n.id));
      banner("📢", T("Объявление", "Announcement", "Оголошення"), String(n.text).slice(0, 300), 12000);
    }
  };

  /* подарки */
  function shopIds() { try { return SHOP.map(x => x[0]) } catch (e) { return [] } }
  function addItems(ids) {
    try {
      const have = owG(), next = [...new Set([...have, ...ids])];
      if (next.length !== have.length) localStorage.setItem("ow", JSON.stringify(next));
    } catch (e) { }
  }
  async function claim() {
    if (typeof sidTok !== "function" || !sidTok()) return;
    try { if (typeof state !== "undefined" && state === "play") return } catch (e) { }
    let r; try { r = await cloudRequest("/api/grants") } catch (e) { return }
    const list = (r && r.grants) || [];
    if (!list.length) return;
    const done = new Set(ls.get("grDone", []));
    let coins = 0, items = new Set(), notes = new Set();
    list.forEach(x => {
      if (done.has(x.id)) return;
      if (x.kind === "coins") coins += Number(x.val) || 0;
      else if (x.kind === "item") { if (x.val === "all") shopIds().forEach(i => items.add(i)); else if (shopIds().includes(x.val)) items.add(x.val) }
      if (x.note) notes.add(x.note);
    });
    try {
      if (coins) coS(Math.max(0, coG() + coins));
      if (items.size) addItems([...items]);
    } catch (e) { return }
    ls.set("grDone", [...done, ...list.map(x => x.id)].slice(-100));
    try { await cloudRequest("/api/grants/claim", { method: "POST", body: JSON.stringify({ ids: list.map(x => x.id) }) }) } catch (e) { }
    const bits = [];
    if (coins) bits.push((coins > 0 ? "+" : "") + coins + " ✨");
    if (items.size) bits.push(items.size > 3 ? T("новые фоны и щиты", "new backgrounds and shields", "нові фони й щити") : [...items].map(i => { try { return shopIds().includes(i) ? SHOP.find(x => x[0] === i)[3][0] : i } catch (e) { return i } }).join(", "));
    if (bits.length) banner("🎁", T("Подарок от создателя", "A gift from the creator", "Подарунок від творця"), bits.join(" · ") + (notes.size ? "\n" + [...notes].join(" · ") : ""), 9000);
    try { const o = g("o1"); if (o && o.classList.contains("s") && typeof menu === "function") menu() } catch (e) { }
  }
  setTimeout(claim, 6000);
  setInterval(() => { if (!document.hidden) claim() }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(claim, 800) });
  window.SpGrants = { claim };
})();
