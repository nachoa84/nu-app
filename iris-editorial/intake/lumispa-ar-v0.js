"use strict";

module.exports = Object.freeze({
  intakeId: "ageloc-lumispa-ar-v0",
  productSlug: "ageloc-lumispa",
  market: "AR",
  language: "es",
  sourceType: "pdf",
  sourcePath: "assets/iris/fichas-tecnicas/ageloc-lumispa.pdf",
  sourceBlobSha: "5d4016e434acb147a8556d41a00f0a35fe9ffeb6",
  sourceContentSha256: "467cd69fa03639f658b65705d9502ce03b42a6798df010bd0be840412476f538",
  status: "extraction-accepted-prototype-package-created",
  productionApproved: false,
  extractionAudit: Object.freeze({
    pageCount: 5,
    extractedCharacters: 17453,
    totalSpans: 546,
    positionedSpans: 546,
    positionedSpanRatio: 1,
    acceptedForEvidenceSegmentation: true,
    structuredPages: Object.freeze([3])
  }),
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
