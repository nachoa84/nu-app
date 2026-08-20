"use strict";

class IrisAiControlledExecutionErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiControlledExecutionErrorV1";
  }
}

const SYNTHETIC_SCOPE_PREFIX_V1 = "iris_test:";
const ALLOWED_INPUT_KEYS_V1 = new Set([
  "question",
  "language",
  "country",
  "category",
  "productSlug",
  "userScope",
  "deviceScope",
  "now"
]);

function enabledFlagV1(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function assertControlledEnvironmentV1(env = {}) {
  if (env.NODE_ENV !== "development") {
    throw new IrisAiControlledExecutionErrorV1(
      "La ejecución controlada requiere NODE_ENV=development."
    );
  }

  if (env.IRIS_AI_TEST_ENVIRONMENT !== "development") {
    throw new IrisAiControlledExecutionErrorV1(
      "La ejecución controlada requiere IRIS_AI_TEST_ENVIRONMENT=development."
    );
  }

  if (!enabledFlagV1(env.IRIS_AI_CONTROLLED_EXECUTION)) {
    throw new IrisAiControlledExecutionErrorV1(
      "IRIS_AI_CONTROLLED_EXECUTION debe habilitarse explícitamente."
    );
  }

  if (!enabledFlagV1(env.IRIS_AI_ENABLED)) {
    throw new IrisAiControlledExecutionErrorV1(
      "IRIS_AI_ENABLED debe habilitarse solo durante la prueba controlada."
    );
  }

  if (!enabledFlagV1(env.IRIS_RETRIEVAL_ENABLED)) {
    throw new IrisAiControlledExecutionErrorV1(
      "IRIS_RETRIEVAL_ENABLED debe habilitarse solo durante la prueba controlada."
    );
  }

  if (!enabledFlagV1(env.IRIS_AI_PROVIDER_EMERGENCY_STOP)) {
    throw new IrisAiControlledExecutionErrorV1(
      "El provider debe permanecer bloqueado por emergency stop."
    );
  }
}

function assertSyntheticScopeV1(value, label, required) {
  if (value == null && !required) return null;

  const normalized = String(value || "").trim();
  if (!normalized.startsWith(SYNTHETIC_SCOPE_PREFIX_V1)) {
    throw new IrisAiControlledExecutionErrorV1(
      `${label} debe usar scope sintético ${SYNTHETIC_SCOPE_PREFIX_V1}*.`
    );
  }

  return normalized;
}

function normalizeControlledInputV1(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new IrisAiControlledExecutionErrorV1(
      "input controlado inválido."
    );
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_INPUT_KEYS_V1.has(key)) {
      throw new IrisAiControlledExecutionErrorV1(
        `Campo no permitido en ejecución controlada: ${key}.`
      );
    }
  }

  return Object.freeze({
    question: input.question,
    language: input.language,
    country: input.country,
    category: input.category ?? null,
    productSlug: input.productSlug ?? null,
    userScope: assertSyntheticScopeV1(
      input.userScope,
      "userScope",
      true
    ),
    deviceScope: assertSyntheticScopeV1(
      input.deviceScope,
      "deviceScope",
      false
    ),
    now: input.now ?? new Date()
  });
}

async function runControlledIrisAiExecutionV1({
  serverRuntime,
  env = process.env,
  input
} = {}) {
  assertControlledEnvironmentV1(env);

  if (
    !serverRuntime ||
    serverRuntime.status?.enabled !== true ||
    typeof serverRuntime.orchestrator?.answerQuestion !== "function"
  ) {
    throw new IrisAiControlledExecutionErrorV1(
      "Runtime Iris AI no disponible para ejecución controlada."
    );
  }

  const normalized = normalizeControlledInputV1(input);

  return serverRuntime.orchestrator.answerQuestion(normalized);
}

module.exports = {
  ALLOWED_INPUT_KEYS_V1,
  IrisAiControlledExecutionErrorV1,
  SYNTHETIC_SCOPE_PREFIX_V1,
  assertControlledEnvironmentV1,
  normalizeControlledInputV1,
  runControlledIrisAiExecutionV1
};
