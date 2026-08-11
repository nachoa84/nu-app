// NU APP · SERVIDOR DE PRUEBA V110
// Monta las rutas reales de acceso sobre Express, sin PostgreSQL ni correo real.

const express = require("express");
const { createAuthService } = require("../../auth-core");
const { createAuthHttp } = require("../../auth-http");
const { createMemoryAuthStore } = require("../memory-auth-store");
const { resolveTrustProxy } = require("../../client-ip");

const TEST_PEPPER = "pepper-de-pruebas-v110";

async function startTestServer({
  store = createMemoryAuthStore(),
  now = () => new Date(),
  options = {},
  codePepper = TEST_PEPPER,
  trustProxyEnv = { TRUST_PROXY_HOPS: "1" }
} = {}) {
  const emails = [];

  const service = createAuthService({
    store,
    now,
    options,
    codePepper,
    sendEmail: async message => {
      emails.push(message);
      return { delivered: true, provider: "memory" };
    }
  });

  const authHttp = createAuthHttp({ service, secureCookies: false });

  const app = express();
  // Misma política de proxy que server.js.
  app.set("trust proxy", resolveTrustProxy(trustProxyEnv));
  app.use(express.json());
  app.use("/api", authHttp.attachSession);
  authHttp.mountRoutes(app);

  // Endpoint privado equivalente a los de server.js: el userId sale
  // siempre de la sesión, nunca de la URL ni del body.
  app.post(
    ["/api/private/state", "/api/private/state/:userId"],
    authHttp.requireSession,
    (req, res) => {
      res.json({
        ok: true,
        userId: authHttp.sessionUserId(req),
        bodyUserId: req.body?.userId || null,
        paramUserId: req.params?.userId || null
      });
    }
  );

  app.use((error, req, res, _next) => {
    const status = Number(error?.status) || 500;
    res.status(status).json({ ok: false, error: error.message });
  });

  const server = await new Promise(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let cookie = null;

  async function call(path, {
    method = "GET",
    body,
    withCookie = true,
    forwardedFor = null,
    cookie: explicitCookie = null
  } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
        ...(explicitCookie
          ? { Cookie: explicitCookie }
          : withCookie && cookie
            ? { Cookie: cookie }
            : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const setCookie = response.headers.get("set-cookie");

    if (setCookie) {
      cookie = setCookie.split(";")[0];
    }

    const payload = await response.json().catch(() => ({}));

    return { status: response.status, payload };
  }

  return {
    baseUrl,
    call,
    emails,
    app,
    service,
    store,
    getCookie: () => cookie,
    setCookie: value => {
      cookie = value;
    },
    close: () => new Promise(resolve => server.close(resolve))
  };
}

// El código sólo existe en el correo simulado: nunca sale por HTTP.
function lastCodeFromEmails(emails) {
  const message = emails[emails.length - 1];
  const match = /(\d{4,10})/.exec(message?.text || "");
  return match ? match[1] : null;
}

module.exports = { startTestServer, lastCodeFromEmails, TEST_PEPPER };
