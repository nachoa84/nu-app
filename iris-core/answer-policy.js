"use strict";

function decideAnswer(route, matches) {
  if (!route || typeof route !== "object") throw new TypeError("route es requerido.");
  if (!Array.isArray(matches)) throw new TypeError("matches debe ser un array.");

  if (route.needsClarification) {
    return Object.freeze({
      decision: "CLARIFY",
      reason: !route.subject && !route.intent
        ? "missing_subject_and_intent"
        : !route.subject
          ? "missing_subject"
          : "missing_intent",
      knowledgeUnitIds: []
    });
  }

  if (matches.length === 0) {
    return Object.freeze({
      decision: "UNAVAILABLE",
      reason: "no_approved_knowledge",
      knowledgeUnitIds: []
    });
  }

  return Object.freeze({
    decision: "DIRECT",
    reason: "approved_knowledge_found",
    knowledgeUnitIds: matches.map(unit => unit.knowledgeUnitId)
  });
}

module.exports = { decideAnswer };
