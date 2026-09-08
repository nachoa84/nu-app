"use strict";

const { sha256Hex } = require("./source");
const { IrisEvidenceError } = require("./evidence");

const KNOWLEDGE_TYPES = Object.freeze([
  "fact",
  "procedure",
  "warning",
  "ingredient",
  "faq",
  "claim",
  "study",
  "resource",
  "navigation",
  "policy"
]);

const KNOWLEDGE_STATES = Object.freeze([
  "pending",
  "approved",
  "rejected",
  "retired"
]);

class IrisKnowledgeUnitError extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisKnowledgeUnitError";
  }
}

function requiredText(value, label, maxLength = 4000) {
  if (typeof value !== "string") {
    throw new IrisKnowledgeUnitError(`${label} debe ser una cadena.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new IrisKnowledgeUnitError(`${label} no tiene una longitud válida.`);
  }
  return normalized;
}

function optionalText(value, label, maxLength = 1000) {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, label, maxLength);
}

function evidenceMarketCompatible(evidenceMarket, knowledgeMarket) {
  return evidenceMarket === knowledgeMarket || evidenceMarket === "GLOBAL";
}

function normalizeEvidenceIds(evidence, { market, language }) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new IrisKnowledgeUnitError("La unidad debe tener al menos una evidencia.");
  }

  return Object.freeze(evidence.map(item => {
    if (!item || typeof item !== "object" || typeof item.evidenceId !== "string") {
      throw new IrisEvidenceError("La evidencia asociada no es válida.");
    }
    if (item.approvedForKnowledge !== true) {
      throw new IrisKnowledgeUnitError("No se puede construir conocimiento con evidencia no aprobada.");
    }
    if (item.reconstructionRequired === true) {
      throw new IrisKnowledgeUnitError("La evidencia requiere reconstrucción antes de aprobar conocimiento.");
    }
    if (!evidenceMarketCompatible(item.market, market)) {
      throw new IrisKnowledgeUnitError(
        `La evidencia de mercado ${item.market} no puede respaldar conocimiento ${market}.`
      );
    }
    if (item.language !== language) {
      throw new IrisKnowledgeUnitError(
        `La evidencia en ${item.language} no puede respaldar conocimiento en ${language}.`
      );
    }
    return item.evidenceId;
  }));
}

function createKnowledgeUnit(input = {}) {
  const type = requiredText(input.type, "type", 64);
  if (!KNOWLEDGE_TYPES.includes(type)) {
    throw new IrisKnowledgeUnitError(`type no permitido: ${type}`);
  }

  const state = input.state === undefined ? "pending" : requiredText(input.state, "state", 32);
  if (!KNOWLEDGE_STATES.includes(state)) {
    throw new IrisKnowledgeUnitError(`state no permitido: ${state}`);
  }

  const market = requiredText(input.market, "market", 6);
  if (!/^(GLOBAL|[A-Z]{2})$/.test(market)) {
    throw new IrisKnowledgeUnitError("market no tiene un formato válido.");
  }

  const language = requiredText(input.language, "language", 10);
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) {
    throw new IrisKnowledgeUnitError("language no tiene un formato válido.");
  }

  const subject = requiredText(input.subject, "subject", 200);
  const topic = requiredText(input.topic, "topic", 100);
  const content = requiredText(input.content, "content", 8000);
  const evidenceIds = normalizeEvidenceIds(input.evidence, { market, language });

  const canonical = {
    type,
    subject,
    topic,
    market,
    language,
    content,
    evidenceIds,
    versionLabel: optionalText(input.versionLabel, "versionLabel", 200)
  };

  return Object.freeze({
    knowledgeUnitId: `ku_${sha256Hex(JSON.stringify(canonical)).slice(0, 24)}`,
    ...canonical,
    state,
    sensitive: input.sensitive === true,
    answerable: state === "approved"
  });
}

module.exports = {
  KNOWLEDGE_STATES,
  KNOWLEDGE_TYPES,
  IrisKnowledgeUnitError,
  createKnowledgeUnit,
  evidenceMarketCompatible
};
