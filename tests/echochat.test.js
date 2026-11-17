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

const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP';
async function pair(s) {
  const a = await s.reg('Alice'), b = await s.reg('Bobby');
  await s.raw('/api/friends/request', { q: b.code }, a.token);
  await s.raw('/api/friends/respond', { code: a.code, accept: true }, b.token);
  return [a, b];
}
const chat = (s, u, o, q = '') => s.raw('/api/chat?with=' + encodeURIComponent(o.code) + q, null, u.token);

test('chat: reply, edit, delete, reactions, picture, typing, read marks', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const [a, b] = await pair(s);
  await s.raw('/api/chat/send', { to: b.code, text: 'привет' }, a.token);
  let g = (await chat(s, b, a)).data, m1 = g.messages[0];
  assert.equal(m1.body, 'привет'); assert.equal(m1.mine, false);
  assert.equal((await chat(s, a, b)).data.readTo, m1.id, 'Боб прочитал — у Алисы отметка «прочитано»');
  await s.raw('/api/chat/send', { to: a.code, text: 'ответ', reply: m1.id }, b.token);
  g = (await chat(s, a, b, '&after=' + m1.id)).data;
  assert.equal(g.messages[0].rp.text, 'привет'); assert.equal(g.messages[0].rp.who, 'Alice');
  // правка: только своё
  assert.equal((await s.raw('/api/chat/edit', { to: a.code, id: m1.id, text: 'x' }, b.token)).status, 403);
  const t0 = g.now;
  assert.equal((await s.raw('/api/chat/edit', { to: b.code, id: m1.id, text: 'привет!' }, a.token)).status, 200);
  g = (await chat(s, b, a, '&after=' + m1.id + '&since=' + t0)).data;
  assert.equal(g.changed.length, 1); assert.equal(g.changed[0].body, 'привет!'); assert.equal(g.changed[0].ed, true);
  // реакция: включить, сменить, выключить
  assert.equal((await s.raw('/api/chat/react', { to: a.code, id: m1.id, emo: '🔥' }, b.token)).status, 200);
  g = (await chat(s, a, b)).data; assert.deepEqual(g.react, [[m1.id, '🔥', 'Bobby']]);
  assert.equal((await s.raw('/api/chat/react', { to: a.code, id: m1.id, emo: '🔥' }, b.token)).status, 200);
  assert.deepEqual((await chat(s, a, b)).data.react, []);
  assert.equal((await s.raw('/api/chat/react', { to: a.code, id: m1.id, emo: '💩' }, b.token)).status, 400);
  // картинка: плохая не проходит, хорошая приходит отдельным запросом
  assert.equal((await s.raw('/api/chat/send', { to: b.code, img: 'http://evil/x.png' }, a.token)).status, 400);
  assert.equal((await s.raw('/api/chat/send', { to: b.code, img: IMG }, a.token)).status, 200);
  g = (await chat(s, b, a)).data; const mi = g.messages.find(x => x.im);
  assert.ok(mi && !('img' in mi)); assert.equal((await s.raw('/api/chat/img?with=' + a.code + '&id=' + mi.id, null, b.token)).data.img, IMG);
  // печатает
  await s.raw('/api/chat/typing', { to: b.code }, a.token);
  assert.equal((await chat(s, b, a)).data.typing, true); assert.equal((await chat(s, a, b)).data.typing, false);
  // удаление
  assert.equal((await s.raw('/api/chat/del', { to: a.code, id: m1.id }, b.token)).status, 403);
  assert.equal((await s.raw('/api/chat/del', { to: b.code, id: m1.id }, a.token)).status, 200);
  g = (await chat(s, b, a)).data; const dm = g.messages.find(x => x.id === m1.id);
  assert.equal(dm.dl, true); assert.equal(dm.body, '');
});

test('room: roles, pin, description, mentions, edit/delete rules', async t => {
  const s = await setup(); if (!s) return t.skip('нет node:sqlite');
  const [a, b] = await pair(s); const c = await s.reg('Carol');
  await s.raw('/api/friends/request', { q: c.code }, a.token); await s.raw('/api/friends/respond', { code: a.code, accept: true }, c.token);
  const room = (await s.raw('/api/echo/room', { name: 'Тест' }, a.token)).data.id;
  await s.raw('/api/echo/room/invite', { room, code: b.code }, a.token); await s.raw('/api/echo/room/invite', { room, code: c.code }, a.token);
  const rm = (u, q = '') => s.raw('/api/echo/room/msgs?room=' + room + q, null, u.token);
  await s.raw('/api/echo/room/send', { room, text: 'всем привет @Bobby' }, a.token);
  await s.raw('/api/echo/room/send', { room, text: 'от Боба' }, b.token);
  let g = (await rm(c)).data; const [m1, m2] = g.messages;
  assert.equal(g.messages.length, 2); assert.equal(g.room.mod, false);
  // закреп и описание — не всем
  assert.equal((await s.raw('/api/echo/room/pin', { room, id: m1.id }, b.token)).status, 403);
  assert.equal((await s.raw('/api/echo/room/about', { room, about: 'x' }, b.token)).status, 403);
  assert.equal((await s.raw('/api/echo/room/pin', { room, id: m1.id }, a.token)).status, 200);
  assert.equal((await s.raw('/api/echo/room/about', { room, about: 'Тут играем по вечерам' }, a.token)).status, 200);
  g = (await rm(b)).data; assert.equal(g.room.pin.id, m1.id); assert.equal(g.room.about, 'Тут играем по вечерам');
  // помощник: назначает только создатель, помощник может закреплять и удалять чужое, но не трогает создателя
  assert.equal((await s.raw('/api/echo/room/mod', { room, code: c.code, on: true }, b.token)).status, 403);
  assert.equal((await s.raw('/api/echo/room/mod', { room, code: b.code, on: true }, a.token)).status, 200);
  g = (await rm(b)).data; assert.equal(g.room.mod, true); assert.equal(g.members.find(x => x.name === 'Bobby').mod, true);
  assert.equal((await s.raw('/api/echo/room/del', { room, id: m1.id }, b.token)).status, 403, 'чужое сообщение создателя помощник не удаляет');
  assert.equal((await s.raw('/api/echo/room/kick', { room, code: a.code }, b.token)).status, 403);
  // обычный участник: своё править и удалять можно, чужое — нет
  assert.equal((await s.raw('/api/echo/room/edit', { room, id: m2.id, text: 'правка' }, c.token)).status, 403);
  assert.equal((await s.raw('/api/echo/room/edit', { room, id: m2.id, text: 'правка' }, b.token)).status, 200);
  assert.equal((await s.raw('/api/echo/room/del', { room, id: m2.id }, a.token)).status, 200, 'создатель удаляет чужое');
  g = (await rm(c, '&after=' + m2.id + '&since=1')).data;
  assert.ok(g.changed.some(x => x.id === m2.id && x.dl));
  // реакции в комнате и ответ
  await s.raw('/api/echo/room/react', { room, id: m1.id, emo: '❤️' }, c.token);
  await s.raw('/api/echo/room/send', { room, text: 'ок', reply: m1.id }, c.token);
  g = (await rm(a, '&after=' + m2.id)).data;
  assert.equal(g.messages[0].rp.text, 'всем привет @Bobby'); assert.deepEqual(g.react, [[m1.id, '❤️', 'Carol']]);
  await s.raw('/api/echo/room/typing', { room }, c.token);
  assert.deepEqual((await rm(a)).data.typing, ['Carol']);
});
