"use strict";

const {
  createNaturalIntentMatcherV1
} = require("./iris-ai-natural-intent-matcher-v1");

const COLLAGEN_PRODUCT_SLUG_V1 = "beauty-focus-collagen-plus";

const COLLAGEN_INTENTS_V1 = Object.freeze({
  usage: Object.freeze({
    phrases: Object.freeze([
      "como se toma",
      "como tomar",
      "como tomarlo",
      "como tengo que tomarlo",
      "como debo tomarlo",
      "como lo tengo que tomar",
      "como lo debo tomar",
      "de que manera lo tomo",
      "de que manera se toma",
      "como se usa",
      "modo de uso",
      "forma de uso",
      "forma de consumo",
      "instrucciones de consumo",
      "como se consume",
      "como consumir",
      "como se prepara",
      "como prepararlo",
      "como preparo",
      "con cuanta agua",
      "cuanta agua",
      "cada cuanto se toma",
      "cuantas veces al dia"
    ]),
    all: Object.freeze([
      Object.freeze(["tomar", "tomarlo", "tomo", "consumir", "consumo", "usar", "uso", "preparar", "preparo"]),
      Object.freeze(["collagen", "colageno", "producto", "medida", "agua"])
    ])
  }),

  collagen_amount: Object.freeze({
    phrases: Object.freeze([
      "cuanto collagen",
      "cuanto colageno",
      "cantidad de collagen",
      "cantidad de colageno",
      "cuantos mg de collagen",
      "cuantos mg de colageno",
      "cuantos miligramos de collagen",
      "cuantos miligramos de colageno",
      "que cantidad de collagen",
      "que cantidad de colageno",
      "cuanto aporta de collagen",
      "cuanto aporta de colageno",
      "dosis de collagen",
      "dosis de colageno"
    ]),
    all: Object.freeze([
      Object.freeze(["cuanto", "cantidad", "mg", "miligramos", "aporta", "dosis"]),
      Object.freeze(["collagen", "colageno"])
    ])
  }),

  lutein_amount: Object.freeze({
    phrases: Object.freeze([
      "cuanta luteina",
      "cantidad de luteina",
      "cuantos mg de luteina",
      "cuantos miligramos de luteina",
      "que cantidad de luteina",
      "cuanto aporta de luteina",
      "dosis de luteina"
    ]),
    all: Object.freeze([
      Object.freeze(["cuanto", "cuanta", "cantidad", "mg", "miligramos", "aporta", "dosis"]),
      Object.freeze(["luteina"])
    ])
  }),

  pregnancy_warning: Object.freeze({
    phrases: Object.freeze([
      "estoy embarazada",
      "si estoy embarazada",
      "si esta embarazada",
      "pueden tomarlo las embarazadas",
      "pueden tomar las embarazadas",
      "lo pueden tomar las mujeres embarazadas",
      "puedo tomarlo embarazada",
      "puedo tomarlo durante el embarazo",
      "se puede tomar durante el embarazo",
      "es apto durante el embarazo",
      "apto para embarazadas"
    ]),
    all: Object.freeze([
      Object.freeze(["embarazada", "embarazadas", "embarazo"]),
      Object.freeze(["tomar", "tomarlo", "consumir", "consumirlo", "usar", "apto", "puede", "pueden"])
    ])
  }),

  lactation_warning: Object.freeze({
    phrases: Object.freeze([
      "dando de mamar",
      "dar de mamar",
      "estoy amamantando",
      "esta amamantando",
      "puedo tomarlo si estoy dando de mamar",
      "puedo tomarlo durante la lactancia",
      "se puede tomar durante la lactancia",
      "es apto durante la lactancia",
      "mujer que amamanta puede consumirlo",
      "mujeres que amamantan pueden consumirlo"
    ]),
    all: Object.freeze([
      Object.freeze(["amamanta", "amamantan", "amamantando", "lactancia"]),
      Object.freeze(["tomar", "tomarlo", "consumir", "consumirlo", "usar", "puede", "pueden", "apto"])
    ])
  }),

  children_warning: Object.freeze({
    phrases: Object.freeze([
      "lo pueden tomar los ninos",
      "pueden tomarlo los ninos",
      "pueden tomar los ninos",
      "apto para ninos",
      "menores de edad pueden tomarlo"
    ]),
    all: Object.freeze([
      Object.freeze(["nino", "ninos", "menor", "menores"]),
      Object.freeze(["tomar", "tomarlo", "consumir", "consumirlo", "usar", "puede", "pueden", "apto"])
    ])
  }),

  wheat_warning: Object.freeze({
    phrases: Object.freeze([
      "contiene trigo",
      "tiene trigo",
      "derivados de trigo",
      "contiene gluten",
      "tiene gluten",
      "es libre de gluten",
      "libre de gluten",
      "sin gluten"
    ]),
    all: Object.freeze([
      Object.freeze(["trigo", "gluten"]),
      Object.freeze(["contiene", "tiene", "libre", "sin", "derivados"])
    ])
  })
});

const COLLAGEN_RETRIEVAL_HINTS_V1 = Object.freeze({
  usage: Object.freeze(["instrucciones de consumo"]),
  collagen_amount: Object.freeze(["colageno 2500 mg"]),
  lutein_amount: Object.freeze(["luteina 5 mg"]),
  pregnancy_warning: Object.freeze(["embarazo lactancia niños"]),
  lactation_warning: Object.freeze(["embarazo lactancia niños"]),
  children_warning: Object.freeze(["embarazo lactancia niños"]),
  wheat_warning: Object.freeze(["derivados de trigo"])
});

const matchCollagenIntentV1 = createNaturalIntentMatcherV1(COLLAGEN_INTENTS_V1);

function getCollagenRetrievalHintsV1(input = {}) {
  const productSlug = String(input.productSlug || "").trim();
  if (productSlug !== COLLAGEN_PRODUCT_SLUG_V1) return [];

  const intent = matchCollagenIntentV1(input.question);
  if (!intent) return [];

  return COLLAGEN_RETRIEVAL_HINTS_V1[intent] || [];
}

module.exports = {
  COLLAGEN_INTENTS_V1,
  COLLAGEN_PRODUCT_SLUG_V1,
  COLLAGEN_RETRIEVAL_HINTS_V1,
  getCollagenRetrievalHintsV1,
  matchCollagenIntentV1
};
