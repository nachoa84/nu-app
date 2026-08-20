"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  IrisAiControlledExecutionErrorV1,
  assertControlledEnvironmentV1,
  normalizeControlledInputV1,
  runControlledIrisAiExecutionV1
} = require("../iris-ai-controlled-execution-v1");

function controlledEnv(overrides = {}) {
  return {
    NODE_ENV: "development",
    IRIS_AI_TEST_ENVIRONMENT: "development",
    IRIS_AI_CONTROLLED_EXECUTION: "true",
    IRIS_AI_ENABLED: "true",
    IRIS_RETRIEVAL_ENABLED: "true",
    IRIS_AI_PROVIDER_EMERGENCY_STOP: "true",
    ...overrides
  };
}

function readyRuntime(answerQuestion = async () => ({
  status: "fallback",
  reason: "no_authorized_context",
  answer: "No tengo información autorizada suficiente para responder eso.",
  citations: []
})) {
  return {
    status: {
      enabled: true,
      reason: "runtime_ready",
      providerName: "groq"
    },
    orchestrator: {
      answerQuestion
    }
  };
}

test("ejecución controlada exige development explícito", () => {
  assert.throws(
    () => assertControlledEnvironmentV1(
      controlledEnv({ NODE_ENV: "production" })
    ),
    error =>
      error instanceof IrisAiControlledExecutionErrorV1 &&
      /NODE_ENV=development/.test(error.message)
  );
});

test("ejecución controlada exige bandera dedicada", () => {
  assert.throws(
    () => assertControlledEnvironmentV1(
      controlledEnv({ IRIS_AI_CONTROLLED_EXECUTION: "false" })
    ),
    /IRIS_AI_CONTROLLED_EXECUTION/
  );
});

test("ejecución controlada exige AI y retrieval habilitados solo para la prueba", () => {
  assert.throws(
    () => assertControlledEnvironmentV1(
      controlledEnv({ IRIS_AI_ENABLED: "false" })
    ),
    /IRIS_AI_ENABLED/
  );

  assert.throws(
    () => assertControlledEnvironmentV1(
      controlledEnv({ IRIS_RETRIEVAL_ENABLED: "false" })
    ),
    /IRIS_RETRIEVAL_ENABLED/
  );
});

test("ejecución controlada nunca permite abrir el provider", () => {
  assert.throws(
    () => assertControlledEnvironmentV1(
      controlledEnv({ IRIS_AI_PROVIDER_EMERGENCY_STOP: "false" })
    ),
    /emergency stop/
  );
});

test("input controlado rechaza scopes no sintéticos y campos extra", () => {
  assert.throws(
    () => normalizeControlledInputV1({
      question: "consulta",
      language: "es",
      country: "US",
      userScope: "user_real"
    }),
    /scope sintético/
  );

  assert.throws(
    () => normalizeControlledInputV1({
      question: "consulta",
      language: "es",
      country: "US",
      userScope: "iris_test:user_1",
      email: "no-permitido@example.com"
    }),
    /Campo no permitido/
  );
});

test("input controlado normaliza solo el contrato mínimo permitido", () => {
  const input = normalizeControlledInputV1({
    question: "consulta sintética",
    language: "es",
    country: "US",
    userScope: "iris_test:user_1",
    deviceScope: "iris_test:device_1",
    productSlug: "synthetic-product"
  });

  assert.deepEqual(
    Object.keys(input),
    [
      "question",
      "language",
      "country",
      "category",
      "productSlug",
      "userScope",
      "deviceScope",
      "now"
    ]
  );
  assert.equal(input.userScope, "iris_test:user_1");
  assert.equal(input.deviceScope, "iris_test:device_1");
});

test("runner no ejecuta orchestrator si runtime no está listo", async () => {
  let calls = 0;

  await assert.rejects(
    runControlledIrisAiExecutionV1({
      serverRuntime: {
        status: { enabled: false },
        orchestrator: {
          async answerQuestion() {
            calls += 1;
          }
        }
      },
      env: controlledEnv(),
      input: {
        question: "consulta",
        language: "es",
        country: "US",
        userScope: "iris_test:user_1"
      }
    }),
    /Runtime Iris AI no disponible/
  );

  assert.equal(calls, 0);
});

test("runner ejecuta una sola vez con contrato controlado", async () => {
  const received = [];
  const expected = {
    status: "fallback",
    reason: "no_authorized_context",
    answer: "No tengo información autorizada suficiente para responder eso.",
    citations: []
  };

  const result = await runControlledIrisAiExecutionV1({
    serverRuntime: readyRuntime(async input => {
      received.push(input);
      return expected;
    }),
    env: controlledEnv(),
    input: {
      question: "consulta sintética",
      language: "es",
      country: "US",
      userScope: "iris_test:user_1"
    }
  });

  assert.equal(received.length, 1);
  assert.equal(received[0].userScope, "iris_test:user_1");
  assert.deepEqual(result, expected);
});
