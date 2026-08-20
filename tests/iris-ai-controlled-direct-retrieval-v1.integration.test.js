"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { Client } = require("pg");

const {
  initializeIrisAiServerRuntimeV1
} = require("../iris-ai-server-runtime-v1");
const {
  runControlledIrisAiExecutionV1
} = require("../iris-ai-controlled-execution-v1");

const connectionString = process.env.IRIS_V1_TEST_DATABASE_URL || "";
const shouldRun =
  Boolean(connectionString) &&
  process.env.NODE_ENV === "development" &&
  process.env.IRIS_AI_TEST_ENVIRONMENT === "development" &&
  process.env.IRIS_AI_CONTROLLED_EXECUTION === "true";

const DOCUMENT_KEY = "iris-test-controlled-direct-retrieval-v1";
const USER_SCOPE = "iris_test:controlled_direct_retrieval_v1";
const DEVICE_SCOPE = "iris_test:controlled_direct_device_v1";
const UNIQUE_TERM = "zzqvdirect731946825";
const PRODUCT_SLUG = "synthetic-direct";

function migrationBodyV1(filename) {
  const raw = fs.readFileSync(
    path.join(__dirname, "..", filename),
    "utf8"
  );

  return raw
    .split("\n")
    .filter(line => {
      const normalized = line.trim().toUpperCase();
      return normalized !== "BEGIN;" && normalized !== "COMMIT;";
    })
    .join("\n");
}

function rollbackControlledPoolV1(client) {
  return {
    async query(text, values) {
      return client.query(text, values);
    },

    async connect() {
      return {
        async query(text, values) {
          if (text === "BEGIN") {
            return client.query("SAVEPOINT iris_ai_controlled_direct_v1");
          }
          if (text === "COMMIT") {
            return client.query("RELEASE SAVEPOINT iris_ai_controlled_direct_v1");
          }
          if (text === "ROLLBACK") {
            await client.query("ROLLBACK TO SAVEPOINT iris_ai_controlled_direct_v1");
            return client.query("RELEASE SAVEPOINT iris_ai_controlled_direct_v1");
          }
          return client.query(text, values);
        },
        release() {}
      };
    }
  };
}

function controlledEnvV1() {
  return {
    NODE_ENV: "development",
    IRIS_AI_TEST_ENVIRONMENT: "development",
    IRIS_AI_CONTROLLED_EXECUTION: "true",
    IRIS_AI_ENABLED: "true",
    IRIS_RETRIEVAL_ENABLED: "true",
    IRIS_AI_DIRECT_RETRIEVAL_ENABLED: "true",
    IRIS_AI_PROVIDER: "groq",
    IRIS_AI_MODEL: "openai/gpt-oss-20b",
    IRIS_AI_PROVIDER_EMERGENCY_STOP: "true",
    IRIS_AI_MAX_INPUT_TOKENS: "6000",
    IRIS_AI_MAX_OUTPUT_TOKENS: "400",
    IRIS_AI_TIMEOUT_MS: "5000",
    IRIS_AI_USER_DAILY_LIMIT: "5",
    IRIS_AI_PROVIDER_GLOBAL_DAILY_LIMIT: "3",
    IRIS_AI_PROVIDER_GLOBAL_MONTHLY_LIMIT: "10",
    IRIS_AI_MAX_PROVIDER_ESCALATION_PERCENT: "10",
    IRIS_AI_BUDGET_TIMEZONE: "America/Argentina/Cordoba",
    IRIS_AI_METRICS_ENABLED: "true"
  };
}

async function relationStateV1(client) {
  const result = await client.query(
    `SELECT
       to_regclass('public.iris_documents')::text AS documents_table,
       to_regclass('public.iris_ai_usage_counters')::text AS usage_table,
       to_regclass('public.iris_ai_metrics')::text AS metrics_table`
  );
  return result.rows[0];
}

async function assertNoSyntheticResidueV1(client) {
  const state = await relationStateV1(client);
  if (state.documents_table) {
    const document = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM iris_documents
       WHERE document_key = $1`,
      [DOCUMENT_KEY]
    );
    assert.equal(document.rows[0].total, 0);
  }
  if (state.usage_table) {
    const usage = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM iris_ai_usage_counters
       WHERE scope_key = $1`,
      [USER_SCOPE]
    );
    assert.equal(usage.rows[0].total, 0);
  }
}

test(
  "direct retrieval controlado responde desde un único fragmento autorizado sin provider",
  {
    skip: shouldRun
      ? false
      : "requiere IRIS_V1_TEST_DATABASE_URL, development e IRIS_AI_CONTROLLED_EXECUTION=true"
  },
  async () => {
    const client = new Client({
      connectionString,
      ssl: connectionString.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
    });

    await client.connect();
    const before = await relationStateV1(client);
    let fetchCalls = 0;

    try {
      await assertNoSyntheticResidueV1(client);
      await client.query("BEGIN");
      await client.query(migrationBodyV1("migration-iris-document-retrieval-v1.sql"));
      await client.query(migrationBodyV1("migration-iris-ai-persistence-v1.sql"));

      const content =
        `${UNIQUE_TERM} es el único dato sintético autorizado para esta prueba de respuesta directa local.`;

      const inserted = await client.query(
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
         ) VALUES (
           $1,
           'iris-test-controlled-direct-family-v1',
           'Documento sintético direct retrieval',
           'Iris controlled integration test',
           'synthetic-direct-reference-v1',
           'Iris controlled integration test',
           'approved',
           'synthetic-direct-authorization-v1',
           'es',
           'US',
           'integration-test',
           $2,
           'v1',
           '2026-08-20T00:00:00Z',
           'iris/integration/controlled-direct-retrieval-v1.pdf',
           'application/pdf',
           $3,
           TRUE
         ) RETURNING id`,
        [DOCUMENT_KEY, PRODUCT_SLUG, "c".repeat(64)]
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
         ) VALUES ($1, 0, $2, $3, $4, $5, 0, $6)`,
        [
          inserted.rows[0].id,
          UNIQUE_TERM,
          content,
          "d".repeat(64),
          `${UNIQUE_TERM} unico dato sintetico autorizado prueba respuesta directa local`,
          content.length
        ]
      );

      const env = controlledEnvV1();
      const secrets = {};
      Object.defineProperty(secrets, "GROQ_API_KEY", {
        get() {
          throw new Error("GROQ_API_KEY no debe leerse en direct retrieval");
        }
      });

      const serverRuntime = initializeIrisAiServerRuntimeV1({
        pool: rollbackControlledPoolV1(client),
        env,
        secrets,
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("fetch no autorizado en direct retrieval controlado");
        }
      });

      const result = await runControlledIrisAiExecutionV1({
        serverRuntime,
        env,
        input: {
          question: UNIQUE_TERM,
          language: "es",
          country: "US",
          productSlug: PRODUCT_SLUG,
          userScope: USER_SCOPE,
          deviceScope: DEVICE_SCOPE,
          now: new Date("2026-08-20T12:00:00.000Z")
        }
      });

      assert.equal(result.status, "ok");
      assert.equal(result.classification, "direct_retrieval");
      assert.equal(result.answer, content);
      assert.deepEqual(result.citations, [{
        documentKey: DOCUMENT_KEY,
        versionLabel: "v1",
        chunkIndex: 0
      }]);
      assert.equal(fetchCalls, 0);

      const reservations = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM iris_ai_provider_reservations`
      );
      assert.equal(reservations.rows[0].total, 0);

      const metric = await client.query(
        `SELECT metric_value
         FROM iris_ai_metrics
         WHERE metric_name = 'response_direct_retrieval'`
      );
      assert.equal(metric.rowCount, 1);
      assert.equal(Number(metric.rows[0].metric_value), 1);
    } finally {
      await client.query("ROLLBACK");
      const after = await relationStateV1(client);
      assert.deepEqual(after, before);
      await assertNoSyntheticResidueV1(client);
      await client.end();
    }
  }
);
