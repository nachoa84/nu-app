-- ============================================================
-- NU APP · MIGRACIÓN PILOTO DE IDENTIDAD V0
-- Archivo: migration-pilot-identity-v0.sql
-- Fecha: 2026-08-16
--
-- Crea tres tablas para el piloto de identidad:
--   1. pilot_invitations    — Códigos de invitación (registro y recuperación)
--   2. pilot_credentials    — Tokens de sesión por dispositivo
--   3. pilot_admin_audit    — Registro de acciones administrativas
--
-- REGLAS:
--   - Idempotente: puede ejecutarse múltiples veces.
--   - No usa DROP ni modifica tablas existentes.
--   - No depende de pgcrypto.
--   - Foreign keys usan TEXT para coincidir con users.id.
--   - Sin secretos ni tokens en texto plano.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. pilot_invitations
-- ============================================================
-- Propósito: Almacenar códigos de invitación para registro de
-- nuevos usuarios y recuperación de cuentas existentes.
--
-- Seguridad:
--   - code_hmac es obligatorio y único (hash del código real).
--   - No se almacena el código en texto plano.
--   - recovery_user_id vincula a users.id para recuperaciones.
--   - CHECK garantiza coherencia entre tipo y recovery_user_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS pilot_invitations (
  id              BIGSERIAL PRIMARY KEY,
  code_hmac       TEXT NOT NULL,
  invitation_type TEXT NOT NULL,
  recovery_user_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  used_by_user_id TEXT,

  -- code_hmac debe ser único para evitar colisiones
  CONSTRAINT pilot_invitations_code_hmac_unique
    UNIQUE (code_hmac),

  -- invitation_type solo admite valores permitidos
  CONSTRAINT pilot_invitations_type_check
    CHECK (invitation_type IN ('registration', 'recovery')),

  -- Invitación de registro: recovery_user_id debe ser NULL
  -- Invitación de recuperación: recovery_user_id debe ser NOT NULL
  CONSTRAINT pilot_invitations_recovery_user_check
    CHECK (
      (invitation_type = 'registration' AND recovery_user_id IS NULL)
      OR
      (invitation_type = 'recovery' AND recovery_user_id IS NOT NULL)
    ),

  -- Si se usó, debe existir el usuario que la usó
  CONSTRAINT pilot_invitations_used_by_user_fk
    FOREIGN KEY (used_by_user_id) REFERENCES users(id)
      ON DELETE CASCADE,

  -- recovery_user_id, cuando existe, debe referenciar a un usuario real
  CONSTRAINT pilot_invitations_recovery_user_fk
    FOREIGN KEY (recovery_user_id) REFERENCES users(id)
      ON DELETE CASCADE,

  -- Si está usada, debe tener fecha de uso coherente con la creación
  CONSTRAINT pilot_invitations_used_at_check
    CHECK (
      (used_at IS NULL AND used_by_user_id IS NULL)
      OR
      (used_at IS NOT NULL AND used_by_user_id IS NOT NULL)
    ),

  -- Vigencia temporal coherente
  CONSTRAINT pilot_invitations_dates_check
    CHECK (
      expires_at > created_at
      AND
      (used_at IS NULL OR used_at >= created_at)
    )
);

-- Índice para listar invitaciones de recuperación pendientes de un usuario
CREATE INDEX IF NOT EXISTS idx_pilot_invitations_recovery_user
  ON pilot_invitations(recovery_user_id)
  WHERE recovery_user_id IS NOT NULL;

-- Índice para listar invitaciones usadas por un usuario específico
CREATE INDEX IF NOT EXISTS idx_pilot_invitations_used_by
  ON pilot_invitations(used_by_user_id)
  WHERE used_by_user_id IS NOT NULL;

-- ============================================================
-- 2. pilot_credentials
-- ============================================================
-- Propósito: Almacenar tokens de sesión (hasheados) para
-- dispositivos autenticados del piloto.
--
-- Seguridad:
--   - token_hmac es obligatorio y único (hash del token real).
--   - Un solo dispositivo activo por usuario mediante índice parcial.
--   - revoked_at permite revocación sin borrar el registro.
-- ============================================================

CREATE TABLE IF NOT EXISTS pilot_credentials (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  token_hmac    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ,

  -- token_hmac debe ser único para evitar colisiones
  CONSTRAINT pilot_credentials_token_hmac_unique
    UNIQUE (token_hmac),

  -- Vinculación obligatoria con users.id; eliminar usuario elimina credenciales
  CONSTRAINT pilot_credentials_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE CASCADE,

  -- No puede expirar antes de crearse
  CONSTRAINT pilot_credentials_dates_check
    CHECK (expires_at > created_at),

  -- Si está revocado, la fecha debe ser coherente
  CONSTRAINT pilot_credentials_revoked_check
    CHECK (
      revoked_at IS NULL
      OR
      (revoked_at IS NOT NULL AND revoked_at >= created_at)
    )
);

-- Índice parcial: un solo dispositivo activo por usuario.
-- Garantiza que no haya dos credenciales no revocadas para el mismo user_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_credentials_one_active_per_user
  ON pilot_credentials(user_id)
  WHERE revoked_at IS NULL;

-- Índice para listar credenciales de un usuario (activas o históricas)
CREATE INDEX IF NOT EXISTS idx_pilot_credentials_user_id
  ON pilot_credentials(user_id);

-- ============================================================
-- 3. pilot_admin_audit
-- ============================================================
-- Propósito: Registro inmutable de acciones administrativas
-- sobre el sistema del piloto.
--
-- Seguridad:
--   - No almacena tokens ni secretos en texto plano.
--   - La IP se guarda en formato anonimizado o representación segura
--     (responsabilidad de la aplicación: truncar último octeto, etc.).
--   - details usa JSONB para flexibilidad sin esquema rígido.
-- ============================================================

CREATE TABLE IF NOT EXISTS pilot_admin_audit (
  id              BIGSERIAL PRIMARY KEY,
  admin_key_id    TEXT NOT NULL,
  action          TEXT NOT NULL,
  target_user_id  TEXT,
  details         JSONB,
  client_ip       INET,  -- PostgreSQL almacena IPs de forma estructurada;
                         -- la aplicación debe anonimizar antes de insertar.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- target_user_id, cuando existe, referencia a users.id;
  -- al eliminar el usuario, se preserva la auditoría con target_user_id = NULL
  CONSTRAINT pilot_admin_audit_target_user_fk
    FOREIGN KEY (target_user_id) REFERENCES users(id)
      ON DELETE SET NULL,

  -- admin_key_id no puede estar vacío
  CONSTRAINT pilot_admin_audit_key_check
    CHECK (LENGTH(TRIM(admin_key_id)) > 0),

  -- action no puede estar vacío
  CONSTRAINT pilot_admin_audit_action_check
    CHECK (LENGTH(TRIM(action)) > 0)
);

-- Índice para consultas por rango de fecha (más común: recientes primero)
CREATE INDEX IF NOT EXISTS idx_pilot_admin_audit_created_at
  ON pilot_admin_audit(created_at DESC);

-- Índice para filtrar por tipo de acción
CREATE INDEX IF NOT EXISTS idx_pilot_admin_audit_action
  ON pilot_admin_audit(action);

-- Índice para buscar auditoría de un usuario específico
CREATE INDEX IF NOT EXISTS idx_pilot_admin_audit_target_user
  ON pilot_admin_audit(target_user_id)
  WHERE target_user_id IS NOT NULL;

-- Índice compuesto para consultas administrativas frecuentes:
-- "acciones de un admin_key_id en un rango de fechas"
CREATE INDEX IF NOT EXISTS idx_pilot_admin_audit_admin_created
  ON pilot_admin_audit(admin_key_id, created_at DESC);

COMMIT;
