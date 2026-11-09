-- Схему можно не применять вручную: worker.js сам создаёт таблицы и добавляет недостающие колонки.
-- Этот файл нужен как справка и для новых установок.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  profile_json TEXT NOT NULL DEFAULT '{}',
  best_score INTEGER NOT NULL DEFAULT 0,
  total_words INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT '',
  sp_code TEXT,                              -- Slovopad ID, например SP-4K7M2X
  privacy_json TEXT NOT NULL DEFAULT '{}',   -- что показывать в публичном профиле
  data_json TEXT NOT NULL DEFAULT '{}',      -- достижения, ✨, покупки
  username_key TEXT                          -- «скелет» ника: без регистра и похожих букв, чтобы нельзя было выдать себя за другого
);
CREATE UNIQUE INDEX IF NOT EXISTS users_spcode_idx ON users(sp_code);
CREATE UNIQUE INDEX IF NOT EXISTS users_key_idx ON users(username_key);
CREATE INDEX IF NOT EXISTS users_leaderboard_idx ON users(best_score DESC, total_words DESC, username ASC);

-- Вход по QR: короткоживущие сессии
CREATE TABLE IF NOT EXISTS qr_login (
  code TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  user_id TEXT,
  expires INTEGER NOT NULL,
  pin TEXT NOT NULL DEFAULT '',              -- число из 2 цифр с экрана компьютера
  tries INTEGER NOT NULL DEFAULT 0,          -- сколько раз неверно введено число
  ip TEXT NOT NULL DEFAULT ''                -- хэш адреса, для ограничения числа кодов
);

-- Ограничение частоты запросов (адреса хранятся только в виде хэша)
CREATE TABLE IF NOT EXISTS rate_limit (
  k TEXT NOT NULL,
  t INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limit_idx ON rate_limit(k,t);

-- Настройки сервера (ключ — значение)
CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL DEFAULT ''
);
