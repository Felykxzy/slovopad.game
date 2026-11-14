/* Свой тег рядом с ником: текст, цвет, анимация. Покупается за ✨ в магазине. */
(function () {
  "use strict";
  var P0 = 200, P1 = 500, COLS = ["94,242,255", "184,255,92", "255,209,102", "255,79,216", "255,138,92", "160,130,255", "255,255,255", "255,90,90"];
  var LOOK = { a: "а", e: "е", o: "о", p: "р", c: "с", x: "х", y: "у", k: "к", b: "в", m: "м", t: "т", h: "н", "0": "о", "3": "з", "6": "б", "@": "а", "$": "с" };
  var LAT = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", "$": "s" };
  var BAD = /хуй|хуе|хуё|хуя|пизд|пізд|ебл|ёбл|ебан|ёбан|ебат|їб|еба[нтл]|блят|бляд|сука|суки|мудак|мудил|пидор|пидар|підор|гандон|залуп|шлюх|курв|чмо|ниггер|нигер|нацист|гитлер|fuck|shit|bitch|cunt|nigg|fagg|dick|cock|pussy|nazi|hitler|rape|порн|porn|sex|секс/;
  var FAKE = /модер|moder|автор|author|owner|владел|staff|support|поддерж|offic|офиц|создат|creator|разраб|developer|system|систем|[aа][dд][mм][iи][nн]|слоiвопад|словопад|slovopad/;
  function norm(s) { s = String(s).toLowerCase().replace(/[^\p{L}\p{N}@$]/gu, ""); var m = "", l = ""; for (var i = 0; i < s.length; i++) { m += LOOK[s[i]] || s[i]; l += LAT[s[i]] || s[i]; } return [s, m, l]; }
  function bad(t) { var n = norm(t); return n.some(function (x) { return BAD.test(x) || FAKE.test(x); }); }
  function clean(tg, own) {
    if (!tg || typeof tg !== "object") return null;
    var t = String(tg.t || "").replace(/\s+/g, " ").trim();
    if (!/^[\p{L}\p{N} _.!+*&-]{1,12}$/u.test(t) || bad(t)) return null;
    var c = String(tg.c || "");
    var m = /^(\d{1,3}),(\d{1,3}),(\d{1,3})$/.exec(c);
    if (!m || +m[1] > 255 || +m[2] > 255 || +m[3] > 255) c = COLS[0];
    var a = tg.a === 1 || tg.a === 2 ? tg.a : 0;
    if (own && !own.includes("tg1")) a = 0;
    if (own && !own.includes("tg0")) return null;
    return { t: t, c: c, a: a };
  }
  function el(tg) {
    if (!tg || !tg.t) return null;
    var s = document.createElement("span"); s.className = "utag" + (tg.a ? " a" + tg.a : ""); s.textContent = tg.t; s.style.setProperty("--tc", tg.c); return s;
  }
  function T(a, b, c) { return [a, b, c][CFG.lang] || a; }
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255); }
  function rgb2hex(c) { return "#" + c.split(",").map(function (x) { return ("0" + (+x).toString(16)).slice(-2); }).join(""); }
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  var DR = null;
  function render(g, own, redraw) {
    g.innerHTML = "";
    var box = mk("div", "tge"); g.appendChild(box);
    var cur = clean(PF.tg, own) || { t: "", c: COLS[0], a: 0 }, d = DR || { t: cur.t, c: cur.c, a: cur.a }; DR = d;
    var pv = mk("div", "tgp"), nm = mk("b", "", PF.n || T("Игрок", "Player", "Гравець")); pv.appendChild(nm);
    function paintPv() { var old = pv.querySelector(".utag"); if (old) old.remove(); var e = el(d.t ? d : null); if (e) pv.appendChild(e); else { var h = mk("span", "tgh", T("тут будет твой тег", "your tag shows here", "тут буде твій тег")); h.className = "utag tgh"; pv.appendChild(h); } }
    box.appendChild(pv);
    if (!own.includes("tg0")) {
      box.appendChild(mk("p", "tgd", T("Свой тег — короткая надпись рядом с твоим ником. Её увидят друзья и участники комнат в Эхо. Текст придумываешь сам, цвет выбираешь любой.", "Your own tag is a short label next to your nickname. Friends and room members in Echo will see it. You write the text and pick any colour.", "Свій тег — короткий напис поруч із твоїм ніком. Його побачать друзі та учасники кімнат в Ехо. Текст вигадуєш сам, колір обираєш будь-який.")));
      var b = mk("button", "btn tgbn", T("ОТКРЫТЬ", "UNLOCK", "ВІДКРИТИ") + " · ✨ " + P0); b.type = "button";
      b.onclick = function () { buy("tg0", P0, redraw); }; box.appendChild(b); d = { t: T("ТВОЙ ТЕГ", "YOUR TAG", "ТВІЙ ТЕГ").slice(0, 12), c: COLS[0], a: 0 }; DR = null; paintPv(); return;
    }
    paintPv();
    var inp = mk("input", "tgi"); inp.type = "text"; inp.maxLength = 12; inp.value = d.t; inp.placeholder = T("Твой текст (до 12 знаков)", "Your text (up to 12)", "Твій текст (до 12 знаків)");
    inp.oninput = function () { d.t = inp.value; paintPv(); }; box.appendChild(inp);
    var sw = mk("div", "tgs"); COLS.forEach(function (c) { var b = mk("button", "tgc" + (d.c === c ? " on" : "")); b.type = "button"; b.style.background = "rgb(" + c + ")"; b.setAttribute("aria-label", c); b.onclick = function () { d.c = c; sw.querySelectorAll(".tgc").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); cp.value = rgb2hex(c); paintPv(); }; sw.appendChild(b); });
    var cp = mk("input", "tgk"); cp.type = "color"; cp.value = rgb2hex(d.c); cp.setAttribute("aria-label", T("свой цвет", "custom colour", "свій колір"));
    cp.oninput = function () { d.c = hex2rgb(cp.value); sw.querySelectorAll(".tgc").forEach(function (x) { x.classList.remove("on"); }); paintPv(); }; sw.appendChild(cp); box.appendChild(sw);
    var an = mk("div", "tga"), has1 = own.includes("tg1");
    [[0, T("ОБЫЧНЫЙ", "PLAIN", "ЗВИЧАЙНИЙ")], [1, "🌈 " + T("ПЕРЕЛИВ", "SHIMMER", "ПЕРЕЛИВ")], [2, "💫 " + T("СВЕЧЕНИЕ", "GLOW", "СВІЧЕННЯ")]].forEach(function (x) {
      var b = mk("button", d.a === x[0] ? "on" : "", x[1] + (x[0] && !has1 ? " 🔒" : "")); b.type = "button";
      b.onclick = function () { if (x[0] && !has1) { buy("tg1", P1, redraw); return; } d.a = x[0]; an.querySelectorAll("button").forEach(function (y) { y.classList.remove("on"); }); b.classList.add("on"); paintPv(); }; an.appendChild(b);
    });
    box.appendChild(an);
    if (!has1) box.appendChild(mk("p", "tgd", T("Анимация цвета (перелив и свечение) открывается за ✨ ", "Colour animation (shimmer and glow) unlocks for ✨ ", "Анімація кольору (перелив і свічення) відкривається за ✨ ") + P1));
    var st = mk("div", "tgm"), row = mk("div", "tgr");
    var sv = mk("button", "btn tgbn", T("СОХРАНИТЬ", "SAVE", "ЗБЕРЕГТИ")); sv.type = "button";
    sv.onclick = function () {
      var t = clean(d, own);
      if (!t) { st.textContent = T("Так нельзя: до 12 знаков, только буквы, цифры и пробел, без грубых и «служебных» слов.", "Not allowed: up to 12 characters, letters/digits/spaces only, no rude or official-sounding words.", "Так не можна: до 12 знаків, лише літери, цифри та пробіл, без грубих і «службових» слів."); st.className = "tgm er"; return; }
      DR = null; PF.tg = t; pfSave(); if (window.sidAuto) sidAuto(); try { pfUI(); } catch (e) {} st.textContent = T("Готово! Друзья увидят тег в течение минуты ✓", "Done! Friends will see it within a minute ✓", "Готово! Друзі побачать тег протягом хвилини ✓"); st.className = "tgm ok"; if (window.arp) arp([523, 659, 784], .09);
    };
    var rm = mk("button", "btn a tgbn", T("УБРАТЬ", "REMOVE", "ПРИБРАТИ")); rm.type = "button";
    rm.onclick = function () { DR = null; PF.tg = null; pfSave(); if (window.sidAuto) sidAuto(); try { pfUI(); } catch (e) {} d.t = ""; inp.value = ""; paintPv(); st.textContent = T("Тег убран", "Tag removed", "Тег прибрано"); st.className = "tgm"; };
    row.appendChild(sv); row.appendChild(rm); box.appendChild(row); box.appendChild(st);
  }
  function buy(id, price, redraw) {
    var own = owG();
    if (own.includes(id)) return;
    if (coG() < price) { snd(150, .2, "square", .06); var c = $("shC"); c.classList.remove("no"); void c.offsetWidth; c.classList.add("no"); return; }
    coS(coG() - price); own.push(id); try { localStorage.setItem("ow", JSON.stringify(own)); } catch (e) {}
    arp([523, 659, 784], .09); hap("light", 1); redraw();
  }
  window.TagUI = { render: render, el: el, clean: clean, mine: function () { return clean(PF.tg, owG()); } };
})();
