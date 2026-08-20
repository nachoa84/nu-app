"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  IrisAiServerRuntimeErrorV1,
  initializeIrisAiServerRuntimeV1,
  safeRuntimeStatusV1
} = require("../iris-ai-server-runtime-v1");

function fakePool() {
  return {
    connect() {
      throw new Error("connect no debe ejecutarse durante inicialización");
    },
    query() {
      throw new Error("query no debe ejecutarse durante inicialización");
    }
  };
}

function activeEnv(overrides = {}) {
  return {
    IRIS_AI_ENABLED: "true",
    IRIS_RETRIEVAL_ENABLED: "true",
    IRIS_AI_PROVIDER: "groq",
    IRIS_AI_MODEL: "openai/gpt-oss-20b",
    IRIS_AI_PROVIDER_EMERGENCY_STOP: "true",
    IRIS_AI_MAX_INPUT_TOKENS: "6000",
    IRIS_AI_MAX_OUTPUT_TOKENS: "400",
    IRIS_AI_TIMEOUT_MS: "5000",
    IRIS_AI_USER_DAILY_LIMIT: "5",
    IRIS_AI_PROVIDER_GLOBAL_DAILY_LIMIT: "3",
    IRIS_AI_PROVIDER_GLOBAL_MONTHLY_LIMIT: "10",
    IRIS_AI_MAX_PROVIDER_ESCALATION_PERCENT: "10",
    IRIS_AI_BUDGET_TIMEZONE: "America/Argentina/Cordoba",
    IRIS_AI_METRICS_ENABLED: "true",
    ...overrides
  };
}

test("AI apagada devuelve runtime de servidor inactivo sin tocar DB ni secretos", () => {
  const secrets = {};
  Object.defineProperty(secrets, "GROQ_API_KEY", {
    get() {
      throw new Error("secret no debe leerse");
    }
  });

  const runtime = initializeIrisAiServerRuntimeV1({
    pool: null,
    env: {},
    secrets
  });

  assert.deepEqual(runtime.status, {
    enabled: false,
    reason: "ai_disabled",
    providerName: null
  });
  assert.equal(runtime.orchestrator, null);
});

test("retrieval apagado mantiene runtime de servidor inactivo", () => {
  const runtime = initializeIrisAiServerRuntimeV1({
    pool: null,
    env: { IRIS_AI_ENABLED: "true" },
    secrets: null
  });

  assert.deepEqual(runtime.status, {
    enabled: false,
    reason: "retrieval_disabled",
    providerName: null
  });
  assert.equal(runtime.orchestrator, null);
});

test("emergency stop permite preparar runtime sin red ni conexión DB en construcción", () => {
  const secrets = {};
  Object.defineProperty(secrets, "GROQ_API_KEY", {
    get() {
      throw new Error("secret no debe leerse con emergency stop");
    }
  });

  let fetchCalls = 0;
  const runtime = initializeIrisAiServerRuntimeV1({
    pool: fakePool(),
    env: activeEnv(),
    secrets,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch no autorizado");
    }
  });

  assert.deepEqual(runtime.status, {
    enabled: true,
    reason: "runtime_ready",
    providerName: "groq"
  });
  assert.equal(typeof runtime.orchestrator?.answerQuestion, "function");
  assert.equal(fetchCalls, 0);
});

test("estado seguro no expone config, secretos ni orchestrator", () => {
  const status = safeRuntimeStatusV1({
    enabled: true,
    reason: "runtime_ready",
    providerName: "groq",
    config: { secret: "no" },
    orchestrator: { answerQuestion() {} },
    apiKey: "no"
  });

  assert.deepEqual(status, {
    enabled: true,
    reason: "runtime_ready",
    providerName: "groq"
  });
  assert.deepEqual(Object.keys(status), [
    "enabled",
    "reason",
    "providerName"
  ]);
});

test("bootstrap inválido falla cerrado", () => {
  assert.throws(
    () => initializeIrisAiServerRuntimeV1({
      bootstrapFactory: () => null
    }),
    error =>
      error instanceof IrisAiServerRuntimeErrorV1 &&
      /Bootstrap Iris AI inválido/.test(error.message)
  );
});
