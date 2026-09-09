"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const intake = require("../iris-editorial/intake/wellspa-io-ar-v0");

test("WellSpa iO P1-09 queda pendiente hasta extracción real", () => {
  assert.equal(intake.productSlug, "ageloc-wellspa-io");
  assert.equal(intake.market, "AR");
  assert.equal(intake.language, "es");
  assert.equal(intake.status, "awaiting-real-extraction");
  assert.equal(intake.productionApproved, false);
});

test("WellSpa iO exige evidencia por página y spans posicionados", () => {
  assert.equal(intake.acceptance.requireRealPdfExtraction, true);
  assert.equal(intake.acceptance.requirePageLevelEvidence, true);
  assert.equal(intake.acceptance.requirePositionedSpans, true);
  assert.equal(intake.acceptance.allowPlainTextAsAuthoritativeEvidence, false);
  assert.equal(intake.acceptance.allowExternalSubstitutionForRepoPdf, false);
  assert.equal(intake.acceptance.applyMedicalSafetyPolicy, true);
});

test("intake referencia exactamente el PDF WellSpa iO del repo", () => {
  assert.equal(intake.sourcePath, "assets/iris/fichas-tecnicas/ageloc-wellspa-io.pdf");
  assert.equal(intake.sourceBlobSha, "ba8c7c1904289729f665ea35d6ec9a0a96c41d9d");
});
