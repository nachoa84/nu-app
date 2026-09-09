"use strict";

module.exports = Object.freeze({
  intakeId: "ageloc-lumispa-ar-v0",
  productSlug: "ageloc-lumispa",
  market: "AR",
  language: "es",
  sourceType: "pdf",
  sourcePath: "assets/iris/fichas-tecnicas/ageloc-lumispa.pdf",
  sourceBlobSha: "5d4016e434acb147a8556d41a00f0a35fe9ffeb6",
  status: "awaiting-real-extraction",
  productionApproved: false,
  requiredTopics: Object.freeze([
    "description",
    "usage",
    "precautions",
    "ingredients-or-device-components",
    "faq"
  ]),
  acceptance: Object.freeze({
    requireRealPdfExtraction: true,
    requirePageLevelEvidence: true,
    requirePositionedSpans: true,
    allowPlainTextAsAuthoritativeEvidence: false,
    allowExternalSubstitutionForRepoPdf: false
  })
});
