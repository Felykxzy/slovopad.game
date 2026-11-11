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
  return env.DB.prepare('SELECT * FROM users WHERE id=?').bind(data.sub).first();
}

/* ---------- Режим техработ (включается из админ-панели admin.html) ---------- */
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
  return { off: m.off === '1', msg: m.msg || '', epoch: Number(m.epoch) || 0, since: Number(m.since) || 0 };
}
async function setSetting(env, k, v) {
  await ensureSettings(env);
  await env.DB.prepare('INSERT INTO settings (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, String(v)).run();
}
const publicState = s => ({ off: s.off, msg: s.msg, epoch: s.epoch, since: s.since });

/* ---------- Страница управления: отдаётся только по секретному адресу ADMIN_PATH ---------- */
const ADMIN_PAGE = String.raw`<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#05060f">
<title>·</title>
<style>
:root{--ac:#5ef2ff;--mg:#ff4fd8;--ink:#e8ecff;--ok:#6dffb0;--bad:#ff6b8a}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;min-height:100vh;background:radial-gradient(900px 500px at 50% -10%,#1a1f4a,#05060f 70%);color:var(--ink);font-family:-apple-system,system-ui,"Segoe UI",sans-serif;display:flex;justify-content:center;padding:24px 16px calc(24px + env(safe-area-inset-bottom,0px))}
main{width:100%;max-width:440px;display:flex;flex-direction:column;gap:14px}
h1{margin:6px 0 0;font-size:18px;letter-spacing:.22em;font-weight:800;text-align:center}
.sub{font-size:11px;letter-spacing:.14em;opacity:.55;text-align:center;margin-top:-8px}
.card{border-radius:20px;padding:16px;background:rgba(255,255,255,.05);border:1px solid rgba(94,242,255,.25);display:flex;flex-direction:column;gap:10px}
input,textarea{width:100%;border-radius:14px;border:1px solid rgba(94,242,255,.3);background:rgba(0,0,0,.35);color:var(--ink);padding:13px 14px;font-size:16px;font-family:inherit;outline:none}
textarea{resize:none;height:68px}
input:focus,textarea:focus{border-color:var(--ac)}
label.ck{display:flex;gap:8px;align-items:center;font-size:12px;opacity:.7}
button{border:0;border-radius:16px;padding:16px;font-size:14px;font-weight:800;letter-spacing:.14em;color:var(--ink);background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);cursor:pointer;font-family:inherit}
button:active{transform:scale(.98)}button:disabled{opacity:.4;cursor:default}
.off{background:rgba(255,107,138,.18);border-color:var(--bad);color:var(--bad)}
.on{background:rgba(109,255,176,.16);border-color:var(--ok);color:var(--ok)}
.rs{background:rgba(94,242,255,.14);border-color:var(--ac);color:var(--ac)}
.st{display:flex;align-items:center;gap:12px;font-size:15px;font-weight:800;letter-spacing:.12em}
.dot{width:14px;height:14px;border-radius:50%;background:#555;flex:none}
.st.run .dot{background:var(--ok);box-shadow:0 0 14px var(--ok)}.st.stop .dot{background:var(--bad);box-shadow:0 0 14px var(--bad)}
.hint{font-size:12px;line-height:1.55;opacity:.6}
#msg{min-height:18px;font-size:13px;text-align:center}#msg.er{color:var(--bad)}#msg.ok{color:var(--ok)}
#panel{display:flex;flex-direction:column;gap:14px}
#out{width:100%}
[hidden]{display:none!important}
</style></head><body><main>
<h1>УПРАВЛЕНИЕ</h1><div class="sub">ТОЛЬКО ДЛЯ ВЛАДЕЛЬЦА</div>

<div class="card" id="login">
  <input id="tok" type="password" autocomplete="current-password" placeholder="Секретный токен">
  <label class="ck"><input type="checkbox" id="rem" style="width:auto"> запомнить на этом устройстве</label>
  <button id="go" class="rs">ВОЙТИ</button>
</div>

<div id="panel" hidden>
  <div class="card">
    <div class="st" id="st"><span class="dot"></span><span id="stT">…</span></div>
    <div class="hint" id="stH"></div>
  </div>
  <div class="card">
    <textarea id="note" maxlength="200" placeholder="Сообщение игрокам (необязательно). Например: «Вернёмся через 15 минут»"></textarea>
    <button id="bOff" class="off">⏻ ВЫКЛЮЧИТЬ ИГРУ</button>
    <button id="bOn" class="on">⏻ ВКЛЮЧИТЬ ИГРУ</button>
    <button id="bRs" class="rs">↻ ПЕРЕЗАПУСТИТЬ</button>
    <div class="hint">«Выключить» ставит у всех чёрный экран «игра временно не работает» и блокирует запись на сервере. «Включить» возвращает игру, и у всех она обновится сама. «Перезапустить» принудительно перезагружает игру у всех, кто сейчас в ней (после раунда).</div>
  </div>
  <button id="out">ВЫЙТИ</button>
</div>
<div id="msg"></div>
</main>
<script>
const API = "/api/admin", KEY = "slovopadAdminToken";
const $ = id => document.getElementById(id);
let token = "", timer = 0, busy = false;
try { token = localStorage.getItem(KEY) || ""; } catch (e) {}

function say(t, k) { const m = $("msg"); m.textContent = t || ""; m.className = k || ""; }
function lock(b) { busy = b; ["go", "bOff", "bOn", "bRs"].forEach(i => { $(i).disabled = b; }); }

function draw(s) {
  const off = !!s.off;
  $("st").className = "st " + (off ? "stop" : "run");
  $("stT").textContent = off ? "ИГРА ВЫКЛЮЧЕНА" : "ИГРА РАБОТАЕТ";
  const bits = [];
  if (off && s.since) bits.push("выключена с " + new Date(s.since).toLocaleString("ru-RU"));
  if (off && s.msg) bits.push("сообщение: «" + s.msg + "»");
  bits.push("перезапусков: " + (s.epoch || 0));
  $("stH").textContent = bits.join(" · ");
  $("bOff").hidden = off; $("bOn").hidden = !off; $("note").hidden = off;
}

async function call(action, extra) {
  const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, action, ...(extra || {}) }) });
  let d = {}; try { d = await r.json(); } catch (e) {}
  if (!r.ok) { const e = new Error(d.error || ("Ошибка " + r.status)); e.status = r.status; throw e; }
  return d;
}

async function run(action, extra, okText) {
  if (busy) return; lock(true); say("…");
  try { draw(await call(action, extra)); say(okText || "", "ok"); show(true); }
  catch (e) {
    if (e.status === 401 || e.status === 404) { say("Неверный токен.", "er"); show(false); }
    else say(e instanceof TypeError ? "Нет связи с сервером." : e.message, "er");
  } finally { lock(false); }
}

function show(on) {
  $("login").hidden = on; $("panel").hidden = !on;
  clearInterval(timer);
  if (on) timer = setInterval(async () => { if (document.hidden || busy) return; try { draw(await call("status")); } catch (e) {} }, 10000);
}

$("go").onclick = () => {
  token = $("tok").value.trim(); if (!token) { say("Введи токен.", "er"); return; }
  try { if ($("rem").checked) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY); } catch (e) {}
  run("status");
};
$("tok").addEventListener("keydown", e => { if (e.key === "Enter") $("go").click(); });
$("bOff").onclick = () => { if (confirm("Выключить игру у всех? Вместо неё появится чёрный экран.")) run("off", { message: $("note").value }, "Игра выключена"); };
$("bOn").onclick = () => run("on", null, "Игра включена, у игроков она обновится сама");
$("bRs").onclick = () => { if (confirm("Перезагрузить игру у всех, кто сейчас в ней?")) run("restart", null, "Команда отправлена: открытые игры перезагрузятся"); };
$("out").onclick = () => { token = ""; try { localStorage.removeItem(KEY); } catch (e) {} $("tok").value = ""; say(""); show(false); };

if (token) { $("rem").checked = true; run("status"); }
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

export default {
  scheduled(event, env, ctx) {
    const p = runCron(env).catch(e => console.error('cron', e));
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
    return p;
  },
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
      const secretPath = String(env.ADMIN_PATH || '');
      if (request.method === 'GET' && /^[A-Za-z0-9_-]{12,}$/.test(secretPath) && safeEq(url.pathname, '/' + secretPath)) {
        return new Response(ADMIN_PAGE, { headers: {
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
      if (url.pathname === '/api/admin' && request.method === 'POST') {
        const adminToken = String(env.ADMIN_TOKEN || '');
        if (adminToken.length < 16) return reply({ error: 'Not found' }, 404);   // не настроено: делаем вид, что такого адреса нет
        await ensureSchema(env);   // нужна таблица rate_limit
        if (!(await allow(env, 'adm:' + await ipHash(request, env), 30, 10 * 60 * 1000))) return reply(TOO_MANY, 429);
        const body = await request.json().catch(() => ({}));
        if (!safeEq(String(body.token || ''), adminToken)) return reply({ error: 'Not found' }, 404);
        const act = String(body.action || 'status');
        if (act === 'off') { await setSetting(env, 'msg', String(body.message || '').replace(/\s+/g, ' ').trim().slice(0, 200)); await setSetting(env, 'since', Date.now()); await setSetting(env, 'off', 1); }
        else if (act === 'on') { await setSetting(env, 'off', 0); await setSetting(env, 'msg', ''); }
        else if (act === 'restart') { await setSetting(env, 'epoch', (await settings(env)).epoch + 1); }   // все открытые игры перезагрузятся сами
        else if (act !== 'status') return reply({ error: 'Неизвестная команда.' }, 400);
        return reply(publicState(await settings(env)));
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
        await env.DB.prepare('DELETE FROM qr_login WHERE user_id=?').bind(user.id).run();
        await env.DB.prepare('DELETE FROM sp_friends WHERE a=? OR b=?').bind(user.id, user.id).run();
        await env.DB.prepare('DELETE FROM sp_msgs WHERE a=? OR b=?').bind(user.id, user.id).run();
        await env.DB.prepare('DELETE FROM sp_blocks WHERE a=? OR b=?').bind(user.id, user.id).run();
        await env.DB.prepare('DELETE FROM sp_reports WHERE reporter=? OR target=?').bind(user.id, user.id).run();
        await env.DB.prepare('DELETE FROM sp_challenges WHERE from_id=? OR to_id=?').bind(user.id, user.id).run();
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
      if (url.pathname.startsWith('/api/friends') || url.pathname.startsWith('/api/challenge') || url.pathname.startsWith('/api/chat') || url.pathname === '/api/ping') {
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
          return reply({ ok: true, requests: rq ? rq.n : 0, challenges: ch ? ch.n : 0, messages: ms ? ms.n : 0 });
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
          'SELECT username,best_score AS bestScore,total_words AS totalWords,privacy_json FROM users WHERE best_score>0 AND COALESCE(json_extract(privacy_json,\'$.records\'),1)<>0 ORDER BY best_score DESC,total_words DESC,username ASC LIMIT 50'
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
