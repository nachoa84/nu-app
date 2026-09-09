"use strict";

/**
 * Iris business / Office Virtual discovery intake v0
 *
 * Purpose:
 * - preserve the useful Argentina-specific findings from an owner-authorized
 *   Office Virtual mapping session;
 * - keep discovery separate from approved knowledge;
 * - prevent cross-market contamination from LATAM pages that contain multiple
 *   country sections;
 * - classify volatile operational contacts separately from durable procedures.
 *
 * IMPORTANT:
 * - discovery-only
 * - productionApproved: false
 * - no unit in this file is answerable knowledge
 * - owner approval is still required before promotion into evidence/knowledge
 */

const MARKET = "AR";
const LANGUAGE = "es";

const sources = Object.freeze({
  support: {
    sourceType: "office_virtual",
    sourceTitle: "Contáctenos Nu Skin Argentina",
    locator: "#/links/content/nuskin/es_AR/corporate/help/contact",
    scope: "AR",
    contentKind: "resource"
  },
  commissions: {
    sourceType: "office_virtual",
    sourceTitle: "Cómo Recibir Comisiones",
    locator: "#/links/content/nuskin/es_AR/office/comenzar/comisiones",
    scope: "AR-section-only",
    contentKind: "procedure",
    crossMarketWarning: "The rendered page also contains Mexico, Colombia, Chile and Peru. Only the Argentina section may be used for AR knowledge."
  },
  enroll: {
    sourceType: "office_virtual",
    sourceTitle: "Inscripciones",
    locator: "#/links/content/nuskin/es_AR/office/comenzar/enroll",
    scope: "AR",
    contentKind: "navigation"
  },
  tutorials: {
    sourceType: "office_virtual",
    sourceTitle: "Tutoriales",
    locator: "#/links/content/nuskin/es_AR/office/library/tutorials",
    scope: "AR",
    contentKind: "resource"
  },
  documents: {
    sourceType: "office_virtual",
    sourceTitle: "Documents",
    locator: "#/documents",
    scope: "AR/shared-es",
    contentKind: "resource"
  },
  trainings: {
    sourceType: "office_virtual",
    sourceTitle: "Trainings",
    locator: "#/trainings",
    scope: "session-visible",
    contentKind: "resource"
  }
});

const candidateFindings = Object.freeze([
  {
    id: "business-ar-commissions-required-document-v0",
    type: "procedure-candidate",
    intent: "procedure.guide",
    topic: "business.commissions.receive",
    source: "commissions",
    market: MARKET,
    language: LANGUAGE,
    durability: "medium",
    content: "Para recibir comisiones en Argentina, la página indica que debe enviarse correctamente completado el Acuerdo de Afiliado de Marca con información bancaria.",
    status: "pending-owner-approval"
  },
  {
    id: "business-ar-commissions-document-email-v0",
    type: "resource-candidate",
    intent: "resource.find",
    topic: "business.commissions.documents-destination",
    source: "commissions",
    market: MARKET,
    language: LANGUAGE,
    durability: "volatile",
    content: "La página indica enviar el documento requerido a documentos@nuskin.com.",
    status: "pending-owner-approval"
  },
  {
    id: "business-ar-commissions-invoice-v0",
    type: "procedure-candidate",
    intent: "procedure.guide",
    topic: "business.commissions.invoice",
    source: "commissions",
    market: MARKET,
    language: LANGUAGE,
    durability: "medium",
    content: "Después de que el documento y las comisiones sean procesados, la página de Argentina indica enviar la factura electrónica a facturas@nuskin.com.",
    status: "pending-owner-approval"
  },
  {
    id: "business-ar-enrollment-options-v0",
    type: "navigation-candidate",
    intent: "app.navigate",
    topic: "business.enrollment.options",
    source: "enroll",
    market: MARKET,
    language: LANGUAGE,
    durability: "medium",
    content: "La pantalla Inscripciones ofrece accesos para inscribir un Afiliado de Marca, un Cliente y una Cuenta de Miembro, además de Carta de Intención.",
    status: "pending-owner-approval"
  },
  {
    id: "business-ar-enrollment-brand-affiliate-v0",
    type: "navigation-candidate",
    intent: "business.explain",
    topic: "business.enrollment.brand-affiliate",
    source: "enroll",
    market: MARKET,
    language: LANGUAGE,
    durability: "medium",
    content: "La opción 'Inscribe a un Afiliado de Marca' se presenta para quien está interesado en convertirse en Afiliado de Marca y adquirir productos.",
    status: "pending-owner-approval"
  },
  {
    id: "business-ar-enrollment-client-v0",
    type: "navigation-candidate",
    intent: "business.explain",
    topic: "business.enrollment.client",
    source: "enroll",
    market: MARKET,
    language: LANGUAGE,
    durability: "medium",
    content: "La opción 'Inscribe a un Cliente' se presenta para quien está interesado en adquirir productos.",
    status: "pending-owner-approval"
  },
  {
    id: "business-ar-enrollment-member-v0",
    type: "navigation-candidate",
    intent: "business.explain",
    topic: "business.enrollment.member",
    source: "enroll",
    market: MARKET,
    language: LANGUAGE,
    durability: "medium",
    content: "La opción 'Inscribe una Cuenta de Miembro' se presenta para quien está interesado en adquirir productos mediante un pedido mensual ADR.",
    status: "pending-owner-approval"
  },
  {
    id: "business-ar-letter-of-intent-v0",
    type: "navigation-candidate",
    intent: "business.explain",
    topic: "business.letter-of-intent",
    source: "enroll",
    market: MARKET,
    language: LANGUAGE,
    durability: "medium",
    content: "La pantalla describe la Carta de Intención como el compromiso con convertirse en Afiliado de nivel Ejecutivo.",
    status: "pending-owner-approval"
  },
  {
    id: "business-ar-tutorial-order-v0",
    type: "resource-candidate",
    intent: "resource.find",
    topic: "business.tutorial.order",
    source: "tutorials",
    market: MARKET,
    language: LANGUAGE,
    durability: "medium",
    content: "La biblioteca de Tutoriales muestra recursos para crear una orden regular por web, crear un ADR y redimir/editar ADR.",
    status: "pending-owner-approval"
  },
  {
    id: "business-ar-training-policies-v0",
    type: "resource-candidate",
    intent: "resource.find",
    topic: "business.training.policies",
    source: "trainings",
    market: MARKET,
    language: LANGUAGE,
    durability: "medium",
    content: "La pantalla Trainings muestra una capacitación titulada 'Conceptos básicos de las Políticas'.",
    status: "pending-owner-approval"
  }
]);

const volatileResources = Object.freeze([
  {
    topic: "support.contact",
    source: "support",
    reason: "Phone numbers, emails and support hours can change; resolve from current Office Virtual/resource source when needed rather than treating as durable knowledge."
  },
  {
    topic: "business.commissions.contact",
    source: "commissions",
    reason: "Operational contact details and business hours are volatile."
  },
  {
    topic: "business.price-list",
    source: "support",
    reason: "Price list is explicitly linked as a document and should be supplied/ingested only when Iris needs current price facts."
  },
  {
    topic: "business.compensation-plan",
    source: "documents",
    reason: "Detailed compensation claims should come from the actual current plan document, not from navigation labels or model memory."
  }
]);

const excludedFromKnowledge = Object.freeze([
  "Mexico section from Cómo Recibir Comisiones",
  "Colombia section from Cómo Recibir Comisiones",
  "Chile section from Cómo Recibir Comisiones",
  "Peru section from Cómo Recibir Comisiones",
  "Country-selector boilerplate",
  "Dynamic or personal account information",
  "Unverified compensation-plan details",
  "Document contents not supplied/approved by the owner"
]);

const intakeMetadata = Object.freeze({
  intakeId: "business-office-ar-discovery-v0",
  market: MARKET,
  language: LANGUAGE,
  sourceStatus: "owner-authorized-office-discovery",
  approvalScope: "discovery-only",
  productionApproved: false,
  candidateCount: candidateFindings.length,
  sourceCount: Object.keys(sources).length,
  requiresOwnerApprovalForPromotion: true
});

module.exports = {
  sources,
  candidateFindings,
  volatileResources,
  excludedFromKnowledge,
  intakeMetadata
};
