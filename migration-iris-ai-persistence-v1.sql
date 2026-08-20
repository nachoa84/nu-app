-- ============================================================
-- NU APP · IRIS AI PERSISTENCIA V1
-- Archivo: migration-iris-ai-persistence-v1.sql
--
-- Crea exclusivamente tablas e índices nuevos para:
--   1. cuotas diarias de uso por alcance;
--   2. conteo mensual total de preguntas;
--   3. presupuesto diario/mensual del proveedor;
--   4. reservas atómicas de presupuesto;
--   5. métricas agregadas de Iris AI.
--
-- SEGURIDAD:
--   - Migración aditiva e idempotente.
--   - No usa DROP, TRUNCATE ni ALTER sobre tablas existentes.
--   - No instala extensiones.
--   - No activa IA ni proveedores.
--   - No almacena preguntas, respuestas, documentos,
--     fragmentos, payloads del proveedor ni secretos.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS iris_ai_usage_counters (
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  period_day DATE NOT NULL,
  used_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT iris_ai_usage_counters_pk
    PRIMARY KEY (scope_type, scope_key, period_day),

  CONSTRAINT iris_ai_usage_counters_scope_type_check
    CHECK (scope_type IN ('user', 'device')),

  CONSTRAINT iris_ai_usage_counters_scope_key_not_blank
    CHECK (
      LENGTH(TRIM(scope_key)) BETWEEN 1 AND 200
    ),

  CONSTRAINT iris_ai_usage_counters_used_count_check
    CHECK (used_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_iris_ai_usage_counters_day
  ON iris_ai_usage_counters (period_day, scope_type);


CREATE TABLE IF NOT EXISTS iris_ai_question_counters (
  period_month DATE PRIMARY KEY,
  total_questions BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT iris_ai_question_counters_month_start_check
    CHECK (EXTRACT(DAY FROM period_month) = 1),

  CONSTRAINT iris_ai_question_counters_total_check
    CHECK (total_questions >= 0)
);


CREATE TABLE IF NOT EXISTS iris_ai_provider_budget_counters (
  period_type TEXT NOT NULL,
  period_start DATE NOT NULL,
  used_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT iris_ai_provider_budget_counters_pk
    PRIMARY KEY (period_type, period_start),

  CONSTRAINT iris_ai_provider_budget_period_type_check
    CHECK (period_type IN ('day', 'month')),

  CONSTRAINT iris_ai_provider_budget_used_count_check
    CHECK (used_count >= 0),

  CONSTRAINT iris_ai_provider_budget_month_start_check
    CHECK (
      period_type <> 'month'
      OR EXTRACT(DAY FROM period_start) = 1
    )
);


CREATE TABLE IF NOT EXISTS iris_ai_provider_reservations (
  reservation_key TEXT PRIMARY KEY,
  period_day DATE NOT NULL,
  period_month DATE NOT NULL,
  state TEXT NOT NULL DEFAULT 'reserved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reconciled_at TIMESTAMPTZ,

  CONSTRAINT iris_ai_provider_reservations_key_not_blank
    CHECK (
      LENGTH(TRIM(reservation_key)) BETWEEN 1 AND 200
    ),

  CONSTRAINT iris_ai_provider_reservations_state_check
    CHECK (
      state IN ('reserved', 'finalized', 'released')
    ),

  CONSTRAINT iris_ai_provider_reservations_month_start_check
    CHECK (EXTRACT(DAY FROM period_month) = 1),

  CONSTRAINT iris_ai_provider_reservations_reconciliation_check
    CHECK (
      (state = 'reserved' AND reconciled_at IS NULL)
      OR
      (state IN ('finalized', 'released') AND reconciled_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_iris_ai_provider_reservations_state
  ON iris_ai_provider_reservations (state, created_at);

CREATE INDEX IF NOT EXISTS idx_iris_ai_provider_reservations_period
  ON iris_ai_provider_reservations (
    period_month,
    period_day,
    state
  );


CREATE TABLE IF NOT EXISTS iris_ai_metrics (
  metric_name TEXT PRIMARY KEY,
  metric_value NUMERIC(30, 6) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT iris_ai_metrics_name_not_blank
    CHECK (
      LENGTH(TRIM(metric_name)) BETWEEN 1 AND 100
    ),

  CONSTRAINT iris_ai_metrics_value_check
    CHECK (metric_value >= 0)
);

COMMIT;
