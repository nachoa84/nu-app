"use strict";

const {
  createNaturalIntentMatcherV1
} = require("./iris-ai-natural-intent-matcher-v1");

const COLLAGEN_INTENTS_V1 = Object.freeze({
  usage: Object.freeze({
    phrases: Object.freeze([
      "como se toma",
      "como tomar",
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
      Object.freeze(["tomar", "tomo", "consumir", "consumo", "usar", "uso", "preparar", "preparo"]),
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
      "mujer embarazada",
      "mujeres embarazadas",
      "estoy embarazada",
      "durante el embarazo",
      "en el embarazo",
      "si estoy embarazada",
      "si esta embarazada",
      "pueden tomarlo las embarazadas",
      "pueden tomar las embarazadas",
      "apto para embarazadas",
      "embarazo"
    ]),
    all: Object.freeze([
      Object.freeze(["embarazada", "embarazadas", "embarazo"]),
      Object.freeze(["tomar", "tomarlo", "consumir", "consumirlo", "usar", "apto", "puede", "pueden"])
    ])
  }),

  lactation_warning: Object.freeze({
    phrases: Object.freeze([
      "lactancia",
      "dando de mamar",
      "dar de mamar",
      "estoy amamantando",
      "esta amamantando",
      "mujer que amamanta",
      "mujeres que amamantan",
      "periodo de lactancia"
    ]),
    all: Object.freeze([
      Object.freeze(["amamanta", "amamantando", "lactancia"]),
      Object.freeze(["tomar", "tomarlo", "consumir", "usar", "puede", "pueden", "apto"])
    ])
  }),

  children_warning: Object.freeze({
    phrases: Object.freeze([
      "lo pueden tomar los ninos",
      "pueden tomarlo los ninos",
      "pueden tomar los ninos",
      "apto para ninos",
      "para ninos",
      "en ninos",
      "menores de edad"
    ]),
    all: Object.freeze([
      Object.freeze(["nino", "ninos", "menor", "menores"]),
      Object.freeze(["tomar", "tomarlo", "consumir", "usar", "puede", "pueden", "apto"])
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
      "sin gluten"
    ]),
    all: Object.freeze([
      Object.freeze(["trigo", "gluten"]),
      Object.freeze(["contiene", "tiene", "libre", "sin", "derivados"])
    ])
  })
});

const matchCollagenIntentV1 = createNaturalIntentMatcherV1(COLLAGEN_INTENTS_V1);

module.exports = {
  COLLAGEN_INTENTS_V1,
  matchCollagenIntentV1
};
