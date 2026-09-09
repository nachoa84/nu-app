"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveQuestion } = require("../iris-core/resolve-question");
const { evidence, packageMetadata, units } = require("../iris-editorial/packages/wellspa-io-ar-v0");

const evidenceList = Object.values(evidence);

test("WellSpa package remains prototype-only", () => {
  assert.equal(packageMetadata.productSlug, "ageloc-wellspa-io");
  assert.equal(packageMetadata.market, "AR");
  assert.equal(packageMetadata.productionApproved, false);
  assert.deepEqual(packageMetadata.excludedStructuredPages, [2]);
});

test("all WellSpa units are backed by approved PDF evidence outside structured page 2", () => {
  assert.ok(units.length >= 6);
  for (const unit of units) {
    assert.equal(unit.answerable, true);
    assert.ok(unit.evidenceIds.length >= 1);
    for (const evidenceId of unit.evidenceIds) {
      const item = evidenceList.find(candidate => candidate.evidenceId === evidenceId);
      assert.ok(item, evidenceId);
      assert.equal(item.approvedForKnowledge, true);
      assert.notEqual(item.locator.pageNumber, 2);
    }
  }
});

test("WellSpa description resolves with evidence", () => {
  const result = resolveQuestion({ question: "¿Qué hace WellSpa iO?", units, evidence: evidenceList, market: "AR", language: "es" });
  assert.equal(result.response.status, "DIRECT");
  assert.match(result.response.answer, /microcorriente adaptativa/i);
  assert.ok(result.response.evidence.length >= 1);
});

test("WellSpa usage resolves both topical routines", () => {
  const result = resolveQuestion({ question: "¿Cómo uso WellSpa?", units, evidence: evidenceList, market: "AR", language: "es" });
  assert.equal(result.response.status, "DIRECT");
  assert.match(result.response.answer, /Body Serum/i);
  assert.match(result.response.answer, /Body Activating Gel/i);
});

test("WellSpa ingredients preserve separate topical formulas", () => {
  const result = resolveQuestion({ question: "¿Qué ingredientes tiene WellSpa?", units, evidence: evidenceList, market: "AR", language: "es" });
  assert.equal(result.response.status, "DIRECT");
  assert.match(result.response.answer, /Benzyl Salicylate/i);
  assert.match(result.response.answer, /Limonene/i);
});

test("WellSpa precautions preserve non-medical device limitation", () => {
  const result = resolveQuestion({ question: "¿Qué precauciones tiene WellSpa?", units, evidence: evidenceList, market: "AR", language: "es" });
  assert.equal(result.response.status, "DIRECT");
  assert.match(result.response.answer, /no está diseñado ni pretende diagnosticar/i);
  assert.match(result.response.answer, /enfermedad/i);
});

test("WellSpa AR package is not reused for MX", () => {
  const result = resolveQuestion({ question: "¿Cómo uso WellSpa?", units, evidence: evidenceList, market: "MX", language: "es" });
  assert.equal(result.response.status, "UNAVAILABLE");
  assert.equal(result.response.evidence.length, 0);
});
