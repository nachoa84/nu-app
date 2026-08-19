"use strict";

const ALLOWED_METRIC_NAMES_V1 = new Set([
  "questions_total",
  "response_deterministic",
  "response_verified_cache",
  "response_direct_retrieval",
  "response_provider_assisted",
  "response_insufficient",
  "provider_calls",
  "provider_input_tokens",
  "provider_output_tokens",
  "provider_cost_microusd",
  "provider_errors",
  "provider_429",
  "provider_quota_blocked",
  "budget_reservations_created",
  "budget_reservations_finalized",
  "budget_reservations_released",
  "latency_ms_total"
]);

class IrisAiMetricsStoreErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiMetricsStoreErrorV1";
  }
}

function createInMemoryIrisMetricsStoreV1() {
  const counters = new Map();

  function increment(name, value = 1) {
    if (!ALLOWED_METRIC_NAMES_V1.has(name)) {
      throw new IrisAiMetricsStoreErrorV1("Métrica no permitida.");
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new IrisAiMetricsStoreErrorV1("Valor de métrica inválido.");
    }
    counters.set(name, (counters.get(name) || 0) + value);
  }

  function record(event = {}) {
    const forbiddenKeys = [
      "question",
      "answer",
      "prompt",
      "content",
      "userId",
      "deviceId",
      "ip",
      "documentKey",
      "documentFamilyKey",
      "storageKey"
    ];
    for (const key of forbiddenKeys) {
      if (Object.prototype.hasOwnProperty.call(event, key)) {
        throw new IrisAiMetricsStoreErrorV1("El evento contiene datos no permitidos.");
      }
    }
    const name = String(event.name || "");
    increment(name, event.value == null ? 1 : event.value);
  }

  function snapshot() {
    return Object.freeze(Object.fromEntries(counters));
  }

  return Object.freeze({ increment, record, snapshot });
}

module.exports = {
  ALLOWED_METRIC_NAMES_V1,
  IrisAiMetricsStoreErrorV1,
  createInMemoryIrisMetricsStoreV1
};
