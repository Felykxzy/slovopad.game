
const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'cache-control': 'no-store'
  }
});

const enc = new TextEncoder();

const b64 = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const unb64 = value =>
  Uint8Array.from(
    atob(value.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  );

const random = n => crypto.getRandomValues(new Uint8Array(n));

const hex = bytes =>
  [...new Uint8Array(bytes)]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  return hex(await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: unb64(salt),
    iterations: 180000,
    hash: 'SHA-256'
  }, key, 256));
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const body = b64(enc.encode(JSON.stringify(payload)));

  return body + '.' + b64(
    await crypto.subtle.sign('HMAC', key, enc.encode(body))
  );
}

async function verify(token, secret) {
  if (!token || !token.includes('.')) return null;

  const [body, sig] = token.split('.');

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  if (!await crypto.subtle.verify(
    'HMAC',
    key,
    unb64(sig),
    enc.encode(body)
  )) return null;

  const data = JSON.parse(
    new TextDecoder().decode(unb64(body))
  );

  return data.exp > Date.now() ? data : null;
}

async function userFrom(request, env) {
  const token = (request.headers.get('authorization') || '')
    .replace(/^Bearer\s+/i, '');

  const data = await verify(token, env.JWT_SECRET);

  if (!data) return null;

  return env.DB.prepare(
    'SELECT id, username, profile_json, best_score, total_words FROM users WHERE id = ?'
  ).bind(data.sub).first();
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type,authorization'
        }
      });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/health') {
        return json({
          ok: true,
          service: 'slovopad-cloud'
        }, 200, origin);
      }

      if (
        request.method === 'POST' &&
        ['/api/register', '/api/login'].includes(url.pathname)
      ) {
        const body = await request.json();

        const username = String(body.username || '').trim();
        const password = String(body.password || '');

        if (
          !/^[\p{L}\p{N}_.-]{3,20}$/u.test(username) ||
          password.length < 8 ||
          password.length > 128
        ) {
          return json({
            error: 'Ник: 3–20 символов. Пароль: 8–128 символов.'
          }, 400, origin);
        }

        let user;

        if (url.pathname === '/api/register') {
          const salt = b64(random(16));
          const hash = await passwordHash(password, salt);
          const id = crypto.randomUUID();

          try {
            await env.DB.prepare(
              'INSERT INTO users (id,username,salt,password_hash,updated_at) VALUES (?,?,?,?,?)'
            ).bind(
              id,
              username,
              salt,
              hash,
              new Date().toISOString()
            ).run();
          } catch (_) {
            return json({
              error: 'Этот ник уже занят.'
            }, 409, origin);
          }

          user = await env.DB.prepare(
            'SELECT id,username,profile_json,best_score,total_words FROM users WHERE id=?'
          ).bind(id).first();

        } else {
          user = await env.DB.prepare(
            'SELECT * FROM users WHERE username=? COLLATE NOCASE'
          ).bind(username).first();

          if (
            !user ||
            await passwordHash(password, user.salt) !== user.password_hash
          ) {
            return json({
              error: 'Неверный ник или пароль.'
            }, 401, origin);
          }
        }

        const token = await sign({
          sub: user.id,
          exp: Date.now() + 30 * 24 * 60 * 60 * 1000
        }, env.JWT_SECRET);

        return json({
          token,
          username: user.username,
          profile: JSON.parse(user.profile_json || '{}'),
          bestScore: user.best_score,
          totalWords: user.total_words
        }, 200, origin);
      }

      if (url.pathname === '/api/sync' && request.method === 'POST') {
        const user = await userFrom(request, env);

        if (!user) {
          return json({
            error: 'Нужно войти в аккаунт.'
          }, 401, origin);
        }

        const body = await request.json();
        const profile = JSON.stringify(body.profile || {});

        if (profile.length > 50000) {
          return json({
            error: 'Слишком большой профиль.'
          }, 413, origin);
        }

        const bestScore = Math.max(
          0,
          Math.min(100000000, Number(body.bestScore) || 0)
        );

        const totalWords = Math.max(
          0,
          Math.min(100000000, Number(body.totalWords) || 0)
        );

        await env.DB.prepare(
          'UPDATE users SET profile_json=?, best_score=MAX(best_score,?), total_words=MAX(total_words,?), updated_at=? WHERE id=?'
        ).bind(
          profile,
          bestScore,
          totalWords,
          new Date().toISOString(),
          user.id
        ).run();

        const updated = await env.DB.prepare(
          'SELECT profile_json,best_score,total_words FROM users WHERE id=?'
        ).bind(user.id).first();

        return json({
          ok: true,
          profile: JSON.parse(updated.profile_json || '{}'),
          bestScore: updated.best_score,
          totalWords: updated.total_words
        }, 200, origin);
      }

      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          'SELECT username,best_score AS bestScore,total_words AS totalWords FROM users ORDER BY best_score DESC,total_words DESC,username ASC LIMIT 50'
        ).all();

        return json({
          items: rows.results || []
        }, 200, origin);
      }

      if (url.pathname === '/api/me' && request.method === 'GET') {
        const user = await userFrom(request, env);

        if (!user) {
          return json({
            error: 'Нужно войти в аккаунт.'
          }, 401, origin);
        }

        return json({
          username: user.username,
          profile: JSON.parse(user.profile_json || '{}'),
          bestScore: user.best_score,
          totalWords: user.total_words
        }, 200, origin);
      }

      return json({
        error: 'Not found'
      }, 404, origin);

    } catch (error) {
      return json({
        error: 'Ошибка сервера.'
      }, 500, origin);
    }
  }
};

