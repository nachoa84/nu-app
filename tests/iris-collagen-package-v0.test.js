"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { routeQuestion } = require("../iris-core/question-router");
const { searchKnowledge } = require("../iris-core/knowledge-search");
const { resolveQuestion } = require("../iris-core/resolve-question");
const { evidence, packageMetadata, units } = require("../iris-editorial/packages/collagen-plus-ar-v0");

function evidenceList() {
  return Object.values(evidence);
}

test("paquete Collagen+ queda limitado al prototipo y no a producción", () => {
  assert.equal(packageMetadata.productSlug, "collagen-plus");
  assert.equal(packageMetadata.market, "AR");
  assert.equal(packageMetadata.approvalScope, "prototype-only");
  assert.equal(packageMetadata.productionApproved, false);
  assert.equal(units.length, 6);
});

test("todas las unidades del paquete están trazadas a evidencia aprobada", () => {
  const ids = new Set(evidenceList().map(item => item.evidenceId));
  for (const unit of units) {
    assert.equal(unit.state, "approved");
    assert.equal(unit.answerable, true);
    assert.equal(unit.market, "AR");
    assert.equal(unit.language, "es");
    assert.equal(unit.subject, "collagen-plus");
    assert.ok(unit.evidenceIds.length >= 1);
    for (const evidenceId of unit.evidenceIds) assert.ok(ids.has(evidenceId));
  }
});

test("pregunta de uso recupera solo la unidad general de uso", () => {
  const route = routeQuestion("¿Cómo tomo Collagen+?");
  const matches = searchKnowledge(units, route);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].topic, "usage");
});

test("pregunta descriptiva no arrastra FAQ tópica", () => {
  const route = routeQuestion("¿Qué es Collagen+?");
  const matches = searchKnowledge(units, route);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].topic, "description");
});

test("pregunta de ingredientes recupera unidad sensible con trigo", () => {
  const route = routeQuestion("¿Qué ingredientes tiene Collagen+?");
  const matches = searchKnowledge(units, route);
  const ingredient = matches.find(unit => unit.type === "ingredient");
  assert.ok(ingredient);
  assert.equal(ingredient.sensitive, true);
  assert.match(ingredient.content, /trigo/i);
});

test("pregunta de precauciones recupera advertencia sensible", () => {
  const route = routeQuestion("¿Qué precauciones tiene Collagen+?");
  const matches = searchKnowledge(units, route);
  const warning = matches.find(unit => unit.type === "warning");
  assert.ok(warning);
  assert.equal(warning.sensitive, true);
  assert.match(warning.content, /embarazo/i);
  assert.match(warning.content, /lactancia/i);
});

test("resolver produce respuesta con evidencia para uso", () => {
  const result = resolveQuestion({
    question: "¿Cómo tomo Collagen+?",
    units,
    evidence: evidenceList(),
    market: "AR",
    language: "es"
  });

  assert.equal(result.decision, "DIRECT");
  assert.match(result.answer, /una medida/i);
  assert.equal(result.knowledgeUnitIds.length, 1);
  assert.ok(result.evidence.length >= 1);
  assert.ok(result.evidence.every(item => item.sourceType === "pdf"));
});

test("mercado distinto no reutiliza el paquete AR", () => {
  const route = routeQuestion("¿Cómo tomo Collagen+?", { market: "MX", language: "es" });
  const matches = searchKnowledge(units, route);
  assert.equal(matches.length, 0);
});
