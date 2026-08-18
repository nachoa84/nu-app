"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  createIrisPdfJsTextExtractorV1,
  pdfJsAssetPathV1
} = require("../iris-pdfjs-text-extractor-v1");

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
  "extrae texto de un PDF sintético con la dependencia fijada",
  async () => {
    const extract = createIrisPdfJsTextExtractorV1();
    const pdfBytes = createSyntheticTextPdfV1(
      "Guia Iris autorizada 2026"
    );

    const text = await extract(pdfBytes);

    assert.equal(
      text,
      "Guia Iris autorizada 2026"
    );
  }
);

test("resuelve recursos PDF.js desde el paquete fijado", () => {
  for (const directory of [
    "cmaps",
    "standard_fonts",
    "wasm"
  ]) {
    const assetPath = pdfJsAssetPathV1(directory);

    assert.equal(
      assetPath.endsWith(require("node:path").sep),
      true
    );
    assert.equal(
      fs.statSync(assetPath).isDirectory(),
      true
    );
  }
});

test("el PDF sintético es determinista y no contiene datos externos", () => {
  const first = createSyntheticTextPdfV1("Documento de prueba");
  const second = createSyntheticTextPdfV1("Documento de prueba");

  assert.deepEqual(first, second);
  assert.equal(
    first.subarray(0, 5).toString("ascii"),
    "%PDF-"
  );
  assert.ok(first.length < 1024);
});

module.exports = {
  createSyntheticTextPdfV1
};
