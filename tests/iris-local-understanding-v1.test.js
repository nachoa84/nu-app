"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createIrisLocalUnderstandingV1,
  normalizeLocalUnderstandingTextV1
} = require("../iris-local-understanding-v1");

test("classifier is fail-closed when disabled", () => {
  const classifier = createIrisLocalUnderstandingV1();
  assert.deepEqual(classifier.classify({ question: "¿Qué contiene Collagen+?" }), {
    enabled: false,
    intent: "unknown",
    productSlug: null,
    country: null,
    market: null,
    confidence: "none"
  });
});

test("normalization removes accents and punctuation conservatively", () => {
  assert.equal(
    normalizeLocalUnderstandingTextV1(" ¿Cómo se toma Collagen+ en MÉXICO? "),
    "como se toma collagen+ en mexico"
  );
});

const productCases = [
  ["¿Qué contiene Collagen+?", "beauty-focus-collagen-plus", "ingredients"],
  ["ingredientes del colágeno", "beauty-focus-collagen-plus", "ingredients"],
  ["¿Cómo se toma Beauty Focus Collagen Plus?", "beauty-focus-collagen-plus", "usage"],
  ["¿Cuántos sticks trae collagen plus?", "beauty-focus-collagen-plus", "quantity"],
  ["¿Para qué sirve el colageno?", "beauty-focus-collagen-plus", "benefits"],
  ["¿Qué es LifePak?", "lifepak", "product_overview"],
  ["que tiene life pak", "lifepak", "ingredients"],
  ["¿Cómo se usa ageLOC Youth?", "ageloc-youth", "usage"],
  ["beneficios de Youth", "ageloc-youth", "benefits"],
  ["¿Qué es LumiSpa?", "lumispa", "product_overview"],
  ["modo de uso de lumi spa", "lumispa", "usage"],
  ["¿Qué es Nu Bi?", "nu-bi", "product_overview"]
];

for (const [question, productSlug, intent] of productCases) {
  test(`classifies product/intention: ${question}`, () => {
    const classifier = createIrisLocalUnderstandingV1({ enabled: true });
    const result = classifier.classify({ question });
    assert.equal(result.productSlug, productSlug);
    assert.equal(result.intent, intent);
    assert.equal(result.confidence, "high");
  });
}

const marketCases = [
  ["precio en Argentina", "AR", "latam"],
  ["¿cómo funciona en México?", "MX", "latam"],
  ["información para Chile", "CL", "latam"],
  ["producto en Colombia", "CO", "latam"],
  ["¿y en Perú?", "PE", "latam"],
  ["¿cómo se compra en España?", "ES", "europe"],
  ["información para Europa", null, "europe"],
  ["material para LATAM", null, "latam"]
];

for (const [question, country, market] of marketCases) {
  test(`classifies market: ${question}`, () => {
    const classifier = createIrisLocalUnderstandingV1({ enabled: true });
    const result = classifier.classify({ question });
    assert.equal(result.country, country);
    assert.equal(result.market, market);
  });
}

test("explicit product and country win over inferred values", () => {
  const classifier = createIrisLocalUnderstandingV1({ enabled: true });
  const result = classifier.classify({
    question: "¿Cómo se toma Collagen+ en España?",
    productSlug: "lifepak",
    country: "AR"
  });
  assert.equal(result.productSlug, "lifepak");
  assert.equal(result.country, "AR");
  assert.equal(result.market, "europe");
  assert.equal(result.intent, "usage");
});

test("unknown questions do not invent product, market or intent", () => {
  const classifier = createIrisLocalUnderstandingV1({ enabled: true });
  const result = classifier.classify({ question: "hola iris" });
  assert.deepEqual(result, {
    enabled: true,
    intent: "unknown",
    productSlug: null,
    country: null,
    market: null,
    confidence: "low"
  });
});

test("comparison is classified but does not generate an answer", () => {
  const classifier = createIrisLocalUnderstandingV1({ enabled: true });
  const result = classifier.classify({ question: "diferencias entre LifePak y Collagen+" });
  assert.equal(result.intent, "comparison");
  assert.ok(["lifepak", "beauty-focus-collagen-plus"].includes(result.productSlug));
});

test("invalid question type is rejected only when enabled", () => {
  const classifier = createIrisLocalUnderstandingV1({ enabled: true });
  assert.throws(() => classifier.classify({ question: 123 }), TypeError);
});
