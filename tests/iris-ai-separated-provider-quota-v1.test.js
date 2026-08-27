"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createIrisAiPolicyConfigV1
} = require("../iris-ai-policy-config-v1");
const {
  createIrisAiPolicyRuntimeV1
} = require("../iris-ai-policy-runtime-v1");

function configV1(overrides = {}) {
  return {
    aiEnabled: true,
    provider: "test-provider",
    model: "test-model",
    providerEmergencyStop: false,
    metricsEnabled: false,
    budgetTimezone: "UTC",
    ...overrides
  };
}

function providerBudgetStoreV1({ released = [] } = {}) {
  return {
    async reserve() {
      return {
        reserved: true,
        reason: "provider_budget_reserved",
        reservationId: "r_test"
      };
    },
    async finalize() {
      return { finalized: true };
    },
    async release(reservationId) {
      released.push(reservationId);
      return { released: true };
    }
  };
}

const mediumRetrievalV1 = Object.freeze({
  authorized: true,
  fragmentCount: 1,
  scopeMatch: true,
  termCoverage: "medium",
  directAnswer: false,
  hasContradiction: false
});

test("local questions are recorded without consuming provider user quota", async () => {
  let providerUsageCalls = 0;
  let legacyUsageCalls = 0;

  const runtime = createIrisAiPolicyRuntimeV1({
    config: configV1(),
    usageQuotaStore: {
      async consume() {
        legacyUsageCalls += 1;
        throw new Error("legacy quota must not be used");
      }
    },
    providerBudgetStore: providerBudgetStoreV1(),
    metricsStore: null,
    separatedQuotaStore: {
      async recordQuestion() {
        return {
          allowed: true,
          reason: "question_recorded",
          totalQuestionsInPeriod: 11
        };
      },
      async consumeProviderUsage() {
        providerUsageCalls += 1;
        return { allowed: true, reason: "provider_usage_reserved" };
      }
    }
  });

  const start = await runtime.beginQuestion({
    userScope: "user-1",
    now: new Date("2026-08-27T12:00:00Z")
  });

  assert.equal(start.allowed, true);
  assert.equal(start.totalQuestionsInPeriod, 11);
  assert.equal(providerUsageCalls, 0);
  assert.equal(legacyUsageCalls, 0);
});

test("provider user quota is consumed only when a real provider call is authorized", async () => {
  const consumed = [];

  const runtime = createIrisAiPolicyRuntimeV1({
    config: configV1(),
    usageQuotaStore: null,
    providerBudgetStore: providerBudgetStoreV1(),
    metricsStore: null,
    separatedQuotaStore: {
      async recordQuestion() {
        return {
          allowed: true,
          reason: "question_recorded",
          totalQuestionsInPeriod: 20
        };
      },
      async consumeProviderUsage(input) {
        consumed.push(input);
        return { allowed: true, reason: "provider_usage_reserved" };
      }
    }
  });

  const authorization = await runtime.authorizeProviderCall({
    retrieval: mediumRetrievalV1,
    totalQuestionsInPeriod: 20,
    userScope: "user-1",
    deviceScope: "device-1",
    now: new Date("2026-08-27T12:00:00Z")
  });

  assert.equal(authorization.allowed, true);
  assert.equal(authorization.reservationId, "r_test");
  assert.equal(consumed.length, 1);
  assert.equal(consumed[0].userScope, "user-1");
  assert.equal(consumed[0].deviceScope, "device-1");
});

test("provider user quota exhaustion releases the global provider reservation", async () => {
  const released = [];

  const runtime = createIrisAiPolicyRuntimeV1({
    config: configV1(),
    usageQuotaStore: null,
    providerBudgetStore: providerBudgetStoreV1({ released }),
    metricsStore: null,
    separatedQuotaStore: {
      async recordQuestion() {
        return {
          allowed: true,
          reason: "question_recorded",
          totalQuestionsInPeriod: 20
        };
      },
      async consumeProviderUsage() {
        return {
          allowed: false,
          reason: "provider_user_usage_limit_exhausted"
        };
      }
    }
  });

  const authorization = await runtime.authorizeProviderCall({
    retrieval: mediumRetrievalV1,
    totalQuestionsInPeriod: 20,
    userScope: "user-1"
  });

  assert.equal(authorization.allowed, false);
  assert.equal(authorization.reason, "provider_user_usage_limit_exhausted");
  assert.equal(authorization.reservationId, null);
  assert.deepEqual(released, ["r_test"]);
});

test("new provider quota env vars override legacy values and legacy remains a fallback", () => {
  const baseEnv = {
    IRIS_AI_ENABLED: "true",
    IRIS_AI_PROVIDER: "noop",
    IRIS_AI_BUDGET_TIMEZONE: "UTC",
    IRIS_AI_USER_DAILY_LIMIT: "7",
    IRIS_AI_DEVICE_DAILY_LIMIT: "8"
  };

  const legacyConfig = createIrisAiPolicyConfigV1(baseEnv);
  assert.equal(legacyConfig.providerUserDailyLimit, 7);
  assert.equal(legacyConfig.providerDeviceDailyLimit, 8);

  const explicitConfig = createIrisAiPolicyConfigV1({
    ...baseEnv,
    IRIS_AI_PROVIDER_USER_DAILY_LIMIT: "3",
    IRIS_AI_PROVIDER_DEVICE_DAILY_LIMIT: "4"
  });

  assert.equal(explicitConfig.providerUserDailyLimit, 3);
  assert.equal(explicitConfig.providerDeviceDailyLimit, 4);
  assert.equal(explicitConfig.userDailyLimit, 7);
  assert.equal(explicitConfig.deviceDailyLimit, 8);
});
