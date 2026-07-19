CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  timezone TEXT NOT NULL,
  notification_time VARCHAR(5) NOT NULL DEFAULT '09:00',
  current_day INTEGER NOT NULL DEFAULT 1,
  cycle INTEGER NOT NULL DEFAULT 1,
  next_unlock_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS day_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle INTEGER NOT NULL DEFAULT 1,
  day INTEGER NOT NULL,
  opened_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  PRIMARY KEY (user_id, cycle, day)
);

CREATE INDEX IF NOT EXISTS idx_users_next_unlock
  ON users(next_unlock_at)
  WHERE next_unlock_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_day_progress_user
  ON day_progress(user_id, cycle, day);

-- Ya dejamos preparada la tabla para el próximo paso: push.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);
