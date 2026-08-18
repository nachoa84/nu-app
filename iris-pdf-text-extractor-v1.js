"use strict";

const MAX_PDF_BYTES_V1 = 15 * 1024 * 1024;
const MAX_PDF_PAGES_V1 = 500;
const MAX_EXTRACTED_CHARS_V1 = 2_000_000;

class IrisPdfTextExtractorErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisPdfTextExtractorErrorV1";
  }
}

class IrisPdfTextExtractorOperationalErrorV1 extends Error {
  constructor() {
    super("No se pudo extraer el texto del PDF.");
    this.name = "IrisPdfTextExtractorOperationalErrorV1";
    this.code = "IRIS_PDF_EXTRACTION_FAILED";
  }
}

function validatePdfBytesV1(pdfBytes) {
  if (
    !Buffer.isBuffer(pdfBytes) ||
    pdfBytes.length === 0 ||
    pdfBytes.length > MAX_PDF_BYTES_V1
  ) {
    throw new IrisPdfTextExtractorErrorV1(
      "El PDF no tiene un tamaño válido."
    );
  }

  if (
    pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    throw new IrisPdfTextExtractorErrorV1(
      "El archivo no tiene una firma PDF válida."
    );
  }

  return pdfBytes;
}

function normalizePageItemsV1(items) {
  if (!Array.isArray(items)) {
    throw new IrisPdfTextExtractorOperationalErrorV1();
  }

  const parts = [];

  for (const item of items) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.str !== "string"
    ) {
      continue;
    }

    const value = item.str.normalize("NFC");
    if (value) {
      parts.push(value);
    }

    if (item.hasEOL === true) {
      parts.push("\n");
    } else if (value) {
      parts.push(" ");
    }
  }

  return parts
    .join("")
    .replace(/[^\S\n]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

async function safelyDestroyV1(resource) {
  if (!resource || typeof resource.destroy !== "function") {
    return;
  }

  try {
    await resource.destroy();
  } catch {
    // La limpieza no debe exponer detalles del PDF ni reemplazar el resultado.
  }
}

function createIrisPdfTextExtractorV1({
  getDocument
} = {}) {
  if (typeof getDocument !== "function") {
    throw new IrisPdfTextExtractorErrorV1(
      "Se requiere una implementación compatible con PDF.js."
    );
  }

  return async function extractPdfTextV1(pdfBytes) {
    const validatedBytes = validatePdfBytesV1(pdfBytes);
    let loadingTask;
    let document;

    try {
      loadingTask = getDocument({
        data: Uint8Array.from(validatedBytes),
        isEvalSupported: false,
        stopAtErrors: true
      });

      if (!loadingTask || !loadingTask.promise) {
        throw new IrisPdfTextExtractorOperationalErrorV1();
      }

      document = await loadingTask.promise;

      if (
        !document ||
        !Number.isInteger(document.numPages) ||
        document.numPages < 1 ||
        document.numPages > MAX_PDF_PAGES_V1 ||
        typeof document.getPage !== "function"
      ) {
        throw new IrisPdfTextExtractorErrorV1(
          "El PDF tiene una cantidad de páginas no permitida."
        );
      }

      const pages = [];
      let extractedCharacters = 0;

      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        let page;
        try {
          page = await document.getPage(pageNumber);
          if (
            !page ||
            typeof page.getTextContent !== "function"
          ) {
            throw new IrisPdfTextExtractorOperationalErrorV1();
          }

          const textContent = await page.getTextContent({
            includeMarkedContent: false,
            disableNormalization: false
          });
          const pageText = normalizePageItemsV1(
            textContent?.items
          );

          extractedCharacters += pageText.length;
          if (
            extractedCharacters > MAX_EXTRACTED_CHARS_V1
          ) {
            throw new IrisPdfTextExtractorErrorV1(
              "El texto extraído supera el límite permitido."
            );
          }

          if (pageText) {
            pages.push(pageText);
          }
        } finally {
          if (page && typeof page.cleanup === "function") {
            try {
              page.cleanup();
            } catch {
              // La limpieza de página no altera el resultado.
            }
          }
        }
      }

      const extractedText = pages.join("\n\n").trim();
      if (!extractedText) {
        throw new IrisPdfTextExtractorErrorV1(
          "El PDF no contiene texto extraíble."
        );
      }

      return extractedText;
    } catch (error) {
      if (
        error instanceof IrisPdfTextExtractorErrorV1 ||
        error instanceof IrisPdfTextExtractorOperationalErrorV1
      ) {
        throw error;
      }

      throw new IrisPdfTextExtractorOperationalErrorV1();
    } finally {
      await safelyDestroyV1(document || loadingTask);
    }
  };
}

module.exports = {
  MAX_EXTRACTED_CHARS_V1,
  MAX_PDF_BYTES_V1,
  MAX_PDF_PAGES_V1,
  IrisPdfTextExtractorErrorV1,
  IrisPdfTextExtractorOperationalErrorV1,
  createIrisPdfTextExtractorV1,
  normalizePageItemsV1,
  validatePdfBytesV1
};
