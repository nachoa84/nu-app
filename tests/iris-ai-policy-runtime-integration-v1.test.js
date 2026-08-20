"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createIrisAiOrchestratorV1 } = require("../iris-ai-orchestrator-v1");
const { createIrisAiPolicyRuntimeV1 } = require("../iris-ai-policy-runtime-v1");
const {
  createInMemoryIrisProviderBudgetStoreV1,
  createInMemoryIrisUsageQuotaStoreV1
} = require("../iris-ai-quota-store-v1");
const { createInMemoryIrisMetricsStoreV1 } = require("../iris-ai-metrics-store-v1");

const TZ = "America/Argentina/Cordoba";
const NOW = new Date("2026-08-19T18:00:00Z");

function fragmentV1(overrides = {}) {
  return {
    documentKey: "doc_internal_1",
    versionLabel: "v1",
    chunkIndex: 0,
    title: "Collagen Plus",
    content: "Contenido autorizado para responder.",
    objectKey: "private/storage/key",
    contentSha256: "a".repeat(64),
    ...overrides
  };
}

function configV1(overrides = {}) {
  return {
    aiEnabled: true,
    provider: "mock",
    model: "mock-model",
    providerEmergencyStop: false,
    maxInputTokens: 6000,
    maxOutputTokens: 800,
    timeoutMs: 5000,
    userDailyLimit: 5,
    deviceDailyLimit: null,
    providerGlobalDailyLimit: 10,
    providerGlobalMonthlyLimit: 100,
    maxProviderEscalationPercent: 100,
    budgetTimezone: TZ,
    metricsEnabled: true,
    ...overrides
  };
}

function runtimeBundle(overrides = {}) {
  const config = configV1(overrides.config);
  const usageQuotaStore = createInMemoryIrisUsageQuotaStoreV1({
    timeZone: config.budgetTimezone,
    userDailyLimit: config.userDailyLimit,
    deviceDailyLimit: config.deviceDailyLimit
  });
  const providerBudgetStore = createInMemoryIrisProviderBudgetStoreV1({
    timeZone: config.budgetTimezone,
    dailyLimit: config.providerGlobalDailyLimit,
    monthlyLimit: config.providerGlobalMonthlyLimit,
    maxEscalationPercent: config.maxProviderEscalationPercent
  });
  const metricsStore = createInMemoryIrisMetricsStoreV1();
  const policyRuntime = createIrisAiPolicyRuntimeV1({
    config,
    usageQuotaStore,
    providerBudgetStore,
    metricsStore
  });
  return { config, usageQuotaStore, providerBudgetStore, metricsStore, policyRuntime };
}

function baseAnswerInput(overrides = {}) {
  return {
    question: "¿Qué información hay sobre Collagen Plus?",
    language: "es",
    country: "US",
    productSlug: "collagen-plus",
    userScope: "u_hash_1",
    now: NOW,
    ...overrides
  };
}

test("policy runtime applies usage quota before retrieval", async () => {
  const bundle = runtimeBundle({ config: { userDailyLimit: 1 } });
  let retrievalCalls = 0;
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => {
      retrievalCalls += 1;
      return [fragmentV1()];
    },
    provider: {
      name: "mock",
      async generate() {
        return { status: "noop", answer: null, citations: [] };
      }
    },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime
  });

  await orchestrator.answerQuestion(baseAnswerInput());
  const second = await orchestrator.answerQuestion(baseAnswerInput());
  assert.equal(second.status, "fallback");
  assert.equal(second.reason, "user_usage_limit_exhausted");
  assert.equal(retrievalCalls, 1);
});

test("noop or mismatched provider cannot bypass configured provider identity", async () => {
  const bundle = runtimeBundle();
  let providerCalls = 0;
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragmentV1()],
    provider: {
      name: "other",
      async generate() {
        providerCalls += 1;
        return null;
      }
    },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime
  });

  const result = await orchestrator.answerQuestion(baseAnswerInput());
  assert.equal(result.reason, "provider_mismatch");
  assert.equal(providerCalls, 0);
  assert.deepEqual(bundle.providerBudgetStore.snapshot({ now: NOW }), {
    dailyUsed: 0,
    monthlyUsed: 0
  });
});

test("policy and budget must authorize before provider call", async () => {
  const bundle = runtimeBundle({ config: { providerGlobalDailyLimit: 1 } });
  let providerCalls = 0;
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragmentV1()],
    provider: {
      name: "mock",
      async generate() {
        providerCalls += 1;
        return {
          status: "ok",
          answer: "Respuesta autorizada.",
          citations: [{ ref: "frag_1" }]
        };
      }
    },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime
  });

  const first = await orchestrator.answerQuestion(baseAnswerInput());
  assert.equal(first.status, "ok");
  assert.equal(providerCalls, 1);

  const second = await orchestrator.answerQuestion(baseAnswerInput({ userScope: "u_hash_2" }));
  assert.equal(second.status, "fallback");
  assert.equal(second.reason, "provider_daily_budget_exhausted");
  assert.equal(providerCalls, 1);
});

test("provider receives only ephemeral fragment refs when policy runtime is active", async () => {
  const bundle = runtimeBundle();
  let providerInput;
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragmentV1()],
    provider: {
      name: "mock",
      async generate(input) {
        providerInput = input;
        return {
          status: "ok",
          answer: "Respuesta autorizada.",
          citations: [{ ref: "frag_1" }]
        };
      }
    },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime
  });

  const result = await orchestrator.answerQuestion(baseAnswerInput());
  assert.equal(result.status, "ok");
  assert.ok(providerInput);
  assert.deepEqual(Object.keys(providerInput.fragments[0]).sort(), ["content", "ref", "title", "versionLabel"].sort());
  assert.equal(providerInput.fragments[0].ref, "frag_1");
  const serialized = JSON.stringify(providerInput);
  assert.ok(!serialized.includes("doc_internal_1"));
  assert.ok(!serialized.includes("private/storage/key"));
  assert.ok(!serialized.includes("a".repeat(64)));
  assert.deepEqual(result.citations, [{
    documentKey: "doc_internal_1",
    versionLabel: "v1",
    chunkIndex: 0
  }]);
});

test("provider citations with internal IDs are rejected under ephemeral contract", async () => {
  const bundle = runtimeBundle();
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragmentV1()],
    provider: {
      name: "mock",
      async generate() {
        return {
          status: "ok",
          answer: "Respuesta no válida.",
          citations: [{ documentKey: "doc_internal_1", versionLabel: "v1", chunkIndex: 0 }]
        };
      }
    },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime
  });

  const result = await orchestrator.answerQuestion(baseAnswerInput());
  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "provider_unusable");
});

test("started provider call finalizes reservation even when provider fails", async () => {
  const bundle = runtimeBundle({ config: { providerGlobalDailyLimit: 1 } });
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragmentV1()],
    provider: {
      name: "mock",
      async generate() {
        throw new Error("secret-provider-error");
      }
    },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime
  });

  const result = await orchestrator.answerQuestion(baseAnswerInput());
  assert.equal(result.reason, "provider_error");
  assert.ok(!JSON.stringify(result).includes("secret-provider-error"));
  assert.deepEqual(bundle.providerBudgetStore.snapshot({ now: NOW }), {
    dailyUsed: 1,
    monthlyUsed: 1
  });

  const metrics = bundle.metricsStore.snapshot();
  assert.equal(metrics.provider_calls, 1);
  assert.equal(metrics.provider_errors, 1);
  assert.equal(metrics.budget_reservations_finalized, 1);
  assert.equal(metrics.response_insufficient, 1);
});

test("successful provider-assisted response records aggregate metrics only", async () => {
  const bundle = runtimeBundle();
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragmentV1()],
    provider: {
      name: "mock",
      async generate() {
        return {
          status: "ok",
          answer: "Respuesta autorizada.",
          citations: [{ ref: "frag_1" }]
        };
      }
    },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime
  });

  await orchestrator.answerQuestion(baseAnswerInput({ question: "texto privado que no debe persistirse" }));
  const metrics = bundle.metricsStore.snapshot();
  assert.equal(metrics.questions_total, 1);
  assert.equal(metrics.provider_calls, 1);
  assert.equal(metrics.response_provider_assisted, 1);
  assert.ok(!JSON.stringify(metrics).includes("texto privado"));
  assert.ok(!JSON.stringify(metrics).includes("u_hash_1"));
});

test("runtime usa contador mensual persistente cuando el usage store lo provee", async () => {
  const config = configV1();

  const policyRuntime = createIrisAiPolicyRuntimeV1({
    config,
    usageQuotaStore: {
      async consume() {
        return {
          allowed: true,
          reason: "usage_reserved",
          totalQuestionsInPeriod: 47
        };
      }
    },
    providerBudgetStore: {
      async reserve() {
        return {
          reserved: false,
          reason: "provider_daily_budget_exhausted"
        };
      },
      async finalize() {
        return { finalized: true };
      },
      async release() {
        return { released: true };
      }
    },
    metricsStore: createInMemoryIrisMetricsStoreV1()
  });

  const started = await policyRuntime.beginQuestion({
    userScope: "u_hash_persistent_test",
    now: NOW
  });

  assert.equal(started.allowed, true);
  assert.equal(started.totalQuestionsInPeriod, 47);
});
