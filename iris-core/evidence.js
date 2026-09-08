"use strict";

const { sha256Hex } = require("./source");

const EVIDENCE_SOURCE_TYPES = Object.freeze([
  "pdf",
  "web",
  "office_virtual",
  "manual",
  "structured",
  "community"
]);

class IrisEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisEvidenceError";
  }
}

function requiredText(value, label, maxLength = 4000) {
  if (typeof value !== "string") {
    throw new IrisEvidenceError(`${label} debe ser una cadena.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new IrisEvidenceError(`${label} no tiene una longitud válida.`);
  }
  return normalized;
}

function optionalText(value, label, maxLength = 1000) {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, label, maxLength);
}

function normalizeLocator(locator = {}) {
  const out = {};

  if (locator.pageNumber !== undefined && locator.pageNumber !== null) {
    if (!Number.isInteger(locator.pageNumber) || locator.pageNumber < 1) {
      throw new IrisEvidenceError("pageNumber debe ser un entero positivo.");
    }
    out.pageNumber = locator.pageNumber;
  }

  if (locator.section !== undefined && locator.section !== null && locator.section !== "") {
    out.section = requiredText(locator.section, "section", 500);
  }

  if (locator.path !== undefined && locator.path !== null && locator.path !== "") {
    out.path = requiredText(locator.path, "path", 1000);
  }

  if (locator.url !== undefined && locator.url !== null && locator.url !== "") {
    out.url = requiredText(locator.url, "url", 2000);
  }

  if (locator.spanIndexes !== undefined) {
    if (!Array.isArray(locator.spanIndexes) || locator.spanIndexes.some(value => !Number.isInteger(value) || value < 0)) {
      throw new IrisEvidenceError("spanIndexes debe ser una lista de enteros no negativos.");
    }
    out.spanIndexes = Object.freeze([...locator.spanIndexes]);
  }

  return Object.freeze(out);
}

function createEvidence(input = {}) {
  const sourceType = requiredText(input.sourceType, "sourceType", 64);
  if (!EVIDENCE_SOURCE_TYPES.includes(sourceType)) {
    throw new IrisEvidenceError(`sourceType no permitido: ${sourceType}`);
  }

  const content = requiredText(input.content, "content", 12000);
  const sourceId = requiredText(input.sourceId, "sourceId", 500);
  const market = requiredText(input.market, "market", 6);
  if (!/^(GLOBAL|[A-Z]{2})$/.test(market)) {
    throw new IrisEvidenceError("market no tiene un formato válido.");
  }

  const language = requiredText(input.language, "language", 10);
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) {
    throw new IrisEvidenceError("language no tiene un formato válido.");
  }

  const locator = normalizeLocator(input.locator);
  const evidenceKeyPayload = JSON.stringify({
    sourceType,
    sourceId,
    market,
    language,
    locator,
    content
  });

  return Object.freeze({
    evidenceId: `ev_${sha256Hex(evidenceKeyPayload).slice(0, 24)}`,
    sourceType,
    sourceId,
    sourceTitle: optionalText(input.sourceTitle, "sourceTitle", 500),
    sourceVersion: optionalText(input.sourceVersion, "sourceVersion", 200),
    market,
    language,
    locator,
    content,
    contentSha256: sha256Hex(content),
    reconstructionRequired: input.reconstructionRequired === true,
    approvedForKnowledge: input.approvedForKnowledge === true
  });
}

module.exports = {
  EVIDENCE_SOURCE_TYPES,
  IrisEvidenceError,
  createEvidence,
  normalizeLocator
};
