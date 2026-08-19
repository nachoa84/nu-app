"use strict";

class IrisAiQuotaStoreErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiQuotaStoreErrorV1";
  }
}

function assertTimezoneV1(timeZone) {
  const value = String(timeZone || "").trim();
  if (!value) throw new IrisAiQuotaStoreErrorV1("Zona horaria requerida.");
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format(new Date());
  } catch {
    throw new IrisAiQuotaStoreErrorV1("Zona horaria inválida.");
  }
  return value;
}

function periodKeysV1(now, timeZone) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new IrisAiQuotaStoreErrorV1("Fecha inválida.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, month: `${parts.year}-${parts.month}` };
}

function assertLimitV1(value, name) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new IrisAiQuotaStoreErrorV1(`${name} inválido.`);
  }
  return value;
}

function createInMemoryIrisUsageQuotaStoreV1({ timeZone, userDailyLimit, deviceDailyLimit = null } = {}) {
  const safeTimezone = assertTimezoneV1(timeZone);
  const safeUserLimit = assertLimitV1(userDailyLimit, "userDailyLimit");
  const safeDeviceLimit = assertLimitV1(deviceDailyLimit, "deviceDailyLimit");
  const counts = new Map();

  function consume({ userScope, deviceScope = null, now = new Date() } = {}) {
    const userKey = String(userScope || "").trim();
    if (!userKey) throw new IrisAiQuotaStoreErrorV1("userScope requerido.");
    const { day } = periodKeysV1(now, safeTimezone);
    const userCounterKey = `user:${day}:${userKey}`;
    const deviceKey = deviceScope == null ? null : String(deviceScope).trim();
    if (safeDeviceLimit != null && !deviceKey) {
      throw new IrisAiQuotaStoreErrorV1("deviceScope requerido cuando existe límite de dispositivo.");
    }
    const deviceCounterKey = deviceKey ? `device:${day}:${deviceKey}` : null;
    const userUsed = counts.get(userCounterKey) || 0;
    const deviceUsed = deviceCounterKey ? (counts.get(deviceCounterKey) || 0) : 0;

    if (userUsed >= safeUserLimit) {
      return { allowed: false, reason: "user_usage_limit_exhausted" };
    }
    if (safeDeviceLimit != null && deviceUsed >= safeDeviceLimit) {
      return { allowed: false, reason: "device_usage_limit_exhausted" };
    }

    counts.set(userCounterKey, userUsed + 1);
    if (deviceCounterKey) counts.set(deviceCounterKey, deviceUsed + 1);
    return { allowed: true, reason: "usage_reserved" };
  }

  return Object.freeze({ consume });
}

function createInMemoryIrisProviderBudgetStoreV1({
  timeZone,
  dailyLimit,
  monthlyLimit,
  maxEscalationPercent
} = {}) {
  const safeTimezone = assertTimezoneV1(timeZone);
  const safeDailyLimit = assertLimitV1(dailyLimit, "dailyLimit");
  const safeMonthlyLimit = assertLimitV1(monthlyLimit, "monthlyLimit");
  if (!Number.isFinite(maxEscalationPercent) || maxEscalationPercent < 0 || maxEscalationPercent > 100) {
    throw new IrisAiQuotaStoreErrorV1("maxEscalationPercent inválido.");
  }

  const dailyCounts = new Map();
  const monthlyCounts = new Map();
  const reservations = new Map();
  let sequence = 0;

  function reserve({ now = new Date(), totalQuestionsInPeriod } = {}) {
    if (!Number.isSafeInteger(totalQuestionsInPeriod) || totalQuestionsInPeriod < 1) {
      throw new IrisAiQuotaStoreErrorV1("totalQuestionsInPeriod inválido.");
    }
    const { day, month } = periodKeysV1(now, safeTimezone);
    const dailyUsed = dailyCounts.get(day) || 0;
    const monthlyUsed = monthlyCounts.get(month) || 0;
    const nextEscalationPercent = ((monthlyUsed + 1) / totalQuestionsInPeriod) * 100;

    if (safeDailyLimit != null && dailyUsed >= safeDailyLimit) {
      return { reserved: false, reason: "provider_daily_budget_exhausted" };
    }
    if (safeMonthlyLimit != null && monthlyUsed >= safeMonthlyLimit) {
      return { reserved: false, reason: "provider_monthly_budget_exhausted" };
    }
    if (nextEscalationPercent > maxEscalationPercent) {
      return { reserved: false, reason: "provider_escalation_budget_exhausted" };
    }

    dailyCounts.set(day, dailyUsed + 1);
    monthlyCounts.set(month, monthlyUsed + 1);
    const reservationId = `r_${++sequence}`;
    reservations.set(reservationId, { state: "reserved", day, month });
    return { reserved: true, reason: "provider_budget_reserved", reservationId };
  }

  function finalize(reservationId) {
    const record = reservations.get(reservationId);
    if (!record || record.state !== "reserved") {
      throw new IrisAiQuotaStoreErrorV1("Reserva inválida o ya reconciliada.");
    }
    record.state = "finalized";
    return { finalized: true };
  }

  function release(reservationId) {
    const record = reservations.get(reservationId);
    if (!record || record.state !== "reserved") {
      throw new IrisAiQuotaStoreErrorV1("Reserva inválida o ya reconciliada.");
    }
    dailyCounts.set(record.day, Math.max(0, (dailyCounts.get(record.day) || 0) - 1));
    monthlyCounts.set(record.month, Math.max(0, (monthlyCounts.get(record.month) || 0) - 1));
    record.state = "released";
    return { released: true };
  }

  function snapshot({ now = new Date() } = {}) {
    const { day, month } = periodKeysV1(now, safeTimezone);
    return Object.freeze({
      dailyUsed: dailyCounts.get(day) || 0,
      monthlyUsed: monthlyCounts.get(month) || 0
    });
  }

  return Object.freeze({ reserve, finalize, release, snapshot });
}

module.exports = {
  IrisAiQuotaStoreErrorV1,
  createInMemoryIrisProviderBudgetStoreV1,
  createInMemoryIrisUsageQuotaStoreV1,
  periodKeysV1
};
