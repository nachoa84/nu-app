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

function normalizeScopeQuestionV1(value) {
  return normalizeNaturalTextV1(value);
}

function isCollagenGroundedIntentV1(question) {
  return matchCollagenIntentV1(question) != null;
}

function createCollagenRetrievalScopeResolverV1() {
  return async function resolveCollagenRetrievalScopeV1(input = {}) {
    const country = String(input.country || "").trim().toUpperCase();
    const language = String(input.language || "es").trim().toLowerCase();

    if (country !== COLLAGEN_COUNTRY_V1) return null;
    if (language !== "es" && !language.startsWith("es-")) return null;

    if (
      input.category != null &&
      input.category !== COLLAGEN_CATEGORY_V1
    ) {
      return null;
    }

    if (
      input.productSlug != null &&
      input.productSlug !== COLLAGEN_PRODUCT_SLUG_V1
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
  COLLAGEN_PRODUCT_SLUG_V1,
  createCollagenRetrievalScopeResolverV1,
  isCollagenGroundedIntentV1,
  normalizeScopeQuestionV1
};
