"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertSafeProductionEnvironment,
  isBlockedReleasePublicPath,
  waitForHealthyBackend
} = require("../release-entrypoint");

test("release guard bloquea directorios y módulos internos", () => {
  const blocked = [
    "/tests/example.test.js",
    "/scripts/release-static-audit.js",
    "/docs/internal.md",
    "/server.js",
    "/release-entrypoint.js",
    "/package.json",
    "/iris-ai-server-runtime-v1.js",
    "/iris-document-retrieval-store-v1.js",
    "/pilot-identity-store-v0.js",
    "/runtime-config-v113.js",
    "/internal.csv"
  ];

  for (const item of blocked) {
    assert.equal(isBlockedReleasePublicPath(item), true, item);
  }
});

test("release guard conserva assets públicos requeridos", () => {
  const allowed = [
    "/index.html",
    "/app.js",
    "/backend-client.js",
    "/service-worker.js",
    "/home-redesign-v1.css",
    "/iris-ai-client-escalation-v1.js",
    "/assets/custom/nu-write-v2.mp4",
    "/icons/nuapp-favicon-32.png"
  ];

  for (const item of allowed) {
    assert.equal(isBlockedReleasePublicPath(item), false, item);
  }
});

test("development conserva flags de prueba", () => {
  assert.doesNotThrow(() =>
    assertSafeProductionEnvironment({
      NODE_ENV: "development",
      ENABLE_ADMIN_TEST_ROUTES: "true",
      IRIS_AI_CONTROLLED_EXECUTION: "true"
    })
  );
});

test("production exige base y rechaza flags de prueba", () => {
  assert.throws(
    () => assertSafeProductionEnvironment({ NODE_ENV: "production" }),
    /DATABASE_URL/
  );

  assert.throws(
    () => assertSafeProductionEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://example",
      ENABLE_ADMIN_TEST_ROUTES: "true"
    }),
    /ENABLE_ADMIN_TEST_ROUTES/
  );

  assert.throws(
    () => assertSafeProductionEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://example",
      IRIS_AI_TEST_ENVIRONMENT: "development"
    }),
    /IRIS_AI_TEST_ENVIRONMENT/
  );

  assert.doesNotThrow(() =>
    assertSafeProductionEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://example",
      ENABLE_ADMIN_TEST_ROUTES: "false",
      ENABLE_DEMO_ROUTES: "false",
      IRIS_AI_CONTROLLED_EXECUTION: "false"
    })
  );
});

test("health gate no consulta backend fuera de production", async () => {
  let called = false;
  const ok = await waitForHealthyBackend({
    env: { NODE_ENV: "development" },
    fetchImpl: async () => {
      called = true;
      return { ok: true };
    }
  });

  assert.equal(ok, true);
  assert.equal(called, false);
});

test("health gate acepta backend saludable en production", async () => {
  const ok = await waitForHealthyBackend({
    env: { NODE_ENV: "production", PORT: "5000" },
    fetchImpl: async url => {
      assert.equal(url, "http://127.0.0.1:5000/api/health");
      return { ok: true, status: 200 };
    },
    timeoutMs: 100,
    intervalMs: 1
  });

  assert.equal(ok, true);
});
