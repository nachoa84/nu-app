-- ============================================================
-- NU APP · IRIS RECUPERACIÓN DOCUMENTAL V1
-- Archivo: migration-iris-document-retrieval-v1.sql
--
-- Crea exclusivamente tablas e índices nuevos para:
--   1. documentos y versiones autorizadas;
--   2. fragmentos recuperables mediante PostgreSQL FTS;
--   3. aliases normalizados;
--   4. auditoría administrativa de contenido.
--
-- SEGURIDAD:
--   - Migración aditiva e idempotente.
--   - No usa DROP, TRUNCATE ni ALTER sobre tablas existentes.
--   - No instala extensiones.
--   - No ejecuta ingesta ni activa documentos.
--   - No modifica usuarios, rutinas, notificaciones, cron u objetos.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS iris_documents (
  id BIGSERIAL PRIMARY KEY,
  document_key TEXT NOT NULL,
  document_family_key TEXT NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  rights_holder TEXT NOT NULL,
  authorization_status TEXT NOT NULL DEFAULT 'pending',
  authorization_reference TEXT,
  language TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'GLOBAL',
  category TEXT NOT NULL,
  product_slug TEXT,
  version_label TEXT,
  effective_from TIMESTAMPTZ,
  effective_until TIMESTAMPTZ,
  object_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT iris_documents_document_key_unique
    UNIQUE (document_key),
  CONSTRAINT iris_documents_object_key_unique
    UNIQUE (object_key),
  CONSTRAINT iris_documents_content_sha256_unique
    UNIQUE (content_sha256),
  CONSTRAINT iris_documents_document_key_not_blank
    CHECK (LENGTH(TRIM(document_key)) > 0),
  CONSTRAINT iris_documents_family_key_not_blank
    CHECK (LENGTH(TRIM(document_family_key)) > 0),
  CONSTRAINT iris_documents_title_not_blank
    CHECK (LENGTH(TRIM(title)) > 0),
  CONSTRAINT iris_documents_source_name_not_blank
    CHECK (LENGTH(TRIM(source_name)) > 0),
  CONSTRAINT iris_documents_source_reference_not_blank
    CHECK (LENGTH(TRIM(source_reference)) > 0),
  CONSTRAINT iris_documents_rights_holder_not_blank
    CHECK (LENGTH(TRIM(rights_holder)) > 0),
  CONSTRAINT iris_documents_category_not_blank
    CHECK (LENGTH(TRIM(category)) > 0),
  CONSTRAINT iris_documents_object_key_not_blank
    CHECK (LENGTH(TRIM(object_key)) > 0),
  CONSTRAINT iris_documents_authorization_status_check
    CHECK (authorization_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT iris_documents_language_check
    CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  CONSTRAINT iris_documents_country_check
    CHECK (country = 'GLOBAL' OR country ~ '^[A-Z]{2}$'),
  CONSTRAINT iris_documents_mime_type_check
    CHECK (mime_type = 'application/pdf'),
  CONSTRAINT iris_documents_content_sha256_check
    CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT iris_documents_effective_dates_check
    CHECK (
      effective_from IS NULL
      OR effective_until IS NULL
      OR effective_until > effective_from
    ),
  CONSTRAINT iris_documents_retired_inactive_check
    CHECK (retired_at IS NULL OR is_active = FALSE),
  CONSTRAINT iris_documents_activation_check
    CHECK (
      is_active = FALSE
      OR (
        authorization_status = 'approved'
        AND LENGTH(TRIM(COALESCE(authorization_reference, ''))) > 0
        AND retired_at IS NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_iris_documents_version_scope
  ON iris_documents (
    document_family_key,
    COALESCE(version_label, ''),
    language,
    country
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_iris_documents_one_active_version
  ON iris_documents (document_family_key, language, country)
  WHERE is_active = TRUE AND retired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_iris_documents_active_filters
  ON iris_documents (language, country, category, product_slug)
  WHERE is_active = TRUE AND retired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_iris_documents_effective_dates
  ON iris_documents (effective_from, effective_until);

CREATE TABLE IF NOT EXISTS iris_document_chunks (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading TEXT,
  content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  search_text_normalized TEXT NOT NULL,
  character_start INTEGER NOT NULL,
  character_end INTEGER NOT NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(
      to_tsvector('simple'::regconfig, COALESCE(heading, '')),
      'A'
    )
    ||
    setweight(
      to_tsvector('simple'::regconfig, search_text_normalized),
      'B'
    )
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT iris_document_chunks_document_fk
    FOREIGN KEY (document_id)
    REFERENCES iris_documents(id)
    ON DELETE RESTRICT,
  CONSTRAINT iris_document_chunks_document_index_unique
    UNIQUE (document_id, chunk_index),
  CONSTRAINT iris_document_chunks_index_check
    CHECK (chunk_index >= 0),
  CONSTRAINT iris_document_chunks_content_length_check
    CHECK (CHAR_LENGTH(content) BETWEEN 1 AND 2000),
  CONSTRAINT iris_document_chunks_hash_check
    CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT iris_document_chunks_search_text_check
    CHECK (LENGTH(TRIM(search_text_normalized)) > 0),
  CONSTRAINT iris_document_chunks_positions_check
    CHECK (
      character_start >= 0
      AND character_end > character_start
    )
);

CREATE INDEX IF NOT EXISTS idx_iris_document_chunks_document
  ON iris_document_chunks (document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_iris_document_chunks_search_vector
  ON iris_document_chunks
  USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS iris_search_aliases (
  id BIGSERIAL PRIMARY KEY,
  alias_normalized TEXT NOT NULL,
  canonical_term TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  language TEXT,
  country TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT iris_search_aliases_alias_not_blank
    CHECK (LENGTH(TRIM(alias_normalized)) > 0),
  CONSTRAINT iris_search_aliases_canonical_not_blank
    CHECK (LENGTH(TRIM(canonical_term)) > 0),
  CONSTRAINT iris_search_aliases_product_not_blank
    CHECK (LENGTH(TRIM(product_slug)) > 0),
  CONSTRAINT iris_search_aliases_language_check
    CHECK (
      language IS NULL
      OR language ~ '^[a-z]{2}(-[A-Z]{2})?$'
    ),
  CONSTRAINT iris_search_aliases_country_check
    CHECK (
      country IS NULL
      OR country = 'GLOBAL'
      OR country ~ '^[A-Z]{2}$'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_iris_search_aliases_scope
  ON iris_search_aliases (
    alias_normalized,
    COALESCE(language, ''),
    COALESCE(country, '')
  );

CREATE INDEX IF NOT EXISTS idx_iris_search_aliases_active_product
  ON iris_search_aliases (product_slug, language, country)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS iris_document_audit (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT,
  actor_key_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  client_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT iris_document_audit_document_fk
    FOREIGN KEY (document_id)
    REFERENCES iris_documents(id)
    ON DELETE RESTRICT,
  CONSTRAINT iris_document_audit_actor_not_blank
    CHECK (LENGTH(TRIM(actor_key_id)) > 0),
  CONSTRAINT iris_document_audit_action_check
    CHECK (
      action IN (
        'document_created',
        'document_reviewed',
        'document_activated',
        'document_rejected',
        'document_retired',
        'document_replaced'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_iris_document_audit_created
  ON iris_document_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_iris_document_audit_action
  ON iris_document_audit (action);

CREATE INDEX IF NOT EXISTS idx_iris_document_audit_document
  ON iris_document_audit (document_id, created_at DESC)
  WHERE document_id IS NOT NULL;

COMMIT;
