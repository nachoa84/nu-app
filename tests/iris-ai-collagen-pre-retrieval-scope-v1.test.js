"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createCollagenRetrievalScopeResolverV1
} = require("../iris-ai-collagen-retrieval-scope-v1");
const {
  createIrisAiOrchestratorV1
} = require("../iris-ai-orchestrator-v1");
const {
  createNoopIrisAiProviderV1
} = require("../iris-ai-provider-v1");

const COLLAGEN_PRODUCT_SLUG = "beauty-focus-collagen-plus";

function policyRuntimeV1() {
  return {
    providerName: "noop",
    async beginQuestion() {
      return {
        allowed: true,
        reason: "test",
        totalQuestionsInPeriod: 1
      };
    },
    decideLocal() {
      return { decision: "insufficient", reason: "test" };
    },
    async authorizeProviderCall() {
      return {
        allowed: false,
        reason: "provider_blocked",
        reservationId: null
      };
    },
    async completeProviderCall() {
      throw new Error("provider no debe ejecutarse");
    },
    async recordResponse() {}
  };
}

function createScopedOrchestrator(retrieveDocumentChunks) {
  return createIrisAiOrchestratorV1({
    retrieveDocumentChunks,
    provider: createNoopIrisAiProviderV1(),
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime: policyRuntimeV1(),
    resolveRetrievalScope: createCollagenRetrievalScopeResolverV1()
  });
}

test("resuelve scope Collagen con producto contextual antes de consultar documentos", async () => {
  const calls = [];
  const orchestrator = createScopedOrchestrator(async input => {
    calls.push(input);
    return [];
  });

  const result = await orchestrator.answerQuestion({
    question: "como se toma",
    language: "es",
    country: "AR",
    productSlug: COLLAGEN_PRODUCT_SLUG,
    userScope: "test_user",
    deviceScope: "test_device"
  });

  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "no_authorized_context");
  assert.equal(calls.length >= 1, true);

  for (const call of calls) {
    assert.equal(call.country, "AR");
    assert.equal(call.category, "product-information");
    assert.equal(call.productSlug, COLLAGEN_PRODUCT_SLUG);
  }
});

test("intención genérica sin producto no se convierte silenciosamente en Collagen", async () => {
  let retrievalCalls = 0;
  const orchestrator = createScopedOrchestrator(async () => {
    retrievalCalls += 1;
    return [];
  });

  const result = await orchestrator.answerQuestion({
    question: "lo puede tomar una embarazada",
    language: "es",
    country: "AR",
    userScope: "test_user",
    deviceScope: "test_device"
  });

  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "scope_unresolved");
  assert.equal(retrievalCalls, 0);
});

test("pregunta fuera del scope permitido cae en fallback antes de retrieval", async () => {
  let retrievalCalls = 0;
  const orchestrator = createScopedOrchestrator(async () => {
    retrievalCalls += 1;
    return [];
  });

  const result = await orchestrator.answerQuestion({
    question: "sirve para curar artritis",
    language: "es",
    country: "AR",
    productSlug: COLLAGEN_PRODUCT_SLUG,
    userScope: "test_user",
    deviceScope: "test_device"
  });

  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "scope_unresolved");
  assert.equal(retrievalCalls, 0);
});

test("mercado incorrecto no llega a retrieval", async () => {
  let retrievalCalls = 0;
  const orchestrator = createScopedOrchestrator(async () => {
    retrievalCalls += 1;
    return [];
  });

  const result = await orchestrator.answerQuestion({
    question: "cuanto collagen tiene",
    language: "es",
    country: "MX",
    productSlug: COLLAGEN_PRODUCT_SLUG,
    userScope: "test_user",
    deviceScope: "test_device"
  });

  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "scope_unresolved");
  assert.equal(retrievalCalls, 0);
});

test("scope explícito incompatible no se amplía ni reemplaza", async () => {
  let retrievalCalls = 0;
  const orchestrator = createScopedOrchestrator(async () => {
    retrievalCalls += 1;
    return [];
  });

  const result = await orchestrator.answerQuestion({
    question: "cuanto collagen tiene",
    language: "es",
    country: "AR",
    category: "product-information",
    productSlug: "otro-producto",
    userScope: "test_user",
    deviceScope: "test_device"
  });

  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "scope_unresolved");
  assert.equal(retrievalCalls, 0);
});
