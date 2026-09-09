"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const intake = require("../iris-editorial/intake/galvanic-spa-ar-v0");

test("Galvanic Spa P1-10 registra extracción real aceptada y paquete de prototipo creado", () => {
  assert.equal(intake.productSlug, "ageloc-galvanic-spa");
  assert.equal(intake.market, "AR");
  assert.equal(intake.language, "es");
  assert.equal(intake.status, "extraction-accepted-prototype-package-created");
  assert.equal(intake.productionApproved, false);
  assert.equal(intake.sourceContentSha256, "7e8a5b1ae76e29ce93f4f7fd30fb76d386cf755fe94e745c73a60df648f77596");
  assert.equal(intake.extractionAudit.acceptedForEvidenceSegmentation, true);
  assert.equal(intake.extractionAudit.positionedSpanRatio, 1);
  assert.deepEqual(intake.extractionAudit.structuredPages, []);
});

test("Galvanic Spa exige evidencia por página y spans posicionados", () => {
  assert.equal(intake.acceptance.requireRealPdfExtraction, true);
  assert.equal(intake.acceptance.requirePageLevelEvidence, true);
  assert.equal(intake.acceptance.requirePositionedSpans, true);
  assert.equal(intake.acceptance.allowPlainTextAsAuthoritativeEvidence, false);
  assert.equal(intake.acceptance.allowExternalSubstitutionForRepoPdf, false);
  assert.equal(intake.acceptance.applyMedicalSafetyPolicy, true);
});

test("intake referencia exactamente el PDF Galvanic Spa del repo", () => {
  assert.equal(intake.sourcePath, "assets/iris/fichas-tecnicas/ageloc-galvanic-spa.pdf");
});
