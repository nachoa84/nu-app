"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  controlledPilotBypassV1,
  createIrisAiUserRouteV1
} = require("../iris-ai-user-route-v1");

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

function runtimeWithCounter(counter) {
  return {
    status: { enabled: true },
    orchestrator: {
      async answerQuestion() {
        counter.calls += 1;
        return {
          status: "ok",
          classification: "deterministic",
          answer: "ok",
          citations: []
        };
      }
    }
  };
}

const request = {
  ip: "203.0.113.10",
  body: {
    question: "consulta piloto",
    userId: "usr_pilot_route_v1",
    country: "AR",
    language: "es"
  }
};

test("piloto apagado devuelve 404 antes de tocar runtime", async () => {
  const counter = { calls: 0 };
  const route = createIrisAiUserRouteV1({
    env: {
      IRIS_AI_USER_ROUTE_ENABLED: "true"
    },
    runtime: runtimeWithCounter(counter)
  });
  const res = responseRecorder();
  await route(request, res);
  assert.equal(res.statusCode, 404);
  assert.equal(counter.calls, 0);
});

test("kill switch devuelve 404 incluso con rollout 100", async () => {
  const counter = { calls: 0 };
  const route = createIrisAiUserRouteV1({
    env: {
      IRIS_AI_USER_ROUTE_ENABLED: "true",
      IRIS_AI_PILOT_ENABLED: "true",
      IRIS_AI_PILOT_EMERGENCY_STOP: "true",
      IRIS_AI_PILOT_PERCENT: "100"
    },
    runtime: runtimeWithCounter(counter)
  });
  const res = responseRecorder();
  await route(request, res);
  assert.equal(res.statusCode, 404);
  assert.equal(counter.calls, 0);
});

test("rollout 100 permite llegar al runtime solo con kill switch abierto", async () => {
  const counter = { calls: 0 };
  const route = createIrisAiUserRouteV1({
    env: {
      IRIS_AI_USER_ROUTE_ENABLED: "true",
      IRIS_AI_PILOT_ENABLED: "true",
      IRIS_AI_PILOT_EMERGENCY_STOP: "false",
      IRIS_AI_PILOT_PERCENT: "100"
    },
    runtime: runtimeWithCounter(counter)
  });
  const res = responseRecorder();
  await route(request, res);
  assert.equal(res.statusCode, 200);
  assert.equal(counter.calls, 1);
});

test("bypass controlado exige las tres condiciones exactas", () => {
  assert.equal(controlledPilotBypassV1({}), false);
  assert.equal(controlledPilotBypassV1({
    NODE_ENV: "production",
    IRIS_AI_TEST_ENVIRONMENT: "development",
    IRIS_AI_CONTROLLED_EXECUTION: "true"
  }), false);
  assert.equal(controlledPilotBypassV1({
    NODE_ENV: "development",
    IRIS_AI_TEST_ENVIRONMENT: "development",
    IRIS_AI_CONTROLLED_EXECUTION: "true"
  }), true);
});
