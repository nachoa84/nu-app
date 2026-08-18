"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serverPath = path.join(__dirname, "server.js");
const serverSource = fs.readFileSync(serverPath, "utf8");

test("servidor define y lee variables de configuracion V0 con fallbacks desactivados", () => {
  assert.match(serverSource, /const PILOT_ENABLED =\s*String\(\s*process\.env\.PILOT_ENABLED \|\|\s*""\s*\)\.toLowerCase\(\) === "true";/);
  assert.match(serverSource, /const PILOT_ADMIN_ROUTES_ENABLED =\s*String\(\s*process\.env\.PILOT_ADMIN_ROUTES_ENABLED \|\|\s*""\s*\)\.toLowerCase\(\) === "true";/);
  assert.match(serverSource, /const PILOT_INVITATION_HMAC_KEY =\s*process\.env\.PILOT_INVITATION_HMAC_KEY \|\| "";/);
  assert.match(serverSource, /const PILOT_TOKEN_HMAC_KEY =\s*process\.env\.PILOT_TOKEN_HMAC_KEY \|\| "";/);
  assert.match(serverSource, /const PILOT_ADMIN_TOKEN =\s*process\.env\.PILOT_ADMIN_TOKEN \|\| "";/);
  assert.match(serverSource, /const PILOT_ADMIN_KEY_ID =\s*process\.env\.PILOT_ADMIN_KEY_ID \|\| "";/);
});

test("404 del piloto antes del control de Origin y orden real de middlewares", () => {
  const expressJsonPos = serverSource.indexOf('express.json(');
  const gatekeeperPilotPos = serverSource.indexOf('app.use(\n  "/api/pilot"');
  const gatekeeperAdminPos = serverSource.indexOf('app.use(\n  "/api/pilot-admin"');
  const assertOriginPos = serverSource.indexOf('app.use(\n  "/api",\n  assertAllowedWriteOrigin\n);');
  const pilotRoutesPos = serverSource.indexOf('app.use(pilotRoutes);');
  const staticPos = serverSource.indexOf('express.static(');
  const errorHandlerPos = serverSource.indexOf('(error, req, res, next) => {');

  assert.notEqual(expressJsonPos, -1, "falta express.json");
  assert.notEqual(gatekeeperPilotPos, -1, "falta gatekeeper /api/pilot");
  assert.notEqual(gatekeeperAdminPos, -1, "falta gatekeeper /api/pilot-admin");
  assert.notEqual(assertOriginPos, -1, "falta assertAllowedWriteOrigin");
  assert.notEqual(pilotRoutesPos, -1, "falta montaje de pilotRoutes");
  assert.notEqual(staticPos, -1, "falta express.static");
  assert.notEqual(errorHandlerPos, -1, "falta error handler");

  assert.ok(expressJsonPos < gatekeeperPilotPos, "express.json debe estar antes de los gatekeepers");
  assert.ok(gatekeeperPilotPos < assertOriginPos, "gatekeeper /api/pilot debe estar antes de assertAllowedWriteOrigin");
  assert.ok(gatekeeperAdminPos < assertOriginPos, "gatekeeper /api/pilot-admin debe estar antes de assertAllowedWriteOrigin");
  assert.ok(assertOriginPos < pilotRoutesPos, "assertAllowedWriteOrigin debe estar antes de router V0");
  assert.ok(pilotRoutesPos < staticPos, "router V0 debe estar antes de express.static");
  assert.ok(staticPos < errorHandlerPos, "express.static debe estar antes del error handler");
});

test("gatekeepers devuelven 404 inmediato con flags desactivados", () => {
  const pilotSection = serverSource.slice(
    serverSource.indexOf('app.use(\n  "/api/pilot"'),
    serverSource.indexOf('app.use(\n  "/api/pilot"') + 300
  );
  assert.match(pilotSection, /if \(!PILOT_ENABLED\) \{\s*return res\.status\(404\)\.json\(\{ ok: false, error: "Ruta no disponible\." \}\);/);

  const adminSection = serverSource.slice(
    serverSource.indexOf('app.use(\n  "/api/pilot-admin"'),
    serverSource.indexOf('app.use(\n  "/api/pilot-admin"') + 300
  );
  assert.match(adminSection, /if \(!PILOT_ADMIN_ROUTES_ENABLED\) \{\s*return res\.status\(404\)\.json\(\{ ok: false, error: "Ruta no disponible\." \}\);/);
});

test("rutas activas sí pasan por assertAllowedWriteOrigin", () => {
  const assertOriginPos = serverSource.indexOf('app.use(\n  "/api",\n  assertAllowedWriteOrigin\n);');
  const pilotRoutesPos = serverSource.indexOf('app.use(pilotRoutes);');
  assert.ok(assertOriginPos < pilotRoutesPos, "rutas V0 deben montarse despues de assertAllowedWriteOrigin");
});

test("módulos V0 se crean una sola vez e instancian condicionalmente", () => {
  const initBlock = serverSource.indexOf('if (PILOT_ENABLED || PILOT_ADMIN_ROUTES_ENABLED) {');
  assert.notEqual(initBlock, -1, "inicializacion condicional V0 requerida");

  const initSection = serverSource.slice(initBlock, initBlock + 1500);
  assert.match(initSection, /createPilotCryptoV0/);
  assert.match(initSection, /createPilotIdentityStoreV0/);
  assert.match(initSection, /createPilotIdentityRoutesV0/);

  // Comprobar que no hay múltiples llamadas
  const cryptoCalls = (serverSource.match(/createPilotCryptoV0\(/g) || []).length;
  const storeCalls = (serverSource.match(/createPilotIdentityStoreV0\(/g) || []).length;
  const routesCalls = (serverSource.match(/createPilotIdentityRoutesV0\(/g) || []).length;

  assert.equal(cryptoCalls, 1, "createPilotCryptoV0 solo debe invocarse una vez");
  assert.equal(storeCalls, 1, "createPilotIdentityStoreV0 solo debe invocarse una vez");
  assert.equal(routesCalls, 1, "createPilotIdentityRoutesV0 solo debe invocarse una vez");
});

test("configuración incompleta falla de forma segura sin imprimir secretos", () => {
  const initBlock = serverSource.indexOf('if (PILOT_ENABLED || PILOT_ADMIN_ROUTES_ENABLED) {');
  const initSection = serverSource.slice(initBlock, initBlock + 1500);

  assert.match(initSection, /catch \(error\) \{/);
  assert.match(initSection, /console\.error\("Error al inicializar la Identidad Piloto V0:", error\.message\);/);
  assert.match(initSection, /throw error;/);
});

test("la migración solo se menciona para bloquear su descarga y nunca se ejecuta", () => {
  const blockStart =
    serverSource.indexOf("function isBlockedPublicPath(requestPath)");
  const staticStart =
    serverSource.indexOf("express.static(", blockStart);

  assert.notEqual(blockStart, -1, "falta isBlockedPublicPath");
  assert.notEqual(staticStart, -1, "falta express.static");

  const sourceOutsidePublicBlock =
    serverSource.slice(0, blockStart) +
    serverSource.slice(staticStart);

  assert.equal(
    sourceOutsidePublicBlock.includes("migration-pilot-identity-v0.sql"),
    false,
    "la migración no debe cargarse ni ejecutarse fuera del bloqueo público"
  );
});

test("secretos no aparecen en logs ni respuestas", () => {
  assert.equal(serverSource.includes("PILOT_INVITATION_HMAC_KEY"), true);
  assert.equal(serverSource.includes("PILOT_TOKEN_HMAC_KEY"), true);
  assert.equal(serverSource.includes("PILOT_ADMIN_TOKEN"), true);

  // Asegurar que no se imprimen las variables de secreto
  assert.equal(serverSource.includes("console.log(PILOT_INVITATION_HMAC_KEY)"), false);
  assert.equal(serverSource.includes("console.log(PILOT_TOKEN_HMAC_KEY)"), false);
  assert.equal(serverSource.includes("console.log(PILOT_ADMIN_TOKEN)"), false);
  assert.equal(serverSource.includes("console.error(PILOT_INVITATION_HMAC_KEY)"), false);
  assert.equal(serverSource.includes("console.error(PILOT_TOKEN_HMAC_KEY)"), false);
  assert.equal(serverSource.includes("console.error(PILOT_ADMIN_TOKEN)"), false);
});

test("/api/health y rutas existentes no sufren modificaciones", () => {
  assert.match(serverSource, /app\.get\(\s*\"\/api\/health\",/);
  assert.match(serverSource, /app\.post\(\s*\"\/api\/bootstrap\",/);
  assert.match(serverSource, /app\.get\(\s*\"\/api\/state\/:userId\",/);
  assert.match(serverSource, /app\.patch\(\s*\"\/api\/profile\/:userId\",/);
  assert.match(serverSource, /app\.post\(\s*\"\/api\/routine\/open\",/);
  assert.match(serverSource, /app\.post\(\s*\"\/api\/routine\/complete\",/);
});


test("archivos internos V0 quedan bloqueados para descarga pública", () => {
  const blockStart =
    serverSource.indexOf("function isBlockedPublicPath(requestPath)");
  const staticStart =
    serverSource.indexOf("express.static(", blockStart);

  assert.notEqual(blockStart, -1, "falta isBlockedPublicPath");
  assert.notEqual(staticStart, -1, "falta express.static");

  const blockedSection =
    serverSource.slice(blockStart, staticStart);

  const internalFiles = [
    "/migration-pilot-identity-v0.sql",
    "/pilot-crypto-v0.js",
    "/pilot-crypto-v0.test.js",
    "/pilot-identity-routes-v0-design.md",
    "/pilot-identity-routes-v0.js",
    "/pilot-identity-routes-v0.test.js",
    "/pilot-identity-server-v0.test.js",
    "/pilot-identity-store-v0.js",
    "/pilot-identity-store-v0.test.js"
  ];

  for (const file of internalFiles) {
    assert.ok(
      blockedSection.includes(JSON.stringify(file)),
      `${file} debe estar en blockedFiles`
    );
  }
});
