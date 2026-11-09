const test = require('node:test');
const assert = require('node:assert/strict');

// маленькая замена D1 на встроенной SQLite, чтобы проверить настоящий Worker без сети
function fakeD1() {
  const { DatabaseSync } = require('node:sqlite'), db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return {}; }
  });
  return { prepare: sql => stmt(sql) };
}

let n = 0;
async function setup(extra) {
  // свежий экземпляр модуля на каждую базу: у Worker есть кэш «схема уже создана»
  let worker; try { worker = (await import(require('node:url').pathToFileURL(require('node:path').join(__dirname, '../backend/worker.js')).href + '?t=' + (++n))).default; } catch (e) { return null; }
  let DB; try { DB = fakeD1(); } catch (e) { return null; }
  const env = { DB, JWT_SECRET: 'x'.repeat(32), ADMIN_TOKEN: 'correct-horse-battery-staple', ALLOWED_ORIGIN: 'https://me.github.io', ...extra };
  const call = async (path, body, method) => {
    const r = await worker.fetch(new Request('https://api.test' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' }, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: r.status, data: await r.json() };
  };
  return { call };
}

test('game is on by default and status is public', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const r = await s.call('/api/status');
  assert.equal(r.status, 200); assert.equal(r.data.off, false); assert.equal(r.data.epoch, 0);
});

test('admin rejects wrong token and a missing or weak secret', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  assert.equal((await s.call('/api/admin', { token: 'nope', action: 'off' })).status, 404);   // чужому эндпоинт не виден
  assert.equal((await s.call('/api/status')).data.off, false);
  const weak = await setup({ ADMIN_TOKEN: 'short' });
  assert.equal((await weak.call('/api/admin', { token: 'short', action: 'off' })).status, 404);
  const none = await setup({ ADMIN_TOKEN: undefined });
  assert.equal((await none.call('/api/admin', { token: '', action: 'off' })).status, 404);
});

test('off blocks the rest of the API, on brings it back, restart bumps the epoch', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const tok = 'correct-horse-battery-staple';
  const off = await s.call('/api/admin', { token: tok, action: 'off', message: '  Обновляем\n игру  ' });
  assert.equal(off.data.off, true); assert.equal(off.data.msg, 'Обновляем игру');
  assert.equal((await s.call('/api/status')).data.off, true);
  const blocked = await s.call('/api/leaderboard'); assert.equal(blocked.status, 503); assert.equal(blocked.data.maintenance, true);
  assert.equal((await s.call('/api/admin', { token: tok, action: 'status' })).status, 200);   // сама админка работает
  assert.equal((await s.call('/api/admin', { token: tok, action: 'restart' })).data.epoch, 1);
  const on = await s.call('/api/admin', { token: tok, action: 'on' });
  assert.equal(on.data.off, false); assert.equal(on.data.msg, '');
  assert.equal((await s.call('/api/leaderboard')).status, 200);
  assert.equal((await s.call('/api/admin', { token: tok, action: 'boom' })).status, 400);
});

test('control page exists only at the secret path', async t => {
  let worker; try { worker = (await import(require('node:url').pathToFileURL(require('node:path').join(__dirname, '../backend/worker.js')).href + '?t=page')).default; } catch (e) { return t.skip('нет модуля'); }
  const get = (path, env) => worker.fetch(new Request('https://api.test' + path), env);
  const env = { DB: fakeD1(), JWT_SECRET: 'x'.repeat(32), ADMIN_PATH: 'my-secret-path-12345', ADMIN_TOKEN: 'correct-horse-battery-staple' };
  const ok = await get('/my-secret-path-12345', env);
  assert.equal(ok.status, 200); assert.match(ok.headers.get('content-type'), /text\/html/); assert.match(ok.headers.get('x-robots-tag'), /noindex/);
  assert.match(await ok.text(), /\/api\/admin/);
  assert.equal((await get('/admin.html', env)).status, 404);
  assert.equal((await get('/my-secret-path-1234', env)).status, 404);
  assert.equal((await get('/my-secret-path-12345', { ...env, ADMIN_PATH: undefined })).status, 404);   // не настроено: страницы нет
  assert.equal((await get('/short', { ...env, ADMIN_PATH: 'short' })).status, 404);                   // слишком короткий адрес не принимается
});

test('admin attempts are rate limited', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  let last; for (let i = 0; i < 32; i++) last = await s.call('/api/admin', { token: 'bad', action: 'status' });
  assert.equal(last.status, 429);
});
