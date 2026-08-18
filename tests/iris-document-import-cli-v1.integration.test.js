"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  runIrisDocumentImportCliV1
} = require("../iris-document-import-cli-v1");

function createSyntheticTextPdfV1(text) {
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
  "dry-run recorre el flujo real sin persistencia ni datos en salida",
  async () => {
    const pdfBytes = createSyntheticTextPdfV1(
      "Contenido sintetico autorizado para Iris"
    );
    const metadata = {
      title: "Título privado de prueba",
      sourceName: "Fuente privada",
      sourceReference: "ref-privada",
      rightsHolder: "Titular privado",
      authorizationReference: "autorización-privada",
      language: "es",
      country: "US",
      category: "marketing-product",
      productSlug: "collagen-plus",
      versionLabel: "test-v1"
    };
    const outputs = [];
    let commitRuntimeCalled = false;

    const summary = await runIrisDocumentImportCliV1({
      argv: [
        "--pdf",
        "/tmp/document.pdf",
        "--metadata",
        "/tmp/document.json"
      ],
      env: {
        NODE_ENV: "production",
        REPLIT_DEPLOYMENT: "1"
      },
      async readFile(filePath) {
        return filePath.endsWith(".pdf")
          ? pdfBytes
          : Buffer.from(JSON.stringify(metadata));
      },
      writeOutput: value => outputs.push(value),
      async createCommitRuntime() {
        commitRuntimeCalled = true;
        throw new Error("no debe ejecutarse");
      }
    });

    assert.deepEqual(summary, {
      mode: "dry-run",
      fileBytes: pdfBytes.length,
      chunkCount: 1,
      status: "pending",
      isActive: false,
      persisted: false
    });
    assert.equal(commitRuntimeCalled, false);
    assert.equal(outputs.length, 1);
    assert.equal(
      outputs[0],
      [
        "mode=dry-run",
        `file_bytes=${pdfBytes.length}`,
        "chunk_count=1",
        "status=pending",
        "is_active=false",
        "persisted=false"
      ].join("\n")
    );

    const serializedOutput = outputs.join("\n");
    for (const privateValue of [
      metadata.title,
      metadata.sourceName,
      metadata.sourceReference,
      metadata.rightsHolder,
      metadata.authorizationReference,
      "Contenido sintetico autorizado para Iris"
    ]) {
      assert.ok(
        !serializedOutput.includes(privateValue)
      );
    }
  }
);
