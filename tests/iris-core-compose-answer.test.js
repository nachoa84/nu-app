"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createEvidence } = require("../iris-core/evidence");
const { createKnowledgeUnit } = require("../iris-core/knowledge-unit");
const { composeAnswer, IrisAnswerCompositionError } = require("../iris-core/compose-answer");

function usageFixture() {
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

test("DIRECT devuelve solo contenido aprobado y evidencia trazable", () => {
  const { evidence, unit } = usageFixture();
  const response = composeAnswer({
    decision: {
      decision: "DIRECT",
      reason: "approved_knowledge_found",
      knowledgeUnitIds: [unit.knowledgeUnitId]
    },
    matches: [unit],
    evidence: [evidence]
  });

  assert.equal(response.status, "DIRECT");
  assert.equal(response.answer, "Tomar una medida de Collagen+ una vez al día.");
  assert.equal(response.evidence.length, 1);
  assert.equal(response.evidence[0].locator.pageNumber, 3);
  assert.equal(response.evidence[0].content, evidence.content);
});

test("CLARIFY no usa conocimiento ni evidencia", () => {
  const response = composeAnswer({
    decision: { decision: "CLARIFY", reason: "missing_subject", knowledgeUnitIds: [] },
    matches: [],
    evidence: []
  });

  assert.equal(response.status, "CLARIFY");
  assert.deepEqual(response.evidence, []);
  assert.match(response.answer, /sobre qué producto o tema/i);
});

test("UNAVAILABLE responde sin inventar datos", () => {
  const response = composeAnswer({
    decision: { decision: "UNAVAILABLE", reason: "no_approved_knowledge", knowledgeUnitIds: [] }
  });

  assert.equal(response.status, "UNAVAILABLE");
  assert.equal(response.knowledgeUnitIds.length, 0);
  assert.equal(response.evidence.length, 0);
  assert.match(response.answer, /conocimiento aprobado suficiente/i);
});

test("DIRECT falla cerrado si falta una evidencia requerida", () => {
  const { unit } = usageFixture();

  assert.throws(
    () => composeAnswer({
      decision: { decision: "DIRECT", knowledgeUnitIds: [unit.knowledgeUnitId] },
      matches: [unit],
      evidence: []
    }),
    IrisAnswerCompositionError
  );
});

test("DIRECT falla cerrado si la política referencia conocimiento ausente", () => {
  const { evidence } = usageFixture();

  assert.throws(
    () => composeAnswer({
      decision: { decision: "DIRECT", knowledgeUnitIds: ["ku_inexistente"] },
      matches: [],
      evidence: [evidence]
    }),
    IrisAnswerCompositionError
  );
});
