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

test("reconstruye filas tabulares usando posición visual", () => {
  const text = normalizePageItemsV1([
    {
      str: "Proteínas",
      hasEOL: false,
      transform: [1, 0, 0, 1, 312, 563]
    },
    {
      str: "2500 mg",
      hasEOL: false,
      transform: [1, 0, 0, 1, 416, 548]
    },
    {
      str: "1%",
      hasEOL: false,
      transform: [1, 0, 0, 1, 499, 578]
    },
    {
      str: "Luteína",
      hasEOL: false,
      transform: [1, 0, 0, 1, 309, 537]
    },
    {
      str: "2 g",
      hasEOL: false,
      transform: [1, 0, 0, 1, 422, 564]
    },
    {
      str: "-",
      hasEOL: false,
      transform: [1, 0, 0, 1, 501, 550]
    },
    {
      str: "Valor energético",
      hasEOL: false,
      transform: [1, 0, 0, 1, 310, 578]
    },
    {
      str: "Colágeno",
      hasEOL: false,
      transform: [1, 0, 0, 1, 310, 549]
    },
    {
      str: "5 mg",
      hasEOL: false,
      transform: [1, 0, 0, 1, 421, 536]
    },
    {
      str: "11 kcal=46 KJ",
      hasEOL: false,
      transform: [1, 0, 0, 1, 409, 577]
    },
    {
      str: "4%",
      hasEOL: false,
      transform: [1, 0, 0, 1, 499, 565]
    },
    {
      str: "-",
      hasEOL: false,
      transform: [1, 0, 0, 1, 501, 535]
    }
  ]);

  assert.equal(
    text,
    [
      "Valor energético 11 kcal=46 KJ 1%",
      "Proteínas 2 g 4%",
      "Colágeno 2500 mg -",
      "Luteína 5 mg -"
    ].join("\n")
  );
});

test("no mezcla columnas normales al reconstruir una tabla lateral", () => {
  const text = normalizePageItemsV1([
    {
      str: "Texto izquierda línea 1",
      hasEOL: true,
      transform: [1, 0, 0, 1, 50, 650]
    },
    {
      str: "Texto izquierda línea 2",
      hasEOL: true,
      transform: [1, 0, 0, 1, 50, 635]
    },
    {
      str: "INFORMACIÓN NUTRICIONAL",
      hasEOL: true,
      transform: [1, 0, 0, 1, 310, 650]
    },
    {
      str: "Valor energético",
      hasEOL: false,
      transform: [1, 0, 0, 1, 310, 620]
    },
    {
      str: "11 kcal=46 KJ",
      hasEOL: false,
      transform: [1, 0, 0, 1, 410, 620]
    },
    {
      str: "1%",
      hasEOL: true,
      transform: [1, 0, 0, 1, 500, 620]
    },
    {
      str: "Proteínas",
      hasEOL: false,
      transform: [1, 0, 0, 1, 310, 605]
    },
    {
      str: "2 g",
      hasEOL: false,
      transform: [1, 0, 0, 1, 420, 605]
    },
    {
      str: "4%",
      hasEOL: true,
      transform: [1, 0, 0, 1, 500, 605]
    }
  ]);

  assert.equal(
    text,
    [
      "Texto izquierda línea 1",
      "Texto izquierda línea 2",
      "INFORMACIÓN NUTRICIONAL",
      "Valor energético 11 kcal=46 KJ 1%",
      "Proteínas 2 g 4%"
    ].join("\n")
  );
});

test("reordena una tabla descompuesta sin mezclar la columna vecina", () => {
  const text = normalizePageItemsV1([
    {
      str: "Texto de la columna izquierda",
      hasEOL: true,
      transform: [1, 0, 0, 1, 50, 579]
    },
    {
      str: "INFORMACIÓN NUTRICIONAL",
      hasEOL: true,
      transform: [1, 0, 0, 1, 309, 644]
    },
    {
      str: "Cantidad por porción",
      hasEOL: true,
      transform: [1, 0, 0, 1, 387, 600]
    },
    {
      str: "Proteína",
      hasEOL: false,
      transform: [1, 0, 0, 1, 312, 563]
    },
    {
      str: "s",
      hasEOL: false,
      transform: [1, 0, 0, 1, 337, 563]
    },
    {
      str: "%VD",
      hasEOL: true,
      transform: [1, 0, 0, 1, 494, 601]
    },
    {
      str: "Valor energético",
      hasEOL: false,
      transform: [1, 0, 0, 1, 310, 578]
    },
    {
      str: "2500 mg",
      hasEOL: false,
      transform: [1, 0, 0, 1, 416, 548]
    },
    {
      str: "1%",
      hasEOL: true,
      transform: [1, 0, 0, 1, 499, 578]
    },
    {
      str: "Luteína",
      hasEOL: false,
      transform: [1, 0, 0, 1, 309, 537]
    },
    {
      str: "2 g",
      hasEOL: false,
      transform: [1, 0, 0, 1, 422, 564]
    },
    {
      str: "-",
      hasEOL: true,
      transform: [1, 0, 0, 1, 501, 550]
    },
    {
      str: "Colágeno",
      hasEOL: false,
      transform: [1, 0, 0, 1, 310, 549]
    },
    {
      str: "5",
      hasEOL: false,
      transform: [1, 0, 0, 1, 421, 536]
    },
    {
      str: "mg",
      hasEOL: true,
      transform: [1, 0, 0, 1, 427, 536]
    },

    // PDF.js entrega estos valores después.
    {
      str: "11 kcal=46",
      hasEOL: false,
      transform: [1, 0, 0, 1, 409, 577]
    },
    {
      str: "KJ",
      hasEOL: false,
      transform: [1, 0, 0, 1, 441, 577]
    },
    {
      str: "4%",
      hasEOL: false,
      transform: [1, 0, 0, 1, 499, 565]
    },
    {
      str: "-",
      hasEOL: false,
      transform: [1, 0, 0, 1, 501, 535]
    }
  ]);

  assert.ok(
    text.includes("Texto de la columna izquierda")
  );

  assert.ok(
    text.includes("Valor energético 11 kcal=46 KJ 1%")
  );

  assert.ok(
    text.includes("Proteínas 2 g 4%")
  );

  assert.ok(
    text.includes("Colágeno 2500 mg -")
  );

  assert.ok(
    text.includes("Luteína 5 mg -")
  );

  assert.ok(
    !text.includes(
      "Texto de la columna izquierda Valor energético"
    )
  );
});
