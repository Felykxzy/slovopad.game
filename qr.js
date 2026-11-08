/* СЛОВОПАД — маленький генератор QR-кодов без библиотек (байтовый режим, коррекция ошибок M, версии 1–10 — до 213 байт).
   Нужен для входа в Slovopad ID по QR. Использование: SlovopadQR.draw(canvas, "https://…", 240) или SlovopadQR.matrix(text). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SlovopadQR = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];   // байт коррекции на блок (уровень M)
  const BLK = [0, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5];             // число блоков (уровень M)

  const rawModules = v => {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  };
  const dataBytes = v => Math.floor(rawModules(v) / 8) - ECC[v] * BLK[v];

  /* ---------- Рид–Соломон над GF(256) ---------- */
  const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; };
  function rsGen(deg) {
    const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) {
      for (let j = 0; j < deg; j++) { r[j] = mul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
      root = mul(root, 2);
    }
    return r;
  }
  function rsRem(data, gen) {
    const r = gen.map(() => 0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); gen.forEach((c, i) => { r[i] ^= mul(c, f); }); }
    return r;
  }

  /* ---------- Кодирование данных ---------- */
  function codewords(bytes) {
    let ver = 1;
    while (ver <= 10 && 4 + (ver < 10 ? 8 : 16) + 8 * bytes.length > dataBytes(ver) * 8) ver++;
    if (ver > 10) throw new Error("QR: слишком длинный текст");
    const bits = [], put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataBytes(ver) * 8;
    put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
    for (let p = 0xEC; bits.length < cap; p ^= 0xEC ^ 0x11) put(p, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

    const nb = BLK[ver], ecl = ECC[ver], raw = Math.floor(rawModules(ver) / 8), shorts = nb - raw % nb, shortLen = Math.floor(raw / nb), gen = rsGen(ecl);
    const blocks = []; let k = 0;
    for (let i = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - ecl + (i < shorts ? 0 : 1)); k += dat.length;
      const e = rsRem(dat, gen); if (i < shorts) dat.push(0); blocks.push(dat.concat(e));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= shorts) out.push(b[i]); });
    return { ver, out };
  }

  /* ---------- Рисование матрицы ---------- */
  function build(ver, cw) {
    const size = ver * 4 + 17, mk = () => Array.from({ length: size }, () => new Array(size).fill(false));
    const m = mk(), fn = mk(), set = (x, y, v) => { m[y][x] = v; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    });
    const al = [];
    if (ver > 1) {
      const n = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2; al.push(6);
      for (let p = size - 7, i = 0; i < n - 1; i++, p -= step) al.splice(1, 0, p);
    }
    al.forEach((a, i) => al.forEach((b, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    const format = mask => {
      const d = mask;   // уровень M кодируется нулём
      let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const bits = ((d << 10) | r) ^ 0x5412, bit = i => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    format(0);
    if (ver >= 7) {
      let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      const bits = (ver << 12) | r;
      for (let i = 0; i < 18; i++) { const b = ((bits >>> i) & 1) !== 0, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, b); set(c, a, b); }
    }
    // данные змейкой снизу вверх по двум колонкам
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
        if (!fn[y][x] && i < cw.length * 8) { m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
      }
    }
    const MASK = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const apply = k => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASK[k](x, y)) m[y][x] = !m[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      const line = a => {
        let run = 1;
        for (let i = 1; i <= a.length; i++) { if (i < a.length && a[i] === a[i - 1]) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; } }
        const s = a.map(v => (v ? 1 : 0)).join("");
        for (const pat of ["000010111010", "010111010000"]) { let at = -1; while ((at = s.indexOf(pat, at + 1)) >= 0) p += 40; }
      };
      for (let y = 0; y < size; y++) { line(m[y]); line(m.map(r => r[y])); }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (m[y][x]) dark++;
        if (x + 1 < size && y + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
      }
      const tot = size * size; return p + (Math.ceil(Math.abs(dark * 20 - tot * 10) / tot) - 1) * 10;
    };
    let best = 0, bp = Infinity;
    for (let k = 0; k < 8; k++) { apply(k); format(k); const pe = penalty(); if (pe < bp) { bp = pe; best = k; } apply(k); }
    apply(best); format(best);
    return m;
  }

  function matrix(text) {
    const c = codewords([...new TextEncoder().encode(String(text))]);
    return build(c.ver, c.out);
  }

  // рисует код на canvas: белая подложка и тихая зона в 4 модуля, чтобы камера читала и на тёмном экране
  function draw(canvas, text, px) {
    const m = matrix(text), n = m.length, q = 4, cell = Math.max(2, Math.floor((px || 240) / (n + q * 2))), full = (n + q * 2) * cell;
    canvas.width = canvas.height = full;
    const x = canvas.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, full, full); x.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) x.fillRect((c + q) * cell, (r + q) * cell, cell, cell);
    return m;
  }
  return { matrix, draw };
});
