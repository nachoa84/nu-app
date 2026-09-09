"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const intake = require("../iris-editorial/intake/wellspa-io-ar-v0");

test("WellSpa iO P1-09 registra extracción real aceptada y paquete de prototipo creado", () => {
  assert.equal(intake.productSlug, "ageloc-wellspa-io");
  assert.equal(intake.market, "AR");
  assert.equal(intake.language, "es");
  assert.equal(intake.status, "extraction-accepted-prototype-package-created");
  assert.equal(intake.productionApproved, false);
  assert.equal(intake.sourceContentSha256, "0d6a6d512d7ffa472908a92a5a81006461ec752d24174c39689bf526242fcf48");
  assert.equal(intake.extractionAudit.acceptedForEvidenceSegmentation, true);
  assert.equal(intake.extractionAudit.positionedSpanRatio, 1);
  assert.deepEqual(intake.extractionAudit.structuredPages, [2]);
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
