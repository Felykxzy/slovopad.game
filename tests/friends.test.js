const test = require('node:test');
const assert = require('node:assert/strict');

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
async function setup() {
  let worker; try { worker = (await import(require('node:url').pathToFileURL(require('node:path').join(__dirname, '../backend/worker.js')).href + '?f=' + (++n))).default; } catch (e) { return null; }
  let DB; try { DB = fakeD1(); } catch (e) { return null; }
  const env = { DB, JWT_SECRET: 'x'.repeat(32) };
  let ip = 0;
  const raw = async (path, body, token, ipAddr) => {
    const r = await worker.fetch(new Request('https://api.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ipAddr || '9.9.9.9', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: r.status, data: await r.json() };
  };
  const reg = async name => { const r = await raw('/api/register', { username: name, password: 'password123' }, null, '10.0.0.' + (++ip)); assert.equal(r.status, 200, JSON.stringify(r.data)); return { token: r.data.token, code: r.data.spCode || r.data.sp_code, name }; };
  return { raw, reg, env };
}

test('friend request needs confirmation, then both see each other', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice'), b = await s.reg('Bobby');
  assert.ok(a.code, 'у игрока есть код');
  assert.equal((await s.raw('/api/friends/request', { q: b.name }, a.token)).data.state, 'sent');
  let la = (await s.raw('/api/friends', null, a.token)).data, lb = (await s.raw('/api/friends', null, b.token)).data;
  assert.equal(la.friends.length, 0); assert.equal(la.outgoing.length, 1); assert.equal(lb.incoming.length, 1); assert.equal(lb.friends.length, 0);
  assert.equal((await s.raw('/api/friends/request', { q: b.name }, a.token)).status, 409);   // повтор
  assert.equal((await s.raw('/api/ping', {}, b.token)).data.requests, 1);
  assert.equal((await s.raw('/api/friends/respond', { code: a.code, accept: true }, b.token)).data.accepted, true);
  la = (await s.raw('/api/friends', null, a.token)).data; lb = (await s.raw('/api/friends', null, b.token)).data;
  assert.equal(la.friends[0].username, 'Bobby'); assert.equal(lb.friends[0].username, 'Alice');
});

test('declined request disappears; cannot add yourself or strangers; mutual requests merge', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice'), b = await s.reg('Bobby'), c = await s.reg('Carol');
  assert.equal((await s.raw('/api/friends/request', { q: a.code }, a.token)).status, 400);
  assert.equal((await s.raw('/api/friends/request', { q: 'Nobody' }, a.token)).status, 404);
  await s.raw('/api/friends/request', { q: b.code }, a.token);
  await s.raw('/api/friends/respond', { code: a.code, accept: false }, b.token);
  assert.equal((await s.raw('/api/friends', null, b.token)).data.incoming.length, 0);
  assert.equal((await s.raw('/api/friends/respond', { code: a.code, accept: true }, b.token)).status, 404);
  await s.raw('/api/friends/request', { q: c.name }, a.token);
  assert.equal((await s.raw('/api/friends/request', { q: a.name }, c.token)).data.state, 'accepted');
  assert.equal((await s.raw('/api/friends', null, a.token)).data.friends.length, 1);
});

test('only the receiver can accept; remove works both ways', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice'), b = await s.reg('Bobby');
  await s.raw('/api/friends/request', { q: b.code }, a.token);
  assert.equal((await s.raw('/api/friends/respond', { code: b.code, accept: true }, a.token)).status, 404);   // отправитель не может принять сам
  await s.raw('/api/friends/respond', { code: a.code, accept: true }, b.token);
  await s.raw('/api/friends/remove', { code: a.code }, b.token);
  assert.equal((await s.raw('/api/friends', null, a.token)).data.friends.length, 0);
  assert.equal((await s.raw('/api/friends', null, b.token)).data.friends.length, 0);
});

test('online status and numbers respect privacy', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice'), b = await s.reg('Bobby');
  await s.raw('/api/friends/request', { q: b.code }, a.token);
  await s.raw('/api/friends/respond', { code: a.code, accept: true }, b.token);
  await s.raw('/api/ping', {}, b.token);
  let f = (await s.raw('/api/friends', null, a.token)).data.friends[0];
  assert.equal(f.online, true);
  // Bobby скрывает «в сети» и рекорды
  await s.env.DB.prepare('UPDATE users SET privacy_json=?, best_score=? WHERE username=?').bind(JSON.stringify({ online: false, records: false }), 777, 'Bobby').run();
  f = (await s.raw('/api/friends', null, a.token)).data.friends[0];
  assert.equal(f.online, false); assert.equal(f.bestScore, null);
  await s.env.DB.prepare('UPDATE users SET privacy_json=? WHERE username=?').bind(JSON.stringify({ online: true, records: true }), 'Bobby').run();
  f = (await s.raw('/api/friends', null, a.token)).data.friends[0];
  assert.equal(f.bestScore, 777);
});

test('challenge: only to friends, can be won, can be removed', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice'), b = await s.reg('Bobby'), c = await s.reg('Carol');
  const ch = { code: b.code, theme: 'animals', score: 500, lang: 0 };
  assert.equal((await s.raw('/api/challenge', ch, a.token)).status, 403);   // ещё не друзья
  await s.raw('/api/friends/request', { q: b.code }, a.token);
  await s.raw('/api/friends/respond', { code: a.code, accept: true }, b.token);
  assert.equal((await s.raw('/api/challenge', { ...ch, theme: 'bad theme!' }, a.token)).status, 400);
  assert.equal((await s.raw('/api/challenge', { ...ch, score: 0 }, a.token)).status, 400);
  assert.equal((await s.raw('/api/challenge', ch, a.token)).status, 200);
  assert.equal((await s.raw('/api/challenge', { ...ch, code: c.code }, a.token)).status, 403);
  const inc = (await s.raw('/api/friends', null, b.token)).data.challenges.incoming;
  assert.equal(inc.length, 1); assert.equal(inc[0].from.username, 'Alice'); assert.equal(inc[0].score, 500);
  assert.equal((await s.raw('/api/ping', {}, b.token)).data.challenges, 1);
  assert.equal((await s.raw('/api/challenge/done', { id: inc[0].id, score: 500 }, a.token)).status, 404);   // чужой вызов
  assert.equal((await s.raw('/api/challenge/done', { id: inc[0].id, score: 500 }, b.token)).data.won, false);   // ровно столько — мало
  assert.equal((await s.raw('/api/challenge/done', { id: inc[0].id, score: 501 }, b.token)).data.won, true);
  assert.equal((await s.raw('/api/friends', null, a.token)).data.challenges.sent[0].state, 'won');
  assert.equal((await s.raw('/api/friends', null, b.token)).data.challenges.incoming.length, 0);
});

test('friends API needs login and is rate limited', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  assert.equal((await s.raw('/api/friends')).status, 401);
  assert.equal((await s.raw('/api/ping', {})).status, 401);
  const a = await s.reg('Alice'); let last;
  for (let i = 0; i < 32; i++) last = await s.raw('/api/friends/request', { q: 'Nobody' + i }, a.token);
  assert.equal(last.status, 429);
});

test('nick cannot imitate an SP- code', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const r = await s.raw('/api/register', { username: 'SP-ABC234', password: 'password123' }, null, '10.9.0.1');
  assert.equal(r.status, 400);
});

test('hidden records are not shown in the leaderboard at all', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice'), b = await s.reg('Bobby');
  await s.raw('/api/sync', { profile: {}, data: {}, totalWords: 40, bestScore: 900, privacy: { records: false } }, a.token);
  await s.raw('/api/sync', { profile: {}, data: {}, totalWords: 30, bestScore: 500 }, b.token);
  const lb = await s.raw('/api/leaderboard');
  assert.deepEqual(lb.data.items.map(x => x.username), ['Bobby']);
});

async function makeFriends(s, a, b) {
  await s.raw('/api/friends/request', { q: b.name }, a.token);
  await s.raw('/api/friends/respond', { code: a.code, accept: true }, b.token);
}

test('chat: friends exchange texts and reactions, unread counts, strangers cannot write', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice'), b = await s.reg('Bobby'), c = await s.reg('Carol');
  assert.equal((await s.raw('/api/chat/send', { to: b.code, text: 'привет' }, a.token)).status, 403);   // ещё не друзья
  await makeFriends(s, a, b);
  assert.equal((await s.raw('/api/chat/send', { to: b.code, text: '  привет,   друг  ' }, a.token)).status, 200);
  assert.equal((await s.raw('/api/chat/send', { to: b.code, react: '🔥' }, a.token)).status, 200);
  assert.equal((await s.raw('/api/chat/send', { to: b.code, react: '💩' }, a.token)).status, 400);   // реакции только из списка
  assert.equal((await s.raw('/api/chat/send', { to: b.code, text: 'x'.repeat(121) }, a.token)).status, 400);
  assert.equal((await s.raw('/api/chat/send', { to: b.code, text: '   ' }, a.token)).status, 400);
  assert.equal((await s.raw('/api/ping', {}, b.token)).data.messages, 2);
  const lb = (await s.raw('/api/friends', null, b.token)).data;
  assert.equal(lb.friends[0].unread, 2);
  const got = (await s.raw('/api/chat?with=' + a.code, null, b.token)).data;
  assert.deepEqual(got.messages.map(m => [m.mine, m.kind, m.body]), [[false, 'text', 'привет, друг'], [false, 'react', '🔥']]);
  assert.equal((await s.raw('/api/ping', {}, b.token)).data.messages, 0);   // прочитано
  const mine = (await s.raw('/api/chat?with=' + b.code, null, a.token)).data;
  assert.equal(mine.messages[0].mine, true);
  assert.equal((await s.raw('/api/chat?with=' + a.code + '&after=' + got.messages[1].id, null, b.token)).data.messages.length, 0);
  assert.equal((await s.raw('/api/chat?with=' + a.code, null, c.token)).status, 403);   // чужую переписку не прочитать
});

test('chat: block stops messages, report is stored, removing a friend wipes the history', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice'), b = await s.reg('Bobby');
  await makeFriends(s, a, b);
  await s.raw('/api/chat/send', { to: b.code, text: 'hi' }, a.token);
  assert.equal((await s.raw('/api/chat/report', { to: a.code }, b.token)).status, 200);
  assert.equal((await s.raw('/api/chat/block', { to: a.code, on: true }, b.token)).data.blocked, true);
  assert.equal((await s.raw('/api/chat/send', { to: b.code, text: 'ещё' }, a.token)).status, 403);
  assert.equal((await s.raw('/api/chat/send', { to: a.code, text: 'ответ' }, b.token)).status, 409);   // сам заблокировал
  assert.equal((await s.raw('/api/chat?with=' + a.code, null, b.token)).data.blocked, true);
  await s.raw('/api/chat/block', { to: a.code, on: false }, b.token);
  assert.equal((await s.raw('/api/chat/send', { to: b.code, text: 'снова' }, a.token)).status, 200);
  await s.raw('/api/friends/remove', { code: b.code }, a.token);
  assert.equal((await s.raw('/api/chat?with=' + b.code, null, a.token)).status, 403);
  await makeFriends(s, a, b);
  assert.equal((await s.raw('/api/chat?with=' + b.code, null, a.token)).data.messages.length, 0);
});

test('ночная уборка: удаляет старое и пустое, шлёт отчёт', async () => {
  const c = await setup(); if (!c) return;
  const w = (await import(require('node:url').pathToFileURL(require('node:path').join(__dirname, '../backend/worker.js')).href + '?cron')).default;
  const a = await c.reg('CronA'), b = await c.reg('CronB');
  const old = new Date(Date.now() - 200 * 86400000).toISOString();
  await c.env.DB.prepare('UPDATE users SET updated_at=? WHERE username=?').bind(old, 'CronB').run();
  await c.env.DB.prepare('UPDATE users SET best_score=50,total_words=5,updated_at=? WHERE username=?').bind(old, 'CronA').run();
  await c.env.DB.prepare('INSERT INTO rate_limit (k,t) VALUES (?,?)').bind('x', 1).run();
  const calls = []; const real = globalThis.fetch;
  globalThis.fetch = async (u, o) => { calls.push([String(u), o && o.body]); return { ok: true }; };
  try {
    const r = await w.scheduled({}, { ...c.env, TG_BOT_TOKEN: 'T', TG_CHAT_ID: '1' }, { waitUntil() {} });
    assert.equal(r.removed, 1);
    assert.equal(r.sent, true);
    assert.match(calls[0][0], /botT\/sendMessage/);
    assert.ok((await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n === 1);
    assert.ok((await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE username='CronA'").first()).n === 1);
    assert.equal((await c.env.DB.prepare('SELECT COUNT(*) AS n FROM rate_limit WHERE k=\'x\'').first()).n, 0);
  } finally { globalThis.fetch = real; }
});

test('Эхо: комнаты — создание, приглашение только друзей, сообщения, выход, выкидывание', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice'), b = await s.reg('Bobby'), c = await s.reg('Carol');
  await makeFriends(s, a, b);
  const r = await s.raw('/api/echo/room', { name: '  Наша   комната ' }, a.token);
  assert.equal(r.status, 200); const id = r.data.id;
  assert.equal((await s.raw('/api/echo/room', { name: '' }, a.token)).status, 400);
  assert.equal((await s.raw('/api/echo/room/invite', { room: id, code: c.code }, a.token)).status, 403);   // не друг
  assert.equal((await s.raw('/api/echo/room/invite', { room: id, code: b.code }, a.token)).status, 200);
  assert.equal((await s.raw('/api/echo/room/invite', { room: id, code: b.code }, a.token)).status, 409);   // уже в комнате
  assert.equal((await s.raw('/api/echo/room/send', { room: id, text: 'всем привет' }, c.token)).status, 403);   // чужой
  assert.equal((await s.raw('/api/echo/room/send', { room: id, text: 'всем привет' }, a.token)).status, 200);
  let list = (await s.raw('/api/echo/rooms', null, b.token)).data.rooms;
  assert.equal(list.length, 1); assert.equal(list[0].unread, 1); assert.equal(list[0].members, 2);
  const m = (await s.raw('/api/echo/room/msgs?room=' + id, null, b.token)).data;
  assert.equal(m.messages.length, 1); assert.equal(m.messages[0].who, 'Alice'); assert.equal(m.messages[0].mine, false);
  assert.equal((await s.raw('/api/echo/rooms', null, b.token)).data.rooms[0].unread, 0);
  assert.equal((await s.raw('/api/echo/room/kick', { room: id, code: a.code }, b.token)).status, 403);   // не создатель
  assert.equal((await s.raw('/api/echo/room/report', { room: id }, b.token)).status, 200);
  assert.equal((await s.raw('/api/echo/room/kick', { room: id, code: b.code }, a.token)).status, 200);
  assert.equal((await s.raw('/api/echo/rooms', null, b.token)).data.rooms.length, 0);
  await s.raw('/api/echo/room/leave', { room: id }, a.token);
  assert.equal((await s.raw('/api/echo/rooms', null, a.token)).data.rooms.length, 0);
});

test('Эхо: Telegram без токена бота не привязывается, статус отвечает', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const a = await s.reg('Alice');
  assert.equal((await s.raw('/api/tg/link', { initData: 'hash=bad' }, a.token)).status, 400);
  const st = (await s.raw('/api/tg', null, a.token)).data;
  assert.equal(st.linked, false); assert.equal(st.available, false);
});
