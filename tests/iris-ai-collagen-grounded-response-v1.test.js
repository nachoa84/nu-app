"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createCollagenGroundedRetrievalResolverV1
} = require("../iris-ai-collagen-grounded-response-v1");
const {
  createIrisAiLocalResponseEngineV1
} = require("../iris-ai-local-response-v1");

const DOCUMENT_KEY = "doc_collagen_test_v1";

function collagenFragment(overrides = {}) {
  return {
    documentKey: DOCUMENT_KEY,
    versionLabel: "2021-04-27",
    chunkIndex: 6,
    title: "Beauty Focus Collagen+",
    country: "AR",
    category: "product-information",
    productSlug: "beauty-focus-collagen-plus",
    content: [
      "INFORMACIÓN NUTRICIONAL",
      "Porción: 3,23 g (1 medida)",
      "Colágeno 2500 mg -",
      "Luteína 5 mg -",
      "INGREDIENTES: Péptidos de colágeno. CONTIENE DERIVADOS DE TRIGO.",
      "INSTRUCCIONES DE CONSUMO: Disolver una medida de Collagen+ en 200 ml de agua y disfruta una vez al día.",
      "ADVERTENCIA: No utilizar en caso de embarazo, mujeres en período de lactancia ni en niños. Mantener fuera del alcance de los niños.",
      "Consumir este producto de acuerdo a las recomendaciones del rótulo."
    ].join("\n"),
    ...overrides
  };
}

async function resolve(question, overrides = {}) {
  const resolver = createCollagenGroundedRetrievalResolverV1();
  return resolver({
    question,
    language: "es",
    country: "AR",
    category: null,
    productSlug: null,
    context: [collagenFragment(overrides)]
  });
}

test("responde modo de uso solo desde el fragmento autorizado", async () => {
  const result = await resolve("como se toma");
  assert.equal(result.usable, true);
  assert.equal(
    result.answer,
    "Disolver una medida de Collagen+ en 200 ml de agua y disfruta una vez al día."
  );
  assert.deepEqual(result.citations, [{
    documentKey: DOCUMENT_KEY,
    versionLabel: "2021-04-27",
    chunkIndex: 6
  }]);
});

test("responde cantidades factuales explícitas", async () => {
  const collagen = await resolve("cuanto collagen tiene");
  assert.equal(
    collagen.answer,
    "Collagen+ aporta 2500 mg de colágeno por porción."
  );

  const lutein = await resolve("cuanta luteina tiene");
  assert.equal(
    lutein.answer,
    "Collagen+ aporta 5 mg de luteína por porción."
  );
});

test("responde advertencia y trigo desde evidencia explícita", async () => {
  const warning = await resolve("puedo tomarlo embarazada");
  assert.match(warning.answer, /No utilizar en caso de embarazo/);
  assert.match(warning.answer, /período de lactancia/);

  const wheat = await resolve("contiene trigo");
  assert.equal(
    wheat.answer,
    "El documento indica que contiene derivados de trigo. Con este dato aprobado no puedo afirmar que sea libre de gluten."
  );

  const glutenFree = await resolve("es libre de gluten");
  assert.equal(
    glutenFree.answer,
    "El documento indica que contiene derivados de trigo. Con este dato aprobado no puedo afirmar que sea libre de gluten."
  );
});

test("falla cerrado para afirmaciones no respaldadas", async () => {
  assert.equal(await resolve("sirve para curar artritis"), null);
  assert.equal(await resolve("es mejor que otro colageno"), null);
});

test("falla cerrado si cambia producto, país o categoría", async () => {
  assert.equal(
    await resolve("como se toma", { country: "MX" }),
    null
  );
  assert.equal(
    await resolve("como se toma", { productSlug: "otro-producto" }),
    null
  );
  assert.equal(
    await resolve("como se toma", { category: "training" }),
    null
  );
});

test("el engine convierte candidato grounded en direct_retrieval de alta confianza", async () => {
  const engine = createIrisAiLocalResponseEngineV1({
    groundedRetrievalResolver:
      createCollagenGroundedRetrievalResolverV1()
  });

  const result = await engine.resolveAfterRetrieval({
    question: "como se toma",
    language: "es",
    country: "AR",
    category: null,
    productSlug: null,
    context: [collagenFragment()]
  });

  assert.deepEqual(result.retrieval, {
    authorized: true,
    fragmentCount: 1,
    scopeMatch: true,
    termCoverage: "high",
    directAnswer: true,
    hasContradiction: false
  });
  assert.equal(result.directRetrieval.classification, "direct_retrieval");
  assert.equal(result.directRetrieval.citations[0].documentKey, DOCUMENT_KEY);
});
