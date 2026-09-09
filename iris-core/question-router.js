"use strict";

const { normalizeSearchText } = require("./normalize");

const PRODUCT_ALIASES = Object.freeze({
  "collagen-plus": ["collagen+", "collagen plus", "beauty focus collagen+", "beauty focus collagen plus"],
  "ageloc-lumispa": ["lumispa", "ageloc lumispa"],
  "ageloc-wellspa-io": ["wellspa", "wellspa io", "ageloc wellspa io"],
  "ageloc-galvanic-spa": ["galvanic", "galvanic spa", "ageloc galvanic spa"]
});

const DOMAIN_ALIASES = Object.freeze({
  business: ["negocio", "brand affiliate", "representante de marca", "compensacion", "plan de compensacion"],
  "office-virtual": ["oficina virtual", "office virtual"]
});

const SUBJECT_ALIASES = Object.freeze({
  ...PRODUCT_ALIASES,
  ...DOMAIN_ALIASES
});

const INTENT_RULES = Object.freeze([
  ["product.usage", ["como usar", "como uso", "como se usa", "como tomar", "como tomo", "como lo tomo", "como se toma", "cuanto tomar", "cuanto tengo que tomar", "dosis", "medida al dia"]],
  ["product.ingredients", ["ingrediente", "ingredientes", "contiene", "que tiene"]],
  ["product.precautions", ["advertencia", "advertencias", "precaucion", "precauciones", "embarazo", "embarazada", "lactancia", "ninos", "contraindicacion"]],
  ["business.explain", ["negocio", "brand affiliate", "representante de marca", "compensacion", "plan de compensacion"]],
  ["product.describe", ["que es", "para que sirve", "beneficios", "que hace"]],
  ["product.compare", ["comparar", "diferencia", "versus", " vs "]],
  ["resource.find", ["donde encuentro", "donde esta", "recurso"]],
  ["procedure.guide", ["como hago", "pasos", "procedimiento"]],
  ["app.navigate", ["donde entro", "como llego", "menu", "navegar"]]
]);

function detectSubject(normalized) {
  for (const [subject, aliases] of Object.entries(SUBJECT_ALIASES)) {
    if (aliases.some(alias => normalized.includes(normalizeSearchText(alias)))) return subject;
  }
  return null;
}

function detectIntent(normalized) {
  for (const [intent, phrases] of INTENT_RULES) {
    if (phrases.some(phrase => normalized.includes(normalizeSearchText(phrase)))) return intent;
  }
  return null;
}

function routeQuestion(question, { market = "AR", language = "es" } = {}) {
  if (typeof question !== "string" || !question.trim()) throw new TypeError("question debe ser texto no vacío.");
  const normalized = normalizeSearchText(question);
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

module.exports = {
  DOMAIN_ALIASES,
  INTENT_RULES,
  PRODUCT_ALIASES,
  SUBJECT_ALIASES,
  routeQuestion
};
