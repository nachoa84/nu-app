"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createEvidence } = require("../iris-core/evidence");
const { createKnowledgeUnit } = require("../iris-core/knowledge-unit");
const { resolveQuestion } = require("../iris-core/resolve-question");

function approvedUsageFixture() {
  const evidence = createEvidence({
    sourceType: "pdf",
    sourceId: "collagen-plus-a5ae5ce9",
    sourceTitle: "Beauty Focus Collagen+",
    sourceVersion: "4/27/21",
    market: "AR",
    language: "es",
    locator: { pageNumber: 3, section: "¿CÓMO USARLO?", spanIndexes: [16, 18, 20] },
    content: "Disfruta de una medida de Collagen+ al día.",
    reconstructionRequired: false,
    approvedForKnowledge: true
  });

  const unit = createKnowledgeUnit({
    type: "procedure",
    subject: "collagen-plus",
    topic: "usage",
    market: "AR",
    language: "es",
    content: "Tomar una medida de Collagen+ una vez al día.",
    evidence: [evidence],
    state: "approved"
  });

  return { evidence, unit };
}

test("resuelve ¿Cómo tomo Collagen+? con conocimiento aprobado", () => {
  const { evidence, unit } = approvedUsageFixture();
  const result = resolveQuestion({
    question: "¿Cómo tomo Collagen+?",
    units: [unit],
    evidence: [evidence],
    market: "AR",
    language: "es"
  });

  assert.equal(result.route.subject, "collagen-plus");
  assert.equal(result.route.intent, "product.usage");
  assert.equal(result.decision.decision, "DIRECT");
  assert.equal(result.response.status, "DIRECT");
  assert.equal(result.response.answer, "Tomar una medida de Collagen+ una vez al día.");
  assert.equal(result.response.evidence[0].locator.pageNumber, 3);
});

test("pregunta sin producto solicita aclaración", () => {
  const result = resolveQuestion({
    question: "¿Cómo lo tomo?",
    units: [],
    evidence: [],
    market: "AR",
    language: "es"
  });

  assert.equal(result.response.status, "CLARIFY");
});

test("pregunta reconocida sin conocimiento aprobado devuelve UNAVAILABLE", () => {
  const result = resolveQuestion({
    question: "¿Qué ingredientes tiene Collagen+?",
    units: [],
    evidence: [],
    market: "AR",
    language: "es"
  });

  assert.equal(result.route.intent, "product.ingredients");
  assert.equal(result.response.status, "UNAVAILABLE");
});

test("conocimiento MX no responde una consulta AR", () => {
  const evidence = createEvidence({
    sourceType: "structured",
    sourceId: "mx-collagen-usage",
    sourceTitle: "Fuente MX",
    market: "MX",
    language: "es",
    locator: { key: "usage" },
    content: "Contenido MX.",
    approvedForKnowledge: true
  });

  const unit = createKnowledgeUnit({
    type: "procedure",
    subject: "collagen-plus",
    topic: "usage",
    market: "MX",
    language: "es",
    content: "Uso para México.",
    evidence: [evidence],
    state: "approved"
  });

  const result = resolveQuestion({
    question: "¿Cómo tomo Collagen+?",
    units: [unit],
    evidence: [evidence],
    market: "AR",
    language: "es"
  });

  assert.equal(result.response.status, "UNAVAILABLE");
});
