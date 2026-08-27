"use strict";

const {
  prepareIrisRetrievalQueriesV1
} = require("./iris-retrieval-query-prep-v1");

const MAX_INTENT_AWARE_QUERIES_V1 = 4;

function normalizeQueryV1(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHintListV1(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map(normalizeQueryV1)
    .filter(Boolean);
}

function uniquePushV1(output, seen, value) {
  const normalized = normalizeQueryV1(value);
  if (!normalized) return;
  const key = normalized.toLocaleLowerCase("es");
  if (seen.has(key)) return;
  seen.add(key);
  output.push(normalized);
}

function createIntentAwareRetrievalQueryPreparerV1({
  resolveHints,
  basePreparer = prepareIrisRetrievalQueriesV1,
  maxQueries = MAX_INTENT_AWARE_QUERIES_V1
} = {}) {
  if (typeof resolveHints !== "function") {
    throw new TypeError("resolveHints debe ser una función.");
  }
  if (typeof basePreparer !== "function") {
    throw new TypeError("basePreparer debe ser una función.");
  }
  if (!Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > 10) {
    throw new TypeError("maxQueries inválido.");
  }

  return function prepareIntentAwareRetrievalQueriesV1(input = {}) {
    const baseQueries = basePreparer(input);
    const hints = normalizeHintListV1(resolveHints(input));
    const output = [];
    const seen = new Set();

    if (Array.isArray(baseQueries) && baseQueries.length > 0) {
      uniquePushV1(output, seen, baseQueries[0]);
    } else {
      uniquePushV1(output, seen, input.question);
    }

    for (const hint of hints) {
      uniquePushV1(output, seen, hint);
      if (output.length >= maxQueries) return output;
    }

    for (const query of Array.isArray(baseQueries) ? baseQueries.slice(1) : []) {
      uniquePushV1(output, seen, query);
      if (output.length >= maxQueries) break;
    }

    return output.slice(0, maxQueries);
  };
}

module.exports = {
  MAX_INTENT_AWARE_QUERIES_V1,
  createIntentAwareRetrievalQueryPreparerV1,
  normalizeHintListV1,
  normalizeQueryV1
};
