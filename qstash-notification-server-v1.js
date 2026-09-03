"use strict";

// NU APP · QSTASH NOTIFICATION PILOT V1
// Prueba controlada de notificaciones futuras sin polling de PostgreSQL.
// Se carga como preloader antes de server.js y agrega endpoints de prueba
// sin modificar la lógica estable del scheduler actual.

const crypto = require("crypto");
const express = require("express");
const { Pool } = require("pg");
const webpush = require("web-push");
const { databasePoolOptionsV113 } = require("./runtime-config-v113");

const originalListen = express.application.listen;
const originalJson = express.json;

// Deliberadamente fuera de /api: server.js aplica un rate limiter compartido
// respaldado por PostgreSQL a los POST /api. La entrega QStash debe poder
// despertar el servidor y enviar Web Push sin consultar la base.
const DELIVERY_PATH = "/_qstash/push-delivery";
const TEST_SCHEDULE_PATH = "/api/admin/qstash-test-schedule-latest";
const TEST_STATUS_PATH = "/api/admin/qstash-test-status";
const QSTASH_API_BASE = "https://qstash.upstash.io/v2/publish/";

let attached = false;
let pool = null;

// Captura el cuerpo JSON original para poder validar el hash incluido en
// Upstash-Signature. server.js seguirá recibiendo req.body normalmente.
express.json = function qstashAwareJson(options = {}) {
  const previousVerify = options.verify;

  return originalJson({
    ...options,
    verify(req, res, buffer, encoding) {
      req.rawBody = buffer.toString(encoding || "utf8");
      if (typeof previousVerify === "function") {
        previousVerify(req, res, buffer, encoding);
      }
    }
  });
};

function getPool() {
  if (pool) return pool;

  const options = databasePoolOptionsV113(
    process.env.DATABASE_URL,
    process.env
  );

  if (!options) return null;

  pool = new Pool({
    ...options,
    max: Math.min(Number(options.max || 2), 2)
  });

  return pool;
}

function safeEqual(provided, expected) {
  if (!provided || !expected) return false;
  const a = crypto.createHash("sha256").update(String(provided)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res) {
  const expected = String(process.env.ADMIN_TEST_TOKEN || "");
  const provided = String(req.headers["x-admin-token"] || "");

  if (!expected) {
    res.status(503).json({ ok: false, error: "ADMIN_TEST_TOKEN no configurado." });
    return false;
  }

  if (!safeEqual(provided, expected)) {
    res.status(401).json({ ok: false, error: "Token administrativo inválido." });
    return false;
  }

  return true;
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")}`;
  } catch (_) {
    return "";
  }
}

function destinationUrl() {
  const base = normalizeBaseUrl(process.env.QSTASH_DESTINATION_BASE_URL);
  return base ? `${base}${DELIVERY_PATH}` : "";
}

function qstashConfig() {
  return {
    token: String(process.env.QSTASH_TOKEN || "").trim(),
    currentSigningKey: String(process.env.QSTASH_CURRENT_SIGNING_KEY || "").trim(),
    nextSigningKey: String(process.env.QSTASH_NEXT_SIGNING_KEY || "").trim(),
    payloadEncryptionKey: String(process.env.QSTASH_PAYLOAD_ENCRYPTION_KEY || "").trim(),
    destination: destinationUrl()
  };
}

function qstashConfigured() {
  const config = qstashConfig();
  return Boolean(
    config.token &&
    config.currentSigningKey &&
    config.nextSigningKey &&
    config.payloadEncryptionKey &&
    config.destination
  );
}

function pushConfigured() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

function configureWebPush() {
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return true;
}

function base64urlDecode(value) {
  return Buffer.from(String(value || ""), "base64url");
}

function verifyJwtWithKey(signature, body, expectedUrl, key) {
  const parts = String(signature || "").split(".");
  if (parts.length !== 3) return false;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(base64urlDecode(encodedHeader).toString("utf8"));
    payload = JSON.parse(base64urlDecode(encodedPayload).toString("utf8"));
  } catch (_) {
    return false;
  }

  if (header?.alg && header.alg !== "HS256") return false;

  const expectedSignature = crypto
    .createHmac("sha256", key)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const receivedSignature = base64urlDecode(encodedSignature);

  if (
    expectedSignature.length !== receivedSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, receivedSignature)
  ) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== "Upstash") return false;
  if (payload.sub !== expectedUrl) return false;
  if (!Number.isFinite(Number(payload.exp)) || now > Number(payload.exp)) return false;
  if (!Number.isFinite(Number(payload.nbf)) || now < Number(payload.nbf)) return false;

  const bodyHash = crypto
    .createHash("sha256")
    .update(body)
    .digest("base64url")
    .replace(/=+$/, "");
  const signedBodyHash = String(payload.body || "").replace(/=+$/, "");

  return Boolean(signedBodyHash) && safeEqual(bodyHash, signedBodyHash);
}

function verifyQStashSignature(signature, body, expectedUrl) {
  const { currentSigningKey, nextSigningKey } = qstashConfig();
  if (!signature || !body || !expectedUrl) return false;

  return (
    (currentSigningKey && verifyJwtWithKey(signature, body, expectedUrl, currentSigningKey)) ||
    (nextSigningKey && verifyJwtWithKey(signature, body, expectedUrl, nextSigningKey))
  );
}

function encryptionKey() {
  const secret = qstashConfig().payloadEncryptionKey;
  return secret
    ? crypto.createHash("sha256").update(secret).digest()
    : null;
}

function encryptPayload(value) {
  const key = encryptionKey();
  if (!key) throw new Error("QSTASH_PAYLOAD_ENCRYPTION_KEY no configurado.");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    alg: "A256GCM",
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };
}

function decryptPayload(envelope) {
  const key = encryptionKey();
  if (!key) throw new Error("QSTASH_PAYLOAD_ENCRYPTION_KEY no configurado.");
  if (!envelope || envelope.alg !== "A256GCM") {
    throw new Error("Envelope QStash inválido.");
  }

  const iv = Buffer.from(String(envelope.iv || ""), "base64url");
  const tag = Buffer.from(String(envelope.tag || ""), "base64url");
  const ciphertext = Buffer.from(String(envelope.ciphertext || ""), "base64url");

  if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) {
    throw new Error("Envelope QStash incompleto.");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString("utf8"));
}

function normalizeSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 300;
  return Math.min(Math.max(Math.trunc(parsed), 10), 3600);
}

function normalizeSubscription(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !value.endpoint ||
    !value.keys?.p256dh ||
    !value.keys?.auth
  ) {
    return null;
  }

  return {
    endpoint: String(value.endpoint),
    expirationTime: value.expirationTime || null,
    keys: {
      p256dh: String(value.keys.p256dh),
      auth: String(value.keys.auth)
    }
  };
}

async function publishQStashMessage({ destination, body, seconds }) {
  const { token } = qstashConfig();
  const response = await fetch(`${QSTASH_API_BASE}${destination}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Upstash-Delay": `${seconds}s`,
      "Upstash-Retries": "3",
      "Upstash-Label": "nu-app-qstash-pilot-v1"
    },
    body
  });

  const responseText = await response.text();
  let responseBody = null;
  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch (_) {
    responseBody = null;
  }

  if (!response.ok) {
    const detail = responseBody?.error || responseBody?.message || responseText || `HTTP ${response.status}`;
    throw new Error(`QStash rechazó la programación: ${detail}`);
  }

  return responseBody || {};
}

function attachQStashPilot(app) {
  if (attached) return;
  attached = true;

  app.get(TEST_STATUS_PATH, (req, res) => {
    if (!requireAdmin(req, res)) return;

    const config = qstashConfig();
    return res.json({
      ok: true,
      configured: qstashConfigured(),
      pushConfigured: pushConfigured(),
      destinationConfigured: Boolean(config.destination),
      tokenConfigured: Boolean(config.token),
      currentSigningKeyConfigured: Boolean(config.currentSigningKey),
      nextSigningKeyConfigured: Boolean(config.nextSigningKey),
      payloadEncryptionKeyConfigured: Boolean(config.payloadEncryptionKey),
      deliveryPath: DELIVERY_PATH
    });
  });

  app.post(TEST_SCHEDULE_PATH, async (req, res) => {
    if (!requireAdmin(req, res)) return;

    if (!qstashConfigured()) {
      return res.status(503).json({
        ok: false,
        error: "QStash no está configurado. Faltan token, signing keys, encryption key o QSTASH_DESTINATION_BASE_URL."
      });
    }

    if (!configureWebPush()) {
      return res.status(503).json({
        ok: false,
        error: "Web Push no está configurado."
      });
    }

    const db = getPool();
    if (!db) {
      return res.status(503).json({ ok: false, error: "Base de datos no disponible." });
    }

    try {
      const seconds = normalizeSeconds(req.body?.seconds);
      const latest = await db.query(
        `SELECT ps.user_id, ps.subscription, u.name
         FROM push_subscriptions ps
         JOIN users u ON u.id = ps.user_id
         ORDER BY ps.updated_at DESC
         LIMIT 1`
      );

      if (!latest.rowCount) {
        return res.status(404).json({ ok: false, error: "No hay dispositivos suscriptos." });
      }

      const row = latest.rows[0];
      const subscription = normalizeSubscription(row.subscription);
      if (!subscription) {
        return res.status(409).json({ ok: false, error: "La última suscripción push no es válida." });
      }

      const deliveryId = crypto.randomUUID();
      const privateMessage = {
        version: 1,
        deliveryId,
        subscription,
        payload: {
          title: "🔥 Prueba programada",
          body: "Esta notificación llegó mediante QStash sin polling continuo de PostgreSQL.",
          url: "/",
          tag: `qstash_pilot_${deliveryId}`
        }
      };
      const rawBody = JSON.stringify({
        version: 1,
        envelope: encryptPayload(privateMessage)
      });
      const destination = destinationUrl();
      const result = await publishQStashMessage({
        destination,
        body: rawBody,
        seconds
      });

      return res.json({
        ok: true,
        scheduled: true,
        messageId: result.messageId || null,
        deliveryId,
        userId: row.user_id,
        name: row.name,
        seconds,
        scheduledFor: new Date(Date.now() + seconds * 1000).toISOString()
      });
    } catch (error) {
      console.error("[qstash-pilot] schedule error:", error);
      return res.status(502).json({
        ok: false,
        error: error.message || "No se pudo programar la notificación."
      });
    }
  });

  app.post(DELIVERY_PATH, async (req, res) => {
    const config = qstashConfig();
    if (!config.currentSigningKey || !config.nextSigningKey || !config.payloadEncryptionKey || !config.destination) {
      return res.status(503).json({ ok: false, error: "Verificación QStash no configurada." });
    }

    const rawBody = typeof req.rawBody === "string"
      ? req.rawBody
      : JSON.stringify(req.body || {});
    const signature = String(req.headers["upstash-signature"] || "");

    if (!verifyQStashSignature(signature, rawBody, config.destination)) {
      return res.status(401).json({ ok: false, error: "Firma QStash inválida." });
    }

    if (!configureWebPush()) {
      return res.status(503).json({ ok: false, error: "Web Push no configurado." });
    }

    let message;
    try {
      message = decryptPayload(req.body?.envelope);
    } catch (error) {
      console.error("[qstash-pilot] decrypt error:", error);
      return res.status(400).json({ ok: false, error: "Payload QStash inválido." });
    }

    const subscription = normalizeSubscription(message.subscription);
    if (!subscription || !message.payload || typeof message.payload !== "object") {
      return res.status(400).json({ ok: false, error: "Mensaje QStash inválido." });
    }

    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify(message.payload)
      );

      console.log(
        `[qstash-pilot] delivery=${String(message.deliveryId || "unknown")} sent=1 db=0`
      );

      return res.json({
        ok: true,
        sent: 1,
        deliveryId: message.deliveryId || null,
        databaseQueries: 0
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);

      // Una suscripción expirada es un fallo permanente: responder 2xx evita
      // que QStash repita una entrega que nunca podrá funcionar.
      if (statusCode === 404 || statusCode === 410) {
        console.warn(
          `[qstash-pilot] delivery=${String(message.deliveryId || "unknown")} expired=1 db=0`
        );
        return res.json({
          ok: true,
          sent: 0,
          expired: true,
          deliveryId: message.deliveryId || null,
          databaseQueries: 0
        });
      }

      console.error("[qstash-pilot] delivery error:", error);
      // QStash reintentará las respuestas no-2xx según Upstash-Retries.
      return res.status(503).json({
        ok: false,
        error: "Error temporal enviando Web Push."
      });
    }
  });
}

express.application.listen = function qstashPilotListen(...args) {
  attachQStashPilot(this);
  return originalListen.apply(this, args);
};

module.exports = {
  DELIVERY_PATH,
  TEST_SCHEDULE_PATH,
  TEST_STATUS_PATH,
  normalizeBaseUrl,
  verifyJwtWithKey,
  verifyQStashSignature,
  encryptPayload,
  decryptPayload
};
