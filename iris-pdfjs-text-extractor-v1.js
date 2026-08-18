"use strict";

const {
  IrisPdfTextExtractorOperationalErrorV1,
  createIrisPdfTextExtractorV1
} = require("./iris-pdf-text-extractor-v1");

function defaultLoadPdfJsV1() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

function createIrisPdfJsTextExtractorV1({
  loadPdfJs = defaultLoadPdfJsV1
} = {}) {
  if (typeof loadPdfJs !== "function") {
    throw new TypeError(
      "Se requiere un cargador de PDF.js válido."
    );
  }

  let extractorPromise = null;

  async function loadExtractorV1() {
    if (!extractorPromise) {
      extractorPromise = Promise
        .resolve()
        .then(() => loadPdfJs())
        .then(pdfJs => {
          if (
            !pdfJs ||
            typeof pdfJs.getDocument !== "function"
          ) {
            throw new IrisPdfTextExtractorOperationalErrorV1();
          }

          return createIrisPdfTextExtractorV1({
            getDocument: pdfJs.getDocument
          });
        })
        .catch(() => {
          extractorPromise = null;
          throw new IrisPdfTextExtractorOperationalErrorV1();
        });
    }

    return extractorPromise;
  }

  return async function extractPdfTextWithPdfJsV1(
    pdfBytes
  ) {
    const extractor = await loadExtractorV1();
    return extractor(pdfBytes);
  };
}

module.exports = {
  createIrisPdfJsTextExtractorV1,
  defaultLoadPdfJsV1
};
