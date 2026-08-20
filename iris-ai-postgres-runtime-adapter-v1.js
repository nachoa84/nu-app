"use strict";

class IrisAiPostgresRuntimeAdapterErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiPostgresRuntimeAdapterErrorV1";
  }
}

function assertMethodV1(target, method, label) {
  if (!target || typeof target[method] !== "function") {
    throw new IrisAiPostgresRuntimeAdapterErrorV1(
      `${label}.${method} requerido.`
    );
  }
}

function createIrisAiPostgresRuntimeAdaptersV1({
  store,
  config
} = {}) {
  if (!config || typeof config !== "object") {
    throw new IrisAiPostgresRuntimeAdapterErrorV1(
      "config requerido."
    );
  }

  assertMethodV1(store, "consumeUsage", "store");
  assertMethodV1(store, "reserveProviderBudget", "store");
  assertMethodV1(store, "finalizeProviderReservation", "store");
  assertMethodV1(store, "releaseProviderReservation", "store");
  assertMethodV1(store, "recordMetric", "store");

  const usageQuotaStore = Object.freeze({
    async consume({
      userScope,
      deviceScope = null,
      now = new Date()
    } = {}) {
      return store.consumeUsage({
        userScope,
        deviceScope,
        now,
        timeZone: config.budgetTimezone,
        userDailyLimit: config.userDailyLimit,
        deviceDailyLimit: config.deviceDailyLimit
      });
    }
  });

  const providerBudgetStore = Object.freeze({
    async reserve({
      now = new Date(),
      totalQuestionsInPeriod
    } = {}) {
      return store.reserveProviderBudget({
        now,
        timeZone: config.budgetTimezone,
        dailyLimit: config.providerGlobalDailyLimit,
        monthlyLimit: config.providerGlobalMonthlyLimit,
        maxEscalationPercent:
          config.maxProviderEscalationPercent,
        totalQuestionsInPeriod
      });
    },

    async finalize(reservationId) {
      return store.finalizeProviderReservation({
        reservationId
      });
    },

    async release(reservationId) {
      return store.releaseProviderReservation({
        reservationId
      });
    }
  });

  const metricsStore = Object.freeze({
    async record({ name, value = 1 } = {}) {
      return store.recordMetric({
        name,
        value
      });
    }
  });

  return Object.freeze({
    usageQuotaStore,
    providerBudgetStore,
    metricsStore
  });
}

module.exports = {
  IrisAiPostgresRuntimeAdapterErrorV1,
  createIrisAiPostgresRuntimeAdaptersV1
};
