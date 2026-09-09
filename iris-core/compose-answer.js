"use strict";

class IrisAnswerCompositionError extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAnswerCompositionError";
  }
}

function unique(values) {
  return [...new Set(values)];
}

function buildEvidenceIndex(evidence) {
  if (!Array.isArray(evidence)) {
    throw new IrisAnswerCompositionError("evidence debe ser un array.");
  }

  const index = new Map();
  for (const item of evidence) {
    if (!item || typeof item !== "object" || typeof item.evidenceId !== "string") continue;
    index.set(item.evidenceId, item);
  }
  return index;
}

function collectEvidence(matches, evidenceIndex) {
  const evidenceIds = unique(matches.flatMap(unit => Array.isArray(unit.evidenceIds) ? unit.evidenceIds : []));
  const resolved = evidenceIds.map(id => evidenceIndex.get(id)).filter(Boolean);

  if (resolved.length !== evidenceIds.length) {
    throw new IrisAnswerCompositionError("Falta evidencia requerida por una unidad de conocimiento.");
  }

  for (const item of resolved) {
    if (item.approvedForKnowledge !== true || item.reconstructionRequired === true) {
      throw new IrisAnswerCompositionError("La respuesta intentó usar evidencia no apta para conocimiento.");
    }
  }

  return Object.freeze(resolved);
}

function composeClarification(decision) {
  const prompts = {
    missing_subject_and_intent: "Necesito saber sobre qué producto o tema querés consultar y qué querés saber.",
    missing_subject: "¿Sobre qué producto o tema querés consultar?",
    missing_intent: "¿Qué querés saber exactamente sobre ese producto o tema?"
  };

  return Object.freeze({
    status: "CLARIFY",
    answer: prompts[decision.reason] || "Necesito una aclaración para poder responder con precisión.",
    knowledgeUnitIds: [],
    evidence: []
  });
}

function composeUnavailable() {
  return Object.freeze({
    status: "UNAVAILABLE",
    answer: "Todavía no tengo conocimiento aprobado suficiente para responder esa consulta.",
    knowledgeUnitIds: [],
    evidence: []
  });
}

function composeDirect(matches, evidenceIndex) {
  if (matches.length === 0) {
    throw new IrisAnswerCompositionError("DIRECT requiere al menos una unidad de conocimiento.");
  }

  const contents = unique(matches.map(unit => unit.content).filter(Boolean));
  const evidence = collectEvidence(matches, evidenceIndex);

  return Object.freeze({
    status: "DIRECT",
    answer: contents.join("\n\n"),
    knowledgeUnitIds: Object.freeze(matches.map(unit => unit.knowledgeUnitId)),
    evidence: Object.freeze(evidence.map(item => Object.freeze({
      evidenceId: item.evidenceId,
      sourceType: item.sourceType,
      sourceTitle: item.sourceTitle,
      sourceVersion: item.sourceVersion || null,
      market: item.market,
      language: item.language,
      locator: item.locator,
      content: item.content
    })))
  });
}

function composeAnswer({ decision, matches = [], evidence = [] } = {}) {
  if (!decision || typeof decision !== "object") {
    throw new IrisAnswerCompositionError("decision es requerido.");
  }
  if (!Array.isArray(matches)) {
    throw new IrisAnswerCompositionError("matches debe ser un array.");
  }

  if (decision.decision === "CLARIFY") return composeClarification(decision);
  if (decision.decision === "UNAVAILABLE") return composeUnavailable();
  if (decision.decision !== "DIRECT") {
    throw new IrisAnswerCompositionError(`decision no soportada: ${decision.decision}`);
  }

  const allowedIds = new Set(Array.isArray(decision.knowledgeUnitIds) ? decision.knowledgeUnitIds : []);
  const selectedMatches = matches.filter(unit => allowedIds.has(unit.knowledgeUnitId));
  if (selectedMatches.length !== allowedIds.size) {
    throw new IrisAnswerCompositionError("La política referencia conocimiento ausente o inconsistente.");
  }

  return composeDirect(selectedMatches, buildEvidenceIndex(evidence));
}

module.exports = {
  IrisAnswerCompositionError,
  buildEvidenceIndex,
  collectEvidence,
  composeAnswer
};
