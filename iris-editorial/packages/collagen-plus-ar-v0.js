"use strict";

const { createEvidence } = require("../../iris-core/evidence");
const { createKnowledgeUnit } = require("../../iris-core/knowledge-unit");

const SOURCE_ID = "collagen-plus-a5ae5ce920f568fe";
const SOURCE_TITLE = "Beauty Focus Collagen+";
const SOURCE_VERSION = "4/27/21";
const MARKET = "AR";
const LANGUAGE = "es";

function pdfEvidence({ pageNumber, section, spanIndexes, content, sensitive = false }) {
  return createEvidence({
    sourceType: "pdf",
    sourceId: SOURCE_ID,
    sourceTitle: SOURCE_TITLE,
    sourceVersion: SOURCE_VERSION,
    market: MARKET,
    language: LANGUAGE,
    locator: { pageNumber, section, spanIndexes },
    content,
    sensitive,
    reconstructionRequired: false,
    approvedForKnowledge: true
  });
}

const evidence = Object.freeze({
  description: pdfEvidence({
    pageNumber: 1,
    section: "CONOCE COLLAGEN+",
    spanIndexes: [247, 248, 249, 250, 251],
    content: "Ayuda a mejorar la producción de colágeno y elastina, contribuyendo a aumentar la luminosidad, a reducir visiblemente las líneas de expresión y las arrugas, y a mejorar la hidratación."
  }),
  usage: pdfEvidence({
    pageNumber: 3,
    section: "¿CÓMO USARLO?",
    spanIndexes: [16, 18, 20, 21],
    content: "Disfruta de una medida de Collagen+ al día. Conservar en un lugar fresco y seco."
  }),
  consumption: pdfEvidence({
    pageNumber: 4,
    section: "INSTRUCCIONES DE CONSUMO",
    spanIndexes: [96, 97, 98, 99],
    content: "Disolver una medida de Collagen+ en 200 ml de agua y disfruta una vez al día."
  }),
  ingredients: pdfEvidence({
    pageNumber: 4,
    section: "INGREDIENTES",
    spanIndexes: [74, 75, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86],
    content: "Péptidos de colágeno, luteína, Lipowheat oil (extracto de gluten de trigo, extracto de hojas de romero, aceite de semilla de girasol), dióxido de silicio, ácido cítrico, sabor naranja, glicósidos de esteviol y betacaroteno. Contiene derivados de trigo.",
    sensitive: true
  }),
  precautions: pdfEvidence({
    pageNumber: 4,
    section: "ADVERTENCIA",
    spanIndexes: [101, 102, 103, 104, 105, 106, 107, 108, 109],
    content: "No utilizar en caso de embarazo, mujeres en período de lactancia ni en niños. Mantener fuera del alcance de los niños. Consumir de acuerdo con las recomendaciones del rótulo. El consumo de suplementos dietarios no reemplaza una dieta variada y equilibrada. Consulte a su médico.",
    sensitive: true
  }),
  hotDrink: pdfEvidence({
    pageNumber: 3,
    section: "¿Puedo mezclar Collagen+ en una bebida caliente?",
    spanIndexes: [129, 130, 131, 132, 133],
    content: "Puede mezclarse con bebidas frías o calientes; el documento indica líquidos de hasta 176 °F (80 °C) sin afectar la eficacia de los Péptidos de Colágeno Bioactivos®."
  }),
  topicalUse: pdfEvidence({
    pageNumber: 3,
    section: "¿Necesito utilizar Collagen+ con los productos tópicos de cuidado de la piel Nu Skin® para ver los resultados?",
    spanIndexes: [103, 104, 106, 107, 108, 109, 110, 111, 112, 114, 115, 117, 119, 120, 121, 122, 123, 124, 126, 127],
    content: "El documento indica que Beauty Focus Collagen+ está clínicamente probado por sí mismo y que también puede utilizarse junto con regímenes tópicos de Nu Skin para obtener beneficios complementarios."
  })
});

const units = Object.freeze([
  createKnowledgeUnit({
    type: "fact",
    subject: "collagen-plus",
    topic: "description",
    market: MARKET,
    language: LANGUAGE,
    content: "Beauty Focus Collagen+ es un suplemento dietario orientado al cuidado de la piel que, según la ficha, ayuda a mejorar la producción de colágeno y elastina, la luminosidad y la hidratación, y a reducir visiblemente líneas de expresión y arrugas.",
    evidence: [evidence.description],
    state: "approved",
    versionLabel: "prototype-candidate-2021"
  }),
  createKnowledgeUnit({
    type: "procedure",
    subject: "collagen-plus",
    topic: "usage",
    market: MARKET,
    language: LANGUAGE,
    content: "Tomar una medida de Collagen+ una vez al día. Para consumirlo, disolver una medida en 200 ml de agua.",
    evidence: [evidence.usage, evidence.consumption],
    state: "approved",
    versionLabel: "prototype-candidate-2021"
  }),
  createKnowledgeUnit({
    type: "ingredient",
    subject: "collagen-plus",
    topic: "ingredients",
    market: MARKET,
    language: LANGUAGE,
    content: "La ficha declara péptidos de colágeno, luteína, Lipowheat oil, dióxido de silicio, ácido cítrico, sabor naranja, glicósidos de esteviol y betacaroteno. Contiene derivados de trigo.",
    evidence: [evidence.ingredients],
    state: "approved",
    sensitive: true,
    versionLabel: "prototype-candidate-2021"
  }),
  createKnowledgeUnit({
    type: "warning",
    subject: "collagen-plus",
    topic: "precautions",
    market: MARKET,
    language: LANGUAGE,
    content: "No utilizar durante el embarazo, en período de lactancia ni en niños. Mantener fuera del alcance de los niños, respetar la ingesta indicada en el rótulo y consultar al médico. El suplemento no reemplaza una dieta variada y equilibrada.",
    evidence: [evidence.precautions],
    state: "approved",
    sensitive: true,
    versionLabel: "prototype-candidate-2021"
  }),
  createKnowledgeUnit({
    type: "faq",
    subject: "collagen-plus",
    topic: "usage",
    market: MARKET,
    language: LANGUAGE,
    content: "Sí. La ficha indica que Collagen+ puede mezclarse con bebidas frías o calientes, hasta 80 °C, sin afectar la eficacia de los Péptidos de Colágeno Bioactivos®.",
    evidence: [evidence.hotDrink],
    state: "approved",
    versionLabel: "prototype-candidate-2021"
  }),
  createKnowledgeUnit({
    type: "faq",
    subject: "collagen-plus",
    topic: "description",
    market: MARKET,
    language: LANGUAGE,
    content: "No es necesario usar Collagen+ con productos tópicos para que la ficha le atribuya eficacia; también puede combinarse con regímenes tópicos de Nu Skin para beneficios complementarios.",
    evidence: [evidence.topicalUse],
    state: "approved",
    versionLabel: "prototype-candidate-2021"
  })
]);

const packageMetadata = Object.freeze({
  packageId: "collagen-plus-ar-prototype-v0",
  productSlug: "collagen-plus",
  market: MARKET,
  language: LANGUAGE,
  sourceStatus: "owner-provided-candidate",
  approvalScope: "prototype-only",
  productionApproved: false,
  sourceContentSha256: "a5ae5ce920f568fe3e9cff3a52693d21f879ed491f00dea9662111b22884cf19",
  sourceVersion: SOURCE_VERSION
});

module.exports = { evidence, packageMetadata, units };
