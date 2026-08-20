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

test("normaliza puntuación sin convertir una consulta segura en semántica", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const result = await assess(
    [fragment({ content: "Ficha: Ácido Hialurónico. Información autorizada." })],
    { question: "ácido hialurónico!" }
  );

  assert.equal(result.directAnswer, true);
  assert.equal(result.termCoverage, "high");
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

test("una palabra corta queda fail-closed aunque aparezca en el fragmento", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const result = await assess(
    [fragment({ content: "collagen plus está autorizado" })],
    { question: "plus" }
  );

  assert.equal(result.directAnswer, false);
});

test("un identificador sintético largo puede mantener pruebas controladas", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const result = await assess(
    [fragment({ content: "zzqvdirect731946825 dato sintético autorizado" })],
    { question: "zzqvdirect731946825" }
  );

  assert.equal(result.directAnswer, true);
});

test("coincidencia embebida dentro de otra palabra queda fail-closed", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const result = await assess(
    [fragment({ content: "microacido hialuronicoide referencia interna" })],
    { question: "acido hialuronico" }
  );

  assert.equal(result.directAnswer, false);
});

test("consulta comparativa queda fail-closed aunque aparezca literal", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const question = "comparar collagen plus";
  const result = await assess(
    [fragment({ content: `${question} figura como encabezado documental` })],
    { question }
  );

  assert.equal(result.directAnswer, false);
});

test("consulta de dosis queda fail-closed aunque aparezca literal", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const question = "dosis diaria collagen";
  const result = await assess(
    [fragment({ content: `${question} referencia documental` })],
    { question }
  );

  assert.equal(result.directAnswer, false);
});

test("consulta de recomendación queda fail-closed aunque aparezca literal", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const question = "recomendacion collagen plus";
  const result = await assess(
    [fragment({ content: `${question} texto autorizado` })],
    { question }
  );

  assert.equal(result.directAnswer, false);
});

test("marcador de contradicción en el fragmento impide respuesta directa", async () => {
  const assess = createConservativeDirectRetrievalAssessorV1();
  const result = await assess(
    [fragment({
      content: "Ácido hialurónico está contemplado. Sin embargo, existen excepciones por contexto."
    })],
    { question: "ácido hialurónico" }
  );

  assert.equal(result.directAnswer, false);
  assert.equal(result.hasContradiction, true);
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
