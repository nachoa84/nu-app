"use strict";

const { createEvidence } = require("../../iris-core/evidence");
const { createKnowledgeUnit } = require("../../iris-core/knowledge-unit");

const MARKET = "AR";
const LANGUAGE = "es";
const SOURCE_VERSION = "office-capture-2026-09-09";

function officeEvidence({ sourceId, sourceTitle, path, section, content }) {
  return createEvidence({
    sourceType: "office_virtual",
    sourceId,
    sourceTitle,
    sourceVersion: SOURCE_VERSION,
    market: MARKET,
    language: LANGUAGE,
    locator: { path, section },
    content,
    reconstructionRequired: false,
    approvedForKnowledge: true
  });
}

const evidence = Object.freeze({
  commissionsRequiredDocument: officeEvidence({
    sourceId: "office-ar-comisiones",
    sourceTitle: "Cómo Recibir Comisiones",
    path: "#/links/content/nuskin/es_AR/office/comenzar/comisiones",
    section: "ARGENTINA",
    content: "Para recibir comisiones en Argentina, la página indica que debe enviarse correctamente completado el Acuerdo de Afiliado de Marca con información bancaria."
  }),
  commissionsInvoiceStep: officeEvidence({
    sourceId: "office-ar-comisiones",
    sourceTitle: "Cómo Recibir Comisiones",
    path: "#/links/content/nuskin/es_AR/office/comenzar/comisiones",
    section: "ARGENTINA",
    content: "Después de procesar el documento y las comisiones, la página de Argentina indica que debe hacerse llegar una factura electrónica."
  }),
  enrollmentOptions: officeEvidence({
    sourceId: "office-ar-inscripciones",
    sourceTitle: "Inscripciones",
    path: "#/links/content/nuskin/es_AR/office/comenzar/enroll",
    section: "INSCRIPCIONES",
    content: "La pantalla Inscripciones ofrece accesos para inscribir un Afiliado de Marca, un Cliente y una Cuenta de Miembro, además de Carta de Intención."
  }),
  brandAffiliate: officeEvidence({
    sourceId: "office-ar-inscripciones",
    sourceTitle: "Inscripciones",
    path: "#/links/content/nuskin/es_AR/office/comenzar/enroll",
    section: "INSCRIBE A UN AFILIADO DE MARCA",
    content: "La opción se presenta para quien está interesado en convertirse en Afiliado de Marca y adquirir productos."
  }),
  client: officeEvidence({
    sourceId: "office-ar-inscripciones",
    sourceTitle: "Inscripciones",
    path: "#/links/content/nuskin/es_AR/office/comenzar/enroll",
    section: "INSCRIBE A UN CLIENTE",
    content: "La opción se presenta para quien está interesado en adquirir productos."
  }),
  member: officeEvidence({
    sourceId: "office-ar-inscripciones",
    sourceTitle: "Inscripciones",
    path: "#/links/content/nuskin/es_AR/office/comenzar/enroll",
    section: "INSCRIBE UNA CUENTA DE MIEMBRO",
    content: "La opción se presenta para quien está interesado en adquirir productos a través de un pedido mensual de ADR."
  }),
  letterOfIntent: officeEvidence({
    sourceId: "office-ar-inscripciones",
    sourceTitle: "Inscripciones",
    path: "#/links/content/nuskin/es_AR/office/comenzar/enroll",
    section: "CARTA DE INTENCIÓN",
    content: "La pantalla describe la Carta de Intención como el compromiso con convertirse en Afiliado de nivel Ejecutivo."
  })
});

const units = Object.freeze([
  createKnowledgeUnit({
    type: "procedure",
    subject: "business-commissions",
    topic: "receive.requirements",
    market: MARKET,
    language: LANGUAGE,
    content: "Para recibir comisiones en Argentina, la Oficina Virtual indica que hay que presentar correctamente completado el Acuerdo de Afiliado de Marca con información bancaria.",
    evidence: [evidence.commissionsRequiredDocument],
    state: "approved",
    versionLabel: SOURCE_VERSION
  }),
  createKnowledgeUnit({
    type: "procedure",
    subject: "business-commissions",
    topic: "receive.invoice-step",
    market: MARKET,
    language: LANGUAGE,
    content: "Después de que se procese la documentación y las comisiones, la Oficina Virtual indica que corresponde enviar una factura electrónica. El correo operativo debe consultarse en la fuente vigente porque puede cambiar.",
    evidence: [evidence.commissionsInvoiceStep],
    state: "approved",
    versionLabel: SOURCE_VERSION
  }),
  createKnowledgeUnit({
    type: "navigation",
    subject: "business-enrollment",
    topic: "options",
    market: MARKET,
    language: LANGUAGE,
    content: "La sección Inscripciones de la Oficina Virtual ofrece opciones para inscribir un Afiliado de Marca, un Cliente y una Cuenta de Miembro, además de acceso a la Carta de Intención.",
    evidence: [evidence.enrollmentOptions],
    state: "approved",
    versionLabel: SOURCE_VERSION
  }),
  createKnowledgeUnit({
    type: "fact",
    subject: "business-enrollment",
    topic: "brand-affiliate",
    market: MARKET,
    language: LANGUAGE,
    content: "En la pantalla Inscripciones, la opción de Afiliado de Marca está dirigida a quien quiere convertirse en Afiliado de Marca y adquirir productos.",
    evidence: [evidence.brandAffiliate],
    state: "approved",
    versionLabel: SOURCE_VERSION
  }),
  createKnowledgeUnit({
    type: "fact",
    subject: "business-enrollment",
    topic: "client",
    market: MARKET,
    language: LANGUAGE,
    content: "En la pantalla Inscripciones, la opción Cliente está dirigida a quien quiere adquirir productos.",
    evidence: [evidence.client],
    state: "approved",
    versionLabel: SOURCE_VERSION
  }),
  createKnowledgeUnit({
    type: "fact",
    subject: "business-enrollment",
    topic: "member",
    market: MARKET,
    language: LANGUAGE,
    content: "En la pantalla Inscripciones, la Cuenta de Miembro se presenta para quien quiere adquirir productos mediante un pedido mensual ADR.",
    evidence: [evidence.member],
    state: "approved",
    versionLabel: SOURCE_VERSION
  }),
  createKnowledgeUnit({
    type: "fact",
    subject: "business-enrollment",
    topic: "letter-of-intent",
    market: MARKET,
    language: LANGUAGE,
    content: "La Oficina Virtual describe la Carta de Intención como el compromiso con convertirse en Afiliado de nivel Ejecutivo.",
    evidence: [evidence.letterOfIntent],
    state: "approved",
    versionLabel: SOURCE_VERSION
  })
]);

const volatileOperationalFields = Object.freeze([
  "document submission email",
  "invoice email",
  "support phone numbers",
  "support hours",
  "prices",
  "detailed compensation rules"
]);

const packageMetadata = Object.freeze({
  packageId: "business-office-ar-prototype-v0",
  domain: "business",
  market: MARKET,
  language: LANGUAGE,
  sourceStatus: "owner-approved-office-virtual-candidate",
  approvalScope: "prototype-only",
  productionApproved: false,
  sourceVersion: SOURCE_VERSION,
  crossMarketIsolation: true,
  excludedMarkets: ["MX", "CO", "CL", "PE"],
  volatileOperationalFields
});

module.exports = { evidence, units, volatileOperationalFields, packageMetadata };
