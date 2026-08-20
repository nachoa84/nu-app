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
  createIrisAiUserRouteV1,
  hashScopeV1
} = require("../iris-ai-user-route-v1");

const connectionString = process.env.IRIS_V1_TEST_DATABASE_URL || "";
const shouldRun =
  Boolean(connectionString) &&
  process.env.NODE_ENV === "development" &&
  process.env.IRIS_AI_TEST_ENVIRONMENT === "development" &&
  process.env.IRIS_AI_CONTROLLED_EXECUTION === "true";

const DOCUMENT_KEY = "iris-test-user-route-e2e-controlled-v1";
const UNIQUE_TERM = "zzqvroutee2e846215739";
const USER_ID = "iris_test_user_route_e2e_v1";
const REQUEST_IP = "203.0.113.77";
const USER_SCOPE = hashScopeV1("iris_user", USER_ID);
const DEVICE_SCOPE = hashScopeV1("iris_device", REQUEST_IP);

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
  let savepointId = 0;

  return {
    async query(text, values) {
      return client.query(text, values);
    },

    async connect() {
      const savepoint = `iris_ai_user_route_e2e_${++savepointId}`;
      let active = false;

      return {
        async query(text, values) {
          if (text === "BEGIN") {
            active = true;
            return client.query(`SAVEPOINT ${savepoint}`);
          }
          if (text === "COMMIT") {
            if (!active) return { rowCount: 0, rows: [] };
            active = false;
            return client.query(`RELEASE SAVEPOINT ${savepoint}`);
          }
          if (text === "ROLLBACK") {
            if (!active) return { rowCount: 0, rows: [] };
            await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            active = false;
            return client.query(`RELEASE SAVEPOINT ${savepoint}`);
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
    IRIS_AI_USER_ROUTE_ENABLED: "true",
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

function createResponseCaptureV1() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

async function relationStateV1(client) {
  const result = await client.query(
    `SELECT
       to_regclass('public.iris_documents')::text AS documents_table,
       to_regclass('public.iris_ai_usage_counters')::text AS usage_table,
       to_regclass('public.iris_ai_provider_reservations')::text AS reservations_table,
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
       WHERE scope_key = ANY($1::text[])`,
      [[USER_SCOPE, DEVICE_SCOPE]]
    );
    assert.equal(usage.rows[0].total, 0);
  }
}

async function metricValueV1(client, metricName) {
  const result = await client.query(
    `SELECT metric_value
     FROM iris_ai_metrics
     WHERE metric_name = $1`,
    [metricName]
  );

  return result.rowCount
    ? Number(result.rows[0].metric_value)
    : 0;
}

test(
  "ruta real Iris AI recorre runtime + PostgreSQL + retrieval y responde direct retrieval sin provider",
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
    const beforeRelations = await relationStateV1(client);
    let fetchCalls = 0;

    try {
      await assertNoSyntheticResidueV1(client);
      await client.query("BEGIN");
      await client.query(migrationBodyV1("migration-iris-document-retrieval-v1.sql"));
      await client.query(migrationBodyV1("migration-iris-ai-persistence-v1.sql"));

      const content =
        `${UNIQUE_TERM} es el único dato sintético autorizado para validar la ruta real de Iris.`;

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
           'iris-test-user-route-e2e-family-v1',
           'Documento sintético user route e2e',
           'Iris controlled integration test',
           'synthetic-user-route-e2e-reference-v1',
           'Iris controlled integration test',
           'approved',
           'synthetic-user-route-e2e-authorization-v1',
           'es',
           'US',
           NULL,
           NULL,
           'v1',
           '2026-08-20T00:00:00Z',
           'iris/integration/user-route-e2e-controlled-v1.pdf',
           'application/pdf',
           $2,
           TRUE
         ) RETURNING id`,
        [DOCUMENT_KEY, "e".repeat(64)]
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
          "f".repeat(64),
          `${UNIQUE_TERM} unico dato sintetico autorizado validar ruta real iris`,
          content.length
        ]
      );

      const reservationsBefore = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM iris_ai_provider_reservations`
      );
      const directMetricBefore = await metricValueV1(
        client,
        "response_direct_retrieval"
      );

      const env = controlledEnvV1();
      const secrets = {};
      Object.defineProperty(secrets, "GROQ_API_KEY", {
        get() {
          throw new Error("GROQ_API_KEY no debe leerse en user route e2e");
        }
      });

      const serverRuntime = initializeIrisAiServerRuntimeV1({
        pool: rollbackControlledPoolV1(client),
        env,
        secrets,
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("fetch no autorizado en user route e2e controlado");
        }
      });

      assert.equal(serverRuntime.status.enabled, true);

      const route = createIrisAiUserRouteV1({
        runtime: serverRuntime,
        env,
        logError: error => {
          throw new Error(`route no debía registrar error: ${JSON.stringify(error)}`);
        }
      });

      const req = {
        body: {
          question: UNIQUE_TERM,
          userId: USER_ID,
          country: "US",
          language: "es"
        },
        ip: REQUEST_IP
      };
      const res = createResponseCaptureV1();

      await route(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.payload, {
        ok: true,
        status: "ok",
        classification: "direct_retrieval",
        answer: content,
        citations: [{
          documentKey: DOCUMENT_KEY,
          versionLabel: "v1",
          chunkIndex: 0
        }]
      });
      assert.equal(fetchCalls, 0);

      const usage = await client.query(
        `SELECT scope_type, scope_key, used_count
         FROM iris_ai_usage_counters
         WHERE scope_key = ANY($1::text[])
         ORDER BY scope_type, scope_key`,
        [[USER_SCOPE, DEVICE_SCOPE]]
      );

      assert.equal(usage.rowCount, 2);
      assert.deepEqual(
        usage.rows.map(row => ({
          scope_type: row.scope_type,
          scope_key: row.scope_key,
          used_count: Number(row.used_count)
        })),
        [
          {
            scope_type: "device",
            scope_key: DEVICE_SCOPE,
            used_count: 1
          },
          {
            scope_type: "user",
            scope_key: USER_SCOPE,
            used_count: 1
          }
        ]
      );

      assert.equal(usage.rows.some(row => row.scope_key === USER_ID), false);
      assert.equal(usage.rows.some(row => row.scope_key === REQUEST_IP), false);

      const reservationsAfter = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM iris_ai_provider_reservations`
      );
      assert.equal(
        reservationsAfter.rows[0].total,
        reservationsBefore.rows[0].total
      );

      const directMetricAfter = await metricValueV1(
        client,
        "response_direct_retrieval"
      );
      assert.equal(directMetricAfter, directMetricBefore + 1);
    } finally {
      await client.query("ROLLBACK");
      const afterRelations = await relationStateV1(client);
      assert.deepEqual(afterRelations, beforeRelations);
      await assertNoSyntheticResidueV1(client);
      await client.end();
    }
  }
);
