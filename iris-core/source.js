"use strict";

const crypto = require("node:crypto");

class IrisPrototypeSourceError extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisPrototypeSourceError";
  }
}

function requiredText(value, label, maxLength = 500) {
  if (typeof value !== "string") {
    throw new IrisPrototypeSourceError(`${label} debe ser una cadena.`);
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new IrisPrototypeSourceError(`${label} no tiene una longitud válida.`);
  }

  return normalized;
}

function optionalText(value, label, maxLength = 200) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return requiredText(value, label, maxLength);
}

function normalizeSourceMetadata(input = {}) {
  const language = requiredText(input.language, "language", 10);
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) {
    throw new IrisPrototypeSourceError("language no tiene un formato válido.");
  }

  const market = requiredText(input.market, "market", 6);
  if (!/^(GLOBAL|[A-Z]{2})$/.test(market)) {
    throw new IrisPrototypeSourceError("market no tiene un formato válido.");
  }

  const productSlug = requiredText(input.productSlug, "productSlug", 64);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(productSlug)) {
    throw new IrisPrototypeSourceError("productSlug no tiene un formato válido.");
  }

  return Object.freeze({
    title: requiredText(input.title, "title"),
    sourceName: requiredText(input.sourceName, "sourceName"),
    sourceReference: requiredText(input.sourceReference, "sourceReference", 1000),
    language,
    market,
    productSlug,
    versionLabel: optionalText(input.versionLabel, "versionLabel"),
    documentFamilyKey: optionalText(input.documentFamilyKey, "documentFamilyKey", 200)
  });
}

function sha256Hex(bufferOrText) {
  return crypto.createHash("sha256").update(bufferOrText).digest("hex");
}

function buildPrototypeSource({ pdfBytes, metadata } = {}) {
  if (!Buffer.isBuffer(pdfBytes) || pdfBytes.length === 0) {
    throw new IrisPrototypeSourceError("pdfBytes debe contener un PDF en memoria.");
  }

  if (pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new IrisPrototypeSourceError("El archivo no tiene una firma PDF válida.");
  }

  const normalizedMetadata = normalizeSourceMetadata(metadata);

  return Object.freeze({
    ...normalizedMetadata,
    contentSha256: sha256Hex(pdfBytes),
    byteLength: pdfBytes.length
  });
}

module.exports = {
  IrisPrototypeSourceError,
  buildPrototypeSource,
  normalizeSourceMetadata,
  sha256Hex
};
