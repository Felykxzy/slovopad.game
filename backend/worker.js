// СЛОВОПАД · Slovopad ID server (Cloudflare Worker + D1)
// Аккаунты, синхронизация прогресса, публичные профили, рейтинг.

const enc = new TextEncoder();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QR_TTL_MS = 3 * 60 * 1000;   // код для входа по QR живёт 3 минуты
const PRIVACY_KEYS = ['rank', 'records', 'ach', 'stats', 'online'];
const QR_MAX_TRIES = 3;               // сколько раз можно ошибиться в числе на телефоне
const QR_PER_IP = 5;                  // сколько живых QR-кодов может быть у одного адреса
const QR_TOTAL = 500;                 // и сколько всего на сервере
const MAX_PTS_PER_WORD = 150;
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
    data_json: 'TEXT NOT NULL DEFAULT \'{}\'',
    seen: 'INTEGER NOT NULL DEFAULT 0'
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
  // друзья и вызовы: сбой здесь не должен ломать остальную игру
  try {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sp_friends (a TEXT NOT NULL, b TEXT NOT NULL, state TEXT NOT NULL DEFAULT \'pending\', t INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (a,b))').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS sp_friends_b_idx ON sp_friends(b,state)').run();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sp_challenges (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, theme TEXT NOT NULL, lang INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL, t INTEGER NOT NULL, state TEXT NOT NULL DEFAULT \'open\', result INTEGER NOT NULL DEFAULT 0)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS sp_challenges_to_idx ON sp_challenges(to_id,state)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS sp_challenges_from_idx ON sp_challenges(from_id)').run();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sp_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, a TEXT NOT NULL, b TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, t INTEGER NOT NULL, rd INTEGER NOT NULL DEFAULT 0)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS sp_msgs_ab_idx ON sp_msgs(a,b,id)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS sp_msgs_b_idx ON sp_msgs(b,rd)').run();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sp_blocks (a TEXT NOT NULL, b TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (a,b))').run();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sp_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter TEXT NOT NULL, target TEXT NOT NULL, body TEXT NOT NULL, t INTEGER NOT NULL)').run();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sp_rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, t INTEGER NOT NULL)').run();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sp_room_members (room TEXT NOT NULL, uid TEXT NOT NULL, t INTEGER NOT NULL, last INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (room,uid))').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS sp_room_members_u_idx ON sp_room_members(uid)').run();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sp_room_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, uid TEXT NOT NULL, body TEXT NOT NULL, t INTEGER NOT NULL)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS sp_room_msgs_r_idx ON sp_room_msgs(room,id)').run();
    // голосовой звонок в комнате: кто в звонке и короткоживущие сигналы связи между участниками
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sp_call_part (room TEXT NOT NULL, name TEXT NOT NULL, j INTEGER NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (room,name))').run();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sp_call_sig (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, frm TEXT NOT NULL, too TEXT NOT NULL, body TEXT NOT NULL, t INTEGER NOT NULL)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS sp_call_sig_idx ON sp_call_sig(room,too,id)').run();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sp_tg (uid TEXT PRIMARY KEY, chat TEXT NOT NULL, t INTEGER NOT NULL)').run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS sp_bans (uid TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT '', t INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS sp_grants (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, kind TEXT NOT NULL, val TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', t INTEGER NOT NULL)").run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS sp_grants_u_idx ON sp_grants(uid)').run();
  } catch (e) { console.error('friends schema', e); }
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
// только подсчёт, без записи: нужен для лимитов, которые считаются по неудачным попыткам
async function countHits(env, key, windowMs) {
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_limit WHERE k=? AND t>?').bind(key, Date.now() - windowMs).first();
    return row ? row.n : 0;
  } catch (_) { return 0; }
}
async function recordHit(env, key) {
  try { await env.DB.prepare('INSERT INTO rate_limit (k,t) VALUES (?,?)').bind(key, Date.now()).run(); } catch (_) {}
}
const TOO_MANY = { error: 'Слишком много попыток. Подожди несколько минут.' };
async function ipHash(request, env) {
  let ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  if (ip.includes(':')) ip = ip.split(':').slice(0, 4).join(':'); // IPv6: считаем всю подсеть /64 одним клиентом
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(ip + ':' + secretOf(env)))).slice(0, 16);
}
const num = v => Math.max(0, Math.min(100000000, Number(v) || 0));

/* ---------- Эхо: комнаты и уведомления в Telegram ---------- */
const CALL_MAX = 4, CALL_STALE = 25 * 1000, CALL_SIG_MAX = 12000;
const ROOM_MAX_MEMBERS = 20, ROOM_MAX_JOINED = 15, ROOM_KEEP = 100, ROOM_NAME_MAX = 24;
const cleanText = (v, max) => {
  const t = String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return [...t].length > max ? null : t;
};
// проверка данных мини-приложения Telegram (initData) подписью токена бота игры
async function tgCheck(initData, token) {
  try {
    const sp = new URLSearchParams(String(initData || ''));
    const hash = sp.get('hash'); if (!hash || !token) return null;
    sp.delete('hash');
    const str = [...sp.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([k, v]) => k + '=' + v).join('\n');
    const k1 = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const secret = await crypto.subtle.sign('HMAC', k1, enc.encode(token));
    const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = hex(await crypto.subtle.sign('HMAC', k2, enc.encode(str)));
    if (sig !== hash) return null;
    if (Date.now() / 1000 - Number(sp.get('auth_date') || 0) > 86400) return null;
    const u = JSON.parse(sp.get('user') || '{}');
    return u && u.id ? String(u.id) : null;
  } catch (_) { return null; }
}
// уведомление в Telegram без текста сообщений; не чаще 6 за 10 минут на игрока
// адреса серверов связи для звонка: Cloudflare TURN (если ключи заданы) или только бесплатный STUN
async function iceServers(env) {
  const stun = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
  try {
    if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return { servers: stun, turn: false };
    const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(env.TURN_KEY_ID) + '/credentials/generate-ice-servers', {
      method: 'POST', headers: { authorization: 'Bearer ' + env.TURN_KEY_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: 6 * 3600 }),
    });
    if (!r.ok) return { servers: stun, turn: false };
    const d = await r.json();
    const list = Array.isArray(d && d.iceServers) ? d.iceServers : (d && d.iceServers ? [d.iceServers] : []);
    return list.length ? { servers: list, turn: true } : { servers: stun, turn: false };
  } catch (_) { return { servers: stun, turn: false }; }
}
async function notify(env, uid, text) {
  try {
    if (!env.GAME_BOT_TOKEN) return;
    const row = await env.DB.prepare('SELECT chat FROM sp_tg WHERE uid=?').bind(uid).first();
    if (!row) return;
    if (!await allow(env, 'tn:' + uid, 6, 10 * 60 * 1000)) return;
    await fetch('https://api.telegram.org/bot' + env.GAME_BOT_TOKEN + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: row.chat, text, disable_notification: false }),
    });
  } catch (_) {}
}
const push = (ctx, p) => { try { ctx && ctx.waitUntil ? ctx.waitUntil(p) : p.catch(() => {}); } catch (_) {} };

/* ---------- Друзья и вызовы ---------- */
const FR_MAX = 100, FR_IN_MAX = 50, FR_OUT_MAX = 30;       // друзей, ожидающих входящих, ожидающих исходящих
const ONLINE_MS = 150 * 1000;                              // «в сети», если был активен в последние 2,5 минуты
const CH_TTL = 7 * 24 * 3600 * 1000;                       // вызов живёт неделю
const CH_OPEN_PER_FRIEND = 5;
const MSG_MAX = 120, MSG_KEEP = 50;                         // длина сообщения и сколько последних хранить для пары друзей
const REACTS = ['🔥', '👏', '😂', '😎', '💪', '🎯', '❤️', '👋', '🤯', '🥳'];
const findUser = (env, q) => {
  q = String(q || '').trim().slice(0, 40);
  return q ? env.DB.prepare('SELECT * FROM users WHERE sp_code=? OR username=? COLLATE NOCASE ORDER BY (sp_code=?) DESC LIMIT 1').bind(q.toUpperCase(), q, q.toUpperCase()).first() : null;
};
const relation = (env, x, y) => env.DB.prepare('SELECT a,b,state FROM sp_friends WHERE (a=? AND b=?) OR (a=? AND b=?) LIMIT 1').bind(x, y, y, x).first();
// короткие данные игроков по id (без тяжёлого фото из профиля), пачками из-за лимита параметров
async function usersByIds(env, ids) {
  const out = new Map(), list = [...new Set(ids)];
  for (let i = 0; i < list.length; i += 80) {
    const part = list.slice(i, i + 80);
    const rows = await env.DB.prepare('SELECT id,username,sp_code,privacy_json,best_score,total_words,seen,json_extract(profile_json,\'$.pf.a\') AS av FROM users WHERE id IN (' + part.map(() => '?').join(',') + ')').bind(...part).all();
    for (const r of (rows.results || [])) out.set(r.id, r);
  }
  return out;
}
// то, что можно показать другим: цифры и статус только если игрок их не скрыл
async function pubInfo(env, r, now) {
  const pv = cleanPrivacy(parse(r.privacy_json, {}));
  const code = r.sp_code || await ensureCode(env, { id: r.id, sp_code: r.sp_code });
  const seen = pv.online ? (r.seen || 0) : 0;
  return { username: r.username, spCode: code, avatar: typeof r.av === 'string' ? r.av : '',
    online: !!seen && seen > now - ONLINE_MS, seen,
    bestScore: pv.records ? r.best_score || 0 : null, totalWords: pv.rank ? r.total_words || 0 : null };
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
  const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(data.sub).first();
  if (u) { try { if (await env.DB.prepare('SELECT 1 AS x FROM sp_bans WHERE uid=?').bind(u.id).first()) return null; } catch (_) {} }   // заблокированный игрок считается вышедшим
  return u;
}

/* ---------- Режим техработ (включается из панели управления страницы управления) ---------- */
const settingsReady = new WeakSet();
async function ensureSettings(env) {
  if (settingsReady.has(env.DB)) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL DEFAULT '')").run();
  settingsReady.add(env.DB);
}
async function settings(env) {
  await ensureSettings(env);
  const m = {};
  for (const r of ((await env.DB.prepare('SELECT k,v FROM settings').all()).results || [])) m[r.k] = r.v;
  return { off: m.off === '1', msg: m.msg || '', epoch: Number(m.epoch) || 0, since: Number(m.since) || 0, news: m.news || '', newsId: Number(m.newsId) || 0 };
}
async function setSetting(env, k, v) {
  await ensureSettings(env);
  await env.DB.prepare('INSERT INTO settings (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, String(v)).run();
}
const publicState = s => ({ off: s.off, msg: s.msg, epoch: s.epoch, since: s.since, news: s.news ? { id: s.newsId, text: s.news } : null });

/* ---------- Страница управления: отдаётся только по секретному адресу ---------- */
const CONSOLE_PAGE = String.raw`<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#05060f">
<title>·</title>
<style>
:root{--ac:#5ef2ff;--mg:#ff4fd8;--ink:#e8ecff;--dim:rgba(232,236,255,.58);--ok:#6dffb0;--bad:#ff6b8a;--warn:#ffd166;--card:rgba(255,255,255,.055);--line:rgba(255,255,255,.12);--sat:env(safe-area-inset-top,0px);--sab:env(safe-area-inset-bottom,0px)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0}
body{min-height:100vh;background:radial-gradient(900px 520px at 50% -8%,#1c2152,#070918 62%,#05060f);color:var(--ink);font-family:-apple-system,system-ui,"Segoe UI",Roboto,sans-serif;font-size:15px}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(40% 30% at 90% 85%,rgba(255,79,216,.12),transparent 70%),radial-gradient(36% 26% at 8% 40%,rgba(94,242,255,.08),transparent 70%)}
#app{position:relative;max-width:760px;margin:0 auto;padding:calc(14px + var(--sat)) 14px calc(86px + var(--sab));display:flex;flex-direction:column;gap:14px}
[hidden]{display:none!important}
button{font:inherit;color:var(--ink);cursor:pointer}
input,select,textarea{font:inherit;color:var(--ink);width:100%;border-radius:14px;border:1px solid rgba(94,242,255,.28);background:rgba(0,0,0,.35);padding:12px 14px;outline:none;font-size:16px}
input:focus,select:focus,textarea:focus{border-color:var(--ac);box-shadow:0 0 0 3px rgba(94,242,255,.12)}
select option{color:#111}
textarea{resize:none;height:88px;font-size:15px}
/* вход */
#login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.lg{width:100%;max-width:380px;display:flex;flex-direction:column;gap:14px;align-items:stretch}
.orb{width:84px;height:84px;margin:0 auto 4px;border-radius:26px;transform:rotate(45deg);background:linear-gradient(135deg,var(--ac),var(--mg));box-shadow:0 0 40px rgba(94,242,255,.45),0 0 80px rgba(255,79,216,.25),inset 0 2px 8px rgba(255,255,255,.5);animation:pulse 3s ease-in-out infinite}
@keyframes pulse{50%{box-shadow:0 0 52px rgba(255,79,216,.5),0 0 90px rgba(94,242,255,.3),inset 0 2px 8px rgba(255,255,255,.5)}}
h1{margin:6px 0 0;font-size:19px;letter-spacing:.26em;font-weight:800;text-align:center}
.sub{font-size:11px;letter-spacing:.16em;color:var(--dim);text-align:center;margin-top:-6px}
.ck{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--dim)}.ck input{width:auto}
/* кнопки */
.btn{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.09);border-radius:14px;padding:13px 16px;font-weight:800;font-size:13px;letter-spacing:.1em;transition:transform .12s,background .2s}
.btn:active{transform:scale(.97)}.btn:disabled{opacity:.4;cursor:default}
.btn.p{background:linear-gradient(135deg,rgba(94,242,255,.32),rgba(255,79,216,.24));border-color:rgba(94,242,255,.5)}
.btn.ok{background:rgba(109,255,176,.15);border-color:var(--ok);color:var(--ok)}
.btn.bad{background:rgba(255,107,138,.16);border-color:var(--bad);color:var(--bad)}
.btn.warn{background:rgba(255,209,102,.13);border-color:var(--warn);color:var(--warn)}
.btn.s{padding:9px 12px;font-size:11px;border-radius:12px}
.row{display:flex;gap:8px;align-items:center}.row>*{flex:1;min-width:0}.row>.btn{flex:none}.row.w{flex-wrap:wrap}.row.w>.btn{flex:1 1 auto}
/* шапка */
.top{display:flex;align-items:center;gap:12px}
.top h2{margin:0;font-size:16px;letter-spacing:.22em;font-weight:800;flex:1}
.pill{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:11px;letter-spacing:.12em;font-weight:800}
.dot{width:10px;height:10px;border-radius:50%;background:#666}.pill.run .dot{background:var(--ok);box-shadow:0 0 10px var(--ok)}.pill.stop .dot{background:var(--bad);box-shadow:0 0 10px var(--bad)}
/* карточки */
.card{border-radius:20px;padding:16px;background:var(--card);border:1px solid var(--line);display:flex;flex-direction:column;gap:12px}
.card h3{margin:0;font-size:12px;letter-spacing:.2em;color:var(--dim);font-weight:800}
.hint{font-size:12px;line-height:1.55;color:var(--dim)}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
@media(min-width:560px){.grid{grid-template-columns:repeat(3,1fr)}}
.stat{border-radius:18px;padding:14px;background:var(--card);border:1px solid var(--line);display:flex;flex-direction:column;gap:4px;animation:up .4s both}
.stat b{font-size:26px;letter-spacing:.02em}.stat span{font-size:10px;letter-spacing:.16em;color:var(--dim)}
.stat.a b{color:var(--ac)}.stat.m b{color:var(--mg)}.stat.g b{color:var(--ok)}.stat.r b{color:var(--bad)}
@keyframes up{from{opacity:0;transform:translateY(10px)}}
/* список игроков */
.list{display:flex;flex-direction:column;gap:8px}
.item{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:16px;background:var(--card);border:1px solid var(--line);text-align:left;width:100%;animation:up .3s both}
.item:active{background:rgba(255,255,255,.1)}
.av{flex:none;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;border:1px solid rgba(255,255,255,.3);text-shadow:0 1px 2px rgba(0,0,0,.4)}
.mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.mid b{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mid span{font-size:12px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tag{font-size:10px;letter-spacing:.12em;padding:3px 8px;border-radius:999px;border:1px solid var(--bad);color:var(--bad);font-weight:800;flex:none}
.sc{flex:none;text-align:right;font-size:12px;color:var(--dim)}.sc b{display:block;font-size:15px;color:var(--ac)}
.empty{text-align:center;color:var(--dim);padding:24px 10px;font-size:13px}
/* окно игрока */
#sheet{position:fixed;inset:0;z-index:20;background:rgba(3,4,12,.72);display:flex;align-items:flex-end;justify-content:center;animation:fade .2s both}
@keyframes fade{from{opacity:0}}
.pan{width:100%;max-width:560px;max-height:92vh;overflow-y:auto;background:linear-gradient(180deg,#141842,#0a0c24);border:1px solid rgba(94,242,255,.3);border-bottom:0;border-radius:26px 26px 0 0;padding:18px 16px calc(20px + var(--sab));display:flex;flex-direction:column;gap:14px;animation:slide .28s cubic-bezier(.2,.8,.3,1) both}
@keyframes slide{from{transform:translateY(40px);opacity:0}}
.ph{display:flex;align-items:center;gap:14px}.ph .av{width:56px;height:56px;font-size:24px}
.ph h3{margin:0;font-size:19px;letter-spacing:.06em;color:var(--ink)}.ph .hint{margin-top:2px}
.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.kv div{border-radius:14px;background:rgba(255,255,255,.06);padding:10px;text-align:center}
.kv b{display:block;font-size:17px}.kv span{font-size:9px;letter-spacing:.14em;color:var(--dim)}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{font-size:11px;padding:4px 9px;border-radius:999px;background:rgba(94,242,255,.1);border:1px solid rgba(94,242,255,.25)}
.sec{display:flex;flex-direction:column;gap:8px;padding-top:6px;border-top:1px solid var(--line)}
.sec>label{font-size:10px;letter-spacing:.18em;color:var(--dim);font-weight:800}
/* диалог */
#dlg{position:fixed;inset:0;z-index:40;background:rgba(3,4,12,.8);display:flex;align-items:center;justify-content:center;padding:20px;animation:fade .15s both}
.dbox{width:100%;max-width:360px;background:#10143a;border:1px solid rgba(94,242,255,.35);border-radius:22px;padding:18px;display:flex;flex-direction:column;gap:12px;animation:slide .2s both}
.dbox p{margin:0;line-height:1.5;font-size:14px;white-space:pre-line}
/* нижняя панель */
nav{position:fixed;left:0;right:0;bottom:0;z-index:10;display:flex;justify-content:center;padding:8px 10px calc(8px + var(--sab));background:linear-gradient(180deg,transparent,rgba(5,6,15,.92) 30%)}
.tabs{display:flex;gap:4px;width:100%;max-width:560px;padding:5px;border-radius:22px;background:rgba(18,22,58,.9);border:1px solid var(--line);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.tab{position:relative;flex:1;border:0;border-radius:17px;background:transparent;padding:9px 2px 7px;display:flex;flex-direction:column;align-items:center;gap:3px;color:var(--dim);font-size:10px;letter-spacing:.06em;font-weight:700;transition:background .2s,color .2s}
.tab i{font-style:normal;font-size:19px;line-height:1}
.tab.on{color:var(--ink);background:linear-gradient(135deg,rgba(94,242,255,.28),rgba(255,79,216,.2));box-shadow:inset 0 1px 1px rgba(255,255,255,.25)}
.tab em{position:absolute;top:2px;right:14%;min-width:17px;height:17px;border-radius:9px;background:var(--mg);color:#fff;font-style:normal;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 4px}
#toast{position:fixed;left:50%;bottom:calc(92px + var(--sab));transform:translateX(-50%);z-index:50;max-width:90%;padding:11px 16px;border-radius:14px;font-size:13px;font-weight:700;background:#15193f;border:1px solid var(--ac);box-shadow:0 8px 30px rgba(0,0,0,.5);animation:up .25s both}
#toast.er{border-color:var(--bad);color:var(--bad)}#toast.ok{border-color:var(--ok);color:var(--ok)}
.view{display:flex;flex-direction:column;gap:14px;animation:up .3s both}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body>

<div id="login"><div class="lg">
  <div class="orb"></div>
  <h1>УПРАВЛЕНИЕ</h1><div class="sub">ТОЛЬКО ДЛЯ ВЛАДЕЛЬЦА</div>
  <input id="tok" type="password" autocomplete="current-password" placeholder="Секретный токен">
  <label class="ck"><input type="checkbox" id="rem"> запомнить на этом устройстве</label>
  <button id="go" class="btn p">ВОЙТИ</button>
</div></div>

<div id="app" hidden>
  <div class="top"><h2 id="ttl">ОБЗОР</h2><div class="pill run" id="pill"><span class="dot"></span><span id="pillT">…</span></div><button class="btn s" id="out">ВЫЙТИ</button></div>
  <div id="view"></div>
</div>

<nav id="nav" hidden><div class="tabs" id="tabs"></div></nav>
<div id="sheet" hidden></div><div id="dlg" hidden></div><div id="toast" hidden></div>

<script>
var API = "/api/ctl", KEY = "slovopadCtlKey";
var $ = function (id) { return document.getElementById(id); };
var token = "", tab = "ov", state = {}, catalog = [], pq = "", poff = 0, busy = false, poll = 0, repN = 0, cache = {};
try { token = localStorage.getItem(KEY) || ""; } catch (e) {}

function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
function btn(cls, text, fn) { var b = h("button", "btn " + cls, text); b.type = "button"; b.onclick = fn; return b; }
function hue(s) { var x = 0; s = String(s); for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 360; return x; }
function av(name, big) { var a = h("div", "av", String(name || "?").charAt(0).toUpperCase()); a.style.background = "linear-gradient(135deg,hsl(" + hue(name) + " 85% 58%),hsl(" + ((hue(name) + 55) % 360) + " 80% 42%))"; return a; }
function ago(iso) {
  var t = Date.parse(iso); if (!t) return "—"; var s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return "только что"; if (s < 3600) return Math.round(s / 60) + " мин назад"; if (s < 86400) return Math.round(s / 3600) + " ч назад";
  return Math.round(s / 86400) + " дн назад";
}
function fmt(n) { return Number(n || 0).toLocaleString("ru-RU"); }
function nameOf(id) { for (var i = 0; i < catalog.length; i++) if (catalog[i][0] === id) return (id.charAt(0) === "b" ? "фон " : "щит ") + catalog[i][1]; return id; }

var toastT = 0;
function say(t, k) { var e = $("toast"); e.textContent = t; e.className = k || ""; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { e.hidden = true; }, 3200); }

// собственный диалог: подтверждение или ввод
function ask(text, opt) {
  opt = opt || {};
  return new Promise(function (res) {
    var d = $("dlg"), box = h("div", "dbox"), inp = null;
    d.textContent = ""; box.appendChild(h("p", "", text));
    if (opt.input !== undefined) { inp = h("input"); inp.type = opt.type || "text"; inp.value = opt.input || ""; inp.placeholder = opt.ph || ""; if (opt.max) inp.maxLength = opt.max; box.appendChild(inp); }
    var r = h("div", "row");
    function done(v) { d.hidden = true; d.textContent = ""; res(v); }
    r.appendChild(btn("", "ОТМЕНА", function () { done(null); }));
    r.appendChild(btn(opt.danger ? "bad" : "p", opt.ok || "ОК", function () { done(inp ? inp.value : true); }));
    box.appendChild(r); d.appendChild(box); d.hidden = false;
    d.onclick = function (e) { if (e.target === d) done(null); };
    if (inp) { inp.onkeydown = function (e) { if (e.key === "Enter") done(inp.value); }; setTimeout(function () { inp.focus(); }, 50); }
  });
}

async function call(action, extra) {
  var r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ token: token, action: action }, extra || {})) });
  var d = {}; try { d = await r.json(); } catch (e) {}
  if (!r.ok) { var er = new Error(d.error || ("Ошибка " + r.status)); er.status = r.status; throw er; }
  return d;
}
async function act(action, extra, okText) {
  if (busy) return null; busy = true;
  try { var d = await call(action, extra); if (okText) say(okText, "ok"); return d; }
  catch (e) { if (e.status === 404 && /Неверн|Not found/.test(e.message) || e.status === 429) { say(e.status === 429 ? "Слишком много попыток, подожди." : "Токен не подошёл.", "er"); if (e.status === 404) logout(); } else say(e instanceof TypeError ? "Нет связи с сервером." : e.message, "er"); return null; }
  finally { busy = false; }
}

/* ---------- состояние игры ---------- */
function drawPill() {
  var off = !!state.off, p = $("pill"); p.className = "pill " + (off ? "stop" : "run"); $("pillT").textContent = off ? "ВЫКЛЮЧЕНА" : "РАБОТАЕТ";
}

/* ---------- вкладки ---------- */
var TABS = [["ov", "📊", "Обзор"], ["pl", "👥", "Игроки"], ["gv", "🎁", "Выдача"], ["gm", "🎮", "Игра"], ["rp", "🚩", "Жалобы"]];
function drawTabs() {
  var t = $("tabs"); t.textContent = "";
  TABS.forEach(function (x) {
    var b = h("button", "tab" + (tab === x[0] ? " on" : "")); b.type = "button"; b.appendChild(h("i", "", x[1])); b.appendChild(document.createTextNode(x[2]));
    if (x[0] === "rp" && repN) b.appendChild(h("em", "", repN > 9 ? "9+" : String(repN)));
    b.onclick = function () { go(x[0]); }; t.appendChild(b);
  });
  $("ttl").textContent = TABS.filter(function (x) { return x[0] === tab; })[0][2].toUpperCase();
}
function go(t) { tab = t; drawTabs(); render(); window.scrollTo(0, 0); }
function render() {
  var v = $("view"); v.textContent = ""; var box = h("div", "view"); v.appendChild(box);
  ({ ov: vOverview, pl: vPlayers, gv: vGive, gm: vGame, rp: vReports })[tab](box);
}

/* ---------- обзор ---------- */
async function vOverview(box) {
  var d = await act("overview"); if (!d) return; state = d.state; drawPill();
  var g = h("div", "grid"), cards = [
    ["Игроков", d.users, "a"], ["Сейчас в игре", d.now5, "g"], ["За сутки", d.day, ""], ["За неделю", d.week, ""],
    ["Пар друзей", d.pairs, "m"], ["Сообщений за сутки", d.msgs, ""], ["Комнат", d.rooms, ""], ["Слов набрано", d.words, "a"],
    ["Жалоб", d.reports, d.reports ? "r" : ""], ["Заблокировано", d.banned, d.banned ? "r" : ""], ["Подарков в пути", d.pending, ""]
  ];
  cards.forEach(function (c, i) { var s = h("div", "stat " + c[2]); s.style.animationDelay = (i * 30) + "ms"; s.appendChild(h("b", "", fmt(c[1]))); s.appendChild(h("span", "", c[0].toUpperCase())); g.appendChild(s); });
  box.appendChild(g);
  var top = h("div", "card"); top.appendChild(h("h3", "", "ТОП ИГРОКОВ"));
  if (!d.top.length) top.appendChild(h("div", "empty", "Пока никого."));
  d.top.forEach(function (p, i) { var r = h("div", "row"); r.appendChild(h("span", "", (i + 1) + ". " + p.username)); var b = h("b", "", fmt(p.s)); b.style.flex = "none"; b.style.color = "var(--ac)"; r.appendChild(b); top.appendChild(r); });
  box.appendChild(top);
  repN = d.reports; drawTabs();
  box.appendChild(btn("", "↻ ОБНОВИТЬ", function () { render(); }));
}

/* ---------- игроки ---------- */
function vPlayers(box) {
  var s = h("input"); s.type = "search"; s.placeholder = "Поиск по нику или коду SP-…"; s.value = pq; box.appendChild(s);
  var list = h("div", "list"); box.appendChild(list); var more = btn("", "ПОКАЗАТЬ ЕЩЁ", function () { load(false); }); more.hidden = true; box.appendChild(more);
  var tm = 0;
  s.oninput = function () { clearTimeout(tm); tm = setTimeout(function () { pq = s.value.trim(); load(true); }, 350); };
  async function load(reset) {
    if (reset) { poff = 0; list.textContent = ""; }
    var d = await act("players", { q: pq, offset: poff }); if (!d) return;
    if (reset && !d.players.length) list.appendChild(h("div", "empty", "Никого не найдено."));
    d.players.forEach(function (p, i) {
      var it = h("button", "item"); it.type = "button"; it.style.animationDelay = (i * 25) + "ms"; it.appendChild(av(p.username));
      var mid = h("div", "mid"); mid.appendChild(h("b", "", p.username)); mid.appendChild(h("span", "", (p.code || "") + " · " + ago(p.seen) + " · ✨ " + fmt(p.co))); it.appendChild(mid);
      if (p.banned) it.appendChild(h("span", "tag", "БАН"));
      var sc = h("div", "sc"); sc.appendChild(h("b", "", fmt(p.best))); sc.appendChild(document.createTextNode("рекорд")); it.appendChild(sc);
      it.onclick = function () { openPlayer(p.id); }; list.appendChild(it);
    });
    poff += d.players.length; more.hidden = !d.more;
  }
  load(true);
}

async function itemsSelect(withAll) {
  if (!catalog.length) { var c = await call("catalog"); catalog = c.items; }
  var sel = h("select");
  if (withAll) { var o0 = h("option", "", "🎁 Все фоны и щиты"); o0.value = "all"; sel.appendChild(o0); }
  var g1 = h("optgroup"); g1.label = "Фоны"; var g2 = h("optgroup"); g2.label = "Щиты";
  catalog.forEach(function (c) { var o = h("option", "", c[1] + " · " + c[2] + " ✨"); o.value = c[0]; (c[0].charAt(0) === "b" ? g1 : g2).appendChild(o); });
  sel.appendChild(g1); sel.appendChild(g2); return sel;
}

async function openPlayer(id) {
  if (!catalog.length) { try { catalog = (await call("catalog")).items; } catch (e) {} }
  var d = await act("player", { id: id }); if (!d) return;
  var sh = $("sheet"); sh.textContent = ""; sh.hidden = false; document.body.style.overflow = "hidden";
  sh.onclick = function (e) { if (e.target === sh) closeSheet(); };
  var pan = h("div", "pan"); sh.appendChild(pan);
  var ph = h("div", "ph"); ph.appendChild(av(d.username)); var w = h("div"); w.appendChild(h("h3", "", d.username)); w.appendChild(h("div", "hint", d.code + " · был(а) " + ago(d.seen))); ph.appendChild(w); pan.appendChild(ph);
  if (d.ban) { var bn = h("div", "card"); bn.style.borderColor = "var(--bad)"; bn.appendChild(h("b", "", "⛔ ЗАБЛОКИРОВАН")); bn.appendChild(h("div", "hint", d.ban.reason || "без причины")); pan.appendChild(bn); }
  var kv = h("div", "kv"); [["РЕКОРД", d.best], ["СЛОВ", d.words], ["МОНЕТ ✨", d.coins], ["ДРУЗЕЙ", d.friends], ["КОМНАТ", d.rooms], ["ЖАЛОБ", d.reports]].forEach(function (x) { var c = h("div"); c.appendChild(h("b", "", fmt(x[1]))); c.appendChild(h("span", "", x[0])); kv.appendChild(c); }); pan.appendChild(kv);
  if (d.owned.length) { var s0 = h("div", "sec"); s0.appendChild(h("label", "", "ЕСТЬ В ИНВЕНТАРЕ (" + d.owned.length + ")")); var ch = h("div", "chips"); d.owned.forEach(function (o) { ch.appendChild(h("span", "chip", nameOf(o))); }); s0.appendChild(ch); pan.appendChild(s0); }
  if (d.pending) pan.appendChild(h("div", "hint", "🎁 Подарков ждёт игрока: " + d.pending));

  var sg = h("div", "sec"); sg.appendChild(h("label", "", "ВЫДАТЬ МОНЕТЫ (минус — забрать)"));
  var r1 = h("div", "row"), ci = h("input"); ci.type = "number"; ci.placeholder = "например 500"; ci.inputMode = "numeric"; r1.appendChild(ci);
  r1.appendChild(btn("ok", "ВЫДАТЬ", async function () { var n = parseInt(ci.value, 10); if (!n) { say("Введи число.", "er"); return; } var r = await act("grant", { target: d.id, kind: "coins", val: n }, "Отправлено: " + (n > 0 ? "+" : "") + n + " ✨"); if (r) { ci.value = ""; } }));
  sg.appendChild(r1); pan.appendChild(sg);

  var si = h("div", "sec"); si.appendChild(h("label", "", "ВЫДАТЬ ФОН ИЛИ ЩИТ"));
  var r2 = h("div", "row"), sel = await itemsSelect(true); r2.appendChild(sel);
  r2.appendChild(btn("ok", "ВЫДАТЬ", async function () { await act("grant", { target: d.id, kind: "item", val: sel.value }, "Подарок отправлен"); })); si.appendChild(r2);
  si.appendChild(h("div", "hint", "Подарок появится в игре, как только игрок её откроет. Если он не в сети — дождётся.")); pan.appendChild(si);

  var sm = h("div", "sec"); sm.appendChild(h("label", "", "УПРАВЛЕНИЕ"));
  var r3 = h("div", "row w");
  r3.appendChild(btn("", "✎ СМЕНИТЬ НИК", async function () { var n = await ask("Новый ник для " + d.username + " (3–20 символов):", { input: d.username, max: 20, ok: "СМЕНИТЬ" }); if (n && n.trim()) { var r = await act("rename", { id: d.id, name: n.trim() }, "Ник изменён"); if (r) { closeSheet(); render(); } } }));
  r3.appendChild(btn("warn", "↺ СБРОСИТЬ РЕКОРДЫ", async function () { if (await ask("Обнулить рекорд и счётчик слов у " + d.username + "?", { ok: "СБРОСИТЬ", danger: true })) { if (await act("resetstats", { id: d.id }, "Рекорды сброшены")) { closeSheet(); render(); } } }));
  sm.appendChild(r3);
  var r4 = h("div", "row w");
  if (d.ban) r4.appendChild(btn("ok", "✔ РАЗБЛОКИРОВАТЬ", async function () { if (await act("unban", { id: d.id }, "Разблокирован")) { closeSheet(); render(); } }));
  else r4.appendChild(btn("bad", "⛔ ЗАБЛОКИРОВАТЬ", async function () { var why = await ask("Заблокировать " + d.username + "?\nОн не сможет войти, пропадёт из рейтинга. Причина (её увидит игрок):", { input: "", ph: "например: спам", max: 100, ok: "ЗАБЛОКИРОВАТЬ", danger: true }); if (why !== null) { if (await act("ban", { id: d.id, reason: why }, "Заблокирован")) { closeSheet(); render(); } } }));
  r4.appendChild(btn("bad", "🗑 УДАЛИТЬ", async function () { var t = await ask("Удалить аккаунт навсегда: прогресс, друзей, сообщения. Это нельзя отменить.\nНапиши ник «" + d.username + "» для подтверждения:", { input: "", ok: "УДАЛИТЬ", danger: true }); if (t === null) return; if (t.trim().toLowerCase() !== d.username.toLowerCase()) { say("Ник не совпал, ничего не удалено.", "er"); return; } if (await act("delete", { id: d.id }, "Аккаунт удалён")) { closeSheet(); render(); } }));
  sm.appendChild(r4); pan.appendChild(sm);
  pan.appendChild(btn("", "ЗАКРЫТЬ", closeSheet));
}
function closeSheet() { var s = $("sheet"); s.hidden = true; s.textContent = ""; document.body.style.overflow = ""; }

/* ---------- выдача всем ---------- */
async function vGive(box) {
  var c1 = h("div", "card"); c1.appendChild(h("h3", "", "МОНЕТЫ ВСЕМ ИГРОКАМ"));
  var ci = h("input"); ci.type = "number"; ci.inputMode = "numeric"; ci.placeholder = "Сколько монет ✨ каждому"; c1.appendChild(ci);
  var cn = h("input"); cn.placeholder = "Подпись (необязательно): например, «С праздником!»"; cn.maxLength = 60; c1.appendChild(cn);
  c1.appendChild(btn("ok", "🎁 ВЫДАТЬ ВСЕМ", async function () { var n = parseInt(ci.value, 10); if (!n) { say("Введи число.", "er"); return; } if (!(await ask("Выдать " + n + " ✨ всем игрокам сразу?", { ok: "ВЫДАТЬ" }))) return; var r = await act("grant", { target: "all", kind: "coins", val: n, note: cn.value }, ""); if (r) { say("Готово: получат " + r.count + " игроков", "ok"); ci.value = ""; } }));
  box.appendChild(c1);
  var c2 = h("div", "card"); c2.appendChild(h("h3", "", "ФОН ИЛИ ЩИТ ВСЕМ"));
  var sel = await itemsSelect(true); c2.appendChild(sel);
  var cn2 = h("input"); cn2.placeholder = "Подпись (необязательно)"; cn2.maxLength = 60; c2.appendChild(cn2);
  c2.appendChild(btn("ok", "🎁 ВЫДАТЬ ВСЕМ", async function () { if (!(await ask("Выдать «" + sel.options[sel.selectedIndex].text + "» всем игрокам?", { ok: "ВЫДАТЬ" }))) return; var r = await act("grant", { target: "all", kind: "item", val: sel.value, note: cn2.value }, ""); if (r) say("Готово: получат " + r.count + " игроков", "ok"); }));
  box.appendChild(c2);
  box.appendChild(h("div", "hint", "Подарки не пропадают: игрок получит их, когда в следующий раз откроет игру и войдёт в аккаунт. Выдать одному человеку можно на вкладке «Игроки»."));
}

/* ---------- управление игрой ---------- */
async function vGame(box) {
  var d = await act("status"); if (!d) return; state = d; drawPill();
  var c = h("div", "card"); c.appendChild(h("h3", "", "РАБОТА ИГРЫ"));
  var st = h("div", "hint", state.off ? ("Выключена" + (state.since ? " с " + new Date(state.since).toLocaleString("ru-RU") : "") + (state.msg ? ". Сообщение: «" + state.msg + "»" : "")) : "Работает. Перезапусков: " + (state.epoch || 0)); c.appendChild(st);
  if (state.off) c.appendChild(btn("ok", "⏻ ВКЛЮЧИТЬ ИГРУ", async function () { if (await act("on", null, "Игра включена")) render(); }));
  else {
    var note = h("textarea"); note.maxLength = 200; note.placeholder = "Сообщение игрокам (необязательно): «Вернёмся через 15 минут»"; c.appendChild(note);
    c.appendChild(btn("bad", "⏻ ВЫКЛЮЧИТЬ ИГРУ", async function () { if (await ask("Выключить игру у всех? Вместо неё появится чёрный экран.", { ok: "ВЫКЛЮЧИТЬ", danger: true })) { if (await act("off", { message: note.value }, "Игра выключена")) render(); } }));
  }
  c.appendChild(btn("p", "↻ ПЕРЕЗАПУСТИТЬ У ВСЕХ", async function () { if (await ask("Перезагрузить игру у всех, кто сейчас в ней?", { ok: "ПЕРЕЗАПУСТИТЬ" })) await act("restart", null, "Команда отправлена"); }));
  c.appendChild(h("div", "hint", "«Выключить» ставит у всех чёрный экран и блокирует запись на сервере (удобно перед обновлением). «Перезапустить» заставляет открытые игры обновиться сами."));
  box.appendChild(c);

  var n = h("div", "card"); n.appendChild(h("h3", "", "ОБЪЯВЛЕНИЕ ВСЕМ ИГРОКАМ"));
  var nt = h("textarea"); nt.maxLength = 300; nt.value = state.news || ""; nt.placeholder = "Текст, который появится у игроков сверху в игре: новости, турнир, поздравление"; n.appendChild(nt);
  var nr = h("div", "row");
  nr.appendChild(btn("p", "📢 ОПУБЛИКОВАТЬ", async function () { if (!nt.value.trim()) { say("Напиши текст.", "er"); return; } if (await act("news", { text: nt.value }, "Объявление опубликовано")) render(); }));
  nr.appendChild(btn("", "УБРАТЬ", async function () { if (await act("news", { text: "" }, "Объявление убрано")) render(); }));
  n.appendChild(nr); n.appendChild(h("div", "hint", state.news ? "Сейчас показывается всем: «" + state.news + "»" : "Сейчас объявления нет. Игроки увидят его в течение минуты и один раз.")); box.appendChild(n);

  var rc = h("div", "card"); rc.appendChild(h("h3", "", "КОМНАТЫ ЭХА")); box.appendChild(rc);
  var rd = await act("rooms");
  if (rd) { if (!rd.rooms.length) rc.appendChild(h("div", "empty", "Комнат пока нет.")); rd.rooms.forEach(function (r) { var it = h("div", "item"); var mid = h("div", "mid"); mid.appendChild(h("b", "", "# " + r.name)); mid.appendChild(h("span", "", "создатель " + (r.owner || "?") + " · 👥 " + r.members + " · 💬 " + r.msgs)); it.appendChild(mid); it.appendChild(btn("bad s", "ЗАКРЫТЬ", async function () { if (await ask("Закрыть комнату «" + r.name + "»? Все сообщения удалятся.", { ok: "ЗАКРЫТЬ", danger: true })) { if (await act("closeroom", { id: r.id }, "Комната закрыта")) render(); } })); rc.appendChild(it); }); }
}

/* ---------- жалобы ---------- */
async function vReports(box) {
  var d = await act("reports"); if (!d) return; repN = d.reports.length; drawTabs();
  if (!d.reports.length) { box.appendChild(h("div", "empty", "Жалоб нет. Всё спокойно ✨")); return; }
  d.reports.forEach(function (r, i) {
    var c = h("div", "card"); c.style.animation = "up .3s " + (i * 30) + "ms both";
    c.appendChild(h("b", "", (r.rn || "?") + "  →  " + (r.tn || "удалён")));
    c.appendChild(h("div", "hint", new Date(r.t).toLocaleString("ru-RU")));
    c.appendChild(h("div", "", r.body || "—")).style.whiteSpace = "pre-wrap";
    var row = h("div", "row");
    if (r.tn) row.appendChild(btn("", "👤 ИГРОК", function () { openPlayer(r.tid); }));
    if (r.tn && !r.banned) row.appendChild(btn("bad", "⛔ БАН", async function () { var why = await ask("Заблокировать " + r.tn + "?", { input: "", ph: "причина", max: 100, ok: "ЗАБЛОКИРОВАТЬ", danger: true }); if (why !== null && await act("ban", { id: r.tid, reason: why }, "Заблокирован")) render(); }));
    row.appendChild(btn("ok", "✔ ЗАКРЫТЬ", async function () { if (await act("dismiss", { id: r.id }, "Жалоба закрыта")) render(); }));
    c.appendChild(row); box.appendChild(c);
  });
}

/* ---------- вход / выход ---------- */
function show(on) {
  $("login").hidden = on; $("app").hidden = !on; $("nav").hidden = !on; clearInterval(poll);
  if (on) { drawTabs(); render(); poll = setInterval(async function () { if (document.hidden || busy) return; try { state = await call("status"); drawPill(); } catch (e) {} }, 30000); }
}
function logout() { token = ""; try { localStorage.removeItem(KEY); } catch (e) {} $("tok").value = ""; show(false); }
async function login() {
  token = $("tok").value.trim(); if (!token) { say("Введи токен.", "er"); return; }
  try { var d = await call("status"); state = d; drawPill(); try { if ($("rem").checked) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY); } catch (e) {} show(true); }
  catch (e) { say(e.status === 404 ? "Токен не подошёл." : e.status === 429 ? "Слишком много попыток, подожди." : (e instanceof TypeError ? "Нет связи с сервером." : e.message), "er"); }
}
$("go").onclick = login; $("out").onclick = logout;
$("tok").addEventListener("keydown", function (e) { if (e.key === "Enter") login(); });
if (token) { $("rem").checked = true; call("status").then(function (d) { state = d; drawPill(); show(true); }).catch(function () { logout(); }); }
</script></body></html>
`;

/* ---------- Обработчик ---------- */
/* ---------- Ночная уборка и отчёт в Telegram (запускается по расписанию Cloudflare) ---------- */
const DAY = 24 * 3600 * 1000;
async function runCron(env) {
  await ensureSchema(env);
  const now = Date.now(), db = env.DB;
  const n = async (sql, ...a) => ((await db.prepare(sql).bind(...a).first()) || {}).n || 0;
  const iso = ms => new Date(ms).toISOString();
  const cleaned = {};
  const step = async (name, sql, ...a) => { try { const before = await n('SELECT COUNT(*) AS n FROM ' + name); await db.prepare(sql).bind(...a).run(); cleaned[name] = before - await n('SELECT COUNT(*) AS n FROM ' + name); } catch (_) { cleaned[name] = 0; } };
  await step('rate_limit', 'DELETE FROM rate_limit WHERE t<?', now - DAY);
  await step('qr_login', 'DELETE FROM qr_login WHERE expires<?', now);
  await step('sp_reports', 'DELETE FROM sp_reports WHERE t<?', now - 60 * DAY);
  await step('sp_challenges', 'DELETE FROM sp_challenges WHERE t<?', now - 2 * CH_TTL);
  await step('sp_rooms', 'DELETE FROM sp_rooms WHERE id NOT IN (SELECT room FROM sp_room_members)');
  await step('sp_room_msgs', 'DELETE FROM sp_room_msgs WHERE room NOT IN (SELECT id FROM sp_rooms)');
  await step('sp_room_msgs', 'DELETE FROM sp_room_msgs WHERE t<?', now - 30 * DAY);
  await step('sp_friends', "DELETE FROM sp_friends WHERE state='pending' AND t>0 AND t<?", now - 90 * DAY);
  // аккаунты, в которые не играли ни разу и не заходили 120 дней
  let removed = 0;
  try {
    const dead = ((await db.prepare("SELECT id FROM users WHERE best_score=0 AND total_words=0 AND updated_at<>'' AND updated_at<?").bind(iso(now - 120 * DAY)).all()).results || []).slice(0, 200);
    for (const u of dead) {
      for (const [t, c] of [['qr_login', 'user_id'], ['sp_msgs', 'a'], ['sp_msgs', 'b'], ['sp_blocks', 'a'], ['sp_blocks', 'b'], ['sp_friends', 'a'], ['sp_friends', 'b'], ['sp_reports', 'reporter'], ['sp_reports', 'target'], ['sp_challenges', 'from_id'], ['sp_challenges', 'to_id']]) {
        try { await db.prepare('DELETE FROM ' + t + ' WHERE ' + c + '=?').bind(u.id).run(); } catch (_) {}
      }
      await db.prepare('DELETE FROM users WHERE id=?').bind(u.id).run();
      removed++;
    }
  } catch (_) {}
  const stats = {
    users: await n('SELECT COUNT(*) AS n FROM users'),
    day: await n('SELECT COUNT(*) AS n FROM users WHERE updated_at>?', iso(now - DAY)),
    week: await n('SELECT COUNT(*) AS n FROM users WHERE updated_at>?', iso(now - 7 * DAY)),
    pairs: await n("SELECT COUNT(*) AS n FROM sp_friends WHERE state='accepted'"),
    msgs: await n('SELECT COUNT(*) AS n FROM sp_msgs WHERE t>?', now - DAY),
    reports: await n('SELECT COUNT(*) AS n FROM sp_reports WHERE t>?', now - DAY),
    open: await n("SELECT COUNT(*) AS n FROM sp_challenges WHERE state='open'")
  };
  const top = (await db.prepare('SELECT username,best_score AS s FROM users ORDER BY best_score DESC LIMIT 3').all()).results || [];
  const text = ['📊 СЛОВОПАД — отчёт за сутки', '',
    '👥 Игроков всего: ' + stats.users,
    '🟢 Были за сутки: ' + stats.day + ', за неделю: ' + stats.week,
    '🤝 Пар друзей: ' + stats.pairs + ', открытых вызовов: ' + stats.open,
    '💬 Сообщений за сутки: ' + stats.msgs,
    stats.reports ? '🚩 Жалоб за сутки: ' + stats.reports + ' (посмотри чат)' : '🚩 Жалоб за сутки: 0',
    top.length ? '🏆 Топ: ' + top.map(t => t.username + ' ' + t.s).join(', ') : '',
    '', '🧹 Убрано: пустых аккаунтов ' + removed + ', старых записей ' + Object.values(cleaned).reduce((x, y) => x + y, 0)
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  let sent = false;
  if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
    try {
      const r = await fetch('https://api.telegram.org/bot' + env.TG_BOT_TOKEN + '/sendMessage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text }) });
      sent = r.ok;
    } catch (_) {}
  }
  return { stats, removed, cleaned, sent, text };
}

/* ---------- Удаление игрока целиком (используется и самим игроком, и панель управленияю) ---------- */
async function wipeUser(env, id) {
  const db = env.DB;
  for (const [t, w] of [['qr_login', 'user_id=?'], ['sp_friends', 'a=? OR b=?'], ['sp_msgs', 'a=? OR b=?'], ['sp_blocks', 'a=? OR b=?'], ['sp_reports', 'reporter=? OR target=?'], ['sp_challenges', 'from_id=? OR to_id=?'], ['sp_room_members', 'uid=?'], ['sp_room_msgs', 'uid=?'], ['sp_tg', 'uid=?'], ['sp_grants', 'uid=?'], ['sp_bans', 'uid=?']]) {
    try { await db.prepare('DELETE FROM ' + t + ' WHERE ' + w).bind(...(w.includes('OR') ? [id, id] : [id])).run(); } catch (_) {}
  }
  try { await db.prepare('DELETE FROM sp_rooms WHERE id NOT IN (SELECT room FROM sp_room_members)').run(); } catch (_) {}
  await db.prepare('DELETE FROM users WHERE id=?').bind(id).run();
}

/* ---------- Панель управления: что можно выдавать и что можно делать ---------- */
const CATALOG = [["s0","НЕОН",0],["s1","ОГОНЬ",120],["s2","ЯД",120],["s3","САКУРА",250],["s4","ЗОЛОТО",400],["s5","РАДУГА",700],["s6","ЛЁД",300],["s7","ПЛАЗМА",500],["s8","МОЛНИЯ",450],["s9","ЛАВА",550],["s10","КОМЕТЫ",800],["b0","КОСМОС",0],["b1","ЗАКАТ",150],["b2","АВРОРА",150],["b3","СНЕГОПАД",300],["b4","САКУРА",450],["b5","ДОЖДЬ КОДА",600],["b6","СИНТВЕЙВ",500],["b7","СВЕТЛЯЧКИ",350],["b8","ОКЕАН",550],["b9","ПУСТЫНЯ",550],["b10","НОЧНОЙ ГОРОД",650],["b11","ГОРНОЕ ОЗЕРО",700],["b12","ВУЛКАН",750],["b13","КРИСТАЛЛЫ",800],["b14","ЗИМНИЙ ДОМИК",750]];   // [id, название, цена] — те же фоны и щиты, что в магазине игры
const manageState = s => ({ off: s.off, msg: s.msg, epoch: s.epoch, since: s.since, news: s.news, newsId: s.newsId });
const oneLine = (v, max) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

async function manageDo(env, body) {
  const db = env.DB, now = Date.now(), act = String(body.action || 'status');
  const err = (m, st) => ({ __err: m, __st: st || 400 });
  const cnt = async (sql, ...a) => ((await db.prepare(sql).bind(...a).first()) || {}).n || 0;
  const player = async () => db.prepare('SELECT * FROM users WHERE id=?').bind(String(body.id || '')).first();

  if (act === 'status') return manageState(await settings(env));
  if (act === 'off') { await setSetting(env, 'msg', oneLine(body.message, 200)); await setSetting(env, 'since', now); await setSetting(env, 'off', 1); return manageState(await settings(env)); }
  if (act === 'on') { await setSetting(env, 'off', 0); await setSetting(env, 'msg', ''); return manageState(await settings(env)); }
  if (act === 'restart') { await setSetting(env, 'epoch', (await settings(env)).epoch + 1); return manageState(await settings(env)); }   // все открытые игры перезагрузятся сами
  if (act === 'news') {
    const text = oneLine(body.text, 300);
    await setSetting(env, 'news', text); await setSetting(env, 'newsId', text ? now : 0);
    return manageState(await settings(env));
  }
  if (act === 'catalog') return { items: CATALOG };

  if (act === 'overview') {
    const iso = ms => new Date(ms).toISOString();
    return {
      users: await cnt('SELECT COUNT(*) AS n FROM users'),
      now5: await cnt('SELECT COUNT(*) AS n FROM users WHERE updated_at>?', iso(now - 5 * 60 * 1000)),
      day: await cnt('SELECT COUNT(*) AS n FROM users WHERE updated_at>?', iso(now - DAY)),
      week: await cnt('SELECT COUNT(*) AS n FROM users WHERE updated_at>?', iso(now - 7 * DAY)),
      pairs: await cnt("SELECT COUNT(*) AS n FROM sp_friends WHERE state='accepted'"),
      msgs: await cnt('SELECT COUNT(*) AS n FROM sp_msgs WHERE t>?', now - DAY) + await cnt('SELECT COUNT(*) AS n FROM sp_room_msgs WHERE t>?', now - DAY),
      rooms: await cnt('SELECT COUNT(*) AS n FROM sp_rooms'),
      reports: await cnt('SELECT COUNT(*) AS n FROM sp_reports'),
      banned: await cnt('SELECT COUNT(*) AS n FROM sp_bans'),
      pending: await cnt('SELECT COUNT(*) AS n FROM sp_grants'),
      words: await cnt('SELECT COALESCE(SUM(total_words),0) AS n FROM users'),
      top: (await db.prepare('SELECT username,best_score AS s FROM users WHERE id NOT IN (SELECT uid FROM sp_bans) ORDER BY best_score DESC LIMIT 5').all()).results || [],
      state: manageState(await settings(env))
    };
  }

  if (act === 'players') {
    const q = String(body.q || '').replace(/[%_\\]/g, '').trim().slice(0, 30), off = Math.max(0, Math.floor(Number(body.offset) || 0));
    const like = '%' + q + '%';
    const rows = (await db.prepare("SELECT id,username,sp_code AS code,best_score AS best,total_words AS words,updated_at AS seen,json_extract(data_json,'$.co') AS co,EXISTS(SELECT 1 FROM sp_bans b WHERE b.uid=users.id) AS banned FROM users WHERE (?='' OR username LIKE ? OR sp_code LIKE ?) ORDER BY updated_at DESC LIMIT 26 OFFSET ?").bind(q, like, like, off).all()).results || [];
    return { players: rows.slice(0, 25), more: rows.length > 25 };
  }

  if (act === 'player') {
    const u = await player(); if (!u) return err('Игрок не найден.', 404);
    const d = parse(u.data_json, {}), ban = await db.prepare('SELECT reason,t FROM sp_bans WHERE uid=?').bind(u.id).first();
    return {
      id: u.id, username: u.username, code: u.sp_code || '', best: u.best_score || 0, words: u.total_words || 0, seen: u.updated_at,
      coins: Number(d.co) || 0, owned: Array.isArray(d.ow) ? d.ow.filter(x => typeof x === 'string').slice(0, 60) : [], eq: d.eq && typeof d.eq === 'object' ? { s: String(d.eq.s || ''), b: String(d.eq.b || '') } : {},
      friends: await cnt("SELECT COUNT(*) AS n FROM sp_friends WHERE (a=? OR b=?) AND state='accepted'", u.id, u.id),
      rooms: await cnt('SELECT COUNT(*) AS n FROM sp_room_members WHERE uid=?', u.id),
      reports: await cnt('SELECT COUNT(*) AS n FROM sp_reports WHERE target=?', u.id),
      pending: await cnt('SELECT COUNT(*) AS n FROM sp_grants WHERE uid=?', u.id),
      ban: ban ? { reason: ban.reason, t: ban.t } : null
    };
  }

  if (act === 'grant') {
    const kind = String(body.kind || ''), note = oneLine(body.note, 60);
    let val;
    if (kind === 'coins') { val = Math.trunc(Number(body.val)); if (!val || Math.abs(val) > 1000000) return err('Монеты: число от −1 000 000 до 1 000 000, не ноль.'); }
    else if (kind === 'item') { val = String(body.val || ''); if (val !== 'all' && !CATALOG.some(c => c[0] === val)) return err('Такого предмета нет в магазине.'); }
    else return err('Неизвестный вид подарка.');
    if (body.target === 'all') {
      const r = await db.prepare('INSERT INTO sp_grants (uid,kind,val,note,t) SELECT id,?,?,?,? FROM users WHERE id NOT IN (SELECT uid FROM sp_bans)').bind(kind, String(val), note, now).run();
      return { ok: true, count: (r && r.meta && r.meta.changes) || 0 };
    }
    const u = await db.prepare('SELECT id FROM users WHERE id=?').bind(String(body.target || '')).first(); if (!u) return err('Игрок не найден.', 404);
    await db.prepare('INSERT INTO sp_grants (uid,kind,val,note,t) VALUES (?,?,?,?,?)').bind(u.id, kind, String(val), note, now).run();
    return { ok: true, count: 1 };
  }

  if (act === 'ban') {
    const u = await player(); if (!u) return err('Игрок не найден.', 404);
    await db.prepare('INSERT OR REPLACE INTO sp_bans (uid,reason,t) VALUES (?,?,?)').bind(u.id, oneLine(body.reason, 100), now).run();
    try { await db.prepare('DELETE FROM sp_room_members WHERE uid=?').bind(u.id).run(); await db.prepare('DELETE FROM sp_tg WHERE uid=?').bind(u.id).run(); } catch (_) {}
    return { ok: true };
  }
  if (act === 'unban') { const u = await player(); if (!u) return err('Игрок не найден.', 404); await db.prepare('DELETE FROM sp_bans WHERE uid=?').bind(u.id).run(); return { ok: true }; }

  if (act === 'rename') {
    const u = await player(); if (!u) return err('Игрок не найден.', 404);
    const name = String(body.name || '').trim();
    if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(name) || /^sp-/i.test(name)) return err('Ник: 3–20 символов (буквы, цифры, _ . -), не может начинаться с SP-.');
    const key = nickKey(name);
    const dup = await db.prepare('SELECT 1 AS x FROM users WHERE id<>? AND (username_key=? OR username=? COLLATE NOCASE) LIMIT 1').bind(u.id, key, name).first();
    if (dup) return err('Этот ник уже занят или слишком похож на другой.', 409);
    await db.prepare('UPDATE users SET username=?, username_key=? WHERE id=?').bind(name, key, u.id).run();
    return { ok: true };
  }
  if (act === 'resetstats') { const u = await player(); if (!u) return err('Игрок не найден.', 404); await db.prepare('UPDATE users SET best_score=0,total_words=0 WHERE id=?').bind(u.id).run(); return { ok: true }; }
  if (act === 'delete') { const u = await player(); if (!u) return err('Игрок не найден.', 404); await wipeUser(env, u.id); return { ok: true }; }

  if (act === 'reports') {
    const rows = (await db.prepare('SELECT r.id,r.t,r.body,r.target AS tid,(SELECT username FROM users WHERE id=r.reporter) AS rn,(SELECT username FROM users WHERE id=r.target) AS tn,EXISTS(SELECT 1 FROM sp_bans b WHERE b.uid=r.target) AS banned FROM sp_reports r ORDER BY r.id DESC LIMIT 30').all()).results || [];
    return { reports: rows };
  }
  if (act === 'dismiss') { await db.prepare('DELETE FROM sp_reports WHERE id=?').bind(Math.floor(Number(body.id) || 0)).run(); return { ok: true }; }

  if (act === 'rooms') {
    const rows = (await db.prepare('SELECT r.id,r.name,(SELECT username FROM users WHERE id=r.owner) AS owner,(SELECT COUNT(*) FROM sp_room_members m WHERE m.room=r.id) AS members,(SELECT COUNT(*) FROM sp_room_msgs g WHERE g.room=r.id) AS msgs FROM sp_rooms r ORDER BY r.t DESC LIMIT 40').all()).results || [];
    return { rooms: rows };
  }
  if (act === 'closeroom') {
    const id = String(body.id || '');
    await db.prepare('DELETE FROM sp_room_msgs WHERE room=?').bind(id).run(); await db.prepare('DELETE FROM sp_room_members WHERE room=?').bind(id).run(); await db.prepare('DELETE FROM sp_rooms WHERE id=?').bind(id).run();
    return { ok: true };
  }
  return err('Неизвестная команда.');
}

export default {
  scheduled(event, env, ctx) {
    const p = runCron(env).catch(e => console.error('cron', e));
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
    return p;
  },
  async fetch(request, env, ctx) {
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
      const secretPath = String(env.ADMIN_PATH || '');
      if (request.method === 'GET' && /^[A-Za-z0-9_-]{12,}$/.test(secretPath) && safeEq(url.pathname, '/' + secretPath)) {
        return new Response(CONSOLE_PAGE, { headers: {
          'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer',
          'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'"
        } });
      }
      if (url.pathname === '/api/health') {
        return reply({ ok: true, service: 'slovopad-id', version: 4, secret: !!secretOf(env), db: !!env.DB });
      }
      if (!env.DB) return reply({ error: 'К серверу не привязана база данных (binding DB).' }, 500);

      /* состояние игры: включена или на техработах (его спрашивает каждая открытая игра) */
      if (url.pathname === '/api/status' && request.method === 'GET') return reply(publicState(await settings(env)));

      /* управление: только с секретным токеном */
      if (url.pathname === '/api/ctl' && request.method === 'POST') {
        const ctlToken = String(env.ADMIN_TOKEN || '');
        if (ctlToken.length < 16) return reply({ error: 'Not found' }, 404);   // не настроено: делаем вид, что такого адреса нет
        await ensureSchema(env);   // нужна таблица rate_limit
        const aip = await ipHash(request, env);
        if (!(await allow(env, 'adm:' + aip, 300, 10 * 60 * 1000))) return reply(TOO_MANY, 429);
        if (await countHits(env, 'admbad:' + aip, 15 * 60 * 1000) >= 8) return reply(TOO_MANY, 429);   // перебор токена
        const body = await request.json().catch(() => ({}));
        if (!safeEq(String(body.token || ''), ctlToken)) { await recordHit(env, 'admbad:' + aip); return reply({ error: 'Not found' }, 404); }
        const res = await manageDo(env, body);
        return reply(res.__err ? { error: res.__err } : res, res.__err ? (res.__st || 400) : 200);
      }

      /* пока игра выключена, остальной сервер молчит (чтобы во время обновления никто ничего не записал) */
      { const st = await settings(env); if (st.off) return reply({ error: 'Идут технические работы. Загляни позже.', maintenance: true }, 503); }
      if (!secretOf(env)) return reply({ error: 'На сервере не задан секрет JWT_SECRET.' }, 500);
      await ensureSchema(env);

      /* регистрация и вход */
      if (request.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
        const ipH = await ipHash(request, env);
        const body = (await request.json().catch(() => null)) || {};
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(username) || /^sp-/i.test(username) || password.length < 8 || password.length > 128) {
          return reply({ error: 'Ник: 3–20 символов (буквы, цифры, _ . -, не может начинаться с SP-). Пароль: 8–128 символов.' }, 400);
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
          // общий лимит на адрес (все попытки), и отдельный лимит неудачных попыток на пару «адрес + ник»:
          // так чужой ник нельзя запереть, даже зная его, и правильный пароль не блокируется
          const failKey = 'lf:' + ipH + ':' + nickKey(username);
          if (!await allow(env, 'ip:' + ipH, 20, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
          if (await countHits(env, failKey, 15 * 60 * 1000) >= 15) return reply(TOO_MANY, 429);
          user = await env.DB.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE OR username_key=? LIMIT 1').bind(username, nickKey(username)).first();
          // считаем хэш и для несуществующего ника, чтобы по времени ответа нельзя было узнать, есть ли такой игрок
          const hash = await passwordHash(password, user ? user.salt : DUMMY_SALT);
          if (!user || !safeEq(hash, user.password_hash)) {
            await recordHit(env, failKey);
            return reply({ error: 'Неверный ник или пароль.' }, 401);
          }
        }
        try {
          const ban = await env.DB.prepare('SELECT reason FROM sp_bans WHERE uid=?').bind(user.id).first();
          if (ban) return reply({ error: 'Аккаунт заблокирован' + (ban.reason ? ': ' + ban.reason : '.') }, 403);
        } catch (_) {}

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
        const body = (await request.json().catch(() => null)) || {};
        const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const pin = String(body.pin || '').replace(/\D/g, '');
        if (pin.length !== 2) return reply({ error: 'Введи число с экрана компьютера (2 цифры).' }, 400);
        const row = code ? await env.DB.prepare('SELECT * FROM qr_login WHERE code=?').bind(code).first() : null;
        if (!row || row.expires < Date.now()) return reply({ error: 'Код не найден или устарел. Обнови QR на экране компьютера.' }, 404);
        if (row.user_id) return reply({ error: 'Этот код уже использован.' }, 409);
        // счётчик попыток увеличиваем атомарно, иначе параллельные запросы обходят лимит
        const bump = await env.DB.prepare('UPDATE qr_login SET tries=tries+1 WHERE code=? AND tries<? AND user_id IS NULL').bind(code, QR_MAX_TRIES).run();
        if (!(bump && bump.meta && bump.meta.changes)) {
          await env.DB.prepare('DELETE FROM qr_login WHERE code=?').bind(code).run();
          return reply({ error: 'Число введено неверно слишком много раз. Обнови QR на экране компьютера.' }, 403);
        }
        if (!safeEq(pin, row.pin)) {
          const left = QR_MAX_TRIES - (row.tries || 0) - 1;
          if (left <= 0) {
            await env.DB.prepare('DELETE FROM qr_login WHERE code=?').bind(code).run();
            return reply({ error: 'Число введено неверно слишком много раз. Обнови QR на экране компьютера.' }, 403);
          }
          return reply({ error: 'Неверное число. Осталось попыток: ' + left + '.' }, 403);
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
        await wipeUser(env, user.id);
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

        const body = (await request.json().catch(() => null)) || {};
        const profObj = body.profile && typeof body.profile === 'object' ? body.profile : {};
        if (profObj.pf && typeof profObj.pf === 'object') profObj.pf.a = String(profObj.pf.a || '').slice(0, 16);
        const profile = JSON.stringify(profObj);
        const data = JSON.stringify(body.data || {});
        if (profile.length > 300000) return reply({ error: 'Слишком большой профиль (уменьши фото).' }, 413);
        if (data.length > 100000) return reply({ error: 'Слишком много данных прогресса.' }, 413);

        if (!await allow(env, 'sy:' + user.id, 60, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
        // Защита от накрутки рейтинга: слов не может прибавиться быстрее, чем их реально набрать,
        // а очков не может быть сильно больше, чем слов. Полностью подделку исключить нельзя, но грубые обманы отсекаются.
        const now = Date.now(), last = Date.parse(user.updated_at) || now, oldWords = user.total_words || 0;
        const allowance = oldWords === 0 ? 50000 : 20 + Math.ceil((now - last) / 1000 * 2.5);
        const totalWords = Math.min(num(body.totalWords), oldWords + allowance);
        // Лучшая игра не может содержать больше слов, чем всего набрано, а за слово дают не больше 150 очков (10 × множитель 5 × золотое ×3)
        const bestScore = Math.min(num(body.bestScore), totalWords * MAX_PTS_PER_WORD + MAX_PTS_PER_WORD);
        const privacy = JSON.stringify(cleanPrivacy({ ...parse(user.privacy_json, {}), ...(body.privacy && typeof body.privacy === 'object' ? body.privacy : {}) }));

        await env.DB.prepare(
          'UPDATE users SET profile_json=?, data_json=?, privacy_json=?, best_score=MAX(best_score,?), total_words=MAX(total_words,?), updated_at=? WHERE id=?'
        ).bind(profile, data, privacy, bestScore, totalWords, new Date().toISOString(), user.id).run();

        const updated = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
        return reply({ ok: true, ...(await account(env, updated)) });
      }

      /* подарки от создателя: игра забирает их и начисляет у себя */
      if (url.pathname === '/api/grants' && request.method === 'GET') {
        const user = await userFrom(request, env);
        if (!user) return reply({ error: 'Нужно войти в аккаунт.' }, 401);
        if (!await allow(env, 'gr:' + user.id, 80, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
        const rows = (await env.DB.prepare('SELECT id,kind,val,note FROM sp_grants WHERE uid=? ORDER BY id ASC LIMIT 30').bind(user.id).all()).results || [];
        return reply({ grants: rows });
      }
      if (url.pathname === '/api/grants/claim' && request.method === 'POST') {
        const user = await userFrom(request, env);
        if (!user) return reply({ error: 'Нужно войти в аккаунт.' }, 401);
        const body = (await request.json().catch(() => null)) || {};
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 30);
        for (const id of ids) await env.DB.prepare('DELETE FROM sp_grants WHERE id=? AND uid=?').bind(id, user.id).run();
        return reply({ ok: true });
      }

      /* публичный профиль: /api/player?q=ник или SP-код */
      if (url.pathname === '/api/player' && request.method === 'GET') {
        const q = String(url.searchParams.get('q') || '').trim();
        if (!q) return reply({ error: 'Укажи ник или код.' }, 400);
        if (!await allow(env, 'pl:' + await ipHash(request, env), 60, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
        const row = await env.DB.prepare('SELECT * FROM users WHERE sp_code=? OR username=? COLLATE NOCASE ORDER BY (sp_code=?) DESC LIMIT 1')
          .bind(q.toUpperCase(), q, q.toUpperCase()).first();
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

      /* ---------- друзья ---------- */
      if (url.pathname.startsWith('/api/friends') || url.pathname.startsWith('/api/challenge') || url.pathname.startsWith('/api/chat') || url.pathname.startsWith('/api/echo') || url.pathname.startsWith('/api/tg') || url.pathname === '/api/ping') {
        const user = await userFrom(request, env);
        if (!user) return reply({ error: 'Нужно войти в аккаунт.' }, 401);
        const now = Date.now(), post = request.method === 'POST', body = post ? await request.json().catch(() => ({})) : {};

        // «я здесь» + сколько ждёт ответа (для значка на кнопке)
        if (url.pathname === '/api/ping' && post) {
          if (!await allow(env, 'pg:' + user.id, 40, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
          try { await env.DB.prepare('UPDATE users SET seen=? WHERE id=?').bind(now, user.id).run(); } catch (_) { /* колонки seen может не быть: не ломаем из-за этого весь запрос */ }
          const rq = await env.DB.prepare('SELECT COUNT(*) AS n FROM sp_friends WHERE b=? AND state=\'pending\'').bind(user.id).first();
          const ch = await env.DB.prepare('SELECT COUNT(*) AS n FROM sp_challenges WHERE to_id=? AND state=\'open\' AND t>?').bind(user.id, now - CH_TTL).first();
          const ms = await env.DB.prepare('SELECT COUNT(*) AS n FROM sp_msgs WHERE b=? AND rd=0').bind(user.id).first();
          let rooms = 0;
          try { const rr = await env.DB.prepare('SELECT COUNT(*) AS n FROM sp_room_msgs g JOIN sp_room_members m ON m.room=g.room AND m.uid=? WHERE g.id>m.last AND g.uid<>?').bind(user.id, user.id).first(); rooms = rr ? rr.n : 0; } catch (_) {}
          return reply({ ok: true, requests: rq ? rq.n : 0, challenges: ch ? ch.n : 0, messages: ms ? ms.n : 0, rooms });
        }

        // список друзей, запросы и вызовы
        if (url.pathname === '/api/friends' && request.method === 'GET') {
          if (!await allow(env, 'fl:' + user.id, 60, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
          try { await env.DB.prepare('UPDATE users SET seen=? WHERE id=?').bind(now, user.id).run(); } catch (_) { /* колонки seen может не быть: не ломаем из-за этого весь запрос */ }
          const rel = (await env.DB.prepare('SELECT a,b,state FROM sp_friends WHERE a=? OR b=?').bind(user.id, user.id).all()).results || [];
          const chIn = (await env.DB.prepare('SELECT * FROM sp_challenges WHERE to_id=? AND state=\'open\' AND t>? ORDER BY t DESC LIMIT 20').bind(user.id, now - CH_TTL).all()).results || [];
          const chOut = (await env.DB.prepare('SELECT * FROM sp_challenges WHERE from_id=? AND t>? ORDER BY t DESC LIMIT 20').bind(user.id, now - CH_TTL).all()).results || [];
          const ids = [...rel.map(r => (r.a === user.id ? r.b : r.a)), ...chIn.map(c => c.from_id), ...chOut.map(c => c.to_id)];
          const people = await usersByIds(env, ids), info = new Map();
          for (const id of new Set(ids)) { const r = people.get(id); if (r) info.set(id, await pubInfo(env, r, now)); }
          const pick = r => info.get(r.a === user.id ? r.b : r.a);
          const byBest = (x, y) => (y.bestScore || 0) - (x.bestScore || 0) || x.username.localeCompare(y.username);
          const unread = new Map(((await env.DB.prepare('SELECT a, COUNT(*) AS n FROM sp_msgs WHERE b=? AND rd=0 GROUP BY a').bind(user.id).all()).results || []).map(r => [r.a, r.n]));
          const friends = rel.filter(r => r.state === 'accepted').map(r => { const id = r.a === user.id ? r.b : r.a, i = info.get(id); return i ? { ...i, unread: unread.get(id) || 0 } : null; }).filter(Boolean).sort(byBest);
          const incoming = rel.filter(r => r.state === 'pending' && r.b === user.id).map(pick).filter(Boolean);
          const outgoing = rel.filter(r => r.state === 'pending' && r.a === user.id).map(pick).filter(Boolean);
          const mapIn = chIn.map(c => ({ id: c.id, from: info.get(c.from_id), theme: c.theme, lang: c.lang, score: c.score, t: c.t })).filter(c => c.from);
          const mapOut = chOut.map(c => ({ id: c.id, to: info.get(c.to_id), theme: c.theme, lang: c.lang, score: c.score, state: c.state, result: c.result, t: c.t })).filter(c => c.to);
          return reply({ me: { username: user.username, spCode: await ensureCode(env, user), bestScore: user.best_score || 0 }, friends, incoming, outgoing, challenges: { incoming: mapIn, sent: mapOut } });
        }

        // отправить запрос в друзья (по коду или нику)
        if (url.pathname === '/api/friends/request' && post) {
          if (!await allow(env, 'fr:' + user.id, 30, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
          const other = await findUser(env, body.q);
          if (!other) return reply({ error: 'Игрок не найден.' }, 404);
          if (other.id === user.id) return reply({ error: 'Это твой собственный код.' }, 400);
          const rel = await relation(env, user.id, other.id);
          if (rel && rel.state === 'accepted') return reply({ error: 'Вы уже друзья.' }, 409);
          if (rel && rel.a === user.id) return reply({ error: 'Запрос уже отправлен. Ждём ответа.' }, 409);
          const count = async (sql, id) => ((await env.DB.prepare(sql).bind(id).first()) || {}).n || 0;
          const mine = ((await env.DB.prepare('SELECT COUNT(*) AS n FROM sp_friends WHERE (a=? OR b=?) AND state=\'accepted\'').bind(user.id, user.id).first()) || {}).n || 0;
          if (mine >= FR_MAX) return reply({ error: 'У тебя уже ' + FR_MAX + ' друзей.' }, 409);
          if (rel && rel.b === user.id) {   // он уже просил нас: сразу дружим
            await env.DB.prepare('UPDATE sp_friends SET state=\'accepted\', t=? WHERE a=? AND b=?').bind(now, other.id, user.id).run();
            return reply({ state: 'accepted', username: other.username });
          }
          if (await count('SELECT COUNT(*) AS n FROM sp_friends WHERE a=? AND state=\'pending\'', user.id) >= FR_OUT_MAX) return reply({ error: 'Слишком много неотвеченных запросов. Подожди ответов.' }, 429);
          if (await count('SELECT COUNT(*) AS n FROM sp_friends WHERE b=? AND state=\'pending\'', other.id) >= FR_IN_MAX) return reply({ error: 'Этому игроку сейчас нельзя отправить запрос. Попробуй позже.' }, 429);
          await env.DB.prepare('INSERT OR IGNORE INTO sp_friends (a,b,state,t) VALUES (?,?,\'pending\',?)').bind(user.id, other.id, now).run();
          return reply({ state: 'sent', username: other.username });
        }

        // ответ на запрос: принять или отклонить
        if (url.pathname === '/api/friends/respond' && post) {
          const other = await findUser(env, body.code);
          const rel = other && await env.DB.prepare('SELECT a FROM sp_friends WHERE a=? AND b=? AND state=\'pending\'').bind(other.id, user.id).first();
          if (!rel) return reply({ error: 'Запрос не найден.' }, 404);
          if (body.accept === true) await env.DB.prepare('UPDATE sp_friends SET state=\'accepted\', t=? WHERE a=? AND b=?').bind(now, other.id, user.id).run();
          else await env.DB.prepare('DELETE FROM sp_friends WHERE a=? AND b=?').bind(other.id, user.id).run();
          return reply({ ok: true, accepted: body.accept === true });
        }

        // удалить из друзей или отменить свой запрос
        if (url.pathname === '/api/friends/remove' && post) {
          const other = await findUser(env, body.code);
          if (!other) return reply({ error: 'Игрок не найден.' }, 404);
          await env.DB.prepare('DELETE FROM sp_friends WHERE (a=? AND b=?) OR (a=? AND b=?)').bind(user.id, other.id, other.id, user.id).run();
          await env.DB.prepare('DELETE FROM sp_challenges WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)').bind(user.id, other.id, other.id, user.id).run();
          await env.DB.prepare('DELETE FROM sp_msgs WHERE (a=? AND b=?) OR (a=? AND b=?)').bind(user.id, other.id, other.id, user.id).run();
          return reply({ ok: true });
        }

        /* ---------- чат между друзьями ---------- */
        // Telegram: привязка уведомлений
        if (url.pathname === '/api/tg/link' && post) {
          if (!await allow(env, 'tl:' + user.id, 10, 60 * 60 * 1000)) return reply(TOO_MANY, 429);
          if (body.off === true) { await env.DB.prepare('DELETE FROM sp_tg WHERE uid=?').bind(user.id).run(); return reply({ ok: true, linked: false }); }
          const chat = await tgCheck(body.initData, env.GAME_BOT_TOKEN);
          if (!chat) return reply({ error: 'Не удалось проверить Telegram.' }, 400);
          await env.DB.prepare('INSERT OR REPLACE INTO sp_tg (uid,chat,t) VALUES (?,?,?)').bind(user.id, chat, now).run();
          return reply({ ok: true, linked: true });
        }
        if (url.pathname === '/api/tg' && request.method === 'GET') {
          const r = await env.DB.prepare('SELECT 1 AS x FROM sp_tg WHERE uid=?').bind(user.id).first();
          return reply({ linked: !!r, available: !!env.GAME_BOT_TOKEN });
        }

        // Эхо: комнаты
        if (url.pathname.startsWith('/api/echo')) {
          const mem = room => env.DB.prepare('SELECT room,uid,last FROM sp_room_members WHERE room=? AND uid=?').bind(room, user.id).first();
          const roomId = String(url.searchParams.get('room') || body.room || '');

          if (url.pathname === '/api/echo/rooms' && request.method === 'GET') {
            if (!await allow(env, 'er:' + user.id, 80, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
            const rows = (await env.DB.prepare('SELECT r.id,r.name,r.owner,m.last,(SELECT COUNT(*) FROM sp_room_members x WHERE x.room=r.id) AS members,(SELECT COUNT(*) FROM sp_room_msgs g WHERE g.room=r.id AND g.id>m.last AND g.uid<>?) AS unread,(SELECT body FROM sp_room_msgs g WHERE g.room=r.id ORDER BY g.id DESC LIMIT 1) AS lastbody,(SELECT t FROM sp_room_msgs g WHERE g.room=r.id ORDER BY g.id DESC LIMIT 1) AS lastt FROM sp_room_members m JOIN sp_rooms r ON r.id=m.room WHERE m.uid=? ORDER BY COALESCE(lastt,r.t) DESC LIMIT 30')
              .bind(user.id, user.id).all()).results || [];
            return reply({ rooms: rows.map(r => ({ id: r.id, name: r.name, mine: r.owner === user.id, members: r.members, unread: r.unread, last: r.lastbody ? String(r.lastbody).slice(0, 60) : '', t: r.lastt || 0 })) });
          }

          if (url.pathname === '/api/echo/room' && post) {
            if (!await allow(env, 'ec:' + user.id, 5, 60 * 60 * 1000)) return reply(TOO_MANY, 429);
            const name = cleanText(body.name, ROOM_NAME_MAX);
            if (!name) return reply({ error: 'Название комнаты — от 1 до ' + ROOM_NAME_MAX + ' символов.' }, 400);
            const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM sp_room_members WHERE uid=?').bind(user.id).first();
            if (cnt && cnt.n >= ROOM_MAX_JOINED) return reply({ error: 'Ты уже в ' + ROOM_MAX_JOINED + ' комнатах. Выйди из лишней.' }, 409);
            const id = hex(random(6));
            await env.DB.prepare('INSERT INTO sp_rooms (id,name,owner,t) VALUES (?,?,?,?)').bind(id, name, user.id, now).run();
            await env.DB.prepare('INSERT INTO sp_room_members (room,uid,t,last) VALUES (?,?,?,0)').bind(id, user.id, now).run();
            return reply({ ok: true, id, name });
          }

          if (!roomId) return reply({ error: 'Комната не указана.' }, 400);
          const me = await mem(roomId);
          if (!me) return reply({ error: 'Ты не состоишь в этой комнате.' }, 403);
          const room = await env.DB.prepare('SELECT id,name,owner FROM sp_rooms WHERE id=?').bind(roomId).first();
          if (!room) return reply({ error: 'Комната не найдена.' }, 404);

          // звонок: вход, выход, опрос и обмен сигналами связи (сам звук и видео идут напрямую между игроками)
          if (url.pathname.startsWith('/api/echo/call/')) {
            const nm = user.username, cut = now - CALL_STALE;
            const alive = async () => ((await env.DB.prepare('SELECT name,j FROM sp_call_part WHERE room=? AND t>? ORDER BY j ASC,name ASC').bind(roomId, cut).all()).results || []);
            if (url.pathname === '/api/echo/call/who' && request.method === 'GET') {
              if (!await allow(env, 'cw:' + user.id, 150, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
              return reply({ parts: (await alive()).map(p => p.name) });
            }
            if (url.pathname === '/api/echo/call/join' && post) {
              if (!await allow(env, 'cj:' + user.id, 30, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
              await env.DB.prepare('DELETE FROM sp_call_part WHERE room=? AND t<=?').bind(roomId, cut).run();
              await env.DB.prepare('DELETE FROM sp_call_sig WHERE t<?').bind(now - 120 * 1000).run();
              const cur = await alive();
              if (!cur.some(p => p.name === nm) && cur.length >= CALL_MAX) return reply({ error: 'В звонке уже ' + CALL_MAX + ' человека.' }, 409);
              await env.DB.prepare('DELETE FROM sp_call_sig WHERE room=? AND (too=? OR frm=?)').bind(roomId, nm, nm).run();
              await env.DB.prepare('INSERT OR REPLACE INTO sp_call_part (room,name,j,t) VALUES (?,?,?,?)').bind(roomId, nm, now, now).run();
              const first = cur.length === 0;
              if (first) {
                const others = ((await env.DB.prepare('SELECT uid FROM sp_room_members WHERE room=? AND uid<>?').bind(roomId, user.id).all()).results || []).slice(0, ROOM_MAX_MEMBERS);
                for (const o of others) push(ctx, notify(env, o.uid, '📞 Эхо · ' + room.name + ': ' + nm + ' начал(а) звонок'));
              }
              const ice = await iceServers(env);
              return reply({ ok: true, me: nm, parts: await alive(), ice: ice.servers, turn: ice.turn });
            }
            if (url.pathname === '/api/echo/call/leave' && post) {
              await env.DB.prepare('DELETE FROM sp_call_part WHERE room=? AND name=?').bind(roomId, nm).run();
              await env.DB.prepare('DELETE FROM sp_call_sig WHERE room=? AND (too=? OR frm=?)').bind(roomId, nm, nm).run();
              return reply({ ok: true });
            }
            if (url.pathname === '/api/echo/call/poll' && request.method === 'GET') {
              const after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0));
              if (url.searchParams.get('hb') === '1') await env.DB.prepare('INSERT INTO sp_call_part (room,name,j,t) VALUES (?,?,?,?) ON CONFLICT(room,name) DO UPDATE SET t=excluded.t').bind(roomId, nm, now, now).run();
              const sigs = ((await env.DB.prepare('SELECT id,frm,body FROM sp_call_sig WHERE room=? AND too=? AND id>? ORDER BY id ASC LIMIT 100').bind(roomId, nm, after).all()).results || []);
              return reply({ parts: await alive(), sigs: sigs.map(r => ({ id: r.id, from: r.frm, data: r.body })) });
            }
            if (url.pathname === '/api/echo/call/sig' && post) {
              const to = String(body.to || '').slice(0, 40), data = String(body.data || '');
              if (!to || to === nm || !data) return reply({ error: 'Пустой сигнал.' }, 400);
              if (data.length > CALL_SIG_MAX) return reply({ error: 'Сигнал слишком большой.' }, 413);
              const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM sp_call_sig WHERE room=? AND frm=? AND t>?').bind(roomId, nm, now - 60 * 1000).first();
              if (cnt && cnt.n >= 300) return reply(TOO_MANY, 429);
              await env.DB.prepare('INSERT INTO sp_call_sig (room,frm,too,body,t) VALUES (?,?,?,?,?)').bind(roomId, nm, to, data, now).run();
              return reply({ ok: true });
            }
            return reply({ error: 'Не найдено.' }, 404);
          }

          if (url.pathname === '/api/echo/room/msgs' && request.method === 'GET') {
            if (!await allow(env, 'eg:' + user.id, 150, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
            const after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0));
            const rows = (await env.DB.prepare('SELECT id,uid,body,t FROM sp_room_msgs WHERE room=? AND id>? ORDER BY id ASC LIMIT 50').bind(roomId, after).all()).results || [];
            if (rows.length) await env.DB.prepare('UPDATE sp_room_members SET last=? WHERE room=? AND uid=?').bind(rows[rows.length - 1].id, roomId, user.id).run();
            const ms = ((await env.DB.prepare('SELECT uid FROM sp_room_members WHERE room=?').bind(roomId).all()).results || []).map(r => r.uid);
            const people = await usersByIds(env, ms);
            const nm = id => (people.get(id) || {}).username || '?';
            return reply({ room: { id: room.id, name: room.name, mine: room.owner === user.id }, members: ms.map(id => ({ name: nm(id), owner: id === room.owner, me: id === user.id })), messages: rows.map(r => ({ id: r.id, mine: r.uid === user.id, who: nm(r.uid), body: r.body, t: r.t })) });
          }

          if (url.pathname === '/api/echo/room/send' && post) {
            if (!await allow(env, 'es:' + user.id, 30, 60 * 1000)) return reply(TOO_MANY, 429);
            const text = cleanText(body.text, MSG_MAX);
            if (text === null) return reply({ error: 'Сообщение длиннее ' + MSG_MAX + ' символов.' }, 400);
            if (!text) return reply({ error: 'Пустое сообщение.' }, 400);
            const ins = await env.DB.prepare('INSERT INTO sp_room_msgs (room,uid,body,t) VALUES (?,?,?,?)').bind(roomId, user.id, text, now).run();
            const id = ins && ins.meta ? ins.meta.last_row_id || 0 : 0;
            await env.DB.prepare('UPDATE sp_room_members SET last=? WHERE room=? AND uid=?').bind(id, roomId, user.id).run();
            await env.DB.prepare('DELETE FROM sp_room_msgs WHERE id IN (SELECT id FROM sp_room_msgs WHERE room=? ORDER BY id DESC LIMIT -1 OFFSET ?)').bind(roomId, ROOM_KEEP).run();
            const others = ((await env.DB.prepare('SELECT uid FROM sp_room_members WHERE room=? AND uid<>?').bind(roomId, user.id).all()).results || []).slice(0, ROOM_MAX_MEMBERS);
            if (!/^§[RS]\|/.test(text)) for (const o of others) push(ctx, notify(env, o.uid, '💬 Эхо · ' + room.name + ': новое сообщение'));
            return reply({ ok: true, id });
          }

          if (url.pathname === '/api/echo/room/invite' && post) {
            if (!await allow(env, 'ei:' + user.id, 20, 60 * 60 * 1000)) return reply(TOO_MANY, 429);
            const other = await findUser(env, body.code);
            if (!other || other.id === user.id) return reply({ error: 'Игрок не найден.' }, 404);
            const rl = await relation(env, user.id, other.id);
            if (!rl || rl.state !== 'accepted') return reply({ error: 'Приглашать можно только друзей.' }, 403);
            const blocked = await env.DB.prepare('SELECT 1 AS x FROM sp_blocks WHERE a=? AND b=?').bind(other.id, user.id).first();
            if (blocked) return reply({ error: 'Игрок сейчас не принимает приглашения.' }, 403);
            const have = await env.DB.prepare('SELECT 1 AS x FROM sp_room_members WHERE room=? AND uid=?').bind(roomId, other.id).first();
            if (have) return reply({ error: 'Он уже в комнате.' }, 409);
            const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM sp_room_members WHERE room=?').bind(roomId).first();
            if (n && n.n >= ROOM_MAX_MEMBERS) return reply({ error: 'В комнате уже ' + ROOM_MAX_MEMBERS + ' человек.' }, 409);
            const j = await env.DB.prepare('SELECT COUNT(*) AS n FROM sp_room_members WHERE uid=?').bind(other.id).first();
            if (j && j.n >= ROOM_MAX_JOINED) return reply({ error: 'Друг уже состоит в максимальном числе комнат.' }, 409);
            await env.DB.prepare('INSERT INTO sp_room_members (room,uid,t,last) VALUES (?,?,?,0)').bind(roomId, other.id, now).run();
            push(ctx, notify(env, other.id, '🔔 Эхо: ' + user.username + ' позвал тебя в комнату «' + room.name + '»'));
            return reply({ ok: true, username: other.username });
          }

          if (url.pathname === '/api/echo/room/leave' && post) {
            await env.DB.prepare('DELETE FROM sp_room_members WHERE room=? AND uid=?').bind(roomId, user.id).run();
            const left = await env.DB.prepare('SELECT uid FROM sp_room_members WHERE room=? ORDER BY t ASC LIMIT 1').bind(roomId).first();
            if (!left) { await env.DB.prepare('DELETE FROM sp_rooms WHERE id=?').bind(roomId).run(); await env.DB.prepare('DELETE FROM sp_room_msgs WHERE room=?').bind(roomId).run(); }
            else if (room.owner === user.id) await env.DB.prepare('UPDATE sp_rooms SET owner=? WHERE id=?').bind(left.uid, roomId).run();
            return reply({ ok: true });
          }

          if (url.pathname === '/api/echo/room/kick' && post) {
            if (room.owner !== user.id) return reply({ error: 'Исключать может только создатель комнаты.' }, 403);
            const other = await findUser(env, body.code);
            if (!other || other.id === user.id) return reply({ error: 'Игрок не найден.' }, 404);
            await env.DB.prepare('DELETE FROM sp_room_members WHERE room=? AND uid=?').bind(roomId, other.id).run();
            return reply({ ok: true });
          }

          if (url.pathname === '/api/echo/room/report' && post) {
            if (!await allow(env, 'ex:' + user.id, 5, 60 * 60 * 1000)) return reply(TOO_MANY, 429);
            const rows = (await env.DB.prepare('SELECT body FROM sp_room_msgs WHERE room=? AND uid<>? ORDER BY id DESC LIMIT 5').bind(roomId, user.id).all()).results || [];
            await env.DB.prepare('INSERT INTO sp_reports (reporter,target,body,t) VALUES (?,?,?,?)').bind(user.id, room.owner, ('[комната ' + room.name + '] ' + rows.map(r => r.body).reverse().join(' | ')).slice(0, 800), now).run();
            return reply({ ok: true });
          }
          return reply({ error: 'Not found' }, 404);
        }

        if (url.pathname.startsWith('/api/chat')) {
          const withCode = (url.searchParams.get('with') || body.to || '');
          const other = await findUser(env, withCode);
          if (!other || other.id === user.id) return reply({ error: 'Игрок не найден.' }, 404);
          const rl = await relation(env, user.id, other.id);
          if (!rl || rl.state !== 'accepted') return reply({ error: 'Писать можно только друзьям.' }, 403);
          const iBlocked = await env.DB.prepare('SELECT 1 AS x FROM sp_blocks WHERE a=? AND b=?').bind(user.id, other.id).first();

          if (url.pathname === '/api/chat' && request.method === 'GET') {
            if (!await allow(env, 'cg:' + user.id, 100, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
            const after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0));
            const rows = (await env.DB.prepare('SELECT id,a,kind,body,t FROM sp_msgs WHERE ((a=? AND b=?) OR (a=? AND b=?)) AND id>? ORDER BY id ASC LIMIT 50')
              .bind(user.id, other.id, other.id, user.id, after).all()).results || [];
            await env.DB.prepare('UPDATE sp_msgs SET rd=1 WHERE a=? AND b=? AND rd=0').bind(other.id, user.id).run();
            return reply({ with: other.username, blocked: !!iBlocked, messages: rows.map(r => ({ id: r.id, mine: r.a === user.id, kind: r.kind, body: r.body, t: r.t })) });
          }

          if (url.pathname === '/api/chat/send' && post) {
            if (!await allow(env, 'cs:' + user.id, 30, 60 * 1000)) return reply(TOO_MANY, 429);
            if (iBlocked) return reply({ error: 'Ты заблокировал этого игрока. Сначала разблокируй.' }, 409);
            const theyBlocked = await env.DB.prepare('SELECT 1 AS x FROM sp_blocks WHERE a=? AND b=?').bind(other.id, user.id).first();
            if (theyBlocked) return reply({ error: 'Игрок сейчас не принимает сообщения.' }, 403);
            let kind = 'text', text = '';
            if (typeof body.react === 'string' && body.react) {
              if (!REACTS.includes(body.react)) return reply({ error: 'Такой реакции нет.' }, 400);
              kind = 'react'; text = body.react;
            } else {
              text = String(body.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
              if (!text) return reply({ error: 'Пустое сообщение.' }, 400);
              if ([...text].length > MSG_MAX) return reply({ error: 'Сообщение длиннее ' + MSG_MAX + ' символов.' }, 400);
            }
            const ins = await env.DB.prepare('INSERT INTO sp_msgs (a,b,kind,body,t,rd) VALUES (?,?,?,?,?,0)').bind(user.id, other.id, kind, text, now).run();
            await env.DB.prepare('DELETE FROM sp_msgs WHERE id IN (SELECT id FROM sp_msgs WHERE (a=? AND b=?) OR (a=? AND b=?) ORDER BY id DESC LIMIT -1 OFFSET ?)')
              .bind(user.id, other.id, other.id, user.id, MSG_KEEP).run();
            if (kind === 'text') push(ctx, notify(env, other.id, '💬 Эхо: новое сообщение от ' + user.username));
            return reply({ ok: true, id: ins && ins.meta ? ins.meta.last_row_id || 0 : 0 });
          }

          if (url.pathname === '/api/chat/block' && post) {
            if (!await allow(env, 'cb:' + user.id, 20, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
            if (body.on === false) await env.DB.prepare('DELETE FROM sp_blocks WHERE a=? AND b=?').bind(user.id, other.id).run();
            else await env.DB.prepare('INSERT OR IGNORE INTO sp_blocks (a,b,t) VALUES (?,?,?)').bind(user.id, other.id, now).run();
            return reply({ ok: true, blocked: body.on !== false });
          }

          if (url.pathname === '/api/chat/report' && post) {
            if (!await allow(env, 'cr:' + user.id, 5, 60 * 60 * 1000)) return reply(TOO_MANY, 429);
            const last = (await env.DB.prepare('SELECT body FROM sp_msgs WHERE a=? AND b=? AND kind=\'text\' ORDER BY id DESC LIMIT 5').bind(other.id, user.id).all()).results || [];
            await env.DB.prepare('INSERT INTO sp_reports (reporter,target,body,t) VALUES (?,?,?,?)').bind(user.id, other.id, last.map(r => r.body).reverse().join(' | ').slice(0, 800), now).run();
            await env.DB.prepare('DELETE FROM sp_reports WHERE t<?').bind(now - 60 * 24 * 3600 * 1000).run();
            return reply({ ok: true });
          }
          return reply({ error: 'Not found' }, 404);
        }

        // вызов: «побей мой счёт»
        if (url.pathname === '/api/challenge' && post) {
          if (!await allow(env, 'ch:' + user.id, 20, 10 * 60 * 1000)) return reply(TOO_MANY, 429);
          const other = await findUser(env, body.code);
          const rel = other && await relation(env, user.id, other.id);
          if (!rel || rel.state !== 'accepted') return reply({ error: 'Вызвать можно только друга.' }, 403);
          const theme = String(body.theme || ''), score = num(body.score), lang = Math.max(0, Math.min(2, Number(body.lang) | 0));
          if (!/^[a-z]{2,12}$/.test(theme) || score < 1) return reply({ error: 'Некорректный вызов.' }, 400);
          const open = await env.DB.prepare('SELECT COUNT(*) AS n FROM sp_challenges WHERE from_id=? AND to_id=? AND state=\'open\' AND t>?').bind(user.id, other.id, now - CH_TTL).first();
          if (open && open.n >= CH_OPEN_PER_FRIEND) return reply({ error: 'Другу уже отправлено много вызовов. Подожди, пока он ответит.' }, 429);
          await env.DB.prepare('INSERT INTO sp_challenges (id,from_id,to_id,theme,lang,score,t,state) VALUES (?,?,?,?,?,?,?,\'open\')').bind(hex(random(8)), user.id, other.id, theme, lang, score, now).run();
          if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM sp_challenges WHERE t<?').bind(now - 2 * CH_TTL).run();
          return reply({ ok: true, username: other.username });
        }

        // результат попытки: побил или нет
        if (url.pathname === '/api/challenge/done' && post) {
          const row = await env.DB.prepare('SELECT * FROM sp_challenges WHERE id=? AND to_id=? AND state=\'open\' AND t>?').bind(String(body.id || ''), user.id, now - CH_TTL).first();
          if (!row) return reply({ error: 'Вызов не найден.' }, 404);
          const score = num(body.score);
          if (score > row.score) {
            await env.DB.prepare('UPDATE sp_challenges SET state=\'won\', result=? WHERE id=?').bind(score, row.id).run();
            return reply({ won: true, need: row.score + 1 });
          }
          return reply({ won: false, need: row.score + 1 });
        }

        // отклонить вызов (получатель) или убрать из списка (отправитель)
        if (url.pathname === '/api/challenge/remove' && post) {
          await env.DB.prepare('DELETE FROM sp_challenges WHERE id=? AND (to_id=? OR from_id=?)').bind(String(body.id || ''), user.id, user.id).run();
          return reply({ ok: true });
        }
      }

      /* рейтинг */
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          'SELECT username,best_score AS bestScore,total_words AS totalWords,privacy_json FROM users WHERE best_score>0 AND id NOT IN (SELECT uid FROM sp_bans) AND COALESCE(json_extract(privacy_json,\'$.records\'),1)<>0 ORDER BY best_score DESC,total_words DESC,username ASC LIMIT 50'
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
