"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_MAX_CHARS_V1,
  DEFAULT_OVERLAP_CHARS_V1,
  IrisDocumentChunkerErrorV1,
  chunkIrisDocumentV1,
  normalizeIrisDocumentTextV1,
  normalizeIrisSearchTextV1,
  sha256HexV1
} = require("../iris-document-chunker-v1");

test("usa límites V1 de 2000 caracteres y 200 de solapamiento", () => {
  assert.equal(DEFAULT_MAX_CHARS_V1, 2000);
  assert.equal(DEFAULT_OVERLAP_CHARS_V1, 200);
});

test("normaliza saltos de línea y conserva el contenido Unicode", () => {
  assert.equal(
    normalizeIrisDocumentTextV1("Línea 1\r\nLínea 2\rLínea 3"),
    "Línea 1\nLínea 2\nLínea 3"
  );
});

test("normaliza búsqueda con NFKD, minúsculas y sin acentos", () => {
  assert.equal(
    normalizeIrisSearchTextV1("  COLLÁGEN+   y   LumiSpá  "),
    "collagen+ y lumispa"
  );
});

test("rechaza contenido vacío o de tipo incorrecto", () => {
  assert.throws(
    () => normalizeIrisDocumentTextV1("   \n\t"),
    IrisDocumentChunkerErrorV1
  );
  assert.throws(
    () => normalizeIrisDocumentTextV1(null),
    IrisDocumentChunkerErrorV1
  );
});

test("un documento corto produce un único fragmento trazable", () => {
  const source = "LumiSpa ayuda a seguir una rutina autorizada.";
  const result = chunkIrisDocumentV1(source);

  assert.equal(result.chunks.length, 1);
  assert.deepEqual(result.chunks[0], {
    chunkIndex: 0,
    heading: null,
    content: source,
    contentSha256: sha256HexV1(source),
    searchTextNormalized:
      "lumispa ayuda a seguir una rutina autorizada.",
    characterStart: 0,
    characterEnd: source.length
  });
});

test("cada fragmento respeta el máximo y sus posiciones", () => {
  const paragraph = (
    "Este es un párrafo autorizado sobre productos y rutinas. "
  ).repeat(30);
  const source = Array(8).fill(paragraph).join("\n\n");
  const result = chunkIrisDocumentV1(source);

  assert.ok(result.chunks.length > 1);

  for (const chunk of result.chunks) {
    assert.ok(chunk.content.length >= 1);
    assert.ok(chunk.content.length <= 2000);
    assert.equal(
      result.normalizedText.slice(
        chunk.characterStart,
        chunk.characterEnd
      ),
      chunk.content
    );
    assert.match(chunk.contentSha256, /^[0-9a-f]{64}$/);
    assert.ok(chunk.searchTextNormalized.length > 0);
  }
});

test("el solapamiento nunca supera 200 caracteres", () => {
  const source = (
    "Contenido documental autorizado con límites naturales. "
  ).repeat(150);
  const { chunks } = chunkIrisDocumentV1(source);

  for (let index = 1; index < chunks.length; index += 1) {
    const previous = chunks[index - 1];
    const current = chunks[index];
    const overlap = previous.characterEnd - current.characterStart;

    assert.ok(overlap >= 0);
    assert.ok(overlap <= 200);
    assert.ok(current.characterStart > previous.characterStart);
  }
});

test("prefiere límites de párrafo cuando están disponibles", () => {
  const first = "A".repeat(1200);
  const second = "B".repeat(1200);
  const { chunks } = chunkIrisDocumentV1(
    `${first}\n\n${second}`
  );

  assert.equal(chunks[0].content, first);
  assert.equal(chunks[0].characterEnd, first.length);
});

test("una unidad sin espacios progresa aunque deba cortar palabras", () => {
  const source = "x".repeat(5000);
  const { chunks } = chunkIrisDocumentV1(source);

  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every(chunk => chunk.content.length <= 2000));
  assert.equal(chunks.at(-1).characterEnd, source.length);
});

test("la fragmentación es determinista", () => {
  const source = (
    "Pharmanex y Collagen+ requieren fuentes verificables.\n\n"
  ).repeat(100);

  assert.deepEqual(
    chunkIrisDocumentV1(source),
    chunkIrisDocumentV1(source)
  );
});

test("rechaza opciones de tamaño inseguras", () => {
  for (const options of [
    { maxChars: 0 },
    { maxChars: 10.5 },
    { maxChars: 100, overlapChars: -1 },
    { maxChars: 100, overlapChars: 100 },
    { maxChars: 100, overlapChars: 101 }
  ]) {
    assert.throws(
      () => chunkIrisDocumentV1("contenido", options),
      IrisDocumentChunkerErrorV1
    );
  }
});

test("rechaza fragmentos sin texto recuperable", () => {
  assert.throws(
    () => chunkIrisDocumentV1("\u0301\u0301\u0301"),
    IrisDocumentChunkerErrorV1
  );
});
