"use strict";

const { createEvidence } = require("../../iris-core/evidence");
const { createKnowledgeUnit } = require("../../iris-core/knowledge-unit");

const SOURCE_ID = "ageloc-wellspa-io-0d6a6d512d7ffa47";
const SOURCE_TITLE = "ageLOC WellSpa iO";
const SOURCE_VERSION = "7/5/23";
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
    section: "CONOCE AGELOC WELLSPA iO",
    spanIndexes: [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 25, 26, 27, 33, 35, 36, 38, 40, 42, 43, 44, 45, 46, 47, 49, 50, 52, 53, 55, 57, 58, 60, 61],
    content: "ageLOC WellSpa iO es un dispositivo de bienestar personalizado y sistema de autocuidado orientado a restablecer, revitalizar y recuperar. Combina microcorriente adaptativa que se ajusta a la piel en tiempo real, una aplicación conectada y productos ageLOC especialmente formulados."
  }),
  usage: pdfEvidence({
    pageNumber: 3,
    section: "¿CÓMO USARLO?",
    spanIndexes: [52, 54, 55, 56, 64, 66, 67, 68, 69, 70, 71, 72, 73, 74, 76, 77, 78, 80, 83, 85, 87, 89, 90, 92, 94, 96, 97, 98, 101, 102, 103, 104, 105, 106, 108, 111, 112, 113],
    content: "Antes de usar WellSpa iO, el documento indica consultar el Manual de Usuario para información de seguridad y la aplicación Vera para instrucciones. Con Body Serum: usar de tres veces por semana a diario, aplicar una cantidad generosa sobre la zona y trabajar con movimientos ascendentes/hacia el centro, lentos y circulares; reaplicar producto si hace falta y masajear el resto sobre la piel. Con Body Activating Gel: aplicar una cantidad generosa hasta una vez al día y usar movimientos hacia arriba/hacia adentro, rectos o circulares; masajear el gel restante en la piel."
  }),
  bodySerumIngredients: pdfEvidence({
    pageNumber: 5,
    section: "¿QUÉ CONTIENE? — AGELOC BODY SERUM",
    spanIndexes: [81, 83, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 101, 102],
    content: "Ingredientes de ageLOC Body Serum: Water (Aqua), Glycerin, Propanediol, Pentylene Glycol, PEG-16 Macadamia Glycerides, PEG-10 Sunflower Glycerides, PEG-40 Hydrogenated Castor Oil, Carthamus Tinctorius (Safflower) Seed Oil, Carbomer, Hydroxyacetophenone, Panthenol, Sodium Benzoate, Xanthan Gum, Camellia Sinensis Leaf Extract, Arginine, Allantoin, Fragance (Parfum), Disodium EDTA, Caprylyl Glycol, Tocopheryl Acetate, Ethylhexylglycerin, Caesalpinia Spinosa Fruit Extract, Sodium Acetylated Hyaluronate, Hydroxypropyl MethylCellulose Stearoxy Ether, Sodium Hyaluronate, Lotus Corniculatus Flower Extract, Kappaphycus Alvarezii Extract, Crithmum Maritimum Extract, Oligopeptide-1, Citric Acid y Sodium Hydroxide. Alérgeno de la fragancia: Benzyl Salicylate."
  }),
  activatingGelIngredients: pdfEvidence({
    pageNumber: 6,
    section: "AGELOC BODY ACTIVATING GEL",
    spanIndexes: [6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20],
    content: "Ingredientes de ageLOC Body Activating Gel: Water (Aqua), Butylene Glycol, Glycerin, Polysorbate 20, Aloe Barbadensis Leaf Juice, Carbomer, Aminomethyl Propanol, Fructose, Phenoxyethanol, Caprylyl Glycol, Chlorphenesin, Bisabolol, Allantoin, Panthenol, Fragance (Parfum), Withania Somnifera Root Extract, Sodium PCA, Oryza Sativa (Rice) Extract, Lotus Corniculatus Flower Extract, Disodium EDTA, Schizandra Chinensis Fruit Extract, Sodium Hyaluronate y Crithmum Maritimum Extract. Alérgenos de la fragancia: Benzyl Salicylate, Linalool y Limonene."
  }),
  precautions: pdfEvidence({
    pageNumber: 3,
    section: "ADVERTENCIA DEL DISPOSITIVO",
    spanIndexes: [187, 188, 190],
    content: "El dispositivo ageLOC WellSpa iO no está diseñado ni pretende diagnosticar, tratar, curar o prevenir ninguna enfermedad, condición de la piel, daño o lesión física."
  }),
  threeRs: pdfEvidence({
    pageNumber: 4,
    section: "MÁS INFORMACIÓN — TRES R",
    spanIndexes: [88, 89, 90, 91, 92, 93, 94],
    content: "Las tres R del sistema ageLOC WellSpa iO son Restablecer, Revitalizar y Recuperar. El documento las vincula con bienestar general, confianza en la apariencia física y recuperación."
  }),
  maxTime: pdfEvidence({
    pageNumber: 5,
    section: "MÁS INFORMACIÓN — TIEMPO MÁXIMO",
    spanIndexes: [17, 18, 19, 20],
    content: "El tiempo máximo recomendado indicado en el documento es de hasta 5 minutos por zona corporal, al día."
  })
});

const units = Object.freeze([
  createKnowledgeUnit({
    type: "fact",
    subject: "ageloc-wellspa-io",
    topic: "description",
    market: MARKET,
    language: LANGUAGE,
    content: "ageLOC WellSpa iO es un dispositivo de bienestar personalizado y sistema de autocuidado que combina microcorriente adaptativa, una experiencia conectada mediante app y productos ageLOC formulados para rutinas de Restablecer, Revitalizar y Recuperar.",
    evidence: [evidence.description],
    state: "approved",
    versionLabel: "prototype-candidate-2023"
  }),
  createKnowledgeUnit({
    type: "procedure",
    subject: "ageloc-wellspa-io",
    topic: "usage",
    market: MARKET,
    language: LANGUAGE,
    content: "Antes de usar WellSpa iO, consultá el Manual de Usuario para la información de seguridad y Vera para las instrucciones. Con Body Serum se indica usarlo de tres veces por semana a diario, con producto abundante y movimientos ascendentes/hacia el centro, lentos y circulares. Con Body Activating Gel se indica aplicar una cantidad generosa hasta una vez al día y realizar movimientos hacia arriba/hacia adentro, rectos o circulares.",
    evidence: [evidence.usage],
    state: "approved",
    versionLabel: "prototype-candidate-2023"
  }),
  createKnowledgeUnit({
    type: "ingredient",
    subject: "ageloc-wellspa-io",
    topic: "ingredients",
    market: MARKET,
    language: LANGUAGE,
    content: "WellSpa iO se usa con tópicos que tienen fórmulas diferentes. Body Serum incluye, entre otros, glicerina, pantenol, alantoína, Camellia Sinensis, Caesalpinia Spinosa, ácido hialurónico/sus derivados, Lotus Corniculatus, Kappaphycus Alvarezii, Crithmum Maritimum y Oligopeptide-1; declara Benzyl Salicylate como alérgeno de fragancia. Body Activating Gel incluye, entre otros, glicerina, aloe, bisabolol, alantoína, pantenol, Withania Somnifera, Sodium PCA, extracto de arroz, Lotus Corniculatus, Schizandra Chinensis, Sodium Hyaluronate y Crithmum Maritimum; declara Benzyl Salicylate, Linalool y Limonene como alérgenos de fragancia.",
    evidence: [evidence.bodySerumIngredients, evidence.activatingGelIngredients],
    state: "approved",
    sensitive: true,
    versionLabel: "prototype-candidate-2023"
  }),
  createKnowledgeUnit({
    type: "warning",
    subject: "ageloc-wellspa-io",
    topic: "precautions",
    market: MARKET,
    language: LANGUAGE,
    content: "El dispositivo WellSpa iO no está diseñado ni pretende diagnosticar, tratar, curar o prevenir ninguna enfermedad, condición de la piel, daño o lesión física. Ante una condición médica o duda de seguridad, se aplica además la política transversal de Iris de llevar la ficha técnica al profesional correspondiente.",
    evidence: [evidence.precautions],
    state: "approved",
    sensitive: true,
    versionLabel: "prototype-candidate-2023"
  }),
  createKnowledgeUnit({
    type: "faq",
    subject: "ageloc-wellspa-io",
    topic: "faq.three-rs",
    market: MARKET,
    language: LANGUAGE,
    content: "Las tres R de WellSpa iO son Restablecer, Revitalizar y Recuperar; el documento las relaciona con bienestar general, apariencia física y recuperación.",
    evidence: [evidence.threeRs],
    state: "approved",
    versionLabel: "prototype-candidate-2023"
  }),
  createKnowledgeUnit({
    type: "faq",
    subject: "ageloc-wellspa-io",
    topic: "faq.max-time",
    market: MARKET,
    language: LANGUAGE,
    content: "El documento indica un máximo recomendado de hasta 5 minutos por zona corporal, al día.",
    evidence: [evidence.maxTime],
    state: "approved",
    versionLabel: "prototype-candidate-2023"
  })
]);

const packageMetadata = Object.freeze({
  packageId: "ageloc-wellspa-io-ar-prototype-v0",
  productSlug: "ageloc-wellspa-io",
  market: MARKET,
  language: LANGUAGE,
  sourceStatus: "owner-provided-candidate",
  approvalScope: "prototype-only",
  productionApproved: false,
  sourceContentSha256: "0d6a6d512d7ffa472908a92a5a81006461ec752d24174c39689bf526242fcf48",
  sourceVersion: SOURCE_VERSION,
  excludedStructuredPages: Object.freeze([2])
});

module.exports = { evidence, packageMetadata, units };
