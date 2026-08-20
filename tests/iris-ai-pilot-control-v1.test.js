"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createIrisAiPilotControlV1,
  parseHashedAllowlistV1,
  parsePercentV1,
  sha256HexV1,
  stableBucketV1
} = require("../iris-ai-pilot-control-v1");

const USER_ID = "usr_pilot_example_123";
const USER_HASH = sha256HexV1(USER_ID);

function env(overrides = {}) {
  return {
    IRIS_AI_PILOT_ENABLED: "false",
    IRIS_AI_PILOT_EMERGENCY_STOP: "true",
    IRIS_AI_PILOT_PERCENT: "0",
    IRIS_AI_PILOT_ALLOWLIST_SHA256: "",
    ...overrides
  };
}

test("piloto queda apagado por defecto", () => {
  const pilot = createIrisAiPilotControlV1({ env: {} });
  assert.equal(pilot.status.enabled, false);
  assert.equal(pilot.status.emergencyStop, true);
  assert.equal(pilot.isEligible(USER_ID), false);
});

test("kill switch tiene prioridad absoluta", () => {
  const pilot = createIrisAiPilotControlV1({
    env: env({
      IRIS_AI_PILOT_ENABLED: "true",
      IRIS_AI_PILOT_EMERGENCY_STOP: "true",
      IRIS_AI_PILOT_PERCENT: "100",
      IRIS_AI_PILOT_ALLOWLIST_SHA256: USER_HASH
    })
  });
  assert.equal(pilot.isEligible(USER_ID), false);
});

test("allowlist usa hashes completos y nunca requiere userId en claro", () => {
  const pilot = createIrisAiPilotControlV1({
    env: env({
      IRIS_AI_PILOT_ENABLED: "true",
      IRIS_AI_PILOT_EMERGENCY_STOP: "false",
      IRIS_AI_PILOT_ALLOWLIST_SHA256: USER_HASH
    })
  });
  assert.equal(pilot.status.allowlistCount, 1);
  assert.equal(pilot.isEligible(USER_ID), true);
  assert.equal(pilot.isEligible("otro_usuario"), false);
  assert.equal(JSON.stringify(pilot.status).includes(USER_ID), false);
});

test("rollout 0 rechaza y 100 acepta de forma estable", () => {
  const closed = createIrisAiPilotControlV1({
    env: env({
      IRIS_AI_PILOT_ENABLED: "true",
      IRIS_AI_PILOT_EMERGENCY_STOP: "false",
      IRIS_AI_PILOT_PERCENT: "0"
    })
  });
  const open = createIrisAiPilotControlV1({
    env: env({
      IRIS_AI_PILOT_ENABLED: "true",
      IRIS_AI_PILOT_EMERGENCY_STOP: "false",
      IRIS_AI_PILOT_PERCENT: "100"
    })
  });
  assert.equal(closed.isEligible(USER_ID), false);
  assert.equal(open.isEligible(USER_ID), true);
  assert.equal(stableBucketV1(USER_HASH), stableBucketV1(USER_HASH));
});

test("porcentaje o allowlist inválidos fallan cerrado", () => {
  assert.equal(parsePercentV1("101"), null);
  assert.equal(parsePercentV1("1.5"), null);
  assert.equal(parseHashedAllowlistV1("raw-user-id"), null);

  const invalid = createIrisAiPilotControlV1({
    env: env({
      IRIS_AI_PILOT_ENABLED: "true",
      IRIS_AI_PILOT_EMERGENCY_STOP: "false",
      IRIS_AI_PILOT_PERCENT: "101"
    })
  });
  assert.equal(invalid.status.configValid, false);
  assert.equal(invalid.isEligible(USER_ID), false);
});
