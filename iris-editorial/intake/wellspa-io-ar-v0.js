"use strict";

module.exports = Object.freeze({
  intakeId: "ageloc-wellspa-io-ar-v0",
  productSlug: "ageloc-wellspa-io",
  market: "AR",
  language: "es",
  sourceType: "pdf",
  sourcePath: "assets/iris/fichas-tecnicas/ageloc-wellspa-io.pdf",
  sourceBlobSha: "ba8c7c1904289729f665ea35d6ec9a0a96c41d9d",
  status: "awaiting-real-extraction",
  productionApproved: false,
  requiredTopics: Object.freeze([
    "description",
    "usage",
    "precautions",
    "device-components-or-compatible-products",
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
