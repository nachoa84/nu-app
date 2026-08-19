"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FALLBACK_ANSWER_V1,
  MAX_CONTEXT_CHARS_V1,
  MAX_FRAGMENT_CHARS_V1,
  MAX_FRAGMENTS_V1,
  IrisAiOrchestratorErrorV1,
  buildMinimalContextV1,
  createIrisAiOrchestratorV1
} = require("../iris-ai-orchestrator-v1");

function fragmentV1(overrides = {}) {
  return {
    documentKey: "doc-1",
    versionLabel: "v1",
    chunkIndex: 0,
    title: "Collagen Plus",
    content: "Contenido autorizado.",
    objectKey: "private/storage/key",
    contentSha256: "a".repeat(64),
    ...overrides
  };
}

test("AI queda deshabilitada por defecto y no ejecuta retrieval ni provider", async () => {
  let retrievalCalls = 0;
  let providerCalls = 0;
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => {
      retrievalCalls += 1;
      return [fragmentV1()];
    },
    provider: {
      async generate() {
        providerCalls += 1;
        return { status: "ok", answer: "x", citations: [] };
      }
    },
    env: {}
  });

  const result = await orchestrator.answerQuestion({
    question: "¿Qué hace Collagen Plus?",
    language: "es",
    country: "US",
    productSlug: "collagen-plus"
  });

  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "ai_disabled");
  assert.equal(result.answer, FALLBACK_ANSWER_V1);
  assert.equal(retrievalCalls, 0);
  assert.equal(providerCalls, 0);
});

test("retrieval ocurre antes del provider y sin contexto no hay llamada de modelo", async () => {
  const order = [];
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => {
      order.push("retrieval");
      return [];
    },
    provider: {
      async generate() {
        order.push("provider");
        return null;
      }
    },
    env: { IRIS_AI_ENABLED: "true" }
  });

  const result = await orchestrator.answerQuestion({
    question: "colágeno",
    language: "es",
    country: "US"
  });

  assert.deepEqual(order, ["retrieval"]);
  assert.equal(result.reason, "no_authorized_context");
});

test("solo envía fragmentos mínimos autorizados al provider", async () => {
  let providerInput = null;
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragmentV1()],
    provider: {
      async generate(input) {
        providerInput = input;
        return { status: "noop", answer: null, citations: [] };
      }
    },
    env: { IRIS_AI_ENABLED: "true" }
  });

  await orchestrator.answerQuestion({
    question: "colágeno",
    language: "es",
    country: "US"
  });

  assert.ok(providerInput);
  assert.deepEqual(
    Object.keys(providerInput.fragments[0]).sort(),
    ["chunkIndex", "content", "documentKey", "title", "versionLabel"].sort()
  );
  assert.ok(!JSON.stringify(providerInput).includes("private/storage/key"));
  assert.ok(!JSON.stringify(providerInput).includes("a".repeat(64)));
});

test("limita número de fragmentos, tamaño individual y contexto total", () => {
  const fragments = Array.from({ length: 10 }, (_, index) =>
    fragmentV1({
      documentKey: `doc-${index}`,
      chunkIndex: index,
      content: "x".repeat(MAX_FRAGMENT_CHARS_V1 + 100)
    })
  );

  const context = buildMinimalContextV1(fragments);
  const total = context.reduce((sum, item) => sum + item.content.length, 0);

  assert.ok(context.length <= MAX_FRAGMENTS_V1);
  assert.ok(context.every(item => item.content.length <= MAX_FRAGMENT_CHARS_V1));
  assert.ok(total <= MAX_CONTEXT_CHARS_V1);
});

test("acepta respuesta solo si todas las citas pertenecen al contexto recuperado", async () => {
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragmentV1()],
    provider: {
      async generate() {
        return {
          status: "ok",
          answer: "Respuesta basada en el documento.",
          citations: [{
            documentKey: "doc-1",
            versionLabel: "v1",
            chunkIndex: 0
          }]
        };
      }
    },
    env: { IRIS_AI_ENABLED: "true" }
  });

  const result = await orchestrator.answerQuestion({
    question: "colágeno",
    language: "es",
    country: "US"
  });

  assert.equal(result.status, "ok");
  assert.equal(result.citations.length, 1);
});

test("rechaza citas inventadas y usa fallback determinista", async () => {
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragmentV1()],
    provider: {
      async generate() {
        return {
          status: "ok",
          answer: "Respuesta no confiable.",
          citations: [{
            documentKey: "doc-inventado",
            versionLabel: "v9",
            chunkIndex: 99
          }]
        };
      }
    },
    env: { IRIS_AI_ENABLED: "true" }
  });

  const result = await orchestrator.answerQuestion({
    question: "colágeno",
    language: "es",
    country: "US"
  });

  assert.equal(result.status, "fallback");
  assert.equal(result.reason, "provider_unusable");
});

test("errores de retrieval o provider nunca exponen el error original", async () => {
  const retrievalFailure = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => {
      throw new Error("DATABASE_URL=secret");
    },
    env: { IRIS_AI_ENABLED: "true" }
  });

  const first = await retrievalFailure.answerQuestion({
    question: "colágeno",
    language: "es",
    country: "US"
  });
  assert.deepEqual(first, {
    status: "fallback",
    reason: "retrieval_error",
    answer: FALLBACK_ANSWER_V1,
    citations: []
  });

  const providerFailure = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [fragmentV1()],
    provider: {
      async generate() {
        throw new Error("API_KEY=secret");
      }
    },
    env: { IRIS_AI_ENABLED: "true" }
  });

  const second = await providerFailure.answerQuestion({
    question: "colágeno",
    language: "es",
    country: "US"
  });
  assert.equal(second.reason, "provider_error");
  assert.ok(!JSON.stringify(second).includes("secret"));
});

test("valida pregunta antes de cualquier operación", async () => {
  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => []
  });

  await assert.rejects(
    orchestrator.answerQuestion({ question: "" }),
    IrisAiOrchestratorErrorV1
  );

  await assert.rejects(
    orchestrator.answerQuestion({ question: "x".repeat(501) }),
    IrisAiOrchestratorErrorV1
  );
});
