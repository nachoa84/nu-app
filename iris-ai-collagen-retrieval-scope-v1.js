"use strict";

const COLLAGEN_PRODUCT_SLUG_V1 = "beauty-focus-collagen-plus";
const COLLAGEN_CATEGORY_V1 = "product-information";
const COLLAGEN_COUNTRY_V1 = "AR";

function normalizeScopeQuestionV1(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCollagenGroundedIntentV1(question) {
  const normalized = normalizeScopeQuestionV1(question);
  if (!normalized) return false;

  return [
    "como se toma",
    "como tomar",
    "modo de uso",
    "como se usa",
    "cuanto collagen",
    "cuanto colageno",
    "cantidad de collagen",
    "cantidad de colageno",
    "cuantos mg de collagen",
    "cuantos mg de colageno",
    "cuantos miligramos de collagen",
    "cuantos miligramos de colageno",
    "cuanto aporta de collagen",
    "cuanto aporta de colageno",
    "cuanta luteina",
    "cantidad de luteina",
    "cuantos mg de luteina",
    "cuantos miligramos de luteina",
    "embarazada",
    "embarazo",
    "lactancia",
    "ninos",
    "trigo",
    "gluten"
  ].some(term => normalized.includes(term)) || normalized === "luteina";
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
