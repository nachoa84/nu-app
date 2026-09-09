"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { routeQuestion } = require("../iris-core/question-router");
const { searchKnowledge } = require("../iris-core/knowledge-search");
const { resolveQuestion } = require("../iris-core/resolve-question");
const { evidence, packageMetadata, units } = require("../iris-editorial/packages/lumispa-ar-v0");

const evidenceList = Object.values(evidence);

test("LumiSpa package remains prototype-only", () => {
  assert.equal(packageMetadata.productSlug, "ageloc-lumispa");
  assert.equal(packageMetadata.market, "AR");
  assert.equal(packageMetadata.approvalScope, "prototype-only");
  assert.equal(packageMetadata.productionApproved, false);
  assert.deepEqual(packageMetadata.excludedStructuredPages, [3]);
  assert.equal(units.length, 6);
});

test("all LumiSpa units are backed by approved PDF evidence outside structured page 3", () => {
  const ids = new Set(evidenceList.map(item => item.evidenceId));
  for (const unit of units) {
    assert.equal(unit.state, "approved");
    assert.equal(unit.answerable, true);
    assert.equal(unit.subject, "ageloc-lumispa");
    for (const evidenceId of unit.evidenceIds) assert.ok(ids.has(evidenceId));
  }
  assert.ok(evidenceList.every(item => item.sourceType === "pdf"));
  assert.ok(evidenceList.every(item => item.locator.pageNumber !== 3));
});

test("LumiSpa usage returns two minutes twice daily with evidence", () => {
  const result = resolveQuestion({ question: "¿Cómo se usa LumiSpa?", units, evidence: evidenceList, market: "AR", language: "es" });
  assert.equal(result.response.status, "DIRECT");
  assert.match(result.response.answer, /dos minutos/i);
  assert.match(result.response.answer, /dos veces al día/i);
  assert.equal(result.response.evidence[0].locator.pageNumber, 2);
});

test("LumiSpa ingredients return cleanser-specific key ingredients", () => {
  const route = routeQuestion("¿Qué ingredientes tiene LumiSpa?");
  const matches = searchKnowledge(units, route);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].topic, "ingredients");
  assert.match(matches[0].content, /Normal\/mixta/i);
  assert.match(matches[0].content, /Sensible/i);
});

test("LumiSpa precautions retain acne and face-only limitations", () => {
  const result = resolveQuestion({ question: "¿Qué precauciones tiene LumiSpa?", units, evidence: evidenceList, market: "AR", language: "es" });
  assert.equal(result.response.status, "DIRECT");
  assert.match(result.response.answer, /acné/i);
  assert.match(result.response.answer, /rostro/i);
});

test("LumiSpa AR package is not reused for MX", () => {
  const route = routeQuestion("¿Cómo se usa LumiSpa?", { market: "MX", language: "es" });
  assert.equal(searchKnowledge(units, route).length, 0);
});
