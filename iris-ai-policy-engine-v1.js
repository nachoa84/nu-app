"use strict";

const DECISIONS_V1 = Object.freeze({
  DETERMINISTIC: "deterministic",
  VERIFIED_CACHE: "verified_cache",
  DIRECT_RETRIEVAL: "direct_retrieval",
  PROVIDER_ASSISTED: "provider_assisted",
  INSUFFICIENT: "insufficient"
});

function createDecisionV1(decision, reason, confidence, allowProvider = false) {
  return Object.freeze({ decision, allowProvider, reason, confidence });
}

function isAvailableV1(state) {
  return state == null || state.available !== false;
}

function hasAuthorizedContextV1(retrieval) {
  return Boolean(retrieval && retrieval.authorized === true && Number(retrieval.fragmentCount) > 0);
}

function evaluateRetrievalConfidenceV1(retrieval = {}) {
  if (!hasAuthorizedContextV1(retrieval)) return "low";
  if (retrieval.hasContradiction === true) return "low";
  if (retrieval.directAnswer === true && retrieval.scopeMatch === true && retrieval.termCoverage === "high") return "high";
  if (retrieval.scopeMatch === true && ["high", "medium"].includes(retrieval.termCoverage)) return "medium";
  return "low";
}

function providerBarriersSatisfiedV1({ config, providerBudgetState = {}, reservationState = {} }) {
  if (!config?.aiEnabled) return { ok: false, reason: "ai_disabled" };
  if (!config?.provider || config.provider === "noop") return { ok: false, reason: "provider_unavailable" };
  if (!config?.model) return { ok: false, reason: "model_unconfigured" };
  if (config.providerEmergencyStop) return { ok: false, reason: "provider_emergency_stop" };
  if (!isAvailableV1(providerBudgetState.daily)) return { ok: false, reason: "provider_daily_budget_exhausted" };
  if (!isAvailableV1(providerBudgetState.monthly)) return { ok: false, reason: "provider_monthly_budget_exhausted" };
  if (!isAvailableV1(providerBudgetState.escalationPercent)) return { ok: false, reason: "provider_escalation_budget_exhausted" };
  if (reservationState.required === true && reservationState.reserved !== true) {
    return { ok: false, reason: "provider_budget_not_reserved" };
  }
  return { ok: true, reason: "provider_allowed" };
}

function evaluateIrisAiPolicyV1({
  config,
  usageLimitState = {},
  deterministicMatch = null,
  verifiedCacheMatch = null,
  retrieval = null,
  providerBudgetState = {},
  reservationState = {}
} = {}) {
  if (!config || typeof config !== "object") {
    throw new TypeError("config es requerido.");
  }

  if (!isAvailableV1(usageLimitState.user)) {
    return createDecisionV1(DECISIONS_V1.INSUFFICIENT, "user_usage_limit_exhausted", "low");
  }
  if (!isAvailableV1(usageLimitState.device)) {
    return createDecisionV1(DECISIONS_V1.INSUFFICIENT, "device_usage_limit_exhausted", "low");
  }

  if (deterministicMatch?.usable === true) {
    return createDecisionV1(DECISIONS_V1.DETERMINISTIC, "deterministic_match", "high");
  }

  if (verifiedCacheMatch?.usable === true && verifiedCacheMatch?.valid === true) {
    return createDecisionV1(DECISIONS_V1.VERIFIED_CACHE, "verified_cache_hit", "high");
  }

  const confidence = evaluateRetrievalConfidenceV1(retrieval || {});
  if (confidence === "high") {
    return createDecisionV1(DECISIONS_V1.DIRECT_RETRIEVAL, "retrieval_sufficient", "high");
  }

  if (!hasAuthorizedContextV1(retrieval)) {
    return createDecisionV1(DECISIONS_V1.INSUFFICIENT, "no_authorized_context", "low");
  }

  const barrier = providerBarriersSatisfiedV1({ config, providerBudgetState, reservationState });
  if (!barrier.ok) {
    if (confidence === "medium") {
      return createDecisionV1(DECISIONS_V1.DIRECT_RETRIEVAL, "provider_blocked_local_fallback", "medium");
    }
    return createDecisionV1(DECISIONS_V1.INSUFFICIENT, barrier.reason, "low");
  }

  return createDecisionV1(DECISIONS_V1.PROVIDER_ASSISTED, "provider_needed", confidence, true);
}

function createEphemeralFragmentRefsV1(fragments = []) {
  if (!Array.isArray(fragments)) throw new TypeError("fragments debe ser un array.");
  const providerFragments = [];
  const internalMap = new Map();

  fragments.forEach((fragment, index) => {
    const ref = `frag_${index + 1}`;
    providerFragments.push({
      ref,
      title: fragment?.title ?? null,
      versionLabel: fragment?.versionLabel ?? null,
      content: String(fragment?.content || "")
    });
    internalMap.set(ref, {
      documentKey: fragment?.documentKey,
      versionLabel: fragment?.versionLabel ?? null,
      chunkIndex: Number(fragment?.chunkIndex)
    });
  });

  return { providerFragments, internalMap };
}

module.exports = {
  DECISIONS_V1,
  createEphemeralFragmentRefsV1,
  evaluateIrisAiPolicyV1,
  evaluateRetrievalConfidenceV1,
  providerBarriersSatisfiedV1
};
