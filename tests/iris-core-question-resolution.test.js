"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createEvidence } = require("../iris-core/evidence");
const { createKnowledgeUnit } = require("../iris-core/knowledge-unit");
const { routeQuestion } = require("../iris-core/question-router");
const { searchKnowledge } = require("../iris-core/knowledge-search");
const { decideAnswer } = require("../iris-core/answer-policy");

function approvedUsageUnit({ market = "AR", language = "es", subject = "collagen-plus" } = {}) {
  const evidence = createEvidence({
    sourceType: "pdf",
    sourceId: "collagen-plus-a5ae5ce9",
    sourceTitle: "Beauty Focus Collagen+",
    sourceVersion: "4/27/21",
    market,
    language,
    locator: { pageNumber: 3, section: "¿CÓMO USARLO?" },
    content: "Disfruta de una medida de Collagen+ al día.",
    approvedForKnowledge: true
  });

  return createKnowledgeUnit({
    type: "procedure",
    subject,
    topic: "usage",
    market,
    language,
    content: "Tomar una medida de Collagen+ una vez al día.",
    evidence: [evidence],
    state: "approved"
  });
}

test("resuelve una pregunta de uso de Collagen+ sin LLM", () => {
  const route = routeQuestion("¿Cómo tomo Collagen+?", { market: "AR", language: "es" });
  assert.equal(route.subject, "collagen-plus");
  assert.equal(route.intent, "product.usage");
  assert.equal(route.needsClarification, false);

  const matches = searchKnowledge([approvedUsageUnit()], route);
  assert.equal(matches.length, 1);

  const decision = decideAnswer(route, matches);
  assert.equal(decision.decision, "DIRECT");
  assert.deepEqual(decision.knowledgeUnitIds, [matches[0].knowledgeUnitId]);
});

test("bloquea conocimiento de otro mercado", () => {
  const route = routeQuestion("¿Cómo tomo Collagen+?", { market: "AR", language: "es" });
  const matches = searchKnowledge([approvedUsageUnit({ market: "MX" })], route);
  assert.equal(matches.length, 0);
  assert.equal(decideAnswer(route, matches).decision, "UNAVAILABLE");
});

test("permite conocimiento GLOBAL compatible", () => {
  const route = routeQuestion("¿Cómo tomo Collagen+?", { market: "AR", language: "es" });
  const matches = searchKnowledge([approvedUsageUnit({ market: "GLOBAL" })], route);
  assert.equal(matches.length, 1);
});

test("pide aclaración cuando falta producto", () => {
  const route = routeQuestion("¿Cómo se usa?", { market: "AR", language: "es" });
  assert.equal(route.intent, "product.usage");
  assert.equal(route.subject, null);
  assert.equal(decideAnswer(route, []).decision, "CLARIFY");
});

test("pide aclaración cuando falta intención", () => {
  const route = routeQuestion("Contame sobre Collagen+", { market: "AR", language: "es" });
  assert.equal(route.subject, "collagen-plus");
  assert.equal(route.intent, null);
  assert.equal(decideAnswer(route, []).decision, "CLARIFY");
});

test("no recupera unidades pending o rechazadas por answerable", () => {
  const evidence = createEvidence({
    sourceType: "manual",
    sourceId: "manual-test",
    sourceTitle: "Manual test",
    market: "AR",
    language: "es",
    locator: { section: "usage" },
    content: "Una medida al día.",
    approvedForKnowledge: true
  });
  const pending = createKnowledgeUnit({
    type: "procedure",
    subject: "collagen-plus",
    topic: "usage",
    market: "AR",
    language: "es",
    content: "Una medida al día.",
    evidence: [evidence],
    state: "pending"
  });
  const route = routeQuestion("¿Cómo tomo Collagen+?");
  assert.equal(searchKnowledge([pending], route).length, 0);
});
