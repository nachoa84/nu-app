"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DB_POOL_MAX_DEFAULT_V113,
  DB_POOL_MAX_LIMIT_V113,
  databasePoolOptionsV113,
  legacySchedulerEnabledV1
} = require("../runtime-config-v113");

test("scheduler legacy permanece habilitado sin configuración", () => {
  assert.equal(
    legacySchedulerEnabledV1({}),
    true
  );
});

test("scheduler legacy sólo se desactiva con false explícito", () => {
  assert.equal(
    legacySchedulerEnabledV1({
      LEGACY_SCHEDULER_ENABLED: "false"
    }),
    false
  );

  assert.equal(
    legacySchedulerEnabledV1({
      LEGACY_SCHEDULER_ENABLED: " FALSE "
    }),
    false
  );

  assert.equal(
    legacySchedulerEnabledV1({
      LEGACY_SCHEDULER_ENABLED: "true"
    }),
    true
  );

  assert.equal(
    legacySchedulerEnabledV1({
      LEGACY_SCHEDULER_ENABLED: "0"
    }),
    true
  );

  assert.equal(
    legacySchedulerEnabledV1({
      LEGACY_SCHEDULER_ENABLED: ""
    }),
    true
  );
});

test("el pool usa límites seguros por defecto", () => {
  const options = databasePoolOptionsV113("postgres://example", {});
  assert.equal(options.max, DB_POOL_MAX_DEFAULT_V113);
  assert.equal(options.idleTimeoutMillis, 30000);
  assert.equal(options.connectionTimeoutMillis, 5000);
});

test("el máximo del pool es configurable pero queda acotado", () => {
  assert.equal(
    databasePoolOptionsV113("postgres://example", { DB_POOL_MAX: "32" }).max,
    32
  );
  assert.equal(
    databasePoolOptionsV113("postgres://example", { DB_POOL_MAX: "500" }).max,
    DB_POOL_MAX_LIMIT_V113
  );
  assert.equal(
    databasePoolOptionsV113("postgres://example", { DB_POOL_MAX: "1" }).max,
    5
  );
});

test("sin DATABASE_URL no se crean opciones de pool", () => {
  assert.equal(databasePoolOptionsV113("", {}), null);
});

test("todas las rutas administrativas de prueba exigen habilitación", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8"
  );
  const routes = [
    "/api/admin/schedule-auto-test-latest",
    "/api/admin/scheduler-run",
    "/api/admin/push-test-latest"
  ];
  for (const route of routes) {
    const start = source.indexOf(`"${route}"`);
    assert.notEqual(start, -1, `falta ${route}`);
    const section = source.slice(start, start + 450);
    assert.match(
      section,
      /assertAdminTestRoutesEnabled\(\)/,
      `${route} no está protegida por ENABLE_ADMIN_TEST_ROUTES`
    );
    assert.match(section, /assertAdminTestToken\(req\)/);
  }
});

test("el token administrativo conserva comparación de tiempo constante", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8"
  );
  const start = source.indexOf("function assertAdminTestToken");
  const section = source.slice(start, start + 1200);
  assert.match(section, /crypto\.timingSafeEqual/);
});
