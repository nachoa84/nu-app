// NU APP · PRUEBAS DE ACCESO V110
// No requieren PostgreSQL, correo real ni credenciales.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  startTestServer,
  lastCodeFromEmails
} = require("./helpers/test-server");
const { createMemoryAuthStore } = require("./memory-auth-store");

async function login(server, email = "persona@ejemplo.com") {
  const requested = await server.call("/api/auth/request-code", {
    method: "POST",
    body: { email }
  });

  assert.equal(requested.status, 200);

  const code = lastCodeFromEmails(server.emails);

  const verified = await server.call("/api/auth/verify-code", {
    method: "POST",
    body: { email, code }
  });

  assert.equal(verified.status, 200);

  return { code, userId: verified.payload.userId };
}

test("sin sesión, un endpoint privado responde 401", async t => {
  const server = await startTestServer();
  t.after(() => server.close());

  const response = await server.call("/api/private/state", {
    method: "POST",
    body: {}
  });

  assert.equal(response.status, 401);
  assert.equal(response.payload.authenticated, false);
});

test("el código nunca viaja en la respuesta HTTP y la cookie es HttpOnly", async () => {
  const server = await startTestServer();

  const requested = await server.call("/api/auth/request-code", {
    method: "POST",
    body: { email: "persona@ejemplo.com" }
  });

  assert.equal(requested.payload.code, undefined);

  const code = lastCodeFromEmails(server.emails);

  const response = await fetch(`${server.baseUrl}/api/auth/verify-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "persona@ejemplo.com", code })
  });

  const cookie = response.headers.get("set-cookie");

  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.doesNotMatch(cookie, /Secure/i);

  await server.close();
});

test("con sesión válida, el endpoint privado responde con el userId de la sesión", async t => {
  const server = await startTestServer();
  t.after(() => server.close());

  const { userId } = await login(server);

  const response = await server.call("/api/private/state", {
    method: "POST",
    body: {}
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.userId, userId);
});

test("intentar usar otro userId por body o por URL no cambia la identidad", async t => {
  const server = await startTestServer();
  t.after(() => server.close());

  const { userId } = await login(server);

  const byBody = await server.call("/api/private/state", {
    method: "POST",
    body: { userId: "usr_de_otra_persona" }
  });

  const byUrl = await server.call("/api/private/state/usr_de_otra_persona", {
    method: "POST",
    body: {}
  });

  assert.equal(byBody.payload.userId, userId);
  assert.equal(byBody.payload.bodyUserId, "usr_de_otra_persona");
  assert.equal(byUrl.payload.userId, userId);
  assert.equal(byUrl.payload.paramUserId, "usr_de_otra_persona");
});

test("un código vencido no inicia sesión", async t => {
  let clock = new Date("2026-01-01T10:00:00Z");

  const server = await startTestServer({
    now: () => clock,
    options: { codeTtlMs: 60 * 1000 }
  });

  t.after(() => server.close());

  await server.call("/api/auth/request-code", {
    method: "POST",
    body: { email: "persona@ejemplo.com" }
  });

  const code = lastCodeFromEmails(server.emails);

  clock = new Date(clock.getTime() + 61 * 1000);

  const verified = await server.call("/api/auth/verify-code", {
    method: "POST",
    body: { email: "persona@ejemplo.com", code }
  });

  assert.equal(verified.status, 401);
});

test("un código ya usado no se puede reutilizar", async t => {
  const server = await startTestServer();
  t.after(() => server.close());

  const { code } = await login(server);

  const reused = await server.call("/api/auth/verify-code", {
    method: "POST",
    body: { email: "persona@ejemplo.com", code }
  });

  assert.equal(reused.status, 401);
});

test("los intentos fallidos se limitan por código", async t => {
  const server = await startTestServer({
    options: { codeMaxAttempts: 3 }
  });

  t.after(() => server.close());

  await server.call("/api/auth/request-code", {
    method: "POST",
    body: { email: "persona@ejemplo.com" }
  });

  const realCode = lastCodeFromEmails(server.emails);
  const wrongCode = realCode === "000000" ? "111111" : "000000";

  for (let attempt = 0; attempt < 3; attempt++) {
    const failed = await server.call("/api/auth/verify-code", {
      method: "POST",
      body: { email: "persona@ejemplo.com", code: wrongCode }
    });

    assert.equal(failed.status, 401);
  }

  const blocked = await server.call("/api/auth/verify-code", {
    method: "POST",
    body: { email: "persona@ejemplo.com", code: realCode }
  });

  assert.equal(blocked.status, 429);
});

test("se limita la cantidad de códigos por correo", async t => {
  const server = await startTestServer({
    options: { requestsPerEmailMax: 2 }
  });

  t.after(() => server.close());

  for (let attempt = 0; attempt < 2; attempt++) {
    const allowed = await server.call("/api/auth/request-code", {
      method: "POST",
      body: { email: "persona@ejemplo.com" }
    });

    assert.equal(allowed.status, 200);
  }

  const limited = await server.call("/api/auth/request-code", {
    method: "POST",
    body: { email: "persona@ejemplo.com" }
  });

  assert.equal(limited.status, 429);
});

test("cerrar sesión invalida la cookie", async t => {
  const server = await startTestServer();
  t.after(() => server.close());

  await login(server);

  const loggedOut = await server.call("/api/auth/logout", { method: "POST" });

  assert.equal(loggedOut.status, 200);

  const afterLogout = await server.call("/api/private/state", {
    method: "POST",
    body: {}
  });

  assert.equal(afterLogout.status, 401);
});

test("consultar la sesión informa el estado real", async t => {
  const server = await startTestServer();
  t.after(() => server.close());

  const anonymous = await server.call("/api/auth/session");

  assert.equal(anonymous.payload.authenticated, false);

  const { userId } = await login(server);
  const authenticated = await server.call("/api/auth/session");

  assert.equal(authenticated.payload.authenticated, true);
  assert.equal(authenticated.payload.userId, userId);
  assert.equal(authenticated.payload.email, "persona@ejemplo.com");
});

test("una cuenta anterior sin correo se puede vincular una sola vez", async t => {
  const store = createMemoryAuthStore({
    users: [
      { id: "usr_legacy", name: "Cuenta anterior", email: null },
      { id: "usr_reclamada", name: "Ya vinculada", email: "otra@ejemplo.com" }
    ]
  });

  const server = await startTestServer({ store });
  t.after(() => server.close());

  await login(server);

  const linked = await server.call("/api/auth/link-legacy-account", {
    method: "POST",
    body: { legacyUserId: "usr_legacy" }
  });

  assert.equal(linked.status, 200);
  assert.equal(linked.payload.userId, "usr_legacy");

  const session = await server.call("/api/auth/session");

  assert.equal(session.payload.userId, "usr_legacy");
  assert.equal(session.payload.email, "persona@ejemplo.com");

  const state = await server.call("/api/private/state", {
    method: "POST",
    body: {}
  });

  assert.equal(state.payload.userId, "usr_legacy");
});

test("no se puede reclamar una cuenta ya vinculada a otro correo", async t => {
  const store = createMemoryAuthStore({
    users: [
      { id: "usr_reclamada", name: "Ya vinculada", email: "otra@ejemplo.com" }
    ]
  });

  const server = await startTestServer({ store });
  t.after(() => server.close());

  await login(server);

  const rejected = await server.call("/api/auth/link-legacy-account", {
    method: "POST",
    body: { legacyUserId: "usr_reclamada" }
  });

  assert.equal(rejected.status, 409);
});

test("vincular una cuenta anterior requiere sesión", async t => {
  const store = createMemoryAuthStore({
    users: [{ id: "usr_legacy", name: "Cuenta anterior", email: null }]
  });

  const server = await startTestServer({ store });
  t.after(() => server.close());

  const rejected = await server.call("/api/auth/link-legacy-account", {
    method: "POST",
    body: { legacyUserId: "usr_legacy" }
  });

  assert.equal(rejected.status, 401);
});

test("no se vincula si la cuenta actual ya tiene progreso propio", async t => {
  const store = createMemoryAuthStore({
    users: [{ id: "usr_legacy", name: "Cuenta anterior", email: null }]
  });

  const server = await startTestServer({ store });
  t.after(() => server.close());

  const { userId } = await login(server);

  // La cuenta creada al verificar el correo pasa a tener progreso propio.
  store.userHasProgress = async id => id === userId;

  const rejected = await server.call("/api/auth/link-legacy-account", {
    method: "POST",
    body: { legacyUserId: "usr_legacy" }
  });

  assert.equal(rejected.status, 409);
});
