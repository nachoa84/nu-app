"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  IrisAiProviderFactoryErrorV1,
  createConfiguredIrisAiProviderV1
} = require("../iris-ai-provider-factory-v1");

function baseConfig(overrides = {}) {
  return {
    aiEnabled: false,
    provider: "groq",
    model: "openai/gpt-oss-20b",
    providerEmergencyStop: true,
    maxOutputTokens: 800,
    ...overrides
  };
}

test("Groq config stays noop while AI is disabled", () => {
  const provider = createConfiguredIrisAiProviderV1({ config: baseConfig(), secrets: {} });
  assert.equal(provider.name, "noop");
});

test("emergency stop preserves Groq identity without requiring secret or network", async () => {
  let fetchCalls = 0;
  const provider = createConfiguredIrisAiProviderV1({
    config: baseConfig({ aiEnabled: true }),
    secrets: {},
    fetchImpl: async () => { fetchCalls += 1; throw new Error("should not run"); }
  });
  assert.equal(provider.name, "groq");
  const result = await provider.generate();
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "provider_emergency_stop");
  assert.equal(fetchCalls, 0);
});

test("explicit noop provider never requires Groq secret", () => {
  const provider = createConfiguredIrisAiProviderV1({
    config: baseConfig({ provider: "noop", aiEnabled: true, providerEmergencyStop: false }),
    secrets: {}
  });
  assert.equal(provider.name, "noop");
});

test("unsupported provider fails closed", () => {
  assert.throws(
    () => createConfiguredIrisAiProviderV1({
      config: baseConfig({ provider: "unknown", aiEnabled: true, providerEmergencyStop: false }),
      secrets: {}
    }),
    IrisAiProviderFactoryErrorV1
  );
});

test("Groq activation requires model and secret", () => {
  assert.throws(
    () => createConfiguredIrisAiProviderV1({
      config: baseConfig({ aiEnabled: true, providerEmergencyStop: false, model: "" }),
      secrets: { GROQ_API_KEY: "synthetic-test-key" }
    }),
    /IRIS_AI_MODEL requerido/
  );

  assert.throws(
    () => createConfiguredIrisAiProviderV1({
      config: baseConfig({ aiEnabled: true, providerEmergencyStop: false }),
      secrets: {}
    }),
    /GROQ_API_KEY requerido/
  );
});

test("Groq activation rejects output limit above adapter cap", () => {
  assert.throws(
    () => createConfiguredIrisAiProviderV1({
      config: baseConfig({ aiEnabled: true, providerEmergencyStop: false, maxOutputTokens: 4097 }),
      secrets: { GROQ_API_KEY: "synthetic-test-key" }
    }),
    /entre 1 y 4096/
  );
});

test("valid Groq activation constructs provider without making HTTP request", () => {
  let fetchCalls = 0;
  const provider = createConfiguredIrisAiProviderV1({
    config: baseConfig({ aiEnabled: true, providerEmergencyStop: false }),
    secrets: { GROQ_API_KEY: "synthetic-test-key" },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("should not run during construction");
    }
  });

  assert.equal(provider.name, "groq");
  assert.equal(fetchCalls, 0);
});
