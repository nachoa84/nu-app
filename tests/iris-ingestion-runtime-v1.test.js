"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  IrisIngestionOperationalErrorV1
} = require("../iris-document-ingestion-service-v1");
const {
  createIrisIngestionRuntimeV1
} = require("../iris-ingestion-runtime-v1");

function pdfV1() {
  return Buffer.from("%PDF-1.7\ncontenido sintético");
}

function metadataV1(overrides = {}) {
  return {
    title: "Documento autorizado",
    sourceName: "Fuente autorizada",
    sourceReference: "ref-interna-1",
    rightsHolder: "Titular autorizado",
    authorizationReference: "aprobación-editorial-1",
    language: "es",
    country: "US",
    category: "marketing-product",
    productSlug: "collagen-plus",
    versionLabel: "2026-08",
    ...overrides
  };
}

function harnessV1(overrides = {}) {
  const databaseCalls = [];
  const storageCalls = [];
  const client = {
    async query(text, values) {
      databaseCalls.push({ scope: "client", text, values });
      if (/INSERT INTO iris_documents/.test(text)) {
        return { rows: [{ id: 77 }] };
      }
      return { rows: [] };
    },
    release() {
      databaseCalls.push({
        scope: "client",
        text: "RELEASE"
      });
    }
  };
  const pool = {
    async query(text, values) {
      databaseCalls.push({ scope: "pool", text, values });
      return { rows: [] };
    },
    async connect() {
      databaseCalls.push({
        scope: "pool",
        text: "CONNECT"
      });
      return client;
    }
  };
  const storageClient = {
    async uploadFromBytes(key, bytes) {
      storageCalls.push({
        operation: "upload",
        key,
        bytes
      });
      return { ok: true, value: null };
    },
    async delete(key) {
      storageCalls.push({ operation: "delete", key });
      return { ok: true, value: null };
    }
  };
  let pdfLoads = 0;
  const loadPdfJs = async () => {
    pdfLoads += 1;
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
                      str: "Texto autorizado para Iris.",
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
  };
  const ids = ["document-id", "family-id"];
  const runtime = createIrisIngestionRuntimeV1({
    pool,
    storageClient,
    loadPdfJs,
    randomUUID: () => ids.shift(),
    ...overrides
  });

  return {
    client,
    databaseCalls,
    getPdfLoads: () => pdfLoads,
    pool,
    runtime,
    storageCalls,
    storageClient
  };
}

function requestV1(overrides = {}) {
  return {
    file: {
      bytes: pdfV1(),
      mimeType: "application/pdf"
    },
    metadata: metadataV1(),
    actorKeyId: "nuapp-iris-admin-v1",
    ...overrides
  };
}

test("valida dependencias sin producir efectos externos", () => {
  let pdfLoaded = false;

  assert.throws(
    () => createIrisIngestionRuntimeV1({
      pool: null,
      storageClient: null,
      loadPdfJs: async () => {
        pdfLoaded = true;
      }
    })
  );

  assert.equal(pdfLoaded, false);
});

test("crear el runtime no abre conexiones ni carga PDF.js", () => {
  const h = harnessV1();

  assert.equal(h.databaseCalls.length, 0);
  assert.equal(h.storageCalls.length, 0);
  assert.equal(h.getPdfLoads(), 0);
  assert.deepEqual(
    Object.keys(h.runtime),
    ["ingestPdf"]
  );
});

test("compone extracción, almacenamiento y transacción en pendiente", async () => {
  const h = harnessV1();

  const result = await h.runtime.ingestPdf(requestV1());

  assert.deepEqual(result, {
    documentKey: "doc_document-id",
    documentFamilyKey: "family_family-id",
    status: "pending",
    isActive: false,
    chunkCount: 1
  });
  assert.equal(h.getPdfLoads(), 1);
  assert.equal(h.storageCalls.length, 1);
  assert.equal(h.storageCalls[0].operation, "upload");
  assert.match(
    h.storageCalls[0].key,
    /^iris\/documents\/v1\/family_family-id\/doc_document-id\/[a-f0-9]{64}\/original\.pdf$/
  );

  const sql = h.databaseCalls.map(call => call.text);
  assert.ok(sql.includes("BEGIN"));
  assert.ok(sql.includes("COMMIT"));
  assert.ok(sql.includes("RELEASE"));
  assert.ok(sql.some(text => /'pending'/.test(text)));
  assert.ok(sql.some(text => /FALSE/.test(text)));
  assert.ok(sql.some(text => /FROM UNNEST/.test(text)));
  assert.ok(sql.some(text => /'document_created'/.test(text)));
});

test("rechaza metadatos antes de cargar PDF.js o almacenar", async () => {
  const h = harnessV1();

  await assert.rejects(
    h.runtime.ingestPdf(requestV1({
      metadata: metadataV1({ country: "Argentina" })
    }))
  );

  assert.equal(h.getPdfLoads(), 0);
  assert.equal(h.storageCalls.length, 0);
  assert.equal(h.databaseCalls.length, 0);
});

test("un fallo transaccional elimina solamente el objeto recién subido", async () => {
  const h = harnessV1();
  h.client.query = async (text, values) => {
    h.databaseCalls.push({
      scope: "client",
      text,
      values
    });
    if (/INSERT INTO iris_documents/.test(text)) {
      return { rows: [{ id: 77 }] };
    }
    if (/INSERT INTO iris_document_chunks/.test(text)) {
      throw new Error("detalle privado");
    }
    return { rows: [] };
  };

  await assert.rejects(
    h.runtime.ingestPdf(requestV1()),
    IrisIngestionOperationalErrorV1
  );

  assert.ok(
    h.databaseCalls.some(call => call.text === "ROLLBACK")
  );
  assert.equal(h.storageCalls.length, 2);
  assert.equal(h.storageCalls[1].operation, "delete");
  assert.equal(
    h.storageCalls[1].key,
    h.storageCalls[0].key
  );
});
