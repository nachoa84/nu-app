"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createIntentAwareRetrievalQueryPreparerV1
} = require("../iris-ai-intent-aware-retrieval-query-prep-v1");
const {
  getCollagenRetrievalHintsV1
} = require("../iris-ai-collagen-intents-v1");
const {
  createCollagenGroundedRetrievalResolverV1
} = require("../iris-ai-collagen-grounded-response-v1");
const {
  createCollagenRetrievalScopeResolverV1
} = require("../iris-ai-collagen-retrieval-scope-v1");
const {
  createIrisAiLocalResponseEngineV1
} = require("../iris-ai-local-response-v1");
const {
  createIrisAiOrchestratorV1
} = require("../iris-ai-orchestrator-v1");

const PRODUCT_SLUG = "beauty-focus-collagen-plus";

function policyRuntimeV1() {
  return {
    providerName: "noop",
    async beginQuestion() {
      return { allowed: true, totalQuestionsInPeriod: 1 };
    },
    decideLocal(input = {}) {
      if (input.retrieval?.directAnswer === true) {
        return { decision: "direct_retrieval" };
      }
      return { decision: "provider" };
    },
    async authorizeProviderCall() {
      return { allowed: false, reason: "provider_blocked" };
    },
    async completeProviderCall() {},
    async recordResponse() {}
  };
}

function usageFragmentV1() {
  return {
    documentKey: "doc_collagen_test_v1",
    versionLabel: "2021-04-27",
    chunkIndex: 6,
    title: "Beauty Focus Collagen+",
    country: "AR",
    category: "product-information",
    productSlug: PRODUCT_SLUG,
    content: [
      "INSTRUCCIONES DE CONSUMO: Disolver una medida de Collagen+ en 200 ml de agua y disfruta una vez al día.",
      "ADVERTENCIA: No utilizar en caso de embarazo, mujeres en período de lactancia ni en niños."
    ].join("\n")
  };
}

test("prioriza hints canónicos después de la pregunta y antes del nombre del producto", () => {
  const prepare = createIntentAwareRetrievalQueryPreparerV1({
    resolveHints: getCollagenRetrievalHintsV1
  });

  assert.deepEqual(
    prepare({
      question: "¿Cómo tengo que tomarlo?",
      productSlug: PRODUCT_SLUG
    }),
    [
      "¿Cómo tengo que tomarlo?",
      "instrucciones de consumo",
      "beauty",
      "focus"
    ]
  );
});

test("mapea intents Collagen a hints cerrados y no aplica hints a otro producto", () => {
  assert.deepEqual(getCollagenRetrievalHintsV1({
    question: "¿Cuántos mg de colágeno aporta?",
    productSlug: PRODUCT_SLUG
  }), ["colageno 2500 mg"]);

  assert.deepEqual(getCollagenRetrievalHintsV1({
    question: "¿Es libre de gluten?",
    productSlug: PRODUCT_SLUG
  }), ["derivados de trigo"]);

  assert.deepEqual(getCollagenRetrievalHintsV1({
    question: "¿Cómo se toma?",
    productSlug: "otro-producto"
  }), []);
});

test("pregunta natural recupera evidencia por hint y responde localmente sin provider", async () => {
  const calls = [];
  let providerCalls = 0;
  const prepareRetrievalQueries = createIntentAwareRetrievalQueryPreparerV1({
    resolveHints: getCollagenRetrievalHintsV1
  });

  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async input => {
      calls.push(input);
      if (input.query === "instrucciones de consumo") {
        return [usageFragmentV1()];
      }
      return [];
    },
    provider: {
      name: "noop",
      async generate() {
        providerCalls += 1;
        return null;
      }
    },
    env: { IRIS_AI_ENABLED: "true" },
    prepareRetrievalQueries,
    policyRuntime: policyRuntimeV1(),
    localResponseEngine: createIrisAiLocalResponseEngineV1({
      groundedRetrievalResolver: createCollagenGroundedRetrievalResolverV1()
    }),
    resolveRetrievalScope: createCollagenRetrievalScopeResolverV1()
  });

  const result = await orchestrator.answerQuestion({
    question: "¿Cómo tengo que tomarlo?",
    language: "es",
    country: "AR",
    productSlug: PRODUCT_SLUG,
    userScope: "test_user",
    deviceScope: "test_device"
  });

  assert.equal(result.status, "ok");
  assert.equal(result.classification, "direct_retrieval");
  assert.match(result.answer, /200 ml de agua/i);
  assert.equal(providerCalls, 0);
  assert.deepEqual(calls.map(call => call.query), [
    "¿Cómo tengo que tomarlo?",
    "instrucciones de consumo"
  ]);
  for (const call of calls) {
    assert.equal(call.country, "AR");
    assert.equal(call.category, "product-information");
    assert.equal(call.productSlug, PRODUCT_SLUG);
  }
});
