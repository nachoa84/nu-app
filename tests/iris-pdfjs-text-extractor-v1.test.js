"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  IrisPdfTextExtractorOperationalErrorV1
} = require("../iris-pdf-text-extractor-v1");
const {
  createIrisPdfJsTextExtractorV1
} = require("../iris-pdfjs-text-extractor-v1");

function pdfV1() {
  return Buffer.from("%PDF-1.7\ncontenido");
}

function fakePdfJsV1(text = "Texto autorizado.") {
  return {
    getDocument() {
      return {
        promise: Promise.resolve({
          numPages: 1,
          async getPage() {
            return {
              async getTextContent() {
                return {
                  items: [{
                    str: text,
                    hasEOL: true
                  }]
                };
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

test("requiere un cargador válido", () => {
  assert.throws(
    () => createIrisPdfJsTextExtractorV1({
      loadPdfJs: null
    }),
    TypeError
  );
});

test("carga PDF.js de forma diferida", () => {
  let calls = 0;
  createIrisPdfJsTextExtractorV1({
    loadPdfJs: async () => {
      calls += 1;
      return fakePdfJsV1();
    }
  });

  assert.equal(calls, 0);
});

test("conecta getDocument con el extractor Iris", async () => {
  const extract = createIrisPdfJsTextExtractorV1({
    loadPdfJs: async () => fakePdfJsV1(
      "Guía Iris autorizada."
    )
  });

  assert.equal(
    await extract(pdfV1()),
    "Guía Iris autorizada."
  );
});

test("reutiliza una única carga concurrente de PDF.js", async () => {
  let calls = 0;
  const extract = createIrisPdfJsTextExtractorV1({
    loadPdfJs: async () => {
      calls += 1;
      await Promise.resolve();
      return fakePdfJsV1();
    }
  });

  const results = await Promise.all([
    extract(pdfV1()),
    extract(pdfV1()),
    extract(pdfV1())
  ]);

  assert.deepEqual(results, [
    "Texto autorizado.",
    "Texto autorizado.",
    "Texto autorizado."
  ]);
  assert.equal(calls, 1);
});

test("sanea módulos inválidos sin exponer detalles", async () => {
  for (const loadPdfJs of [
    async () => null,
    async () => ({ getDocument: "no-función" }),
    async () => {
      throw new Error("ruta privada de node_modules");
    }
  ]) {
    const extract = createIrisPdfJsTextExtractorV1({
      loadPdfJs
    });

    await assert.rejects(
      extract(pdfV1()),
      error => {
        assert.ok(
          error instanceof IrisPdfTextExtractorOperationalErrorV1
        );
        assert.equal(
          error.code,
          "IRIS_PDF_EXTRACTION_FAILED"
        );
        assert.ok(!error.message.includes("node_modules"));
        assert.ok(!Object.hasOwn(error, "cause"));
        return true;
      }
    );
  }
});

test("permite reintentar después de una carga fallida", async () => {
  let calls = 0;
  const extract = createIrisPdfJsTextExtractorV1({
    loadPdfJs: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("fallo transitorio");
      }
      return fakePdfJsV1();
    }
  });

  await assert.rejects(
    extract(pdfV1()),
    IrisPdfTextExtractorOperationalErrorV1
  );
  assert.equal(
    await extract(pdfV1()),
    "Texto autorizado."
  );
  assert.equal(calls, 2);
});
