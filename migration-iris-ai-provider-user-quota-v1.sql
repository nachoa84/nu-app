-- ============================================================
-- NU APP · IRIS AI PROVIDER USER QUOTA V1
--
-- Separa la cuota de llamadas reales al proveedor de las
-- consultas locales/documentales de Iris.
--
-- SEGURIDAD:
--   - Migración aditiva e idempotente.
--   - No modifica ni elimina contadores existentes.
--   - No activa IA ni proveedores.
--   - No almacena preguntas, respuestas, documentos ni secretos.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS iris_ai_provider_usage_counters (
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  period_day DATE NOT NULL,
  used_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT iris_ai_provider_usage_counters_pk
    PRIMARY KEY (scope_type, scope_key, period_day),

  CONSTRAINT iris_ai_provider_usage_counters_scope_type_check
    CHECK (scope_type IN ('user', 'device')),

  CONSTRAINT iris_ai_provider_usage_counters_scope_key_not_blank
    CHECK (LENGTH(TRIM(scope_key)) BETWEEN 1 AND 200),

  CONSTRAINT iris_ai_provider_usage_counters_used_count_check
    CHECK (used_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_iris_ai_provider_usage_counters_day
  ON iris_ai_provider_usage_counters (period_day, scope_type);

COMMIT;
