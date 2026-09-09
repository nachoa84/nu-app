"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveQuestion } = require("../iris-core/resolve-question");
const galvanic = require("../iris-editorial/packages/galvanic-spa-ar-v0");

const units = [...galvanic.units];
const evidence = [...Object.values(galvanic.evidence)];

test("Galvanic Spa package remains prototype-only", () => {
  assert.equal(galvanic.packageMetadata.productSlug, "ageloc-galvanic-spa");
  assert.equal(galvanic.packageMetadata.market, "AR");
  assert.equal(galvanic.packageMetadata.productionApproved, false);
  assert.equal(galvanic.packageMetadata.sourceContentSha256, "7e8a5b1ae76e29ce93f4f7fd30fb76d386cf755fe94e745c73a60df648f77596");
  assert.deepEqual(galvanic.packageMetadata.excludedStructuredPages, []);
});

test("all Galvanic Spa units are backed by approved PDF evidence", () => {
  for (const unit of units) {
    assert.equal(unit.subject, "ageloc-galvanic-spa");
    assert.equal(unit.market, "AR");
    assert.equal(unit.state, "approved");
    assert.ok(unit.evidence.length > 0);
    for (const item of unit.evidence) {
      assert.equal(item.sourceType, "pdf");
      assert.equal(item.approvedForKnowledge, true);
      assert.equal(item.reconstructionRequired, false);
      assert.ok([1, 2].includes(item.locator.pageNumber));
    }
  }
});

test("Galvanic Spa description resolves with evidence", () => {
  const result = resolveQuestion({ question: "¿Para qué sirve Galvanic Spa?", units, evidence, market: "AR", language: "es" });
  assert.equal(result.response.status, "DIRECT");
  assert.ok(result.response.answer.length > 0);
  assert.ok(result.response.evidence.length > 0);
});

test("Galvanic Spa usage resolves conservatively to the manual", () => {
  const result = resolveQuestion({ question: "¿Cómo se usa ageLOC Galvanic Spa?", units, evidence, market: "AR", language: "es" });
  assert.equal(result.response.status, "DIRECT");
  assert.match(result.response.answer, /Manual de Usuario/i);
});

test("Galvanic Spa precautions preserve explicit health restrictions", () => {
  const result = resolveQuestion({ question: "¿Qué precauciones tiene Galvanic Spa?", units, evidence, market: "AR", language: "es" });
  assert.equal(result.response.status, "DIRECT");
  assert.match(result.response.answer, /piel sana/i);
  assert.match(result.response.answer, /marcapasos/i);
  assert.match(result.response.answer, /embarazada/i);
});

test("Galvanic Spa AR package is not reused for MX", () => {
  const result = resolveQuestion({ question: "¿Para qué sirve Galvanic Spa?", units, evidence, market: "MX", language: "es" });
  assert.equal(result.response.status, "UNAVAILABLE");
  assert.equal(result.response.evidence.length, 0);
});
