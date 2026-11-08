// СЛОВОПАД · Slovopad ID server (Cloudflare Worker + D1)
// Аккаунты, синхронизация прогресса, публичные профили, рейтинг.

const enc = new TextEncoder();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRIVACY_KEYS = ['rank', 'records', 'ach', 'stats', 'online'];

const b64 = bytes => {
  let s = '';
  new Uint8Array(bytes).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = v => Uint8Array.from(atob(v.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const random = n => crypto.getRandomValues(new Uint8Array(n));
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');

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
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations: 180000, hash: 'SHA-256' }, key, 256));
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
  for (const [name, def] of Object.entries(add)) {
    if (!have.has(name)) await env.DB.prepare('ALTER TABLE users ADD COLUMN ' + name + ' ' + def).run();
  }
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS users_spcode_idx ON users(sp_code)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS users_leaderboard_idx ON users(best_score DESC, total_words DESC, username ASC)').run();
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
        return reply({ ok: true, service: 'slovopad-id', version: 2, secret: !!secretOf(env), db: !!env.DB });
      }
      if (!env.DB) return reply({ error: 'К серверу не привязана база данных (binding DB).' }, 500);
      if (!secretOf(env)) return reply({ error: 'На сервере не задан секрет JWT_SECRET.' }, 500);
      await ensureSchema(env);

      /* регистрация и вход */
      if (request.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
        const body = await request.json();
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(username) || password.length < 8 || password.length > 128) {
          return reply({ error: 'Ник: 3–20 символов (буквы, цифры, _ . -). Пароль: 8–128 символов.' }, 400);
        }

        let user;
        if (url.pathname === '/api/register') {
          const salt = b64(random(16));
          const hash = await passwordHash(password, salt);
          const id = crypto.randomUUID();
          try {
            await env.DB.prepare('INSERT INTO users (id,username,salt,password_hash,updated_at) VALUES (?,?,?,?,?)')
              .bind(id, username, salt, hash, new Date().toISOString()).run();
          } catch (e) {
            if (/UNIQUE/i.test(String(e && e.message))) return reply({ error: 'Этот ник уже занят.' }, 409);
            return reply({ error: 'Ошибка базы: ' + String(e && e.message).slice(0, 160) }, 500);
          }
          user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
        } else {
          user = await env.DB.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').bind(username).first();
          if (!user || await passwordHash(password, user.salt) !== user.password_hash) {
            return reply({ error: 'Неверный ник или пароль.' }, 401);
          }
        }

        const token = await sign({ sub: user.id, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }, secretOf(env));
        return reply({ token, ...(await account(env, user)) });
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

        const bestScore = Math.max(0, Math.min(100000000, Number(body.bestScore) || 0));
        const totalWords = Math.max(0, Math.min(100000000, Number(body.totalWords) || 0));
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
      return reply({ error: 'Ошибка сервера: ' + String(error && error.message || error).slice(0, 160) }, 500);
    }
  }
};
