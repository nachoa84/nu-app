"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  COLLAGEN_PRODUCT_SLUG_V1,
  detectExplicitProductV1,
  isTechnicalProductQuestionV1,
  resolveProductContextV1,
  routingDecisionV1,
  tryIrisAiBotEscalationV1
} = require("../iris-ai-client-escalation-v1");
const {
  createCollagenRetrievalScopeResolverV1
} = require("../iris-ai-collagen-retrieval-scope-v1");
const {
  normalizeRequestV1
} = require("../iris-ai-user-route-v1");

const SYNTHETIC_PRODUCT_SLUG_V1 = "synthetic-collagen-product";

function storageWithMessages(messages) {
  return {
    NU_IRIS_AI_ESCALATION_ENABLED: true,
    localStorage: {
      getItem(key) {
        if (key !== "routineBotThreadV35") return null;
        return JSON.stringify(messages);
      }
    }
  };
}

function deterministicTopic(topicId = "generic-topic") {
  return {
    topicId,
    topicTitle: "Contenido genérico",
    blocks: [{ type: "text", content: "Respuesta determinista genérica" }]
  };
}

function syntheticMultiProductRegistryV1() {
  return [
    {
      productSlug: COLLAGEN_PRODUCT_SLUG_V1,
      strongAliases: ["beauty focus collagen+", "collagen+"],
      weakAliases: ["colageno", "collagen"]
    },
    {
      productSlug: SYNTHETIC_PRODUCT_SLUG_V1,
      strongAliases: ["synthetic collagen"],
      weakAliases: ["colageno", "collagen"]
    }
  ];
}

test("resuelve Collagen+ explícito y mantiene aliases débiles separados", () => {
  assert.equal(
    detectExplicitProductV1("¿Cuántos mg aporta Beauty Focus Collagen+?").productSlug,
    COLLAGEN_PRODUCT_SLUG_V1
  );
  assert.equal(
    detectExplicitProductV1("¿Cuánto colágeno tiene?").productSlug,
    COLLAGEN_PRODUCT_SLUG_V1
  );
  assert.equal(detectExplicitProductV1("¿Lo puede usar?").status, "missing");
});

test("pregunta explícita sobre colágeno y embarazo resuelve Collagen+ mientras el alias es único", () => {
  const decision = routingDecisionV1({
    question: "¿El colágeno lo pueden tomar las embarazadas?",
    deterministicResponse: deterministicTopic("boost-guide"),
    globalObject: storageWithMessages([])
  });

  assert.equal(decision.shouldEscalate, true);
  assert.equal(decision.needsClarification, false);
  assert.equal(decision.productSlug, COLLAGEN_PRODUCT_SLUG_V1);
  assert.equal(decision.productConfidence, "weak_explicit");
});

test("alias débil compartido entre productos queda ambiguo y nunca elige uno arbitrariamente", () => {
  const registry = syntheticMultiProductRegistryV1();

  assert.deepEqual(
    detectExplicitProductV1("¿El colágeno lo pueden tomar las embarazadas?", registry),
    { status: "ambiguous" }
  );

  const decision = routingDecisionV1({
    question: "¿El colágeno lo pueden tomar las embarazadas?",
    deterministicResponse: deterministicTopic("boost-guide"),
    globalObject: storageWithMessages([]),
    productRegistry: registry
  });

  assert.equal(decision.shouldEscalate, true);
  assert.equal(decision.needsClarification, true);
  assert.equal(decision.productSlug, null);
});

test("nombre comercial fuerte tiene prioridad aunque varios productos compartan alias débil", () => {
  const registry = syntheticMultiProductRegistryV1();

  assert.deepEqual(
    detectExplicitProductV1("¿Beauty Focus Collagen+ lo pueden tomar embarazadas?", registry),
    {
      status: "resolved",
      productSlug: COLLAGEN_PRODUCT_SLUG_V1,
      confidence: "explicit",
      source: "current_question"
    }
  );

  assert.deepEqual(
    detectExplicitProductV1("¿Synthetic Collagen lo pueden tomar embarazadas?", registry),
    {
      status: "resolved",
      productSlug: SYNTHETIC_PRODUCT_SLUG_V1,
      confidence: "explicit",
      source: "current_question"
    }
  );
});

test("contexto conversacional multi-producto hereda solo un producto previamente resuelto", () => {
  const registry = syntheticMultiProductRegistryV1();
  const explicitContext = storageWithMessages([
    { role: "user", text: "Quiero saber sobre Beauty Focus Collagen+" },
    { role: "bot", text: "Decime qué querés consultar." },
    { role: "user", text: "¿Lo pueden tomar embarazadas?" }
  ]);

  assert.deepEqual(
    resolveProductContextV1("¿Lo pueden tomar embarazadas?", explicitContext, registry),
    {
      status: "resolved",
      productSlug: COLLAGEN_PRODUCT_SLUG_V1,
      confidence: "conversation_context",
      source: "previous_turn"
    }
  );

  const ambiguousContext = storageWithMessages([
    { role: "user", text: "Quiero saber sobre colágeno" },
    { role: "bot", text: "Decime qué querés consultar." },
    { role: "user", text: "¿Lo pueden tomar embarazadas?" }
  ]);

  assert.deepEqual(
    resolveProductContextV1("¿Lo pueden tomar embarazadas?", ambiguousContext, registry),
    { status: "ambiguous" }
  );
});

test("hereda el producto de la conversación para un pronombre", () => {
  const globalObject = storageWithMessages([
    { role: "user", text: "¿Cuánto colágeno tiene?" },
    { role: "bot", text: "Collagen+ aporta 2500 mg." },
    { role: "user", text: "¿Lo puede tomar una embarazada?" }
  ]);

  const context = resolveProductContextV1(
    "¿Lo puede tomar una embarazada?",
    globalObject
  );

  assert.deepEqual(context, {
    status: "resolved",
    productSlug: COLLAGEN_PRODUCT_SLUG_V1,
    confidence: "conversation_context",
    source: "previous_turn"
  });
});

test("pregunta técnica con producto resuelto evita match determinista genérico", () => {
  const globalObject = storageWithMessages([
    { role: "user", text: "¿Cuánto colágeno tiene?" },
    { role: "user", text: "¿Cuánta luteína tiene?" }
  ]);

  const decision = routingDecisionV1({
    question: "¿Cuánta luteína tiene?",
    deterministicResponse: deterministicTopic("collagen-resources"),
    globalObject
  });

  assert.equal(isTechnicalProductQuestionV1("¿Cuánta luteína tiene?"), true);
  assert.equal(decision.shouldEscalate, true);
  assert.equal(decision.needsClarification, false);
  assert.equal(decision.productSlug, COLLAGEN_PRODUCT_SLUG_V1);
});

test("pregunta técnica ambigua pide producto y no hace fetch", async () => {
  let calls = 0;
  const globalObject = storageWithMessages([
    { role: "user", text: "¿Lo pueden usar las embarazadas?" }
  ]);

  const result = await tryIrisAiBotEscalationV1({
    question: "¿Lo pueden usar las embarazadas?",
    deterministicResponse: deterministicTopic("boost-guide"),
    profile: { userId: "usr_1", country: "Argentina" },
    globalObject,
    fetchImpl: async () => {
      calls += 1;
    }
  });

  assert.equal(calls, 0);
  assert.deepEqual(result, {
    topicId: null,
    topicTitle: "",
    blocks: [{ type: "text", content: "¿De qué producto querés saberlo?" }]
  });
});

test("pregunta técnica contextual envía productSlug explícito al backend", async () => {
  let requestBody = null;
  const globalObject = storageWithMessages([
    { role: "user", text: "¿Cuánto colágeno tiene?" },
    { role: "bot", text: "Collagen+ aporta 2500 mg." },
    { role: "user", text: "¿Lo puede tomar una embarazada?" }
  ]);

  const result = await tryIrisAiBotEscalationV1({
    question: "¿Lo puede tomar una embarazada?",
    deterministicResponse: deterministicTopic("boost-guide"),
    profile: { userId: "usr_1", country: "Argentina" },
    globalObject,
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            status: "ok",
            classification: "direct_retrieval",
            answer: "Respuesta aprobada",
            citations: []
          };
        }
      };
    }
  });

  assert.equal(requestBody.productSlug, COLLAGEN_PRODUCT_SLUG_V1);
  assert.equal(requestBody.question, "¿Lo puede tomar una embarazada?");
  assert.equal(result.blocks[0].content, "Respuesta aprobada");
});

test("contrato de ruta acepta productSlug validado y rechaza slugs inválidos", () => {
  assert.deepEqual(
    normalizeRequestV1({
      question: "¿Cuánta luteína tiene?",
      userId: "usr_1",
      country: "ar",
      language: "es",
      productSlug: COLLAGEN_PRODUCT_SLUG_V1
    }),
    {
      question: "¿Cuánta luteína tiene?",
      userId: "usr_1",
      country: "AR",
      language: "es",
      productSlug: COLLAGEN_PRODUCT_SLUG_V1
    }
  );

  assert.throws(
    () => normalizeRequestV1({
      question: "consulta",
      userId: "usr_1",
      country: "AR",
      productSlug: "../../otro"
    }),
    /Producto inválido/
  );
});

test("scope Collagen no se infiere desde embarazo sin producto", async () => {
  const resolveScope = createCollagenRetrievalScopeResolverV1();

  assert.equal(await resolveScope({
    question: "¿Lo puede tomar una embarazada?",
    country: "AR",
    language: "es"
  }), null);

  assert.deepEqual(await resolveScope({
    question: "¿Lo puede tomar una embarazada?",
    country: "AR",
    language: "es",
    productSlug: COLLAGEN_PRODUCT_SLUG_V1
  }), {
    country: "AR",
    category: "product-information",
    productSlug: COLLAGEN_PRODUCT_SLUG_V1
  });
});

test("pedido explícito de recurso conserva prioridad determinista", () => {
  const globalObject = storageWithMessages([
    { role: "user", text: "Mostrame la guía para asesorar Collagen+" }
  ]);

  const decision = routingDecisionV1({
    question: "Mostrame la guía para asesorar Collagen+",
    deterministicResponse: deterministicTopic("collagen-guide"),
    globalObject
  });

  assert.equal(decision.shouldEscalate, false);
  assert.equal(decision.needsClarification, false);
});
