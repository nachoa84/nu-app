"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { routeQuestion } = require("../iris-core/question-router");
const { resolveQuestion } = require("../iris-core/resolve-question");
const { evidence, units } = require("../iris-editorial/packages/collagen-plus-ar-v0");

const benchmark = JSON.parse(fs.readFileSync(path.join(__dirname, "../iris-eval/multidomain-dev-v0.json"), "utf8"));
const evidenceList = Object.values(evidence);

for (const entry of benchmark.cases) {
  test(`multidomain ${entry.id}: ${entry.question}`, () => {
    const route = routeQuestion(entry.question, { market: benchmark.market, language: benchmark.language });
    assert.equal(route.subject, entry.expectedSubject);
    assert.equal(route.intent, entry.expectedIntent);

    const result = resolveQuestion({
      question: entry.question,
      units,
      evidence: evidenceList,
      market: benchmark.market,
      language: benchmark.language
    });

    assert.equal(result.response.status, entry.expectedDecision);

    if (entry.expectedDecision === "DIRECT") {
      assert.ok(result.response.answer.length > 0);
      assert.ok(result.response.evidence.length > 0);
    }

    if (entry.expectedDecision === "UNAVAILABLE") {
      assert.equal(result.response.evidence.length, 0);
    }
  });
}

test("multidomain benchmark includes product, business and office virtual coverage", () => {
  const subjects = new Set(benchmark.cases.map(item => item.expectedSubject).filter(Boolean));
  assert.ok(subjects.has("collagen-plus"));
  assert.ok(subjects.has("ageloc-lumispa"));
  assert.ok(subjects.has("ageloc-wellspa-io"));
  assert.ok(subjects.has("ageloc-galvanic-spa"));
  assert.ok(subjects.has("business"));
  assert.ok(subjects.has("office-virtual"));
});

test("only Collagen+ is answerable until other domains receive approved packages", () => {
  const directCases = benchmark.cases.filter(item => item.expectedDecision === "DIRECT");
  assert.ok(directCases.length > 0);
  assert.ok(directCases.every(item => item.expectedSubject === "collagen-plus"));
});
