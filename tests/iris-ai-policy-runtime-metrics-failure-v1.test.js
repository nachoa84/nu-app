"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createIrisAiOrchestratorV1 } = require("../iris-ai-orchestrator-v1");
const { createIrisAiPolicyRuntimeV1 } = require("../iris-ai-policy-runtime-v1");
const {
  createInMemoryIrisProviderBudgetStoreV1,
  createInMemoryIrisUsageQuotaStoreV1
} = require("../iris-ai-quota-store-v1");

const TZ = "America/Argentina/Cordoba";
const NOW = new Date("2026-08-19T18:00:00Z");

function config() {
  return {
    aiEnabled: true,
    provider: "mock",
    model: "mock-model",
    providerEmergencyStop: false,
    maxInputTokens: 6000,
    maxOutputTokens: 800,
    timeoutMs: 5000,
    userDailyLimit: 5,
    deviceDailyLimit: null,
    providerGlobalDailyLimit: 10,
    providerGlobalMonthlyLimit: 100,
    maxProviderEscalationPercent: 100,
    budgetTimezone: TZ,
    metricsEnabled: true
  };
}

test("metrics store failure does not turn a valid provider response into an exception", async () => {
  const cfg = config();
  const policyRuntime = createIrisAiPolicyRuntimeV1({
    config: cfg,
    usageQuotaStore: createInMemoryIrisUsageQuotaStoreV1({
      timeZone: TZ,
      userDailyLimit: cfg.userDailyLimit
    }),
    providerBudgetStore: createInMemoryIrisProviderBudgetStoreV1({
      timeZone: TZ,
      dailyLimit: cfg.providerGlobalDailyLimit,
      monthlyLimit: cfg.providerGlobalMonthlyLimit,
      maxEscalationPercent: cfg.maxProviderEscalationPercent
    }),
    metricsStore: {
      record() {
        throw new Error("metrics unavailable");
      }
    }
  });

  const orchestrator = createIrisAiOrchestratorV1({
    retrieveDocumentChunks: async () => [{
      documentKey: "doc_internal_1",
      versionLabel: "v1",
      chunkIndex: 0,
      title: "Collagen Plus",
      content: "Contenido autorizado."
    }],
    provider: {
      name: "mock",
      async generate() {
        return {
          status: "ok",
          answer: "Respuesta autorizada.",
          citations: [{ ref: "frag_1" }]
        };
      }
    },
    env: { IRIS_AI_ENABLED: "true" },
    policyRuntime
  });

  const result = await orchestrator.answerQuestion({
    question: "colágeno",
    language: "es",
    country: "US",
    userScope: "u_hash_1",
    now: NOW
  });

  assert.equal(result.status, "ok");
  assert.equal(result.answer, "Respuesta autorizada.");
});
