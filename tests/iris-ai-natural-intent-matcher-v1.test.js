"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createNaturalIntentMatcherV1,
  normalizeNaturalTextV1
} = require("../iris-ai-natural-intent-matcher-v1");

const matcher = createNaturalIntentMatcherV1({
  usage: {
    phrases: ["como se toma", "modo de uso"],
    all: [["tomar", "usar"], ["producto", "suplemento"]]
  },
  amount: {
    phrases: ["cuanta cantidad"],
    all: [["cuanto", "cantidad", "mg"], ["vitamina"]]
  }
});

test("normaliza acentos, signos y mayúsculas", () => {
  assert.equal(
    normalizeNaturalTextV1("¿CÓMO se TÓMA?"),
    "como se toma"
  );
});

test("reconoce frases naturales y combinaciones configurables", () => {
  assert.equal(matcher("¿Cómo se toma?"), "usage");
  assert.equal(matcher("Quiero saber el modo de uso"), "usage");
  assert.equal(matcher("¿Puedo usar este suplemento?"), "usage");
  assert.equal(matcher("¿Cuántos mg de vitamina tiene?"), "amount");
});

test("un catálogo nuevo puede reutilizar el matcher sin tocar el motor", () => {
  const futureProductMatcher = createNaturalIntentMatcherV1({
    servings: {
      phrases: ["cuantas porciones trae"],
      all: [["cuantas", "cantidad"], ["porciones"]]
    }
  });

  assert.equal(
    futureProductMatcher("¿Cuántas porciones trae este producto?"),
    "servings"
  );
  assert.equal(futureProductMatcher("¿Sirve para curar artritis?"), null);
});
