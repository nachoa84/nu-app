"use strict";

const { routeQuestion } = require("./question-router");
const { searchKnowledge } = require("./knowledge-search");
const { decideAnswer } = require("./answer-policy");
const { composeAnswer } = require("./compose-answer");

function resolveQuestion({ question, market = "AR", language = "es", units = [], evidence = [] } = {}) {
  const route = routeQuestion(question, { market, language });
  const matches = searchKnowledge(units, route);
  const decision = decideAnswer(route, matches);
  const response = composeAnswer({ decision, matches, evidence });

  return Object.freeze({
    route,
    decision,
    response
  });
}

module.exports = { resolveQuestion };
