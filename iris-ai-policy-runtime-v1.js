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
  metricsStore,
  separatedQuotaStore = null
} = {}) {
  if (!config || typeof config !== "object") {
    throw new IrisAiPolicyRuntimeErrorV1("config requerido.");
  }

  const separatedQuotasEnabled = separatedQuotaStore != null;

  if (separatedQuotasEnabled) {
    assertMethodV1(separatedQuotaStore, "recordQuestion", "separatedQuotaStore");
    assertMethodV1(separatedQuotaStore, "consumeProviderUsage", "separatedQuotaStore");
  } else {
    assertMethodV1(usageQuotaStore, "consume", "usageQuotaStore");
  }

  assertMethodV1(providerBudgetStore, "reserve", "providerBudgetStore");
  assertMethodV1(providerBudgetStore, "finalize", "providerBudgetStore");
  assertMethodV1(providerBudgetStore, "release", "providerBudgetStore");
  if (config.metricsEnabled) {
    assertMethodV1(metricsStore, "record", "metricsStore");
  }

  const monthlyQuestionCounts = new Map();

  async function metric(name, value = 1) {
    if (!config.metricsEnabled) return false;
    try {
      await metricsStore.record({ name, value });
      return true;
    } catch {
      return false;
    }
  }

  async function beginQuestion({ userScope, deviceScope = null, now = new Date() } = {}) {
    let usage;

    if (separatedQuotasEnabled) {
      usage = await separatedQuotaStore.recordQuestion({ now });
    } else {
      usage = await usageQuotaStore.consume({ userScope, deviceScope, now });
    }

    if (!usage.allowed) {
      return Object.freeze({ allowed: false, reason: usage.reason, totalQuestionsInPeriod: 0 });
    }

    let totalQuestionsInPeriod;

    if (
      Number.isSafeInteger(usage.totalQuestionsInPeriod) &&
      usage.totalQuestionsInPeriod >= 1
    ) {
      totalQuestionsInPeriod = usage.totalQuestionsInPeriod;
    } else {
      const { month } = periodKeysV1(
        now,
        config.budgetTimezone
      );
      totalQuestionsInPeriod =
        (monthlyQuestionCounts.get(month) || 0) + 1;
      monthlyQuestionCounts.set(
        month,
        totalQuestionsInPeriod
      );
    }

    await metric("questions_total");

    return Object.freeze({
      allowed: true,
      reason: usage.reason,
      totalQuestionsInPeriod
    });
  }

  function decideLocal({ deterministicMatch = null, verifiedCacheMatch = null, retrieval = null } = {}) {
    return evaluateIrisAiPolicyV1({
      config,
      deterministicMatch,
      verifiedCacheMatch,
      retrieval,
      providerBudgetState: {},
      reservationState: {}
    });
  }

  async function authorizeProviderCall({
    retrieval,
    totalQuestionsInPeriod,
    userScope = null,
    deviceScope = null,
    now = new Date()
  } = {}) {
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
      return Object.freeze({
        allowed: false,
        reason: preflight.reason,
        decision: preflight.decision,
        reservationId: null
      });
    }

    const reservation = await providerBudgetStore.reserve({ now, totalQuestionsInPeriod });
    if (!reservation.reserved) {
      await metric("provider_quota_blocked");
      return Object.freeze({
        allowed: false,
        reason: reservation.reason,
        decision: DECISIONS_V1.INSUFFICIENT,
        reservationId: null
      });
    }

    await metric("budget_reservations_created");

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
      await providerBudgetStore.release(reservation.reservationId);
      await metric("budget_reservations_released");
      return Object.freeze({
        allowed: false,
        reason: finalDecision.reason,
        decision: finalDecision.decision,
        reservationId: null
      });
    }

    if (separatedQuotasEnabled) {
      let providerUsage;
      try {
        providerUsage = await separatedQuotaStore.consumeProviderUsage({
          userScope,
          deviceScope,
          now
        });
      } catch (error) {
        await providerBudgetStore.release(reservation.reservationId);
        await metric("budget_reservations_released");
        throw error;
      }

      if (!providerUsage?.allowed) {
        await providerBudgetStore.release(reservation.reservationId);
        await metric("budget_reservations_released");
        await metric("provider_quota_blocked");
        return Object.freeze({
          allowed: false,
          reason: providerUsage?.reason || "provider_usage_limit_exhausted",
          decision: DECISIONS_V1.INSUFFICIENT,
          reservationId: null
        });
      }
    }

    return Object.freeze({
      allowed: true,
      reason: finalDecision.reason,
      decision: finalDecision.decision,
      reservationId: reservation.reservationId
    });
  }

  async function completeProviderCall({ reservationId, started, outcome = "ok" } = {}) {
    if (!reservationId) {
      throw new IrisAiPolicyRuntimeErrorV1("reservationId requerido.");
    }

    if (started === true) {
      await providerBudgetStore.finalize(reservationId);
      await metric("budget_reservations_finalized");
      await metric("provider_calls");
      if (outcome === "error") await metric("provider_errors");
      if (outcome === "429") await metric("provider_429");
      return Object.freeze({ finalized: true, released: false });
    }

    await providerBudgetStore.release(reservationId);
    await metric("budget_reservations_released");
    return Object.freeze({ finalized: false, released: true });
  }

  async function recordResponse(kind) {
    const metricByKind = {
      deterministic: "response_deterministic",
      verified_cache: "response_verified_cache",
      direct_retrieval: "response_direct_retrieval",
      provider_assisted: "response_provider_assisted",
      insufficient: "response_insufficient"
    };
    const name = metricByKind[kind];
    if (name) await metric(name);
  }

  return Object.freeze({
    providerName: config.provider,
    beginQuestion,
    decideLocal,
    authorizeProviderCall,
    completeProviderCall,
    recordResponse
  });
}

module.exports = {
  IrisAiPolicyRuntimeErrorV1,
  createIrisAiPolicyRuntimeV1
};
