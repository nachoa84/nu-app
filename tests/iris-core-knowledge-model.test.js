"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createEvidence } = require("../iris-core/evidence");
const {
  IrisKnowledgeUnitError,
  createKnowledgeUnit
} = require("../iris-core/knowledge-unit");

function approvedPdfEvidence(overrides = {}) {
  return createEvidence({
    sourceType: "pdf",
    sourceId: "collagen-plus-a5ae5ce9",
    sourceTitle: "Beauty Focus Collagen+",
    sourceVersion: "4/27/21",
    market: "AR",
    language: "es",
    locator: {
      pageNumber: 3,
      section: "¿CÓMO USARLO?",
      spanIndexes: [16, 18, 20]
    },
    content: "Disfruta de una medida de Collagen+ al día.",
    reconstructionRequired: false,
    approvedForKnowledge: true,
    ...overrides
  });
}

test("evidencia PDF conserva localizador sin acoplar conocimiento al parser", () => {
  const evidence = approvedPdfEvidence();
  assert.equal(evidence.sourceType, "pdf");
  assert.equal(evidence.locator.pageNumber, 3);
  assert.equal(evidence.approvedForKnowledge, true);
  assert.match(evidence.evidenceId, /^ev_/);
});

test("evidencia Office Virtual usa el mismo contrato", () => {
  const evidence = createEvidence({
    sourceType: "office_virtual",
    sourceId: "ov-ar-clientes-registro-v1",
    sourceTitle: "Oficina Virtual Argentina",
    sourceVersion: "2026-09",
    market: "AR",
    language: "es",
    locator: {
      path: "Clientes > Registrar cliente"
    },
    content: "Abrir la sección Clientes y seleccionar Registrar cliente.",
    reconstructionRequired: false,
    approvedForKnowledge: true
  });

  assert.equal(evidence.sourceType, "office_virtual");
  assert.equal(evidence.locator.path, "Clientes > Registrar cliente");
});

test("unidad de conocimiento puede construirse desde evidencia PDF aprobada", () => {
  const evidence = approvedPdfEvidence();
  const unit = createKnowledgeUnit({
    type: "procedure",
    subject: "collagen-plus",
    topic: "usage",
    market: "AR",
    language: "es",
    content: "Tomar una medida de Collagen+ una vez al día.",
    evidence: [evidence],
    state: "approved",
    versionLabel: "candidate-2021"
  });

  assert.equal(unit.type, "procedure");
  assert.equal(unit.answerable, true);
  assert.deepEqual(unit.evidenceIds, [evidence.evidenceId]);
});

test("unidad de conocimiento puede construirse desde Oficina Virtual con el mismo modelo", () => {
  const evidence = createEvidence({
    sourceType: "office_virtual",
    sourceId: "ov-ar-clientes-registro-v1",
    sourceTitle: "Oficina Virtual Argentina",
    market: "AR",
    language: "es",
    locator: { path: "Clientes > Registrar cliente" },
    content: "Abrir la sección Clientes y seleccionar Registrar cliente.",
    approvedForKnowledge: true
  });

  const unit = createKnowledgeUnit({
    type: "navigation",
    subject: "office-virtual",
    topic: "client-registration",
    market: "AR",
    language: "es",
    content: "Para iniciar el registro de un cliente, abrir Clientes y seleccionar Registrar cliente.",
    evidence: [evidence],
    state: "approved"
  });

  assert.equal(unit.type, "navigation");
  assert.equal(unit.answerable, true);
});

test("bloquea evidencia pendiente de reconstrucción", () => {
  const evidence = approvedPdfEvidence({ reconstructionRequired: true });

  assert.throws(
    () => createKnowledgeUnit({
      type: "fact",
      subject: "collagen-plus",
      topic: "nutrition",
      market: "AR",
      language: "es",
      content: "Contenido nutricional.",
      evidence: [evidence],
      state: "approved"
    }),
    IrisKnowledgeUnitError
  );
});

test("bloquea evidencia no aprobada", () => {
  const evidence = approvedPdfEvidence({ approvedForKnowledge: false });

  assert.throws(
    () => createKnowledgeUnit({
      type: "fact",
      subject: "collagen-plus",
      topic: "usage",
      market: "AR",
      language: "es",
      content: "Uso de producto.",
      evidence: [evidence],
      state: "approved"
    }),
    IrisKnowledgeUnitError
  );
});

test("bloquea evidencia de otro mercado", () => {
  const evidence = approvedPdfEvidence({ market: "MX" });

  assert.throws(
    () => createKnowledgeUnit({
      type: "fact",
      subject: "collagen-plus",
      topic: "usage",
      market: "AR",
      language: "es",
      content: "Una medida al día.",
      evidence: [evidence],
      state: "approved"
    }),
    IrisKnowledgeUnitError
  );
});

test("permite evidencia GLOBAL para conocimiento de mercado", () => {
  const evidence = approvedPdfEvidence({ market: "GLOBAL" });
  const unit = createKnowledgeUnit({
    type: "fact",
    subject: "collagen-plus",
    topic: "usage",
    market: "AR",
    language: "es",
    content: "Una medida al día.",
    evidence: [evidence],
    state: "approved"
  });

  assert.equal(unit.answerable, true);
});

test("bloquea evidencia de otro idioma", () => {
  const evidence = approvedPdfEvidence({ language: "en" });

  assert.throws(
    () => createKnowledgeUnit({
      type: "fact",
      subject: "collagen-plus",
      topic: "usage",
      market: "AR",
      language: "es",
      content: "Una medida al día.",
      evidence: [evidence],
      state: "approved"
    }),
    IrisKnowledgeUnitError
  );
});

test("estado pending nunca es answerable", () => {
  const evidence = approvedPdfEvidence();
  const unit = createKnowledgeUnit({
    type: "fact",
    subject: "collagen-plus",
    topic: "usage",
    market: "AR",
    language: "es",
    content: "Una medida al día.",
    evidence: [evidence],
    state: "pending"
  });

  assert.equal(unit.answerable, false);
});
