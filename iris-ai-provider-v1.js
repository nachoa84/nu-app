"use strict";

class IrisAiProviderErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiProviderErrorV1";
  }
}

function createNoopIrisAiProviderV1() {
  return {
    name: "noop",
    async generate() {
      return {
        status: "noop",
        answer: null,
        citations: []
      };
    }
  };
}

function assertIrisAiProviderV1(provider) {
  if (!provider || typeof provider.generate !== "function") {
    throw new IrisAiProviderErrorV1(
      "Se requiere un provider Iris AI válido."
    );
  }
  return provider;
}

module.exports = {
  IrisAiProviderErrorV1,
  assertIrisAiProviderV1,
  createNoopIrisAiProviderV1
};
