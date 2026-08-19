"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { Client } = require("pg");

const {
  createIrisDocumentReviewStoreV1
} = require("../iris-document-review-store-v1");

const connectionString = process.env.IRIS_V1_TEST_DATABASE_URL || "";
const developmentOnly =
  process.env.NODE_ENV === "development" &&
  process.env.IRIS_REVIEW_ENVIRONMENT === "development";
const shouldRun = Boolean(connectionString) && developmentOnly;

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

function rollbackControlledPoolV1(client) {
  return {
    async connect() {
      return {
        async query(text, values) {
          if (text === "BEGIN") {
            return client.query("SAVEPOINT iris_review_store_v1");
          }
          if (text === "COMMIT") {
            return client.query("RELEASE SAVEPOINT iris_review_store_v1");
          }
          if (text === "ROLLBACK") {
            await client.query(
              "ROLLBACK TO SAVEPOINT iris_review_store_v1"
            );
            return client.query(
              "RELEASE SAVEPOINT iris_review_store_v1"
            );
          }
          return client.query(text, values);
        },
        release() {
          // La conexión pertenece a la transacción externa del test.
        }
      };
    }
  };
}

async function assertSyntheticDocumentAbsentV1(client, documentKey) {
  const relation = await client.query(
    "SELECT to_regclass('public.iris_documents') AS relation"
  );

  if (relation.rows[0].relation === null) {
    return;
  }

  const residual = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM iris_documents
     WHERE document_key = $1`,
    [documentKey]
  );
  assert.equal(residual.rows[0].total, 0);
}

test(
  "review store integra con PostgreSQL solo en development y revierte todo",
  {
    skip: shouldRun
      ? false
      : "requiere IRIS_V1_TEST_DATABASE_URL, NODE_ENV=development e IRIS_REVIEW_ENVIRONMENT=development"
  },
  async () => {
    const documentKey = "iris-review-integration-v1";
    const actorKeyId = "iris-review-integration-actor-v1";
    const client = new Client({
      connectionString,
      ssl: false
    });

    await client.connect();

    try {
      await assertSyntheticDocumentAbsentV1(client, documentKey);
      await client.query("BEGIN");
      await client.query(migrationBodyV1());

      await client.query(
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
         VALUES (
           $1,
           'iris-review-integration-family-v1',
           'Documento sintético de integración',
           'Iris integration test',
           'synthetic-reference-v1',
           'Iris integration test',
           'pending',
           'synthetic-authorization-v1',
           'es',
           'AR',
           'integration-test',
           'synthetic-product',
           'v1',
           '2026-08-19T00:00:00Z',
           'iris/integration/review-store-v1.pdf',
           'application/pdf',
           $2,
           FALSE
         )`,
        [documentKey, "9".repeat(64)]
      );

      const store = createIrisDocumentReviewStoreV1({
        pool: rollbackControlledPoolV1(client)
      });

      const reviewed = await store.transitionDocument({
        documentKey,
        operation: "review",
        actorKeyId,
        now: "2026-08-19T15:00:00.000Z"
      });

      assert.deepEqual(reviewed, {
        authorizationStatus: "pending",
        isActive: false,
        retired: false
      });

      const afterReview = await client.query(
        `SELECT authorization_status, is_active, retired_at
         FROM iris_documents
         WHERE document_key = $1`,
        [documentKey]
      );
      assert.deepEqual(afterReview.rows[0], {
        authorization_status: "pending",
        is_active: false,
        retired_at: null
      });

      const reviewAudit = await client.query(
        `SELECT actor_key_id, action, details, client_ip
         FROM iris_document_audit
         WHERE document_id = (
           SELECT id FROM iris_documents WHERE document_key = $1
         )
         ORDER BY id ASC`,
        [documentKey]
      );
      assert.deepEqual(reviewAudit.rows, [{
        actor_key_id: actorKeyId,
        action: "document_reviewed",
        details: { decision: "reviewed" },
        client_ip: null
      }]);

      const approved = await store.transitionDocument({
        documentKey,
        operation: "approve",
        actorKeyId,
        now: "2026-08-19T15:01:00.000Z"
      });

      assert.deepEqual(approved, {
        authorizationStatus: "approved",
        isActive: false,
        retired: false
      });

      const afterApprove = await client.query(
        `SELECT authorization_status, is_active, retired_at
         FROM iris_documents
         WHERE document_key = $1`,
        [documentKey]
      );
      assert.deepEqual(afterApprove.rows[0], {
        authorization_status: "approved",
        is_active: false,
        retired_at: null
      });

      const finalAudit = await client.query(
        `SELECT actor_key_id, action, details, client_ip
         FROM iris_document_audit
         WHERE document_id = (
           SELECT id FROM iris_documents WHERE document_key = $1
         )
         ORDER BY id ASC`,
        [documentKey]
      );
      assert.deepEqual(finalAudit.rows, [
        {
          actor_key_id: actorKeyId,
          action: "document_reviewed",
          details: { decision: "reviewed" },
          client_ip: null
        },
        {
          actor_key_id: actorKeyId,
          action: "document_reviewed",
          details: { decision: "approved" },
          client_ip: null
        }
      ]);

      await client.query("ROLLBACK");
      await assertSyntheticDocumentAbsentV1(client, documentKey);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // La desconexión también revierte una transacción abierta.
      }
      throw error;
    } finally {
      await client.end();
    }
  }
);
