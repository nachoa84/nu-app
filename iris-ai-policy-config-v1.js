"use strict";

class IrisAiPolicyConfigErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiPolicyConfigErrorV1";
  }
}

function parseBooleanV1(value, fallback) {
  if (value == null || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new IrisAiPolicyConfigErrorV1("Configuración booleana inválida.");
}

function parseIntegerV1(value, { fallback, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || value === "") return fallback;
  if (!/^\d+$/.test(String(value))) {
    throw new IrisAiPolicyConfigErrorV1("Configuración numérica inválida.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new IrisAiPolicyConfigErrorV1("Configuración numérica fuera de rango.");
  }
  return parsed;
}

function parsePercentV1(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new IrisAiPolicyConfigErrorV1("Porcentaje de escalamiento inválido.");
  }
  return parsed;
}

function firstConfiguredV1(primary, legacy) {
  if (primary != null && primary !== "") return primary;
  return legacy;
}

function createIrisAiPolicyConfigV1(env = process.env) {
  const provider = String(env.IRIS_AI_PROVIDER || "noop").trim().toLowerCase();
  const model = String(env.IRIS_AI_MODEL || "").trim();
  const budgetTimezone = String(env.IRIS_AI_BUDGET_TIMEZONE || "").trim();

  if (!provider) throw new IrisAiPolicyConfigErrorV1("Provider vacío.");
  if (!budgetTimezone) throw new IrisAiPolicyConfigErrorV1("Zona horaria de presupuesto requerida.");

  const legacyUserDailyLimit = parseIntegerV1(env.IRIS_AI_USER_DAILY_LIMIT, { fallback: 5, min: 1, max: 10000 });
  const legacyDeviceDailyLimit = parseIntegerV1(env.IRIS_AI_DEVICE_DAILY_LIMIT, { fallback: null, min: 1, max: 10000 });

  return Object.freeze({
    aiEnabled: parseBooleanV1(env.IRIS_AI_ENABLED, false),
    provider,
    model,
    providerEmergencyStop: parseBooleanV1(env.IRIS_AI_PROVIDER_EMERGENCY_STOP, true),
    maxInputTokens: parseIntegerV1(env.IRIS_AI_MAX_INPUT_TOKENS, { fallback: 6000, min: 1, max: 1000000 }),
    maxOutputTokens: parseIntegerV1(env.IRIS_AI_MAX_OUTPUT_TOKENS, { fallback: 800, min: 1, max: 100000 }),
    timeoutMs: parseIntegerV1(env.IRIS_AI_TIMEOUT_MS, { fallback: 5000, min: 100, max: 120000 }),

    // Campos legacy conservados para compatibilidad con adaptadores/tests V1.
    // El runtime nuevo no los usa para bloquear retrieval local.
    userDailyLimit: legacyUserDailyLimit,
    deviceDailyLimit: legacyDeviceDailyLimit,

    // Cuotas por usuario/dispositivo exclusivamente para llamadas reales al provider.
    // Si las nuevas variables no existen, heredamos los valores legacy para no
    // debilitar la protección existente al desplegar esta separación.
    providerUserDailyLimit: parseIntegerV1(
      firstConfiguredV1(env.IRIS_AI_PROVIDER_USER_DAILY_LIMIT, env.IRIS_AI_USER_DAILY_LIMIT),
      { fallback: 5, min: 1, max: 10000 }
    ),
    providerDeviceDailyLimit: parseIntegerV1(
      firstConfiguredV1(env.IRIS_AI_PROVIDER_DEVICE_DAILY_LIMIT, env.IRIS_AI_DEVICE_DAILY_LIMIT),
      { fallback: null, min: 1, max: 10000 }
    ),

    providerGlobalDailyLimit: parseIntegerV1(env.IRIS_AI_PROVIDER_GLOBAL_DAILY_LIMIT, { fallback: null, min: 1, max: 10000000 }),
    providerGlobalMonthlyLimit: parseIntegerV1(env.IRIS_AI_PROVIDER_GLOBAL_MONTHLY_LIMIT, { fallback: null, min: 1, max: 100000000 }),
    maxProviderEscalationPercent: parsePercentV1(env.IRIS_AI_MAX_PROVIDER_ESCALATION_PERCENT, 0),
    budgetTimezone,
    metricsEnabled: parseBooleanV1(env.IRIS_AI_METRICS_ENABLED, false)
  });
}

module.exports = {
  IrisAiPolicyConfigErrorV1,
  createIrisAiPolicyConfigV1,
  firstConfiguredV1
};
