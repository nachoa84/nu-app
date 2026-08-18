"use strict";

const {
  normalizeIrisSearchTextV1
} = require("./iris-document-chunker-v1");

const DEFAULT_LIMIT_V1 = 5;
const MAX_LIMIT_V1 = 10;
const MAX_QUERY_LENGTH_V1 = 500;
const FILTER_PATTERN_V1 = /^[a-z0-9][a-z0-9-]{0,63}$/;

class IrisRetrievalStoreErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisRetrievalStoreErrorV1";
  }
}

class IrisRetrievalOperationalErrorV1 extends Error {
  constructor() {
    super("No se pudo completar la recuperación documental.");
    this.name = "IrisRetrievalOperationalErrorV1";
  }
}

function normalizeRequiredCodeV1(value, label, pattern) {
  if (typeof value !== "string") {
    throw new IrisRetrievalStoreErrorV1(
      `${label} debe ser una cadena.`
    );
  }

  const normalized = value.trim();

  if (!pattern.test(normalized)) {
    throw new IrisRetrievalStoreErrorV1(
      `${label} no tiene un formato válido.`
    );
  }

  return normalized;
}

function normalizeOptionalFilterV1(value, label) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return normalizeRequiredCodeV1(
    value,
    label,
    FILTER_PATTERN_V1
  );
}

function normalizeLimitV1(value) {
  const limit = value === undefined
    ? DEFAULT_LIMIT_V1
    : value;

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT_V1
  ) {
    throw new IrisRetrievalStoreErrorV1(
      `limit debe ser un entero entre 1 y ${MAX_LIMIT_V1}.`
    );
  }

  return limit;
}

function normalizeNowV1(value) {
  const now = value === undefined
    ? new Date()
    : new Date(value);

  if (Number.isNaN(now.getTime())) {
    throw new IrisRetrievalStoreErrorV1(
      "now debe representar una fecha válida."
    );
  }

  return now;
}

function safeOperationalLogV1(error, operation) {
  return {
    operation,
    errorCode:
      typeof error?.code === "string"
        ? error.code
        : "",
    constraint:
      typeof error?.constraint === "string"
        ? error.constraint
        : "",
    retryable:
      Boolean(
        error?.code === "40001" ||
        error?.code === "40P01" ||
        error?.code === "08006"
      )
  };
}

function mapRetrievalRowV1(row) {
  return {
    documentKey: row.document_key,
    documentFamilyKey: row.document_family_key,
    title: row.title,
    sourceName: row.source_name,
    sourceReference: row.source_reference,
    language: row.language,
    country: row.country,
    category: row.category,
    productSlug: row.product_slug,
    versionLabel: row.version_label,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    chunkIndex: Number(row.chunk_index),
    heading: row.heading,
    content: row.content,
    score: Number(row.score)
  };
}

function createIrisDocumentRetrievalStoreV1({
  pool,
  normalizeSearchText = normalizeIrisSearchTextV1,
  logError = () => {}
}) {
  if (!pool || typeof pool.query !== "function") {
    throw new IrisRetrievalStoreErrorV1(
      "Se requiere un pool PostgreSQL válido."
    );
  }

  if (typeof normalizeSearchText !== "function") {
    throw new IrisRetrievalStoreErrorV1(
      "Se requiere un normalizador de búsqueda."
    );
  }

  if (typeof logError !== "function") {
    throw new IrisRetrievalStoreErrorV1(
      "logError debe ser una función."
    );
  }

  async function retrieveDocumentChunks({
    query,
    language,
    country,
    category = null,
    productSlug = null,
    limit = DEFAULT_LIMIT_V1,
    now
  } = {}) {
    if (typeof query !== "string") {
      throw new IrisRetrievalStoreErrorV1(
        "query debe ser una cadena."
      );
    }

    if (query.length > MAX_QUERY_LENGTH_V1) {
      throw new IrisRetrievalStoreErrorV1(
        `query no puede superar ${MAX_QUERY_LENGTH_V1} caracteres.`
      );
    }

    const normalizedQuery = normalizeSearchText(query);
    if (
      typeof normalizedQuery !== "string" ||
      !normalizedQuery.trim()
    ) {
      throw new IrisRetrievalStoreErrorV1(
        "query no contiene texto recuperable."
      );
    }

    const normalizedLanguage = normalizeRequiredCodeV1(
      language,
      "language",
      /^[a-z]{2}(-[A-Z]{2})?$/
    );
    const normalizedCountry = normalizeRequiredCodeV1(
      country,
      "country",
      /^(GLOBAL|[A-Z]{2})$/
    );
    const normalizedCategory = normalizeOptionalFilterV1(
      category,
      "category"
    );
    const normalizedProduct = normalizeOptionalFilterV1(
      productSlug,
      "productSlug"
    );
    const normalizedLimit = normalizeLimitV1(limit);
    const normalizedNow = normalizeNowV1(now);

    try {
      const aliasResult = await pool.query(
        `SELECT
           canonical_term,
           product_slug
         FROM iris_search_aliases
         WHERE is_active = TRUE
           AND alias_normalized = $1
           AND (language IS NULL OR language = $2)
           AND (
             country IS NULL
             OR country = 'GLOBAL'
             OR country = $3
           )
         ORDER BY
           (language = $2) DESC,
           (country = $3) DESC,
           id ASC
         LIMIT 1`,
        [
          normalizedQuery,
          normalizedLanguage,
          normalizedCountry
        ]
      );

      const alias = aliasResult.rows[0] || null;
      const effectiveQuery = alias
        ? normalizeSearchText(alias.canonical_term)
        : normalizedQuery;
      const effectiveProduct = normalizedProduct ||
        (alias ? alias.product_slug : null);

      if (!effectiveQuery) {
        return [];
      }

      const result = await pool.query(
        `WITH iris_query AS (
           SELECT websearch_to_tsquery(
             'simple'::regconfig,
             $1
           ) AS value
         )
         SELECT
           d.document_key,
           d.document_family_key,
           d.title,
           d.source_name,
           d.source_reference,
           d.language,
           d.country,
           d.category,
           d.product_slug,
           d.version_label,
           d.effective_from,
           d.effective_until,
           c.chunk_index,
           c.heading,
           c.content,
           ts_rank_cd(c.search_vector, iris_query.value) AS score
         FROM iris_document_chunks AS c
         INNER JOIN iris_documents AS d
           ON d.id = c.document_id
         CROSS JOIN iris_query
         WHERE c.search_vector @@ iris_query.value
           AND d.authorization_status = 'approved'
           AND d.is_active = TRUE
           AND d.retired_at IS NULL
           AND d.language = $2
           AND (d.country = $3 OR d.country = 'GLOBAL')
           AND ($4::text IS NULL OR d.category = $4)
           AND ($5::text IS NULL OR d.product_slug = $5)
           AND (
             d.effective_from IS NULL
             OR d.effective_from <= $6::timestamptz
           )
           AND (
             d.effective_until IS NULL
             OR d.effective_until > $6::timestamptz
           )
         ORDER BY
           (d.country = $3) DESC,
           (d.product_slug = $5) DESC NULLS LAST,
           score DESC,
           d.effective_from DESC NULLS LAST,
           d.id ASC,
           c.chunk_index ASC
         LIMIT $7`,
        [
          effectiveQuery,
          normalizedLanguage,
          normalizedCountry,
          normalizedCategory,
          effectiveProduct,
          normalizedNow,
          normalizedLimit
        ]
      );

      return result.rows.map(mapRetrievalRowV1);
    } catch (error) {
      logError(
        safeOperationalLogV1(
          error,
          "retrieve_document_chunks_v1"
        )
      );
      throw new IrisRetrievalOperationalErrorV1();
    }
  }

  return {
    retrieveDocumentChunks
  };
}

module.exports = {
  DEFAULT_LIMIT_V1,
  MAX_LIMIT_V1,
  MAX_QUERY_LENGTH_V1,
  IrisRetrievalOperationalErrorV1,
  IrisRetrievalStoreErrorV1,
  createIrisDocumentRetrievalStoreV1,
  mapRetrievalRowV1,
  safeOperationalLogV1
};
