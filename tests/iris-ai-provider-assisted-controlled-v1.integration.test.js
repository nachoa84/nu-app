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
const {
  GROQ_CHAT_COMPLETIONS_URL_V1
} = require("../iris-ai-groq-provider-v1");

const connectionString = process.env.IRIS_V1_TEST_DATABASE_URL || "";
const shouldRun =
  Boolean(connectionString) &&
  process.env.NODE_ENV === "development" &&
  process.env.IRIS_AI_TEST_ENVIRONMENT === "development" &&
  process.env.IRIS_AI_CONTROLLED_EXECUTION === "true";

const DOCUMENT_KEY = "iris-test-provider-assisted-controlled-v1";
const UNIQUE_TERM = "zzqvprovider846215739";
const USER_ID = "iris_test_provider_assisted_user_v1";
const REQUEST_IP = "203.0.113.88";
const USER_SCOPE = hashScopeV1("iris_user", USER_ID);
const DEVICE_SCOPE = hashScopeV1("iris_device", REQUEST_IP);
const EXPECTED_ANSWER = "La respuesta sintética autorizada proviene del fragmento controlado.";

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
      const savepoint = `iris_ai_provider_assisted_${++savepointId}`;
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
    IRIS_AI_DIRECT_RETRIEVAL_ENABLED: "false",
    IRIS_AI_PROVIDER: "groq",
    IRIS_AI_MODEL: "openai/gpt-oss-20b",
    IRIS_AI_PROVIDER_EMERGENCY_STOP: "false",
    IRIS_AI_MAX_INPUT_TOKENS: "6000",
    IRIS_AI_MAX_OUTPUT_TOKENS: "400",
    IRIS_AI_TIMEOUT_MS: "5000",
    IRIS_AI_USER_DAILY_LIMIT: "5",
    IRIS_AI_PROVIDER_GLOBAL_DAILY_LIMIT: "3",
    IRIS_AI_PROVIDER_GLOBAL_MONTHLY_LIMIT: "10",
    IRIS_AI_MAX_PROVIDER_ESCALATION_PERCENT: "100",
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
  "provider assisted controlado recorre ruta + PostgreSQL + Groq adapter con fetch simulado",
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
    let observedProviderRequest = null;

    try {
      await assertNoSyntheticResidueV1(client);
      await client.query("BEGIN");
      await client.query(migrationBodyV1("migration-iris-document-retrieval-v1.sql"));
      await client.query(migrationBodyV1("migration-iris-ai-persistence-v1.sql"));

      const content =
        `${UNIQUE_TERM} contiene el dato sintético autorizado usado para validar provider assisted.`;

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
           'iris-test-provider-assisted-family-v1',
           'Documento sintético provider assisted',
           'Iris controlled integration test',
           'synthetic-provider-assisted-reference-v1',
           'Iris controlled integration test',
           'approved',
           'synthetic-provider-assisted-authorization-v1',
           'es',
           'US',
           'integration-test',
           'synthetic-provider-assisted',
           'v1',
           '2026-08-20T00:00:00Z',
           'iris/integration/provider-assisted-controlled-v1.pdf',
           'application/pdf',
           $2,
           TRUE
         ) RETURNING id`,
        [DOCUMENT_KEY, "a".repeat(64)]
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
          "b".repeat(64),
          `${UNIQUE_TERM} dato sintetico autorizado validar provider assisted`,
          content.length
        ]
      );

      const reservationsBefore = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM iris_ai_provider_reservations`
      );
      const providerMetricBefore = await metricValueV1(
        client,
        "response_provider_assisted"
      );

      const env = controlledEnvV1();
      const secrets = {
        GROQ_API_KEY: "synthetic-test-key-not-a-secret"
      };

      const fakeFetch = async (url, options = {}) => {
        fetchCalls += 1;
        assert.equal(url, GROQ_CHAT_COMPLETIONS_URL_V1);
        assert.equal(options.method, "POST");
        assert.equal(
          options.headers?.Authorization,
          "Bearer synthetic-test-key-not-a-secret"
        );

        const body = JSON.parse(options.body);
        observedProviderRequest = body;

        assert.equal(body.model, "openai/gpt-oss-20b");
        assert.equal(body.stream, false);
        assert.equal(body.citation_options, "disabled");

        const userPayload = JSON.parse(body.messages[1].content);
        assert.equal(userPayload.question, UNIQUE_TERM);
        assert.equal(userPayload.fragments.length, 1);
        assert.deepEqual(
          Object.keys(userPayload.fragments[0]).sort(),
          ["content", "ref", "title", "versionLabel"]
        );
        assert.equal(userPayload.fragments[0].ref, "frag_1");
        assert.equal(userPayload.fragments[0].content, content);
        assert.equal("documentKey" in userPayload.fragments[0], false);
        assert.equal("chunkIndex" in userPayload.fragments[0], false);

        return {
          ok: true,
          status: 200,
          async json() {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    answer: EXPECTED_ANSWER,
                    citations: [{ ref: "frag_1" }]
                  })
                }
              }],
              usage: {
                prompt_tokens: 111,
                completion_tokens: 22,
                total_tokens: 133
              }
            };
          }
        };
      };

      const serverRuntime = initializeIrisAiServerRuntimeV1({
        pool: rollbackControlledPoolV1(client),
        env,
        secrets,
        fetchImpl: fakeFetch
      });

      assert.equal(serverRuntime.status.enabled, true);
      assert.equal(serverRuntime.status.providerName, "groq");

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

      assert.equal(fetchCalls, 1);
      assert.ok(observedProviderRequest);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.payload, {
        ok: true,
        status: "ok",
        classification: "provider_assisted",
        answer: EXPECTED_ANSWER,
        citations: [{
          documentKey: DOCUMENT_KEY,
          versionLabel: "v1",
          chunkIndex: 0
        }]
      });

      const usage = await client.query(
        `SELECT scope_type, scope_key, used_count
         FROM iris_ai_usage_counters
         WHERE scope_key = ANY($1::text[])
         ORDER BY scope_type, scope_key`,
        [[USER_SCOPE, DEVICE_SCOPE]]
      );
      assert.equal(usage.rowCount, 2);
      assert.equal(usage.rows.some(row => row.scope_key === USER_ID), false);
      assert.equal(usage.rows.some(row => row.scope_key === REQUEST_IP), false);

      const reservationsAfter = await client.query(
        `SELECT reservation_key, state
         FROM iris_ai_provider_reservations
         ORDER BY created_at DESC`
      );
      assert.equal(
        reservationsAfter.rowCount,
        reservationsBefore.rows[0].total + 1
      );
      assert.equal(reservationsAfter.rows[0].state, "finalized");

      const providerMetricAfter = await metricValueV1(
        client,
        "response_provider_assisted"
      );
      assert.equal(providerMetricAfter, providerMetricBefore + 1);
    } finally {
      await client.query("ROLLBACK");
      const afterRelations = await relationStateV1(client);
      assert.deepEqual(afterRelations, beforeRelations);
      await assertNoSyntheticResidueV1(client);
      await client.end();
    }
  }
);
