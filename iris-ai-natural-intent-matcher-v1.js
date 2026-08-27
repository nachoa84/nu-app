"use strict";

function normalizeNaturalTextV1(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTermsV1(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map(normalizeNaturalTextV1)
    .filter(Boolean);
}

function includesTermV1(text, term) {
  const normalizedText = normalizeNaturalTextV1(text);
  const normalizedTerm = normalizeNaturalTextV1(term);
  if (!normalizedText || !normalizedTerm) return false;

  return (` ${normalizedText} `).includes(` ${normalizedTerm} `);
}

function includesAnyV1(text, values) {
  const terms = normalizeTermsV1(values);
  return terms.length > 0 && terms.some(term => includesTermV1(text, term));
}

function includesAllGroupsV1(text, groups) {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  return groups.every(group => includesAnyV1(text, group));
}

function matchIntentRuleV1(normalizedQuestion, rule = {}) {
  if (!normalizedQuestion) return false;

  if (includesAnyV1(normalizedQuestion, rule.phrases)) return true;

  if (
    Array.isArray(rule.all) &&
    rule.all.length > 0 &&
    includesAllGroupsV1(normalizedQuestion, rule.all)
  ) {
    return true;
  }

  return false;
}

function createNaturalIntentMatcherV1(intentRules = {}) {
  if (!intentRules || typeof intentRules !== "object" || Array.isArray(intentRules)) {
    throw new TypeError("intentRules debe ser un objeto.");
  }

  const entries = Object.entries(intentRules);

  return function matchNaturalIntentV1(question) {
    const normalizedQuestion = normalizeNaturalTextV1(question);
    if (!normalizedQuestion) return null;

    for (const [intent, rule] of entries) {
      if (matchIntentRuleV1(normalizedQuestion, rule)) {
        return intent;
      }
    }

    return null;
  };
}

module.exports = {
  createNaturalIntentMatcherV1,
  includesAllGroupsV1,
  includesAnyV1,
  includesTermV1,
  matchIntentRuleV1,
  normalizeNaturalTextV1
};
