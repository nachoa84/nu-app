"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  IrisPrototypeSourceError,
  buildPrototypeSource,
  normalizeSourceMetadata,
  sha256Hex
} = require("../iris-core/source");

test("normalizeSourceMetadata conserva mercado, idioma, producto y versión", () => {
  const metadata = normalizeSourceMetadata({
    title: "Collagen+",
    sourceName: "Nu Skin",
    sourceReference: "assets/iris/fichas-tecnicas/collagen-plus.pdf",
    language: "es",
    market: "AR",
    productSlug: "collagen-plus",
    versionLabel: "2026",
    documentFamilyKey: "collagen-plus"
  });

  assert.equal(metadata.market, "AR");
  assert.equal(metadata.language, "es");
  assert.equal(metadata.productSlug, "collagen-plus");
  assert.equal(metadata.versionLabel, "2026");
});

test("buildPrototypeSource genera el mismo hash para el mismo PDF", () => {
  const bytes = Buffer.from("%PDF-1.7\nprototype");
  const input = {
    pdfBytes: bytes,
    metadata: {
      title: "Collagen+",
      sourceName: "Nu Skin",
      sourceReference: "local",
      language: "es",
      market: "AR",
      productSlug: "collagen-plus"
    }
  };

  const first = buildPrototypeSource(input);
  const second = buildPrototypeSource(input);

  assert.equal(first.contentSha256, second.contentSha256);
  assert.equal(first.contentSha256, sha256Hex(bytes));
  assert.equal(first.byteLength, bytes.length);
});

test("buildPrototypeSource rechaza archivos que no son PDF", () => {
  assert.throws(
    () => buildPrototypeSource({
      pdfBytes: Buffer.from("not-a-pdf"),
      metadata: {
        title: "X",
        sourceName: "Nu Skin",
        sourceReference: "local",
        language: "es",
        market: "AR",
        productSlug: "collagen-plus"
      }
    }),
    IrisPrototypeSourceError
  );
});

test("normalizeSourceMetadata rechaza mercados y slugs inválidos", () => {
  assert.throws(
    () => normalizeSourceMetadata({
      title: "X",
      sourceName: "Nu Skin",
      sourceReference: "local",
      language: "es",
      market: "argentina",
      productSlug: "Collagen Plus"
    }),
    IrisPrototypeSourceError
  );
});
