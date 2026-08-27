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

function positionedTextItemV1(item, index) {
  if (
    !item ||
    typeof item !== "object" ||
    typeof item.str !== "string"
  ) {
    return null;
  }

  const value = item.str.normalize("NFC");
  const transform = item.transform;

  const hasPosition =
    Array.isArray(transform) &&
    transform.length >= 6 &&
    Number.isFinite(transform[4]) &&
    Number.isFinite(transform[5]);

  return {
    item,
    index,
    value,
    hasPosition,
    x: hasPosition ? transform[4] : null,
    y: hasPosition ? transform[5] : null
  };
}

function normalizeTableLineV1(tokens) {
  const text = tokens
    .sort((a, b) => a.x - b.x)
    .map(token => token.value.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\bProteína s\b/gu, "Proteínas");

  return text;
}

function groupTableRowsV1(tokens, tolerance = 3) {
  const ordered = [...tokens].sort((a, b) => {
    if (Math.abs(a.y - b.y) > tolerance) {
      return b.y - a.y;
    }
    return a.x - b.x;
  });

  const rows = [];

  for (const token of ordered) {
    let row = rows.find(
      candidate =>
        Math.abs(candidate.y - token.y) <= tolerance
    );

    if (!row) {
      row = {
        y: token.y,
        tokens: []
      };
      rows.push(row);
    }

    row.tokens.push(token);

    row.y =
      row.tokens.reduce((sum, item) => sum + item.y, 0) /
      row.tokens.length;
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map(row => ({
      ...row,
      text: normalizeTableLineV1(row.tokens)
    }))
    .filter(row => row.text);
}

function nutritionTableBlockV1(tokens) {
  const header = tokens.find(
    token =>
      token &&
      token.hasPosition &&
      /INFORMACIÓN NUTRICIONAL/iu.test(token.value)
  );

  if (!header) {
    return null;
  }

  const terminator = tokens.find(
    token =>
      token &&
      token.hasPosition &&
      token.x >= header.x - 10 &&
      token.y < header.y &&
      /^INGREDIENTES\b/iu.test(token.value.trim())
  );

  const minimumY = terminator
    ? terminator.y + 4
    : header.y - 180;

  const region = tokens.filter(
    token =>
      token &&
      token.hasPosition &&
      token.value.trim() &&
      token.x >= header.x - 10 &&
      token.y <= header.y + 3 &&
      token.y >= minimumY
  );

  if (region.length < 4) {
    return null;
  }

  return {
    firstIndex: Math.min(...region.map(token => token.index)),
    indices: new Set(region.map(token => token.index)),
    text: groupTableRowsV1(region)
      .map(row => row.text)
      .join("\n")
  };
}

function standaloneTableBlockV1(tokens) {
  const usable = tokens.filter(
    token => token && token.value.trim()
  );

  if (
    usable.length < 6 ||
    usable.some(token => !token.hasPosition)
  ) {
    return null;
  }

  const xs = usable.map(token => token.x);
  const xSpan = Math.max(...xs) - Math.min(...xs);

  if (xSpan > 250) {
    return null;
  }

  const rows = groupTableRowsV1(usable);

  if (
    rows.length < 3 ||
    rows.filter(row => row.tokens.length >= 2).length < 3
  ) {
    return null;
  }

  return {
    firstIndex: Math.min(...usable.map(token => token.index)),
    indices: new Set(usable.map(token => token.index)),
    text: rows.map(row => row.text).join("\n")
  };
}

function normalizePageItemsV1(items) {
  if (!Array.isArray(items)) {
    throw new IrisPdfTextExtractorOperationalErrorV1();
  }

  const tokens = items.map(positionedTextItemV1);

  const tableBlock =
    nutritionTableBlockV1(tokens) ||
    standaloneTableBlockV1(tokens);

  const parts = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (
      tableBlock &&
      index === tableBlock.firstIndex
    ) {
      parts.push(tableBlock.text, "\n");
    }

    if (
      tableBlock &&
      tableBlock.indices.has(index)
    ) {
      continue;
    }

    const token = tokens[index];

    if (!token) {
      continue;
    }

    if (token.value) {
      parts.push(token.value);
    }

    if (token.item.hasEOL === true) {
      parts.push("\n");
    } else if (token.value) {
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
