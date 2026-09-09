"use strict";

module.exports = Object.freeze({
  intakeId: "ageloc-galvanic-spa-ar-v0",
  productSlug: "ageloc-galvanic-spa",
  market: "AR",
  language: "es",
  sourceType: "pdf",
  sourcePath: "assets/iris/fichas-tecnicas/ageloc-galvanic-spa.pdf",
  status: "awaiting-real-extraction",
  productionApproved: false,
  requiredTopics: Object.freeze([
    "description",
    "usage",
    "precautions",
    "compatible-products-or-gels",
    "faq"
  ]),
  acceptance: Object.freeze({
    requireRealPdfExtraction: true,
    requirePageLevelEvidence: true,
    requirePositionedSpans: true,
    allowPlainTextAsAuthoritativeEvidence: false,
    allowExternalSubstitutionForRepoPdf: false,
    applyMedicalSafetyPolicy: true
  })
});
