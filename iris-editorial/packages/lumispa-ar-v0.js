"use strict";

const { createEvidence } = require("../../iris-core/evidence");
const { createKnowledgeUnit } = require("../../iris-core/knowledge-unit");

const SOURCE_ID = "ageloc-lumispa-467cd69fa03639f6";
const SOURCE_TITLE = "ageLOC LumiSpa";
const SOURCE_VERSION = "2017";
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
    section: "VISIÓN GENERAL DEL PRODUCTO",
    spanIndexes: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
    content: "ageLOC LumiSpa es un sistema de doble acción para el cuidado de la piel que combina renovación de la piel y limpieza profunda. Usa un cabezal de tratamiento de silicona suave y una acción patentada de rotación inversa para limpiar suciedad, grasa y maquillaje, y ayudar a reducir la apariencia de los poros."
  }),
  usage: pdfEvidence({
    pageNumber: 2,
    section: "USO",
    spanIndexes: [72, 73, 74, 75, 76],
    content: "Para óptimos resultados, usar ageLOC LumiSpa durante dos minutos, dos veces al día, como paso de limpieza. Por la mañana y por la noche se usa con los tratamientos de limpieza ageLOC LumiSpa y luego se continúa con la rutina de cuidado habitual."
  }),
  keyIngredients: pdfEvidence({
    pageNumber: 2,
    section: "INGREDIENTES CLAVE DE LOS TRATAMIENTOS DE LIMPIEZA AGELOC LUMISPA",
    spanIndexes: [94, 95, 96, 100, 102, 103, 104, 105, 106, 109, 110, 112, 113, 114, 115, 116, 117, 119, 120, 122, 125, 127, 128, 129, 130, 131, 134, 136, 138, 139, 141, 142, 144, 145, 147, 148, 150, 151, 153, 154],
    content: "Los tratamientos de limpieza LumiSpa tienen ingredientes clave distintos según el tipo de piel. Grasa: extracto de Knotweed japonés, Miristil PCA, extracto de jugo de granada y carnosina. Normal/mixta: aceite de cardo mariano, extracto de laver púrpura, Nannochloropsis Oculata y extracto de rododendro. Seca: lactato de sodio, PCA de sodio, glicina, fructosa, niacinamida, inositol, escualeno y saliciloil fitoesfingosina. Sensible: extracto de avena, extracto de corteza de Pinus Tabulaeformis, bisabolol y alantoína."
  }),
  precautions: pdfEvidence({
    pageNumber: 4,
    section: "PREGUNTAS FRECUENTES — ACNÉ Y USO EN EL CUERPO",
    spanIndexes: [50, 52, 53, 54, 55, 56, 57, 58, 60, 62, 63, 64, 65],
    content: "ageLOC LumiSpa no fue desarrollado para tratar el acné. Quienes deseen tratar acné deben continuar con su régimen regular de cuidado de la piel y consultar con un dermatólogo antes de usar LumiSpa. El dispositivo fue diseñado para la piel del rostro y no se recomienda usarlo en otras partes del cuerpo."
  }),
  cleanserCompatibility: pdfEvidence({
    pageNumber: 4,
    section: "PREGUNTAS FRECUENTES — TRATAMIENTOS DE LIMPIEZA",
    spanIndexes: [8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    content: "Los tratamientos de limpieza ageLOC LumiSpa fueron formulados específicamente para usarse con el dispositivo. El documento indica que son las formulaciones probadas y aprobadas para obtener los beneficios totales del sistema."
  }),
  showerUse: pdfEvidence({
    pageNumber: 4,
    section: "PREGUNTAS FRECUENTES — DUCHA O REGADERA",
    spanIndexes: [67, 69, 70, 71, 72],
    content: "ageLOC LumiSpa es a prueba de agua y puede usarse en la ducha, regadera u otros ambientes húmedos; la excepción es la base."
  })
});

const units = Object.freeze([
  createKnowledgeUnit({
    type: "fact",
    subject: "ageloc-lumispa",
    topic: "description",
    market: MARKET,
    language: LANGUAGE,
    content: "ageLOC LumiSpa es un sistema de doble acción para el cuidado de la piel que combina renovación y limpieza profunda. Usa un cabezal de silicona suave y una acción patentada de rotación inversa para limpiar la piel y ayudar a reducir la apariencia de los poros.",
    evidence: [evidence.description],
    state: "approved",
    versionLabel: "prototype-candidate-2017"
  }),
  createKnowledgeUnit({
    type: "procedure",
    subject: "ageloc-lumispa",
    topic: "usage",
    market: MARKET,
    language: LANGUAGE,
    content: "Usá ageLOC LumiSpa durante dos minutos, dos veces al día, como paso de limpieza: por la mañana y por la noche, junto con los tratamientos de limpieza ageLOC LumiSpa.",
    evidence: [evidence.usage],
    state: "approved",
    versionLabel: "prototype-candidate-2017"
  }),
  createKnowledgeUnit({
    type: "ingredient",
    subject: "ageloc-lumispa",
    topic: "ingredients",
    market: MARKET,
    language: LANGUAGE,
    content: "Los ingredientes clave dependen del tratamiento limpiador. Grasa: Knotweed japonés, Miristil PCA, granada y carnosina. Normal/mixta: cardo mariano, laver púrpura, Nannochloropsis Oculata y rododendro. Seca: lactato de sodio, PCA de sodio, glicina, fructosa, niacinamida, inositol, escualeno y saliciloil fitoesfingosina. Sensible: avena, Pinus Tabulaeformis, bisabolol y alantoína.",
    evidence: [evidence.keyIngredients],
    state: "approved",
    versionLabel: "prototype-candidate-2017"
  }),
  createKnowledgeUnit({
    type: "warning",
    subject: "ageloc-lumispa",
    topic: "precautions",
    market: MARKET,
    language: LANGUAGE,
    content: "LumiSpa no fue desarrollado para tratar el acné. Si buscás tratar acné, el documento recomienda continuar con tu régimen habitual y consultar con un dermatólogo antes de usarlo. Además, LumiSpa fue diseñado para el rostro y no se recomienda usarlo en otras partes del cuerpo.",
    evidence: [evidence.precautions],
    state: "approved",
    sensitive: true,
    versionLabel: "prototype-candidate-2017"
  }),
  createKnowledgeUnit({
    type: "faq",
    subject: "ageloc-lumispa",
    topic: "faq.cleanser-compatibility",
    market: MARKET,
    language: LANGUAGE,
    content: "El documento indica que los tratamientos de limpieza ageLOC LumiSpa fueron formulados específicamente para el dispositivo y son las formulaciones probadas y aprobadas para obtener los beneficios totales del sistema.",
    evidence: [evidence.cleanserCompatibility],
    state: "approved",
    versionLabel: "prototype-candidate-2017"
  }),
  createKnowledgeUnit({
    type: "faq",
    subject: "ageloc-lumispa",
    topic: "faq.shower-use",
    market: MARKET,
    language: LANGUAGE,
    content: "Sí. LumiSpa es a prueba de agua y puede usarse en la ducha o regadera; la base es la excepción.",
    evidence: [evidence.showerUse],
    state: "approved",
    versionLabel: "prototype-candidate-2017"
  })
]);

const packageMetadata = Object.freeze({
  packageId: "ageloc-lumispa-ar-prototype-v0",
  productSlug: "ageloc-lumispa",
  market: MARKET,
  language: LANGUAGE,
  sourceStatus: "owner-provided-candidate",
  approvalScope: "prototype-only",
  productionApproved: false,
  sourceContentSha256: "467cd69fa03639f658b65705d9502ce03b42a6798df010bd0be840412476f538",
  sourceVersion: SOURCE_VERSION,
  excludedStructuredPages: Object.freeze([3])
});

module.exports = { evidence, packageMetadata, units };
