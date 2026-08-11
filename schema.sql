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

CREATE TABLE IF NOT EXISTS notification_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle INTEGER NOT NULL DEFAULT 1,
  day INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'day_available',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL,
  UNIQUE (user_id, cycle, day, kind)
);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_pending
  ON notification_jobs(status, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_notification_jobs_user
  ON notification_jobs(user_id, cycle, day);

-- NU APP · SINCRONIZACIÓN MULTIRUTINA V98
-- Collagen+ conserva users/day_progress. Estas tablas son sólo para
-- LumiSpa, WellSpa y Galvanic Spa.
CREATE TABLE IF NOT EXISTS product_routine_states (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id TEXT NOT NULL,
  current_day INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, routine_id),
  CHECK (current_day BETWEEN 1 AND 10)
);

CREATE TABLE IF NOT EXISTS product_routine_day_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  opened_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, routine_id, day),
  CHECK (day BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS idx_product_routine_progress_user
  ON product_routine_day_progress(user_id, routine_id, day);



-- NU APP · PROGRAMACIÓN UNIFICADA DE RUTINAS V101
-- En V101 se registran los avisos de las rutinas de producto.
-- V101a incorporará Collagen+ al envío agrupado usando esta misma cola.
CREATE TABLE IF NOT EXISTS routine_notification_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id TEXT NOT NULL,
  cycle INTEGER NOT NULL DEFAULT 1,
  day INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'day_available',
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL,
  UNIQUE (user_id, routine_id, cycle, day, kind),
  CHECK (routine_id IN ('collagen-30', 'lumispa-10', 'wellspa-10', 'galvanicspa-10')),
  CHECK (day BETWEEN 1 AND 30),
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_routine_notification_jobs_due
  ON routine_notification_jobs(status, scheduled_for)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_routine_notification_jobs_user
  ON routine_notification_jobs(user_id, scheduled_for);

-- NU APP · ENTREGA CONFIABLE POR DISPOSITIVO V111
CREATE TABLE IF NOT EXISTS notification_delivery_batches (
  logical_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL,
  CHECK (status IN ('pending', 'sent', 'failed'))
);

CREATE TABLE IF NOT EXISTS notification_delivery_sources (
  logical_key TEXT NOT NULL
    REFERENCES notification_delivery_batches(logical_key) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_id BIGINT NOT NULL,
  PRIMARY KEY (logical_key, source_table, source_id),
  UNIQUE (source_table, source_id),
  CHECK (
    source_table IN ('notification_jobs', 'routine_notification_jobs')
  )
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  logical_key TEXT NOT NULL
    REFERENCES notification_delivery_batches(logical_key) ON DELETE CASCADE,
  subscription_id BIGINT NULL
    REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  endpoint_hash TEXT NOT NULL,
  subscription_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL,
  UNIQUE (logical_key, endpoint_hash),
  CHECK (
    status IN ('pending', 'processing', 'retryable', 'sent', 'permanent')
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_due
  ON notification_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'retryable');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_batch
  ON notification_deliveries(logical_key, status);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_processing
  ON notification_deliveries(processing_at)
  WHERE status = 'processing';

-- NU APP · ACCESO POR CORREO Y CÓDIGO TEMPORAL V110
-- Migración idempotente: se aplica al iniciar el servidor junto al resto
-- del esquema. Nunca guarda códigos ni tokens en texto plano.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users(email)
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_codes (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_ip TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_email_active
  ON auth_codes(email, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_codes_created
  ON auth_codes(created_at);

CREATE INDEX IF NOT EXISTS idx_auth_codes_request_ip
  ON auth_codes(request_ip, created_at)
  WHERE request_ip IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  request_ip TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
  ON user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
  ON user_sessions(expires_at);
