"use strict";

const crypto = require("node:crypto");

const DEFAULT_MAX_CHARS_V1 = 2000;
const DEFAULT_OVERLAP_CHARS_V1 = 200;
const MIN_NATURAL_BOUNDARY_RATIO_V1 = 0.6;

class IrisDocumentChunkerErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisDocumentChunkerErrorV1";
  }
}

function assertPositiveIntegerV1(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new IrisDocumentChunkerErrorV1(
      `${label} debe ser un entero positivo.`
    );
  }
}

function normalizeIrisDocumentTextV1(input) {
  if (typeof input !== "string") {
    throw new IrisDocumentChunkerErrorV1(
      "El contenido documental debe ser una cadena."
    );
  }

  const normalized = input
    .replace(/\r\n?/g, "\n")
    .normalize("NFC");

  if (!normalized.trim()) {
    throw new IrisDocumentChunkerErrorV1(
      "El contenido documental está vacío."
    );
  }

  return normalized;
}

function normalizeIrisSearchTextV1(input) {
  if (typeof input !== "string") {
    throw new IrisDocumentChunkerErrorV1(
      "El texto de búsqueda debe ser una cadena."
    );
  }

  return input
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function sha256HexV1(input) {
  return crypto
    .createHash("sha256")
    .update(input, "utf8")
    .digest("hex");
}

function lastBoundaryIndexV1(text, start, hardEnd, minEnd) {
  const window = text.slice(minEnd, hardEnd);

  const paragraphIndex = window.lastIndexOf("\n\n");
  if (paragraphIndex >= 0) {
    return minEnd + paragraphIndex + 2;
  }

  const newlineIndex = window.lastIndexOf("\n");
  if (newlineIndex >= 0) {
    return minEnd + newlineIndex + 1;
  }

  const sentencePattern = /[.!?;:](?:["'»”)]*)\s+/gu;
  let sentenceEnd = -1;
  for (const match of window.matchAll(sentencePattern)) {
    sentenceEnd = minEnd + match.index + match[0].length;
  }
  if (sentenceEnd >= 0) {
    return sentenceEnd;
  }

  const whitespacePattern = /\s+/gu;
  let whitespaceEnd = -1;
  for (const match of window.matchAll(whitespacePattern)) {
    whitespaceEnd = minEnd + match.index + match[0].length;
  }

  return whitespaceEnd >= 0 ? whitespaceEnd : hardEnd;
}

function trimChunkRangeV1(text, start, end) {
  let trimmedStart = start;
  let trimmedEnd = end;

  while (
    trimmedStart < trimmedEnd &&
    /\s/u.test(text[trimmedStart])
  ) {
    trimmedStart += 1;
  }

  while (
    trimmedEnd > trimmedStart &&
    /\s/u.test(text[trimmedEnd - 1])
  ) {
    trimmedEnd -= 1;
  }

  return {
    start: trimmedStart,
    end: trimmedEnd
  };
}

function nextChunkStartV1(text, currentStart, end, overlapChars) {
  if (end >= text.length) {
    return text.length;
  }

  let candidate = Math.max(end - overlapChars, currentStart + 1);

  if (candidate > currentStart && candidate < end) {
    const prefix = text.slice(candidate, end);
    const firstWhitespace = prefix.search(/\s/u);

    if (firstWhitespace >= 0) {
      const adjusted = candidate + firstWhitespace + 1;
      if (adjusted < end) {
        candidate = adjusted;
      }
    }
  }

  while (candidate < text.length && /\s/u.test(text[candidate])) {
    candidate += 1;
  }

  return Math.max(candidate, currentStart + 1);
}

function chunkIrisDocumentV1(
  input,
  {
    maxChars = DEFAULT_MAX_CHARS_V1,
    overlapChars = DEFAULT_OVERLAP_CHARS_V1
  } = {}
) {
  assertPositiveIntegerV1(maxChars, "maxChars");

  if (!Number.isInteger(overlapChars) || overlapChars < 0) {
    throw new IrisDocumentChunkerErrorV1(
      "overlapChars debe ser un entero mayor o igual que cero."
    );
  }

  if (overlapChars >= maxChars) {
    throw new IrisDocumentChunkerErrorV1(
      "overlapChars debe ser menor que maxChars."
    );
  }

  const text = normalizeIrisDocumentTextV1(input);
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const hardEnd = Math.min(start + maxChars, text.length);
    const minEnd = Math.min(
      hardEnd,
      start + Math.ceil(maxChars * MIN_NATURAL_BOUNDARY_RATIO_V1)
    );

    const rawEnd = hardEnd < text.length
      ? lastBoundaryIndexV1(text, start, hardEnd, minEnd)
      : hardEnd;

    const range = trimChunkRangeV1(text, start, rawEnd);

    if (range.end <= range.start) {
      start = Math.max(rawEnd, start + 1);
      continue;
    }

    const content = text.slice(range.start, range.end);
    const searchTextNormalized = normalizeIrisSearchTextV1(content);

    if (!searchTextNormalized) {
      throw new IrisDocumentChunkerErrorV1(
        "Un fragmento no contiene texto recuperable."
      );
    }

    chunks.push({
      chunkIndex: chunks.length,
      heading: null,
      content,
      contentSha256: sha256HexV1(content),
      searchTextNormalized,
      characterStart: range.start,
      characterEnd: range.end
    });

    start = nextChunkStartV1(
      text,
      range.start,
      range.end,
      overlapChars
    );
  }

  if (!chunks.length) {
    throw new IrisDocumentChunkerErrorV1(
      "No se pudieron generar fragmentos recuperables."
    );
  }

  return {
    normalizedText: text,
    chunks
  };
}

module.exports = {
  DEFAULT_MAX_CHARS_V1,
  DEFAULT_OVERLAP_CHARS_V1,
  IrisDocumentChunkerErrorV1,
  chunkIrisDocumentV1,
  normalizeIrisDocumentTextV1,
  normalizeIrisSearchTextV1,
  sha256HexV1
};
