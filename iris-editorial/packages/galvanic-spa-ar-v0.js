"use strict";

const { createEvidence } = require("../../iris-core/evidence");
const { createKnowledgeUnit } = require("../../iris-core/knowledge-unit");

const SOURCE_ID = "ageloc-galvanic-spa-7e8a5b1ae76e29ce";
const SOURCE_TITLE = "ageLOC Galvanic Spa";
const SOURCE_VERSION = "2019-06-28";
const MARKET = "AR";
const LANGUAGE = "es";

function pdfEvidence({ pageNumber, section, spanIndexes, content }) {
  return createEvidence({
    sourceType: "pdf",
    sourceId: SOURCE_ID,
    sourceTitle: SOURCE_TITLE,
    sourceVersion: SOURCE_VERSION,
    market: MARKET,
    language: LANGUAGE,
    locator: { pageNumber, section, spanIndexes },
    content,
    reconstructionRequired: false,
    approvedForKnowledge: true
  });
}

const evidence = Object.freeze({
  description: pdfEvidence({
    pageNumber: 1,
    section: "CONOCE AGELOC GALVANIC SPA",
    spanIndexes: [17,19,20,21,23,24,26,27,28,29,30,31,32,33,34,35,36,37,39,41,43],
    content: "ageLOC Galvanic Spa es un dispositivo de belleza para el hogar que administra productos de tratamiento con cargas positivas y negativas. Su tecnología galvánica autoajustable se adapta a la piel y se utiliza para ayudar a mejorar visiblemente áreas del rostro, cabello y cuerpo."
  }),
  conductors: pdfEvidence({
    pageNumber: 1,
    section: "¿POR QUÉ TE VA A ENCANTAR? — CABEZALES",
    spanIndexes: [47,49,50,51,52,53],
    content: "ageLOC Galvanic Spa incluye cuatro cabezales conductores intercambiables: facial ageLOC, tratamiento específico, cuero cabelludo y corporal."
  }),
  compatibleProducts: pdfEvidence({
    pageNumber: 1,
    section: "PRODUCTOS COMPATIBLES",
    spanIndexes: [71,73,75,77,78,79,80,81,82,83,84],
    content: "El documento enumera como productos compatibles: Geles faciales Galvanic Spa con ageLOC, Tru Face Line Corrector, ageLOC Galvanic Spa PowerMask, ageLOC Nutriol Intensive Scalp & Hair Serum, ageLOC Body Shaping Gel y ageLOC Galvanic Spa EnergEyes, indicado allí como próximamente."
  }),
  usage: pdfEvidence({
    pageNumber: 1,
    section: "¿CÓMO USARLO?",
    spanIndexes: [86,88,89,90],
    content: "Para usar ageLOC Galvanic Spa, la ficha indica leer el Manual de Usuario para ver los detalles de uso del dispositivo con cada producto compatible."
  }),
  precautions: pdfEvidence({
    pageNumber: 2,
    section: "PRECAUCIÓN",
    spanIndexes: [62,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83],
    content: "Galvanic Spa debe usarse sólo sobre piel sana. No debe usarse sobre heridas abiertas ni si existe propensión a rosácea, alergia al metal o piel demasiado sensible/problemática. La ficha indica consultar al médico antes de usarlo durante el embarazo o en caso de marcapasos/dispositivo similar, epilepsia, ortodoncia, implante metálico o enfermedad. No aplicar directamente en labios, ojos o párpados; es sólo para uso externo. Ante enrojecimiento prolongado o irritación anormal, suspender el uso y buscar atención médica si es necesario. Mantener fuera del alcance de los niños, no sumergir en agua y no usar si está dañado."
  }),
  battery: pdfEvidence({
    pageNumber: 2,
    section: "PREGUNTAS FRECUENTES — BATERÍAS",
    spanIndexes: [8,10,12,14,16,18,20,22,23,25,26],
    content: "Normalmente, el dispositivo puede funcionar varios meses antes de requerir cambio de baterías."
  }),
  beep: pdfEvidence({
    pageNumber: 2,
    section: "PREGUNTAS FRECUENTES — SONIDOS",
    spanIndexes: [28,30,31,32,33,34,36,37,38],
    content: "Al comenzar, Galvanic Spa emite uno, dos o tres pitidos para indicar que se ajustó automáticamente a la piel. Durante el tratamiento suena cada 10 segundos para indicar que está funcionando y cada 5 segundos cuando está por terminar."
  }),
  conductorChange: pdfEvidence({
    pageNumber: 2,
    section: "PREGUNTAS FRECUENTES — CAMBIO DE CABEZALES",
    spanIndexes: [40,42,43,44,45,46,47,48,49,51,53,54,55,56,57,58,59,60],
    content: "Para colocar un cabezal, se alinea el indicador de posición con el frente del dispositivo y se presiona hasta que encaje, sin forzarlo. El dispositivo no funciona si el cabezal no está firmemente unido. Para retirarlo, se gira el dispositivo, se sujeta el conductor por los lados, se presiona el botón de liberación y se desprende suavemente."
  }),
  facialGrooves: pdfEvidence({
    pageNumber: 1,
    section: "MÁS INFORMACIÓN — RANURAS DEL CABEZAL FACIAL",
    spanIndexes: [130,132,133,134,135,136],
    content: "Las ranuras del cabezal conductor facial ayudan a mantener los geles faciales Galvanic Spa con ageLOC entre el conductor y la piel para mantener el producto en esa zona durante el tratamiento."
  })
});

const units = Object.freeze([
  createKnowledgeUnit({ type: "fact", subject: "ageloc-galvanic-spa", topic: "description", market: MARKET, language: LANGUAGE, content: "ageLOC Galvanic Spa es un dispositivo de belleza para el hogar que usa tecnología galvánica autoajustable y productos con cargas positivas y negativas para ayudar a mejorar visiblemente el rostro, el cabello y el cuerpo.", evidence: [evidence.description], state: "approved", versionLabel: "prototype-candidate-2019" }),
  createKnowledgeUnit({ type: "fact", subject: "ageloc-galvanic-spa", topic: "description", market: MARKET, language: LANGUAGE, content: "Incluye cuatro cabezales conductores intercambiables: facial ageLOC, tratamiento específico, cuero cabelludo y corporal.", evidence: [evidence.conductors], state: "approved", versionLabel: "prototype-candidate-2019" }),
  createKnowledgeUnit({ type: "procedure", subject: "ageloc-galvanic-spa", topic: "usage", market: MARKET, language: LANGUAGE, content: "La ficha indica consultar el Manual de Usuario para ver el procedimiento exacto con cada producto compatible; el uso cambia según el producto y el cabezal.", evidence: [evidence.usage], state: "approved", versionLabel: "prototype-candidate-2019" }),
  createKnowledgeUnit({ type: "resource", subject: "ageloc-galvanic-spa", topic: "resource", market: MARKET, language: LANGUAGE, content: "Productos compatibles indicados en la ficha: Geles faciales Galvanic Spa con ageLOC, Tru Face Line Corrector, ageLOC Galvanic Spa PowerMask, ageLOC Nutriol Intensive Scalp & Hair Serum, ageLOC Body Shaping Gel y ageLOC Galvanic Spa EnergEyes (marcado como próximamente en esa versión).", evidence: [evidence.compatibleProducts], state: "approved", versionLabel: "prototype-candidate-2019" }),
  createKnowledgeUnit({ type: "warning", subject: "ageloc-galvanic-spa", topic: "precautions", market: MARKET, language: LANGUAGE, content: "Galvanic Spa debe usarse sólo sobre piel sana. No lo uses sobre heridas abiertas ni si sos propensa/o a rosácea, tenés alergia al metal o piel demasiado sensible/problemática. Consultá a tu médico antes de usarlo si estás embarazada, tenés marcapasos o dispositivo similar, epilepsia, ortodoncia, implante metálico o alguna enfermedad. No lo apliques directamente sobre labios, ojos o párpados. Suspendé el uso ante irritación anormal o enrojecimiento prolongado y buscá atención médica si fuera necesario.", evidence: [evidence.precautions], state: "approved", sensitive: true, versionLabel: "prototype-candidate-2019" }),
  createKnowledgeUnit({ type: "faq", subject: "ageloc-galvanic-spa", topic: "faq.battery", market: MARKET, language: LANGUAGE, content: "Normalmente, las baterías pueden durar varios meses antes de necesitar reemplazo.", evidence: [evidence.battery], state: "approved", versionLabel: "prototype-candidate-2019" }),
  createKnowledgeUnit({ type: "faq", subject: "ageloc-galvanic-spa", topic: "faq.beep", market: MARKET, language: LANGUAGE, content: "Los pitidos indican el ajuste y el progreso del tratamiento: al inicio emite uno, dos o tres pitidos al ajustarse a la piel; luego suena cada 10 segundos mientras funciona y cada 5 segundos cuando está por finalizar.", evidence: [evidence.beep], state: "approved", versionLabel: "prototype-candidate-2019" }),
  createKnowledgeUnit({ type: "faq", subject: "ageloc-galvanic-spa", topic: "faq.conductor-change", market: MARKET, language: LANGUAGE, content: "Para colocar un cabezal, alineá su indicador con el frente del dispositivo y presionalo hasta que encaje, sin forzarlo. Para retirarlo, sujetalo por los lados, presioná el botón de liberación y desprendelo suavemente.", evidence: [evidence.conductorChange], state: "approved", versionLabel: "prototype-candidate-2019" }),
  createKnowledgeUnit({ type: "faq", subject: "ageloc-galvanic-spa", topic: "faq.facial-grooves", market: MARKET, language: LANGUAGE, content: "Las ranuras del cabezal facial ayudan a mantener los geles faciales entre el conductor y la piel durante el tratamiento.", evidence: [evidence.facialGrooves], state: "approved", versionLabel: "prototype-candidate-2019" })
]);

const packageMetadata = Object.freeze({
  packageId: "ageloc-galvanic-spa-ar-prototype-v0",
  productSlug: "ageloc-galvanic-spa",
  market: MARKET,
  language: LANGUAGE,
  sourceStatus: "owner-provided-candidate",
  approvalScope: "prototype-only",
  productionApproved: false,
  sourceContentSha256: "7e8a5b1ae76e29ce93f4f7fd30fb76d386cf755fe94e745c73a60df648f77596",
  sourceVersion: SOURCE_VERSION,
  excludedStructuredPages: Object.freeze([])
});

module.exports = { evidence, packageMetadata, units };
