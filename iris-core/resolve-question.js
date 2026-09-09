"use strict";

const { routeQuestion } = require("./question-router");
const { searchKnowledge } = require("./knowledge-search");
const { decideAnswer } = require("./answer-policy");
const { composeAnswer } = require("./compose-answer");
const { applyMedicalSafety } = require("./medical-safety");

function resolveQuestion({ question, market = "AR", language = "es", units = [], evidence = [] } = {}) {
  const route = routeQuestion(question, { market, language });
  const matches = searchKnowledge(units, route);
  const decision = decideAnswer(route, matches);
  const composed = composeAnswer({ decision, matches, evidence });
  const { response, safety } = applyMedicalSafety({ question, route, response: composed });

  return Object.freeze({
    route,
    decision,
    response,
    safety
  });
}

module.exports = { resolveQuestion };
