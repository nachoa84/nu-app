"use strict";

const INTENT_TO_TOPICS = Object.freeze({
  "product.describe": ["description", "benefits"],
  "product.ingredients": ["ingredients"],
  "product.usage": ["usage"],
  "product.precautions": ["precautions", "warnings"],
  "product.compare": ["comparison"],
  "business.explain": ["business"],
  "procedure.guide": ["procedure"],
  "resource.find": ["resource"],
  "app.navigate": ["navigation"]
});

function marketMatches(unitMarket, market) {
  return unitMarket === market || unitMarket === "GLOBAL";
}

function businessTopicMatches(unit, route) {
  if (route.subject === "business-commissions") {
    return route.intent === "procedure.guide" && unit.type === "procedure" && unit.topic.startsWith("receive.");
  }

  if (route.subject === "business-enrollment") {
    if (route.intent === "app.navigate") {
      return unit.type === "navigation" && unit.topic === "options";
    }
    if (route.intent === "business.explain") {
      return unit.type === "fact" && ["brand-affiliate", "client", "member", "letter-of-intent"].includes(unit.topic);
    }
  }

  return null;
}

function topicMatches(unit, route) {
  const businessMatch = businessTopicMatches(unit, route);
  if (businessMatch !== null) return businessMatch;

  const topics = INTENT_TO_TOPICS[route.intent] || [];
  return topics.length === 0 || topics.includes(unit.topic);
}

function searchKnowledge(units, route) {
  if (!Array.isArray(units)) throw new TypeError("units debe ser un array.");
  if (!route || typeof route !== "object") throw new TypeError("route es requerido.");

  return units.filter(unit => {
    if (!unit || unit.answerable !== true || unit.state !== "approved") return false;
    if (!marketMatches(unit.market, route.market)) return false;
    if (unit.language !== route.language) return false;
    if (route.subject && unit.subject !== route.subject) return false;
    return topicMatches(unit, route);
  });
}

module.exports = { INTENT_TO_TOPICS, marketMatches, searchKnowledge, topicMatches };
