"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  IrisPrototypePdfError,
  createPrototypePdfExtractor,
  normalizePageItems,
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

test("extractor devuelve cada página por separado y en orden", async () => {
  const extractPdf = createPrototypePdfExtractor({
    loadPdfJs: async () => fakePdfJs([
      [{ str: "Página uno", hasEOL: false }],
      [{ str: "Página dos", hasEOL: false }]
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
  assert.equal(result.pages[2].text, "Tercera");
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
