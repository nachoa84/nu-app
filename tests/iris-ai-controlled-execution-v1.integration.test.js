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

const connectionString =
  process.env.IRIS_V1_TEST_DATABASE_URL || "";

const developmentOnly =
  process.env.NODE_ENV === "development" &&
  process.env.IRIS_AI_TEST_ENVIRONMENT === "development";

const controlledOnly =
  process.env.IRIS_AI_CONTROLLED_EXECUTION === "true";

const shouldRun =
  Boolean(connectionString) &&
  developmentOnly &&
  controlledOnly;

const SYNTHETIC_SCOPE =
  "iris_test:controlled_execution_v1";

function migrationBodyV1() {
  const raw = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "migration-iris-ai-persistence-v1.sql"
    ),
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
            return client.query(
              "SAVEPOINT iris_ai_controlled_execution_v1"
            );
          }

          if (text === "COMMIT") {
            return client.query(
              "RELEASE SAVEPOINT iris_ai_controlled_execution_v1"
            );
          }

          if (text === "ROLLBACK") {
            await client.query(
              "ROLLBACK TO SAVEPOINT iris_ai_controlled_execution_v1"
            );
            return client.query(
              "RELEASE SAVEPOINT iris_ai_controlled_execution_v1"
            );
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
       to_regclass('public.iris_ai_usage_counters')::text AS usage_table,
       to_regclass('public.iris_ai_metrics')::text AS metrics_table`
  );

  return result.rows[0];
}

test(
  "ejecución controlada integra runtime + PostgreSQL + retrieval y revierte todo",
  {
    skip: shouldRun
      ? false
      : "requiere IRIS_V1_TEST_DATABASE_URL, development y IRIS_AI_CONTROLLED_EXECUTION=true"
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
      await client.query("BEGIN");
      await client.query(migrationBodyV1());

      const env = controlledEnvV1();
      const serverRuntime = initializeIrisAiServerRuntimeV1({
        pool: rollbackControlledPoolV1(client),
        env,
        secrets: {},
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("fetch no autorizado en prueba controlada");
        }
      });

      const result = await runControlledIrisAiExecutionV1({
        serverRuntime,
        env,
        input: {
          question: "zzqv synthetic controlled execution no document should match 918273645",
          language: "es",
          country: "US",
          productSlug: "synthetic-product",
          userScope: SYNTHETIC_SCOPE,
          deviceScope: "iris_test:controlled_device_v1",
          now: new Date("2026-08-20T12:00:00.000Z")
        }
      });

      assert.equal(result.status, "fallback");
      assert.equal(result.reason, "no_authorized_context");
      assert.equal(fetchCalls, 0);

      const usage = await client.query(
        `SELECT used_count
         FROM iris_ai_usage_counters
         WHERE scope_key = $1`,
        [SYNTHETIC_SCOPE]
      );

      assert.equal(usage.rowCount, 1);
      assert.equal(Number(usage.rows[0].used_count), 1);

      const insufficient = await client.query(
        `SELECT metric_value
         FROM iris_ai_metrics
         WHERE metric_name = 'responses_insufficient'`
      );

      assert.equal(insufficient.rowCount, 1);
      assert.equal(Number(insufficient.rows[0].metric_value), 1);
    } finally {
      await client.query("ROLLBACK");

      const after = await relationStateV1(client);
      assert.deepEqual(after, before);

      if (after.usage_table) {
        const residue = await client.query(
          `SELECT COUNT(*)::int AS total
           FROM iris_ai_usage_counters
           WHERE scope_key = $1`,
          [SYNTHETIC_SCOPE]
        );
        assert.equal(residue.rows[0].total, 0);
      }

      await client.end();
    }
  }
);
