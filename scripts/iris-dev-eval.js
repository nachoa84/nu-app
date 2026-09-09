#!/usr/bin/env node
"use strict";

const dataset = require("../iris-eval/collagen-plus-dev-v0.json");
const { normalizeSearchText } = require("../iris-core/normalize");
const { routeQuestion } = require("../iris-core/question-router");
const { resolveQuestion } = require("../iris-core/resolve-question");
const { evidence, units } = require("../iris-editorial/packages/collagen-plus-ar-v0");

const evidenceList = Object.values(evidence);

function evaluate(item) {
  const route = routeQuestion(item.question, { market: dataset.market, language: dataset.language });
  const result = resolveQuestion({
    question: item.question,
    units,
    evidence: evidenceList,
    market: dataset.market,
    language: dataset.language
  });
  const answer = normalizeSearchText(result.answer || "");
  const missingTerms = (item.mustInclude || []).filter(term => !answer.includes(normalizeSearchText(term)));
  const exact = result.decision === item.expectedDecision &&
    route.intent === item.expectedIntent &&
    route.subject === item.expectedSubject &&
    missingTerms.length === 0;
  return { ...item, actualDecision: result.decision, actualIntent: route.intent, actualSubject: route.subject, evidenceCount: result.evidence.length, missingTerms, exact };
}

const rows = dataset.cases.map(evaluate);
const supported = rows.filter(row => !row.knownGap);
const knownGaps = rows.filter(row => row.knownGap);
const direct = rows.filter(row => row.actualDecision === "DIRECT");
const directWithEvidence = direct.filter(row => row.evidenceCount > 0);
const exactSupported = supported.filter(row => row.exact);

const report = {
  datasetId: dataset.datasetId,
  totalCases: rows.length,
  supportedCases: supported.length,
  knownGapCases: knownGaps.length,
  exactSupportedCases: exactSupported.length,
  exactSupportedRate: supported.length ? exactSupported.length / supported.length : 0,
  directCases: direct.length,
  directWithEvidence: directWithEvidence.length,
  directEvidenceRate: direct.length ? directWithEvidence.length / direct.length : 1,
  knownGaps: knownGaps.map(row => ({ id: row.id, question: row.question, gap: row.knownGap, decision: row.actualDecision, intent: row.actualIntent, subject: row.actualSubject })),
  failures: supported.filter(row => !row.exact).map(row => ({ id: row.id, question: row.question, expectedDecision: row.expectedDecision, actualDecision: row.actualDecision, expectedIntent: row.expectedIntent, actualIntent: row.actualIntent, expectedSubject: row.expectedSubject, actualSubject: row.actualSubject, missingTerms: row.missingTerms }))
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.failures.length > 0 || report.directEvidenceRate < 1) process.exitCode = 1;
