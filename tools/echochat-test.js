/* Проверка чата Эхо в браузере: node tools/echochat-test.js [папка_для_скриншотов]
   Настоящий код сервера (backend/worker.js) работает в памяти, браузер открывает игру и общается с ним. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), shots = process.argv[2] || '/tmp';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f));
});
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const { DatabaseSync } = require('node:sqlite'), db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({ bind: (...x) => stmt(sql, x), first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), run: async () => { const r = db.prepare(sql).run(...a); return { meta: { last_row_id: Number(r.lastInsertRowid) } } } });
  const worker = (await import(require('url').pathToFileURL(path.join(root, 'backend/worker.js')).href)).default;
  const env = { DB: { prepare: s => stmt(s) }, JWT_SECRET: 'x'.repeat(32) };
  let ip = 0;
  const api = async (p, body, token) => { const r = await worker.fetch(new Request('https://api.test' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.1.1.' + ((++ip % 200) + 1), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), env); return r.json(); };
  const reg = async n => { const r = await api('/api/register', { username: n, password: 'password123' }); return { token: r.token, code: r.spCode || r.sp_code, name: n }; };
  const A = await reg('Alice'), B = await reg('Bobby'), C = await reg('Carol');
  for (const X of [B, C]) { await api('/api/friends/request', { q: X.code }, A.token); await api('/api/friends/respond', { code: A.code, accept: true }, X.token) }
  await api('/api/chat/send', { to: A.code, text: 'Привет! Го сыграем?' }, B.token);
  await api('/api/chat/send', { to: B.code, text: 'Давай, только позже' }, A.token);
  const tiny = 'data:image/jpeg;base64,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';
  const sent = await api('/api/chat/send', { to: A.code, img: tiny, text: 'смотри' }, B.token);
  const first = (await api('/api/chat?with=' + B.code, null, A.token)).messages[0];
  await api('/api/chat/react', { to: B.code, id: first.id, emo: '🔥' }, A.token);
  await api('/api/chat/send', { to: A.code, text: '😂' }, B.token);
  const aud = 'data:audio/webm;d=7;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEXTbuMU6uEHFO7a1OsggHk';
  ok((await api('/api/chat/send', { to: A.code, img: aud }, B.token)).ok !== false, 'сервер принял голосовое');
  for (const bad of ['data:audio/webm;d=0;base64,AAAA', 'data:audio/webm;d=99;base64,AAAA', 'data:audio/webm;base64,AAAA', 'data:audio/x-evil;d=5;base64,AAAA', 'data:text/html;d=5;base64,AAAA'])
    ok((await api('/api/chat/send', { to: A.code, img: bad }, B.token)).error, 'сервер отклонил плохое: ' + bad.slice(0, 30));
  await api('/api/chat/send', { to: A.code, text: 'ответ тебе', reply: first.id }, B.token);
  await api('/api/chat/typing', { to: A.code }, B.token);
  await api('/api/chat?with=' + A.code, null, B.token);   // Боб прочитал
  const rid = (await api('/api/echo/room', { name: 'Словари' }, A.token)).id;
  for (const X of [B, C]) await api('/api/echo/room/invite', { room: rid, code: X.code }, A.token);
  await api('/api/echo/room/send', { room: rid, text: 'Всем привет! Сегодня заезд в 20:00' }, A.token);
  await api('/api/echo/room/send', { room: rid, text: '@Alice буду!', reply: 1 }, B.token);
  await api('/api/echo/room/send', { room: rid, text: 'Я тоже, @Bobby не опаздывай' }, C.token);
  await api('/api/echo/room/pin', { room: rid, id: 1 }, A.token);
  await api('/api/echo/room/about', { room: rid, about: 'Тренируемся и играем заезды по вечерам' }, A.token);
  await api('/api/echo/room/react', { room: rid, id: 1, emo: '❤️' }, B.token);
  await api('/api/echo/room/mod', { room: rid, code: B.code, on: true }, A.token);
  await api('/api/echo/room/send', { room: rid, text: 'вот', img: tiny }, C.token);
  await api('/api/echo/room/typing', { room: rid }, B.token);

  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const p = await b.newPage({ viewport: { width: +process.env.W || 430, height: +process.env.H || 900 }, deviceScaleFactor: 1, isMobile: !!process.env.W, hasTouch: !!process.env.W }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(a => { localStorage.setItem('tutDone', '1'); localStorage.setItem('slovopadCloudToken', a.t); localStorage.setItem('slovopadId', JSON.stringify({ username: 'Alice', spCode: a.c })) }, { t: A.token, c: A.code });
  await p.route(/workers\.dev/, async r => { const u = new URL(r.request().url()); const body = r.request().postData(); const res = await worker.fetch(new Request('https://api.test' + u.pathname + u.search, { method: r.request().method(), headers: { ...r.request().headers(), 'cf-connecting-ip': '10.2.2.2' }, body: body || undefined }), env); r.fulfill({ status: res.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: await res.text() }) });
  await p.route(/telegram\.org|github\.io/, r => r.abort());
  await p.goto(base + '/index.html'); await p.waitForFunction(() => !document.getElementById('spl'), null, { timeout: 15000 }).catch(() => { });
  console.log('Личный чат');
  await p.evaluate(b => SlovopadFriends.chatOpen({ username: 'Bobby', spCode: b, online: true }), B.code); await p.waitForTimeout(1500);
  const t = await p.evaluate(() => document.getElementById('chL').innerText);
  ok(/Привет! Го сыграем/.test(t), 'сообщения видны'); ok(/ответ тебе/.test(t), 'есть ответ');
  ok(await p.evaluate(() => !!document.querySelector('#chL .mq')), 'у ответа есть цитата');
  ok(await p.evaluate(() => !!document.querySelector('#chL .mimg img')), 'картинка загрузилась');
  ok(await p.evaluate(() => { const v = document.querySelector('#chL .mvo .mvt'); return !!v && v.textContent === '0:07' }), 'голосовое показано с длиной 0:07');
  { const bb = await p.locator('#chL .mimg img').first().boundingBox(); const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    await p.mouse.move(cx, cy); await p.mouse.down(); await p.waitForTimeout(650); await p.mouse.up(); await p.waitForTimeout(250);
    ok(await p.evaluate(() => !!document.querySelector('#o15 .eksh .esre')), 'долгое нажатие по фото открывает меню');
    ok(await p.evaluate(() => !document.querySelector('.ekview')), 'фото во весь экран при этом не открылось');
    await p.evaluate(() => document.querySelector('#o15 .eksh').click()); await p.waitForTimeout(200); }
  ok(await p.evaluate(() => !!document.querySelector('#chL .mt.big')), 'смайлик показан крупно (стикер)');
  ok(await p.evaluate(() => !!document.querySelector('#chL .rxc')), 'реакция видна');
  ok(await p.evaluate(() => !!document.querySelector('#chL .chty')), '«печатает…» видно');
  ok(await p.evaluate(() => /✓✓/.test(document.getElementById('chL').innerText)), 'отметка «прочитано» видна');
  await p.screenshot({ path: shots + '/dm1.png' });
  await p.evaluate(() => document.querySelector('#chL .chm.me .chb').click()); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !!document.querySelector('#o15 .eksh .esa')), 'меню сообщения открывается');
  await p.screenshot({ path: shots + '/dm2.png' });
  await p.evaluate(() => [...document.querySelectorAll('#o15 .eksh .esa')].find(x => /Изменить/.test(x.textContent)).click()); await p.waitForTimeout(200);
  await p.fill('#chIn', 'Давай, только позже!'); await p.click('#chSn'); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => /изм\./.test(document.getElementById('chL').innerText)), 'правка видна с пометкой «изм.»');
  await p.evaluate(() => document.querySelector('#chL .chm.me .chb').click()); await p.waitForTimeout(200);
  await p.evaluate(() => [...document.querySelectorAll('#o15 .eksh .esa')].find(x => /Удалить/.test(x.textContent)).click()); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => /Сообщение удалено/.test(document.getElementById('chL').innerText)), 'удаление работает');
  await p.click('#chRx'); await p.waitForTimeout(200); await p.screenshot({ path: shots + '/dm3.png' });
  await p.evaluate(() => document.getElementById('chSk').hidden = true);
  await p.click('#chMc'); await p.waitForTimeout(1700);
  ok(await p.evaluate(() => !!document.querySelector('#o15 .ekrec')), 'запись пошла: видна полоска записи');
  await p.screenshot({ path: shots + '/voice-rec.png' });
  await p.click('#o15 .ekok'); await p.waitForTimeout(1800);
  ok(await p.evaluate(() => document.querySelectorAll('#chL .mvo').length === 2), 'своё голосовое отправилось и появилось в чате');
  await p.screenshot({ path: shots + '/voice-chat.png' });
  await p.click('#chMc'); await p.waitForTimeout(500); await p.click('#o15 .ekno'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => !document.querySelector('#o15 .ekrec') && document.querySelectorAll('#chL .mvo').length === 2), 'отмена записи ничего не отправляет');
  if (process.env.W) {
    const cdp = await p.context().newCDPSession(p);
    const swipe = async (x0, y0, x1, y1, steps = 8, shot) => {
      const pt = (x, y) => [{ x, y, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
      for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps) }); await p.waitForTimeout(12) }
      if (shot) await p.screenshot({ path: shots + '/' + shot });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(450);
    };
    const open = () => p.evaluate(() => document.getElementById('o15').classList.contains('s'));
    await swipe(120, 400, 170, 405); ok(await open(), 'короткий свайп чат не закрывает');
    await swipe(200, 300, 230, 600); ok(await open(), 'свайп вниз (прокрутка) чат не закрывает');
    await swipe(300, 400, 100, 400); ok(await open(), 'свайп влево чат не закрывает');
    await swipe(60, 400, 330, 410, 10, 'dm-swipe.png');
    ok(!(await open()), 'длинный свайп вправо закрывает чат');
    ok(await p.evaluate(() => { const o = document.getElementById('o15'); return !o.style.translate && !o.style.opacity }), 'после свайпа экран чата не остался сдвинутым');
  }
  console.log('Комната');
  await p.evaluate(() => document.getElementById('chBk').click()); await p.waitForTimeout(300);
  await api('/api/echo/room/typing', { room: rid }, B.token);
  await p.evaluate(id => SlovopadEcho.roomOpen(id, 'Словари'), rid); await p.waitForTimeout(1800);
  const rt = await p.evaluate(() => document.getElementById('rmL').innerText);
  ok(/Всем привет/.test(rt) && /буду/.test(rt), 'сообщения комнаты видны');
  ok(await p.evaluate(() => !!document.querySelector('#rmL .mq')), 'ответ с цитатой');
  ok(await p.evaluate(() => !!document.querySelector('#rmL .men.me')), 'моё @имя подсвечено');
  ok(await p.evaluate(() => !!document.querySelector('#rmL .mimg img')), 'картинка в комнате');
  ok(await p.evaluate(() => !document.getElementById('rmPin').hidden), 'закреплённое сообщение показано');
  ok(await p.evaluate(() => /Тренируемся/.test(document.getElementById('rmAb').textContent)), 'описание комнаты показано');
  ok(await p.evaluate(() => /печатает/.test(document.getElementById('rmL').innerText)), '«печатает…» в комнате');
  await p.screenshot({ path: shots + '/room1.png' });
  await p.evaluate(() => document.querySelector('#rmL .msg:not(.mine)').click()); await p.waitForTimeout(300);
  ok(await p.evaluate(() => [...document.querySelectorAll('#o17 .eksh .esa')].some(x => /Закрепить|Открепить/.test(x.textContent))), 'у создателя есть «Закрепить»');
  await p.screenshot({ path: shots + '/room2.png' });
  await p.evaluate(() => document.querySelector('#o17 .eksh').click()); await p.waitForTimeout(200);
  await p.evaluate(() => document.getElementById('rmMn').click()); await p.waitForTimeout(300);
  await p.evaluate(() => [...document.querySelectorAll('#rmMenu button')].find(x => /УЧАСТНИКИ|MEMBERS/.test(x.textContent)).click()); await p.waitForTimeout(300);
  await p.screenshot({ path: shots + '/room3.png' });
  ok(errs.length === 0, 'нет ошибок в консоли' + (errs.length ? ': ' + errs[0] : ''));
  await b.close(); srv.close(); console.log(fails ? '\nПровалов: ' + fails : '\nВсё хорошо'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
