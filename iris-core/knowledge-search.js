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

function searchKnowledge(units, route) {
  if (!Array.isArray(units)) throw new TypeError("units debe ser un array.");
  if (!route || typeof route !== "object") throw new TypeError("route es requerido.");
  const topics = INTENT_TO_TOPICS[route.intent] || [];

  return units.filter(unit => {
    if (!unit || unit.answerable !== true || unit.state !== "approved") return false;
    if (!marketMatches(unit.market, route.market)) return false;
    if (unit.language !== route.language) return false;
    if (route.subject && unit.subject !== route.subject) return false;
    return topics.length === 0 || topics.includes(unit.topic);
  });
}

module.exports = { INTENT_TO_TOPICS, marketMatches, searchKnowledge };
