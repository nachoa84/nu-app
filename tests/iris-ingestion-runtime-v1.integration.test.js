"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createIrisIngestionRuntimeV1
} = require("../iris-ingestion-runtime-v1");

function createSyntheticTextPdfV1(text) {
  if (!/^[\x20-\x7e]+$/.test(text)) {
    throw new TypeError(
      "El texto sintético debe ser ASCII imprimible."
    );
  }

  const escapedText = text.replace(
    /([\\()])/g,
    "\\$1"
  );
  const stream = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    `(${escapedText}) Tj`,
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    [
      "<< /Type /Page /Parent 2 0 R",
      "/MediaBox [0 0 612 792]",
      "/Resources << /Font << /F1 4 0 R >> >>",
      "/Contents 5 0 R >>"
    ].join(" "),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += [
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    ""
  ].join("\n");

  return Buffer.from(pdf, "ascii");
}

test(
  "recorre el flujo completo con PDF.js y adaptadores simulados",
  async () => {
    const databaseCalls = [];
    const storageCalls = [];
    const client = {
      async query(text, values) {
        databaseCalls.push({ text, values });
        if (/INSERT INTO iris_documents/.test(text)) {
          return { rows: [{ id: 91 }] };
        }
        return { rows: [] };
      },
      release() {
        databaseCalls.push({ text: "RELEASE" });
      }
    };
    const pool = {
      async query(text, values) {
        databaseCalls.push({ text, values });
        return { rows: [] };
      },
      async connect() {
        databaseCalls.push({ text: "CONNECT" });
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
        storageCalls.push({
          operation: "delete",
          key
        });
        return { ok: true, value: null };
      }
    };
    const ids = ["integration-document", "integration-family"];
    const runtime = createIrisIngestionRuntimeV1({
      pool,
      storageClient,
      randomUUID: () => ids.shift()
    });
    const pdfBytes = createSyntheticTextPdfV1(
      "Guia Iris autorizada para integracion"
    );

    const result = await runtime.ingestPdf({
      file: {
        bytes: pdfBytes,
        mimeType: "application/pdf"
      },
      metadata: {
        title: "Guía sintética autorizada",
        sourceName: "Prueba interna",
        sourceReference: "synthetic-pdf-v1",
        rightsHolder: "Nu App",
        authorizationReference: "test-only",
        language: "es",
        country: "US",
        category: "marketing-product",
        productSlug: "collagen-plus",
        versionLabel: "test-v1"
      },
      actorKeyId: "nuapp-iris-test-v1"
    });

    assert.deepEqual(result, {
      documentKey: "doc_integration-document",
      documentFamilyKey: "family_integration-family",
      status: "pending",
      isActive: false,
      chunkCount: 1
    });
    assert.equal(storageCalls.length, 1);
    assert.equal(storageCalls[0].bytes, pdfBytes);

    const chunkInsert = databaseCalls.find(call =>
      /INSERT INTO iris_document_chunks/.test(call.text)
    );
    assert.ok(chunkInsert);
    assert.deepEqual(
      chunkInsert.values[3],
      ["Guia Iris autorizada para integracion"]
    );
    assert.ok(
      databaseCalls.some(call => call.text === "COMMIT")
    );
    assert.equal(
      databaseCalls.some(call => call.text === "ROLLBACK"),
      false
    );
  }
);
