"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createIrisAiPolicyConfigV1 } = require("../iris-ai-policy-config-v1");
const {
  DECISIONS_V1,
  createEphemeralFragmentRefsV1,
  evaluateIrisAiPolicyV1
} = require("../iris-ai-policy-engine-v1");

function baseConfig(overrides = {}) {
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
    providerGlobalDailyLimit: 100,
    providerGlobalMonthlyLimit: 1000,
    maxProviderEscalationPercent: 20,
    budgetTimezone: "America/Argentina/Cordoba",
    metricsEnabled: false,
    ...overrides
  };
}

const mediumRetrieval = {
  authorized: true,
  fragmentCount: 1,
  scopeMatch: true,
  termCoverage: "medium",
  directAnswer: false,
  hasContradiction: false
};

const highRetrieval = {
  authorized: true,
  fragmentCount: 1,
  scopeMatch: true,
  termCoverage: "high",
  directAnswer: true,
  hasContradiction: false
};

test("defaults are fail-closed for provider escalation", () => {
  const config = createIrisAiPolicyConfigV1({});
  assert.equal(config.aiEnabled, false);
  assert.equal(config.provider, "noop");
  assert.equal(config.providerEmergencyStop, true);
  assert.equal(config.maxProviderEscalationPercent, 0);
});

test("invalid percentage is rejected", () => {
  assert.throws(
    () => createIrisAiPolicyConfigV1({ IRIS_AI_MAX_PROVIDER_ESCALATION_PERCENT: "101" }),
    /Porcentaje/
  );
});

test("general user usage limit stops processing independently of provider budget", () => {
  const result = evaluateIrisAiPolicyV1({
    config: baseConfig(),
    usageLimitState: { user: { available: false } },
    deterministicMatch: { usable: true }
  });
  assert.equal(result.decision, DECISIONS_V1.INSUFFICIENT);
  assert.equal(result.reason, "user_usage_limit_exhausted");
});

test("deterministic answer wins before provider checks", () => {
  const result = evaluateIrisAiPolicyV1({
    config: baseConfig({ providerEmergencyStop: true }),
    deterministicMatch: { usable: true },
    providerBudgetState: { daily: { available: false } }
  });
  assert.equal(result.decision, DECISIONS_V1.DETERMINISTIC);
  assert.equal(result.allowProvider, false);
});

test("verified cache wins before retrieval/provider", () => {
  const result = evaluateIrisAiPolicyV1({
    config: baseConfig({ providerEmergencyStop: true }),
    verifiedCacheMatch: { usable: true, valid: true }
  });
  assert.equal(result.decision, DECISIONS_V1.VERIFIED_CACHE);
});

test("high-confidence direct retrieval never needs provider", () => {
  const result = evaluateIrisAiPolicyV1({
    config: baseConfig({ providerEmergencyStop: true }),
    retrieval: highRetrieval,
    providerBudgetState: { daily: { available: false } }
  });
  assert.equal(result.decision, DECISIONS_V1.DIRECT_RETRIEVAL);
  assert.equal(result.reason, "retrieval_sufficient");
  assert.equal(result.allowProvider, false);
});

test("medium retrieval can safely fall back locally when provider is stopped", () => {
  const result = evaluateIrisAiPolicyV1({
    config: baseConfig({ providerEmergencyStop: true }),
    retrieval: mediumRetrieval
  });
  assert.equal(result.decision, DECISIONS_V1.DIRECT_RETRIEVAL);
  assert.equal(result.reason, "provider_blocked_local_fallback");
});

test("low-confidence retrieval remains insufficient when provider is blocked", () => {
  const result = evaluateIrisAiPolicyV1({
    config: baseConfig({ providerEmergencyStop: true }),
    retrieval: {
      authorized: true,
      fragmentCount: 1,
      scopeMatch: true,
      termCoverage: "low",
      directAnswer: false,
      hasContradiction: false
    }
  });
  assert.equal(result.decision, DECISIONS_V1.INSUFFICIENT);
  assert.equal(result.reason, "provider_emergency_stop");
});

test("provider assisted requires atomic reservation when required", () => {
  const blocked = evaluateIrisAiPolicyV1({
    config: baseConfig(),
    retrieval: mediumRetrieval,
    reservationState: { required: true, reserved: false }
  });
  assert.equal(blocked.decision, DECISIONS_V1.DIRECT_RETRIEVAL);
  assert.equal(blocked.allowProvider, false);

  const allowed = evaluateIrisAiPolicyV1({
    config: baseConfig(),
    retrieval: mediumRetrieval,
    reservationState: { required: true, reserved: true }
  });
  assert.equal(allowed.decision, DECISIONS_V1.PROVIDER_ASSISTED);
  assert.equal(allowed.allowProvider, true);
});

test("daily, monthly and escalation budgets block external calls without blocking local fallback", () => {
  for (const key of ["daily", "monthly", "escalationPercent"]) {
    const result = evaluateIrisAiPolicyV1({
      config: baseConfig(),
      retrieval: mediumRetrieval,
      providerBudgetState: { [key]: { available: false } }
    });
    assert.equal(result.decision, DECISIONS_V1.DIRECT_RETRIEVAL);
    assert.equal(result.allowProvider, false);
  }
});

test("no authorized context never calls provider", () => {
  const result = evaluateIrisAiPolicyV1({
    config: baseConfig(),
    retrieval: { authorized: false, fragmentCount: 0 }
  });
  assert.equal(result.decision, DECISIONS_V1.INSUFFICIENT);
  assert.equal(result.reason, "no_authorized_context");
  assert.equal(result.allowProvider, false);
});

test("ephemeral fragment refs exclude internal IDs from provider payload", () => {
  const { providerFragments, internalMap } = createEphemeralFragmentRefsV1([{
    documentKey: "doc_secret",
    documentFamilyKey: "family_secret",
    versionLabel: "v1",
    chunkIndex: 3,
    title: "Collagen Plus",
    content: "Contenido autorizado"
  }]);

  assert.deepEqual(providerFragments, [{
    ref: "frag_1",
    title: "Collagen Plus",
    versionLabel: "v1",
    content: "Contenido autorizado"
  }]);
  assert.equal(Object.prototype.hasOwnProperty.call(providerFragments[0], "documentKey"), false);
  assert.deepEqual(internalMap.get("frag_1"), {
    documentKey: "doc_secret",
    versionLabel: "v1",
    chunkIndex: 3
  });
});
