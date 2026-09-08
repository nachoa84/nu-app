"use strict";

const path = require("node:path");
const { sha256Hex } = require("./source");

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 500;
const MAX_EXTRACTED_CHARS = 2_000_000;

class IrisPrototypePdfError extends Error {
  constructor(message, code = "IRIS_PROTOTYPE_PDF_INVALID") {
    super(message);
    this.name = "IrisPrototypePdfError";
    this.code = code;
  }
}

function validatePdfBytes(pdfBytes) {
  if (!Buffer.isBuffer(pdfBytes) || pdfBytes.length === 0) {
    throw new IrisPrototypePdfError("Se requiere un PDF en memoria.");
  }
  if (pdfBytes.length > MAX_PDF_BYTES) {
    throw new IrisPrototypePdfError("El PDF supera el tamaño máximo permitido.");
  }
  if (pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new IrisPrototypePdfError("El archivo no tiene una firma PDF válida.");
  }
  return pdfBytes;
}

function finiteNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizePageSpans(items) {
  if (!Array.isArray(items)) {
    throw new IrisPrototypePdfError(
      "No se pudo leer el contenido de una página.",
      "IRIS_PROTOTYPE_PDF_EXTRACTION_FAILED"
    );
  }

  const spans = [];

  for (let sourceIndex = 0; sourceIndex < items.length; sourceIndex += 1) {
    const item = items[sourceIndex];
    if (!item || typeof item !== "object" || typeof item.str !== "string") {
      continue;
    }

    const text = item.str.normalize("NFC");
    if (!text) continue;

    const transform = Array.isArray(item.transform) ? item.transform : [];

    spans.push(Object.freeze({
      sourceIndex,
      text,
      hasEOL: item.hasEOL === true,
      x: finiteNumberOrNull(transform[4]),
      y: finiteNumberOrNull(transform[5]),
      width: finiteNumberOrNull(item.width),
      height: finiteNumberOrNull(item.height),
      fontName: typeof item.fontName === "string" && item.fontName ? item.fontName : null
    }));
  }

  return Object.freeze(spans);
}

function textFromPageSpans(spans) {
  if (!Array.isArray(spans)) {
    throw new IrisPrototypePdfError(
      "Los fragmentos de página no tienen un formato válido.",
      "IRIS_PROTOTYPE_PDF_EXTRACTION_FAILED"
    );
  }

  const parts = [];
  for (const span of spans) {
    if (!span || typeof span.text !== "string" || !span.text) continue;
    parts.push(span.text);
    if (span.hasEOL === true) parts.push("\n");
    else parts.push(" ");
  }

  return parts
    .join("")
    .replace(/[^\S\n]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function normalizePageItems(items) {
  return textFromPageSpans(normalizePageSpans(items));
}

function layoutDiagnostics(spans) {
  const positioned = spans.filter(span => span.x !== null && span.y !== null).length;
  return Object.freeze({
    spanCount: spans.length,
    positionedSpanCount: positioned,
    positionedSpanRatio: spans.length === 0 ? 0 : positioned / spans.length
  });
}

function pdfJsAssetPath(directoryName) {
  const packageDirectory = path.dirname(require.resolve("pdfjs-dist/package.json"));
  return path.join(packageDirectory, directoryName, path.sep);
}

async function defaultLoadPdfJs() {
  const pdfJs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return {
    getDocument(options) {
      return pdfJs.getDocument({
        ...options,
        cMapUrl: pdfJsAssetPath("cmaps"),
        cMapPacked: true,
        standardFontDataUrl: pdfJsAssetPath("standard_fonts"),
        wasmUrl: pdfJsAssetPath("wasm")
      });
    }
  };
}

async function safeDestroy(resource) {
  if (!resource || typeof resource.destroy !== "function") return;
  try {
    await resource.destroy();
  } catch {
    // La limpieza no reemplaza el resultado ni expone detalles internos.
  }
}

function createPrototypePdfExtractor({ loadPdfJs = defaultLoadPdfJs } = {}) {
  if (typeof loadPdfJs !== "function") {
    throw new TypeError("loadPdfJs debe ser una función.");
  }

  return async function extractPrototypePdf(pdfBytes) {
    validatePdfBytes(pdfBytes);

    let loadingTask;
    let document;
    try {
      const pdfJs = await loadPdfJs();
      if (!pdfJs || typeof pdfJs.getDocument !== "function") {
        throw new IrisPrototypePdfError(
          "No se pudo inicializar PDF.js.",
          "IRIS_PROTOTYPE_PDF_EXTRACTION_FAILED"
        );
      }

      loadingTask = pdfJs.getDocument({
        data: Uint8Array.from(pdfBytes),
        isEvalSupported: false,
        stopAtErrors: true
      });
      if (!loadingTask || !loadingTask.promise) {
        throw new IrisPrototypePdfError(
          "No se pudo abrir el PDF.",
          "IRIS_PROTOTYPE_PDF_EXTRACTION_FAILED"
        );
      }

      document = await loadingTask.promise;
      if (
        !document ||
        !Number.isInteger(document.numPages) ||
        document.numPages < 1 ||
        document.numPages > MAX_PDF_PAGES ||
        typeof document.getPage !== "function"
      ) {
        throw new IrisPrototypePdfError("El PDF tiene una cantidad de páginas no permitida.");
      }

      const pages = [];
      let extractedCharacters = 0;

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        let page;
        try {
          page = await document.getPage(pageNumber);
          if (!page || typeof page.getTextContent !== "function") {
            throw new IrisPrototypePdfError(
              `No se pudo leer la página ${pageNumber}.`,
              "IRIS_PROTOTYPE_PDF_EXTRACTION_FAILED"
            );
          }

          const textContent = await page.getTextContent({
            includeMarkedContent: false,
            disableNormalization: false
          });
          const spans = normalizePageSpans(textContent?.items);
          const text = textFromPageSpans(spans);
          extractedCharacters += text.length;

          if (extractedCharacters > MAX_EXTRACTED_CHARS) {
            throw new IrisPrototypePdfError("El texto extraído supera el límite permitido.");
          }

          pages.push(Object.freeze({
            pageNumber,
            text,
            textSha256: sha256Hex(text),
            spansSha256: sha256Hex(JSON.stringify(spans)),
            layout: layoutDiagnostics(spans),
            spans
          }));
        } finally {
          if (page && typeof page.cleanup === "function") {
            try { page.cleanup(); } catch { /* no-op */ }
          }
        }
      }

      if (!pages.some(page => page.text)) {
        throw new IrisPrototypePdfError("El PDF no contiene texto extraíble.");
      }

      return Object.freeze({
        pageCount: document.numPages,
        extractedCharacters,
        pages: Object.freeze(pages)
      });
    } catch (error) {
      if (error instanceof IrisPrototypePdfError) throw error;
      throw new IrisPrototypePdfError(
        "No se pudo extraer el texto del PDF.",
        "IRIS_PROTOTYPE_PDF_EXTRACTION_FAILED"
      );
    } finally {
      await safeDestroy(document || loadingTask);
    }
  };
}

module.exports = {
  MAX_EXTRACTED_CHARS,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  IrisPrototypePdfError,
  createPrototypePdfExtractor,
  defaultLoadPdfJs,
  layoutDiagnostics,
  normalizePageItems,
  normalizePageSpans,
  textFromPageSpans,
  validatePdfBytes
};
