"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MAX_EXTRACTED_CHARS_V1,
  MAX_PDF_BYTES_V1,
  MAX_PDF_PAGES_V1,
  IrisPdfTextExtractorErrorV1,
  IrisPdfTextExtractorOperationalErrorV1,
  createIrisPdfTextExtractorV1,
  normalizePageItemsV1
} = require("../iris-pdf-text-extractor-v1");

function pdfV1(body = "contenido") {
  return Buffer.from(`%PDF-1.7\n${body}`);
}

function fakePdfJsV1({
  pages = [[
    { str: "Texto", hasEOL: false },
    { str: "autorizado.", hasEOL: true }
  ]],
  getPageError = null,
  textError = null,
  destroyError = null
} = {}) {
  const calls = [];
  const pageCleanups = [];
  const document = {
    numPages: pages.length,
    async getPage(pageNumber) {
      calls.push({ operation: "getPage", pageNumber });
      if (getPageError) throw getPageError;
      return {
        async getTextContent(options) {
          calls.push({
            operation: "getTextContent",
            pageNumber,
            options
          });
          if (textError) throw textError;
          return { items: pages[pageNumber - 1] };
        },
        cleanup() {
          pageCleanups.push(pageNumber);
        }
      };
    },
    async destroy() {
      calls.push({ operation: "destroy" });
      if (destroyError) throw destroyError;
    }
  };

  function getDocument(options) {
    calls.push({ operation: "getDocument", options });
    return { promise: Promise.resolve(document) };
  }

  return {
    calls,
    pageCleanups,
    document,
    getDocument
  };
}

test("requiere una implementación compatible con PDF.js", () => {
  assert.throws(
    () => createIrisPdfTextExtractorV1({}),
    IrisPdfTextExtractorErrorV1
  );
});

test("rechaza entradas que no sean PDF antes de invocar PDF.js", async () => {
  let invoked = false;
  const extract = createIrisPdfTextExtractorV1({
    getDocument() {
      invoked = true;
    }
  });

  for (const bytes of [
    null,
    Buffer.alloc(0),
    Buffer.from("no-pdf"),
    Buffer.concat([
      Buffer.from("%PDF-"),
      Buffer.alloc(MAX_PDF_BYTES_V1)
    ])
  ]) {
    await assert.rejects(
      extract(bytes),
      IrisPdfTextExtractorErrorV1
    );
  }

  assert.equal(invoked, false);
});

test("configura PDF.js sin evaluación dinámica y copia los bytes", async () => {
  const fake = fakePdfJsV1();
  const extract = createIrisPdfTextExtractorV1({
    getDocument: fake.getDocument
  });
  const bytes = pdfV1();

  await extract(bytes);

  const options = fake.calls[0].options;
  assert.ok(options.data instanceof Uint8Array);
  assert.notEqual(options.data, bytes);
  assert.deepEqual(Buffer.from(options.data), bytes);
  assert.equal(options.isEvalSupported, false);
  assert.equal(options.stopAtErrors, true);
});

test("extrae páginas en orden, normaliza Unicode y conserva saltos", async () => {
  const fake = fakePdfJsV1({
    pages: [
      [
        { str: "Gui\u0301a", hasEOL: false },
        { str: " autorizada", hasEOL: true },
        { str: "Línea 2", hasEOL: false }
      ],
      [
        { str: "Página", hasEOL: false },
        { str: "dos", hasEOL: true }
      ]
    ]
  });
  const extract = createIrisPdfTextExtractorV1({
    getDocument: fake.getDocument
  });

  const text = await extract(pdfV1());

  assert.equal(
    text,
    "Guía autorizada\nLínea 2\n\nPágina dos"
  );
  assert.deepEqual(fake.pageCleanups, [1, 2]);
  assert.deepEqual(
    fake.calls
      .filter(call => call.operation === "getPage")
      .map(call => call.pageNumber),
    [1, 2]
  );
});

test("normaliza elementos sin incorporar campos ajenos", () => {
  const text = normalizePageItemsV1([
    { str: "Uno", hasEOL: false, privateValue: "secreto" },
    { str: "", hasEOL: true },
    { str: "Dos", hasEOL: false },
    null,
    { str: 3, hasEOL: true }
  ]);

  assert.equal(text, "Uno\nDos");
  assert.ok(!text.includes("secreto"));
});

test("rechaza PDFs sin texto extraíble", async () => {
  const fake = fakePdfJsV1({
    pages: [[
      { str: "", hasEOL: false },
      { str: "   ", hasEOL: true }
    ]]
  });
  const extract = createIrisPdfTextExtractorV1({
    getDocument: fake.getDocument
  });

  await assert.rejects(
    extract(pdfV1()),
    /no contiene texto extraíble/
  );
  assert.deepEqual(fake.pageCleanups, [1]);
});

test("limita páginas antes de leer contenido", async () => {
  const fake = fakePdfJsV1();
  fake.document.numPages = MAX_PDF_PAGES_V1 + 1;
  const extract = createIrisPdfTextExtractorV1({
    getDocument: fake.getDocument
  });

  await assert.rejects(
    extract(pdfV1()),
    IrisPdfTextExtractorErrorV1
  );
  assert.equal(
    fake.calls.some(call => call.operation === "getPage"),
    false
  );
});

test("limita el volumen total de texto extraído", async () => {
  const fake = fakePdfJsV1({
    pages: [[{
      str: "x".repeat(MAX_EXTRACTED_CHARS_V1 + 1),
      hasEOL: false
    }]]
  });
  const extract = createIrisPdfTextExtractorV1({
    getDocument: fake.getDocument
  });

  await assert.rejects(
    extract(pdfV1()),
    /supera el límite/
  );
  assert.deepEqual(fake.pageCleanups, [1]);
});

test("sanea errores internos sin exponer contenido o contraseña", async () => {
  for (const options of [
    { getPageError: new Error("contenido privado") },
    { textError: new Error("password=secreto") }
  ]) {
    const fake = fakePdfJsV1(options);
    const extract = createIrisPdfTextExtractorV1({
      getDocument: fake.getDocument
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
        assert.ok(!error.message.includes("privado"));
        assert.ok(!error.message.includes("secreto"));
        assert.ok(!Object.hasOwn(error, "cause"));
        return true;
      }
    );
  }
});

test("si falla la carga destruye la tarea y mantiene el error saneado", async () => {
  let destroyed = false;
  const extract = createIrisPdfTextExtractorV1({
    getDocument() {
      return {
        promise: Promise.reject(
          new Error("ruta y contenido privados")
        ),
        async destroy() {
          destroyed = true;
        }
      };
    }
  });

  await assert.rejects(
    extract(pdfV1()),
    IrisPdfTextExtractorOperationalErrorV1
  );
  assert.equal(destroyed, true);
});

test("un fallo de limpieza no reemplaza una extracción correcta", async () => {
  const fake = fakePdfJsV1({
    destroyError: new Error("detalle privado")
  });
  const extract = createIrisPdfTextExtractorV1({
    getDocument: fake.getDocument
  });

  assert.equal(
    await extract(pdfV1()),
    "Texto autorizado."
  );
});
