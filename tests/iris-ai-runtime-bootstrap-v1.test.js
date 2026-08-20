"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  IrisAiRuntimeBootstrapErrorV1,
  createIrisAiRuntimeBootstrapV1
} = require("../iris-ai-runtime-bootstrap-v1");

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
    IRIS_AI_MAX_PROVIDER_ESCALATION_PERCENT: "10",
    IRIS_AI_BUDGET_TIMEZONE: "America/Argentina/Cordoba",
    IRIS_AI_METRICS_ENABLED: "true",
    ...overrides
  };
}

function fakePool() {
  return {
    connect() {
      throw new Error("connect no debe ejecutarse durante bootstrap");
    },
    query() {
      throw new Error("query no debe ejecutarse durante bootstrap");
    }
  };
}

test("AI apagada no construye runtime ni requiere PostgreSQL/config/secrets", () => {
  const secrets = {};
  Object.defineProperty(secrets, "GROQ_API_KEY", {
    get() {
      throw new Error("secret no debe leerse");
    }
  });

  const result = createIrisAiRuntimeBootstrapV1({
    pool: null,
    env: {},
    secrets
  });

  assert.deepEqual(result, {
    enabled: false,
    reason: "ai_disabled",
    config: null,
    providerName: null,
    orchestrator: null
  });
});

test("retrieval apagado bloquea construcción antes de PostgreSQL/config/provider", () => {
  const result = createIrisAiRuntimeBootstrapV1({
    pool: null,
    env: { IRIS_AI_ENABLED: "true" },
    secrets: null
  });

  assert.equal(result.enabled, false);
  assert.equal(result.reason, "retrieval_disabled");
  assert.equal(result.orchestrator, null);
});

test("runtime activo requiere pool PostgreSQL compartido", () => {
  assert.throws(
    () => createIrisAiRuntimeBootstrapV1({
      pool: null,
      env: activeEnv()
    }),
    error =>
      error instanceof IrisAiRuntimeBootstrapErrorV1 &&
      /PostgreSQL requerido/.test(error.message)
  );
});

test("emergency stop permite construir runtime bloqueado sin leer GROQ_API_KEY", () => {
  const secrets = {};
  Object.defineProperty(secrets, "GROQ_API_KEY", {
    get() {
      throw new Error("GROQ_API_KEY no debe leerse con emergency stop");
    }
  });

  let fetchCalls = 0;
  const result = createIrisAiRuntimeBootstrapV1({
    pool: fakePool(),
    env: activeEnv(),
    secrets,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch no autorizado");
    }
  });

  assert.equal(result.enabled, true);
  assert.equal(result.reason, "runtime_ready");
  assert.equal(result.providerName, "groq");
  assert.equal(typeof result.orchestrator?.answerQuestion, "function");
  assert.equal(fetchCalls, 0);
});

test("abrir provider exige límites globales antes de leer secretos", () => {
  const secrets = {};
  Object.defineProperty(secrets, "GROQ_API_KEY", {
    get() {
      throw new Error("secret no debe leerse antes de validar presupuesto");
    }
  });

  assert.throws(
    () => createIrisAiRuntimeBootstrapV1({
      pool: fakePool(),
      env: activeEnv({
        IRIS_AI_PROVIDER_EMERGENCY_STOP: "false"
      }),
      secrets
    }),
    error =>
      error instanceof IrisAiRuntimeBootstrapErrorV1 &&
      /IRIS_AI_PROVIDER_GLOBAL_DAILY_LIMIT/.test(error.message)
  );
});

test("provider abierto con presupuesto configurado sigue fail-closed sin GROQ_API_KEY", () => {
  assert.throws(
    () => createIrisAiRuntimeBootstrapV1({
      pool: fakePool(),
      env: activeEnv({
        IRIS_AI_PROVIDER_EMERGENCY_STOP: "false",
        IRIS_AI_PROVIDER_GLOBAL_DAILY_LIMIT: "3",
        IRIS_AI_PROVIDER_GLOBAL_MONTHLY_LIMIT: "10"
      }),
      secrets: {}
    }),
    /GROQ_API_KEY requerido/
  );
});
