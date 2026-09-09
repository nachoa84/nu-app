"use strict";

module.exports = Object.freeze({
  intakeId: "ageloc-wellspa-io-ar-v0",
  productSlug: "ageloc-wellspa-io",
  market: "AR",
  language: "es",
  sourceType: "pdf",
  sourcePath: "assets/iris/fichas-tecnicas/ageloc-wellspa-io.pdf",
  sourceBlobSha: "ba8c7c1904289729f665ea35d6ec9a0a96c41d9d",
  sourceContentSha256: "0d6a6d512d7ffa472908a92a5a81006461ec752d24174c39689bf526242fcf48",
  status: "extraction-accepted-prototype-package-created",
  productionApproved: false,
  extractionAudit: Object.freeze({
    pageCount: 6,
    extractedCharacters: 22511,
    totalSpans: 843,
    positionedSpans: 843,
    positionedSpanRatio: 1,
    acceptedForEvidenceSegmentation: true,
    structuredPages: Object.freeze([2])
  }),
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
