/* СЛОВОПАД — свой сканер QR-кодов без библиотек (работает в любом браузере, где есть камера: Safari, Firefox, Chrome, встроенные браузеры).
   Берёт кадр с камеры, находит три «глаза» QR, выравнивает перспективу, считывает модули, исправляет ошибки (Рид–Соломон) и отдаёт текст.
   Понимает версии 1–10, все уровни коррекции, режимы: цифры, буквы/цифры, байты (UTF-8).
   Использование: SlovopadQRScan.decode(imageData) → строка или null; SlovopadQRScan.start(video, onText) → { stop() }. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SlovopadQRScan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ---------- поле GF(256) и исправление ошибок Рида–Соломона ---------- */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
  const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  const gdiv = (a, b) => (a ? EXP[LOG[a] + 255 - LOG[b]] : 0);

  // r — блок (данные, затем коррекция), nsym — число байт коррекции. Правит r на месте, true — если блок цел или исправлен.
  function rsCorrect(r, nsym) {
    const n = r.length, syn = new Array(nsym);
    let bad = false;
    for (let i = 0; i < nsym; i++) { let s = 0; for (let j = 0; j < n; j++) s = gmul(s, EXP[i]) ^ r[j]; syn[i] = s; if (s) bad = true; }
    if (!bad) return true;
    // Берлекэмп–Мэсси: многочлен локаторов ошибок C
    let C = [1], B = [1], L = 0, m = 1, b = 1;
    for (let i = 0; i < nsym; i++) {
      let d = syn[i];
      for (let j = 1; j <= L; j++) d ^= gmul(C[j] || 0, syn[i - j]);
      if (!d) { m++; continue; }
      const T = C.slice(), k = gdiv(d, b);
      while (C.length < B.length + m) C.push(0);
      for (let j = 0; j < B.length; j++) C[j + m] ^= gmul(k, B[j]);
      if (2 * L <= i) { L = i + 1 - L; B = T; b = d; m = 1; } else m++;
    }
    if (2 * L > nsym) return false;
    // Чен: ищем корни, т.е. позиции ошибок
    const pos = [];
    for (let p = 0; p < n; p++) {
      let v = 0;
      for (let j = 0; j < C.length; j++) if (C[j]) v ^= gmul(C[j], EXP[((255 - p) * j) % 255]);
      if (!v) pos.push(p);
    }
    if (pos.length !== L) return false;
    // Форни: значения ошибок
    const om = [];
    for (let i = 0; i < nsym; i++) { let o = 0; for (let j = 0; j <= i && j < C.length; j++) o ^= gmul(C[j], syn[i - j]); om.push(o); }
    for (const p of pos) {
      let num = 0, den = 0;
      for (let i = 0; i < nsym; i++) if (om[i]) num ^= gmul(om[i], EXP[((255 - p) * i) % 255]);
      for (let j = 1; j < C.length; j += 2) if (C[j]) den ^= gmul(C[j], EXP[((255 - p) * (j - 1)) % 255]);
      if (!den) return false;
      r[n - 1 - p] ^= gmul(EXP[p], gdiv(num, den));
    }
    for (let i = 0; i < nsym; i++) { let s = 0; for (let j = 0; j < n; j++) s = gmul(s, EXP[i]) ^ r[j]; if (s) return false; }
    return true;
  }

  /* ---------- устройство QR (версии 1–10) ---------- */
  // порядок уровней: L, M, Q, H; индекс — версия-1
  const ECC = [[7, 10, 15, 20, 26, 18, 20, 24, 30, 18], [10, 16, 26, 18, 24, 16, 18, 22, 22, 26], [13, 22, 18, 26, 18, 24, 18, 22, 20, 24], [17, 28, 22, 16, 22, 28, 26, 26, 24, 28]];
  const BLK = [[1, 1, 1, 1, 1, 2, 2, 2, 2, 4], [1, 1, 1, 2, 2, 4, 4, 4, 5, 5], [1, 1, 2, 2, 4, 4, 6, 6, 8, 8], [1, 1, 2, 4, 4, 4, 5, 6, 8, 8]];
  const LEVEL = { 1: 0, 0: 1, 3: 2, 2: 3 };   // биты уровня в формате → индекс таблиц

  const rawModules = v => {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  };

  const MASK = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];

  // карта служебных модулей (поисковые узоры, линии синхронизации, выравнивание, формат, версия)
  const fnCache = {};
  function funcMask(ver) {
    if (fnCache[ver]) return fnCache[ver];
    const size = ver * 4 + 17, f = new Uint8Array(size * size), set = (x, y) => { if (x >= 0 && y >= 0 && x < size && y < size) f[y * size + x] = 1; };
    for (let i = 0; i < size; i++) { set(6, i); set(i, 6); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) set(cx + dx, cy + dy); });
    const al = alignPos(ver);
    al.forEach((a, i) => al.forEach((b, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy);
    }));
    for (let i = 0; i <= 8; i++) { set(8, i); set(i, 8); }
    for (let i = 0; i < 8; i++) { set(size - 1 - i, 8); set(8, size - 1 - i); }
    if (ver >= 7) for (let i = 0; i < 18; i++) { const a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c); set(c, a); }
    return (fnCache[ver] = f);
  }
  function alignPos(ver) {
    const al = [];
    if (ver > 1) {
      const size = ver * 4 + 17, n = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2; al.push(6);
      for (let p = size - 7, i = 0; i < n - 1; i++, p -= step) al.splice(1, 0, p);
    }
    return al;
  }

  // 32 допустимых «форматных» слова (уровень + маска), BCH(15,5)
  const FORMATS = [];
  for (let d = 0; d < 32; d++) { let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); FORMATS.push(((d << 10) | r) ^ 0x5412); }
  const ham = x => { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; };

  function readFormat(m, size) {
    const g = (x, y) => m[y * size + x];
    let a = 0, b = 0;
    for (let i = 0; i < 15; i++) {
      let x, y;
      if (i <= 5) { x = 8; y = i; } else if (i === 6) { x = 8; y = 7; } else if (i === 7) { x = 8; y = 8; } else if (i === 8) { x = 7; y = 8; } else { x = 14 - i; y = 8; }
      a |= g(x, y) << i;
      if (i < 8) { x = size - 1 - i; y = 8; } else { x = 8; y = size - 15 + i; }
      b |= g(x, y) << i;
    }
    let best = -1, bd = 4;
    for (let d = 0; d < 32; d++) { const e = Math.min(ham(a ^ FORMATS[d]), ham(b ^ FORMATS[d])); if (e < bd) { bd = e; best = d; } }
    return best < 0 ? null : { level: LEVEL[best >> 3], mask: best & 7 };
  }

  /* ---------- из матрицы модулей в текст ---------- */
  // m — плоский массив size*size, 1 — тёмный модуль. Возвращает строку или null.
  function decodeMatrix(m, size) {
    const ver = (size - 17) / 4;
    if (ver < 1 || ver > 10 || ver !== Math.floor(ver)) return null;
    const fmt = readFormat(m, size); if (!fmt) return null;
    const fn = funcMask(ver), mk = MASK[fmt.mask], raw = Math.floor(rawModules(ver) / 8), cw = new Uint8Array(raw);
    let bit = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
        if (fn[y * size + x]) continue;
        if (bit < raw * 8) cw[bit >>> 3] |= ((m[y * size + x] ^ (mk(x, y) ? 1 : 0)) & 1) << (7 - (bit & 7));
        bit++;
      }
    }
    // раскладываем по блокам (данные и коррекция перемешаны) и чиним каждый блок
    const nb = BLK[fmt.level][ver - 1], ecl = ECC[fmt.level][ver - 1], shorts = nb - raw % nb, shortLen = Math.floor(raw / nb);
    const blocks = [], dl = [];
    for (let i = 0; i < nb; i++) { const len = shortLen + (i < shorts ? 0 : 1); blocks.push(new Array(len)); dl.push(len - ecl); }
    let k = 0;
    for (let i = 0; i < Math.max(...dl); i++) for (let j = 0; j < nb; j++) if (i < dl[j]) blocks[j][i] = cw[k++];
    for (let i = 0; i < ecl; i++) for (let j = 0; j < nb; j++) blocks[j][dl[j] + i] = cw[k++];
    const data = [];
    for (let j = 0; j < nb; j++) { if (!rsCorrect(blocks[j], ecl)) return null; for (let i = 0; i < dl[j]; i++) data.push(blocks[j][i]); }
    return parse(data, ver);
  }

  const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
  function parse(data, ver) {
    const total = data.length * 8; let pos = 0, s = "", bytes = [];
    const rd = n => { let v = 0; for (let i = 0; i < n; i++, pos++) v = v * 2 + ((data[pos >>> 3] >>> (7 - (pos & 7))) & 1); return v; };
    const flush = () => { if (bytes.length) { s += new TextDecoder("utf-8").decode(new Uint8Array(bytes)); bytes = []; } };
    while (pos + 4 <= total) {
      const mode = rd(4);
      if (mode === 0) break;
      if (mode === 7) { const b = rd(8); if ((b & 0xC0) === 0x80) rd(8); else if ((b & 0xE0) === 0xC0) rd(16); continue; }
      if (mode === 4) {
        const n = rd(ver < 10 ? 8 : 16); if (pos + n * 8 > total) return null;
        for (let i = 0; i < n; i++) bytes.push(rd(8));
      } else if (mode === 2) {
        const n = rd(ver < 10 ? 9 : 11); flush();
        for (let i = 0; i + 1 < n; i += 2) { if (pos + 11 > total) return null; const v = rd(11); s += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45]; }
        if (n & 1) { if (pos + 6 > total) return null; s += ALNUM[rd(6)]; }
      } else if (mode === 1) {
        const n = rd(ver < 10 ? 10 : 12); flush();
        for (let i = 0; i < n; i += 3) {
          const left = Math.min(3, n - i), bits = left === 3 ? 10 : left === 2 ? 7 : 4;
          if (pos + bits > total) return null; s += String(rd(bits)).padStart(left, "0");
        }
      } else return null;   // кандзи и прочее нам не нужно
    }
    flush();
    return s;
  }

  /* ---------- картинка → чёрно-белая карта ---------- */
  function binarize(g, w, h) {
    const W = w + 1, I = new Uint32Array(W * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
    const r = Math.max(8, (Math.max(w, h) / 16) | 0), bin = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r), area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const mean = (I[(y1 + 1) * W + x1 + 1] - I[y0 * W + x1 + 1] - I[(y1 + 1) * W + x0] + I[y0 * W + x0]) / area, v = g[y * w + x];
        bin[y * w + x] = v < mean * 0.9 - 3 ? 1 : 0;
      }
    }
    return bin;
  }

  /* ---------- поиск «глаз» (узор 1:1:3:1:1) ---------- */
  function findFinders(bin, w, h) {
    const out = [];
    const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
    const dark = (x, y) => inb(x, y) && bin[y * w + x] === 1;
    const light = (x, y) => inb(x, y) && bin[y * w + x] === 0;
    const ok = st => {
      let tot = 0; for (let i = 0; i < 5; i++) { if (!st[i]) return false; tot += st[i]; }
      if (tot < 7) return false;
      const ms = tot / 7, tol = ms * 0.6;
      return Math.abs(ms - st[0]) < tol && Math.abs(ms - st[1]) < tol && Math.abs(3 * ms - st[2]) < 3 * tol && Math.abs(ms - st[3]) < tol && Math.abs(ms - st[4]) < tol;
    };
    // проверка по линии через пиксель (x,y): возвращает центр узора вдоль оси и его длину
    const cross = (x, y, dx, dy) => {
      let a = 0; while (dark(x - a * dx, y - a * dy)) a++;
      if (!a) return null;
      let b = 0; while (light(x - (a + b) * dx, y - (a + b) * dy)) b++;
      let c = 0; while (dark(x - (a + b + c) * dx, y - (a + b + c) * dy)) c++;
      let d = 1; while (dark(x + d * dx, y + d * dy)) d++;
      let e = 0; while (light(x + (d + e) * dx, y + (d + e) * dy)) e++;
      let f = 0; while (dark(x + (d + e + f) * dx, y + (d + e + f) * dy)) f++;
      const st = [c, b, a + d - 1, e, f]; if (!ok(st)) return null;
      const len = st[0] + st[1] + st[2] + st[3] + st[4], pos = dx ? x : y;
      return { c: pos - (a - 1 + b + c) + len / 2, len };
    };
    const hit = (xEnd, y, st) => {
      const cx0 = xEnd - st[4] - st[3] - st[2] / 2;
      const v = cross(Math.floor(cx0), y, 0, 1); if (!v) return;
      const hz = cross(Math.floor(cx0), Math.floor(v.c), 1, 0); if (!hz) return;
      const x = hz.c, yy = v.c, ms = (v.len + hz.len) / 14;
      for (const p of out) {
        if (Math.abs(p.x - x) <= ms && Math.abs(p.y - yy) <= ms && (Math.abs(p.ms - ms) <= 1 || Math.abs(p.ms - ms) <= p.ms)) {
          p.x = (p.x * p.n + x) / (p.n + 1); p.y = (p.y * p.n + yy) / (p.n + 1); p.ms = (p.ms * p.n + ms) / (p.n + 1); p.n++; return;
        }
      }
      out.push({ x, y: yy, ms, n: 1 });
    };
    for (let y = 0; y < h; y++) {
      const st = [0, 0, 0, 0, 0]; let cur = 0;
      for (let x = 0; x < w; x++) {
        if (bin[y * w + x]) { if (cur & 1) cur++; st[cur]++; }
        else if (!(cur & 1)) {
          if (cur === 4) {
            if (ok(st)) { hit(x, y, st); cur = 0; st.fill(0); }
            else { st[0] = st[2]; st[1] = st[3]; st[2] = st[4]; st[3] = 1; st[4] = 0; cur = 3; }
          } else st[++cur]++;
        } else st[cur]++;
      }
      if (cur === 4 && ok(st)) hit(w, y, st);
    }
    return out;
  }

  // выбираем тройки «глаз», похожие на углы квадрата; возвращаем от самой подходящей
  function triples(c) {
    const f = c.filter(p => p.n >= 2).sort((a, b) => b.n - a.n).slice(0, 10), res = [];
    const d2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
    for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) for (let k = j + 1; k < f.length; k++) {
      const P = [f[i], f[j], f[k]], d = [d2(P[1], P[2]), d2(P[0], P[2]), d2(P[0], P[1])];
      const o = d.indexOf(Math.max(d[0], d[1], d[2])), tl = P[o], q = [P[(o + 1) % 3], P[(o + 2) % 3]];
      const v1 = { x: q[0].x - tl.x, y: q[0].y - tl.y }, v2 = { x: q[1].x - tl.x, y: q[1].y - tl.y };
      const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y), cos = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2), ratio = l1 / l2;
      const mss = P.map(p => p.ms), mr = Math.max(...mss) / Math.min(...mss);
      if (Math.abs(cos) > 0.45 || ratio < 0.5 || ratio > 2 || mr > 1.9) continue;
      const cr = v1.x * v2.y - v1.y * v2.x;
      res.push({ tl, tr: cr > 0 ? q[0] : q[1], bl: cr > 0 ? q[1] : q[0], score: Math.abs(cos) + Math.abs(1 - ratio) * 0.5 + (mr - 1) * 0.5 - (P[0].n + P[1].n + P[2].n) / 2000 });
    }
    return res.sort((a, b) => a.score - b.score);
  }

  /* ---------- перспектива и выборка модулей ---------- */
  // преобразование «модульные координаты → пиксели» по четырём точкам
  function homography(src, dst) {
    const A = [];
    for (let i = 0; i < 4; i++) {
      const [u, v] = src[i], [x, y] = dst[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]); A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
    }
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]];
      for (let r = 0; r < 8; r++) { if (r === c) continue; const k = A[r][c] / A[c][c]; for (let j = c; j < 9; j++) A[r][j] -= k * A[c][j]; }
    }
    return A.map((row, i) => row[8] / row[i]);
  }

  // ищем маленький «глаз» выравнивания рядом с ожидаемым местом (нижний правый угол)
  function findAlign(bin, w, h, tl, tr, bl, size, ms) {
    const ex = { x: (tr.x - tl.x) / (size - 7), y: (tr.y - tl.y) / (size - 7) }, ey = { x: (bl.x - tl.x) / (size - 7), y: (bl.y - tl.y) / (size - 7) };
    const e = { x: tl.x + (size - 10) * (ex.x + ey.x), y: tl.y + (size - 10) * (ex.y + ey.y) };
    const R = ms * 4, step = Math.max(0.5, ms / 4);
    let best = null, bs = -1e9;
    for (let oy = -R; oy <= R; oy += step) for (let ox = -R; ox <= R; ox += step) {
      const cx = e.x + ox, cy = e.y + oy; let hits = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const px = Math.floor(cx + i * ex.x + j * ey.x), py = Math.floor(cy + i * ex.y + j * ey.y);
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        if ((bin[py * w + px] === 1) === (Math.max(Math.abs(i), Math.abs(j)) !== 1)) hits++;
      }
      const s = hits - (ox * ox + oy * oy) / (R * R) * 0.5;
      if (s > bs) { bs = s; best = { x: cx, y: cy, hits }; }
    }
    if (!best || best.hits < 22) return null;
    // уточняем центр по всем пикселям узора (5×5 модулей), а не по 25 точкам
    const det = ex.x * ey.y - ex.y * ey.x; if (!det) return best;
    const fine = ms / 10; let c = best, cs = -1;
    for (let oy = -ms; oy <= ms; oy += fine) for (let ox = -ms; ox <= ms; ox += fine) {
      const cx = best.x + ox, cy = best.y + oy; let sc = 0;
      const r = Math.ceil(3.5 * ms);
      for (let py = Math.floor(cy) - r; py <= cy + r; py++) for (let px = Math.floor(cx) - r; px <= cx + r; px++) {
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const dx = px + 0.5 - cx, dy = py + 0.5 - cy, i = (dx * ey.y - dy * ey.x) / det, j = (ex.x * dy - ex.y * dx) / det, d = Math.max(Math.abs(i), Math.abs(j));
        if (d >= 2.5) continue;
        if ((bin[py * w + px] === 1) === (d < 0.5 || d >= 1.5)) sc++;
      }
      if (sc > cs) { cs = sc; c = { x: cx, y: cy, hits: best.hits }; }
    }
    return c;
  }

  function sample(bin, w, h, H, size) {
    const m = new Uint8Array(size * size), off = [[0, 0], [-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]];
    for (let my = 0; my < size; my++) for (let mx = 0; mx < size; mx++) {
      let n = 0;
      for (const [ox, oy] of off) {
        const u = mx + 0.5 + ox, v = my + 0.5 + oy, d = H[6] * u + H[7] * v + 1;
        const x = Math.floor((H[0] * u + H[1] * v + H[2]) / d), y = Math.floor((H[3] * u + H[4] * v + H[5]) / d);
        if (x >= 0 && y >= 0 && x < w && y < h && bin[y * w + x]) n++;
      }
      m[my * size + mx] = n >= 3 ? 1 : 0;
    }
    return m;
  }

  function tryTriple(bin, w, h, t) {
    const { tl, tr, bl } = t;
    // длины серий мерили по строкам и столбцам, а код может быть повёрнут: вдоль оси серия длиннее в 1/cos угла — вводим поправку
    const ang = Math.atan2(tr.y - tl.y, tr.x - tl.x), kk = Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
    const mTL = tl.ms * kk, mTR = tr.ms * kk, mBL = bl.ms * kk;
    const est = (Math.hypot(tr.x - tl.x, tr.y - tl.y) / ((mTL + mTR) / 2) + Math.hypot(bl.x - tl.x, bl.y - tl.y) / ((mTL + mBL) / 2)) / 2 + 7;
    const v0 = Math.round((est - 17) / 4), ms = (mTL + mTR + mBL) / 3;
    for (const ver of [v0, v0 - 1, v0 + 1]) {
      if (ver < 1 || ver > 10) continue;
      const size = ver * 4 + 17, tries = [], ap = ver >= 2 ? findAlign(bin, w, h, tl, tr, bl, size, ms) : null;
      if (ap) tries.push({ p: [size - 6.5, size - 6.5], x: ap.x, y: ap.y });
      tries.push({ p: [size - 3.5, size - 3.5], x: tr.x + bl.x - tl.x, y: tr.y + bl.y - tl.y });   // оценка параллелограммом
      for (const br of tries) {
        // сначала точка как есть, затем небольшие сдвиги вокруг неё (перспектива и размытие сбивают её на долю модуля)
        const offs = [[0, 0]];
        for (let k = 1; k <= 3; k++) for (let a = -k; a <= k; a++) for (let b = -k; b <= k; b++) if (Math.max(Math.abs(a), Math.abs(b)) === k) offs.push([a, b]);
        for (const [a, b] of offs) {
          const x = br.x + a * ms * 0.25, y = br.y + b * ms * 0.25;
          const H = homography([[3.5, 3.5], [size - 3.5, 3.5], [3.5, size - 3.5], br.p], [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y], [x, y]]);
          if (!H) continue;
          let r = null; try { r = decodeMatrix(sample(bin, w, h, H, size), size); } catch (e) {}
          if (r !== null) return r;
        }
      }
    }
    return null;
  }

  /* ---------- публичное ---------- */
  // gray — яркость 0..255 (w*h). Возвращает текст QR или null.
  function decodeGray(gray, w, h) {
    const bin = binarize(gray, w, h), ts = triples(findFinders(bin, w, h));
    for (let i = 0; i < ts.length && i < 4; i++) { const r = tryTriple(bin, w, h, ts[i]); if (r !== null) return r; }
    return null;
  }
  // img — ImageData или { data: RGBA, width, height }
  function decode(img) {
    const w = img.width, h = img.height, d = img.data, g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 151 + d[j + 2] * 28) >> 8;
    return decodeGray(g, w, h);
  }

  // запускает чтение кадров с <video>; onText вызывается с найденным текстом (пока не вернёт true, сканирование продолжается)
  function start(video, onText) {
    const cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently: true });
    let stop = false, busy = false, n = 0, timer = 0;
    const tick = () => {
      if (stop) return;
      timer = setTimeout(tick, 120);
      if (busy || !video.videoWidth || video.readyState < 2) return;
      busy = true;
      try {
        // кадры по очереди разного размера: мелкий быстрее, крупный видит далёкий или мелкий код
        const big = Math.max(video.videoWidth, video.videoHeight), lim = n++ % 3 === 2 ? 1280 : 720, k = Math.min(1, lim / big);
        cv.width = Math.round(video.videoWidth * k); cv.height = Math.round(video.videoHeight * k);
        cx.drawImage(video, 0, 0, cv.width, cv.height);
        const t = decode(cx.getImageData(0, 0, cv.width, cv.height));
        if (t && onText(t) === true) stop = true;
      } catch (e) { /* кадр не прочитался — попробуем следующий */ }
      busy = false;
    };
    tick();
    return { stop() { stop = true; clearTimeout(timer); } };
  }

  return { decode, decodeGray, decodeMatrix, start };
});
