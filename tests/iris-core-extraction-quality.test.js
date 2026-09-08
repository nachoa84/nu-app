"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  IrisExtractionQualityError,
  evaluateExtractionQuality,
  looksLikeStructuredContent
} = require("../iris-core/extraction-quality");

function positioned(text, x = 10, y = 10) {
  return { text, x, y, width: Math.max(1, text.length), height: 10 };
}

test("quality gate accepts extraction with text and fully positioned spans", () => {
  const result = evaluateExtractionQuality({
    pageCount: 2,
    pages: [
      { pageNumber: 1, text: "Hola", spans: [positioned("Hola")] },
      { pageNumber: 2, text: "Mundo", spans: [positioned("Mundo")] }
    ]
  });

  assert.equal(result.layoutPreserved, true);
  assert.equal(result.allPagesHaveText, true);
  assert.equal(result.acceptedForEvidenceSegmentation, true);
  assert.equal(result.rawPlainTextSafeForEvidence, false);
  assert.equal(result.policy.plainTextRole, "diagnostic-and-search-aid-only");
});

test("quality gate rejects evidence segmentation when layout positions are missing", () => {
  const result = evaluateExtractionQuality({
    pageCount: 1,
    pages: [{ pageNumber: 1, text: "Hola", spans: [{ text: "Hola" }] }]
  });

  assert.equal(result.layoutPreserved, false);
  assert.equal(result.acceptedForEvidenceSegmentation, false);
});

test("structured content detection flags nutrition and chart-like pages", () => {
  assert.equal(
    looksLikeStructuredContent({ text: "INFORMACIÓN NUTRICIONAL Cantidad por porción", spans: [] }),
    true
  );

  const numericSpans = Array.from({ length: 6 }, (_, index) => positioned(String(index), index * 10, 20));
  assert.equal(looksLikeStructuredContent({ text: "gráfico", spans: numericSpans }), true);
});

test("quality gate validates page count", () => {
  assert.throws(
    () => evaluateExtractionQuality({ pageCount: 2, pages: [{ pageNumber: 1, text: "x", spans: [] }] }),
    IrisExtractionQualityError
  );
});
