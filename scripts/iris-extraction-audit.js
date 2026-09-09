#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { evaluateExtractionQuality } = require("../iris-core/extraction-quality");

function usage() {
  return [
    "Uso:",
    "node scripts/iris-extraction-audit.js <extraction.json> [expectedProductSlug]",
    "",
    "Ejemplo:",
    "node scripts/iris-extraction-audit.js lumispa-extraction.json ageloc-lumispa"
  ].join("\n");
}

function main(argv = process.argv.slice(2)) {
  const [inputPath, expectedProductSlug] = argv;
  if (!inputPath) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
    return;
  }

  const resolved = path.resolve(inputPath);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));

  if (parsed.schemaVersion !== "iris-prototype-source-v0") {
    throw new Error(`schemaVersion inesperado: ${parsed.schemaVersion || "missing"}`);
  }
  if (!parsed.source || !parsed.extraction) {
    throw new Error("El archivo no contiene source + extraction.");
  }
  if (expectedProductSlug && parsed.source.productSlug !== expectedProductSlug) {
    throw new Error(`productSlug inesperado: ${parsed.source.productSlug}`);
  }

  const quality = evaluateExtractionQuality(parsed.extraction);
  const summary = {
    file: path.basename(resolved),
    productSlug: parsed.source.productSlug,
    market: parsed.source.market,
    language: parsed.source.language,
    sourceSha256: parsed.source.contentSha256,
    byteLength: parsed.source.byteLength,
    pageCount: quality.pageCount,
    extractedCharacters: quality.extractedCharacters,
    totalSpans: quality.totalSpans,
    positionedSpans: quality.positionedSpans,
    positionedSpanRatio: quality.positionedSpanRatio,
    allPagesHaveText: quality.allPagesHaveText,
    layoutPreserved: quality.layoutPreserved,
    acceptedForEvidenceSegmentation: quality.acceptedForEvidenceSegmentation,
    structuredPages: quality.pages
      .filter(page => page.structuredContentLikely)
      .map(page => page.pageNumber),
    pages: quality.pages
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`iris_extraction_audit_failed=${error.message}\n`);
  process.exitCode = 1;
}
