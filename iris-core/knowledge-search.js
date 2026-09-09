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

function includesAny(text, phrases) {
  return phrases.some(phrase => text.includes(phrase));
}

function businessTopicMatches(unit, route) {
  const q = route.normalized || "";

  if (route.subject === "business-commissions") {
    if (route.intent !== "procedure.guide" || unit.type !== "procedure") return false;

    if (includesAny(q, ["factura", "facturacion"])) {
      return unit.topic === "receive.invoice-step";
    }

    if (includesAny(q, ["que necesito", "requisito", "acuerdo", "informacion bancaria"])) {
      return unit.topic === "receive.requirements";
    }

    return unit.topic.startsWith("receive.");
  }

  if (route.subject === "business-enrollment") {
    if (route.intent === "app.navigate") {
      return unit.type === "navigation" && unit.topic === "options";
    }

    if (route.intent !== "business.explain" || unit.type !== "fact") return false;

    const asksDifference = includesAny(q, ["diferencia", "comparar", "versus", " vs "]);
    if (asksDifference) {
      return ["brand-affiliate", "client", "member"].includes(unit.topic);
    }

    if (includesAny(q, ["carta de intencion"])) return unit.topic === "letter-of-intent";
    if (includesAny(q, ["cuenta de miembro", "miembro"])) return unit.topic === "member";
    if (includesAny(q, ["afiliado de marca", "brand affiliate"])) return unit.topic === "brand-affiliate";
    if (includesAny(q, ["cliente"])) return unit.topic === "client";

    return ["brand-affiliate", "client", "member", "letter-of-intent"].includes(unit.topic);
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
