"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  prepareIrisRetrievalQueriesV1
} = require("../iris-retrieval-query-prep-v1");
const {
  createIrisAiOrchestratorV1
} = require("../iris-ai-orchestrator-v1");

function fragmentV1() {
  return {
    documentKey: "doc-collagen",
    versionLabel: "v1",
    chunkIndex: 0,
    title: "Collagen Plus",
    content: "Contenido autorizado sobre Collagen Plus."
  };
}

test("prepara primero la pregunta original y luego términos deterministas del producto", () => {
  const queries = prepareIrisRetrievalQueriesV1({
    question: "¿Qué beneficios tiene Collagen Plus?",
    productSlug: "collagen-plus"
  });

  assert.equal(queries[0], "¿Qué beneficios tiene Collagen Plus?");
  assert.equal(queries[1], "collagen");
  assert.ok(queries.includes("beneficios"));
  assert.ok(queries.length <= 4);
});

test("elimina duplicados y términos genéricos del producto", () => {
  const queries = prepareIrisRetrievalQueriesV1({
    question: "Collagen Plus collagen",
    productSlug: "collagen-plus"
  });

  assert.deepEqual(queries, [
    "Collagen Plus collagen",
    "collagen"
  ]);
});

test("el orquestador reintenta retrieval con fallback determinista antes del provider", async () => {
  const calls = [];
  let providerCalls = 0;

  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async ({ query }) => {
      calls.push(query);
      if (query === "collagen") {
        return [fragmentV1()];
      }
      return [];
    },
    provider: {
      async generate() {
        providerCalls += 1;
        return {
          status: "noop",
          answer: null,
          citations: []
        };
      }
    },
    env: { IRIS_AI_ENABLED: "true" }
  });

  const result = await orchestrator.answerQuestion({
    question: "¿Qué beneficios tiene Collagen Plus?",
    language: "es",
    country: "US",
    productSlug: "collagen-plus"
  });

  assert.deepEqual(calls, [
    "¿Qué beneficios tiene Collagen Plus?",
    "collagen"
  ]);
  assert.equal(providerCalls, 1);
  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "provider_unusable");
});

test("si ningún candidato recupera contexto, el provider no se ejecuta", async () => {
  let providerCalls = 0;

  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [],
    provider: {
      async generate() {
        providerCalls += 1;
        return null;
      }
    },
    env: { IRIS_AI_ENABLED: "true" }
  });

  const result = await orchestrator.answerQuestion({
    question: "¿Qué beneficios tiene Collagen Plus?",
    language: "es",
    country: "US",
    productSlug: "collagen-plus"
  });

  assert.equal(providerCalls, 0);
  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "no_authorized_context");
});
