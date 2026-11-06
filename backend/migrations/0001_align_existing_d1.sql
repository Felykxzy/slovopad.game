-- Add fields required by the current Slovopad Worker.
-- Existing users and legacy tables are preserved.

ALTER TABLE users
ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE users
ADD COLUMN best_score INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
ADD COLUMN total_words INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

UPDATE users
SET updated_at = COALESCE(NULLIF(created_at, ''), CURRENT_TIMESTAMP)
WHERE updated_at = '';

CREATE INDEX IF NOT EXISTS users_leaderboard_idx
ON users(best_score DESC, total_words DESC, username ASC);
