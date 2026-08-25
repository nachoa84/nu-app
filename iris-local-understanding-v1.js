"use strict";

const MAX_LOCAL_QUESTION_CHARS_V1 = 500;

const PRODUCT_ALIASES_V1 = Object.freeze([
  { slug: "beauty-focus-collagen-plus", aliases: ["beauty focus collagen plus", "beauty focus collagen+", "collagen plus", "collagen+", "colageno plus", "colageno", "collagen"] },
  { slug: "lifepak", aliases: ["lifepak", "life pak"] },
  { slug: "ageloc-youth", aliases: ["ageloc youth", "age loc youth", "youth"] },
  { slug: "lumispa", aliases: ["lumispa", "lumi spa"] },
  { slug: "nu-bi", aliases: ["nu bi", "nubi"] }
]);

const MARKET_ALIASES_V1 = Object.freeze([
  { country: "AR", market: "latam", aliases: ["argentina", "argentino", "argentina"] },
  { country: "MX", market: "latam", aliases: ["mexico", "méxico", "mexicano"] },
  { country: "CL", market: "latam", aliases: ["chile"] },
  { country: "CO", market: "latam", aliases: ["colombia"] },
  { country: "PE", market: "latam", aliases: ["peru", "perú"] },
  { country: "ES", market: "europe", aliases: ["espana", "españa", "spain"] },
  { country: null, market: "europe", aliases: ["europa", "europe"] },
  { country: null, market: "latam", aliases: ["latam", "latinoamerica", "latinoamérica"] }
]);

const INTENT_RULES_V1 = Object.freeze([
  { intent: "ingredients", terms: ["ingrediente", "ingredientes", "contiene", "composicion", "composición", "que tiene", "qué tiene"] },
  { intent: "usage", terms: ["como se toma", "cómo se toma", "como se usa", "cómo se usa", "modo de uso", "consumo", "tomar", "usar"] },
  { intent: "quantity", terms: ["cuanto trae", "cuánto trae", "cuantos trae", "cuántos trae", "sticks", "tomas", "porciones", "cantidad"] },
  { intent: "benefits", terms: ["beneficio", "beneficios", "para que sirve", "para qué sirve", "que hace", "qué hace"] },
  { intent: "product_overview", terms: ["que es", "qué es", "informacion", "información", "explicame", "explícame", "producto"] },
  { intent: "navigation", terms: ["donde encuentro", "dónde encuentro", "donde esta", "dónde está", "como entro", "cómo entro", "info center", "stela"] },
  { intent: "procedure", terms: ["como hago", "cómo hago", "paso a paso", "procedimiento", "suscripcion", "suscripción", "comprar", "compra"] },
  { intent: "comparison", terms: ["diferencia", "diferencias", "comparar", "comparacion", "comparación", "versus", " vs "] }
]);

function normalizeLocalUnderstandingTextV1(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasBoundedTermV1(text, term) {
  const normalizedTerm = normalizeLocalUnderstandingTextV1(term);
  if (!normalizedTerm) return false;
  return ` ${text} `.includes(` ${normalizedTerm} `);
}

function findAliasMatchV1(text, entries) {
  let best = null;
  for (const entry of entries) {
    for (const alias of entry.aliases || []) {
      const normalizedAlias = normalizeLocalUnderstandingTextV1(alias);
      if (!normalizedAlias || !hasBoundedTermV1(text, normalizedAlias)) continue;
      if (!best || normalizedAlias.length > best.alias.length) {
        best = { entry, alias: normalizedAlias };
      }
    }
  }
  return best;
}

function detectIntentV1(text) {
  for (const rule of INTENT_RULES_V1) {
    if ((rule.terms || []).some(term => hasBoundedTermV1(text, term))) {
      return rule.intent;
    }
  }
  return "unknown";
}

function createIrisLocalUnderstandingV1({ enabled = false } = {}) {
  const isEnabled = enabled === true;

  function classify({ question, productSlug = null, country = null } = {}) {
    if (!isEnabled) {
      return Object.freeze({
        enabled: false,
        intent: "unknown",
        productSlug: productSlug || null,
        country: country || null,
        market: null,
        confidence: "none"
      });
    }

    if (typeof question !== "string") {
      throw new TypeError("question debe ser una cadena.");
    }

    const trimmed = question.trim();
    if (!trimmed || trimmed.length > MAX_LOCAL_QUESTION_CHARS_V1) {
      return Object.freeze({
        enabled: true,
        intent: "unknown",
        productSlug: productSlug || null,
        country: country || null,
        market: null,
        confidence: "low"
      });
    }

    const normalized = normalizeLocalUnderstandingTextV1(trimmed);
    const productMatch = findAliasMatchV1(normalized, PRODUCT_ALIASES_V1);
    const marketMatch = findAliasMatchV1(normalized, MARKET_ALIASES_V1);
    const intent = detectIntentV1(normalized);

    const inferredProductSlug = productSlug || productMatch?.entry?.slug || null;
    const inferredCountry = country || marketMatch?.entry?.country || null;
    const inferredMarket = marketMatch?.entry?.market || null;

    let confidence = "low";
    if (intent !== "unknown" && inferredProductSlug) confidence = "high";
    else if (intent !== "unknown" || inferredProductSlug || inferredCountry || inferredMarket) confidence = "medium";

    return Object.freeze({
      enabled: true,
      intent,
      productSlug: inferredProductSlug,
      country: inferredCountry,
      market: inferredMarket,
      confidence
    });
  }

  return Object.freeze({ enabled: isEnabled, classify });
}

module.exports = {
  INTENT_RULES_V1,
  MARKET_ALIASES_V1,
  MAX_LOCAL_QUESTION_CHARS_V1,
  PRODUCT_ALIASES_V1,
  createIrisLocalUnderstandingV1,
  detectIntentV1,
  findAliasMatchV1,
  hasBoundedTermV1,
  normalizeLocalUnderstandingTextV1
};
