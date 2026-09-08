#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { buildPrototypeSource } = require("../iris-core/source");
const { createPrototypePdfExtractor } = require("../iris-core/extract-pdf");

function usage() {
  return [
    "Uso:",
    "node scripts/iris-prototype-import.js <pdf> <productSlug> [market=AR] [language=es]",
    "",
    "Ejemplo:",
    "node scripts/iris-prototype-import.js assets/iris/fichas-tecnicas/collagen-plus.pdf collagen-plus AR es"
  ].join("\n");
}

async function main(argv = process.argv.slice(2)) {
  const [pdfPath, productSlug, market = "AR", language = "es"] = argv;
  if (!pdfPath || !productSlug) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
    return;
  }

  const resolvedPath = path.resolve(pdfPath);
  const pdfBytes = await fs.readFile(resolvedPath);
  const fileName = path.basename(resolvedPath);

  const source = buildPrototypeSource({
    pdfBytes,
    metadata: {
      title: fileName,
      sourceName: "Nu Skin official PDF candidate",
      sourceReference: pdfPath,
      language,
      market,
      productSlug,
      versionLabel: null,
      documentFamilyKey: productSlug
    }
  });

  const extractPdf = createPrototypePdfExtractor();
  const extraction = await extractPdf(pdfBytes);

  const output = {
    schemaVersion: "iris-prototype-source-v0",
    source,
    extraction
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch(error => {
  const code = typeof error?.code === "string" ? error.code : "IRIS_PROTOTYPE_IMPORT_FAILED";
  process.stderr.write(`iris_prototype_import_failed=${code}\n`);
  process.exitCode = 1;
});
