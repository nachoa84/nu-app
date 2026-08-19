"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createIrisAiOrchestratorV1 } = require("../iris-ai-orchestrator-v1");
const { createIrisAiLocalResponseEngineV1 } = require("../iris-ai-local-response-v1");
const { createIrisAiPolicyRuntimeV1 } = require("../iris-ai-policy-runtime-v1");
const {
  createInMemoryIrisProviderBudgetStoreV1,
  createInMemoryIrisUsageQuotaStoreV1
} = require("../iris-ai-quota-store-v1");
const { createInMemoryIrisMetricsStoreV1 } = require("../iris-ai-metrics-store-v1");

const TZ = "America/Argentina/Cordoba";
const NOW = new Date("2026-08-19T18:00:00Z");

function createBundle() {
  const config = {
    aiEnabled: true,
    provider: "mock",
    model: "mock-model",
    providerEmergencyStop: false,
    userDailyLimit: 10,
    deviceDailyLimit: null,
    providerGlobalDailyLimit: 10,
    providerGlobalMonthlyLimit: 100,
    maxProviderEscalationPercent: 100,
    budgetTimezone: TZ,
    metricsEnabled: true
  };
  const metricsStore = createInMemoryIrisMetricsStoreV1();
  const policyRuntime = createIrisAiPolicyRuntimeV1({
    config,
    usageQuotaStore: createInMemoryIrisUsageQuotaStoreV1({ timeZone: TZ, userDailyLimit: 10 }),
    providerBudgetStore: createInMemoryIrisProviderBudgetStoreV1({ timeZone: TZ, dailyLimit: 10, monthlyLimit: 100, maxEscalationPercent: 100 }),
    metricsStore
  });
  return { metricsStore, policyRuntime };
}

function input(overrides = {}) {
  return {
    question: "¿Qué hace Collagen Plus?",
    language: "es",
    country: "US",
    productSlug: "collagen-plus",
    userScope: "u_hash_1",
    now: NOW,
    ...overrides
  };
}

function fragment() {
  return {
    documentKey: "doc_internal_1",
    versionLabel: "v1",
    chunkIndex: 0,
    title: "Collagen Plus",
    content: "Collagen Plus aporta una combinación autorizada de ingredientes descritos en la fuente."
  };
}

test("deterministic response wins before retrieval and provider", async () => {
  const bundle = createBundle();
  let retrievalCalls = 0;
  let providerCalls = 0;
  const localResponseEngine = createIrisAiLocalResponseEngineV1({
    deterministicResolver: async () => ({ usable: true, answer: "Respuesta determinística autorizada.", citations: [] })
  });
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => { retrievalCalls += 1; return [fragment()]; },
    provider: { name: "mock", async generate() { providerCalls += 1; return null; } },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime,
    localResponseEngine
  });

  const result = await orchestrator.answerQuestion(input());
  assert.deepEqual(result, {
    status: "ok",
    classification: "deterministic",
    answer: "Respuesta determinística autorizada.",
    citations: []
  });
  assert.equal(retrievalCalls, 0);
  assert.equal(providerCalls, 0);
  assert.equal(bundle.metricsStore.snapshot().response_deterministic, 1);
});

test("verified cache is used before retrieval when source verification is current", async () => {
  const bundle = createBundle();
  let retrievalCalls = 0;
  const localResponseEngine = createIrisAiLocalResponseEngineV1({
    deterministicResolver: async () => null,
    verifiedCacheResolver: async () => ({
      usable: true,
      valid: true,
      sourceVerified: true,
      answer: "Respuesta cacheada y verificada.",
      citations: [{ documentKey: "doc_internal_1", versionLabel: "v1", chunkIndex: 0 }]
    })
  });
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => { retrievalCalls += 1; return [fragment()]; },
    provider: { name: "mock", async generate() { throw new Error("provider should not run"); } },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime,
    localResponseEngine
  });

  const result = await orchestrator.answerQuestion(input());
  assert.equal(result.status, "ok");
  assert.equal(result.classification, "verified_cache");
  assert.equal(retrievalCalls, 0);
  assert.equal(bundle.metricsStore.snapshot().response_verified_cache, 1);
});

test("high-confidence single authorized fragment returns direct retrieval without provider", async () => {
  const bundle = createBundle();
  let providerCalls = 0;
  const localResponseEngine = createIrisAiLocalResponseEngineV1({
    retrievalAssessor: async context => ({
      authorized: true,
      fragmentCount: context.length,
      scopeMatch: true,
      termCoverage: "high",
      directAnswer: true,
      hasContradiction: false
    })
  });
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragment()],
    provider: { name: "mock", async generate() { providerCalls += 1; return null; } },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime,
    localResponseEngine
  });

  const result = await orchestrator.answerQuestion(input());
  assert.equal(result.status, "ok");
  assert.equal(result.classification, "direct_retrieval");
  assert.equal(result.answer, fragment().content);
  assert.deepEqual(result.citations, [{ documentKey: "doc_internal_1", versionLabel: "v1", chunkIndex: 0 }]);
  assert.equal(providerCalls, 0);
  assert.equal(bundle.metricsStore.snapshot().response_direct_retrieval, 1);
});

test("medium retrieval confidence does not fabricate local answer and continues to provider", async () => {
  const bundle = createBundle();
  let providerCalls = 0;
  const localResponseEngine = createIrisAiLocalResponseEngineV1({
    retrievalAssessor: async context => ({
      authorized: true,
      fragmentCount: context.length,
      scopeMatch: true,
      termCoverage: "medium",
      directAnswer: false,
      hasContradiction: false
    })
  });
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragment()],
    provider: {
      name: "mock",
      async generate() {
        providerCalls += 1;
        return { status: "ok", answer: "Respuesta del mock.", citations: [{ ref: "frag_1" }] };
      }
    },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime,
    localResponseEngine
  });

  const result = await orchestrator.answerQuestion(input());
  assert.equal(result.status, "ok");
  assert.equal(result.answer, "Respuesta del mock.");
  assert.equal(providerCalls, 1);
  assert.equal(bundle.metricsStore.snapshot().response_provider_assisted, 1);
});

test("invalid verified cache entry is ignored instead of being returned", async () => {
  const bundle = createBundle();
  let retrievalCalls = 0;
  const localResponseEngine = createIrisAiLocalResponseEngineV1({
    verifiedCacheResolver: async () => ({ usable: true, valid: false, sourceVerified: true, answer: "Cache vencido.", citations: [] })
  });
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => { retrievalCalls += 1; return []; },
    provider: { name: "mock", async generate() { throw new Error("provider should not run"); } },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime,
    localResponseEngine
  });

  const result = await orchestrator.answerQuestion(input());
  assert.equal(result.reason, "no_authorized_context");
  assert.ok(retrievalCalls >= 1);
});

test("cache without verified current source is ignored", async () => {
  const bundle = createBundle();
  let retrievalCalls = 0;
  const localResponseEngine = createIrisAiLocalResponseEngineV1({
    verifiedCacheResolver: async () => ({
      usable: true,
      valid: true,
      sourceVerified: false,
      answer: "Cache que no debe usarse.",
      citations: [{ documentKey: "doc_internal_1", versionLabel: "v1", chunkIndex: 0 }]
    })
  });
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => { retrievalCalls += 1; return []; },
    provider: { name: "mock", async generate() { throw new Error("provider should not run"); } },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime,
    localResponseEngine
  });

  const result = await orchestrator.answerQuestion(input());
  assert.equal(result.reason, "no_authorized_context");
  assert.ok(retrievalCalls >= 1);
});

test("local resolver timeout fails closed without retrieval or provider", async () => {
  const bundle = createBundle();
  let retrievalCalls = 0;
  let providerCalls = 0;
  const localResponseEngine = createIrisAiLocalResponseEngineV1({
    deterministicResolver: async () => new Promise(() => {})
  });
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => { retrievalCalls += 1; return [fragment()]; },
    provider: { name: "mock", async generate() { providerCalls += 1; return null; } },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: bundle.policyRuntime,
    localResponseEngine,
    timeoutMs: 10
  });

  const result = await orchestrator.answerQuestion(input());
  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "local_response_timeout");
  assert.equal(retrievalCalls, 0);
  assert.equal(providerCalls, 0);
});
