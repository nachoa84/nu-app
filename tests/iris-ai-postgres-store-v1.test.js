"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  IrisAiPostgresStoreErrorV1,
  IrisAiPostgresStoreOperationalErrorV1,
  createPostgresIrisAiStoreV1
} = require("../iris-ai-postgres-store-v1");

function harnessV1({
  usageUsed = 0,
  questionTotal = 0,
  dailyUsed = 0,
  monthlyUsed = 0,
  reservationState = null,
  reservationDay = "2026-08-19",
  reservationMonth = "2026-08-01",
  failOn = null,
  logError = () => {}
} = {}) {
  const calls = [];

  const client = {
    async query(text, values) {
      calls.push({ text, values });

      if (failOn && failOn.test(text)) {
        throw Object.assign(new Error("detalle privado"), {
          code: "40001",
          constraint: "safe_constraint"
        });
      }

      if (/SELECT used_count[\s\S]*iris_ai_usage_counters/.test(text)) {
        return { rows: [{ used_count: usageUsed }] };
      }

      if (/SELECT total_questions[\s\S]*iris_ai_question_counters/.test(text)) {
        return { rows: [{ total_questions: questionTotal }] };
      }

      if (/period_type = 'day'/.test(text)) {
        return { rows: [{ used_count: dailyUsed }] };
      }

      if (/period_type = 'month'/.test(text)) {
        return { rows: [{ used_count: monthlyUsed }] };
      }

      if (/FROM iris_ai_provider_reservations/.test(text)) {
        return {
          rows: reservationState
            ? [{
                state: reservationState,
                period_day: reservationDay,
                period_month: reservationMonth
              }]
            : []
        };
      }

      return { rows: [] };
    },

    release() {
      calls.push({ text: "RELEASE" });
    }
  };

  const pool = {
    async connect() {
      calls.push({ text: "CONNECT" });
      return client;
    }
  };

  return {
    calls,
    client,
    store: createPostgresIrisAiStoreV1({
      pool,
      logError
    })
  };
}

test("requiere un pool PostgreSQL válido", () => {
  assert.throws(
    () => createPostgresIrisAiStoreV1({}),
    IrisAiPostgresStoreErrorV1
  );
});

test("consume cuota y cuenta pregunta dentro de una transacción", async () => {
  const h = harnessV1();

  const result = await h.store.consumeUsage({
    userScope: "u_hash_1",
    deviceScope: null,
    now: new Date("2026-08-19T18:00:00Z"),
    timeZone: "America/Argentina/Cordoba",
    userDailyLimit: 5,
    deviceDailyLimit: null
  });

  assert.equal(result.allowed, true);

  const sql = h.calls.map(call => call.text);

  assert.ok(sql.includes("BEGIN"));
  assert.ok(sql.some(text => /iris_ai_usage_counters/.test(text)));
  assert.ok(sql.some(text => /iris_ai_question_counters/.test(text)));
  assert.ok(sql.some(text => /FOR UPDATE/.test(text)));
  assert.ok(sql.includes("COMMIT"));
  assert.ok(sql.includes("RELEASE"));
});

test("bloquea cuota agotada sin incrementar preguntas", async () => {
  const h = harnessV1({ usageUsed: 5 });

  const result = await h.store.consumeUsage({
    userScope: "u_hash_1",
    now: new Date("2026-08-19T18:00:00Z"),
    timeZone: "America/Argentina/Cordoba",
    userDailyLimit: 5
  });

  assert.deepEqual(result, {
    allowed: false,
    reason: "user_usage_limit_exhausted",
    totalQuestionsInPeriod: 0
  });

  assert.ok(h.calls.some(call => call.text === "COMMIT"));
});

test("reserva presupuesto de proveedor de forma transaccional", async () => {
  const h = harnessV1({
    dailyUsed: 0,
    monthlyUsed: 0
  });

  const result = await h.store.reserveProviderBudget({
    now: new Date("2026-08-19T18:00:00Z"),
    timeZone: "America/Argentina/Cordoba",
    dailyLimit: 3,
    monthlyLimit: 10,
    maxEscalationPercent: 10,
    totalQuestionsInPeriod: 20
  });

  assert.equal(result.reserved, true);
  assert.ok(result.reservationId);

  const sql = h.calls.map(call => call.text);

  assert.ok(sql.includes("BEGIN"));
  assert.ok(sql.some(text =>
    /iris_ai_provider_budget_counters/.test(text)
  ));
  assert.ok(sql.some(text =>
    /iris_ai_provider_reservations/.test(text)
  ));
  assert.ok(sql.some(text => /FOR UPDATE/.test(text)));
  assert.ok(sql.includes("COMMIT"));
});

test("rechaza presupuesto diario agotado sin crear reserva", async () => {
  const h = harnessV1({ dailyUsed: 3 });

  const result = await h.store.reserveProviderBudget({
    now: new Date("2026-08-19T18:00:00Z"),
    timeZone: "America/Argentina/Cordoba",
    dailyLimit: 3,
    monthlyLimit: 10,
    maxEscalationPercent: 100,
    totalQuestionsInPeriod: 20
  });

  assert.deepEqual(result, {
    reserved: false,
    reason: "provider_daily_budget_exhausted"
  });

  assert.ok(!h.calls.some(call =>
    /INSERT INTO iris_ai_provider_reservations/.test(call.text)
  ));
});

test("finaliza una reserva una sola vez", async () => {
  const h = harnessV1({ reservationState: "reserved" });

  const result = await h.store.finalizeProviderReservation({
    reservationId: "r_test_1",
    now: new Date("2026-08-19T18:00:00Z")
  });

  assert.deepEqual(result, { finalized: true });

  assert.ok(h.calls.some(call =>
    /FOR UPDATE/.test(call.text)
  ));
  assert.ok(h.calls.some(call =>
    /state = 'finalized'/.test(call.text)
  ));
});

test("libera reserva y revierte contadores de presupuesto", async () => {
  const h = harnessV1({ reservationState: "reserved" });

  const result = await h.store.releaseProviderReservation({
    reservationId: "r_test_1",
    now: new Date("2026-08-19T18:00:00Z")
  });

  assert.deepEqual(result, { released: true });

  assert.ok(h.calls.some(call =>
    /state = 'released'/.test(call.text)
  ));
  const budgetUpdate = h.calls.find(call =>
    /UPDATE iris_ai_provider_budget_counters/.test(call.text)
  );

  assert.ok(budgetUpdate);
  assert.deepEqual(budgetUpdate.values, [
    "2026-08-19",
    "2026-08-01",
    new Date("2026-08-19T18:00:00Z")
  ]);
});

test("fallo operativo hace ROLLBACK y no expone detalle privado", async () => {
  const logs = [];
  const h = harnessV1({
    failOn: /iris_ai_question_counters/,
    logError: entry => logs.push(entry)
  });

  await assert.rejects(
    h.store.consumeUsage({
      userScope: "u_hash_1",
      now: new Date("2026-08-19T18:00:00Z"),
      timeZone: "America/Argentina/Cordoba",
      userDailyLimit: 5
    }),
    IrisAiPostgresStoreOperationalErrorV1
  );

  assert.ok(h.calls.some(call => call.text === "ROLLBACK"));
  assert.ok(!h.calls.some(call => call.text === "COMMIT"));
  assert.ok(!JSON.stringify(logs).includes("detalle privado"));
});

test("registra únicamente métricas agregadas permitidas", async () => {
  const h = harnessV1();

  await h.store.recordMetric({
    name: "questions_total",
    value: 1,
    now: new Date("2026-08-19T18:00:00Z")
  });

  const query = h.calls.find(call =>
    /INSERT INTO iris_ai_metrics/.test(call.text)
  );

  assert.ok(query);
  assert.deepEqual(query.values, [
    "questions_total",
    1,
    new Date("2026-08-19T18:00:00Z")
  ]);

  assert.ok(/ON CONFLICT/.test(query.text));
  assert.ok(/metric_value/.test(query.text));
});

test("rechaza nombres de métricas no permitidos antes de conectar", async () => {
  const h = harnessV1();

  await assert.rejects(
    h.store.recordMetric({
      name: "private_question_text",
      value: 1
    }),
    IrisAiPostgresStoreErrorV1
  );

  assert.equal(h.calls.length, 0);
});

test("rechaza valores de métrica inválidos antes de conectar", async () => {
  const h = harnessV1();

  for (const value of [-1, NaN, Infinity]) {
    await assert.rejects(
      h.store.recordMetric({
        name: "questions_total",
        value
      }),
      IrisAiPostgresStoreErrorV1
    );
  }

  assert.equal(h.calls.length, 0);
});
