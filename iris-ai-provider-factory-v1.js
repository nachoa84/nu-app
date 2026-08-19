"use strict";

const { createNoopIrisAiProviderV1 } = require("./iris-ai-provider-v1");
const {
  MAX_GROQ_OUTPUT_TOKENS_V1,
  createGroqIrisAiProviderV1
} = require("./iris-ai-groq-provider-v1");

class IrisAiProviderFactoryErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiProviderFactoryErrorV1";
  }
}

function requireConfigV1(config) {
  if (!config || typeof config !== "object") {
    throw new IrisAiProviderFactoryErrorV1("config requerido.");
  }
  return config;
}

function createBlockedProviderV1(name, reason) {
  return Object.freeze({
    name,
    async generate() {
      return Object.freeze({
        status: "blocked",
        reason,
        answer: null,
        citations: []
      });
    }
  });
}

function createConfiguredIrisAiProviderV1({
  config,
  secrets = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const safeConfig = requireConfigV1(config);
  const providerName = String(safeConfig.provider || "").trim().toLowerCase();

  if (!providerName) {
    throw new IrisAiProviderFactoryErrorV1("provider requerido.");
  }

  if (providerName === "noop") {
    return createNoopIrisAiProviderV1();
  }

  if (providerName !== "groq") {
    throw new IrisAiProviderFactoryErrorV1("provider no soportado.");
  }

  if (safeConfig.aiEnabled !== true) {
    return createNoopIrisAiProviderV1();
  }

  if (safeConfig.providerEmergencyStop === true) {
    return createBlockedProviderV1("groq", "provider_emergency_stop");
  }

  const model = String(safeConfig.model || "").trim();
  if (!model) {
    throw new IrisAiProviderFactoryErrorV1("IRIS_AI_MODEL requerido para Groq.");
  }

  const maxOutputTokens = Number(safeConfig.maxOutputTokens);
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > MAX_GROQ_OUTPUT_TOKENS_V1) {
    throw new IrisAiProviderFactoryErrorV1(
      `IRIS_AI_MAX_OUTPUT_TOKENS debe estar entre 1 y ${MAX_GROQ_OUTPUT_TOKENS_V1} para Groq.`
    );
  }

  const apiKey = typeof secrets?.GROQ_API_KEY === "string"
    ? secrets.GROQ_API_KEY.trim()
    : "";
  if (!apiKey) {
    throw new IrisAiProviderFactoryErrorV1("GROQ_API_KEY requerido para activar Groq.");
  }

  return createGroqIrisAiProviderV1({
    apiKey,
    model,
    maxOutputTokens,
    fetchImpl
  });
}

module.exports = {
  IrisAiProviderFactoryErrorV1,
  createBlockedProviderV1,
  createConfiguredIrisAiProviderV1
};
