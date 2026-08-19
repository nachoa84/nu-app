"use strict";

const {
  DECISIONS_V1,
  evaluateIrisAiPolicyV1
} = require("./iris-ai-policy-engine-v1");
const { periodKeysV1 } = require("./iris-ai-quota-store-v1");

class IrisAiPolicyRuntimeErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiPolicyRuntimeErrorV1";
  }
}

function assertMethodV1(target, method, label) {
  if (!target || typeof target[method] !== "function") {
    throw new IrisAiPolicyRuntimeErrorV1(`${label}.${method} requerido.`);
  }
}

function createIrisAiPolicyRuntimeV1({
  config,
  usageQuotaStore,
  providerBudgetStore,
  metricsStore
} = {}) {
  if (!config || typeof config !== "object") {
    throw new IrisAiPolicyRuntimeErrorV1("config requerido.");
  }
  assertMethodV1(usageQuotaStore, "consume", "usageQuotaStore");
  assertMethodV1(providerBudgetStore, "reserve", "providerBudgetStore");
  assertMethodV1(providerBudgetStore, "finalize", "providerBudgetStore");
  assertMethodV1(providerBudgetStore, "release", "providerBudgetStore");
  if (config.metricsEnabled) {
    assertMethodV1(metricsStore, "record", "metricsStore");
  }

  const monthlyQuestionCounts = new Map();

  function metric(name, value = 1) {
    if (!config.metricsEnabled) return;
    metricsStore.record({ name, value });
  }

  function beginQuestion({ userScope, deviceScope = null, now = new Date() } = {}) {
    const usage = usageQuotaStore.consume({ userScope, deviceScope, now });
    if (!usage.allowed) {
      return Object.freeze({ allowed: false, reason: usage.reason, totalQuestionsInPeriod: 0 });
    }

    const { month } = periodKeysV1(now, config.budgetTimezone);
    const totalQuestionsInPeriod = (monthlyQuestionCounts.get(month) || 0) + 1;
    monthlyQuestionCounts.set(month, totalQuestionsInPeriod);
    metric("questions_total");

    return Object.freeze({
      allowed: true,
      reason: usage.reason,
      totalQuestionsInPeriod
    });
  }

  function authorizeProviderCall({ retrieval, totalQuestionsInPeriod, now = new Date() } = {}) {
    const preflight = evaluateIrisAiPolicyV1({
      config,
      retrieval,
      providerBudgetState: {
        daily: { available: true },
        monthly: { available: true },
        escalationPercent: { available: true }
      },
      reservationState: { reserved: true }
    });

    if (preflight.decision !== DECISIONS_V1.PROVIDER_ASSISTED || preflight.allowProvider !== true) {
      metric("response_insufficient");
      return Object.freeze({
        allowed: false,
        reason: preflight.reason,
        decision: preflight.decision,
        reservationId: null
      });
    }

    const reservation = providerBudgetStore.reserve({ now, totalQuestionsInPeriod });
    if (!reservation.reserved) {
      metric("provider_quota_blocked");
      metric("response_insufficient");
      return Object.freeze({
        allowed: false,
        reason: reservation.reason,
        decision: DECISIONS_V1.INSUFFICIENT,
        reservationId: null
      });
    }

    metric("budget_reservations_created");

    const finalDecision = evaluateIrisAiPolicyV1({
      config,
      retrieval,
      providerBudgetState: {
        daily: { available: true },
        monthly: { available: true },
        escalationPercent: { available: true }
      },
      reservationState: { reserved: true }
    });

    if (finalDecision.decision !== DECISIONS_V1.PROVIDER_ASSISTED || finalDecision.allowProvider !== true) {
      providerBudgetStore.release(reservation.reservationId);
      metric("budget_reservations_released");
      metric("response_insufficient");
      return Object.freeze({
        allowed: false,
        reason: finalDecision.reason,
        decision: finalDecision.decision,
        reservationId: null
      });
    }

    return Object.freeze({
      allowed: true,
      reason: finalDecision.reason,
      decision: finalDecision.decision,
      reservationId: reservation.reservationId
    });
  }

  function completeProviderCall({ reservationId, started, outcome = "ok" } = {}) {
    if (!reservationId) {
      throw new IrisAiPolicyRuntimeErrorV1("reservationId requerido.");
    }

    if (started === true) {
      providerBudgetStore.finalize(reservationId);
      metric("budget_reservations_finalized");
      metric("provider_calls");
      if (outcome === "error") metric("provider_errors");
      if (outcome === "429") metric("provider_429");
      return Object.freeze({ finalized: true, released: false });
    }

    providerBudgetStore.release(reservationId);
    metric("budget_reservations_released");
    return Object.freeze({ finalized: false, released: true });
  }

  function recordResponse(kind) {
    const metricByKind = {
      deterministic: "response_deterministic",
      verified_cache: "response_verified_cache",
      direct_retrieval: "response_direct_retrieval",
      provider_assisted: "response_provider_assisted",
      insufficient: "response_insufficient"
    };
    const name = metricByKind[kind];
    if (name) metric(name);
  }

  return Object.freeze({
    beginQuestion,
    authorizeProviderCall,
    completeProviderCall,
    recordResponse
  });
}

module.exports = {
  IrisAiPolicyRuntimeErrorV1,
  createIrisAiPolicyRuntimeV1
};
