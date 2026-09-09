"use strict";

const { normalizeIrisSearchTextV1 } = require("../iris-document-chunker-v1");

const PRODUCT_ALIASES = Object.freeze({
  "collagen-plus": ["collagen+", "collagen plus", "beauty focus collagen+", "beauty focus collagen plus"],
  "ageloc-lumispa": ["lumispa", "ageloc lumispa"],
  "ageloc-wellspa-io": ["wellspa", "wellspa io", "ageloc wellspa io"],
  "ageloc-galvanic-spa": ["galvanic", "galvanic spa", "ageloc galvanic spa"]
});

const INTENT_RULES = Object.freeze([
  ["product.usage", ["como usar", "como se usa", "como tomar", "como se toma", "cuanto tomar", "dosis", "medida al dia"]],
  ["product.ingredients", ["ingrediente", "ingredientes", "contiene", "que tiene"]],
  ["product.precautions", ["advertencia", "advertencias", "precaucion", "precauciones", "embarazo", "lactancia", "ninos", "contraindicacion"]],
  ["product.describe", ["que es", "para que sirve", "beneficios", "que hace"]],
  ["product.compare", ["comparar", "diferencia", "versus", " vs "]],
  ["resource.find", ["donde encuentro", "donde esta", "recurso"]],
  ["procedure.guide", ["como hago", "pasos", "procedimiento"]],
  ["app.navigate", ["donde entro", "como llego", "menu", "navegar"]],
  ["business.explain", ["negocio", "brand affiliate", "representante de marca", "compensacion"]]
]);

function detectSubject(normalized) {
  for (const [subject, aliases] of Object.entries(PRODUCT_ALIASES)) {
    if (aliases.some(alias => normalized.includes(normalizeIrisSearchTextV1(alias)))) return subject;
  }
  return null;
}

function detectIntent(normalized) {
  for (const [intent, phrases] of INTENT_RULES) {
    if (phrases.some(phrase => normalized.includes(normalizeIrisSearchTextV1(phrase)))) return intent;
  }
  return null;
}

function routeQuestion(question, { market = "AR", language = "es" } = {}) {
  if (typeof question !== "string" || !question.trim()) throw new TypeError("question debe ser texto no vacío.");
  const normalized = normalizeIrisSearchTextV1(question);
  const subject = detectSubject(normalized);
  const intent = detectIntent(normalized);

  return Object.freeze({
    question: question.trim(),
    normalized,
    market,
    language,
    subject,
    intent,
    needsClarification: !subject || !intent
  });
}

module.exports = { INTENT_RULES, PRODUCT_ALIASES, routeQuestion };
