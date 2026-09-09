"use strict";

module.exports = Object.freeze({
  intakeId: "ageloc-galvanic-spa-ar-v0",
  productSlug: "ageloc-galvanic-spa",
  market: "AR",
  language: "es",
  sourceType: "pdf",
  sourcePath: "assets/iris/fichas-tecnicas/ageloc-galvanic-spa.pdf",
  sourceContentSha256: "7e8a5b1ae76e29ce93f4f7fd30fb76d386cf755fe94e745c73a60df648f77596",
  status: "extraction-accepted-prototype-package-created",
  productionApproved: false,
  extractionAudit: Object.freeze({
    pageCount: 2,
    extractedCharacters: 5442,
    totalSpans: 210,
    positionedSpans: 210,
    positionedSpanRatio: 1,
    acceptedForEvidenceSegmentation: true,
    structuredPages: Object.freeze([])
  }),
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
