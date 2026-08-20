"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  IrisAiPostgresRuntimeAdapterErrorV1,
  createIrisAiPostgresRuntimeAdaptersV1
} = require("../iris-ai-postgres-runtime-adapter-v1");

function configV1() {
  return {
    budgetTimezone: "America/Argentina/Cordoba",
    userDailyLimit: 5,
    deviceDailyLimit: null,
    providerGlobalDailyLimit: 3,
    providerGlobalMonthlyLimit: 10,
    maxProviderEscalationPercent: 10
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
        totalQuestionsInPeriod: 12
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
        reservationId: "r_test"
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

  return {
    calls,
    adapters: createIrisAiPostgresRuntimeAdaptersV1({
      store,
      config: configV1()
    })
  };
}

test("requiere store y config válidos", () => {
  assert.throws(
    () =>
      createIrisAiPostgresRuntimeAdaptersV1({
        store: {},
        config: configV1()
      }),
    IrisAiPostgresRuntimeAdapterErrorV1
  );

  assert.throws(
    () =>
      createIrisAiPostgresRuntimeAdaptersV1({
        store: {
          consumeUsage() {},
          reserveProviderBudget() {},
          finalizeProviderReservation() {},
          releaseProviderReservation() {},
          recordMetric() {}
        }
      }),
    IrisAiPostgresRuntimeAdapterErrorV1
  );
});

test("adapta consumo de cuota con límites de config", async () => {
  const h = harnessV1();
  const now = new Date("2026-08-19T18:00:00Z");

  const result =
    await h.adapters.usageQuotaStore.consume({
      userScope: "u_hash_1",
      now
    });

  assert.equal(result.totalQuestionsInPeriod, 12);

  assert.deepEqual(h.calls[0], {
    method: "consumeUsage",
    input: {
      userScope: "u_hash_1",
      deviceScope: null,
      now,
      timeZone: "America/Argentina/Cordoba",
      userDailyLimit: 5,
      deviceDailyLimit: null
    }
  });
});

test("adapta reserva con presupuesto de config", async () => {
  const h = harnessV1();
  const now = new Date("2026-08-19T18:00:00Z");

  const result =
    await h.adapters.providerBudgetStore.reserve({
      now,
      totalQuestionsInPeriod: 20
    });

  assert.equal(result.reservationId, "r_test");

  assert.deepEqual(h.calls[0], {
    method: "reserveProviderBudget",
    input: {
      now,
      timeZone: "America/Argentina/Cordoba",
      dailyLimit: 3,
      monthlyLimit: 10,
      maxEscalationPercent: 10,
      totalQuestionsInPeriod: 20
    }
  });
});

test("adapta finalize, release y métricas", async () => {
  const h = harnessV1();

  await h.adapters.providerBudgetStore.finalize(
    "r_test"
  );

  await h.adapters.providerBudgetStore.release(
    "r_test"
  );

  await h.adapters.metricsStore.record({
    name: "questions_total",
    value: 2
  });

  assert.deepEqual(
    h.calls.map(call => call.method),
    [
      "finalizeProviderReservation",
      "releaseProviderReservation",
      "recordMetric"
    ]
  );

  assert.deepEqual(h.calls[0].input, {
    reservationId: "r_test"
  });

  assert.deepEqual(h.calls[1].input, {
    reservationId: "r_test"
  });

  assert.deepEqual(h.calls[2].input, {
    name: "questions_total",
    value: 2
  });
});
