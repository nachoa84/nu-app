"use strict";

const { normalizeSearchText } = require("./normalize");

const TESTIMONIAL_SIGNALS = Object.freeze([
  "testimonio",
  "testimonios",
  "a alguien le",
  "una persona dijo",
  "mejoro con",
  "le mejoro",
  "me hizo bien",
  "le hizo bien",
  "le funciono",
  "me funciono"
]);

const MEDICAL_SIGNALS = Object.freeze([
  "patologia",
  "enfermedad",
  "diagnostico",
  "me diagnosticaron",
  "tengo ",
  "sufro de",
  "tratamiento medico",
  "medicacion",
  "medicamento",
  "embarazo",
  "embarazada",
  "lactancia",
  "dermatologo",
  "medico",
  "doctor",
  "especialista"
]);

const TREATMENT_CLAIM_SIGNALS = Object.freeze([
  "cura ",
  "curar ",
  "trata ",
  "tratar ",
  "sirve para ",
  "mejora la enfermedad",
  "mejora el diagnostico"
]);

function containsAny(normalized, signals) {
  return signals.some(signal => normalized.includes(normalizeSearchText(signal)));
}

function isProductSubject(subject) {
  return typeof subject === "string" && !["business", "office-virtual"].includes(subject);
}

function assessMedicalSafety({ question, route } = {}) {
  if (typeof question !== "string" || !question.trim()) {
    throw new TypeError("question debe ser texto no vacío.");
  }

  const normalized = normalizeSearchText(question);
  const testimonialContext = containsAny(normalized, TESTIMONIAL_SIGNALS);
  const medicalContext = containsAny(normalized, MEDICAL_SIGNALS);
  const treatmentClaimContext = containsAny(normalized, TREATMENT_CLAIM_SIGNALS);
  const appliesToProduct = isProductSubject(route?.subject);
  const requiresProfessionalReview = appliesToProduct && (medicalContext || treatmentClaimContext || testimonialContext);

  return Object.freeze({
    applies: requiresProfessionalReview,
    testimonialContext,
    medicalContext,
    treatmentClaimContext,
    requiresProfessionalReview,
    professionalGuidance: requiresProfessionalReview
      ? "La ficha técnica del producto debe ser la referencia principal. Si existe una patología, diagnóstico, medicación, embarazo/lactancia o una duda médica, llevá la ficha técnica a tu médico, dermatólogo o especialista para que evalúe si el producto es adecuado para tu situación."
      : null,
    testimonialGuidance: testimonialContext
      ? "Los testimonios describen experiencias personales y no demuestran que el producto diagnostique, trate, cure o prevenga una enfermedad ni garantizan el mismo resultado en otras personas."
      : null
  });
}

function applyMedicalSafety({ question, route, response } = {}) {
  if (!response || typeof response !== "object") {
    throw new TypeError("response es requerido.");
  }

  const safety = assessMedicalSafety({ question, route });
  if (!safety.applies) {
    return Object.freeze({ response, safety });
  }

  const additions = [safety.testimonialGuidance, safety.professionalGuidance].filter(Boolean);
  const baseAnswer = typeof response.answer === "string" ? response.answer.trim() : "";
  const answer = [baseAnswer, ...additions].filter(Boolean).join("\n\n");

  return Object.freeze({
    response: Object.freeze({
      ...response,
      answer,
      safetyApplied: true
    }),
    safety
  });
}

module.exports = {
  MEDICAL_SIGNALS,
  TESTIMONIAL_SIGNALS,
  TREATMENT_CLAIM_SIGNALS,
  applyMedicalSafety,
  assessMedicalSafety,
  isProductSubject
};
