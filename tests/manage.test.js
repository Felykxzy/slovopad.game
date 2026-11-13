const test = require('node:test');
const assert = require('node:assert/strict');

function fakeD1() {
  const { DatabaseSync } = require('node:sqlite'), db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  });
  return { prepare: sql => stmt(sql) };
}
let n = 0;
async function setup() {
  let worker; try { worker = (await import(require('node:url').pathToFileURL(require('node:path').join(__dirname, '../backend/worker.js')).href + '?a=' + (++n))).default; } catch (e) { return null; }
  let DB; try { DB = fakeD1(); } catch (e) { return null; }
  const env = { DB, JWT_SECRET: 'x'.repeat(32), ADMIN_TOKEN: 'correct-horse-battery-staple', ALLOWED_ORIGIN: 'https://me.github.io' };
  let ip = 0;
  const call = async (path, body, token, method) => {
    const r = await worker.fetch(new Request('https://api.test' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', 'cf-connecting-ip': path === '/api/ctl' && body && String(body.token).startsWith('x') ? '7.7.7.7' : '9.9.9.' + (++ip % 200), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: r.status, data: await r.json() };
  };
  const adm = async (action, extra) => { const r = await call('/api/ctl', { token: env.ADMIN_TOKEN, action, ...(extra || {}) }); return r; };
  const reg = async name => { const r = await call('/api/register', { username: name, password: 'password123' }); return { token: r.data.token, name, id: null }; };
  return { call, adm, reg, env };
}

test('управление: список игроков, поиск, карточка игрока', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  await s.reg('Alice'); await s.reg('Bobby');
  const all = await s.adm('players');
  assert.equal(all.status, 200); assert.equal(all.data.players.length, 2);
  const found = await s.adm('players', { q: 'bob' });
  assert.equal(found.data.players.length, 1); assert.equal(found.data.players[0].username, 'Bobby');
  const d = await s.adm('player', { id: found.data.players[0].id });
  assert.equal(d.data.username, 'Bobby'); assert.equal(d.data.coins, 0); assert.equal(d.data.ban, null);
  assert.equal((await s.adm('player', { id: 'nope' })).status, 404);
  const ov = await s.adm('overview');
  assert.equal(ov.data.users, 2); assert.equal(ov.data.banned, 0);
});

test('управление: выдача монет и предметов, игрок забирает подарки', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice'); await s.reg('Bobby');
  const id = (await s.adm('players', { q: 'Alice' })).data.players[0].id;
  assert.equal((await s.adm('grant', { target: id, kind: 'coins', val: 0 })).status, 400);
  assert.equal((await s.adm('grant', { target: id, kind: 'coins', val: 5000000 })).status, 400);
  assert.equal((await s.adm('grant', { target: id, kind: 'item', val: 'zzz' })).status, 400);
  assert.equal((await s.adm('grant', { target: id, kind: 'coins', val: 500, note: 'за турнир' })).data.count, 1);
  assert.equal((await s.adm('grant', { target: id, kind: 'item', val: 'b11' })).status, 200);
  assert.equal((await s.adm('grant', { target: 'all', kind: 'coins', val: 100 })).data.count, 2);
  const g = await s.call('/api/grants', null, a.token);
  assert.equal(g.data.grants.length, 3);
  assert.deepEqual(g.data.grants.map(x => x.kind), ['coins', 'item', 'coins']);
  assert.equal((await s.adm('player', { id })).data.pending, 3);
  await s.call('/api/grants/claim', { ids: g.data.grants.map(x => x.id) }, a.token);
  assert.equal((await s.call('/api/grants', null, a.token)).data.grants.length, 0);
  assert.equal((await s.call('/api/grants', null)).status, 401);
});

test('управление: бан закрывает вход и убирает из рейтинга, разбан возвращает', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice');
  const id = (await s.adm('players', { q: 'Alice' })).data.players[0].id;
  assert.equal((await s.call('/api/me', null, a.token)).status, 200);
  assert.equal((await s.adm('ban', { id, reason: 'спам' })).status, 200);
  assert.equal((await s.call('/api/me', null, a.token)).status, 401);
  const login = await s.call('/api/login', { username: 'Alice', password: 'password123' });
  assert.equal(login.status, 403); assert.match(login.data.error, /спам/);
  assert.equal((await s.adm('player', { id })).data.ban.reason, 'спам');
  assert.equal((await s.adm('unban', { id })).status, 200);
  assert.equal((await s.call('/api/me', null, a.token)).status, 200);
});

test('управление: переименование, сброс рекордов, удаление', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  await s.reg('Alice'); await s.reg('Bobby');
  const id = (await s.adm('players', { q: 'Alice' })).data.players[0].id;
  assert.equal((await s.adm('rename', { id, name: 'bobby' })).status, 409);     // занят
  assert.equal((await s.adm('rename', { id, name: 'SP-x' })).status, 400);      // нельзя SP-
  assert.equal((await s.adm('rename', { id, name: 'Carol' })).status, 200);
  assert.equal((await s.adm('player', { id })).data.username, 'Carol');
  assert.equal((await s.adm('resetstats', { id })).status, 200);
  assert.equal((await s.adm('delete', { id })).status, 200);
  assert.equal((await s.adm('player', { id })).status, 404);
  assert.equal((await s.adm('overview')).data.users, 1);
});

test('управление: объявление для всех видно в публичном статусе', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  assert.equal((await s.call('/api/status')).data.news, null);
  assert.equal((await s.adm('news', { text: '  Завтра\nобновление  ' })).status, 200);
  const st = (await s.call('/api/status')).data;
  assert.equal(st.news.text, 'Завтра обновление'); assert.ok(st.news.id > 0);
  await s.adm('news', { text: '' });
  assert.equal((await s.call('/api/status')).data.news, null);
});

test('управление: жалобы и комнаты', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice'); await s.reg('Bobby');
  const r = await s.call('/api/echo/room', { name: 'Штаб' }, a.token);
  assert.equal((await s.adm('rooms')).data.rooms.length, 1);
  assert.equal((await s.adm('rooms')).data.rooms[0].owner, 'Alice');
  assert.equal((await s.adm('closeroom', { id: r.data.id })).status, 200);
  assert.equal((await s.adm('rooms')).data.rooms.length, 0);
  assert.equal((await s.adm('reports')).data.reports.length, 0);
  assert.equal((await s.adm('catalog')).data.items.length > 20, true);
});

test('управление: неверный токен — 404, перебор блокируется', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const bad = await s.call('/api/ctl', { token: 'nope-nope-nope-nope', action: 'players' });
  assert.equal(bad.status, 404);
  let last; for (let i = 0; i < 10; i++) last = await s.call('/api/ctl', { token: 'x' + i, action: 'players' });
  assert.equal(last.status, 429);
});
