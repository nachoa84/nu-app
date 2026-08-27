"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createNaturalIntentMatcherV1,
  includesTermV1,
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

test("reconoce términos y frases solo en límites de token", () => {
  assert.equal(includesTermV1("puedo usar este suplemento", "usar"), true);
  assert.equal(includesTermV1("quiero saber como se toma", "como se toma"), true);
  assert.equal(includesTermV1("abusar de este suplemento", "usar"), false);
  assert.equal(includesTermV1("retomar el producto", "tomar"), false);
});

test("reconoce frases naturales y combinaciones configurables", () => {
  assert.equal(matcher("¿Cómo se toma?"), "usage");
  assert.equal(matcher("Quiero saber el modo de uso"), "usage");
  assert.equal(matcher("¿Puedo usar este suplemento?"), "usage");
  assert.equal(matcher("¿Cuántos mg de vitamina tiene?"), "amount");
  assert.equal(matcher("Quiero abusar de este suplemento"), null);
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
