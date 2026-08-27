"use strict";

const {
  matchCollagenIntentV1
} = require("./iris-ai-collagen-intents-v1");
const {
  normalizeNaturalTextV1
} = require("./iris-ai-natural-intent-matcher-v1");

const COLLAGEN_PRODUCT_SLUG_V1 = "beauty-focus-collagen-plus";
const COLLAGEN_CATEGORY_V1 = "product-information";
const COLLAGEN_COUNTRY_V1 = "AR";
const COLLAGEN_PRODUCT_REFERENCES_V1 = Object.freeze([
  "beauty focus collagen+",
  "beauty focus collagen plus",
  "collagen+",
  "collagen plus",
  "colageno",
  "collagen"
]);

function normalizeScopeQuestionV1(value) {
  return normalizeNaturalTextV1(value);
}

function isCollagenGroundedIntentV1(question) {
  return matchCollagenIntentV1(question) != null;
}

function isCollagenProductReferenceV1(question) {
  const normalized = normalizeScopeQuestionV1(question);
  if (!normalized) return false;
  const padded = ` ${normalized} `;

  return COLLAGEN_PRODUCT_REFERENCES_V1.some(reference => {
    const normalizedReference = normalizeScopeQuestionV1(reference);
    return Boolean(normalizedReference) && padded.includes(` ${normalizedReference} `);
  });
}

function createCollagenRetrievalScopeResolverV1() {
  return async function resolveCollagenRetrievalScopeV1(input = {}) {
    const country = String(input.country || "").trim().toUpperCase();
    const language = String(input.language || "es").trim().toLowerCase();
    const productSlug = input.productSlug == null
      ? null
      : String(input.productSlug).trim();

    if (country !== COLLAGEN_COUNTRY_V1) return null;
    if (language !== "es" && !language.startsWith("es-")) return null;

    if (
      input.category != null &&
      input.category !== COLLAGEN_CATEGORY_V1
    ) {
      return null;
    }

    if (productSlug != null && productSlug !== COLLAGEN_PRODUCT_SLUG_V1) {
      return null;
    }

    // Con producto explícitamente resuelto por la capa de contexto alcanza el
    // scope enviado. Sin productSlug, solo aceptamos preguntas que nombren al
    // producto; una intención genérica como “¿puede una embarazada?” nunca
    // debe convertir silenciosamente el scope en Collagen+.
    if (
      productSlug == null &&
      !isCollagenProductReferenceV1(input.question)
    ) {
      return null;
    }

    if (!isCollagenGroundedIntentV1(input.question)) return null;

    return Object.freeze({
      country: COLLAGEN_COUNTRY_V1,
      category: COLLAGEN_CATEGORY_V1,
      productSlug: COLLAGEN_PRODUCT_SLUG_V1
    });
  };
}

module.exports = {
  COLLAGEN_CATEGORY_V1,
  COLLAGEN_COUNTRY_V1,
  COLLAGEN_PRODUCT_REFERENCES_V1,
  COLLAGEN_PRODUCT_SLUG_V1,
  createCollagenRetrievalScopeResolverV1,
  isCollagenGroundedIntentV1,
  isCollagenProductReferenceV1,
  normalizeScopeQuestionV1
};
