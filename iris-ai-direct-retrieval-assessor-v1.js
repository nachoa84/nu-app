"use strict";

const {
  normalizeIrisSearchTextV1
} = require("./iris-document-chunker-v1");

const MAX_DIRECT_QUERY_CHARS_V1 = 160;
const MIN_DIRECT_QUERY_CHARS_V1 = 4;
const MIN_DIRECT_QUERY_TOKENS_V1 = 2;
const MIN_SINGLE_TOKEN_CHARS_V1 = 12;

const INTERPRETIVE_QUERY_TOKENS_V1 = Object.freeze(new Set([
  "comparar",
  "comparacion",
  "diferencia",
  "diferencias",
  "mejor",
  "peor",
  "recomienda",
  "recomendacion",
  "recomendaciones",
  "debo",
  "puedo",
  "conviene",
  "seguro",
  "segura",
  "riesgo",
  "riesgos",
  "dosis",
  "cuanto",
  "cuanta",
  "cuantos",
  "cuantas",
  "como",
  "porque",
  "excepto",
  "versus",
  "vs"
]));

const CONTRADICTION_MARKERS_V1 = Object.freeze([
  "sin embargo",
  "no obstante",
  "por el contrario",
  "en cambio",
  "excepto",
  "salvo que"
]);

function lowAssessmentV1(context, { hasContradiction = false } = {}) {
  return Object.freeze({
    authorized: Array.isArray(context) && context.length > 0,
    fragmentCount: Array.isArray(context) ? context.length : 0,
    scopeMatch: false,
    termCoverage: "low",
    directAnswer: false,
    hasContradiction
  });
}

function normalizeDirectTextV1(value, normalizeSearchText) {
  return normalizeSearchText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokenizeDirectTextV1(value) {
  return value ? value.split(" ").filter(Boolean) : [];
}

function hasInterpretiveIntentV1(tokens) {
  return tokens.some(token => INTERPRETIVE_QUERY_TOKENS_V1.has(token));
}

function hasContradictionMarkerV1(normalizedContent) {
  const padded = ` ${normalizedContent} `;
  return CONTRADICTION_MARKERS_V1.some(marker =>
    padded.includes(` ${marker} `)
  );
}

function hasBoundedPhraseV1(normalizedContent, normalizedQuestion) {
  return ` ${normalizedContent} `.includes(` ${normalizedQuestion} `);
}

function querySpecificEnoughV1(normalizedQuestion) {
  const tokens = tokenizeDirectTextV1(normalizedQuestion);
  if (tokens.length >= MIN_DIRECT_QUERY_TOKENS_V1) return true;
  return tokens.length === 1 &&
    tokens[0].length >= MIN_SINGLE_TOKEN_CHARS_V1;
}

function createConservativeDirectRetrievalAssessorV1({
  normalizeSearchText = normalizeIrisSearchTextV1
} = {}) {
  if (typeof normalizeSearchText !== "function") {
    throw new TypeError("normalizeSearchText debe ser una función.");
  }

  return async function assessDirectRetrievalV1(context = [], input = {}) {
    const low = lowAssessmentV1(context);

    if (!Array.isArray(context) || context.length !== 1) {
      return low;
    }

    const fragment = context[0];
    if (
      !fragment ||
      typeof fragment !== "object" ||
      typeof fragment.documentKey !== "string" ||
      !fragment.documentKey.trim() ||
      !Number.isSafeInteger(Number(fragment.chunkIndex)) ||
      Number(fragment.chunkIndex) < 0 ||
      typeof fragment.content !== "string" ||
      !fragment.content.trim()
    ) {
      return low;
    }

    if (typeof input?.question !== "string") {
      return low;
    }

    let normalizedQuestion;
    let normalizedContent;

    try {
      normalizedQuestion = normalizeDirectTextV1(
        input.question,
        normalizeSearchText
      );
      normalizedContent = normalizeDirectTextV1(
        fragment.content,
        normalizeSearchText
      );
    } catch {
      return low;
    }

    const contradiction =
      Boolean(normalizedContent) &&
      hasContradictionMarkerV1(normalizedContent);

    if (contradiction) {
      return lowAssessmentV1(context, {
        hasContradiction: true
      });
    }

    const questionTokens = tokenizeDirectTextV1(normalizedQuestion);

    if (
      !normalizedQuestion ||
      normalizedQuestion.length < MIN_DIRECT_QUERY_CHARS_V1 ||
      normalizedQuestion.length > MAX_DIRECT_QUERY_CHARS_V1 ||
      !querySpecificEnoughV1(normalizedQuestion) ||
      hasInterpretiveIntentV1(questionTokens) ||
      !normalizedContent ||
      !hasBoundedPhraseV1(normalizedContent, normalizedQuestion)
    ) {
      return low;
    }

    return Object.freeze({
      authorized: true,
      fragmentCount: 1,
      scopeMatch: true,
      termCoverage: "high",
      directAnswer: true,
      hasContradiction: false
    });
  };
}

module.exports = {
  CONTRADICTION_MARKERS_V1,
  INTERPRETIVE_QUERY_TOKENS_V1,
  MAX_DIRECT_QUERY_CHARS_V1,
  MIN_DIRECT_QUERY_CHARS_V1,
  MIN_DIRECT_QUERY_TOKENS_V1,
  MIN_SINGLE_TOKEN_CHARS_V1,
  createConservativeDirectRetrievalAssessorV1,
  hasBoundedPhraseV1,
  hasContradictionMarkerV1,
  hasInterpretiveIntentV1,
  lowAssessmentV1,
  normalizeDirectTextV1,
  querySpecificEnoughV1,
  tokenizeDirectTextV1
};
