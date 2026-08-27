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

function normalizeQuestionV1(value) {
  return normalizeNaturalTextV1(value);
}

function normalizeSpaceV1(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function scopedFragmentsV1(context = []) {
  if (!Array.isArray(context)) return [];
  return context.filter(fragment =>
    fragment &&
    fragment.productSlug === COLLAGEN_PRODUCT_SLUG_V1 &&
    fragment.category === COLLAGEN_CATEGORY_V1 &&
    fragment.country === COLLAGEN_COUNTRY_V1 &&
    typeof fragment.documentKey === "string" &&
    fragment.documentKey.trim() &&
    Number.isSafeInteger(Number(fragment.chunkIndex)) &&
    typeof fragment.content === "string" &&
    fragment.content.trim()
  );
}

function citationForV1(fragment) {
  return [{
    documentKey: fragment.documentKey,
    versionLabel: fragment.versionLabel ?? null,
    chunkIndex: Number(fragment.chunkIndex)
  }];
}

function candidateV1(fragment, answer) {
  const normalized = normalizeSpaceV1(answer);
  if (!normalized) return null;
  return Object.freeze({
    usable: true,
    answer: normalized,
    citations: citationForV1(fragment)
  });
}

function extractInstructionV1(content) {
  const match = String(content || "").match(
    /INSTRUCCIONES DE CONSUMO\s*:\s*([\s\S]*?)(?=ADVERTENCIA\s*:|$)/i
  );
  return match ? normalizeSpaceV1(match[1]) : null;
}

function extractWarningV1(content) {
  const match = String(content || "").match(
    /ADVERTENCIA\s*:\s*([\s\S]*?)(?=Consumir este producto|$)/i
  );
  return match ? normalizeSpaceV1(match[1]) : null;
}

function createCollagenGroundedRetrievalResolverV1() {
  return async function resolveCollagenGroundedRetrievalV1(input = {}) {
    if (String(input.country || "").toUpperCase() !== COLLAGEN_COUNTRY_V1) {
      return null;
    }

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

    const fragments = scopedFragmentsV1(input.context || []);
    if (fragments.length === 0) return null;

    const intent = matchCollagenIntentV1(input.question);
    if (!intent) return null;

    for (const fragment of fragments) {
      const content = fragment.content;

      if (intent === "usage") {
        const instruction = extractInstructionV1(content);
        if (instruction) return candidateV1(fragment, instruction);
      }

      if (intent === "collagen_amount") {
        if (/Col[aá]geno\s+2500\s+mg/i.test(content)) {
          return candidateV1(
            fragment,
            "Collagen+ aporta 2500 mg de colágeno por porción."
          );
        }
      }

      if (intent === "lutein_amount") {
        if (/Lute[ií]na\s+5\s+mg/i.test(content)) {
          return candidateV1(
            fragment,
            "Collagen+ aporta 5 mg de luteína por porción."
          );
        }
      }

      if (
        intent === "pregnancy_warning" ||
        intent === "lactation_warning" ||
        intent === "children_warning"
      ) {
        const warning = extractWarningV1(content);
        if (warning) return candidateV1(fragment, warning);
      }

      if (intent === "wheat_warning") {
        if (/CONTIENE DERIVADOS DE\s+TRIGO/i.test(content)) {
          return candidateV1(
            fragment,
            "Sí. El documento indica que contiene derivados de trigo."
          );
        }
      }
    }

    return null;
  };
}

module.exports = {
  COLLAGEN_CATEGORY_V1,
  COLLAGEN_COUNTRY_V1,
  COLLAGEN_PRODUCT_SLUG_V1,
  candidateV1,
  createCollagenGroundedRetrievalResolverV1,
  extractInstructionV1,
  extractWarningV1,
  normalizeQuestionV1,
  scopedFragmentsV1
};
