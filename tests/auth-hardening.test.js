// NU APP · PRUEBAS DE ENDURECIMIENTO DEL ACCESO V110
// Reproducen las restricciones reales de PostgreSQL (índice único parcial
// sobre users.email, consumo atómico del código y transacción con ROLLBACK)
// sin necesitar la base de datos ni credenciales.

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  startTestServer,
  lastCodeFromEmails,
  TEST_PEPPER
} = require("./helpers/test-server");
const { createMemoryAuthStore } = require("./memory-auth-store");
const {
  assertProductionAuthConfig,
  createAuthService,
  createCodeHasher,
  createEmailSender
} = require("../auth-core");

async function requestCode(server, email, extra = {}) {
  const response = await server.call("/api/auth/request-code", {
    method: "POST",
    body: { email },
    ...extra
  });

  return { response, code: lastCodeFromEmails(server.emails) };
}

async function login(server, email = "persona@ejemplo.com") {
  const { code } = await requestCode(server, email);

  const verified = await server.call("/api/auth/verify-code", {
    method: "POST",
    body: { email, code }
  });

  assert.equal(verified.status, 200);

  return { code, userId: verified.payload.userId };
}

test("el código se guarda como HMAC-SHA256 con pepper, no como SHA-256 pelado", async t => {
  const server = await startTestServer();
  t.after(() => server.close());

  const { code } = await requestCode(server, "persona@ejemplo.com");
  const stored = server.store.codes[server.store.codes.length - 1];

  const sha256 = crypto.createHash("sha256").update(code).digest("hex");
  const hmac = createCodeHasher(TEST_PEPPER)("persona@ejemplo.com", code);

  assert.notEqual(stored.codeHash, sha256);
  assert.equal(stored.codeHash, hmac);
});

test("sin pepper el servicio de acceso no se puede construir", () => {
  assert.throws(
    () =>
      createAuthService({
        store: createMemoryAuthStore(),
        sendEmail: async () => ({ delivered: true }),
        codePepper: ""
      }),
    /AUTH_CODE_PEPPER/
  );
});

test("dos verificaciones simultáneas del mismo código: sólo una crea sesión", async t => {
  // El store cede el turno antes del bloque atómico, así ambas peticiones
  // llegan a competir por la misma fila, como dos transacciones reales.
  const store = createMemoryAuthStore({
    faults: {
      beforeConsume: () => new Promise(resolve => setTimeout(resolve, 25))
    }
  });

  const server = await startTestServer({ store });
  t.after(() => server.close());

  const email = "persona@ejemplo.com";
  const { code } = await requestCode(server, email);

  const [first, second] = await Promise.all([
    server.call("/api/auth/verify-code", {
      method: "POST",
      body: { email, code },
      withCookie: false
    }),
    server.call("/api/auth/verify-code", {
      method: "POST",
      body: { email, code },
      withCookie: false
    })
  ]);

  const statuses = [first.status, second.status].sort();

  assert.deepEqual(statuses, [200, 401]);
  assert.equal(store.sessions.size, 1);
  assert.equal(store.users.size, 1);
});

test("la vinculación heredada respeta el índice único de correo", async t => {
  const store = createMemoryAuthStore({
    users: [{ id: "usr_legacy", name: "Cuenta anterior", email: null }]
  });

  const server = await startTestServer({ store });
  t.after(() => server.close());

  const { userId: temporaryId } = await login(server);

  const linked = await server.call("/api/auth/link-legacy-account", {
    method: "POST",
    body: { legacyUserId: "usr_legacy" }
  });

  assert.equal(linked.status, 200);

  // El correo quedó en una sola fila: la temporal se borró.
  const withEmail = [...store.users.values()].filter(
    user => user.email === "persona@ejemplo.com"
  );

  assert.equal(withEmail.length, 1);
  assert.equal(withEmail[0].id, "usr_legacy");
  assert.equal(store.users.has(temporaryId), false);

  // La sesión viaja con la cuenta anterior.
  const session = await server.call("/api/auth/session");
  assert.equal(session.payload.userId, "usr_legacy");
});

test("un fallo intermedio en la vinculación deshace todos los cambios", async t => {
  const store = createMemoryAuthStore({
    users: [{ id: "usr_legacy", name: "Cuenta anterior", email: null }],
    faults: {
      // Falla después de mover el correo y las sesiones, justo antes
      // de borrar la cuenta temporal.
      beforeDeleteUser: () => {
        throw new Error("falla simulada de la base de datos");
      }
    }
  });

  const server = await startTestServer({ store });
  t.after(() => server.close());

  const { userId: temporaryId } = await login(server);

  const failed = await server.call("/api/auth/link-legacy-account", {
    method: "POST",
    body: { legacyUserId: "usr_legacy" }
  });

  assert.equal(failed.status, 500);

  // ROLLBACK completo: nada quedó a medio camino.
  assert.equal(store.users.get("usr_legacy").email, null);
  assert.equal(store.users.get(temporaryId).email, "persona@ejemplo.com");
  assert.equal(
    [...store.sessions.values()].every(
      session => session.userId === temporaryId
    ),
    true
  );

  const session = await server.call("/api/auth/session");
  assert.equal(session.payload.userId, temporaryId);

  // Y el reintento posterior, sin la falla, funciona.
  delete store.faults.beforeDeleteUser;

  const retried = await server.call("/api/auth/link-legacy-account", {
    method: "POST",
    body: { legacyUserId: "usr_legacy" }
  });

  assert.equal(retried.status, 200);
  assert.equal(retried.payload.userId, "usr_legacy");
});

test("el rate limiting por IP distingue clientes detrás del proxy", async t => {
  const server = await startTestServer({
    options: { requestsPerIpMax: 2, requestsPerEmailMax: 5 }
  });

  t.after(() => server.close());

  const primera = await requestCode(server, "una@ejemplo.com", {
    forwardedFor: "203.0.113.10"
  });
  const segunda = await requestCode(server, "dos@ejemplo.com", {
    forwardedFor: "203.0.113.10"
  });
  const tercera = await requestCode(server, "tres@ejemplo.com", {
    forwardedFor: "203.0.113.10"
  });

  assert.equal(primera.response.status, 200);
  assert.equal(segunda.response.status, 200);
  assert.equal(tercera.response.status, 429);

  // Otra clienta detrás del mismo proxy no hereda el límite ajeno.
  const otra = await requestCode(server, "cuatro@ejemplo.com", {
    forwardedFor: "198.51.100.7"
  });

  assert.equal(otra.response.status, 200);

  // La IP registrada es la del cliente, no la del proxy.
  const ips = new Set(server.store.codes.map(code => code.requestIp));

  assert.equal(ips.has("203.0.113.10"), true);
  assert.equal(ips.has("198.51.100.7"), true);
  assert.equal(ips.has("127.0.0.1"), false);
});

test("sin confiar en el proxy, X-Forwarded-For no altera la clave del límite", async t => {
  const server = await startTestServer({
    options: { requestsPerIpMax: 1, requestsPerEmailMax: 5 },
    trustProxyEnv: { TRUST_PROXY_HOPS: "0" }
  });

  t.after(() => server.close());

  const primera = await requestCode(server, "una@ejemplo.com", {
    forwardedFor: "203.0.113.10"
  });
  const segunda = await requestCode(server, "dos@ejemplo.com", {
    forwardedFor: "198.51.100.7"
  });

  assert.equal(primera.response.status, 200);
  assert.equal(segunda.response.status, 429);
  assert.match(server.store.codes[0].requestIp, /127\.0\.0\.1$/);
});

test("en producción se rechaza el proveedor de correo de consola", () => {
  assert.throws(
    () =>
      createEmailSender({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "console"
      }),
    /console/
  );

  assert.throws(
    () =>
      assertProductionAuthConfig({
        NODE_ENV: "production",
        AUTH_CODE_PEPPER: "x".repeat(32),
        EMAIL_PROVIDER: "console"
      }),
    /console/
  );

  // Con un proveedor real configurado, la validación pasa.
  assert.doesNotThrow(() =>
    assertProductionAuthConfig({
      NODE_ENV: "production",
      AUTH_CODE_PEPPER: "x".repeat(32),
      EMAIL_PROVIDER: "webhook",
      EMAIL_WEBHOOK_URL: "https://correo.example/enviar"
    })
  );
});

test("en producción falta AUTH_CODE_PEPPER y la validación falla", () => {
  assert.throws(
    () =>
      assertProductionAuthConfig({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "webhook",
        EMAIL_WEBHOOK_URL: "https://correo.example/enviar"
      }),
    /AUTH_CODE_PEPPER/
  );

  // Fuera de producción no se exige nada.
  assert.doesNotThrow(() =>
    assertProductionAuthConfig({ NODE_ENV: "development" })
  );
});

// Arranque real del proceso: server.js debe cortarse antes de escuchar.
function startServerProcess(env) {
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, "..", "server.js")],
      {
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "production",
          PORT: "0",
          ...env
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let output = "";

    child.stdout.on("data", chunk => {
      output += chunk;
    });

    child.stderr.on("data", chunk => {
      output += chunk;
    });

    const timer = setTimeout(() => child.kill("SIGKILL"), 15000);

    child.on("close", code => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

test("server.js no arranca en producción sin AUTH_CODE_PEPPER", async () => {
  const result = await startServerProcess({
    EMAIL_PROVIDER: "webhook",
    EMAIL_WEBHOOK_URL: "https://correo.example/enviar"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.output, /AUTH_CODE_PEPPER/);
});

test("server.js no arranca en producción con EMAIL_PROVIDER=console", async () => {
  const result = await startServerProcess({
    AUTH_CODE_PEPPER: "x".repeat(32),
    EMAIL_PROVIDER: "console"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.output, /console/);
});

test("la limpieza periódica borra códigos viejos y sesiones vencidas", async t => {
  let clock = new Date("2026-03-01T10:00:00Z");

  const server = await startTestServer({
    now: () => clock,
    options: { sessionTtlMs: 60 * 1000 }
  });

  t.after(() => server.close());

  await login(server);

  assert.equal(server.store.sessions.size, 1);
  assert.equal(server.store.codes.length, 1);

  clock = new Date(clock.getTime() + 3 * 24 * 60 * 60 * 1000);

  const removed = await server.store.deleteExpired(clock);

  assert.equal(removed.sessions, 1);
  assert.equal(removed.codes, 1);
  assert.equal(server.store.sessions.size, 0);
  assert.equal(server.store.codes.length, 0);
});
