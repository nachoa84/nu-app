"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const intake = require("../iris-editorial/intake/lumispa-ar-v0");

test("LumiSpa P1-08 queda pendiente hasta extracción real", () => {
  assert.equal(intake.productSlug, "ageloc-lumispa");
  assert.equal(intake.market, "AR");
  assert.equal(intake.language, "es");
  assert.equal(intake.status, "awaiting-real-extraction");
  assert.equal(intake.productionApproved, false);
});

test("LumiSpa exige evidencia por página y spans posicionados", () => {
  assert.equal(intake.acceptance.requireRealPdfExtraction, true);
  assert.equal(intake.acceptance.requirePageLevelEvidence, true);
  assert.equal(intake.acceptance.requirePositionedSpans, true);
  assert.equal(intake.acceptance.allowPlainTextAsAuthoritativeEvidence, false);
  assert.equal(intake.acceptance.allowExternalSubstitutionForRepoPdf, false);
});

test("intake referencia exactamente el PDF LumiSpa del repo", () => {
  assert.equal(intake.sourcePath, "assets/iris/fichas-tecnicas/ageloc-lumispa.pdf");
  assert.equal(intake.sourceBlobSha, "5d4016e434acb147a8556d41a00f0a35fe9ffeb6");
});
