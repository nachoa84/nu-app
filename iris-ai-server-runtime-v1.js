"use strict";

const {
  createIrisAiRuntimeBootstrapV1
} = require("./iris-ai-runtime-bootstrap-v1");

class IrisAiServerRuntimeErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiServerRuntimeErrorV1";
  }
}

function safeRuntimeStatusV1(result) {
  return Object.freeze({
    enabled: result?.enabled === true,
    reason: String(result?.reason || "unknown"),
    providerName:
      typeof result?.providerName === "string"
        ? result.providerName
        : null
  });
}

function initializeIrisAiServerRuntimeV1({
  pool,
  env = process.env,
  secrets = process.env,
  fetchImpl = globalThis.fetch,
  logError = () => {},
  bootstrapFactory = createIrisAiRuntimeBootstrapV1
} = {}) {
  if (typeof bootstrapFactory !== "function") {
    throw new IrisAiServerRuntimeErrorV1(
      "bootstrapFactory debe ser una función."
    );
  }

  if (typeof logError !== "function") {
    throw new IrisAiServerRuntimeErrorV1(
      "logError debe ser una función."
    );
  }

  const result = bootstrapFactory({
    pool,
    env,
    secrets,
    fetchImpl,
    logError
  });

  if (!result || typeof result !== "object") {
    throw new IrisAiServerRuntimeErrorV1(
      "Bootstrap Iris AI inválido."
    );
  }

  return Object.freeze({
    status: safeRuntimeStatusV1(result),
    orchestrator:
      result.enabled === true
        ? result.orchestrator
        : null
  });
}

module.exports = {
  IrisAiServerRuntimeErrorV1,
  initializeIrisAiServerRuntimeV1,
  safeRuntimeStatusV1
};
