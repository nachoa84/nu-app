"use strict";

const MAX_RETRIEVAL_QUERIES_V1 = 4;
const MIN_TERM_LENGTH_V1 = 3;

const STOP_WORDS_ES_V1 = new Set([
  "a", "al", "algo", "como", "con", "cual", "cuales", "cuando", "de",
  "del", "donde", "el", "ella", "en", "es", "esta", "este", "esto",
  "hace", "hay", "la", "las", "lo", "los", "me", "mi", "para", "por",
  "que", "qué", "se", "si", "sin", "sobre", "son", "su", "sus", "tiene",
  "un", "una", "uno", "y"
]);

const PRODUCT_FILLER_TERMS_V1 = new Set([
  "plus", "product", "producto"
]);

function normalizeCandidateTextV1(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenizeSearchTextV1(value) {
  return normalizeCandidateTextV1(value)
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function uniquePushV1(output, seen, value) {
  const normalized = normalizeCandidateTextV1(value);
  if (!normalized) return;

  const key = normalized.toLocaleLowerCase("es");
  if (seen.has(key)) return;

  seen.add(key);
  output.push(normalized);
}

function prepareIrisRetrievalQueriesV1({
  question,
  productSlug = null
} = {}) {
  const output = [];
  const seen = new Set();

  uniquePushV1(output, seen, question);

  const productTerms = tokenizeSearchTextV1(
    String(productSlug || "").replace(/-/g, " ")
  ).filter(term =>
    term.length >= MIN_TERM_LENGTH_V1 &&
    !PRODUCT_FILLER_TERMS_V1.has(term)
  );

  for (const term of productTerms) {
    uniquePushV1(output, seen, term);
    if (output.length >= MAX_RETRIEVAL_QUERIES_V1) {
      return output;
    }
  }

  const questionTerms = tokenizeSearchTextV1(question).filter(term =>
    term.length >= MIN_TERM_LENGTH_V1 &&
    !STOP_WORDS_ES_V1.has(term) &&
    !PRODUCT_FILLER_TERMS_V1.has(term) &&
    !productTerms.includes(term)
  );

  for (const term of questionTerms) {
    uniquePushV1(output, seen, term);
    if (output.length >= MAX_RETRIEVAL_QUERIES_V1) break;
  }

  return output.slice(0, MAX_RETRIEVAL_QUERIES_V1);
}

module.exports = {
  MAX_RETRIEVAL_QUERIES_V1,
  MIN_TERM_LENGTH_V1,
  prepareIrisRetrievalQueriesV1,
  tokenizeSearchTextV1
};
