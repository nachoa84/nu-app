"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createIrisAiOrchestratorV1
} = require("../iris-ai-orchestrator-v1");

function createRuntimeV1(recorded) {
  return {
    providerName: "groq",
    async beginQuestion() {
      return {
        allowed: true,
        totalQuestionsInPeriod: 1
      };
    },
    decideLocal({ retrieval } = {}) {
      return retrieval
        ? { decision: "provider" }
        : { decision: "continue" };
    },
    async authorizeProviderCall() {
      return {
        allowed: true,
        reservationId: "reservation-test-v1"
      };
    },
    async completeProviderCall(input) {
      recorded.completions.push(input);
    },
    async recordResponse(classification) {
      recorded.responses.push(classification);
    }
  };
}

function createLocalEngineV1() {
  return {
    async resolveBeforeRetrieval() {
      return {
        deterministic: null,
        verifiedCache: null
      };
    },
    async resolveAfterRetrieval({ context }) {
      return {
        retrieval: {
          authorized: true,
          fragmentCount: context.length,
          scopeMatch: true,
          termCoverage: "medium",
          directAnswer: false,
          hasContradiction: false
        },
        directRetrieval: null
      };
    }
  };
}

test("provider assisted devuelve clasificación explícita después de validar citas", async () => {
  const recorded = {
    completions: [],
    responses: []
  };

  const provider = {
    name: "groq",
    async generate({ fragments }) {
      assert.deepEqual(
        fragments.map(fragment => fragment.ref),
        ["frag_1"]
      );
      return {
        status: "ok",
        answer: "Respuesta sintética validada.",
        citations: [{ ref: "frag_1" }]
      };
    }
  };

  const orchestrator = createIrisAiOrchestratorV1({
    env: { IRIS_AI_ENABLED: "true" },
    retrieveDocumentChunks: async () => [{
      documentKey: "synthetic-doc-v1",
      versionLabel: "v1",
      chunkIndex: 0,
      title: "Sintético",
      content: "Contenido sintético autorizado."
    }],
    prepareRetrievalQueries: () => ["consulta sintetica"],
    provider,
    policyRuntime: createRuntimeV1(recorded),
    localResponseEngine: createLocalEngineV1()
  });

  const result = await orchestrator.answerQuestion({
    question: "consulta sintetica",
    language: "es",
    country: "US",
    userScope: "iris_test:user",
    deviceScope: "iris_test:device",
    now: new Date("2026-08-20T12:00:00.000Z")
  });

  assert.deepEqual(result, {
    status: "ok",
    classification: "provider_assisted",
    answer: "Respuesta sintética validada.",
    citations: [{
      documentKey: "synthetic-doc-v1",
      versionLabel: "v1",
      chunkIndex: 0
    }]
  });
  assert.deepEqual(recorded.responses, ["provider_assisted"]);
  assert.equal(recorded.completions.length, 1);
  assert.equal(recorded.completions[0].started, true);
  assert.equal(recorded.completions[0].outcome, "ok");
});
