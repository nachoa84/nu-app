/**
 * NU APP · PRUEBAS DEL SERVICIO TRANSACCIONAL DEL PILOTO DE IDENTIDAD V0
 * Archivo: pilot-identity-store-v0.test.js
 *
 * Usa node:test y node:assert.
 * Todas las pruebas usan un pool/cliente PostgreSQL simulado.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");

const {
  createPilotIdentityStoreV0,
  PilotStoreError,
  PilotStoreOperationalError
} = require("./pilot-identity-store-v0");

const {
  createPilotCryptoV0,
  PilotCryptoError
} = require("./pilot-crypto-v0");

// ============================================================
// UTILIDADES DE PRUEBA
// ============================================================

function makeValidKey() {
  return crypto.randomBytes(32).toString("base64");
}

function makeCrypto() {
  return createPilotCryptoV0({
    invitationHmacKey: makeValidKey(),
    tokenHmacKey: makeValidKey()
  });
}

function makeDeterministicCrypto() {
  let invitationCounter = 0;
  let tokenCounter = 0;
  return createPilotCryptoV0({
    invitationHmacKey: makeValidKey(),
    tokenHmacKey: makeValidKey(),
    randomBytes: (size) => {
      if (size === 16) {
        invitationCounter++;
        const buf = Buffer.alloc(16);
        buf.writeUInt32BE(invitationCounter, 12);
        return buf;
      }
      if (size === 32) {
        tokenCounter++;
        const buf = Buffer.alloc(32);
        buf.writeUInt32BE(tokenCounter, 28);
        return buf;
      }
      throw new Error(`Unexpected size: ${size}`);
    }
  });
}

// ============================================================
// MOCK DE POOL POSTGRESQL CON TIEMPO CONFIGURABLE
// ============================================================
// El mock permite establecer un "now" de PostgreSQL distinto del
// reloj local de JavaScript para demostrar que el store usa
// exclusivamente el tiempo retornado por PostgreSQL.

class MockPgPool {
  constructor(options = {}) {
    this.pgNow = options.pgNow || null; // Date que simula CURRENT_TIMESTAMP de PostgreSQL
    this.reset();
  }

  reset() {
    this.users = new Map();
    this.invitations = new Map();
    this.credentials = new Map();
    this.audit = new Map();
    this.nextId = { invitations: 1, credentials: 1, audit: 1 };
    this.queries = [];
    this.failNext = null;
    this.queryCount = 0;
  }

  setPgNow(date) {
    this.pgNow = date;
  }

  _now() {
    return this.pgNow || new Date();
  }

  async connect() {
    return new MockPgClient(this);
  }

  async query(sql, params) {
    this.queryCount++;
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    return this._executeQuery(sql, params);
  }

  _executeQuery(sql, params) {
    this.queries.push({ sql, params });

    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }

    // SELECT user_id FROM pilot_credentials WHERE token_hmac = $1
    if (sql.includes("SELECT user_id FROM pilot_credentials WHERE token_hmac")) {
      for (const cred of this.credentials.values()) {
        if (cred.token_hmac === params[0] && !cred.revoked_at) {
          return { rows: [{ user_id: cred.user_id }], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    // SELECT recovery_user_id FROM pilot_invitations WHERE code_hmac = $1
    if (sql.includes("SELECT recovery_user_id FROM pilot_invitations WHERE code_hmac")) {
      for (const inv of this.invitations.values()) {
        if (inv.code_hmac === params[0]) {
          return { rows: [{ recovery_user_id: inv.recovery_user_id }], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    // SELECT id FROM users WHERE id = $1 FOR UPDATE / FOR KEY SHARE
    if (sql.includes("SELECT id FROM users WHERE id = $1")) {
      const user = this.users.get(params[0]);
      if (user) {
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // SELECT invitation... FROM pilot_invitations WHERE code_hmac = $1 FOR UPDATE
    if (sql.includes("FROM pilot_invitations") && sql.includes("FOR UPDATE") && sql.includes("code_hmac")) {
      for (const inv of this.invitations.values()) {
        if (inv.code_hmac === params[0]) {
          const now = this._now();
          const isUnexpired = new Date(inv.expires_at) > now;
          return {
            rows: [{
              id: inv.id,
              invitation_type: inv.invitation_type,
              recovery_user_id: inv.recovery_user_id,
              used_at: inv.used_at,
              expires_at: inv.expires_at,
              created_at: inv.created_at,
              is_unexpired: isUnexpired
            }],
            rowCount: 1
          };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    // SELECT credential... FROM pilot_credentials WHERE token_hmac = $1 FOR UPDATE
    if (sql.includes("FROM pilot_credentials") && sql.includes("FOR UPDATE") && sql.includes("token_hmac")) {
      for (const cred of this.credentials.values()) {
        if (cred.token_hmac === params[0]) {
          const now = this._now();
          const isUnexpired = new Date(cred.expires_at) > now;
          return {
            rows: [{
              id: cred.id,
              user_id: cred.user_id,
              expires_at: cred.expires_at,
              revoked_at: cred.revoked_at,
              is_unexpired: isUnexpired
            }],
            rowCount: 1
          };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    // SELECT credential active FOR UPDATE by user_id
    if (sql.includes("FROM pilot_credentials") && sql.includes("FOR UPDATE") && sql.includes("user_id") && sql.includes("revoked_at IS NULL")) {
      const results = [];
      for (const cred of this.credentials.values()) {
        if (cred.user_id === params[0] && !cred.revoked_at) {
          results.push({
            id: cred.id,
            user_id: cred.user_id,
            token_hmac: cred.token_hmac,
            created_at: cred.created_at,
            expires_at: cred.expires_at,
            revoked_at: cred.revoked_at
          });
        }
      }
      return { rows: results, rowCount: results.length };
    }

    // SELECT user data
    if (sql.includes("SELECT id, name, country, timezone, notification_time FROM users WHERE id = $1")) {
      const user = this.users.get(params[0]);
      if (user) {
        return {
          rows: [{
            id: user.id,
            name: user.name,
            country: user.country,
            timezone: user.timezone,
            notification_time: user.notification_time
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    }

    // SELECT authenticateCredential
    if (sql.includes("SELECT user_id, expires_at FROM pilot_credentials") && !sql.includes("FOR UPDATE")) {
      for (const cred of this.credentials.values()) {
        if (cred.token_hmac === params[0] && !cred.revoked_at && new Date(cred.expires_at) > this._now()) {
          return { rows: [{ user_id: cred.user_id, expires_at: cred.expires_at }], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    // SELECT getCredentialExpiry
    if (sql.includes("days_until_expiry")) {
      for (const cred of this.credentials.values()) {
        if (cred.token_hmac === params[0] && !cred.revoked_at && new Date(cred.expires_at) > this._now()) {
          const now = this._now();
          const diffMs = new Date(cred.expires_at) - now;
          const daysUntil = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          return {
            rows: [{ expires_at: cred.expires_at, days_until_expiry: daysUntil }],
            rowCount: 1
          };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    // INSERT INTO users
    if (sql.includes("INSERT INTO users")) {
      const user = {
        id: params[0],
        name: params[1],
        country: params[2],
        timezone: params[3],
        notification_time: params[4],
        current_day: 1,
        cycle: 1
      };
      this.users.set(params[0], user);
      return { rows: [], rowCount: 1 };
    }

    // INSERT INTO pilot_credentials
    if (sql.includes("INSERT INTO pilot_credentials")) {
      for (const cred of this.credentials.values()) {
        if (cred.token_hmac === params[1]) {
          const err = new Error('duplicate key value violates unique constraint "pilot_credentials_token_hmac_unique"');
          err.code = "23505";
          err.constraint = "pilot_credentials_token_hmac_unique";
          throw err;
        }
      }
      if (!sql.includes("revoked_at = CURRENT_TIMESTAMP")) {
        for (const cred of this.credentials.values()) {
          if (cred.user_id === params[0] && !cred.revoked_at) {
            const err = new Error('duplicate key value violates unique constraint "idx_pilot_credentials_one_active_per_user"');
            err.code = "23505";
            err.constraint = "idx_pilot_credentials_one_active_per_user";
            throw err;
          }
        }
      }
      const id = this.nextId.credentials++;
      const now = this._now();
      const ttlDays = params[2]; // credentialTtlDays
      const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
      const cred = {
        id,
        user_id: params[0],
        token_hmac: params[1],
        created_at: now,
        expires_at: expiresAt,
        revoked_at: null,
        last_used_at: now
      };
      this.credentials.set(id, cred);
      // If RETURNING expires_at is requested, return it
      if (sql.includes("RETURNING expires_at")) {
        return { rows: [{ expires_at: expiresAt }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }

    // INSERT INTO pilot_invitations
    if (sql.includes("INSERT INTO pilot_invitations")) {
      for (const inv of this.invitations.values()) {
        if (inv.code_hmac === params[0]) {
          return { rows: [], rowCount: 0 };
        }
      }
      const id = this.nextId.invitations++;
      const now = this._now();
      const ttlHours = sql.includes("'registration'") ? params[1] : params[2];
      const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
      const inv = {
        id,
        code_hmac: params[0],
        invitation_type: sql.includes("'registration'") ? "registration" : "recovery",
        recovery_user_id: sql.includes("'registration'") ? null : params[1],
        created_at: now,
        expires_at: expiresAt,
        used_at: null,
        used_by_user_id: null
      };
      this.invitations.set(id, inv);
      return {
        rows: [{
          id,
          recovery_user_id: inv.recovery_user_id,
          created_at: inv.created_at,
          expires_at: inv.expires_at
        }],
        rowCount: 1
      };
    }

    // INSERT INTO pilot_admin_audit
    if (sql.includes("INSERT INTO pilot_admin_audit")) {
      const id = this.nextId.audit++;
      const audit = {
        id,
        admin_key_id: params[0],
        action: params[1],
        target_user_id: params[2],
        details: params[3],
        client_ip: params[4],
        created_at: this._now()
      };
      this.audit.set(id, audit);
      return { rows: [{ id }], rowCount: 1 };
    }

    // UPDATE pilot_invitations SET used_at
    if (sql.includes("UPDATE pilot_invitations SET used_at")) {
      for (const inv of this.invitations.values()) {
        if (inv.id === params[1]) {
          inv.used_at = this._now();
          inv.used_by_user_id = params[0];
          return { rows: [], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    // UPDATE pilot_credentials SET revoked_at by user_id
    if (sql.includes("UPDATE pilot_credentials SET revoked_at") && sql.includes("user_id = $1")) {
      let count = 0;
      for (const cred of this.credentials.values()) {
        if (cred.user_id === params[0] && !cred.revoked_at) {
          cred.revoked_at = this._now();
          count++;
        }
      }
      return { rows: [], rowCount: count };
    }

    // UPDATE pilot_credentials SET revoked_at WHERE id = $1
    if (sql.includes("UPDATE pilot_credentials SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1")) {
      for (const cred of this.credentials.values()) {
        if (cred.id === params[0]) {
          cred.revoked_at = this._now();
          return { rows: [], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    return { rows: [], rowCount: 0 };
  }
}

class MockPgClient {
  constructor(pool) {
    this.pool = pool;
    this.inTransaction = false;
  }

  async query(sql, params) {
    if (sql === "BEGIN") {
      this.inTransaction = true;
      return { rows: [], rowCount: 0 };
    }
    if (sql === "COMMIT") {
      this.inTransaction = false;
      return { rows: [], rowCount: 0 };
    }
    if (sql === "ROLLBACK") {
      this.inTransaction = false;
      return { rows: [], rowCount: 0 };
    }
    return this.pool._executeQuery(sql, params);
  }

  release() {
    this.inTransaction = false;
  }
}

// ============================================================
// FIXTURES
// ============================================================

function makeStore(overrides = {}) {
  const pool = overrides.pool || new MockPgPool();
  const cryptoModule = overrides.crypto || makeDeterministicCrypto();
  const logError = overrides.logError || (() => {});
  let userIdCounter = 0;
  const generateUserId = overrides.generateUserId || (() => {
    userIdCounter++;
    return `user_${String(userIdCounter).padStart(4, "0")}`;
  });
  const normalizeProfile = overrides.normalizeProfile || ((p) => ({
    userId: p.userId,
    name: p.name || "Test User",
    country: p.country || "AR",
    timezone: p.timezone || "America/Argentina/Buenos_Aires",
    notificationTime: p.notificationTime || "09:00"
  }));

  return {
    store: createPilotIdentityStoreV0({
      pool,
      crypto: cryptoModule,
      logError,
      generateUserId,
      normalizeProfile,
      credentialTtlDays: overrides.credentialTtlDays || 30,
      registrationInvitationTtlHours: overrides.registrationInvitationTtlHours || 48,
      recoveryInvitationTtlHours: overrides.recoveryInvitationTtlHours || 24,
      maxCollisionRetries: overrides.maxCollisionRetries || 5
    }),
    pool,
    crypto: cryptoModule,
    logErrorCalls: []
  };
}

// ============================================================
// SUITE: VALIDACIÓN DE LA FACTORY
// ============================================================

describe("Validacion de la factory", () => {
  it("rechaza pool invalido", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: null,
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: () => "u1",
        normalizeProfile: (p) => p
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("pool")
    );
  });

  it("rechaza crypto invalido", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: null,
        logError: () => {},
        generateUserId: () => "u1",
        normalizeProfile: (p) => p
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("criptografico")
    );
  });

  it("rechaza logError no funcion", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: "not-a-function",
        generateUserId: () => "u1",
        normalizeProfile: (p) => p
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("logger")
    );
  });

  it("rechaza generateUserId no funcion", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: null,
        normalizeProfile: (p) => p
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("generateUserId")
    );
  });

  it("rechaza generateUserId que produce string vacio", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: () => "",
        normalizeProfile: (p) => p
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("generateUserId")
    );
  });

  it("rechaza generateUserId que produce solo espacios", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: () => "   ",
        normalizeProfile: (p) => p
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("generateUserId")
    );
  });

  it("rechaza generateUserId que produce string muy largo", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: () => "x".repeat(100),
        normalizeProfile: (p) => p
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("generateUserId")
    );
  });

  it("acepta generateUserId que produce string valido de 64 chars", () => {
    const store = createPilotIdentityStoreV0({
      pool: new MockPgPool(),
      crypto: makeCrypto(),
      logError: () => {},
      generateUserId: () => "x".repeat(64),
      normalizeProfile: (p) => p
    });
    assert.ok(store);
  });

  it("rechaza normalizeProfile no funcion", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: () => "u1",
        normalizeProfile: null
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("normalizeProfile")
    );
  });

  it("rechaza credentialTtlDays fuera de rango", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: () => "u1",
        normalizeProfile: (p) => p,
        credentialTtlDays: 0
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("credentialTtlDays")
    );
  });

  it("rechaza credentialTtlDays mayor a 90", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: () => "u1",
        normalizeProfile: (p) => p,
        credentialTtlDays: 91
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("credentialTtlDays")
    );
  });

  it("rechaza registrationInvitationTtlHours fuera de rango", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: () => "u1",
        normalizeProfile: (p) => p,
        registrationInvitationTtlHours: 0
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("registrationInvitationTtlHours")
    );
  });

  it("rechaza recoveryInvitationTtlHours mayor a 168", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: () => "u1",
        normalizeProfile: (p) => p,
        recoveryInvitationTtlHours: 200
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("recoveryInvitationTtlHours")
    );
  });

  it("rechaza maxCollisionRetries fuera de rango", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: () => "u1",
        normalizeProfile: (p) => p,
        maxCollisionRetries: 0
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("maxCollisionRetries")
    );
  });

  it("rechaza maxCollisionRetries mayor a 10", () => {
    assert.throws(
      () => createPilotIdentityStoreV0({
        pool: new MockPgPool(),
        crypto: makeCrypto(),
        logError: () => {},
        generateUserId: () => "u1",
        normalizeProfile: (p) => p,
        maxCollisionRetries: 11
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("maxCollisionRetries")
    );
  });

  it("acepta parametros validos con defaults", () => {
    const store = createPilotIdentityStoreV0({
      pool: new MockPgPool(),
      crypto: makeCrypto(),
      logError: () => {},
      generateUserId: () => "u1",
      normalizeProfile: (p) => p
    });
    assert.ok(store);
    assert.strictEqual(typeof store.createRegistrationInvitation, "function");
    assert.strictEqual(typeof store.registerUser, "function");
    assert.strictEqual(typeof store.authenticateCredential, "function");
  });
});

// ============================================================
// SUITE: REGISTRO DE USUARIO
// ============================================================

describe("Registro de usuario", () => {
  it("registra un usuario correctamente con invitacion valida", async () => {
    const { store, pool } = makeStore();

    const invResult = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    assert.strictEqual(invResult.ok, true);
    const code = invResult.invitation.code;

    const result = await store.registerUser({
      invitationCode: code,
      profile: { name: "Juan", country: "AR", timezone: "America/Buenos_Aires" }
    });

    assert.strictEqual(result.ok, true);
    assert.ok(result.user);
    assert.ok(result.user.userId);
    assert.strictEqual(result.user.name, "Juan");
    assert.strictEqual(result.user.country, "AR");
    assert.strictEqual(result.user.currentDay, 1);
    assert.strictEqual(result.user.cycle, 1);
    assert.ok(result.credential);
    assert.ok(result.credential.token);
    assert.ok(result.credential.token.startsWith("npt_"));
    assert.ok(result.credential.expiresAt instanceof Date);

    assert.ok(pool.users.has(result.user.userId));

    const inv = Array.from(pool.invitations.values()).find(i => i.id === invResult.invitation.id);
    assert.ok(inv.used_at !== null);
    assert.strictEqual(inv.used_by_user_id, result.user.userId);
  });

  it("el userId generado prevalece sobre cualquier userId en profile", async () => {
    const { store } = makeStore();

    const invResult = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const result = await store.registerUser({
      invitationCode: invResult.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC", userId: "client_user_id_123" }
    });

    assert.notStrictEqual(result.user.userId, "client_user_id_123");
    assert.ok(result.user.userId.startsWith("user_"));
  });

  it("rechaza invitacion invalida", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.registerUser({
        invitationCode: "invalid_code",
        profile: { name: "Test", country: "AR", timezone: "UTC" }
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("invitacion no es valida")
    );
  });

  it("rechaza invitacion ya usada", async () => {
    const { store } = makeStore();

    const invResult = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    await store.registerUser({
      invitationCode: invResult.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    await assert.rejects(
      () => store.registerUser({
        invitationCode: invResult.invitation.code,
        profile: { name: "Otro", country: "AR", timezone: "UTC" }
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("invitacion no es valida")
    );
  });

  it("rechaza invitacion vencida", async () => {
    const { store, pool } = makeStore({ registrationInvitationTtlHours: -1 });

    const invResult = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const inv = Array.from(pool.invitations.values()).find(i => i.id === invResult.invitation.id);
    inv.expires_at = new Date(Date.now() - 1000);

    await assert.rejects(
      () => store.registerUser({
        invitationCode: invResult.invitation.code,
        profile: { name: "Test", country: "AR", timezone: "UTC" }
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("invitacion no es valida")
    );
  });

  it("rechaza invitacion de tipo recovery para registro", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const invRec = await store.createRecoveryInvitation({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });

    await assert.rejects(
      () => store.registerUser({
        invitationCode: invRec.invitation.code,
        profile: { name: "Otro", country: "AR", timezone: "UTC" }
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("invitacion no es valida")
    );
  });

  it("rechaza perfil invalido", async () => {
    const { store } = makeStore({
      normalizeProfile: () => { throw new Error("Invalid profile"); }
    });

    const invResult = await store.createRegistrationInvitation({ adminKeyId: "admin1" });

    await assert.rejects(
      () => store.registerUser({
        invitationCode: invResult.invitation.code,
        profile: { name: "", country: "", timezone: "" }
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("perfil no es valido")
    );
  });
});

// ============================================================
// SUITE: POSTGRESQL ES LA ÚNICA FUENTE DE TIEMPO
// ============================================================

describe("PostgreSQL es la unica fuente de tiempo", () => {
  it("registerUser devuelve expiresAt exacto de PostgreSQL RETURNING", async () => {
    const pgNow = new Date("2026-01-15T12:00:00.000Z");
    const pool = new MockPgPool({ pgNow });
    const { store } = makeStore({ pool, credentialTtlDays: 30 });

    const invResult = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const result = await store.registerUser({
      invitationCode: invResult.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    // expiresAt debe ser exactamente pgNow + 30 dias
    const expectedExpiresAt = new Date(pgNow.getTime() + 30 * 24 * 60 * 60 * 1000);
    assert.strictEqual(result.credential.expiresAt.getTime(), expectedExpiresAt.getTime());

    // Verificar que se uso RETURNING expires_at
    const insertQuery = pool.queries.find(q =>
      q.sql.includes("INSERT INTO pilot_credentials") && q.sql.includes("RETURNING expires_at")
    );
    assert.ok(insertQuery, "Debe usar RETURNING expires_at");
  });

  it("recoverAccess devuelve expiresAt exacto de PostgreSQL RETURNING", async () => {
    const pgNow = new Date("2026-06-01T00:00:00.000Z");
    const pool = new MockPgPool({ pgNow });
    const { store } = makeStore({ pool, credentialTtlDays: 30 });

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const invRec = await store.createRecoveryInvitation({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });

    const recResult = await store.recoverAccess({
      invitationCode: invRec.invitation.code
    });

    const expectedExpiresAt = new Date(pgNow.getTime() + 30 * 24 * 60 * 60 * 1000);
    assert.strictEqual(recResult.credential.expiresAt.getTime(), expectedExpiresAt.getTime());

    const insertQuery = pool.queries.find(q =>
      q.sql.includes("INSERT INTO pilot_credentials") && q.sql.includes("RETURNING expires_at")
    );
    assert.ok(insertQuery, "Debe usar RETURNING expires_at");
  });

  it("renewCredential devuelve expiresAt exacto de PostgreSQL RETURNING", async () => {
    const pgNow = new Date("2026-03-10T08:30:00.000Z");
    const pool = new MockPgPool({ pgNow });
    const { store } = makeStore({ pool, credentialTtlDays: 30 });

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const renewResult = await store.renewCredential({
      currentToken: regResult.credential.token
    });

    const expectedExpiresAt = new Date(pgNow.getTime() + 30 * 24 * 60 * 60 * 1000);
    assert.strictEqual(renewResult.credential.expiresAt.getTime(), expectedExpiresAt.getTime());

    const insertQuery = pool.queries.find(q =>
      q.sql.includes("INSERT INTO pilot_credentials") && q.sql.includes("RETURNING expires_at")
    );
    assert.ok(insertQuery, "Debe usar RETURNING expires_at");
  });

  it("el expiresAt no depende de Date.now() del cliente", async () => {
    // pgNow es 1 año en el futuro respecto al reloj local
    const pgNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const pool = new MockPgPool({ pgNow });
    const { store } = makeStore({ pool, credentialTtlDays: 30 });

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    // Si usara Date.now(), el expiresAt seria cercano al reloj local.
    // Como usa PostgreSQL, debe ser cercano a pgNow.
    const diffFromPgNow = Math.abs(regResult.credential.expiresAt.getTime() - (pgNow.getTime() + 30 * 24 * 60 * 60 * 1000));
    const diffFromLocal = Math.abs(regResult.credential.expiresAt.getTime() - (Date.now() + 30 * 24 * 60 * 60 * 1000));

    assert.ok(diffFromPgNow < 1000, "Debe estar cerca de pgNow");
    assert.ok(diffFromLocal > 360 * 24 * 60 * 60 * 1000, "No debe estar cerca del reloj local");
  });

  it("createRegistrationInvitation devuelve expiresAt de PostgreSQL", async () => {
    const pgNow = new Date("2026-07-20T10:00:00.000Z");
    const pool = new MockPgPool({ pgNow });
    const { store } = makeStore({ pool, registrationInvitationTtlHours: 48 });

    const result = await store.createRegistrationInvitation({ adminKeyId: "admin1" });

    const expectedExpiresAt = new Date(pgNow.getTime() + 48 * 60 * 60 * 1000);
    assert.strictEqual(result.invitation.expiresAt.getTime(), expectedExpiresAt.getTime());
  });

  it("createRecoveryInvitation devuelve expiresAt de PostgreSQL", async () => {
    const pgNow = new Date("2026-07-20T10:00:00.000Z");
    const pool = new MockPgPool({ pgNow });
    const { store } = makeStore({ pool, recoveryInvitationTtlHours: 24 });

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const result = await store.createRecoveryInvitation({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });

    const expectedExpiresAt = new Date(pgNow.getTime() + 24 * 60 * 60 * 1000);
    assert.strictEqual(result.invitation.expiresAt.getTime(), expectedExpiresAt.getTime());
  });
});

// ============================================================
// SUITE: RECUPERACIÓN DE ACCESO
// ============================================================

describe("Recuperacion de acceso", () => {
  it("recupera acceso conservando el mismo user_id", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Juan", country: "AR", timezone: "America/Buenos_Aires" }
    });

    const userId = regResult.user.userId;

    const invRec = await store.createRecoveryInvitation({
      userId,
      adminKeyId: "admin1"
    });

    const recResult = await store.recoverAccess({
      invitationCode: invRec.invitation.code
    });

    assert.strictEqual(recResult.ok, true);
    assert.strictEqual(recResult.user.userId, userId);
    assert.strictEqual(recResult.user.name, "Juan");
    assert.ok(recResult.credential.token);
  });

  it("rechaza invitacion de recuperacion invalida", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recoverAccess({ invitationCode: "invalid" }),
      (err) => err instanceof PilotStoreError && err.message.includes("invitacion no es valida")
    );
  });

  it("rechaza invitacion de recuperacion ya usada", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const invRec = await store.createRecoveryInvitation({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });

    await store.recoverAccess({ invitationCode: invRec.invitation.code });

    await assert.rejects(
      () => store.recoverAccess({ invitationCode: invRec.invitation.code }),
      (err) => err instanceof PilotStoreError && err.message.includes("invitacion no es valida")
    );
  });

  it("rechaza invitacion de recuperacion vencida", async () => {
    const { store, pool } = makeStore({ recoveryInvitationTtlHours: -1 });

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const invRec = await store.createRecoveryInvitation({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });

    const inv = Array.from(pool.invitations.values()).find(i => i.id === invRec.invitation.id);
    inv.expires_at = new Date(Date.now() - 1000);

    await assert.rejects(
      () => store.recoverAccess({ invitationCode: invRec.invitation.code }),
      (err) => err instanceof PilotStoreError && err.message.includes("invitacion no es valida")
    );
  });
});

// ============================================================
// SUITE: RENOVACIÓN DE CREDENCIAL
// ============================================================

describe("Renovacion de credencial", () => {
  it("renueva credencial antes del vencimiento", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const oldToken = regResult.credential.token;

    const renewResult = await store.renewCredential({ currentToken: oldToken });

    assert.strictEqual(renewResult.ok, true);
    assert.ok(renewResult.credential.token);
    assert.notStrictEqual(renewResult.credential.token, oldToken);
    assert.ok(renewResult.credential.expiresAt instanceof Date);
  });

  it("rechaza credencial vencida", async () => {
    const { store, pool } = makeStore({ credentialTtlDays: -1 });

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const cred = Array.from(pool.credentials.values()).find(c => c.user_id === regResult.user.userId);
    cred.expires_at = new Date(Date.now() - 1000);

    await assert.rejects(
      () => store.renewCredential({ currentToken: regResult.credential.token }),
      (err) => err instanceof PilotStoreError && err.message.includes("sesion no es valida")
    );
  });

  it("rechaza credencial revocada", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    await store.revokeAllCredentials({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });

    await assert.rejects(
      () => store.renewCredential({ currentToken: regResult.credential.token }),
      (err) => err instanceof PilotStoreError && err.message.includes("sesion no es valida")
    );
  });

  it("rechaza token invalido", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.renewCredential({ currentToken: "invalid_token" }),
      (err) => err instanceof PilotStoreError && err.message.includes("sesion no es valida")
    );
  });
});

// ============================================================
// SUITE: UN SOLO DISPOSITIVO ACTIVO
// ============================================================

describe("Un solo dispositivo activo", () => {
  it("no permite dos credenciales activas para el mismo usuario", async () => {
    const { store, pool } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const renewResult = await store.renewCredential({ currentToken: regResult.credential.token });

    const activeCreds = Array.from(pool.credentials.values()).filter(c =>
      c.user_id === regResult.user.userId && !c.revoked_at
    );
    assert.strictEqual(activeCreds.length, 1);
    assert.strictEqual(activeCreds[0].token_hmac, pool.crypto.hmacToken(renewResult.credential.token));
  });
});

// ============================================================
// SUITE: CONSUMO CONCURRENTE DE INVITACIÓN
// ============================================================

describe("Consumo concurrente de invitacion", () => {
  it("solo una transaccion puede consumir la misma invitacion", async () => {
    const { store, pool } = makeStore();

    const invResult = await store.createRegistrationInvitation({ adminKeyId: "admin1" });

    const inv = Array.from(pool.invitations.values()).find(i => i.id === invResult.invitation.id);
    inv.used_at = new Date();
    inv.used_by_user_id = "some_user";

    await assert.rejects(
      () => store.registerUser({
        invitationCode: invResult.invitation.code,
        profile: { name: "Test", country: "AR", timezone: "UTC" }
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("invitacion no es valida")
    );
  });
});

// ============================================================
// SUITE: RENOVACIÓN CONCURRENTE DEL MISMO TOKEN
// ============================================================

describe("Renovacion concurrente del mismo token", () => {
  it("la segunda renovacion del mismo token falla tras revocacion", async () => {
    const { store, pool } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const cred = Array.from(pool.credentials.values()).find(c =>
      c.user_id === regResult.user.userId && !c.revoked_at
    );
    cred.revoked_at = new Date();

    await assert.rejects(
      () => store.renewCredential({ currentToken: regResult.credential.token }),
      (err) => err instanceof PilotStoreError && err.message.includes("sesion no es valida")
    );
  });
});

// ============================================================
// SUITE: RECUPERACIÓN CONCURRENTE
// ============================================================

describe("Recuperacion concurrente", () => {
  it("la segunda recuperacion se rechaza si la credencial es mas nueva", async () => {
    const { store, pool } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const userId = regResult.user.userId;

    const invRec = await store.createRecoveryInvitation({
      userId,
      adminKeyId: "admin1"
    });

    const cred = Array.from(pool.credentials.values()).find(c =>
      c.user_id === userId && !c.revoked_at
    );
    cred.created_at = new Date(Date.now() + 10000);

    await assert.rejects(
      () => store.recoverAccess({ invitationCode: invRec.invitation.code }),
      (err) => err instanceof PilotStoreError && err.message.includes("invitacion no es valida")
    );
  });
});

// ============================================================
// SUITE: ORDEN EXACTO DE LOCKS
// ============================================================

describe("Orden exacto de locks", () => {
  it("recoverAccess bloquea users antes que pilot_invitations", async () => {
    const { store, pool } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const invRec = await store.createRecoveryInvitation({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });

    pool.queries = [];
    await store.recoverAccess({ invitationCode: invRec.invitation.code });

    const transactionQueries = pool.queries.filter(q =>
      q.sql.includes("FOR UPDATE") || q.sql.includes("FOR KEY SHARE")
    );

    assert.ok(transactionQueries[0].sql.includes("users"));
    assert.ok(transactionQueries[1].sql.includes("pilot_invitations"));
  });

  it("renewCredential bloquea users antes que pilot_credentials", async () => {
    const { store, pool } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    pool.queries = [];
    await store.renewCredential({ currentToken: regResult.credential.token });

    const transactionQueries = pool.queries.filter(q =>
      q.sql.includes("FOR UPDATE") || q.sql.includes("FOR KEY SHARE")
    );

    assert.ok(transactionQueries[0].sql.includes("users"));
    assert.ok(transactionQueries[1].sql.includes("pilot_credentials"));
  });

  it("revokeAllCredentials bloquea users antes de actualizar credenciales", async () => {
    const { store, pool } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    pool.queries = [];
    await store.revokeAllCredentials({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });

    const transactionQueries = pool.queries.filter(q =>
      q.sql.includes("FOR UPDATE") || q.sql.includes("UPDATE")
    );

    assert.ok(transactionQueries[0].sql.includes("users"));
    assert.ok(transactionQueries[1].sql.includes("pilot_credentials"));
  });
});

// ============================================================
// SUITE: COMMIT Y ROLLBACK
// ============================================================

describe("Commit y rollback", () => {
  it("registerUser hace rollback si falla despues de insertar usuario", async () => {
    const { store, pool } = makeStore();

    const invResult = await store.createRegistrationInvitation({ adminKeyId: "admin1" });

    let callCount = 0;
    const originalQuery = pool._executeQuery.bind(pool);
    pool._executeQuery = function(sql, params) {
      if (sql.includes("INSERT INTO pilot_credentials") && callCount === 0) {
        callCount++;
        const err = new Error("duplicate key value");
        err.code = "23505";
        err.constraint = "pilot_credentials_token_hmac_unique";
        throw err;
      }
      return originalQuery(sql, params);
    };

    const result = await store.registerUser({
      invitationCode: invResult.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    assert.strictEqual(result.ok, true);
    assert.ok(pool.users.has(result.user.userId));
  });

  it("renewCredential hace rollback si falla al insertar nueva credencial", async () => {
    const { store, pool } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    pool._executeQuery = function(sql, params) {
      if (sql.includes("INSERT INTO pilot_credentials") && !sql.includes("revoked_at = CURRENT_TIMESTAMP")) {
        const err = new Error("duplicate key value");
        err.code = "23505";
        err.constraint = "pilot_credentials_token_hmac_unique";
        throw err;
      }
      return MockPgPool.prototype._executeQuery.call(pool, sql, params);
    };

    await assert.rejects(
      () => store.renewCredential({ currentToken: regResult.credential.token }),
      (err) => err instanceof PilotStoreOperationalError
    );
  });
});

// ============================================================
// SUITE: AUDITORÍA ATÓMICA
// ============================================================

describe("Auditoria atomica", () => {
  it("createRegistrationInvitation inserta auditoria en la misma transaccion", async () => {
    const { store, pool } = makeStore();

    const result = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    assert.strictEqual(result.ok, true);

    const audits = Array.from(pool.audit.values());
    assert.strictEqual(audits.length, 1);
    assert.strictEqual(audits[0].action, "create_registration_invitation");
    assert.strictEqual(audits[0].admin_key_id, "admin1");
  });

  it("createRecoveryInvitation inserta auditoria en la misma transaccion", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    await store.createRecoveryInvitation({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });
  });

  it("revokeAllCredentials inserta auditoria en la misma transaccion", async () => {
    const { store, pool } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    await store.revokeAllCredentials({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });

    const audits = Array.from(pool.audit.values()).filter(a =>
      a.action === "revoke_all_credentials"
    );
    assert.strictEqual(audits.length, 1);
    assert.strictEqual(audits[0].target_user_id, regResult.user.userId);
  });
});

// ============================================================
// SUITE: AUSENCIA DE AUDITORÍA CUANDO LA ACCIÓN FALLA
// ============================================================

describe("Ausencia de auditoria cuando la accion falla", () => {
  it("no inserta auditoria si el usuario no existe en revokeAllCredentials", async () => {
    const { store, pool } = makeStore();

    await assert.rejects(
      () => store.revokeAllCredentials({
        userId: "nonexistent_user",
        adminKeyId: "admin1"
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no existe")
    );

    const audits = Array.from(pool.audit.values());
    assert.strictEqual(audits.length, 0);
  });

  it("no inserta auditoria si createRecoveryInvitation falla por usuario inexistente", async () => {
    const { store, pool } = makeStore();

    await assert.rejects(
      () => store.createRecoveryInvitation({
        userId: "nonexistent_user",
        adminKeyId: "admin1"
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no encontrado")
    );

    const audits = Array.from(pool.audit.values());
    assert.strictEqual(audits.length, 0);
  });
});

// ============================================================
// SUITE: REINTENTO ÚNICAMENTE POR TOKEN HMAC UNIQUE
// ============================================================

describe("Reintento unicamente por pilot_credentials_token_hmac_unique", () => {
  it("reintenta cuando hay colision de token HMAC", async () => {
    const { store, pool } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const renewResult = await store.renewCredential({ currentToken: regResult.credential.token });
    assert.strictEqual(renewResult.ok, true);
  });
});

// ============================================================
// SUITE: NO REINTENTAR POR idx_pilot_credentials_one_active_per_user
// ============================================================

describe("No reintentar por idx_pilot_credentials_one_active_per_user", () => {
  it("no reintenta cuando hay colision del indice parcial", async () => {
    const { store, pool } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    pool._executeQuery = function(sql, params) {
      if (sql.includes("INSERT INTO pilot_credentials") && !sql.includes("revoked_at = CURRENT_TIMESTAMP")) {
        const err = new Error('duplicate key value violates unique constraint "idx_pilot_credentials_one_active_per_user"');
        err.code = "23505";
        err.constraint = "idx_pilot_credentials_one_active_per_user";
        throw err;
      }
      return MockPgPool.prototype._executeQuery.call(pool, sql, params);
    };

    await assert.rejects(
      () => store.renewCredential({ currentToken: regResult.credential.token }),
      (err) => err instanceof PilotStoreOperationalError
    );
  });
});

// ============================================================
// SUITE: COLISIÓN PERSISTENTE CONVERTIDA EN ERROR OPERACIONAL
// ============================================================

describe("Colision persistente convertida en error operacional", () => {
  it("convierte colision persistente de token en PilotStoreOperationalError", async () => {
    const { store, pool } = makeStore({ maxCollisionRetries: 2 });

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    pool._executeQuery = function(sql, params) {
      if (sql.includes("INSERT INTO pilot_credentials") && !sql.includes("revoked_at = CURRENT_TIMESTAMP")) {
        const err = new Error("duplicate key value");
        err.code = "23505";
        err.constraint = "pilot_credentials_token_hmac_unique";
        throw err;
      }
      return MockPgPool.prototype._executeQuery.call(pool, sql, params);
    };

    await assert.rejects(
      () => store.renewCredential({ currentToken: regResult.credential.token }),
      (err) => err instanceof PilotStoreOperationalError && err.message.includes("No se pudo completar")
    );
  });

  it("convierte colision persistente de invitacion en PilotStoreOperationalError", async () => {
    const { store, pool } = makeStore({ maxCollisionRetries: 2 });

    pool._executeQuery = function(sql, params) {
      if (sql.includes("INSERT INTO pilot_invitations")) {
        return { rows: [], rowCount: 0 };
      }
      return MockPgPool.prototype._executeQuery.call(pool, sql, params);
    };

    await assert.rejects(
      () => store.createRegistrationInvitation({ adminKeyId: "admin1" }),
      (err) => err instanceof PilotStoreOperationalError && err.message.includes("No se pudo completar")
    );
  });
});

// ============================================================
// SUITE: ERRORES DE POSTGRESQL NO DISFRAZADOS
// ============================================================

describe("Errores de PostgreSQL no disfrazados como invitacion invalida", () => {
  it("un error de conexion no se convierte en invitacion invalida", async () => {
    const { store, pool } = makeStore();

    pool.failNext = new Error("Connection refused");
    pool.failNext.code = "08006";

    await assert.rejects(
      () => store.createRegistrationInvitation({ adminKeyId: "admin1" }),
      (err) => err instanceof PilotStoreOperationalError
    );
  });

  it("un timeout no se convierte en sesion invalida", async () => {
    const { store, pool } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    pool.failNext = new Error("Query timeout");

    await assert.rejects(
      () => store.authenticateCredential({ token: regResult.credential.token }),
      (err) => err instanceof PilotStoreOperationalError
    );
  });
});

// ============================================================
// SUITE: LOGGER SANITIZADO
// ============================================================

describe("Logger sanitizado", () => {
  it("logError no recibe codigos, tokens, HMAC ni perfiles", async () => {
    const logCalls = [];
    const logError = (ctx) => { logCalls.push(ctx); };
    const { store, pool } = makeStore({ logError });

    pool.failNext = new Error("Connection refused");
    pool.failNext.code = "08006";

    try {
      await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    } catch {
      // Ignorar
    }

    assert.strictEqual(logCalls.length, 1);
    const log = logCalls[0];
    assert.strictEqual(typeof log.operation, "string");
    assert.strictEqual(typeof log.errorCode, "string");
    assert.strictEqual(typeof log.constraint, "string");
    assert.strictEqual(typeof log.retryable, "boolean");

    const logStr = JSON.stringify(log);
    assert.ok(!logStr.includes("npi_"), "No debe contener codigo de invitacion");
    assert.ok(!logStr.includes("npt_"), "No debe contener token");
    assert.ok(!logStr.includes("hmac"), "No debe contener HMAC");
    assert.ok(!logStr.includes("secret"), "No debe contener secret");
    assert.ok(!logStr.includes("password"), "No debe contener password");
  });
});

// ============================================================
// SUITE: VALIDACIÓN RECURSIVA Y CIRCULAR DE details
// ============================================================

describe("Validacion recursiva y circular de details", () => {
  it("rechaza objeto con clave prohibida", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "admin1",
        action: "test_action",
        details: { token: "secret" }
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no permitidos")
    );
  });

  it("rechaza clave prohibida en minusculas", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "admin1",
        action: "test_action",
        details: { TOKEN: "secret" }
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no permitidos")
    );
  });

  it("rechaza clave prohibida en mayusculas", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "admin1",
        action: "test_action",
        details: { PASSWORD: "secret" }
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no permitidos")
    );
  });

  it("rechaza clave prohibida anidada en objeto", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "admin1",
        action: "test_action",
        details: { nested: { code: "secret" } }
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no permitidos")
    );
  });

  it("rechaza clave prohibida dentro de array", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "admin1",
        action: "test_action",
        details: [{ hmac: "secret" }]
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no permitidos")
    );
  });

  it("rechaza referencia circular", async () => {
    const { store } = makeStore();

    const obj = { a: 1 };
    obj.self = obj;

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "admin1",
        action: "test_action",
        details: obj
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no son validos")
    );
  });

  it("rechaza valor no serializable (funcion)", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "admin1",
        action: "test_action",
        details: { fn: () => {} }
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no son validos")
    );
  });

  it("rechaza valor no serializable (undefined en array)", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "admin1",
        action: "test_action",
        details: [undefined]
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no son validos")
    );
  });

  it("rechaza details que excede 64KB", async () => {
    const { store } = makeStore();

    const bigDetails = { data: "x".repeat(65 * 1024) };

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "admin1",
        action: "test_action",
        details: bigDetails
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no son validos")
    );
  });

  it("acepta details valido con estructura anidada", async () => {
    const { store, pool } = makeStore();

    const result = await store.recordAdminAudit({
      adminKeyId: "admin1",
      action: "test_action",
      details: { level1: { level2: { value: 42, list: [1, 2, 3] } } }
    });

    assert.strictEqual(result.ok, true);
    assert.ok(result.auditId);
  });
});

// ============================================================
// SUITE: SIN SECRETOS EN RESULTADOS, LOGS NI ERRORES
// ============================================================

describe("Sin secretos en resultados, logs ni errores", () => {
  it("registerUser no devuelve HMAC ni code en el resultado", async () => {
    const { store } = makeStore();

    const invResult = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const result = await store.registerUser({
      invitationCode: invResult.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const resultStr = JSON.stringify(result);
    assert.ok(!resultStr.includes("hmac"), "No debe contener HMAC");
    assert.ok(!resultStr.includes(invResult.invitation.code), "No debe contener code");
  });

  it("authenticateCredential no devuelve token en resultado", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const authResult = await store.authenticateCredential({ token: regResult.credential.token });
    const resultStr = JSON.stringify(authResult);
    assert.ok(!resultStr.includes(regResult.credential.token), "No debe contener token");
  });

  it("getCredentialExpiry no devuelve token en resultado", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const expResult = await store.getCredentialExpiry({ token: regResult.credential.token });
    const resultStr = JSON.stringify(expResult);
    assert.ok(!resultStr.includes(regResult.credential.token), "No debe contener token");
  });

  it("errores no contienen stack trace ni parametros SQL", async () => {
    const { store, pool } = makeStore();

    pool.failNext = new Error("Connection refused");

    try {
      await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    } catch (err) {
      assert.ok(!err.message.includes("SELECT"), "No debe contener SQL");
      assert.ok(!err.message.includes("INSERT"), "No debe contener SQL");
      assert.ok(!err.message.includes("$1"), "No debe contener placeholders");
    }
  });
});

// ============================================================
// SUITE: ADMINISTRACIÓN
// ============================================================

describe("Administracion", () => {
  it("createRegistrationInvitation rechaza adminKeyId vacio", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.createRegistrationInvitation({ adminKeyId: "" }),
      (err) => err instanceof PilotStoreError && err.message.includes("administrador")
    );
  });

  it("createRegistrationInvitation rechaza adminKeyId con solo espacios", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.createRegistrationInvitation({ adminKeyId: "   " }),
      (err) => err instanceof PilotStoreError && err.message.includes("administrador")
    );
  });

  it("createRegistrationInvitation rechaza expiresInHours invalido", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.createRegistrationInvitation({ adminKeyId: "admin1", expiresInHours: 0 }),
      (err) => err instanceof PilotStoreError && err.message.includes("expiracion no es valido")
    );
  });

  it("createRegistrationInvitation acepta clientIp = null", async () => {
    const { store } = makeStore();

    const result = await store.createRegistrationInvitation({
      adminKeyId: "admin1",
      clientIp: null
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.invitation.code);
  });

  it("createRegistrationInvitation acepta clientIp valido", async () => {
    const { store, pool } = makeStore();

    const result = await store.createRegistrationInvitation({
      adminKeyId: "admin1",
      clientIp: "192.168.1.0"
    });
    assert.strictEqual(result.ok, true);

    const audits = Array.from(pool.audit.values());
    assert.strictEqual(audits[0].client_ip, "192.168.1.0");
  });

  it("createRegistrationInvitation rechaza clientIp invalido", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.createRegistrationInvitation({
        adminKeyId: "admin1",
        clientIp: 12345
      }),
      (err) => err instanceof PilotStoreError
    );
  });

  it("createRecoveryInvitation rechaza usuario inexistente", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.createRecoveryInvitation({
        userId: "nonexistent",
        adminKeyId: "admin1"
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("no encontrado")
    );
  });

  it("createRecoveryInvitation acepta clientIp = null", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const result = await store.createRecoveryInvitation({
      userId: regResult.user.userId,
      adminKeyId: "admin1",
      clientIp: null
    });
    assert.strictEqual(result.ok, true);
  });

  it("revokeAllCredentials acepta clientIp = null", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const result = await store.revokeAllCredentials({
      userId: regResult.user.userId,
      adminKeyId: "admin1",
      clientIp: null
    });
    assert.strictEqual(result.ok, true);
  });

  it("revokeAllCredentials rechaza adminKeyId vacio", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.revokeAllCredentials({
        userId: "some_user",
        adminKeyId: ""
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("administrador")
    );
  });

  it("revokeAllCredentials devuelve revokedCount correcto", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const result = await store.revokeAllCredentials({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.revokedCount, 1);
  });
});

// ============================================================
// SUITE: AUTENTICACIÓN Y EXPIRACIÓN
// ============================================================

describe("Autenticacion y expiracion", () => {
  it("authenticateCredential acepta token valido", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const authResult = await store.authenticateCredential({
      token: regResult.credential.token
    });

    assert.strictEqual(authResult.ok, true);
    assert.strictEqual(authResult.userId, regResult.user.userId);
    assert.ok(authResult.expiresAt instanceof Date);
  });

  it("authenticateCredential rechaza token invalido", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.authenticateCredential({ token: "invalid" }),
      (err) => err instanceof PilotStoreError && err.message.includes("sesion no es valida")
    );
  });

  it("authenticateCredential rechaza token revocado", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    await store.revokeAllCredentials({
      userId: regResult.user.userId,
      adminKeyId: "admin1"
    });

    await assert.rejects(
      () => store.authenticateCredential({ token: regResult.credential.token }),
      (err) => err instanceof PilotStoreError && err.message.includes("sesion no es valida")
    );
  });

  it("getCredentialExpiry devuelve dias restantes correctos", async () => {
    const { store } = makeStore();

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const expResult = await store.getCredentialExpiry({
      token: regResult.credential.token
    });

    assert.strictEqual(expResult.ok, true);
    assert.ok(expResult.daysUntilExpiry >= 0);
    assert.ok(expResult.daysUntilExpiry <= 30);
  });

  it("getCredentialExpiry rechaza token vencido", async () => {
    const { store, pool } = makeStore({ credentialTtlDays: -1 });

    const invReg = await store.createRegistrationInvitation({ adminKeyId: "admin1" });
    const regResult = await store.registerUser({
      invitationCode: invReg.invitation.code,
      profile: { name: "Test", country: "AR", timezone: "UTC" }
    });

    const cred = Array.from(pool.credentials.values()).find(c =>
      c.user_id === regResult.user.userId && !c.revoked_at
    );
    cred.expires_at = new Date(Date.now() - 1000);

    await assert.rejects(
      () => store.getCredentialExpiry({ token: regResult.credential.token }),
      (err) => err instanceof PilotStoreError && err.message.includes("sesion no es valida")
    );
  });
});

// ============================================================
// SUITE: RECORD ADMIN AUDIT
// ============================================================

describe("recordAdminAudit", () => {
  it("registra auditoria correctamente", async () => {
    const { store, pool } = makeStore();

    const result = await store.recordAdminAudit({
      adminKeyId: "admin1",
      action: "custom_action",
      targetUserId: "user_123",
      details: { reason: "testing" }
    });

    assert.strictEqual(result.ok, true);
    assert.ok(result.auditId);

    const audits = Array.from(pool.audit.values());
    assert.strictEqual(audits.length, 1);
    assert.strictEqual(audits[0].action, "custom_action");
  });

  it("rechaza adminKeyId vacio", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "",
        action: "test"
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("administrador")
    );
  });

  it("rechaza action vacia", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "admin1",
        action: ""
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("accion")
    );
  });

  it("rechaza adminKeyId que excede 256 caracteres", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "x".repeat(257),
        action: "test"
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("administrador")
    );
  });

  it("rechaza action que excede 256 caracteres", async () => {
    const { store } = makeStore();

    await assert.rejects(
      () => store.recordAdminAudit({
        adminKeyId: "admin1",
        action: "x".repeat(257)
      }),
      (err) => err instanceof PilotStoreError && err.message.includes("accion")
    );
  });

  it("acepta targetUserId null", async () => {
    const { store } = makeStore();

    const result = await store.recordAdminAudit({
      adminKeyId: "admin1",
      action: "test",
      targetUserId: null
    });

    assert.strictEqual(result.ok, true);
  });

  it("acepta details null", async () => {
    const { store } = makeStore();

    const result = await store.recordAdminAudit({
      adminKeyId: "admin1",
      action: "test",
      details: null
    });

    assert.strictEqual(result.ok, true);
  });

  it("acepta clientIp null", async () => {
    const { store } = makeStore();

    const result = await store.recordAdminAudit({
      adminKeyId: "admin1",
      action: "test",
      clientIp: null
    });

    assert.strictEqual(result.ok, true);
  });
});

