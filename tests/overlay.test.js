const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// берём настоящую функцию ov() из app.js и гоняем её на заглушке DOM
const src = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const m = src.match(/function ov\(a\)\{.*\}\n/);
assert.ok(m, 'ov() найдена в app.js');

function make() {
  const els = {}, shown = [];
  for (let i = 1; i <= 12; i++) { const s = new Set(i === 1 ? ['s'] : []); els['o' + i] = { classList: { toggle: (c, on) => (on ? s.add(c) : s.delete(c)), remove: c => s.delete(c) }, _s: s }; }
  const $ = id => els[id];
  const dbgShow = t => shown.push(t);
  const ov = new Function('$', 'dbgShow', m[0] + '; return ov;')($, dbgShow);
  const open = () => Object.keys(els).filter(k => els[k]._s.has('s'));
  return { ov, open, shown };
}

test('ov("") hides every menu without an error (game start and resume)', () => {
  const t = make();
  t.ov('');
  assert.deepEqual(t.open(), []);
  assert.deepEqual(t.shown, []);
});

test('ov(id) opens exactly that screen; an unknown screen is reported and falls back to the main menu', () => {
  const t = make();
  t.ov('o5'); assert.deepEqual(t.open(), ['o5']);
  t.ov('o99'); assert.deepEqual(t.open(), ['o1']); assert.equal(t.shown.length, 1);
});
