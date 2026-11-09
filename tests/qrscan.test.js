const test = require('node:test');
const assert = require('node:assert/strict');
const QR = require('../qr.js');
const Scan = require('../qrscan.js');

// рисует матрицу QR в яркость 0..255; angle — поворот, tilt — лёгкая перспектива, blur — размытие, noise — шум камеры
function render(text, { px = 6, angle = 0, tilt = 0, blur = 0, noise = 0, W = 640, H = 480 } = {}) {
  const m = QR.matrix(text), n = m.length, q = 4, tot = n + q * 2, side = Math.min(W, H) * 0.8, k = side / tot;
  const g = new Float32Array(W * H), ca = Math.cos(angle), sa = Math.sin(angle);
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let dx = x - W / 2, dy = y - H / 2;
    const u0 = ca * dx + sa * dy, v0 = -sa * dx + ca * dy, d = 1 + tilt * u0 / side;     // перспектива: масштаб зависит от u
    const u = u0 / d / k + tot / 2, v = v0 / d / k + tot / 2;
    let val = 110;
    if (u >= 0 && v >= 0 && u < tot && v < tot) { const mx = Math.floor(u) - q, my = Math.floor(v) - q; val = mx >= 0 && my >= 0 && mx < n && my < n && m[my][mx] ? 15 : 240; }
    g[y * W + x] = val;
  }
  let out = g;
  if (blur) {   // простое размытие 3×3 нужное число раз
    for (let it = 0; it < blur; it++) { const t = new Float32Array(g.length); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { let s = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += out[(y + j) * W + x + i]; t[y * W + x] = s / 9; } out = t; }
  }
  const res = new Uint8Array(W * H);
  for (let i = 0; i < res.length; i++) res[i] = Math.max(0, Math.min(255, out[i] + (noise ? (rnd() - 0.5) * noise : 0)));
  return { g: res, W, H };
}

const URL = 'https://felykxzy.github.io/slovopad.game/?qr=ABCD2345';

test('scanner reads the exact QR the game draws', () => {
  const { g, W, H } = render(URL);
  assert.equal(Scan.decodeGray(g, W, H), URL);
});

test('scanner reads rotated, tilted, blurry and noisy frames', () => {
  for (const o of [{ angle: 0.5 }, { angle: -0.7 }, { angle: 2.4 }, { tilt: 0.25 }, { angle: 0.3, tilt: -0.2, blur: 1, noise: 24 }]) {
    const { g, W, H } = render(URL, o);
    assert.equal(Scan.decodeGray(g, W, H), URL, JSON.stringify(o));
  }
});

test('scanner covers every payload length the generator supports (versions 1-10)', () => {
  for (let n = 1; n <= 213; n += 4) {
    const t = Array.from({ length: n }, (_, i) => String.fromCharCode(97 + (i * 7 + n) % 26)).join('');
    const m = QR.matrix(t), N = m.length, flat = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) flat[y * N + x] = m[y][x] ? 1 : 0;
    assert.equal(Scan.decodeMatrix(flat, N), t, 'length ' + n);
  }
});

test('scanner fixes damaged modules with Reed-Solomon and keeps UTF-8', () => {
  const t = 'Привет, Словопад! 🎮 ' + URL, m = QR.matrix(t), N = m.length, flat = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) flat[y * N + x] = m[y][x] ? 1 : 0;
  for (let i = 0; i < 12; i++) { const p = (N * 12 + 9 + i * 7) % (N * N); if (p % N > 9 && p % N < N - 9) flat[p] ^= 1; }   // портим данные, не трогая поисковые узоры
  assert.equal(Scan.decodeMatrix(flat, N), t);
});

test('scanner returns null when there is no QR in the frame', () => {
  const g = new Uint8Array(320 * 240); for (let i = 0; i < g.length; i++) g[i] = (i * 2654435761 >>> 24) & 255;
  assert.equal(Scan.decodeGray(g, 320, 240), null);
  assert.equal(Scan.decodeGray(new Uint8Array(320 * 240).fill(128), 320, 240), null);
});
