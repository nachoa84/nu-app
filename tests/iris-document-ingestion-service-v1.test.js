"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MAX_PDF_BYTES_V1,
  IrisIngestionErrorV1,
  IrisIngestionOperationalErrorV1,
  createIrisDocumentIngestionServiceV1
} = require("../iris-document-ingestion-service-v1");

function pdfV1(body = "contenido") {
  return Buffer.from(`%PDF-1.7\n${body}`);
}

function metadataV1(overrides = {}) {
  return {
    title: "Guía autorizada",
    sourceName: "Fuente autorizada",
    sourceReference: "ref-2026-08",
    rightsHolder: "Titular",
    authorizationReference: "aprobación-editorial-1",
    language: "es",
    country: "AR",
    category: "uso-producto",
    productSlug: "lumispa",
    versionLabel: "2026-08",
    ...overrides
  };
}

function chunkedV1() {
  return {
    normalizedText: "Texto autorizado.",
    chunks: [{
      chunkIndex: 0,
      heading: null,
      content: "Texto autorizado.",
      contentSha256: "a".repeat(64),
      searchTextNormalized: "texto autorizado.",
      characterStart: 0,
      characterEnd: 18
    }]
  };
}

function harnessV1(overrides = {}) {
  const calls = [];
  const storageCalls = [];
  const client = {
    async query(text, values) {
      calls.push({ scope: "client", text, values });
      if (/INSERT INTO iris_documents/.test(text)) {
        return { rows: [{ id: 41 }] };
      }
      return { rows: [] };
    },
    release() {
      calls.push({ scope: "client", text: "RELEASE" });
    }
  };
  const pool = {
    async query(text, values) {
      calls.push({ scope: "pool", text, values });
      return { rows: [] };
    },
    async connect() {
      calls.push({ scope: "pool", text: "CONNECT" });
      return client;
    }
  };
  const objectStorage = {
    async putObject(value) {
      storageCalls.push({ operation: "put", ...value });
    },
    async deleteObject(value) {
      storageCalls.push({ operation: "delete", ...value });
    }
  };
  const ids = ["document-id", "family-id"];
  const dependencies = {
    pool,
    objectStorage,
    extractPdfText: async () => "Texto autorizado.",
    chunkDocument: chunkedV1,
    randomUUID: () => ids.shift(),
    ...overrides
  };
  return {
    calls,
    storageCalls,
    pool,
    client,
    objectStorage,
    service: createIrisDocumentIngestionServiceV1(dependencies)
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

test("requiere dependencias internas válidas", () => {
  assert.throws(
    () => createIrisDocumentIngestionServiceV1({}),
    IrisIngestionErrorV1
  );
});

test("rechaza archivos que no son PDF antes de cualquier efecto", async () => {
  const h = harnessV1();
  for (const file of [
    null,
    { bytes: Buffer.alloc(0), mimeType: "application/pdf" },
    { bytes: Buffer.from("no-pdf"), mimeType: "application/pdf" },
    { bytes: pdfV1(), mimeType: "text/plain" },
    {
      bytes: Buffer.concat([
        Buffer.from("%PDF-"),
        Buffer.alloc(MAX_PDF_BYTES_V1)
      ]),
      mimeType: "application/pdf"
    }
  ]) {
    await assert.rejects(
      h.service.ingestPdf(requestV1({ file })),
      IrisIngestionErrorV1
    );
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.storageCalls.length, 0);
});

test("rechaza metadatos inseguros y fechas invertidas", async () => {
  const h = harnessV1();
  for (const metadata of [
    metadataV1({ language: "ES" }),
    metadataV1({ country: "Argentina" }),
    metadataV1({ category: "../privado" }),
    metadataV1({ productSlug: "NO VÁLIDO" }),
    metadataV1({ documentFamilyKey: "../escape" }),
    metadataV1({
      effectiveFrom: "2026-09-01",
      effectiveUntil: "2026-08-01"
    })
  ]) {
    await assert.rejects(
      h.service.ingestPdf(requestV1({ metadata })),
      IrisIngestionErrorV1
    );
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.storageCalls.length, 0);
});

test("un duplicado no se extrae, sube ni inserta", async () => {
  let extracted = false;
  const h = harnessV1({
    extractPdfText: async () => {
      extracted = true;
      return "texto";
    }
  });
  h.pool.query = async () => ({ rows: [{ document_key: "doc-previo" }] });

  await assert.rejects(
    h.service.ingestPdf(requestV1()),
    /ya fue incorporado/
  );
  assert.equal(extracted, false);
  assert.equal(h.storageCalls.length, 0);
});

test("ingesta en pendiente dentro de una transacción y por lote", async () => {
  const h = harnessV1();
  const result = await h.service.ingestPdf(requestV1());

  assert.deepEqual(result, {
    documentKey: "doc_document-id",
    documentFamilyKey: "family_family-id",
    status: "pending",
    isActive: false,
    chunkCount: 1
  });
  assert.equal(h.storageCalls.length, 1);
  assert.equal(h.storageCalls[0].operation, "put");
  assert.match(
    h.storageCalls[0].key,
    /^iris\/documents\/v1\/family_family-id\/doc_document-id\/[a-f0-9]{64}\/original\.pdf$/
  );
  assert.equal(h.storageCalls[0].contentType, "application/pdf");
  assert.equal(h.storageCalls[0].bytes, requestV1().file.bytes);

  const sql = h.calls.map(item => item.text);
  assert.ok(sql.includes("BEGIN"));
  assert.ok(sql.includes("COMMIT"));
  assert.ok(sql.includes("RELEASE"));
  assert.ok(sql.some(text => /authorization_status/.test(text)));
  assert.ok(sql.some(text => /'pending'/.test(text)));
  assert.ok(sql.some(text => /FALSE/.test(text)));
  assert.ok(sql.some(text => /FROM UNNEST/.test(text)));
  assert.ok(sql.some(text => /'document_created'/.test(text)));
  assert.ok(!Object.hasOwn(result, "objectKey"));
  assert.ok(!Object.hasOwn(result, "contentSha256"));
});

test("respeta una familia editorial válida sin incorporarla como SQL", async () => {
  const h = harnessV1();
  const maliciousTitle = "Guía'); DROP TABLE users; --";
  const result = await h.service.ingestPdf(requestV1({
    metadata: metadataV1({
      title: maliciousTitle,
      documentFamilyKey: "familia_lumispa_v1"
    })
  }));

  assert.equal(result.documentFamilyKey, "familia_lumispa_v1");
  assert.match(h.storageCalls[0].key, /\/familia_lumispa_v1\//);
  assert.ok(!h.calls.some(item => item.text.includes(maliciousTitle)));
  assert.ok(h.calls.some(item => item.values?.includes(maliciousTitle)));
});

test("si falla PostgreSQL revierte y elimina solamente el objeto subido", async () => {
  const dbError = Object.assign(new Error("contenido sensible"), {
    code: "40001",
    constraint: "safe_constraint"
  });
  const logs = [];
  const h = harnessV1({ logError: entry => logs.push(entry) });
  h.client.query = async (text, values) => {
    h.calls.push({ scope: "client", text, values });
    if (/INSERT INTO iris_document_chunks/.test(text)) {
      throw dbError;
    }
    if (/INSERT INTO iris_documents/.test(text)) {
      return { rows: [{ id: 41 }] };
    }
    return { rows: [] };
  };

  await assert.rejects(
    h.service.ingestPdf(requestV1()),
    IrisIngestionOperationalErrorV1
  );

  assert.ok(h.calls.some(item => item.text === "ROLLBACK"));
  assert.ok(!h.calls.some(item => item.text === "COMMIT"));
  assert.equal(h.storageCalls[1].operation, "delete");
  assert.equal(h.storageCalls[1].key, h.storageCalls[0].key);
  assert.deepEqual(logs, [{
    operation: "ingest_pdf_v1",
    errorCode: "40001",
    constraint: "safe_constraint",
    retryable: true
  }]);
  assert.ok(!JSON.stringify(logs).includes("sensible"));
});

test("un fallo al subir no intenta borrar un objeto inexistente", async () => {
  const h = harnessV1({
    objectStorage: {
      async putObject() {
        throw new Error("ruta privada");
      },
      async deleteObject() {
        throw new Error("no debe ejecutarse");
      }
    }
  });

  await assert.rejects(
    h.service.ingestPdf(requestV1()),
    IrisIngestionOperationalErrorV1
  );
  assert.equal(h.calls.filter(item => item.text === "CONNECT").length, 0);
});

test("sanea fallos al comprobar duplicados", async () => {
  const logs = [];
  const h = harnessV1({ logError: entry => logs.push(entry) });
  h.pool.query = async () => {
    throw Object.assign(new Error("consulta privada"), { code: "08006" });
  };

  await assert.rejects(
    h.service.ingestPdf(requestV1()),
    IrisIngestionOperationalErrorV1
  );
  assert.deepEqual(logs, [{
    operation: "check_duplicate_pdf_v1",
    errorCode: "08006",
    constraint: "",
    retryable: true
  }]);
  assert.equal(h.storageCalls.length, 0);
});

test("fallos del extractor y del fragmentador no producen efectos", async () => {
  for (const overrides of [
    { extractPdfText: async () => { throw new Error("PDF privado"); } },
    { chunkDocument: () => { throw new Error("texto privado"); } }
  ]) {
    const h = harnessV1(overrides);
    await assert.rejects(
      h.service.ingestPdf(requestV1()),
      IrisIngestionOperationalErrorV1
    );
    assert.equal(h.storageCalls.length, 0);
    assert.equal(h.calls.filter(item => item.text === "CONNECT").length, 0);
  }
});

test("un logger defectuoso no reemplaza el error saneado", async () => {
  const h = harnessV1({
    extractPdfText: async () => { throw new Error("privado"); },
    logError: () => { throw new Error("logger roto"); }
  });

  await assert.rejects(
    h.service.ingestPdf(requestV1()),
    IrisIngestionOperationalErrorV1
  );
});

test("una clave aleatoria insegura nunca llega a Object Storage", async () => {
  const h = harnessV1({ randomUUID: () => "../escape" });

  await assert.rejects(
    h.service.ingestPdf(requestV1()),
    IrisIngestionOperationalErrorV1
  );
  assert.equal(h.storageCalls.length, 0);
});
