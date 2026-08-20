"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MAX_DIRECT_QUERY_CHARS_V1,
  createConservativeDirectRetrievalAssessorV1
} = require("../iris-ai-direct-retrieval-assessor-v1");

function fragment(overrides = {}) {
  return {
    documentKey: "doc_direct_v1",
    versionLabel: "v1",
    chunkIndex: 0,
    content: "El término Ácido Hialurónico está presente en este fragmento autorizado.",
    ...overrides
  };
}

test("coincidencia completa normalizada habilita direct retrieval", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const result = await assess(
    [fragment()],
    { question: "ácido hialurónico" }
  );

  assert.deepEqual(result, {
    authorized: true,
    fragmentCount: 1,
    scopeMatch: true,
    termCoverage: "high",
    directAnswer: true,
    hasContradiction: false
  });
});

test("más de un fragmento nunca habilita respuesta directa", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const result = await assess(
    [fragment(), fragment({ documentKey: "doc_2", chunkIndex: 1 })],
    { question: "ácido hialurónico" }
  );

  assert.equal(result.authorized, true);
  assert.equal(result.fragmentCount, 2);
  assert.equal(result.directAnswer, false);
  assert.equal(result.termCoverage, "low");
});

test("coincidencia parcial no se considera alta confianza", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const result = await assess(
    [fragment()],
    { question: "ácido hialurónico dosis diaria" }
  );

  assert.equal(result.directAnswer, false);
  assert.equal(result.scopeMatch, false);
  assert.equal(result.termCoverage, "low");
});

test("pregunta demasiado corta queda fail-closed", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const result = await assess(
    [fragment({ content: "abc contenido" })],
    { question: "abc" }
  );

  assert.equal(result.directAnswer, false);
});

test("pregunta demasiado larga queda fail-closed", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const question = "x".repeat(MAX_DIRECT_QUERY_CHARS_V1 + 1);
  const result = await assess(
    [fragment({ content: question })],
    { question }
  );

  assert.equal(result.directAnswer, false);
});

test("fragmento inválido queda fail-closed", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const result = await assess(
    [fragment({ documentKey: "", content: "ácido hialurónico" })],
    { question: "ácido hialurónico" }
  );

  assert.equal(result.directAnswer, false);
  assert.equal(result.authorized, true);
});

test("cero contexto queda no autorizado", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const result = await assess([], { question: "ácido hialurónico" });

  assert.deepEqual(result, {
    authorized: false,
    fragmentCount: 0,
    scopeMatch: false,
    termCoverage: "low",
    directAnswer: false,
    hasContradiction: false
  });
});

test("normalizador inválido se rechaza al construir", () => {
  assert.throws(
    () => createConservativeDirectRetrievalAssessorV1({ normalizeSearchText: null }),
    /normalizeSearchText/
  );
});
