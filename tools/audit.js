/* Обход всех экранов на разных телефонах и планшетах: node tools/audit.js [папка_скриншотов]
   Ищет: горизонтальную прокрутку, элементы за краем экрана, мелкие кнопки, обрезанный текст, ошибки в консоли. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = process.argv[2] || '/tmp/audit';
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end() } r.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)) });
const DEV = [['SE 375x667', 375, 667], ['Android 360x640', 360, 640], ['Fold 344x882', 344, 882], ['iPhone14 390x844', 390, 844], ['ProMax 430x932', 430, 932], ['Pixel 412x915', 412, 915], ['iPadMini 744x1133', 744, 1133], ['iPad11 834x1194', 834, 1194], ['iPad13 1024x1366', 1024, 1366], ['Phone land 844x390', 844, 390], ['SE land 667x375', 667, 375], ['Tablet land 1194x834', 1194, 834]];
const only = process.env.DEV ? DEV.filter(d => d[0].includes(process.env.DEV)) : DEV;
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port, b = await chromium.launch();
  const all = [];
  for (const [name, w, h] of only) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push(m.text()) });
    await p.addInitScript(() => { localStorage.setItem('tutDone', '1') });
    await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await p.route(/telegram\.org|workers\.dev|github\.io/, r => r.abort());
    await p.goto(base + '/index.html'); await p.waitForFunction(() => !document.getElementById('spl'), null, { timeout: 15000 }).catch(() => { });
    const ids = await p.evaluate(() => [...document.querySelectorAll('.ov')].map(o => o.id));
    for (const id of ids) {
      const res = await p.evaluate(id => {
        const vw = innerWidth, vh = innerHeight, o = document.getElementById(id), iss = [];
        document.querySelectorAll('.ov.s').forEach(x => x.classList.remove('s')); o.classList.add('s', 'sc'); o.style.transition = 'none';
        const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]') && +cs.opacity > 0.05 };
        const ocs = getComputedStyle(o), sc = o.scrollWidth - o.clientWidth; if (sc > 2 && ocs.overflowX !== 'hidden' && ocs.overflowX !== 'clip') iss.push('горизонтальная прокрутка +' + sc + 'px');
        const nm = e => e.id ? '#' + e.id : (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : e.tagName.toLowerCase()) + (e.textContent ? '«' + e.textContent.trim().slice(0, 18) + '»' : '');
        o.querySelectorAll('*').forEach(e => {
          if (!vis(e)) return; const r = e.getBoundingClientRect();
          const clipped = (() => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const c = getComputedStyle(a); if (/(hidden|auto|scroll|clip)/.test(c.overflowX) && a.getBoundingClientRect().right <= vw + 2 && a.getBoundingClientRect().left >= -2) return true } return false })();
          if ((r.right > vw + 2 || r.left < -2) && !clipped) { if (!e.closest('.tw,svg,canvas')) iss.push('за краем: ' + nm(e) + ' (' + Math.round(r.left) + '..' + Math.round(r.right) + ' из ' + vw + ')') }
          if (/^(BUTTON|A|INPUT|SELECT)$/.test(e.tagName) || e.getAttribute('role') === 'button') { if ((r.width < 32 || r.height < 32) && r.width > 0) iss.push('мелкая кнопка ' + Math.round(r.width) + 'x' + Math.round(r.height) + ': ' + nm(e)) }
          const cs = getComputedStyle(e); if (e.children.length === 0 && e.textContent.trim() && (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 2 && cs.textOverflow !== 'ellipsis') iss.push('обрезан текст: ' + nm(e));
          const fs = parseFloat(cs.fontSize); if (e.children.length === 0 && e.textContent.trim() && fs < 10 && vis(e)) iss.push('мелкий шрифт ' + fs + 'px: ' + nm(e));
        });
        return { iss: [...new Set(iss)].slice(0, 14), sh: o.scrollHeight > o.clientHeight + 4 };
      }, id);
      if (res.iss.length) { all.push({ dev: name, id, iss: res.iss }); }
      if (process.env.SHOT) await p.screenshot({ path: out + '/' + name.split(' ')[0] + '_' + id + '.png' });
    }
    if (errs.length) all.push({ dev: name, id: 'консоль', iss: [...new Set(errs)].slice(0, 5) });
    await ctx.close();
  }
  const by = {}; all.forEach(a => a.iss.forEach(i => { const k = a.id + ' | ' + i; (by[k] = by[k] || []).push(a.dev.split(' ')[0]) }));
  Object.keys(by).sort().forEach(k => console.log(k + '   [' + by[k].join(', ') + ']'));
  console.log('\nВсего проблем: ' + Object.keys(by).length); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1) });
