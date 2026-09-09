"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const dataset = require("../iris-eval/collagen-plus-dev-v0.json");
const { normalizeSearchText } = require("../iris-core/normalize");
const { routeQuestion } = require("../iris-core/question-router");
const { resolveQuestion } = require("../iris-core/resolve-question");
const { evidence, units } = require("../iris-editorial/packages/collagen-plus-ar-v0");

function evidenceList() {
  return Object.values(evidence);
}

function evaluateCase(item) {
  const route = routeQuestion(item.question, {
    market: dataset.market,
    language: dataset.language
  });
  const result = resolveQuestion({
    question: item.question,
    units,
    evidence: evidenceList(),
    market: dataset.market,
    language: dataset.language
  });

  const answerNormalized = normalizeSearchText(result.response.answer || "");
  const missingTerms = (item.mustInclude || []).filter(term => !answerNormalized.includes(normalizeSearchText(term)));

  return {
    id: item.id,
    decision: result.response.status,
    intent: route.intent,
    subject: route.subject,
    missingTerms,
    matchesExpected:
      result.response.status === item.expectedDecision &&
      route.intent === item.expectedIntent &&
      route.subject === item.expectedSubject &&
      missingTerms.length === 0
  };
}

test("dataset P1-06 tiene cobertura mínima y permanece development-only", () => {
  assert.equal(dataset.purpose, "development-only");
  assert.equal(dataset.market, "AR");
  assert.equal(dataset.language, "es");
  assert.ok(dataset.cases.length >= 25);

  const prefixes = new Set(dataset.cases.map(item => item.id.split("-")[0]));
  for (const required of ["usage", "ingredients", "precautions", "describe", "clarify", "unavailable", "typo", "scope"]) {
    assert.ok(prefixes.has(required), `falta categoría ${required}`);
  }
});

test("casos sin gap conocido cumplen decisión, intención, sujeto y contenido", () => {
  const failures = dataset.cases
    .filter(item => !item.knownGap)
    .map(evaluateCase)
    .filter(result => !result.matchesExpected);

  assert.deepEqual(failures, []);
});

test("gaps conocidos permanecen explícitos y no se convierten en regresiones silenciosas", () => {
  const known = dataset.cases.filter(item => item.knownGap);
  assert.ok(known.length >= 1);

  for (const item of known) {
    const result = evaluateCase(item);
    assert.equal(result.matchesExpected, true, `${item.id} cambió: actualizar expectativa o cerrar gap deliberadamente`);
  }
});

test("ninguna respuesta DIRECT del benchmark queda sin evidencia", () => {
  for (const item of dataset.cases) {
    const result = resolveQuestion({
      question: item.question,
      units,
      evidence: evidenceList(),
      market: dataset.market,
      language: dataset.language
    });
    if (result.response.status === "DIRECT") assert.ok(result.response.evidence.length >= 1, item.id);
  }
});
