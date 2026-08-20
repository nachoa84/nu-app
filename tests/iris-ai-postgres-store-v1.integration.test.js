"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { Client } = require("pg");

const {
  createPostgresIrisAiStoreV1
} = require("../iris-ai-postgres-store-v1");

const connectionString =
  process.env.IRIS_V1_TEST_DATABASE_URL || "";

const developmentOnly =
  process.env.NODE_ENV === "development" &&
  process.env.IRIS_AI_TEST_ENVIRONMENT === "development";

const shouldRun =
  Boolean(connectionString) &&
  developmentOnly;

const TZ = "America/Argentina/Cordoba";
const NOW = new Date("2026-08-19T18:00:00.000Z");

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
      const normalized =
        line.trim().toUpperCase();

      return (
        normalized !== "BEGIN;" &&
        normalized !== "COMMIT;"
      );
    })
    .join("\n");
}

function rollbackControlledPoolV1(client) {
  return {
    async connect() {
      return {
        async query(text, values) {
          if (text === "BEGIN") {
            return client.query(
              "SAVEPOINT iris_ai_store_v1"
            );
          }

          if (text === "COMMIT") {
            return client.query(
              "RELEASE SAVEPOINT iris_ai_store_v1"
            );
          }

          if (text === "ROLLBACK") {
            await client.query(
              "ROLLBACK TO SAVEPOINT iris_ai_store_v1"
            );

            return client.query(
              "RELEASE SAVEPOINT iris_ai_store_v1"
            );
          }

          return client.query(text, values);
        },

        release() {
          // La conexión pertenece a la transacción
          // externa controlada por este test.
        }
      };
    }
  };
}

async function countSyntheticRowsV1(client) {
  const usage = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM iris_ai_usage_counters
     WHERE scope_key = $1`,
    ["u_pg_integration_v1"]
  );

  const reservations = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM iris_ai_provider_reservations`
  );

  return {
    usage: usage.rows[0].total,
    reservations: reservations.rows[0].total
  };
}

test(
  "Iris AI persistence integra con PostgreSQL solo en development y revierte todo",
  {
    skip: shouldRun
      ? false
      : "requiere IRIS_V1_TEST_DATABASE_URL, NODE_ENV=development e IRIS_AI_TEST_ENVIRONMENT=development"
  },
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

      await client.query(
        migrationBodyV1()
      );

      const store =
        createPostgresIrisAiStoreV1({
          pool: rollbackControlledPoolV1(client)
        });

      const usage =
        await store.consumeUsage({
          userScope: "u_pg_integration_v1",
          now: NOW,
          timeZone: TZ,
          userDailyLimit: 5,
          deviceDailyLimit: null
        });

      assert.equal(usage.allowed, true);
      assert.equal(
        usage.totalQuestionsInPeriod,
        1
      );

      const reservation =
        await store.reserveProviderBudget({
          now: NOW,
          timeZone: TZ,
          dailyLimit: 3,
          monthlyLimit: 10,
          maxEscalationPercent: 100,
          totalQuestionsInPeriod:
            usage.totalQuestionsInPeriod
        });

      assert.equal(
        reservation.reserved,
        true
      );

      await store.finalizeProviderReservation({
        reservationId:
          reservation.reservationId,
        now: NOW
      });

      await store.recordMetric({
        name: "questions_total",
        value: 1,
        now: NOW
      });

      const rows =
        await countSyntheticRowsV1(client);

      assert.equal(rows.usage, 1);
      assert.equal(rows.reservations, 1);

      const persistedReservation =
        await client.query(
          `SELECT state
           FROM iris_ai_provider_reservations
           WHERE reservation_key = $1`,
          [reservation.reservationId]
        );

      assert.equal(
        persistedReservation.rows[0].state,
        "finalized"
      );

      const metric =
        await client.query(
          `SELECT metric_value::numeric AS value
           FROM iris_ai_metrics
           WHERE metric_name = 'questions_total'`
        );

      assert.equal(
        Number(metric.rows[0].value),
        1
      );
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  }
);
