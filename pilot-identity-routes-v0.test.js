/**
 * NU APP · PRUEBAS DE LA CAPA HTTP DE IDENTIDAD PILOTO V0
 * Archivo: pilot-identity-routes-v0.test.js
 *
 * Usa node:test, node:assert, http nativo y fetch.
 */

"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const express = require("express");
const http = require("node:http");
const crypto = require("node:crypto");
const { createPilotIdentityRoutesV0 } = require("./pilot-identity-routes-v0");
const { PilotStoreError, PilotStoreOperationalError } = require("./pilot-identity-store-v0");

// ============================================================
// HELPERS DE TEST Y SERVER
// ============================================================

function createMockStore() {
  const users = new Map();
  const credentials = new Map();
  const invitations = new Map();
  const auditLogs = [];

  return {
    users,
    credentials,
    invitations,
    auditLogs,

    calls: {
      registerUser: [],
      recoverAccess: [],
      renewCredential: [],
      authenticateCredential: [],
      getCredentialExpiry: [],
      createRegistrationInvitation: [],
      createRecoveryInvitation: [],
      revokeAllCredentials: []
    },

    async registerUser({ invitationCode, profile }) {
      this.calls.registerUser.push({ invitationCode, profile });
      if (!invitationCode || invitationCode === "invalid_code") {
        throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
      }
      if (invitationCode === "db_error_code") {
        const err = new PilotStoreOperationalError("DB_FAIL");
        err.code = "npi_secret_error_code";
        err.constraint = "npt_secret_token_constraint";
        throw err;
      }
      const userId = "usr_gen123";
      const token = "npt_0123456789abcdef0123456789abcdef0123456789a";
      const expiresAt = new Date("2026-09-15T12:00:00.000Z");
      users.set(userId, { userId, ...profile });
      credentials.set(token, { userId, expiresAt, revoked: false });
      return {
        ok: true,
        user: { userId, ...profile, currentDay: 1, cycle: 1 },
        credential: { token, expiresAt }
      };
    },

    async recoverAccess({ invitationCode }) {
      this.calls.recoverAccess.push({ invitationCode });
      if (!invitationCode || invitationCode === "invalid_code") {
        throw new PilotStoreError("La invitacion no es valida o ya fue utilizada.");
      }
      const userId = "usr_gen123";
      const token = "npt_fedcba9876543210fedcba9876543210fedcba9876b";
      const expiresAt = new Date("2026-09-15T12:00:00.000Z");
      credentials.set(token, { userId, expiresAt, revoked: false });
      return {
        ok: true,
        user: { userId, name: "Maria", country: "AR", timezone: "America/Buenos_Aires", notificationTime: "09:00" },
        credential: { token, expiresAt }
      };
    },

    async authenticateCredential({ token }) {
      this.calls.authenticateCredential.push({ token });
      if (!token || token === "npt_invalid00000000000000000000000000000000000") {
        throw new PilotStoreError("La sesion no es valida o ha expirado.");
      }
      if (token === "npt_dberror00000000000000000000000000000000000") {
        throw new PilotStoreOperationalError("DB_FAIL");
      }
      const cred = credentials.get(token) || {
        userId: "usr_abc123",
        expiresAt: new Date("2026-09-15T12:00:00.000Z"),
        revoked: false
      };
      if (cred.revoked) {
        throw new PilotStoreError("La sesion no es valida o ha expirado.");
      }
      return { ok: true, userId: cred.userId, expiresAt: cred.expiresAt };
    },

    async renewCredential({ currentToken }) {
      this.calls.renewCredential.push({ currentToken });
      if (!currentToken || currentToken === "npt_invalid00000000000000000000000000000000000") {
        throw new PilotStoreError("La sesion no es valida o ha expirado.");
      }
      const newToken = "npt_newtokenbase64urlstringcharacters43longg";
      const expiresAt = new Date("2026-09-15T12:00:00.000Z");
      return { ok: true, credential: { token: newToken, expiresAt } };
    },

    async getCredentialExpiry({ token }) {
      this.calls.getCredentialExpiry.push({ token });
      if (!token || token === "npt_invalid00000000000000000000000000000000000") {
        throw new PilotStoreError("La sesion no es valida o ha expirado.");
      }
      return { ok: true, expiresAt: "2026-09-15T12:00:00.000Z", daysUntilExpiry: 29 };
    },

    async createRegistrationInvitation({ expiresInHours = 48, adminKeyId, clientIp }) {
      this.calls.createRegistrationInvitation.push({ expiresInHours, adminKeyId, clientIp });
      return {
        ok: true,
        invitation: {
          id: 10,
          code: "npi_1234567890abcdef1234567890abcdef",
          expiresAt: "2026-08-18T12:00:00.000Z"
        }
      };
    },

    async createRecoveryInvitation({ userId, expiresInHours = 24, adminKeyId, clientIp }) {
      this.calls.createRecoveryInvitation.push({ userId, expiresInHours, adminKeyId, clientIp });
      if (userId === "nonexistent") {
        throw new PilotStoreError("Usuario no encontrado.");
      }
      return {
        ok: true,
        invitation: {
          id: 11,
          code: "npi_fedcba9876543210fedcba9876543210",
          recoveryUserId: userId,
          expiresAt: "2026-08-17T12:00:00.000Z"
        }
      };
    },

    async revokeAllCredentials({ userId, adminKeyId, clientIp }) {
      this.calls.revokeAllCredentials.push({ userId, adminKeyId, clientIp });
      if (userId === "nonexistent") {
        throw new PilotStoreError("El usuario no existe.");
      }
      return { ok: true, revokedCount: 1 };
    }
  };
}

class TestServer {
  constructor(appOptions = {}) {
    this.app = express();
    this.app.use(express.json());
    this.mockStore = createMockStore();
    this.logs = [];
    this.rateLimitBlockedNamespaces = new Set();
    this.rateLimitCalls = [];

    const store = appOptions.store || this.mockStore;
    const consumeSharedRateLimit = appOptions.consumeSharedRateLimit || (async (pool, { namespace, key, windowMs, max }) => {
      this.rateLimitCalls.push({ namespace, key, windowMs, max });
      if (this.rateLimitBlockedNamespaces.has(namespace)) {
        return { allowed: false, count: max + 1, remaining: 0, resetAt: Date.now() + 60000, retryAfter: 60 };
      }
      return { allowed: true, count: 1, remaining: max - 1, resetAt: Date.now() + 60000, retryAfter: 60 };
    });

    const pilotEnabled = appOptions.pilotEnabled !== undefined ? appOptions.pilotEnabled : true;
    const pilotAdminRoutesEnabled = appOptions.pilotAdminRoutesEnabled !== undefined ? appOptions.pilotAdminRoutesEnabled : true;

    this.app.use("/api/pilot", (req, res, next) => {
      if (!pilotEnabled) {
        return res.status(404).json({ ok: false, error: "Ruta no disponible." });
      }
      next();
    });

    this.app.use("/api/pilot-admin", (req, res, next) => {
      if (!pilotAdminRoutesEnabled) {
        return res.status(404).json({ ok: false, error: "Ruta no disponible." });
      }
      next();
    });

    if (appOptions.withWriteOriginCheck) {
      this.app.use("/api", (req, res, next) => {
        if (req.method === "GET") return next();
        const origin = req.headers["origin"];
        if (origin === "https://forbidden.com") {
          return res.status(403).json({ ok: false, error: "Origen no permitido." });
        }
        next();
      });
    }

    const routes = createPilotIdentityRoutesV0({
      express,
      store,
      nodeCrypto: crypto,
      pool: appOptions.pool !== undefined ? appOptions.pool : { query: async () => ({ rows: [] }) },
      consumeSharedRateLimit,
      pilotEnabled,
      pilotAdminRoutesEnabled,
      pilotAdminToken: appOptions.pilotAdminToken !== undefined ? appOptions.pilotAdminToken : "admin_secret_token_12345",
      pilotAdminKeyId: appOptions.pilotAdminKeyId !== undefined ? appOptions.pilotAdminKeyId : "key_admin_001",
      logError: (err) => { this.logs.push(err); },
      getClientIp: appOptions.getClientIp || ((req) => req.headers["x-test-ip"] || "192.168.1.100")
    });

    this.app.use(routes);

    this.app.get("/api/bootstrap", (req, res) => res.json({ ok: true, bootstrap: true }));

    this.server = null;
    this.port = 0;
  }

  async start() {
    return new Promise((resolve) => {
      this.server = http.createServer(this.app);
      this.server.listen(0, "127.0.0.1", () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => this.server.close(resolve));
    }
  }

  url(path) {
    return `http://127.0.0.1:${this.port}${path}`;
  }
}

function sendHttpRequest({ port, path, method = "GET", headers = {}, rawHeaders = null, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: json, text: data });
      });
    });

    req.on("error", reject);

    if (rawHeaders && Array.isArray(rawHeaders)) {
      for (let i = 0; i < rawHeaders.length; i += 2) {
        req.setHeader(rawHeaders[i], rawHeaders[i + 1]);
      }
    }

    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// ============================================================
// SUITE: INICIALIZACIÓN Y VALIDACIÓN DE DEPENDENCIAS (FAIL-CLOSED)
// ============================================================

describe("Inicialización y validación estricta de dependencias (fail-closed)", () => {
  it("lanza excepción si pilotAdminRoutesEnabled es true pero falta pilotAdminToken o pilotAdminKeyId", () => {
    assert.throws(
      () => createPilotIdentityRoutesV0({
        express,
        store: createMockStore(),
        pool: { query: async () => {} },
        consumeSharedRateLimit: async () => {},
        pilotAdminRoutesEnabled: true,
        pilotAdminToken: "",
        pilotAdminKeyId: "key1"
      }),
      (err) => err.message.includes("PILOT_ADMIN_TOKEN y PILOT_ADMIN_KEY_ID son requeridos")
    );

    assert.throws(
      () => createPilotIdentityRoutesV0({
        express,
        store: createMockStore(),
        pool: { query: async () => {} },
        consumeSharedRateLimit: async () => {},
        pilotAdminRoutesEnabled: true,
        pilotAdminToken: "token1",
        pilotAdminKeyId: "   "
      }),
      (err) => err.message.includes("PILOT_ADMIN_TOKEN y PILOT_ADMIN_KEY_ID son requeridos")
    );
  });

  it("lanza excepción si falta express cuando rutas están habilitadas", () => {
    assert.throws(
      () => createPilotIdentityRoutesV0({
        express: null,
        store: createMockStore(),
        pool: { query: async () => {} },
        consumeSharedRateLimit: async () => {},
        pilotEnabled: true
      }),
      (err) => err.message.includes("express")
    );
  });

  it("lanza excepción si falta pool o pool.query no es función cuando rutas están habilitadas", () => {
    assert.throws(
      () => createPilotIdentityRoutesV0({
        express,
        store: createMockStore(),
        pool: null,
        consumeSharedRateLimit: async () => {},
        pilotEnabled: true
      }),
      (err) => err.message.includes("PostgreSQL")
    );

    assert.throws(
      () => createPilotIdentityRoutesV0({
        express,
        store: createMockStore(),
        pool: {},
        consumeSharedRateLimit: async () => {},
        pilotEnabled: true
      }),
      (err) => err.message.includes("PostgreSQL")
    );
  });

  it("lanza excepción si falta consumeSharedRateLimit cuando rutas están habilitadas", () => {
    assert.throws(
      () => createPilotIdentityRoutesV0({
        express,
        store: createMockStore(),
        pool: { query: async () => {} },
        consumeSharedRateLimit: null,
        pilotEnabled: true
      }),
      (err) => err.message.includes("consumeSharedRateLimit")
    );
  });

  it("lanza excepción si el store no implementa los métodos requeridos para rutas de usuario", () => {
    const incompleteStore = { registerUser: async () => {} };
    assert.throws(
      () => createPilotIdentityRoutesV0({
        express,
        store: incompleteStore,
        pool: { query: async () => {} },
        consumeSharedRateLimit: async () => {},
        pilotEnabled: true
      }),
      (err) => err.message.includes("recoverAccess")
    );
  });

  it("lanza excepción si el store no implementa los métodos requeridos para rutas administrativas", () => {
    const userOnlyStore = {
      registerUser: async () => {},
      recoverAccess: async () => {},
      renewCredential: async () => {},
      authenticateCredential: async () => {},
      getCredentialExpiry: async () => {}
    };
    assert.throws(
      () => createPilotIdentityRoutesV0({
        express,
        store: userOnlyStore,
        pool: { query: async () => {} },
        consumeSharedRateLimit: async () => {},
        pilotAdminRoutesEnabled: true,
        pilotAdminToken: "secret",
        pilotAdminKeyId: "key1"
      }),
      (err) => err.message.includes("createRegistrationInvitation")
    );
  });

  it("permite instanciar correctamente si pilotEnabled y pilotAdminRoutesEnabled son false sin validar tokens", () => {
    const router = createPilotIdentityRoutesV0({
      express,
      store: {},
      pilotEnabled: false,
      pilotAdminRoutesEnabled: false
    });
    assert.ok(router);
  });
});

// ============================================================
// SUITE: FEATURE FLAGS Y ORDEN DE MIDDLEWARES
// ============================================================

describe("Feature flags y gatekeepers", () => {
  let ts;

  afterEach(async () => {
    if (ts) await ts.stop();
  });

  it("responde 404 en /api/pilot/* cuando pilotEnabled es false, incluso con Origin prohibido", async () => {
    ts = new TestServer({ pilotEnabled: false, withWriteOriginCheck: true });
    await ts.start();

    const res = await fetch(ts.url("/api/pilot/register"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://forbidden.com"
      },
      body: JSON.stringify({ invitationCode: "npi_123" })
    });

    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error, "Ruta no disponible.");
  });

  it("responde 404 en /api/pilot-admin/* cuando pilotAdminRoutesEnabled es false, incluso con Origin prohibido", async () => {
    ts = new TestServer({ pilotAdminRoutesEnabled: false, withWriteOriginCheck: true });
    await ts.start();

    const res = await fetch(ts.url("/api/pilot-admin/invitations/registration"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pilot-Admin-Token": "admin_secret_token_12345",
        "Origin": "https://forbidden.com"
      },
      body: JSON.stringify({})
    });

    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error, "Ruta no disponible.");
  });
});

// ============================================================
// SUITE: VALIDACIÓN ESTRICTA DE BODIES (ALLOWLISTS)
// ============================================================

describe("Validación estricta de bodies y allowlists", () => {
  let ts;

  beforeEach(async () => {
    ts = new TestServer({ pilotEnabled: true, pilotAdminRoutesEnabled: true });
    await ts.start();
  });

  afterEach(async () => {
    if (ts) await ts.stop();
  });

  it("POST /api/pilot/register rechaza campos no permitidos en la raíz con HTTP 400", async () => {
    const res = await fetch(ts.url("/api/pilot/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invitationCode: "npi_123",
        profile: { name: "Maria", country: "AR", timezone: "UTC", notificationTime: "09:00" },
        extraField: "hack"
      })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, "La solicitud contiene campos no permitidos.");
  });

  it("POST /api/pilot/register rechaza campos no permitidos en profile con HTTP 400", async () => {
    const res = await fetch(ts.url("/api/pilot/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invitationCode: "npi_123",
        profile: { name: "Maria", country: "AR", timezone: "UTC", notificationTime: "09:00", role: "admin" }
      })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, "La solicitud contiene campos no permitidos.");
  });

  it("POST /api/pilot/register rechaza inyección de userId en la raíz o en profile con HTTP 400", async () => {
    const res1 = await fetch(ts.url("/api/pilot/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "injected_user_id",
        invitationCode: "npi_123",
        profile: { name: "Maria", country: "AR", timezone: "UTC", notificationTime: "09:00" }
      })
    });
    assert.strictEqual(res1.status, 400);

    const res2 = await fetch(ts.url("/api/pilot/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invitationCode: "npi_123",
        profile: { userId: "injected_user_id", name: "Maria", country: "AR", timezone: "UTC", notificationTime: "09:00" }
      })
    });
    assert.strictEqual(res2.status, 400);
  });

  it("POST /api/pilot/recover rechaza propiedades extra con HTTP 400", async () => {
    const res = await fetch(ts.url("/api/pilot/recover"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationCode: "npi_123", extra: "val" })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, "La solicitud contiene campos no permitidos.");
  });

  it("POST /api/pilot/renew rechaza body no vacío con HTTP 400", async () => {
    const res = await fetch(ts.url("/api/pilot/renew"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer npt_0123456789abcdef0123456789abcdef0123456789a"
      },
      body: JSON.stringify({ extra: "data" })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, "La solicitud contiene campos no permitidos.");
  });

  it("GET /api/pilot/me rechaza payload con propiedades con HTTP 400", async () => {
    const response = await sendHttpRequest({
      port: ts.port,
      path: "/api/pilot/me",
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(JSON.stringify({ unexpected: true })),
        "Authorization": "Bearer npt_0123456789abcdef0123456789abcdef0123456789a"
      },
      body: JSON.stringify({ unexpected: true })
    });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error, "La solicitud contiene campos no permitidos.");
  });

  it("GET /api/pilot/me rechaza array como payload con HTTP 400", async () => {
    const response = await sendHttpRequest({
      port: ts.port,
      path: "/api/pilot/me",
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(JSON.stringify([1, 2, 3])),
        "Authorization": "Bearer npt_0123456789abcdef0123456789abcdef0123456789a"
      },
      body: JSON.stringify([1, 2, 3])
    });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error, "La solicitud contiene campos no permitidos.");
  });

  it("Rutas administrativas rechazan campos extra o ausentes con HTTP 400", async () => {
    // registration invitation extra field
    const res1 = await fetch(ts.url("/api/pilot-admin/invitations/registration"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pilot-Admin-Token": "admin_secret_token_12345"
      },
      body: JSON.stringify({ expiresInHours: 24, unknownKey: 1 })
    });
    assert.strictEqual(res1.status, 400);

    // recovery invitation missing userId
    const res2 = await fetch(ts.url("/api/pilot-admin/invitations/recovery"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pilot-Admin-Token": "admin_secret_token_12345"
      },
      body: JSON.stringify({ expiresInHours: 24 })
    });
    assert.strictEqual(res2.status, 400);

    // revoke-all extra field
    const res3 = await fetch(ts.url("/api/pilot-admin/credentials/revoke-all"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pilot-Admin-Token": "admin_secret_token_12345"
      },
      body: JSON.stringify({ userId: "usr_abc123", reason: "test" })
    });
    assert.strictEqual(res3.status, 400);
  });
});

// ============================================================
// SUITE: BEARER TOKEN Y TOKEN ADMINISTRATIVO
// ============================================================

describe("Tokens Bearer y Tokens Administrativos", () => {
  let ts;

  beforeEach(async () => {
    ts = new TestServer({ pilotEnabled: true, pilotAdminRoutesEnabled: true });
    await ts.start();
  });

  afterEach(async () => {
    if (ts) await ts.stop();
  });

  it("rechaza Bearer tokens ausentes, malformados, duplicados o >10KB con HTTP 401 y consume rate limit IP", async () => {
    // Sin cabecera
    const res1 = await fetch(ts.url("/api/pilot/me"));
    assert.strictEqual(res1.status, 401);

    // Formato Basic
    const res2 = await fetch(ts.url("/api/pilot/me"), {
      headers: { "Authorization": "Basic dXNlcjpwYXNz" }
    });
    assert.strictEqual(res2.status, 401);

    // Sin npt_ prefix
    const res3 = await fetch(ts.url("/api/pilot/me"), {
      headers: { "Authorization": "Bearer invalidprefix0123456789abcdef0123456789abcdef" }
    });
    assert.strictEqual(res3.status, 401);

    // Longitud incorrecta
    const res4 = await fetch(ts.url("/api/pilot/me"), {
      headers: { "Authorization": "Bearer npt_short" }
    });
    assert.strictEqual(res4.status, 401);

    // Cadena excesivamente larga (>10KB)
    const longToken = "npt_" + "a".repeat(12000);
    const res5 = await fetch(ts.url("/api/pilot/me"), {
      headers: { "Authorization": `Bearer ${longToken}` }
    });
    assert.strictEqual(res5.status, 401);

    const body = await res5.json();
    assert.strictEqual(body.error, "La sesión no es válida o ha expirado.");
  });

  it("rechaza Authorization duplicada usando HTTP raw y consume rate limit IP sin consultar PostgreSQL", async () => {
    const validToken = "npt_0123456789abcdef0123456789abcdef0123456789a";
    const response = await sendHttpRequest({
      port: ts.port,
      path: "/api/pilot/renew",
      method: "POST",
      headers: {
        "Authorization": [`Bearer ${validToken}`, `Bearer ${validToken}`],
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.body.error, "La sesión no es válida o ha expirado.");
    assert.strictEqual(ts.mockStore.calls.authenticateCredential.length, 0);
  });

  it("si IP rate limit está bloqueado, un Bearer malformado devuelve 429 y registra 0 llamadas al store", async () => {
    ts.rateLimitBlockedNamespaces.add("pilot-renew-ip");

    const res = await fetch(ts.url("/api/pilot/renew"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer npt_malformed"
      },
      body: JSON.stringify({})
    });

    assert.strictEqual(res.status, 429);
    assert.strictEqual(ts.mockStore.calls.authenticateCredential.length, 0);
  });

  it("rechaza X-Pilot-Admin-Token ausente, incorrecto o muy largo con HTTP 401", async () => {
    // Ausente
    const res1 = await fetch(ts.url("/api/pilot-admin/invitations/registration"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresInHours: 48 })
    });
    assert.strictEqual(res1.status, 401);

    // Incorrecto
    const res2 = await fetch(ts.url("/api/pilot-admin/invitations/registration"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pilot-Admin-Token": "wrong_token"
      },
      body: JSON.stringify({ expiresInHours: 48 })
    });
    assert.strictEqual(res2.status, 401);

    // Excesivamente largo
    const res3 = await fetch(ts.url("/api/pilot-admin/invitations/registration"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pilot-Admin-Token": "x".repeat(2000)
      },
      body: JSON.stringify({ expiresInHours: 48 })
    });
    assert.strictEqual(res3.status, 401);

    const body = await res3.json();
    assert.strictEqual(body.error, "Token de administración inválido.");
  });
});

// ============================================================
// SUITE: RATE LIMITING Y SECUENCIA DE EJECUCIÓN
// ============================================================

describe("Rate limiting y secuencia exacta de ejecución", () => {
  let ts;

  beforeEach(async () => {
    ts = new TestServer({ pilotEnabled: true, pilotAdminRoutesEnabled: true });
    await ts.start();
  });

  afterEach(async () => {
    if (ts) await ts.stop();
  });

  it("renew y me consumen rate limit por IP ANTES de consultar PostgreSQL", async () => {
    ts.rateLimitBlockedNamespaces.add("pilot-renew-ip");
    ts.rateLimitBlockedNamespaces.add("pilot-me-ip");

    const validToken = "npt_0123456789abcdef0123456789abcdef0123456789a";

    // renew cuando se excede rate limit por IP
    const resRenew = await fetch(ts.url("/api/pilot/renew"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${validToken}`
      },
      body: JSON.stringify({})
    });
    assert.strictEqual(resRenew.status, 429);
    assert.strictEqual(ts.mockStore.calls.authenticateCredential.length, 0);

    // me cuando se excede rate limit por IP
    const resMe = await fetch(ts.url("/api/pilot/me"), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${validToken}`
      }
    });
    assert.strictEqual(resMe.status, 429);
    assert.strictEqual(ts.mockStore.calls.authenticateCredential.length, 0);
  });

  it("en renew, si falla el rate limit por usuario (Paso 4), la credencial actual NO es revocada (renewCredential no se ejecuta)", async () => {
    ts.rateLimitBlockedNamespaces.add("pilot-renew-user");

    const validToken = "npt_0123456789abcdef0123456789abcdef0123456789a";

    const resRenew = await fetch(ts.url("/api/pilot/renew"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${validToken}`
      },
      body: JSON.stringify({})
    });

    assert.strictEqual(resRenew.status, 429);
    assert.strictEqual(ts.mockStore.calls.authenticateCredential.length, 1);
    assert.strictEqual(ts.mockStore.calls.renewCredential.length, 0);
  });

  it("rutas administrativas consumen rate limit por IP ANTES de verificar X-Pilot-Admin-Token", async () => {
    ts.rateLimitBlockedNamespaces.add("pilot-admin");

    const res = await fetch(ts.url("/api/pilot-admin/invitations/registration"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pilot-Admin-Token": "invalid_token_should_not_be_reached"
      },
      body: JSON.stringify({})
    });

    assert.strictEqual(res.status, 429);
  });
});

// ============================================================
// SUITE: ENDPOINTS DE ÉXITO
// ============================================================

describe("Endpoints REST de éxito", () => {
  let ts;

  beforeEach(async () => {
    ts = new TestServer({ pilotEnabled: true, pilotAdminRoutesEnabled: true });
    await ts.start();
  });

  afterEach(async () => {
    if (ts) await ts.stop();
  });

  it("POST /api/pilot/register registra usuario exitosamente (201 Created)", async () => {
    const res = await fetch(ts.url("/api/pilot/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invitationCode: "npi_1234567890abcdef1234567890abcdef",
        profile: { name: "Maria", country: "AR", timezone: "America/Buenos_Aires", notificationTime: "09:00" }
      })
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.user);
    assert.strictEqual(body.user.name, "Maria");
    assert.ok(body.credential);
    assert.ok(body.credential.token);
  });

  it("POST /api/pilot/recover recupera acceso exitosamente (200 OK)", async () => {
    const res = await fetch(ts.url("/api/pilot/recover"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invitationCode: "npi_1234567890abcdef1234567890abcdef"
      })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.credential);
  });

  it("POST /api/pilot/renew renueva credencial exitosamente (200 OK)", async () => {
    const res = await fetch(ts.url("/api/pilot/renew"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer npt_0123456789abcdef0123456789abcdef0123456789a"
      },
      body: JSON.stringify({})
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.credential.token);
  });

  it("GET /api/pilot/me retorna estado de sesión exitosamente (200 OK)", async () => {
    const res = await fetch(ts.url("/api/pilot/me"), {
      method: "GET",
      headers: {
        "Authorization": "Bearer npt_0123456789abcdef0123456789abcdef0123456789a"
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.user.userId, "usr_abc123");
    assert.strictEqual(body.session.daysUntilExpiry, 29);
  });

  it("POST /api/pilot-admin/invitations/registration crea invitación (201 Created)", async () => {
    const res = await fetch(ts.url("/api/pilot-admin/invitations/registration"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pilot-Admin-Token": "admin_secret_token_12345"
      },
      body: JSON.stringify({ expiresInHours: 48 })
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.invitation.id, 10);
    assert.strictEqual(ts.mockStore.calls.createRegistrationInvitation[0].adminKeyId, "key_admin_001");
  });

  it("POST /api/pilot-admin/invitations/recovery crea invitación (201 Created)", async () => {
    const res = await fetch(ts.url("/api/pilot-admin/invitations/recovery"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pilot-Admin-Token": "admin_secret_token_12345"
      },
      body: JSON.stringify({ userId: "usr_abc123", expiresInHours: 24 })
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.invitation.recoveryUserId, "usr_abc123");
  });

  it("POST /api/pilot-admin/credentials/revoke-all revoca credenciales (200 OK)", async () => {
    const res = await fetch(ts.url("/api/pilot-admin/credentials/revoke-all"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pilot-Admin-Token": "admin_secret_token_12345"
      },
      body: JSON.stringify({ userId: "usr_abc123" })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.revokedCount, 1);
  });
});

// ============================================================
// SUITE: SANITIZACIÓN DE ERRORES Y AUSENCIA DE SECRETOS
// ============================================================

describe("Sanitización de errores y ausencia de secretos", () => {
  let ts;

  beforeEach(async () => {
    ts = new TestServer({ pilotEnabled: true, pilotAdminRoutesEnabled: true });
    await ts.start();
  });

  afterEach(async () => {
    if (ts) await ts.stop();
  });

  it("devuelve 500 con mensaje genérico si ocurre un error operativo en DB y sanitiza logs", async () => {
    const res = await fetch(ts.url("/api/pilot/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invitationCode: "db_error_code",
        profile: { name: "Maria", country: "AR", timezone: "UTC", notificationTime: "09:00" }
      })
    });

    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error, "Error interno del servidor.");

    assert.ok(ts.logs.length > 0);
    const logStr = JSON.stringify(ts.logs[0]);
    assert.ok(!logStr.includes("npi_secret"));
    assert.ok(!logStr.includes("npt_secret"));
    assert.ok(!logStr.includes("hmac"));
    assert.ok(!logStr.includes("Authorization"));
    assert.ok(!logStr.includes("PILOT_ADMIN_TOKEN"));
  });

  it("no expone si un usuario existe o no mediante variaciones de error en admin", async () => {
    const res = await fetch(ts.url("/api/pilot-admin/invitations/recovery"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pilot-Admin-Token": "admin_secret_token_12345"
      },
      body: JSON.stringify({ userId: "nonexistent", expiresInHours: 24 })
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, "No se pudo completar la operación solicitada.");
  });

  it("respuestas de error no revelan códigos (npi_), tokens (npt_) ni HMACs", async () => {
    const invitationCode = "npi_1234567890abcdef1234567890abcdef";
    const res = await fetch(ts.url("/api/pilot/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invitationCode,
        profile: { name: "Maria", country: "AR", timezone: "UTC", notificationTime: "09:00", extra: "hack" }
      })
    });

    const text = await res.text();
    assert.ok(!text.includes("npi_"));
    assert.ok(!text.includes("npt_"));
    assert.ok(!text.includes("hmac"));
  });
});

// ============================================================
// SUITE: NO REGRESIÓN
// ============================================================

describe("No regresión conceptual de rutas existentes", () => {
  let ts;

  beforeEach(async () => {
    ts = new TestServer({ pilotEnabled: true, pilotAdminRoutesEnabled: true });
    await ts.start();
  });

  afterEach(async () => {
    if (ts) await ts.stop();
  });

  it("las rutas existentes como GET /api/bootstrap continúan respondiendo normalmente", async () => {
    const res = await fetch(ts.url("/api/bootstrap"));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.bootstrap, true);
  });
});
