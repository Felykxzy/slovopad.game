/* Проверка экранов перед релизом: node tools/smoke.js
   Нужен установленный playwright (npm i -D playwright). Сервер и интернет не нужны: игра открывается локально,
   запросы к серверу подменяются пустыми ответами. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f));
});
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch();
  async function open(q, vp) {
    const p = await b.newPage({ viewport: vp || { width: 430, height: 900 } }); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    await p.addInitScript(() => { localStorage.setItem('tutDone', '1') });
    await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await p.route(/telegram\.org|workers\.dev|github\.io/, r => r.abort());
    await p.goto(base + '/index.html' + (q || '')); await p.waitForFunction(() => !document.getElementById('spl'), null, { timeout: 15000 }).catch(() => { });
    return p;
  }
  console.log('Главное меню');
  let p = await open();
  ok(await p.evaluate(() => document.getElementById('o1').classList.contains('s')), 'меню открыто');
  ok(!(await p.evaluate(() => !!document.getElementById('spl'))), 'заставка исчезла');
  for (const id of ['tp', 'qp', 'echoB', 'shopB', 'pc', 'gs']) ok(await p.evaluate(i => !!document.getElementById(i), id), 'есть кнопка #' + id);
  console.log('Настройки');
  await p.evaluate(() => document.getElementById('gs').click()); await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.getElementById('o4').classList.contains('s')), 'настройки открываются');
  ok(await p.evaluate(() => /ЖИДКОЕ СТЕКЛО/.test(document.getElementById('sb').textContent)), 'пункт «Жидкое стекло» есть');
  console.log('Игра');
  await p.evaluate(() => { document.getElementById('bBk').click() }); await p.waitForTimeout(300);
  await p.evaluate(() => document.getElementById('qp').click()); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => !document.getElementById('o1').classList.contains('s')), 'быстрая игра запускается');
  ok(p.errs.length === 0, 'нет ошибок в консоли' + (p.errs.length ? ': ' + p.errs[0] : ''));
  await p.close();
  console.log('Версия со стеклом');
  p = await open('?glass=1');
  ok(await p.evaluate(() => document.body.classList.contains('lq')), '?glass=1 включает стекло');
  ok(await p.evaluate(() => document.getElementById('mf').getAttribute('href') === 'manifest-glass.webmanifest'), 'подключён свой манифест');
  ok(p.errs.length === 0, 'нет ошибок в консоли' + (p.errs.length ? ': ' + p.errs[0] : ''));
  await p.close();
  console.log('Широкий экран');
  p = await open('', { width: 1280, height: 760 });
  ok(await p.evaluate(() => document.getElementById('o1').classList.contains('s')), 'меню на ПК открыто');
  await p.close();
  await b.close(); srv.close();
  console.log(fails ? '\nПровалено проверок: ' + fails : '\nВсё хорошо');
  process.exit(fails ? 1 : 0);
})();
