/**
 * NU APP · CAPA HTTP DE IDENTIDAD PILOTO V0
 * Archivo: pilot-identity-routes-v0.js
 *
 * Responsabilidad exclusiva:
 *   - Endpoints REST para usuario (/api/pilot/*) y administración (/api/pilot-admin/*).
 *   - Normalización estricta y validación de dependencias al instanciar (fail-closed).
 *   - Validación de bodies con allowlists exactas.
 *   - Rate limiting por IP y por usuario mediante shared-rate-limit-v115.
 *   - PostgreSQL como única fuente de autenticación/tiempo a través de store.
 */

"use strict";

const { isIP } = require("node:net");

function extractClientIp(req, getClientIpFn) {
  if (typeof getClientIpFn === "function") {
    try {
      const customIp = getClientIpFn(req);
      if (customIp === null || customIp === undefined) return null;
      if (typeof customIp === "string" && isIP(customIp.trim()) !== 0) {
        return customIp.trim();
      }
      return null;
    } catch {
      return null;
    }
  }
  const rawIp = String(req?.ip || "").trim();
  return isIP(rawIp) !== 0 ? rawIp : null;
}

function validateAllowlist(obj, allowedKeys) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return false;
  }
  const keys = Object.keys(obj);
  for (const k of keys) {
    if (!allowedKeys.includes(k)) {
      return false;
    }
  }
  return true;
}

function inspectBearerToken(req) {
  if (req.rawHeaders) {
    let authHeaderCount = 0;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (String(req.rawHeaders[i]).toLowerCase() === "authorization") {
        authHeaderCount++;
      }
    }
    if (authHeaderCount > 1) {
      return { token: null, malformed: true };
    }
  }
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return { token: null, malformed: true };
  }
  if (Array.isArray(authHeader) || (typeof authHeader === "string" && authHeader.includes(","))) {
    return { token: null, malformed: true };
  }
  if (typeof authHeader !== "string") {
    return { token: null, malformed: true };
  }
  if (authHeader.length > 10240) {
    return { token: null, malformed: true };
  }
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return { token: null, malformed: true };
  }
  const token = parts[1];
  if (!token.startsWith("npt_") || token.length !== 47) {
    return { token: null, malformed: true };
  }
  const b64Part = token.slice(4);
  if (!/^[A-Za-z0-9_-]{43}$/.test(b64Part)) {
    return { token: null, malformed: true };
  }
  return { token, malformed: false };
}

function validateAdminToken(req, expectedToken, nodeCrypto) {
  const provided = req.headers["x-pilot-admin-token"];
  if (!provided || typeof provided !== "string" || Array.isArray(provided)) {
    return false;
  }
  if (provided.length > 10240) {
    return false;
  }
  const cryptoLib = nodeCrypto || require("node:crypto");
  const providedHash = cryptoLib.createHash("sha256").update(provided).digest();
  const expectedHash = cryptoLib.createHash("sha256").update(expectedToken).digest();
  return cryptoLib.timingSafeEqual(providedHash, expectedHash);
}

function sanitizeForLog(val) {
  if (val === null || val === undefined) return "";
  let str = typeof val === "string" ? val : String(val);
  str = str.replace(/npi_[A-Za-z0-9_-]+/gi, "[REDACTED_CODE]");
  str = str.replace(/npt_[A-Za-z0-9_-]+/gi, "[REDACTED_TOKEN]");
  str = str.replace(/hmac/gi, "[REDACTED]");
  str = str.replace(/authorization/gi, "[REDACTED]");
  str = str.replace(/pilot_admin_token/gi, "[REDACTED]");
  return str;
}

function createPilotIdentityRoutesV0({
  express,
  store,
  nodeCrypto,
  pool,
  consumeSharedRateLimit,
  pilotEnabled = false,
  pilotAdminRoutesEnabled = false,
  pilotAdminToken,
  pilotAdminKeyId,
  logError,
  getClientIp
}) {
  const normPilotEnabled = pilotEnabled === true;
  const normPilotAdminRoutesEnabled = pilotAdminRoutesEnabled === true;
  const normPilotAdminToken = String(pilotAdminToken || "").trim();
  const normPilotAdminKeyId = String(pilotAdminKeyId || "").trim();

  // Strict Factory Dependency Validation (fail-closed)
  if (normPilotEnabled || normPilotAdminRoutesEnabled) {
    if (!express || typeof express.Router !== "function") {
      throw new Error("El módulo express o express.Router no es válido.");
    }
    if (!pool || typeof pool.query !== "function") {
      throw new Error("El pool de PostgreSQL no es válido.");
    }
    if (typeof consumeSharedRateLimit !== "function") {
      throw new Error("La función consumeSharedRateLimit no es válida.");
    }
    if (!store || typeof store !== "object") {
      throw new Error("El store de identidad piloto no es válido.");
    }
  }

  if (normPilotEnabled) {
    const requiredUserMethods = [
      "registerUser",
      "recoverAccess",
      "renewCredential",
      "authenticateCredential",
      "getCredentialExpiry"
    ];
    for (const method of requiredUserMethods) {
      if (typeof store[method] !== "function") {
        throw new Error(`El store no implementa el método requerido '${method}'.`);
      }
    }
  }

  if (normPilotAdminRoutesEnabled) {
    const requiredAdminMethods = [
      "createRegistrationInvitation",
      "createRecoveryInvitation",
      "revokeAllCredentials"
    ];
    for (const method of requiredAdminMethods) {
      if (typeof store[method] !== "function") {
        throw new Error(`El store no implementa el método requerido '${method}'.`);
      }
    }
    const cryptoLib = nodeCrypto || require("node:crypto");
    if (!cryptoLib || typeof cryptoLib.createHash !== "function" || typeof cryptoLib.timingSafeEqual !== "function") {
      throw new Error("El módulo nodeCrypto no provee createHash o timingSafeEqual.");
    }
    if (!normPilotAdminToken || !normPilotAdminKeyId) {
      throw new Error(
        "Falta la configuración de administración (PILOT_ADMIN_TOKEN y PILOT_ADMIN_KEY_ID son requeridos)."
      );
    }
  }

  const router = express.Router();

  async function applyRateLimit(req, res, { namespace, key, windowMs, max }) {
    const decision = await consumeSharedRateLimit(pool, {
      namespace,
      key,
      windowMs,
      max,
      now: Date.now()
    });
    res.set("X-RateLimit-Limit", String(max));
    res.set("X-RateLimit-Remaining", String(decision.remaining));
    if (!decision.allowed) {
      res.set("Retry-After", String(decision.retryAfter));
      res.status(429).json({
        ok: false,
        error: "Demasiadas solicitudes. Esperá un momento e intentá nuevamente.",
        retryAfter: decision.retryAfter
      });
      return false;
    }
    return true;
  }

  function handleGenericError(res, err, operationName) {
    if (typeof logError === "function") {
      try {
        logError({
          operation: sanitizeForLog(operationName),
          errorCode: sanitizeForLog(err?.code || ""),
          constraint: sanitizeForLog(err?.constraint || "")
        });
      } catch {}
    }
    return res.status(500).json({ ok: false, error: "Error interno del servidor." });
  }

  async function parseRequestBody(req) {
    if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
      if (Object.keys(req.body).length > 0) {
        return req.body;
      }
    }
    const hasBodyHeader = (req.headers["content-length"] && Number(req.headers["content-length"]) > 0) || Boolean(req.headers["transfer-encoding"]);
    if (!hasBodyHeader) {
      return {};
    }
    if (req.readableEnded || req.complete) {
      return req.body || {};
    }
    return new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => { data += chunk; });
      req.on("end", () => {
        if (!data.trim()) return resolve({});
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve("INVALID_JSON");
        }
      });
      req.on("error", () => resolve("INVALID_JSON"));
    });
  }

  // ------------------------------------------------------------
  // Gatekeepers
  // ------------------------------------------------------------
  router.use("/api/pilot", (req, res, next) => {
    if (!normPilotEnabled) {
      return res.status(404).json({ ok: false, error: "Ruta no disponible." });
    }
    next();
  });

  router.use("/api/pilot-admin", (req, res, next) => {
    if (!normPilotAdminRoutesEnabled) {
      return res.status(404).json({ ok: false, error: "Ruta no disponible." });
    }
    next();
  });

  // ------------------------------------------------------------
  // 1. POST /api/pilot/register
  // ------------------------------------------------------------
  router.post("/api/pilot/register", async (req, res) => {
    try {
      const body = req.body;
      if (!validateAllowlist(body, ["invitationCode", "profile"])) {
        return res.status(400).json({ ok: false, error: "La solicitud contiene campos no permitidos." });
      }
      if (!body.profile || typeof body.profile !== "object" || Array.isArray(body.profile)) {
        return res.status(400).json({ ok: false, error: "La solicitud contiene campos no permitidos." });
      }
      if (!validateAllowlist(body.profile, ["name", "country", "timezone", "notificationTime"])) {
        return res.status(400).json({ ok: false, error: "La solicitud contiene campos no permitidos." });
      }
      if ("userId" in body || "userId" in body.profile) {
        return res.status(400).json({ ok: false, error: "La solicitud contiene campos no permitidos." });
      }

      const clientIp = extractClientIp(req, getClientIp);
      const limitOk = await applyRateLimit(req, res, {
        namespace: "pilot-register",
        key: `ip:${clientIp || "unknown"}`,
        windowMs: 10 * 60 * 1000,
        max: 10
      });
      if (!limitOk) return;

      const result = await store.registerUser({
        invitationCode: body.invitationCode,
        profile: body.profile
      });

      return res.status(201).json(result);
    } catch (err) {
      if (err?.name === "PilotStoreError") {
        return res.status(400).json({ ok: false, error: "La invitación no es válida o ya fue utilizada." });
      }
      return handleGenericError(res, err, "registerUser");
    }
  });

  // ------------------------------------------------------------
  // 2. POST /api/pilot/recover
  // ------------------------------------------------------------
  router.post("/api/pilot/recover", async (req, res) => {
    try {
      const body = req.body;
      if (!validateAllowlist(body, ["invitationCode"])) {
        return res.status(400).json({ ok: false, error: "La solicitud contiene campos no permitidos." });
      }

      const clientIp = extractClientIp(req, getClientIp);
      const limitOk = await applyRateLimit(req, res, {
        namespace: "pilot-recover",
        key: `ip:${clientIp || "unknown"}`,
        windowMs: 10 * 60 * 1000,
        max: 5
      });
      if (!limitOk) return;

      const result = await store.recoverAccess({
        invitationCode: body.invitationCode
      });

      return res.status(200).json(result);
    } catch (err) {
      if (err?.name === "PilotStoreError") {
        return res.status(400).json({ ok: false, error: "La invitación no es válida o ya fue utilizada." });
      }
      return handleGenericError(res, err, "recoverAccess");
    }
  });

  // ------------------------------------------------------------
  // 3. POST /api/pilot/renew
  // ------------------------------------------------------------
  router.post("/api/pilot/renew", async (req, res) => {
    try {
      const body = req.body || {};
      if (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) {
        return res.status(400).json({ ok: false, error: "La solicitud contiene campos no permitidos." });
      }

      const clientIp = extractClientIp(req, getClientIp);
      const ipLimitOk = await applyRateLimit(req, res, {
        namespace: "pilot-renew-ip",
        key: `ip:${clientIp || "unknown"}`,
        windowMs: 10 * 60 * 1000,
        max: 20
      });
      if (!ipLimitOk) return;

      const bearerInfo = inspectBearerToken(req);
      if (bearerInfo.malformed || !bearerInfo.token) {
        return res.status(401).json({ ok: false, error: "La sesión no es válida o ha expirado." });
      }

      let authResult;
      try {
        authResult = await store.authenticateCredential({ token: bearerInfo.token });
      } catch (authErr) {
        if (authErr?.name === "PilotStoreError") {
          return res.status(401).json({ ok: false, error: "La sesión no es válida o ha expirado." });
        }
        return handleGenericError(res, authErr, "authenticateCredential");
      }

      const userLimitOk = await applyRateLimit(req, res, {
        namespace: "pilot-renew-user",
        key: `user:${authResult.userId}`,
        windowMs: 10 * 60 * 1000,
        max: 20
      });
      if (!userLimitOk) return;

      const result = await store.renewCredential({ currentToken: bearerInfo.token });
      return res.status(200).json(result);
    } catch (err) {
      if (err?.name === "PilotStoreError") {
        return res.status(401).json({ ok: false, error: "La sesión no es válida o ha expirado." });
      }
      return handleGenericError(res, err, "renewCredential");
    }
  });

  // ------------------------------------------------------------
  // 4. GET /api/pilot/me
  // ------------------------------------------------------------
  router.get("/api/pilot/me", async (req, res) => {
    try {
      const body = await parseRequestBody(req);
      if (body === "INVALID_JSON" || (body && typeof body === "object" && (Array.isArray(body) || Object.keys(body).length > 0))) {
        return res.status(400).json({ ok: false, error: "La solicitud contiene campos no permitidos." });
      }

      const clientIp = extractClientIp(req, getClientIp);
      const ipLimitOk = await applyRateLimit(req, res, {
        namespace: "pilot-me-ip",
        key: `ip:${clientIp || "unknown"}`,
        windowMs: 10 * 60 * 1000,
        max: 60
      });
      if (!ipLimitOk) return;

      const bearerInfo = inspectBearerToken(req);
      if (bearerInfo.malformed || !bearerInfo.token) {
        return res.status(401).json({ ok: false, error: "La sesión no es válida o ha expirado." });
      }

      let authResult;
      try {
        authResult = await store.authenticateCredential({ token: bearerInfo.token });
      } catch (authErr) {
        if (authErr?.name === "PilotStoreError") {
          return res.status(401).json({ ok: false, error: "La sesión no es válida o ha expirado." });
        }
        return handleGenericError(res, authErr, "authenticateCredential");
      }

      const userLimitOk = await applyRateLimit(req, res, {
        namespace: "pilot-me-user",
        key: `user:${authResult.userId}`,
        windowMs: 10 * 60 * 1000,
        max: 60
      });
      if (!userLimitOk) return;

      const expiryResult = await store.getCredentialExpiry({ token: bearerInfo.token });
      return res.status(200).json({
        ok: true,
        user: {
          userId: authResult.userId
        },
        session: {
          expiresAt: expiryResult.expiresAt,
          daysUntilExpiry: expiryResult.daysUntilExpiry
        }
      });
    } catch (err) {
      if (err?.name === "PilotStoreError") {
        return res.status(401).json({ ok: false, error: "La sesión no es válida o ha expirado." });
      }
      return handleGenericError(res, err, "getCredentialExpiry");
    }
  });

  // ------------------------------------------------------------
  // 5. POST /api/pilot-admin/invitations/registration
  // ------------------------------------------------------------
  router.post("/api/pilot-admin/invitations/registration", async (req, res) => {
    try {
      const clientIp = extractClientIp(req, getClientIp);
      const limitOk = await applyRateLimit(req, res, {
        namespace: "pilot-admin",
        key: `admin:${clientIp || "unknown"}`,
        windowMs: 10 * 60 * 1000,
        max: 10
      });
      if (!limitOk) return;

      if (!validateAdminToken(req, normPilotAdminToken, nodeCrypto)) {
        return res.status(401).json({ ok: false, error: "Token de administración inválido." });
      }

      const body = req.body || {};
      if (!validateAllowlist(body, ["expiresInHours"])) {
        return res.status(400).json({ ok: false, error: "La solicitud contiene campos no permitidos." });
      }

      const result = await store.createRegistrationInvitation({
        expiresInHours: body.expiresInHours,
        adminKeyId: normPilotAdminKeyId,
        clientIp
      });

      return res.status(201).json(result);
    } catch (err) {
      if (err?.name === "PilotStoreError") {
        return res.status(400).json({ ok: false, error: "No se pudo completar la operación solicitada." });
      }
      return handleGenericError(res, err, "createRegistrationInvitation");
    }
  });

  // ------------------------------------------------------------
  // 6. POST /api/pilot-admin/invitations/recovery
  // ------------------------------------------------------------
  router.post("/api/pilot-admin/invitations/recovery", async (req, res) => {
    try {
      const clientIp = extractClientIp(req, getClientIp);
      const limitOk = await applyRateLimit(req, res, {
        namespace: "pilot-admin",
        key: `admin:${clientIp || "unknown"}`,
        windowMs: 10 * 60 * 1000,
        max: 10
      });
      if (!limitOk) return;

      if (!validateAdminToken(req, normPilotAdminToken, nodeCrypto)) {
        return res.status(401).json({ ok: false, error: "Token de administración inválido." });
      }

      const body = req.body || {};
      if (!validateAllowlist(body, ["userId", "expiresInHours"]) || !("userId" in body)) {
        return res.status(400).json({ ok: false, error: "La solicitud contiene campos no permitidos." });
      }

      const result = await store.createRecoveryInvitation({
        userId: body.userId,
        expiresInHours: body.expiresInHours,
        adminKeyId: normPilotAdminKeyId,
        clientIp
      });

      return res.status(201).json(result);
    } catch (err) {
      if (err?.name === "PilotStoreError") {
        return res.status(400).json({ ok: false, error: "No se pudo completar la operación solicitada." });
      }
      return handleGenericError(res, err, "createRecoveryInvitation");
    }
  });

  // ------------------------------------------------------------
  // 7. POST /api/pilot-admin/credentials/revoke-all
  // ------------------------------------------------------------
  router.post("/api/pilot-admin/credentials/revoke-all", async (req, res) => {
    try {
      const clientIp = extractClientIp(req, getClientIp);
      const limitOk = await applyRateLimit(req, res, {
        namespace: "pilot-admin",
        key: `admin:${clientIp || "unknown"}`,
        windowMs: 10 * 60 * 1000,
        max: 10
      });
      if (!limitOk) return;

      if (!validateAdminToken(req, normPilotAdminToken, nodeCrypto)) {
        return res.status(401).json({ ok: false, error: "Token de administración inválido." });
      }

      const body = req.body || {};
      if (!validateAllowlist(body, ["userId"]) || !("userId" in body)) {
        return res.status(400).json({ ok: false, error: "La solicitud contiene campos no permitidos." });
      }

      const result = await store.revokeAllCredentials({
        userId: body.userId,
        adminKeyId: normPilotAdminKeyId,
        clientIp
      });

      return res.status(200).json(result);
    } catch (err) {
      if (err?.name === "PilotStoreError") {
        return res.status(400).json({ ok: false, error: "No se pudo completar la operación solicitada." });
      }
      return handleGenericError(res, err, "revokeAllCredentials");
    }
  });

  return router;
}

module.exports = {
  createPilotIdentityRoutesV0
};
