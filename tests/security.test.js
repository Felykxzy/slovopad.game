const test = require('node:test');
const assert = require('node:assert/strict');

function fakeD1() {
  const { DatabaseSync } = require('node:sqlite'), db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; }
  });
  return { prepare: sql => stmt(sql) };
}
let n = 0;
async function setup() {
  const worker = (await import(require('node:url').pathToFileURL(require('node:path').join(__dirname, '../backend/worker.js')).href + '?s=' + (++n))).default;
  const env = { DB: fakeD1(), JWT_SECRET: 'x'.repeat(32) };
  let ip = 0;
  const raw = async (path, body, token, ipAddr) => {
    const r = await worker.fetch(new Request('https://api.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ipAddr || '9.9.9.9', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: r.status, data: await r.json() };
  };
  const reg = async name => {
    const r = await raw('/api/register', { username: name, password: 'password123' }, null, '10.1.0.' + (++ip));
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return { token: r.data.token, code: r.data.spCode, name };
  };
  return { raw, reg, env };
}

test('рейтинг: очки не могут быть больше 150 на слово и больше, чем слова аккаунта', async () => {
  const s = await setup();
  const a = await s.reg('Cheater');
  const r = await s.raw('/api/sync', { profile: {}, data: {}, totalWords: 10, bestScore: 50000000 }, a.token);
  assert.equal(r.status, 200);
  assert.ok(r.data.bestScore <= 10 * 150 + 150, 'очки ограничены: ' + r.data.bestScore);
});

test('вход: неудачные попытки чужого ника не блокируют владельца с другого адреса', async () => {
  const s = await setup();
  await s.reg('Victim');
  for (let i = 0; i < 20; i++) await s.raw('/api/login', { username: 'Victim', password: 'wrongpass1' }, null, '66.6.6.6');
  const ok = await s.raw('/api/login', { username: 'Victim', password: 'password123' }, null, '77.7.7.7');
  assert.equal(ok.status, 200, 'владелец должен входить с другого адреса: ' + ok.status);
});

test('вход: после 15 неудачных попыток с одного адреса этот адрес временно заблокирован', async () => {
  const s = await setup();
  await s.reg('Target');
  let last;
  for (let i = 0; i < 16; i++) last = await s.raw('/api/login', { username: 'Target', password: 'wrongpass1' }, null, '55.5.5.5');
  assert.equal(last.status, 429);
});

test('удаление аккаунта убирает дружбу и вызовы', async () => {
  const s = await setup();
  const a = await s.reg('Gone'), b = await s.reg('Stays');
  await s.raw('/api/friends/request', { q: b.name }, a.token);
  await s.raw('/api/friends/respond', { code: a.code, accept: true }, b.token);
  assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM friends').first()).n, 1, 'дружба создана');
  assert.equal((await s.raw('/api/delete', {}, a.token)).status, 200);
  assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM friends').first()).n, 0, 'дружба удалена');
  assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE username=?').bind('Gone').first()).n, 0);
});
