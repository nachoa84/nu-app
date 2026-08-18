"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  IrisPdfTextExtractorOperationalErrorV1,
  createIrisPdfTextExtractorV1
} = require("./iris-pdf-text-extractor-v1");

function pdfJsAssetUrlV1(directoryName) {
  const packageDirectory = path.dirname(
    require.resolve("pdfjs-dist/package.json")
  );

  return pathToFileURL(
    path.join(packageDirectory, directoryName, path.sep)
  ).href;
}

async function defaultLoadPdfJsV1() {
  const pdfJs = await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );

  return {
    getDocument(options) {
      return pdfJs.getDocument({
        ...options,
        cMapUrl: pdfJsAssetUrlV1("cmaps"),
        cMapPacked: true,
        standardFontDataUrl:
          pdfJsAssetUrlV1("standard_fonts"),
        wasmUrl: pdfJsAssetUrlV1("wasm")
      });
    }
  };
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
  defaultLoadPdfJsV1,
  pdfJsAssetUrlV1
};
