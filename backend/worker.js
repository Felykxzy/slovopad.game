// СЛОВОПАД · Slovopad ID server (Cloudflare Worker + D1)
// Аккаунты, синхронизация прогресса, публичные профили, рейтинг.

const enc = new TextEncoder();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QR_TTL_MS = 3 * 60 * 1000;   // код для входа по QR живёт 3 минуты
const PRIVACY_KEYS = ['rank', 'records', 'ach', 'stats', 'online'];
const QR_MAX_TRIES = 3;               // сколько раз можно ошибиться в числе на телефоне
const QR_PER_IP = 5;                  // сколько живых QR-кодов может быть у одного адреса
const QR_TOTAL = 500;                 // и сколько всего на сервере
const DUMMY_SALT = 'AAAAAAAAAAAAAAAAAAAAAA';   // для выравнивания времени входа, если ника нет

const b64 = bytes => {
  let s = '';
  new Uint8Array(bytes).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = v => Uint8Array.from(atob(v.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const random = n => crypto.getRandomValues(new Uint8Array(n));
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
// сравнение без утечки по времени
const safeEq = (a, b) => {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
};
// «скелет» ника: регистр и похожие буквы (кириллица/латиница) не различаются, чтобы нельзя было выдать себя за другого
const LOOK = { 'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'ё': 'e', 'і': 'i', 'ї': 'i', 'ј': 'j', '0': 'o', '1': 'l' };
const nickKey = name => [...String(name).normalize('NFKC').toLowerCase()].map(c => LOOK[c] || c).join('').replace(/[_.-]/g, '');

/* ---------- CORS ---------- */
function corsOrigin(request, env) {
  const o = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (!allowed.length) return '*';
  // игра в браузере, десктопное приложение (file:// даёт origin "null") и локальная разработка
  if (allowed.includes(o) || o === 'null' || o.startsWith('app://') || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return o;
  return allowed[0];
}
const json = (data, status, origin) => new Response(JSON.stringify(data), {
  status: status || 200,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'cache-control': 'no-store',
    'vary': 'origin'
  }
});

/* ---------- Пароли и токены ---------- */
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations: 100000, hash: 'SHA-256' }, key, 256));
}
const hmacKey = (secret, usage) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

async function sign(payload, secret) {
  const body = b64(enc.encode(JSON.stringify(payload)));
  return body + '.' + b64(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(body)));
}
async function verify(token, secret) {
  try {
    if (!token || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    if (!await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), unb64(sig), enc.encode(body))) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64(body)));
    return data.exp > Date.now() ? data : null;
  } catch (_) { return null; }
}
// В Cloudflare регистр имени важен: принимаем и JWT_SECRET, и jwt_secret.
const secretOf = env => env.JWT_SECRET || env.jwt_secret || '';

/* ---------- Схема базы (создаётся и дополняется сама) ---------- */
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, profile_json TEXT NOT NULL DEFAULT \'{}\', best_score INTEGER NOT NULL DEFAULT 0, total_words INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT \'\')'
  ).run();
  const have = new Set(((await env.DB.prepare('PRAGMA table_info(users)').all()).results || []).map(c => c.name));
  const add = {
    profile_json: 'TEXT NOT NULL DEFAULT \'{}\'',
    best_score: 'INTEGER NOT NULL DEFAULT 0',
    total_words: 'INTEGER NOT NULL DEFAULT 0',
    updated_at: 'TEXT NOT NULL DEFAULT \'\'',
    sp_code: 'TEXT',
    privacy_json: 'TEXT NOT NULL DEFAULT \'{}\'',
    data_json: 'TEXT NOT NULL DEFAULT \'{}\''
  };
  add.username_key = 'TEXT';
  for (const [name, def] of Object.entries(add)) {
    if (!have.has(name)) {
      try { await env.DB.prepare('ALTER TABLE users ADD COLUMN ' + name + ' ' + def).run(); } catch (_) { /* уже добавлена другим запросом */ }
    }
  }
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS users_spcode_idx ON users(sp_code)').run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS users_key_idx ON users(username_key)').run();
  // старым аккаунтам один раз дописываем скелет ника
  const old = ((await env.DB.prepare('SELECT id,username FROM users WHERE username_key IS NULL LIMIT 500').all()).results || []);
  for (const u of old) {
    try { await env.DB.prepare('UPDATE users SET username_key=? WHERE id=?').bind(nickKey(u.username), u.id).run(); } catch (_) { /* похожий ник уже есть: оставляем как есть */ }
  }
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS users_leaderboard_idx ON users(best_score DESC, total_words DESC, username ASC)').run();
  // вход по QR: короткоживущие сессии (код виден в QR, секрет знает только тот, кто его создал)
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS qr_login (code TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, user_id TEXT, expires INTEGER NOT NULL, pin TEXT NOT NULL DEFAULT \'\', tries INTEGER NOT NULL DEFAULT 0, ip TEXT NOT NULL DEFAULT \'\')').run();
  const qcols = new Set(((await env.DB.prepare('PRAGMA table_info(qr_login)').all()).results || []).map(c => c.name));
  const qadd = { pin: 'TEXT NOT NULL DEFAULT \'\'', tries: 'INTEGER NOT NULL DEFAULT 0', ip: 'TEXT NOT NULL DEFAULT \'\'' };
  for (const [name, def] of Object.entries(qadd)) {
    if (!qcols.has(name)) { try { await env.DB.prepare('ALTER TABLE qr_login ADD COLUMN ' + name + ' ' + def).run(); } catch (_) {} }
  }
  // ограничение частоты запросов (журнал обращений, адреса хранятся только в виде хэша)
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rate_limit (k TEXT NOT NULL, t INTEGER NOT NULL)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS rate_limit_idx ON rate_limit(k,t)').run();
  schemaReady = true;
}

/* ---------- Slovopad ID: код SP-XXXXXX ---------- */
const makeCode = () => 'SP-' + [...random(6)].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

async function ensureCode(env, user) {
  if (user.sp_code) return user.sp_code;
  for (let i = 0; i < 8; i++) {
    const code = makeCode();
    try {
      await env.DB.prepare('UPDATE users SET sp_code=? WHERE id=? AND sp_code IS NULL').bind(code, user.id).run();
      const row = await env.DB.prepare('SELECT sp_code FROM users WHERE id=?').bind(user.id).first();
      if (row && row.sp_code) return row.sp_code;
    } catch (_) { /* код занят — пробуем другой */ }
  }
  return '';
}

/* ---------- Ограничение частоты ---------- */
async function allow(env, key, limit, windowMs) {
  try {
    const now = Date.now();
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_limit WHERE k=? AND t>?').bind(key, now - windowMs).first();
    if (row && row.n >= limit) return false;
    await env.DB.prepare('INSERT INTO rate_limit (k,t) VALUES (?,?)').bind(key, now).run();
    if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rate_limit WHERE t<?').bind(now - 24 * 3600 * 1000).run();
    return true;
  } catch (_) { return true; }   // сбой базы не должен блокировать игроков
}
const TOO_MANY = { error: 'Слишком много попыток. Подожди несколько минут.' };
async function ipHash(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(ip + ':' + secretOf(env)))).slice(0, 16);
}
const num = v => Math.max(0, Math.min(100000000, Number(v) || 0));

/* ---------- Помощники ---------- */
const parse = (text, fallback) => { try { const v = JSON.parse(text || ''); return v && typeof v === 'object' ? v : fallback; } catch (_) { return fallback; } };

const cleanPrivacy = raw => {
  const out = {};
  for (const k of PRIVACY_KEYS) out[k] = !raw || raw[k] !== false;   // по умолчанию всё открыто
  return out;
};

async function account(env, user) {
  const code = await ensureCode(env, user);
  return {
    username: user.username,
    spCode: code,
    profile: parse(user.profile_json, {}),
    data: parse(user.data_json, {}),
    privacy: cleanPrivacy(parse(user.privacy_json, {})),
    bestScore: user.best_score || 0,
    totalWords: user.total_words || 0
  };
}

async function userFrom(request, env) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const data = await verify(token, secretOf(env));
  if (!data) return null;
  return env.DB.prepare('SELECT * FROM users WHERE id=?').bind(data.sub).first();
}

/* ---------- Обработчик ---------- */
export default {
  async fetch(request, env) {
    const origin = corsOrigin(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type,authorization',
        'access-control-max-age': '86400',
        'vary': 'origin'
      } });
    }

    const url = new URL(request.url);
    const reply = (data, status) => json(data, status, origin);

    try {
      if (url.pathname === '/api/health') {
        return reply({ ok: true, service: 'slovopad-id', version: 4, secret: !!secretOf(env), db: !!env.DB });
      }
      if (!env.DB) return reply({ error: 'К серверу не привязана база данных (binding DB).' }, 500);
      if (!secretOf(env)) return reply({ error: 'На сервере не задан секрет JWT_SECRET.' }, 500);
      await ensureSchema(env);

      /* регистрация и вход */
      if (request.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
        const ipH = await ipHash(request, env);
        const body = await request.json();
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(username) || password.length < 8 || password.length > 128) {
          return reply({ error: 'Ник: 3–20 символов (буквы, цифры, _ . -). Пароль: 8–128 символов.' }, 400);
        }

        let user;
        if (url.pathname === '/api/register') {
          if (!await allow(env, 'reg:' + ipH, 5, 60 * 60 * 1000)) return reply(TOO_MANY, 429);
          const key = nickKey(username);
          const dup = await env.DB.prepare('SELECT 1 AS x FROM users WHERE username_key=? OR username=? COLLATE NOCASE LIMIT 1').bind(key, username).first();
          if (dup) return reply({ error: 'Этот ник уже занят или слишком похож на другой.' }, 409);
          const salt = b64(random(16));
          const hash = await passwordHash(password, salt);
          const id = crypto.randomUUID();
          try {
            await env.DB.prepare('INSERT INTO users (id,username,salt,password_hash,updated_at,username_key) VALUES (?,?,?,?,?,?)')
              .bind(id, username, salt, hash, new Date().toISOString(), key).run();
          } catch (e) {
            if (/UNIQUE/i.test(String(e && e.message))) return reply({ error: 'Этот ник уже занят или слишком похож на другой.' }, 409);
            console.error('register', e);
            return reply({ error: 'Не удалось создать аккаунт. Попробуй позже.' }, 500);
          }
          user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
        } else {
          if (!await allow(env, 'ip:' + ipH, 20, 10 * 60 * 1000) || !await allow(env, 'lg:' + nickKey(username), 15, 15 * 60 * 1000)) return reply(TOO_MANY, 429);
          user = await env.DB.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE OR username_key=? LIMIT 1').bind(username, nickKey(username)).first();
          // считаем хэш и для несуществующего ника, чтобы по времени ответа нельзя было узнать, есть ли такой игрок
          const hash = await passwordHash(password, user ? user.salt : DUMMY_SALT);
          if (!user || !safeEq(hash, user.password_hash)) {
            return reply({ error: 'Неверный ник или пароль.' }, 401);
          }
        }

        const token = await sign({ sub: user.id, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }, secretOf(env));
        return reply({ token, ...(await account(env, user)) });
      }

      /* вход по QR, шаг 1: устройство без входа (например, ПК) просит код. Секрет остаётся только у него.
         Вместе с кодом выдаётся число из 2 цифр: его нужно ввести на телефоне, поэтому чужой QR без этого числа бесполезен */
      if (url.pathname === '/api/qr/new' && request.method === 'POST') {
        const ipH = await ipHash(request, env);
        if (!await allow(env, 'qrn:' + ipH, 10, 5 * 60 * 1000)) return reply(TOO_MANY, 429);
        const now = Date.now();
        await env.DB.prepare('DELETE FROM qr_login WHERE expires<?').bind(now).run();
        const mine = await env.DB.prepare('SELECT COUNT(*) AS n FROM qr_login WHERE ip=?').bind(ipH).first();
        const all = await env.DB.prepare('SELECT COUNT(*) AS n FROM qr_login').first();
        if ((mine && mine.n >= QR_PER_IP) || (all && all.n >= QR_TOTAL)) return reply({ error: 'Слишком много активных кодов. Подожди пару минут.' }, 429);
        const code = [...random(8)].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
        const pin = String(random(1)[0] % 90 + 10);            // от 10 до 99
        const secret = b64(random(24));
        const secretHash = hex(await crypto.subtle.digest('SHA-256', enc.encode(secret)));
        await env.DB.prepare('INSERT INTO qr_login (code,secret_hash,user_id,expires,pin,tries,ip) VALUES (?,?,NULL,?,?,0,?)').bind(code, secretHash, now + QR_TTL_MS, pin, ipH).run();
        return reply({ code, secret, pin, expiresIn: QR_TTL_MS / 1000 });
      }

      /* шаг 2: вошедшее устройство (телефон) подтверждает вход по коду из QR и числу с экрана компьютера */
      if (url.pathname === '/api/qr/approve' && request.method === 'POST') {
        const user = await userFrom(request, env);
        if (!user) return reply({ error: 'Нужно войти в аккаунт.' }, 401);
        if (!await allow(env, 'qra:' + user.id, 20, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
        const body = await request.json();
        const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const pin = String(body.pin || '').replace(/\D/g, '');
        if (pin.length !== 2) return reply({ error: 'Введи число с экрана компьютера (2 цифры).' }, 400);
        const row = code ? await env.DB.prepare('SELECT * FROM qr_login WHERE code=?').bind(code).first() : null;
        if (!row || row.expires < Date.now()) return reply({ error: 'Код не найден или устарел. Обнови QR на экране компьютера.' }, 404);
        if (row.user_id) return reply({ error: 'Этот код уже использован.' }, 409);
        if (!safeEq(pin, row.pin)) {
          const tries = (row.tries || 0) + 1;
          if (tries >= QR_MAX_TRIES) {
            await env.DB.prepare('DELETE FROM qr_login WHERE code=?').bind(code).run();
            return reply({ error: 'Число введено неверно слишком много раз. Обнови QR на экране компьютера.' }, 403);
          }
          await env.DB.prepare('UPDATE qr_login SET tries=? WHERE code=?').bind(tries, code).run();
          return reply({ error: 'Неверное число. Осталось попыток: ' + (QR_MAX_TRIES - tries) + '.' }, 403);
        }
        const done = await env.DB.prepare('UPDATE qr_login SET user_id=? WHERE code=? AND user_id IS NULL').bind(user.id, code).run();
        if (!(done && done.meta && done.meta.changes)) return reply({ error: 'Этот код уже использован.' }, 409);
        return reply({ ok: true, username: user.username });
      }

      /* шаг 3: устройство, показавшее QR, опрашивает сервер и забирает вход (один раз).
         Секрет передаётся в теле POST-запроса, а не в адресе, чтобы он не попал в журналы */
      if (url.pathname === '/api/qr/poll' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const secret = String(body.secret || '');
        const row = code ? await env.DB.prepare('SELECT * FROM qr_login WHERE code=?').bind(code).first() : null;
        if (!row || row.expires < Date.now()) return reply({ status: 'expired' });
        if (!safeEq(hex(await crypto.subtle.digest('SHA-256', enc.encode(secret))), row.secret_hash)) return reply({ error: 'Неверный секрет.' }, 403);
        if (!row.user_id) return reply({ status: 'pending' });
        await env.DB.prepare('DELETE FROM qr_login WHERE code=?').bind(code).run();
        const user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(row.user_id).first();
        if (!user) return reply({ status: 'expired' });
        const token = await sign({ sub: user.id, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }, secretOf(env));
        return reply({ status: 'ok', token, ...(await account(env, user)) });
      }

      /* удаление аккаунта: стираем игрока и его временные коды входа */
      if (url.pathname === '/api/delete' && request.method === 'POST') {
        const user = await userFrom(request, env);
        if (!user) return reply({ error: 'Нужно войти в аккаунт.' }, 401);
        await env.DB.prepare('DELETE FROM qr_login WHERE user_id=?').bind(user.id).run();
        await env.DB.prepare('DELETE FROM users WHERE id=?').bind(user.id).run();
        return reply({ ok: true });
      }

      /* профиль текущего игрока */
      if (url.pathname === '/api/me' && request.method === 'GET') {
        const user = await userFrom(request, env);
        if (!user) return reply({ error: 'Нужно войти в аккаунт.' }, 401);
        return reply(await account(env, user));
      }

      /* синхронизация прогресса */
      if (url.pathname === '/api/sync' && request.method === 'POST') {
        const user = await userFrom(request, env);
        if (!user) return reply({ error: 'Нужно войти в аккаунт.' }, 401);

        const body = await request.json();
        const profile = JSON.stringify(body.profile || {});
        const data = JSON.stringify(body.data || {});
        if (profile.length > 300000) return reply({ error: 'Слишком большой профиль (уменьши фото).' }, 413);
        if (data.length > 100000) return reply({ error: 'Слишком много данных прогресса.' }, 413);

        if (!await allow(env, 'sy:' + user.id, 60, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
        // Защита от накрутки рейтинга: слов не может прибавиться быстрее, чем их реально набрать,
        // а очков не может быть сильно больше, чем слов. Полностью подделку исключить нельзя, но грубые обманы отсекаются.
        const now = Date.now(), last = Date.parse(user.updated_at) || now, oldWords = user.total_words || 0;
        const allowance = oldWords === 0 ? 50000 : 20 + Math.ceil((now - last) / 60000) * 150;
        const totalWords = Math.min(num(body.totalWords), oldWords + allowance);
        const bestScore = Math.min(num(body.bestScore), Math.max(2000, totalWords * 1000));
        const privacy = JSON.stringify(cleanPrivacy(body.privacy || parse(user.privacy_json, {})));

        await env.DB.prepare(
          'UPDATE users SET profile_json=?, data_json=?, privacy_json=?, best_score=MAX(best_score,?), total_words=MAX(total_words,?), updated_at=? WHERE id=?'
        ).bind(profile, data, privacy, bestScore, totalWords, new Date().toISOString(), user.id).run();

        const updated = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
        return reply({ ok: true, ...(await account(env, updated)) });
      }

      /* публичный профиль: /api/player?q=ник или SP-код */
      if (url.pathname === '/api/player' && request.method === 'GET') {
        const q = String(url.searchParams.get('q') || '').trim();
        if (!q) return reply({ error: 'Укажи ник или код.' }, 400);
        const row = await env.DB.prepare('SELECT * FROM users WHERE sp_code=? OR username=? COLLATE NOCASE LIMIT 1')
          .bind(q.toUpperCase(), q).first();
        if (!row) return reply({ error: 'Игрок не найден.' }, 404);
        const pv = cleanPrivacy(parse(row.privacy_json, {}));
        const pf = (parse(row.profile_json, {}).pf) || {};
        const out = { username: row.username, spCode: await ensureCode(env, row), avatar: pf.a || '' };
        if (pv.rank) out.totalWords = row.total_words || 0;
        if (pv.records) out.bestScore = row.best_score || 0;
        if (pv.ach) out.achievements = Object.keys(parse(row.data_json, {}).ach || {}).length;
        if (pv.stats) out.stats = { games: pf.g || 0, hits: pf.h || 0, misses: pf.m || 0, combo: pf.c || 0 };
        return reply(out);
      }

      /* рейтинг */
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          'SELECT username,best_score AS bestScore,total_words AS totalWords,privacy_json FROM users WHERE best_score>0 ORDER BY best_score DESC,total_words DESC,username ASC LIMIT 50'
        ).all();
        return reply({ items: (rows.results || []).map(r => {
          const pv = cleanPrivacy(parse(r.privacy_json, {}));
          return { username: r.username, bestScore: pv.records ? r.bestScore : 0, totalWords: pv.rank ? r.totalWords : 0 };
        }) });
      }

      return reply({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('server error', error);
      return reply({ error: 'Ошибка сервера. Попробуй позже.' }, 500);
    }
  }
};
