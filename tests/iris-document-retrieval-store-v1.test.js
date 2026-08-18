"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  IrisRetrievalOperationalErrorV1,
  IrisRetrievalStoreErrorV1,
  createIrisDocumentRetrievalStoreV1,
  mapRetrievalRowV1,
  safeOperationalLogV1
} = require("../iris-document-retrieval-store-v1");

function createPoolV1(responses = []) {
  const calls = [];

  return {
    calls,
    async query(text, values) {
      calls.push({ text, values });
      const response = responses[calls.length - 1];

      if (response instanceof Error) {
        throw response;
      }

      return response || { rows: [] };
    }
  };
}

function validRequestV1(overrides = {}) {
  return {
    query: "LumiSpá limpieza",
    language: "es",
    country: "AR",
    now: "2026-08-18T12:00:00.000Z",
    ...overrides
  };
}

test("requiere un pool PostgreSQL válido", () => {
  assert.throws(
    () => createIrisDocumentRetrievalStoreV1({ pool: null }),
    IrisRetrievalStoreErrorV1
  );
});

test("rechaza entradas inválidas antes de consultar PostgreSQL", async () => {
  const pool = createPoolV1();
  const store = createIrisDocumentRetrievalStoreV1({ pool });

  for (const request of [
    validRequestV1({ query: "" }),
    validRequestV1({ query: "x".repeat(501) }),
    validRequestV1({ language: "ES" }),
    validRequestV1({ country: "Argentina" }),
    validRequestV1({ category: "NO VÁLIDA" }),
    validRequestV1({ productSlug: "../secret" }),
    validRequestV1({ limit: 0 }),
    validRequestV1({ limit: 11 }),
    validRequestV1({ now: "fecha-inválida" })
  ]) {
    await assert.rejects(
      store.retrieveDocumentChunks(request),
      IrisRetrievalStoreErrorV1
    );
  }

  assert.equal(pool.calls.length, 0);
});

test("normaliza la consulta y usa parámetros SQL", async () => {
  const pool = createPoolV1([
    { rows: [] },
    { rows: [] }
  ]);
  const store = createIrisDocumentRetrievalStoreV1({ pool });
  const malicious = "LumiSpá'; DROP TABLE users; --";

  await store.retrieveDocumentChunks(
    validRequestV1({ query: malicious })
  );

  assert.equal(pool.calls.length, 2);
  assert.equal(
    pool.calls[0].values[0],
    "lumispa'; drop table users; --"
  );
  assert.ok(!pool.calls[0].text.includes(malicious));
  assert.ok(!pool.calls[1].text.includes(malicious));
  assert.match(pool.calls[1].text, /websearch_to_tsquery/);
});

test("un alias exacto reemplaza término y producto cuando no hay filtro", async () => {
  const pool = createPoolV1([
    {
      rows: [{
        canonical_term: "ageLOC LumiSpa iO",
        product_slug: "lumispa"
      }]
    },
    { rows: [] }
  ]);
  const store = createIrisDocumentRetrievalStoreV1({ pool });

  await store.retrieveDocumentChunks(
    validRequestV1({ query: "LumiSpá" })
  );

  assert.equal(pool.calls[1].values[0], "ageloc lumispa io");
  assert.equal(pool.calls[1].values[4], "lumispa");
});

test("un filtro de producto explícito tiene prioridad sobre el alias", async () => {
  const pool = createPoolV1([
    {
      rows: [{
        canonical_term: "LumiSpa",
        product_slug: "lumispa"
      }]
    },
    { rows: [] }
  ]);
  const store = createIrisDocumentRetrievalStoreV1({ pool });

  await store.retrieveDocumentChunks(
    validRequestV1({
      query: "LumiSpa",
      productSlug: "wellspa"
    })
  );

  assert.equal(pool.calls[1].values[4], "wellspa");
});

test("aplica filtros, reloj y límite normalizados", async () => {
  const pool = createPoolV1([
    { rows: [] },
    { rows: [] }
  ]);
  const store = createIrisDocumentRetrievalStoreV1({ pool });

  await store.retrieveDocumentChunks(
    validRequestV1({
      category: "uso-producto",
      productSlug: "lumispa",
      limit: 3
    })
  );

  assert.deepEqual(
    pool.calls[1].values.slice(1, 5),
    ["es", "AR", "uso-producto", "lumispa"]
  );
  assert.ok(pool.calls[1].values[5] instanceof Date);
  assert.equal(pool.calls[1].values[6], 3);
});

test("la consulta exige autorización, actividad, vigencia y no retiro", async () => {
  const pool = createPoolV1([
    { rows: [] },
    { rows: [] }
  ]);
  const store = createIrisDocumentRetrievalStoreV1({ pool });

  await store.retrieveDocumentChunks(validRequestV1());

  const sql = pool.calls[1].text;
  assert.match(sql, /authorization_status = 'approved'/);
  assert.match(sql, /is_active = TRUE/);
  assert.match(sql, /retired_at IS NULL/);
  assert.match(sql, /effective_from <= \$6/);
  assert.match(sql, /effective_until > \$6/);
  assert.match(sql, /d\.country = \$3 OR d\.country = 'GLOBAL'/);
});

test("mapea solo campos públicos del contrato interno", async () => {
  const row = {
    document_key: "doc-version-1",
    document_family_key: "doc-family",
    title: "Guía autorizada",
    source_name: "Nu Skin",
    source_reference: "ref-interna",
    language: "es",
    country: "AR",
    category: "uso-producto",
    product_slug: "lumispa",
    version_label: "2026-08",
    effective_from: new Date("2026-08-01T00:00:00Z"),
    effective_until: null,
    chunk_index: "2",
    heading: "Limpieza",
    content: "Contenido autorizado.",
    score: "0.75",
    object_key: "privado/no-exponer",
    content_sha256: "a".repeat(64)
  };

  const mapped = mapRetrievalRowV1(row);

  assert.equal(mapped.chunkIndex, 2);
  assert.equal(mapped.score, 0.75);
  assert.equal(mapped.documentFamilyKey, "doc-family");
  assert.ok(!Object.hasOwn(mapped, "objectKey"));
  assert.ok(!Object.hasOwn(mapped, "contentSha256"));
});

test("devuelve resultados mapeados y ordenados por PostgreSQL", async () => {
  const row = {
    document_key: "doc-1",
    document_family_key: "family-1",
    title: "Documento",
    source_name: "Fuente",
    source_reference: "ref",
    language: "es",
    country: "GLOBAL",
    category: "general",
    product_slug: null,
    version_label: null,
    effective_from: null,
    effective_until: null,
    chunk_index: 0,
    heading: null,
    content: "Respuesta documental.",
    score: 0.5
  };
  const pool = createPoolV1([
    { rows: [] },
    { rows: [row] }
  ]);
  const store = createIrisDocumentRetrievalStoreV1({ pool });

  const result = await store.retrieveDocumentChunks(validRequestV1());

  assert.equal(result.length, 1);
  assert.equal(result[0].documentKey, "doc-1");
  assert.equal(result[0].content, "Respuesta documental.");
});

test("sanea errores operativos sin registrar consulta ni valores", async () => {
  const databaseError = Object.assign(
    new Error("falló con contenido sensible"),
    {
      code: "40001",
      constraint: "idx_iris_test",
      query: "pregunta privada"
    }
  );
  const pool = createPoolV1([databaseError]);
  const logs = [];
  const store = createIrisDocumentRetrievalStoreV1({
    pool,
    logError: entry => logs.push(entry)
  });

  await assert.rejects(
    store.retrieveDocumentChunks(validRequestV1()),
    IrisRetrievalOperationalErrorV1
  );

  assert.deepEqual(logs, [{
    operation: "retrieve_document_chunks_v1",
    errorCode: "40001",
    constraint: "idx_iris_test",
    retryable: true
  }]);
  assert.ok(!JSON.stringify(logs).includes("sensible"));
  assert.ok(!JSON.stringify(logs).includes("privada"));
});

test("clasifica errores operativos sin exponer el objeto original", () => {
  const safe = safeOperationalLogV1(
    {
      code: "08006",
      constraint: "safe_constraint",
      message: "secreto"
    },
    "operation"
  );

  assert.deepEqual(safe, {
    operation: "operation",
    errorCode: "08006",
    constraint: "safe_constraint",
    retryable: true
  });
});
