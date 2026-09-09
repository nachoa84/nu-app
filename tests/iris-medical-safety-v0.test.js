"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createEvidence } = require("../iris-core/evidence");
const { createKnowledgeUnit, KNOWLEDGE_TYPES } = require("../iris-core/knowledge-unit");
const { assessMedicalSafety } = require("../iris-core/medical-safety");
const { resolveQuestion } = require("../iris-core/resolve-question");
const collagen = require("../iris-editorial/packages/collagen-plus-ar-v0");
const lumispa = require("../iris-editorial/packages/lumispa-ar-v0");

function combinedUnits() {
  return [...collagen.units, ...lumispa.units];
}

function combinedEvidence() {
  return [...Object.values(collagen.evidence), ...Object.values(lumispa.evidence)];
}

test("knowledge model supports testimonial as explicit type", () => {
  assert.ok(KNOWLEDGE_TYPES.includes("testimonial"));

  const evidence = createEvidence({
    sourceType: "community",
    sourceId: "testimonial-example",
    sourceTitle: "Testimonio de prueba",
    market: "AR",
    language: "es",
    locator: { section: "testimonio" },
    content: "Una persona relata una experiencia personal con un producto.",
    approvedForKnowledge: true
  });

  const unit = createKnowledgeUnit({
    type: "testimonial",
    subject: "collagen-plus",
    topic: "testimonial",
    market: "AR",
    language: "es",
    content: "Experiencia personal atribuida a una persona; no constituye una indicación médica.",
    evidence: [evidence],
    state: "approved",
    sensitive: true
  });

  assert.equal(unit.type, "testimonial");
  assert.equal(unit.answerable, true);
});

test("normal product question does not trigger medical safety", () => {
  const result = resolveQuestion({
    question: "¿Para qué sirve LumiSpa?",
    units: combinedUnits(),
    evidence: combinedEvidence(),
    market: "AR",
    language: "es"
  });

  assert.equal(result.response.status, "DIRECT");
  assert.equal(result.safety.applies, false);
  assert.equal(result.response.safetyApplied, undefined);
});

test("condition phrased with tengo triggers professional review", () => {
  const safety = assessMedicalSafety({
    question: "¿Puedo usar LumiSpa si tengo rosácea?",
    route: { subject: "ageloc-lumispa" }
  });

  assert.equal(safety.applies, true);
  assert.equal(safety.medicalContext, true);
  assert.match(safety.professionalGuidance, /ficha técnica/i);
  assert.match(safety.professionalGuidance, /dermatólogo|especialista/i);
});

test("serves-for pathology phrasing triggers professional review", () => {
  const safety = assessMedicalSafety({
    question: "¿Collagen+ sirve para artrosis?",
    route: { subject: "collagen-plus" }
  });

  assert.equal(safety.applies, true);
  assert.equal(safety.treatmentClaimContext, true);
});

test("testimonial never becomes medical indication", () => {
  const safety = assessMedicalSafety({
    question: "Tengo un testimonio de alguien a quien WellSpa le mejoró el linfedema, ¿sirve para eso?",
    route: { subject: "ageloc-wellspa-io" }
  });

  assert.equal(safety.applies, true);
  assert.equal(safety.testimonialContext, true);
  assert.match(safety.testimonialGuidance, /experiencias personales/i);
  assert.match(safety.testimonialGuidance, /no demuestran/i);
  assert.match(safety.professionalGuidance, /ficha técnica/i);
});

test("business questions do not receive product medical guidance", () => {
  const safety = assessMedicalSafety({
    question: "¿Cómo funciona el negocio?",
    route: { subject: "business" }
  });

  assert.equal(safety.applies, false);
});
