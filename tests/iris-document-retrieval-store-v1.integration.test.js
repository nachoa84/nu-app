"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { Client } = require("pg");

const {
  createIrisDocumentRetrievalStoreV1
} = require("../iris-document-retrieval-store-v1");

const connectionString = process.env.IRIS_V1_TEST_DATABASE_URL || "";

function migrationBodyV1() {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "migration-iris-document-retrieval-v1.sql"
    ),
    "utf8"
  );

  return migration
    .split("\n")
    .filter(line => {
      const trimmed = line.trim().toUpperCase();
      return trimmed !== "BEGIN;" && trimmed !== "COMMIT;";
    })
    .join("\n");
}

test(
  "recupera contenido elegible en PostgreSQL y revierte todo",
  { skip: !connectionString },
  async () => {
    const client = new Client({
      connectionString,
      ssl: connectionString.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
    });

    await client.connect();

    try {
      await client.query("BEGIN");
      await client.query(migrationBodyV1());

      const documents = await client.query(
        `INSERT INTO iris_documents (
           document_key,
           document_family_key,
           title,
           source_name,
           source_reference,
           rights_holder,
           authorization_status,
           authorization_reference,
           language,
           country,
           category,
           product_slug,
           version_label,
           effective_from,
           object_key,
           mime_type,
           content_sha256,
           is_active
         )
         VALUES
           (
             'doc-ar-v1',
             'family-ar',
             'Guía Argentina',
             'Nu Skin',
             'authorized-ref-ar',
             'Nu Skin',
             'approved',
             'approval-ar',
             'es',
             'AR',
             'uso-producto',
             'lumispa',
             'v1',
             '2026-01-01T00:00:00Z',
             'iris/test/doc-ar',
             'application/pdf',
             $1,
             TRUE
           ),
           (
             'doc-global-v1',
             'family-global',
             'Guía Global',
             'Nu Skin',
             'authorized-ref-global',
             'Nu Skin',
             'approved',
             'approval-global',
             'es',
             'GLOBAL',
             'uso-producto',
             'lumispa',
             'v1',
             '2026-01-01T00:00:00Z',
             'iris/test/doc-global',
             'application/pdf',
             $2,
             TRUE
           ),
           (
             'doc-retired-v1',
             'family-retired',
             'Guía Retirada',
             'Nu Skin',
             'authorized-ref-retired',
             'Nu Skin',
             'approved',
             'approval-retired',
             'es',
             'AR',
             'uso-producto',
             'lumispa',
             'v1',
             '2025-01-01T00:00:00Z',
             'iris/test/doc-retired',
             'application/pdf',
             $3,
             FALSE
           )
         RETURNING id, document_key`,
        [
          "a".repeat(64),
          "b".repeat(64),
          "c".repeat(64)
        ]
      );

      const ids = Object.fromEntries(
        documents.rows.map(row => [
          row.document_key,
          row.id
        ])
      );

      await client.query(
        `UPDATE iris_documents
         SET retired_at = '2026-01-01T00:00:00Z'
         WHERE document_key = 'doc-retired-v1'`
      );

      await client.query(
        `INSERT INTO iris_document_chunks (
           document_id,
           chunk_index,
           heading,
           content,
           content_sha256,
           search_text_normalized,
           character_start,
           character_end
         )
         VALUES
           ($1, 0, 'Limpieza', 'Contenido argentino LumiSpa.', $4, 'limpieza facial lumispa', 0, 28),
           ($2, 0, 'Limpieza', 'Contenido global LumiSpa.', $5, 'limpieza facial lumispa', 0, 25),
           ($3, 0, 'Limpieza', 'Contenido retirado LumiSpa.', $6, 'limpieza facial lumispa', 0, 27)`,
        [
          ids["doc-ar-v1"],
          ids["doc-global-v1"],
          ids["doc-retired-v1"],
          "d".repeat(64),
          "e".repeat(64),
          "f".repeat(64)
        ]
      );

      await client.query(
        `INSERT INTO iris_search_aliases (
           alias_normalized,
           canonical_term,
           product_slug,
           language,
           country
         )
         VALUES ('lumispa', 'limpieza facial lumispa', 'lumispa', 'es', NULL)`
      );

      const store = createIrisDocumentRetrievalStoreV1({
        pool: {
          query: (text, values) => client.query(text, values)
        }
      });

      const argentina = await store.retrieveDocumentChunks({
        query: "LumiSpá",
        language: "es",
        country: "AR",
        category: "uso-producto",
        now: "2026-08-18T12:00:00Z"
      });

      assert.deepEqual(
        argentina.map(item => item.documentKey),
        ["doc-ar-v1", "doc-global-v1"]
      );
      assert.ok(
        argentina.every(
          item => item.documentKey !== "doc-retired-v1"
        )
      );
      assert.ok(
        argentina.every(
          item => !Object.hasOwn(item, "objectKey")
        )
      );

      const chile = await store.retrieveDocumentChunks({
        query: "lumispa",
        language: "es",
        country: "CL",
        category: "uso-producto",
        now: "2026-08-18T12:00:00Z"
      });

      assert.deepEqual(
        chile.map(item => item.documentKey),
        ["doc-global-v1"]
      );

      await client.query("ROLLBACK");

      const residual = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM (
           VALUES
             ('iris_documents'),
             ('iris_document_chunks'),
             ('iris_search_aliases'),
             ('iris_document_audit')
         ) AS expected(name)
         WHERE to_regclass('public.' || name) IS NOT NULL`
      );

      assert.equal(residual.rows[0].total, 0);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // La desconexión también revierte la transacción abierta.
      }
      throw error;
    } finally {
      await client.end();
    }
  }
);
