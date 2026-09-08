"use strict";

class IrisExtractionQualityError extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisExtractionQualityError";
  }
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasPosition(span) {
  return Boolean(
    span &&
    isFiniteNumber(span.x) &&
    isFiniteNumber(span.y) &&
    isFiniteNumber(span.width) &&
    isFiniteNumber(span.height)
  );
}

function looksLikeStructuredContent(page) {
  const text = typeof page?.text === "string" ? page.text : "";
  const spans = Array.isArray(page?.spans) ? page.spans : [];

  const numericShortSpans = spans.filter(span => {
    if (!span || typeof span.text !== "string") return false;
    const value = span.text.trim();
    return value.length > 0 && value.length <= 12 && /\d/u.test(value);
  }).length;

  const explicitStructureTerms = /(?:informaci[oó]n nutricional|cantidad por porci[oó]n|%vd|estudio[s]? cl[ií]nico[s]?|mejora porcentual|placebo)/iu.test(text);

  return explicitStructureTerms || numericShortSpans >= 6;
}

function evaluateExtractionQuality(extraction) {
  if (!extraction || typeof extraction !== "object") {
    throw new IrisExtractionQualityError("Se requiere una extracción válida.");
  }

  const pages = Array.isArray(extraction.pages) ? extraction.pages : null;
  if (!pages || pages.length === 0) {
    throw new IrisExtractionQualityError("La extracción no contiene páginas.");
  }

  if (extraction.pageCount !== pages.length) {
    throw new IrisExtractionQualityError("pageCount no coincide con las páginas extraídas.");
  }

  let totalSpans = 0;
  let positionedSpans = 0;
  let extractedCharacters = 0;
  const pageDiagnostics = [];

  for (const page of pages) {
    if (!Number.isInteger(page?.pageNumber) || page.pageNumber < 1) {
      throw new IrisExtractionQualityError("Una página no tiene pageNumber válido.");
    }

    const text = typeof page.text === "string" ? page.text : "";
    const spans = Array.isArray(page.spans) ? page.spans : [];
    const positioned = spans.filter(hasPosition).length;

    totalSpans += spans.length;
    positionedSpans += positioned;
    extractedCharacters += text.length;

    pageDiagnostics.push(Object.freeze({
      pageNumber: page.pageNumber,
      textCharacters: text.length,
      spanCount: spans.length,
      positionedSpanCount: positioned,
      positionedSpanRatio: spans.length ? positioned / spans.length : 1,
      structuredContentLikely: looksLikeStructuredContent(page),
      rawPlainTextSafeForEvidence: false
    }));
  }

  const positionedSpanRatio = totalSpans ? positionedSpans / totalSpans : 1;
  const allPagesHaveText = pages.every(page => typeof page.text === "string" && page.text.trim().length > 0);
  const layoutPreserved = positionedSpanRatio === 1;

  return Object.freeze({
    pageCount: pages.length,
    extractedCharacters,
    totalSpans,
    positionedSpans,
    positionedSpanRatio,
    allPagesHaveText,
    layoutPreserved,
    acceptedForEvidenceSegmentation: allPagesHaveText && layoutPreserved,
    rawPlainTextSafeForEvidence: false,
    policy: Object.freeze({
      plainTextRole: "diagnostic-and-search-aid-only",
      evidenceRole: "positioned-spans-or-reconstructed-blocks",
      structuredContentRequiresReconstruction: true
    }),
    pages: Object.freeze(pageDiagnostics)
  });
}

module.exports = {
  IrisExtractionQualityError,
  evaluateExtractionQuality,
  hasPosition,
  looksLikeStructuredContent
};
