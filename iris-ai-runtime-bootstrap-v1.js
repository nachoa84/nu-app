"use strict";

const {
  createIrisAiPolicyConfigV1
} = require("./iris-ai-policy-config-v1");
const {
  createConfiguredIrisAiProviderV1
} = require("./iris-ai-provider-factory-v1");
const {
  createPostgresIrisAiStoreV1
} = require("./iris-ai-postgres-store-v1");
const {
  createIrisAiPostgresRuntimeAdaptersV1
} = require("./iris-ai-postgres-runtime-adapter-v1");
const {
  createIrisAiPolicyRuntimeV1
} = require("./iris-ai-policy-runtime-v1");
const {
  createIrisDocumentRetrievalStoreV1
} = require("./iris-document-retrieval-store-v1");
const {
  createIrisAiLocalResponseEngineV1
} = require("./iris-ai-local-response-v1");
const {
  createConservativeDirectRetrievalAssessorV1
} = require("./iris-ai-direct-retrieval-assessor-v1");
const {
  createCollagenGroundedRetrievalResolverV1
} = require("./iris-ai-collagen-grounded-response-v1");
const {
  createCollagenRetrievalScopeResolverV1
} = require("./iris-ai-collagen-retrieval-scope-v1");
const {
  createIrisAiOrchestratorV1
} = require("./iris-ai-orchestrator-v1");

class IrisAiRuntimeBootstrapErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiRuntimeBootstrapErrorV1";
  }
}

function enabledFlagV1(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function assertPoolV1(pool) {
  if (
    !pool ||
    typeof pool.connect !== "function" ||
    typeof pool.query !== "function"
  ) {
    throw new IrisAiRuntimeBootstrapErrorV1(
      "PostgreSQL requerido para activar Iris AI runtime."
    );
  }
}

function assertProviderBudgetConfigV1(config) {
  if (
    config.provider === "noop" ||
    config.providerEmergencyStop === true
  ) {
    return;
  }

  for (const [label, value] of [
    ["IRIS_AI_PROVIDER_GLOBAL_DAILY_LIMIT", config.providerGlobalDailyLimit],
    ["IRIS_AI_PROVIDER_GLOBAL_MONTHLY_LIMIT", config.providerGlobalMonthlyLimit]
  ]) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new IrisAiRuntimeBootstrapErrorV1(
        `${label} requerido antes de habilitar llamadas al provider.`
      );
    }
  }
}

function disabledBootstrapV1(reason) {
  return Object.freeze({
    enabled: false,
    reason,
    config: null,
    providerName: null,
    orchestrator: null
  });
}

function createIrisAiRuntimeBootstrapV1({
  pool,
  env = process.env,
  secrets = process.env,
  fetchImpl = globalThis.fetch,
  logError = () => {}
} = {}) {
  if (!enabledFlagV1(env?.IRIS_AI_ENABLED)) {
    return disabledBootstrapV1("ai_disabled");
  }

  if (!enabledFlagV1(env?.IRIS_RETRIEVAL_ENABLED)) {
    return disabledBootstrapV1("retrieval_disabled");
  }

  if (typeof logError !== "function") {
    throw new IrisAiRuntimeBootstrapErrorV1(
      "logError debe ser una función."
    );
  }

  assertPoolV1(pool);

  const config = createIrisAiPolicyConfigV1(env);

  if (config.aiEnabled !== true) {
    return disabledBootstrapV1("ai_disabled");
  }

  assertProviderBudgetConfigV1(config);

  const persistenceStore = createPostgresIrisAiStoreV1({
    pool,
    logError
  });

  const adapters = createIrisAiPostgresRuntimeAdaptersV1({
    store: persistenceStore,
    config
  });

  const policyRuntime = createIrisAiPolicyRuntimeV1({
    config,
    usageQuotaStore: adapters.usageQuotaStore,
    providerBudgetStore: adapters.providerBudgetStore,
    metricsStore: adapters.metricsStore
  });

  const retrievalStore = createIrisDocumentRetrievalStoreV1({
    pool,
    logError
  });

  const directRetrievalEnabled =
    enabledFlagV1(env?.IRIS_AI_DIRECT_RETRIEVAL_ENABLED);
  const collagenGroundedEnabled =
    enabledFlagV1(env?.IRIS_AI_COLLAGEN_LOCAL_GROUNDED_ENABLED);

  const localResponseEngine =
    createIrisAiLocalResponseEngineV1({
      retrievalAssessor: directRetrievalEnabled
        ? createConservativeDirectRetrievalAssessorV1()
        : undefined,
      groundedRetrievalResolver: collagenGroundedEnabled
        ? createCollagenGroundedRetrievalResolverV1()
        : null
    });

  const provider = createConfiguredIrisAiProviderV1({
    config,
    secrets,
    fetchImpl
  });

  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks:
      retrievalStore.retrieveDocumentChunks,
    provider,
    env,
    timeoutMs: config.timeoutMs,
    policyRuntime,
    localResponseEngine,
    resolveRetrievalScope: collagenGroundedEnabled
      ? createCollagenRetrievalScopeResolverV1()
      : null
  });

  return Object.freeze({
    enabled: true,
    reason: "runtime_ready",
    config,
    providerName: provider.name,
    orchestrator
  });
}

module.exports = {
  IrisAiRuntimeBootstrapErrorV1,
  assertProviderBudgetConfigV1,
  createIrisAiRuntimeBootstrapV1,
  enabledFlagV1
};
