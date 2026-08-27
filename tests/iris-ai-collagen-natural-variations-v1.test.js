"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  matchCollagenIntentV1
} = require("../iris-ai-collagen-intents-v1");
const {
  createCollagenGroundedRetrievalResolverV1
} = require("../iris-ai-collagen-grounded-response-v1");
const {
  createCollagenRetrievalScopeResolverV1
} = require("../iris-ai-collagen-retrieval-scope-v1");

const fragment = {
  documentKey: "doc_collagen_test_v1",
  versionLabel: "2021-04-27",
  chunkIndex: 6,
  title: "Beauty Focus Collagen+",
  country: "AR",
  category: "product-information",
  productSlug: "beauty-focus-collagen-plus",
  content: [
    "INFORMACIÓN NUTRICIONAL",
    "Colágeno 2500 mg -",
    "Luteína 5 mg -",
    "INGREDIENTES: Péptidos de colágeno. CONTIENE DERIVADOS DE TRIGO.",
    "INSTRUCCIONES DE CONSUMO: Disolver una medida de Collagen+ en 200 ml de agua y disfruta una vez al día.",
    "ADVERTENCIA: No utilizar en caso de embarazo, mujeres en período de lactancia ni en niños. Mantener fuera del alcance de los niños.",
    "Consumir este producto de acuerdo a las recomendaciones del rótulo."
  ].join("\n")
};

const cases = [
  ["¿Cómo tengo que tomarlo?", "usage"],
  ["¿Cómo se prepara?", "usage"],
  ["¿Con cuánta agua lo preparo?", "usage"],
  ["¿Cuántos mg de colágeno aporta?", "collagen_amount"],
  ["¿Qué cantidad de colágeno tiene?", "collagen_amount"],
  ["¿Cuántos miligramos de luteína trae?", "lutein_amount"],
  ["¿Lo pueden tomar las mujeres embarazadas?", "pregnancy_warning"],
  ["¿Es apto durante el embarazo?", "pregnancy_warning"],
  ["¿Puedo tomarlo si estoy dando de mamar?", "lactation_warning"],
  ["¿Una mujer que amamanta puede consumirlo?", "lactation_warning"],
  ["¿Lo pueden tomar los niños?", "children_warning"],
  ["¿Es apto para niños?", "children_warning"],
  ["¿Tiene trigo?", "wheat_warning"],
  ["¿Es libre de gluten?", "wheat_warning"]
];

test("clasifica variaciones naturales en intents cerrados", () => {
  for (const [question, expectedIntent] of cases) {
    assert.equal(matchCollagenIntentV1(question), expectedIntent, question);
  }
});

test("todas las variaciones reconocidas pueden resolver scope antes de retrieval", async () => {
  const resolveScope = createCollagenRetrievalScopeResolverV1();

  for (const [question] of cases) {
    const scope = await resolveScope({
      question,
      language: "es",
      country: "AR",
      category: null,
      productSlug: null
    });

    assert.deepEqual(scope, {
      country: "AR",
      category: "product-information",
      productSlug: "beauty-focus-collagen-plus"
    }, question);
  }
});

test("las variaciones responden solo si existe evidencia autorizada", async () => {
  const resolve = createCollagenGroundedRetrievalResolverV1();

  for (const [question] of cases) {
    const result = await resolve({
      question,
      language: "es",
      country: "AR",
      category: "product-information",
      productSlug: "beauty-focus-collagen-plus",
      context: [fragment]
    });

    assert.equal(result?.usable, true, question);
    assert.equal(result.citations[0].documentKey, fragment.documentKey, question);
  }
});

test("claims fuera del catálogo siguen cerrados", async () => {
  const resolveScope = createCollagenRetrievalScopeResolverV1();
  const unsupported = [
    "¿Sirve para curar artritis?",
    "¿Me va a rejuvenecer?",
    "¿Es mejor que otro colágeno?",
    "¿Me cura el dolor de rodilla?",
    "¿Qué beneficios tiene durante el embarazo?",
    "¿Qué beneficios aporta en la lactancia?",
    "¿El gluten es bueno o malo?",
    "¿Qué ventajas tiene para los niños?"
  ];

  for (const question of unsupported) {
    assert.equal(matchCollagenIntentV1(question), null, question);
    assert.equal(await resolveScope({
      question,
      language: "es",
      country: "AR"
    }), null, question);
  }
});
