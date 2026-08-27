"use strict";

(function irisAiClientEscalationModuleV1(root) {
  const BOT_THREAD_KEY_V1 = "routineBotThreadV35";
  const COLLAGEN_PRODUCT_SLUG_V1 = "beauty-focus-collagen-plus";

  const COUNTRY_CODES_V1 = Object.freeze({
    "argentina": "AR",
    "mexico": "MX",
    "españa": "ES",
    "espana": "ES",
    "chile": "CL",
    "colombia": "CO",
    "perú": "PE",
    "peru": "PE",
    "estados unidos": "US",
    "canadá": "CA",
    "canada": "CA",
    "uruguay": "UY",
    "paraguay": "PY",
    "bolivia": "BO",
    "ecuador": "EC",
    "costa rica": "CR",
    "panamá": "PA",
    "panama": "PA",
    "república dominicana": "DO",
    "republica dominicana": "DO"
  });

  const PRODUCT_REGISTRY_V1 = Object.freeze([
    Object.freeze({
      productSlug: COLLAGEN_PRODUCT_SLUG_V1,
      strongAliases: Object.freeze([
        "beauty focus collagen+",
        "beauty focus collagen plus",
        "collagen+",
        "collagen plus"
      ]),
      weakAliases: Object.freeze([
        "colageno",
        "collagen"
      ])
    })
  ]);

  const TECHNICAL_TERMS_V1 = Object.freeze([
    "embaraz",
    "lactan",
    "amamantar",
    "nino",
    "nina",
    "menor",
    "luteina",
    "colageno",
    "ingrediente",
    "composicion",
    "formula",
    "contiene",
    "aporta",
    "trigo",
    "gluten",
    "alerg",
    "contraindic",
    "advert",
    "segur",
    "como se toma",
    "como tomar",
    "como lo tomo",
    "como tengo que tomar",
    "como se usa",
    "como usar",
    "como lo uso",
    "frecuencia",
    "cuantas veces",
    "cuanto tiene",
    "cuanta tiene",
    "cuantos mg",
    "cuantas mg",
    "sirve para",
    "cura",
    "puede tomar",
    "puedo tomar",
    "pueden tomar",
    "puede usar",
    "puedo usar",
    "pueden usar"
  ]);

  const RESOURCE_TERMS_V1 = Object.freeze([
    "catalogo",
    "capacitacion",
    "testimonio",
    "antes y despues",
    "documentacion",
    "ficha tecnica",
    "material",
    "recurso",
    "video",
    "guia para asesorar",
    "precios por mercado"
  ]);

  function normalizeCountryKeyV1(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  function normalizeRoutingTextV1(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function countryCodeV1(value) {
    const raw = String(value || "").trim();
    if (/^[A-Z]{2}$/.test(raw)) return raw;
    return COUNTRY_CODES_V1[normalizeCountryKeyV1(raw)] || null;
  }

  function isClientEnabledV1(globalObject = root) {
    return globalObject?.NU_IRIS_AI_ESCALATION_ENABLED === true;
  }

  function isBaseDeterministicMissV1(response) {
    if (!response || typeof response !== "object") return false;
    if (response.topicId != null) return false;
    const blocks = Array.isArray(response.blocks) ? response.blocks : [];
    if (blocks.length !== 1 || blocks[0]?.type !== "text") return false;

    const text = String(blocks[0]?.content || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    return text.includes("no encontre todavia contenido cargado");
  }

  function textHasAliasV1(text, alias) {
    const normalizedText = ` ${normalizeRoutingTextV1(text)} `;
    const normalizedAlias = normalizeRoutingTextV1(alias);
    return Boolean(normalizedAlias) && normalizedText.includes(` ${normalizedAlias} `);
  }

  function detectExplicitProductV1(question) {
    const strong = PRODUCT_REGISTRY_V1.filter(product =>
      product.strongAliases.some(alias => textHasAliasV1(question, alias))
    );

    if (strong.length === 1) {
      return Object.freeze({
        status: "resolved",
        productSlug: strong[0].productSlug,
        confidence: "explicit",
        source: "current_question"
      });
    }
    if (strong.length > 1) return Object.freeze({ status: "ambiguous" });

    const weak = PRODUCT_REGISTRY_V1.filter(product =>
      product.weakAliases.some(alias => textHasAliasV1(question, alias))
    );

    if (weak.length === 1) {
      return Object.freeze({
        status: "resolved",
        productSlug: weak[0].productSlug,
        confidence: "weak_explicit",
        source: "current_question"
      });
    }
    if (weak.length > 1) return Object.freeze({ status: "ambiguous" });

    return Object.freeze({ status: "missing" });
  }

  function readConversationV1(globalObject = root) {
    try {
      const raw = globalObject?.localStorage?.getItem?.(BOT_THREAD_KEY_V1);
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function currentConversationQuestionV1(globalObject = root) {
    const messages = readConversationV1(globalObject);
    const lastUser = [...messages].reverse().find(message => message?.role === "user");
    return String(lastUser?.text || "").trim();
  }

  function resolveProductContextV1(question, globalObject = root) {
    const explicit = detectExplicitProductV1(question);
    if (explicit.status !== "missing") return explicit;

    const messages = readConversationV1(globalObject);
    let skippedCurrent = false;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "user") continue;

      const messageText = String(message.text || "").trim();
      if (!skippedCurrent && normalizeRoutingTextV1(messageText) === normalizeRoutingTextV1(question)) {
        skippedCurrent = true;
        continue;
      }

      const candidate = detectExplicitProductV1(messageText);
      if (candidate.status === "resolved") {
        return Object.freeze({
          status: "resolved",
          productSlug: candidate.productSlug,
          confidence: "conversation_context",
          source: "previous_turn"
        });
      }
      if (candidate.status === "ambiguous") {
        return candidate;
      }
    }

    return Object.freeze({ status: "missing" });
  }

  function isExplicitResourceRequestV1(question) {
    const normalized = normalizeRoutingTextV1(question);
    return RESOURCE_TERMS_V1.some(term => normalized.includes(term));
  }

  function isTechnicalProductQuestionV1(question) {
    const normalized = normalizeRoutingTextV1(question);
    if (!normalized || isExplicitResourceRequestV1(normalized)) return false;

    if (TECHNICAL_TERMS_V1.some(term => normalized.includes(term))) return true;
    if (/\b(cuanto|cuanta|cuantos|cuantas)\b/.test(normalized) && /\b(mg|g|gramos|ml|medida|porciones)\b/.test(normalized)) {
      return true;
    }

    return false;
  }

  function createClarificationResponseV1() {
    return {
      topicId: null,
      topicTitle: "",
      blocks: [{
        type: "text",
        content: "¿De qué producto querés saberlo?"
      }]
    };
  }

  function routingDecisionV1({ question, deterministicResponse, globalObject = root } = {}) {
    const normalizedQuestion = String(question || currentConversationQuestionV1(globalObject) || "").trim();
    const baseMiss = isBaseDeterministicMissV1(deterministicResponse);
    const technical = isTechnicalProductQuestionV1(normalizedQuestion);

    if (!technical) {
      return Object.freeze({
        shouldEscalate: baseMiss,
        needsClarification: false,
        productSlug: null
      });
    }

    const product = resolveProductContextV1(normalizedQuestion, globalObject);
    if (product.status === "resolved") {
      return Object.freeze({
        shouldEscalate: true,
        needsClarification: false,
        productSlug: product.productSlug,
        productSource: product.source,
        productConfidence: product.confidence
      });
    }

    return Object.freeze({
      shouldEscalate: true,
      needsClarification: true,
      productSlug: null
    });
  }

  // Compatibilidad con bot.js: además del miss clásico, devuelve true cuando
  // una pregunta técnica de producto debe evitar un match textual genérico.
  function isDeterministicMissV1(response, globalObject = root) {
    return routingDecisionV1({
      question: currentConversationQuestionV1(globalObject),
      deterministicResponse: response,
      globalObject
    }).shouldEscalate;
  }

  function toBotResponseV1(payload) {
    if (
      !payload ||
      payload.ok !== true ||
      payload.status !== "ok" ||
      typeof payload.answer !== "string" ||
      !payload.answer.trim()
    ) {
      return null;
    }

    return {
      topicId: null,
      topicTitle: "",
      blocks: [{
        type: "text",
        content: payload.answer.trim()
      }]
    };
  }

  async function tryIrisAiBotEscalationV1({
    question,
    deterministicResponse,
    profile,
    fetchImpl = root?.fetch?.bind(root),
    globalObject = root
  } = {}) {
    if (!isClientEnabledV1(globalObject)) return null;

    const normalizedQuestion = String(question || "").trim();
    const decision = routingDecisionV1({
      question: normalizedQuestion,
      deterministicResponse,
      globalObject
    });

    if (!decision.shouldEscalate) return null;
    if (decision.needsClarification) return createClarificationResponseV1();
    if (typeof fetchImpl !== "function") return null;

    const userId = String(profile?.userId || "").trim();
    const country = countryCodeV1(profile?.country);
    if (!userId || !country || !normalizedQuestion) return null;

    try {
      const body = {
        question: normalizedQuestion,
        userId,
        country,
        language: "es"
      };
      if (decision.productSlug) body.productSlug = decision.productSlug;

      const response = await fetchImpl("/api/iris-ai/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response?.ok) return null;
      const payload = await response.json().catch(() => null);
      return toBotResponseV1(payload);
    } catch (_) {
      return null;
    }
  }

  const api = Object.freeze({
    BOT_THREAD_KEY_V1,
    COLLAGEN_PRODUCT_SLUG_V1,
    COUNTRY_CODES_V1,
    PRODUCT_REGISTRY_V1,
    countryCodeV1,
    createClarificationResponseV1,
    detectExplicitProductV1,
    isBaseDeterministicMissV1,
    isClientEnabledV1,
    isDeterministicMissV1,
    isExplicitResourceRequestV1,
    isTechnicalProductQuestionV1,
    normalizeCountryKeyV1,
    normalizeRoutingTextV1,
    resolveProductContextV1,
    routingDecisionV1,
    toBotResponseV1,
    tryIrisAiBotEscalationV1
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root && typeof root === "object") {
    root.IrisAiClientEscalationV1 = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
