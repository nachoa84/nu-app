"use strict";

const {
  normalizeIrisSearchTextV1
} = require("./iris-document-chunker-v1");

const MAX_DIRECT_QUERY_CHARS_V1 = 160;
const MIN_DIRECT_QUERY_CHARS_V1 = 4;

function lowAssessmentV1(context) {
  return Object.freeze({
    authorized: Array.isArray(context) && context.length > 0,
    fragmentCount: Array.isArray(context) ? context.length : 0,
    scopeMatch: false,
    termCoverage: "low",
    directAnswer: false,
    hasContradiction: false
  });
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
      normalizedQuestion = normalizeSearchText(input.question);
      normalizedContent = normalizeSearchText(fragment.content);
    } catch {
      return low;
    }

    if (
      !normalizedQuestion ||
      normalizedQuestion.length < MIN_DIRECT_QUERY_CHARS_V1 ||
      normalizedQuestion.length > MAX_DIRECT_QUERY_CHARS_V1 ||
      !normalizedContent ||
      !normalizedContent.includes(normalizedQuestion)
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
  MAX_DIRECT_QUERY_CHARS_V1,
  MIN_DIRECT_QUERY_CHARS_V1,
  createConservativeDirectRetrievalAssessorV1,
  lowAssessmentV1
};
