/* Проверка настоящей игры на телефоне и планшете: node tools/play-test.js
   Запуск, набор слов, пауза, продолжить, проигрыш, «Конец игры», «Ещё раз», выход в меню. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'); const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end() } r.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)) });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++ };
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port, b = await chromium.launch();
  for (const [name, w, h] of [['телефон 375x667', 375, 667], ['планшет 834x1194', 834, 1194], ['телефон лёжа 844x390', 844, 390]]) {
    console.log(name);
    const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true }), p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => localStorage.setItem('tutDone', '1')); await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })); await p.route(/telegram\.org|workers\.dev|github\.io/, r => r.abort());
    await p.goto(base + '/index.html'); await p.waitForFunction(() => !document.getElementById('spl'), null, { timeout: 15000 }).catch(() => { });
    await p.evaluate(() => document.getElementById('qp').click()); await p.waitForTimeout(2500);
    ok(await p.evaluate(() => state === 'play'), 'игра идёт');
    for (let k = 0; k < 4; k++) {
      const wd = await p.evaluate(() => (items[0] || {}).up); if (!wd) { await p.waitForTimeout(1500); k--; continue }
      await p.keyboard.type(wd.toLowerCase(), { delay: 20 }); await p.waitForTimeout(400);
    }
    ok(await p.evaluate(() => +document.getElementById('score').textContent) > 0, 'очки растут после набранных слов');
    await p.evaluate(() => document.querySelector('#hud .ib:last-child').click()); await p.waitForTimeout(500);
    ok(await p.evaluate(() => state === 'pause' && document.getElementById('o2').classList.contains('s')), 'пауза открывается');
    const y0 = await p.evaluate(() => (items[0] || { y: 0 }).y); await p.waitForTimeout(800);
    ok(await p.evaluate(y => Math.abs(((items[0] || { y: 0 }).y) - y) < 1, y0), 'во время паузы слова стоят');
    await p.evaluate(() => document.querySelector('#o2 .btn').click()); await p.waitForTimeout(500);
    ok(await p.evaluate(() => state === 'play'), 'продолжить работает');
    for (let i = 0; i < 40 && await p.evaluate(() => state === 'play'); i++) { await p.evaluate(() => { if (items.length) lose(0) }); await p.waitForTimeout(350) } await p.waitForTimeout(1800);
    ok(await p.evaluate(() => document.getElementById('o3').classList.contains('s')), 'после проигрыша экран «Конец игры»');
    await p.screenshot({ path: '/tmp/play_over_' + w + '.png' });
    const bt = await p.evaluate(() => [...document.querySelectorAll('#o3 .btn')].map(x => { const r = x.getBoundingClientRect(); return x.textContent.trim() + ':' + Math.round(r.height) + ':' + (r.bottom <= innerHeight) }));
    ok(bt.every(x => x.split(':')[2] === 'true'), 'все кнопки итога на экране ' + bt.join(', '));
    await p.evaluate(() => [...document.querySelectorAll('#o3 .btn')][0].click()); await p.waitForTimeout(2200);
    ok(await p.evaluate(() => state === 'play'), '«Ещё раз» запускает новую игру');
    await p.evaluate(() => pause()); await p.waitForTimeout(300); await p.evaluate(() => [...document.querySelectorAll('#o2 .btn')].find(x => /МЕНЮ/.test(x.textContent)).click()); await p.waitForTimeout(800);
    ok(await p.evaluate(() => document.getElementById('o1').classList.contains('s')), 'выход в меню');
    // сворачивание вкладки ставит игру на паузу
    await p.evaluate(() => document.getElementById('qp').click()); await p.waitForTimeout(2000);
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) }); await p.waitForTimeout(400);
    ok(await p.evaluate(() => state === 'pause'), 'свернул приложение — игра на паузе');
    ok(errs.length === 0, 'нет ошибок в консоли' + (errs.length ? ': ' + errs[0] : ''));
    await c.close();
  }
  await b.close(); srv.close(); console.log(fails ? '\nПровалов: ' + fails : '\nВсё хорошо'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
