/* старые iPhone (iOS 15 и ниже) не умеют roundRect: подставляем свой */
(function(){var P=typeof window!=="undefined"&&window.CanvasRenderingContext2D&&CanvasRenderingContext2D.prototype;if(P&&!P.roundRect)P.roundRect=function(x,y,w,h,r){r=typeof r==="number"?r:(r&&(r.length?r[0]:r))||0;if(typeof r!=="number")r=0;r=Math.max(0,Math.min(r,Math.abs(w)/2,Math.abs(h)/2));this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);this.closePath()}})();
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
