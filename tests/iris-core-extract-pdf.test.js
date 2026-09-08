"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  IrisPrototypePdfError,
  createPrototypePdfExtractor,
  normalizePageItems,
  normalizePageSpans,
  validatePdfBytes
} = require("../iris-core/extract-pdf");

function fakePdfJs(pages) {
  return {
    getDocument(options) {
      assert.equal(options.isEvalSupported, false);
      assert.equal(options.stopAtErrors, true);

      return {
        promise: Promise.resolve({
          numPages: pages.length,
          async getPage(pageNumber) {
            const items = pages[pageNumber - 1];
            return {
              async getTextContent() {
                return { items };
              },
              cleanup() {}
            };
          },
          async destroy() {}
        })
      };
    }
  };
}

test("normalizePageItems conserva saltos de línea útiles", () => {
  const text = normalizePageItems([
    { str: "Hola", hasEOL: false },
    { str: "mundo", hasEOL: true },
    { str: "Segunda línea", hasEOL: false }
  ]);

  assert.equal(text, "Hola mundo\nSegunda línea");
});

test("normalizePageSpans conserva orden y coordenadas de evidencia", () => {
  const spans = normalizePageSpans([
    {
      str: "Título",
      hasEOL: true,
      transform: [1, 0, 0, 1, 42.5, 710.25],
      width: 120,
      height: 18,
      fontName: "Heading"
    },
    {
      str: "Texto",
      hasEOL: false,
      transform: [1, 0, 0, 1, 55, 680],
      width: 80,
      height: 11,
      fontName: "Body"
    }
  ]);

  assert.equal(spans.length, 2);
  assert.deepEqual(spans[0], {
    sourceIndex: 0,
    text: "Título",
    hasEOL: true,
    x: 42.5,
    y: 710.25,
    width: 120,
    height: 18,
    fontName: "Heading"
  });
  assert.equal(spans[1].sourceIndex, 1);
  assert.equal(spans[1].x, 55);
  assert.equal(spans[1].y, 680);
});

test("extractor devuelve cada página por separado y en orden", async () => {
  const extractPdf = createPrototypePdfExtractor({
    loadPdfJs: async () => fakePdfJs([
      [{ str: "Página uno", hasEOL: false, transform: [1, 0, 0, 1, 20, 700] }],
      [{ str: "Página dos", hasEOL: false, transform: [1, 0, 0, 1, 20, 700] }]
    ])
  });

  const result = await extractPdf(Buffer.from("%PDF-1.7\nfixture"));

  assert.equal(result.pageCount, 2);
  assert.equal(result.pages.length, 2);
  assert.deepEqual(
    result.pages.map(page => [page.pageNumber, page.text]),
    [[1, "Página uno"], [2, "Página dos"]]
  );
  assert.notEqual(result.pages[0].textSha256, result.pages[1].textSha256);
  assert.equal(result.pages[0].layout.positionedSpanRatio, 1);
  assert.equal(result.pages[0].spans[0].x, 20);
  assert.equal(result.pages[0].spans[0].y, 700);
  assert.equal(typeof result.pages[0].spansSha256, "string");
});

test("extractor conserva páginas vacías sin mezclar evidencia", async () => {
  const extractPdf = createPrototypePdfExtractor({
    loadPdfJs: async () => fakePdfJs([
      [{ str: "Primera", hasEOL: false }],
      [],
      [{ str: "Tercera", hasEOL: false }]
    ])
  });

  const result = await extractPdf(Buffer.from("%PDF-1.7\nfixture"));

  assert.equal(result.pageCount, 3);
  assert.equal(result.pages[1].pageNumber, 2);
  assert.equal(result.pages[1].text, "");
  assert.equal(result.pages[1].spans.length, 0);
  assert.equal(result.pages[2].text, "Tercera");
});

test("spans sin coordenadas siguen siendo utilizables y quedan diagnosticados", async () => {
  const extractPdf = createPrototypePdfExtractor({
    loadPdfJs: async () => fakePdfJs([
      [{ str: "Sin posición", hasEOL: false }]
    ])
  });

  const result = await extractPdf(Buffer.from("%PDF-1.7\nfixture"));

  assert.equal(result.pages[0].text, "Sin posición");
  assert.equal(result.pages[0].spans[0].x, null);
  assert.equal(result.pages[0].layout.positionedSpanRatio, 0);
});

test("validatePdfBytes rechaza entradas no PDF", () => {
  assert.throws(
    () => validatePdfBytes(Buffer.from("hello")),
    IrisPrototypePdfError
  );
});

test("extractor rechaza documentos sin texto extraíble", async () => {
  const extractPdf = createPrototypePdfExtractor({
    loadPdfJs: async () => fakePdfJs([[], []])
  });

  await assert.rejects(
    () => extractPdf(Buffer.from("%PDF-1.7\nfixture")),
    error => error instanceof IrisPrototypePdfError && /no contiene texto/i.test(error.message)
  );
});
