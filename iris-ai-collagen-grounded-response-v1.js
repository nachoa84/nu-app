"use strict";

const COLLAGEN_PRODUCT_SLUG_V1 = "beauty-focus-collagen-plus";
const COLLAGEN_CATEGORY_V1 = "product-information";
const COLLAGEN_COUNTRY_V1 = "AR";

function normalizeQuestionV1(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

    const question = normalizeQuestionV1(input.question);
    if (!question) return null;

    for (const fragment of fragments) {
      const content = fragment.content;

      if (
        question.includes("como se toma") ||
        question.includes("como tomar") ||
        question.includes("modo de uso") ||
        question.includes("como se usa")
      ) {
        const instruction = extractInstructionV1(content);
        if (instruction) return candidateV1(fragment, instruction);
      }

      if (
        question.includes("cuanto collagen") ||
        question.includes("cuanto colageno") ||
        question.includes("cantidad de collagen") ||
        question.includes("cantidad de colageno")
      ) {
        if (/Col[aá]geno\s+2500\s+mg/i.test(content)) {
          return candidateV1(
            fragment,
            "Collagen+ aporta 2500 mg de colágeno por porción."
          );
        }
      }

      if (
        question.includes("cuanta luteina") ||
        question === "luteina" ||
        question.includes("cantidad de luteina")
      ) {
        if (/Lute[ií]na\s+5\s+mg/i.test(content)) {
          return candidateV1(
            fragment,
            "Collagen+ aporta 5 mg de luteína por porción."
          );
        }
      }

      if (
        question.includes("embarazada") ||
        question.includes("embarazo") ||
        question.includes("lactancia") ||
        question.includes("ninos") ||
        question.includes("niños")
      ) {
        const warning = extractWarningV1(content);
        if (warning) return candidateV1(fragment, warning);
      }

      if (
        question.includes("trigo") ||
        question.includes("gluten")
      ) {
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
