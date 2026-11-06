const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

test('accuracy handles empty and mixed input', () => {
  assert.equal(core.accuracy(0, 0), null);
  assert.equal(core.accuracy(9, 1), 90);
  assert.equal(core.accuracy(0, 4), 0);
});

test('words per minute requires a meaningful sample', () => {
  assert.equal(core.wordsPerMinute(10, 29), null);
  assert.equal(core.wordsPerMinute(30, 60), 30);
});

test('best scores merge without losing a higher local or cloud record', () => {
  assert.deepEqual(core.mergeBestScores({ a: 12, b: 3 }, { a: 8, c: 7 }), { a: 12, b: 3, c: 7 });
});

