"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertSafeProductionEnvironment,
  isBlockedReleasePublicPath,
  isPublishedEnvironment,
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
    "/pilot-qstash-product-routines-v1.js",
    "/qstash-notification-server-v1.js",
    "/qstash-routine-pilot-v1.js",
    "/qstash-main-rollout-v1.js",
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

test("detecta deployment publicado de Replit aunque NODE_ENV sea development", () => {
  assert.equal(
    isPublishedEnvironment({
      REPLIT_DEPLOYMENT: "1",
      NODE_ENV: "development"
    }),
    true
  );

  assert.equal(isPublishedEnvironment({ NODE_ENV: "production" }), true);
  assert.equal(isPublishedEnvironment({ NODE_ENV: "development" }), false);
});

test("development conserva flags de prueba fuera de deployment publicado", () => {
  assert.doesNotThrow(() =>
    assertSafeProductionEnvironment({
      NODE_ENV: "development",
      ENABLE_ADMIN_TEST_ROUTES: "true",
      IRIS_AI_CONTROLLED_EXECUTION: "true",
      PILOT_ENABLED: "true",
      PILOT_ADMIN_ROUTES_ENABLED: "true",
      IRIS_AI_PILOT_ENABLED: "true",
      QSTASH_ROUTINE_PILOT_ENABLED: "true"
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
      IRIS_AI_CONTROLLED_EXECUTION: "false",
      PILOT_ENABLED: "false",
      PILOT_ADMIN_ROUTES_ENABLED: "false",
      IRIS_AI_PILOT_ENABLED: "false",
      QSTASH_ROUTINE_PILOT_ENABLED: "false",
      QSTASH_ROUTINE_NOTIFICATIONS_ENABLED: "true"
    })
  );
});

test("primera salida rechaza activación accidental de funciones piloto", () => {
  for (const flag of [
    "PILOT_ENABLED",
    "PILOT_ADMIN_ROUTES_ENABLED",
    "IRIS_AI_PILOT_ENABLED",
    "QSTASH_ROUTINE_PILOT_ENABLED"
  ]) {
    assert.throws(
      () => assertSafeProductionEnvironment({
        REPLIT_DEPLOYMENT: "1",
        DATABASE_URL: "postgresql://example",
        [flag]: "true"
      }),
      new RegExp(flag)
    );
  }
});

test("deployment de Replit aplica guard estricto aunque NODE_ENV sea development", () => {
  assert.throws(
    () => assertSafeProductionEnvironment({
      REPLIT_DEPLOYMENT: "1",
      NODE_ENV: "development"
    }),
    /DATABASE_URL/
  );

  assert.throws(
    () => assertSafeProductionEnvironment({
      REPLIT_DEPLOYMENT: "1",
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://example",
      IRIS_AI_CONTROLLED_EXECUTION: "true"
    }),
    /IRIS_AI_CONTROLLED_EXECUTION/
  );

  assert.throws(
    () => assertSafeProductionEnvironment({
      REPLIT_DEPLOYMENT: "1",
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://example",
      IRIS_AI_TEST_ENVIRONMENT: "development"
    }),
    /IRIS_AI_TEST_ENVIRONMENT/
  );
});

test("health gate no consulta backend fuera de entorno publicado", async () => {
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

test("health gate se activa con REPLIT_DEPLOYMENT=1", async () => {
  let called = 0;
  const ok = await waitForHealthyBackend({
    env: {
      REPLIT_DEPLOYMENT: "1",
      NODE_ENV: "development",
      PORT: "5000"
    },
    fetchImpl: async url => {
      called += 1;
      assert.equal(url, "http://127.0.0.1:5000/api/health");
      return { ok: true, status: 200 };
    },
    timeoutMs: 100,
    intervalMs: 1
  });

  assert.equal(ok, true);
  assert.equal(called, 1);
});
