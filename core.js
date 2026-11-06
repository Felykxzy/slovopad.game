(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SlovopadCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function accuracy(correct, incorrect) {
    const total = Math.max(0, Number(correct) || 0) + Math.max(0, Number(incorrect) || 0);
    return total ? Math.round((Math.max(0, Number(correct) || 0) / total) * 100) : null;
  }
  function wordsPerMinute(words, seconds) {
    const time = Math.max(0, Number(seconds) || 0);
    return time >= 30 ? Math.round((Math.max(0, Number(words) || 0) * 60) / time) : null;
  }
  function mergeBestScores(a, b) {
    const out = { ...(a || {}) };
    for (const [key, value] of Object.entries(b || {})) out[key] = Math.max(Number(out[key]) || 0, Number(value) || 0);
    return out;
  }
  return { accuracy, wordsPerMinute, mergeBestScores };
});
