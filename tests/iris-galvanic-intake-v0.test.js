"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const intake = require("../iris-editorial/intake/galvanic-spa-ar-v0");

test("Galvanic Spa P1-10 queda pendiente hasta extracción real", () => {
  assert.equal(intake.productSlug, "ageloc-galvanic-spa");
  assert.equal(intake.market, "AR");
  assert.equal(intake.language, "es");
  assert.equal(intake.status, "awaiting-real-extraction");
  assert.equal(intake.productionApproved, false);
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
