"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createIrisAiPolicyRuntimeV1
} = require("../iris-ai-policy-runtime-v1");

const {
  createIrisAiPostgresRuntimeAdaptersV1
} = require("../iris-ai-postgres-runtime-adapter-v1");

const TZ = "America/Argentina/Cordoba";
const NOW = new Date("2026-08-19T18:00:00Z");

function configV1() {
  return {
    aiEnabled: true,
    provider: "mock",
    model: "mock-model",
    providerEmergencyStop: false,
    maxInputTokens: 6000,
    maxOutputTokens: 400,
    timeoutMs: 5000,
    userDailyLimit: 5,
    deviceDailyLimit: null,
    providerGlobalDailyLimit: 3,
    providerGlobalMonthlyLimit: 10,
    maxProviderEscalationPercent: 100,
    budgetTimezone: TZ,
    metricsEnabled: true
  };
}

function harnessV1() {
  const calls = [];

  const store = {
    async consumeUsage(input) {
      calls.push({
        method: "consumeUsage",
        input
      });

      return {
        allowed: true,
        reason: "usage_reserved",
        totalQuestionsInPeriod: 47
      };
    },

    async reserveProviderBudget(input) {
      calls.push({
        method: "reserveProviderBudget",
        input
      });

      return {
        reserved: true,
        reason: "provider_budget_reserved",
        reservationId: "r_pg_test_1"
      };
    },

    async finalizeProviderReservation(input) {
      calls.push({
        method: "finalizeProviderReservation",
        input
      });

      return { finalized: true };
    },

    async releaseProviderReservation(input) {
      calls.push({
        method: "releaseProviderReservation",
        input
      });

      return { released: true };
    },

    async recordMetric(input) {
      calls.push({
        method: "recordMetric",
        input
      });

      return { recorded: true };
    }
  };

  const config = configV1();

  const adapters =
    createIrisAiPostgresRuntimeAdaptersV1({
      store,
      config
    });

  const runtime =
    createIrisAiPolicyRuntimeV1({
      config,
      usageQuotaStore:
        adapters.usageQuotaStore,
      providerBudgetStore:
        adapters.providerBudgetStore,
      metricsStore:
        adapters.metricsStore
    });

  return {
    calls,
    runtime
  };
}

test("runtime usa contador persistente y registra questions_total", async () => {
  const h = harnessV1();

  const result = await h.runtime.beginQuestion({
    userScope: "u_hash_1",
    now: NOW
  });

  assert.deepEqual(result, {
    allowed: true,
    reason: "usage_reserved",
    totalQuestionsInPeriod: 47
  });

  assert.deepEqual(
    h.calls.map(call => call.method),
    [
      "consumeUsage",
      "recordMetric"
    ]
  );

  assert.equal(
    h.calls[1].input.name,
    "questions_total"
  );
});

test("runtime reserva presupuesto usando contador persistente", async () => {
  const h = harnessV1();

  const authorization =
    await h.runtime.authorizeProviderCall({
      retrieval: {
        authorized: true,
        fragmentCount: 1,
        hasContradiction: false,
        directAnswer: false,
        scopeMatch: true,
        termCoverage: "medium"
      },
      totalQuestionsInPeriod: 47,
      now: NOW
    });

  assert.equal(authorization.allowed, true);
  assert.equal(
    authorization.reservationId,
    "r_pg_test_1"
  );

  const reserve = h.calls.find(call =>
    call.method === "reserveProviderBudget"
  );

  assert.ok(reserve);
  assert.equal(
    reserve.input.totalQuestionsInPeriod,
    47
  );
});

test("runtime finaliza reserva persistente y registra métricas", async () => {
  const h = harnessV1();

  const result =
    await h.runtime.completeProviderCall({
      reservationId: "r_pg_test_1",
      started: true,
      outcome: "ok"
    });

  assert.deepEqual(result, {
    finalized: true,
    released: false
  });

  assert.ok(h.calls.some(call =>
    call.method ===
      "finalizeProviderReservation"
  ));

  const metrics = h.calls
    .filter(call =>
      call.method === "recordMetric"
    )
    .map(call => call.input.name);

  assert.ok(metrics.includes(
    "budget_reservations_finalized"
  ));
  assert.ok(metrics.includes(
    "provider_calls"
  ));
});

test("runtime libera reserva persistente si provider no inició", async () => {
  const h = harnessV1();

  const result =
    await h.runtime.completeProviderCall({
      reservationId: "r_pg_test_1",
      started: false
    });

  assert.deepEqual(result, {
    finalized: false,
    released: true
  });

  assert.ok(h.calls.some(call =>
    call.method ===
      "releaseProviderReservation"
  ));

  assert.ok(h.calls.some(call =>
    call.method === "recordMetric" &&
    call.input.name ===
      "budget_reservations_released"
  ));
});
