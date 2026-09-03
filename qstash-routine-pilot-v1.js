"use strict";

// NU APP · QSTASH ROUTINE PILOT V1
// Piloto controlado para programar el aviso real de Collagen+ con QStash.
// No reemplaza todavía el scheduler estable. Sólo actúa para usuarios
// explícitamente permitidos por QSTASH_ROUTINE_PILOT_USER_IDS.

const crypto = require("crypto");
const express = require("express");
const { Pool } = require("pg");
const {
  DELIVERY_PATH,
  encryptPayload,
  normalizeBaseUrl
} = require("./qstash-notification-server-v1");
const {
  databasePoolOptionsV113
} = require("./runtime-config-v113");

const originalUse = express.application.use;
const STATUS_PATH = "/api/admin/qstash-routine-pilot-status";
const ROUTINE_COMPLETE_PATH = "/api/routine/complete";
const PROFILE_PATH_PREFIX = "/api/profile/";
const QSTASH_API_BASE = String(
  process.env.QSTASH_URL || "https://qstash.upstash.io"
).trim().replace(/\/$/, "");

let attached = false;
let pool = null;

function trueFlag(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function pilotUserIds() {
  return new Set(
    String(process.env.QSTASH_ROUTINE_PILOT_USER_IDS || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean)
  );
}

function pilotEnabled() {
  return trueFlag(process.env.QSTASH_ROUTINE_PILOT_ENABLED);
}

function isPilotUser(userId) {
  const normalized = String(userId || "").trim();
  return Boolean(
    pilotEnabled() &&
    normalized &&
    pilotUserIds().has(normalized)
  );
}

function destinationUrl() {
  const base = normalizeBaseUrl(process.env.QSTASH_DESTINATION_BASE_URL);
  return base ? `${base}${DELIVERY_PATH}` : "";
}

function qstashConfigured() {
  return Boolean(
    String(process.env.QSTASH_TOKEN || "").trim() &&
    String(process.env.QSTASH_CURRENT_SIGNING_KEY || "").trim() &&
    String(process.env.QSTASH_NEXT_SIGNING_KEY || "").trim() &&
    String(process.env.QSTASH_PAYLOAD_ENCRYPTION_KEY || "").trim() &&
    destinationUrl()
  );
}

function pushConfigured() {
  return Boolean(
    String(process.env.VAPID_PUBLIC_KEY || "").trim() &&
    String(process.env.VAPID_PRIVATE_KEY || "").trim() &&
    String(process.env.VAPID_SUBJECT || "").trim()
  );
}

function pilotConfiguredForUser(userId) {
  return Boolean(
    isPilotUser(userId) &&
    qstashConfigured() &&
    pushConfigured()
  );
}

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

function parseScheduledAt(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function qstashDeduplicationId({ userId, cycle, day, scheduledAt }) {
  return crypto
    .createHash("sha256")
    .update(`${userId}:${cycle}:${day}:${scheduledAt}`)
    .digest("hex");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function cancelQStashMessage(messageId) {
  const normalized = String(messageId || "").trim();
  if (!normalized) return { ok: true, skipped: true };

  const response = await fetchWithTimeout(
    `${QSTASH_API_BASE}/v2/messages/${encodeURIComponent(normalized)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${String(process.env.QSTASH_TOKEN || "").trim()}`
      }
    }
  );

  if (response.ok || response.status === 404) {
    return {
      ok: true,
      notFound: response.status === 404
    };
  }

  const detail = await response.text().catch(() => "");
  throw new Error(
    `QStash no pudo cancelar ${normalized}: ${detail || `HTTP ${response.status}`}`
  );
}

async function publishRoutineMessage({
  destination,
  body,
  notBefore,
  deduplicationId
}) {
  const response = await fetchWithTimeout(
    `${QSTASH_API_BASE}/v2/publish/${destination}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${String(process.env.QSTASH_TOKEN || "").trim()}`,
        "Content-Type": "application/json",
        "Upstash-Not-Before": String(notBefore),
        "Upstash-Retries": "3",
        "Upstash-Label": "nu-app-routine-pilot-v1",
        "Upstash-Deduplication-Id": deduplicationId,
        "Upstash-Redact-Fields": "body"
      },
      body
    }
  );

  const responseText = await response.text();
  let responseBody = null;

  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch (_) {
    responseBody = null;
  }

  if (!response.ok) {
    const detail =
      responseBody?.error ||
      responseBody?.message ||
      responseText ||
      `HTTP ${response.status}`;

    throw new Error(`QStash rechazó la programación real: ${detail}`);
  }

  return responseBody || {};
}

async function latestSubscription(db, userId) {
  const result = await db.query(
    `SELECT subscription
     FROM push_subscriptions
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId]
  );

  if (!result.rowCount) return null;
  return normalizeSubscription(result.rows[0].subscription);
}

async function currentPilotJob(db, { userId, cycle, day }) {
  const result = await db.query(
    `SELECT
       message_id,
       delivery_id,
       scheduled_for,
       status,
       source
     FROM qstash_routine_pilot_jobs
     WHERE user_id = $1
       AND cycle = $2
       AND day = $3
     LIMIT 1`,
    [userId, cycle, day]
  );

  return result.rows[0] || null;
}

async function markPilotJobCancelled(db, { userId, cycle, day }) {
  await db.query(
    `UPDATE qstash_routine_pilot_jobs
     SET status = 'cancelled', updated_at = NOW()
     WHERE user_id = $1
       AND cycle = $2
       AND day = $3`,
    [userId, cycle, day]
  );
}

async function savePilotJob(db, {
  userId,
  cycle,
  day,
  scheduledFor,
  messageId,
  deliveryId,
  source
}) {
  await db.query(
    `INSERT INTO qstash_routine_pilot_jobs (
       user_id,
       cycle,
       day,
       scheduled_for,
       message_id,
       delivery_id,
       status,
       source,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, NOW())
     ON CONFLICT (user_id, cycle, day)
     DO UPDATE SET
       scheduled_for = EXCLUDED.scheduled_for,
       message_id = EXCLUDED.message_id,
       delivery_id = EXCLUDED.delivery_id,
       status = 'scheduled',
       source = EXCLUDED.source,
       updated_at = NOW()`,
    [
      userId,
      cycle,
      day,
      new Date(scheduledFor),
      messageId,
      deliveryId,
      source
    ]
  );
}

async function syncRoutinePilotFromState(state, {
  source = "unknown",
  completedDay = null
} = {}) {
  const userId = String(state?.userId || "").trim();

  if (!isPilotUser(userId)) {
    return { ok: true, enabled: false, reason: "user_not_in_pilot" };
  }

  if (!qstashConfigured() || !pushConfigured()) {
    return { ok: false, enabled: true, reason: "pilot_not_configured" };
  }

  const currentDay = Number(state?.currentDay);
  const cycle = Number(state?.cycle);
  const scheduledAt = parseScheduledAt(state?.nextUnlockAt);

  if (
    !Number.isInteger(currentDay) ||
    !Number.isInteger(cycle) ||
    currentDay < 1 ||
    currentDay >= 30 ||
    !scheduledAt
  ) {
    return { ok: true, enabled: true, scheduled: false, reason: "no_pending_unlock" };
  }

  if (
    source === "routine_complete" &&
    Number.isFinite(Number(completedDay)) &&
    Number(completedDay) !== currentDay
  ) {
    return { ok: true, enabled: true, scheduled: false, reason: "completed_day_not_current" };
  }

  const nextDay = currentDay + 1;
  const db = getPool();

  if (!db) {
    return { ok: false, enabled: true, reason: "database_unavailable" };
  }

  const existing = await currentPilotJob(db, {
    userId,
    cycle,
    day: nextDay
  });

  const existingScheduledAt = existing?.scheduled_for
    ? new Date(existing.scheduled_for).getTime()
    : null;

  if (
    existing?.status === "scheduled" &&
    existing?.message_id &&
    existingScheduledAt &&
    Math.abs(existingScheduledAt - scheduledAt) <= 1000
  ) {
    return {
      ok: true,
      enabled: true,
      scheduled: true,
      reused: true,
      userId,
      cycle,
      day: nextDay,
      messageId: existing.message_id,
      deliveryId: existing.delivery_id,
      scheduledFor: new Date(scheduledAt).toISOString()
    };
  }

  if (existing?.status === "scheduled" && existing?.message_id) {
    await cancelQStashMessage(existing.message_id);
    await markPilotJobCancelled(db, {
      userId,
      cycle,
      day: nextDay
    });
  }

  const subscription = await latestSubscription(db, userId);

  if (!subscription) {
    return {
      ok: false,
      enabled: true,
      scheduled: false,
      reason: "no_push_subscription"
    };
  }

  const deliveryId = crypto.randomUUID();
  const destination = destinationUrl();
  const privateMessage = {
    version: 1,
    deliveryId,
    subscription,
    payload: {
      title: `🔥 Tu Día ${nextDay} de Collagen+ está disponible`,
      body: "Entrá y descubrí tu acción de hoy.",
      url: `/?routine=collagen-30&day=${nextDay}&notification=1`,
      tag: `routine_daily_${userId}`
    }
  };
  const rawBody = JSON.stringify({
    version: 1,
    envelope: encryptPayload(privateMessage)
  });
  const notBefore = Math.max(
    Math.ceil(scheduledAt / 1000),
    Math.floor(Date.now() / 1000) + 1
  );
  const deduplicationId = qstashDeduplicationId({
    userId,
    cycle,
    day: nextDay,
    scheduledAt
  });

  const published = await publishRoutineMessage({
    destination,
    body: rawBody,
    notBefore,
    deduplicationId
  });

  const messageId = String(published.messageId || "").trim();
  if (!messageId) {
    throw new Error("QStash no devolvió messageId para la notificación real.");
  }

  try {
    await savePilotJob(db, {
      userId,
      cycle,
      day: nextDay,
      scheduledFor: scheduledAt,
      messageId,
      deliveryId,
      source
    });
  } catch (error) {
    try {
      await cancelQStashMessage(messageId);
    } catch (cancelError) {
      console.error(
        "[qstash-routine-pilot] rollback cancel error:",
        cancelError
      );
    }
    throw error;
  }

  console.log(
    `[qstash-routine-pilot] user=${userId} cycle=${cycle} day=${nextDay} message=${messageId} scheduled=${new Date(scheduledAt).toISOString()}`
  );

  return {
    ok: true,
    enabled: true,
    scheduled: true,
    reused: Boolean(published.deduplicated),
    userId,
    cycle,
    day: nextDay,
    messageId,
    deliveryId,
    scheduledFor: new Date(scheduledAt).toISOString()
  };
}

function requestSource(req) {
  const method = String(req.method || "").toUpperCase();
  const requestPath = String(req.path || req.url || "").split("?")[0];

  if (method === "POST" && requestPath === ROUTINE_COMPLETE_PATH) {
    return "routine_complete";
  }

  if (method === "PATCH" && requestPath.startsWith(PROFILE_PATH_PREFIX)) {
    return "profile_patch";
  }

  return "";
}

function installResponseSyncMiddleware(app) {
  app.use((req, res, next) => {
    const source = requestSource(req);
    if (!source) return next();

    const originalJson = res.json;
    let intercepted = false;

    res.json = function qstashRoutinePilotJson(payload) {
      if (
        intercepted ||
        res.statusCode >= 400 ||
        !payload?.ok ||
        !payload?.state ||
        !pilotConfiguredForUser(payload.state.userId)
      ) {
        return originalJson.call(this, payload);
      }

      intercepted = true;

      syncRoutinePilotFromState(payload.state, {
        source,
        completedDay: source === "routine_complete" ? req.body?.day : null
      })
        .then(result => {
          payload.qstashRoutinePilot = result;
        })
        .catch(error => {
          console.error(
            `[qstash-routine-pilot] ${source} sync error:`,
            error
          );
          payload.qstashRoutinePilot = {
            ok: false,
            enabled: true,
            error: error?.message || "No se pudo programar QStash."
          };
        })
        .finally(() => {
          originalJson.call(res, payload);
        });

      return res;
    };

    return next();
  });
}

function attachRoutinePilot(app) {
  if (attached) return;
  attached = true;

  app.get(STATUS_PATH, async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const db = getPool();
    const ids = [...pilotUserIds()];
    let jobs = [];

    if (db && ids.length) {
      try {
        const result = await db.query(
          `SELECT
             jobs.user_id,
             users.name,
             jobs.cycle,
             jobs.day,
             jobs.scheduled_for,
             jobs.message_id,
             jobs.delivery_id,
             jobs.status,
             jobs.source,
             jobs.updated_at
           FROM qstash_routine_pilot_jobs AS jobs
           LEFT JOIN users ON users.id = jobs.user_id
           WHERE jobs.user_id = ANY($1::text[])
           ORDER BY jobs.updated_at DESC
           LIMIT 20`,
          [ids]
        );
        jobs = result.rows;
      } catch (error) {
        return res.status(503).json({
          ok: false,
          error: error?.message || "No se pudo leer el estado del piloto."
        });
      }
    }

    return res.json({
      ok: true,
      enabled: pilotEnabled(),
      configured: qstashConfigured() && pushConfigured(),
      pilotUsersConfigured: ids.length,
      destinationConfigured: Boolean(destinationUrl()),
      jobs
    });
  });

  installResponseSyncMiddleware(app);
}

// qstash-notification-server-v1.js ya parchea .use antes de cargar este
// módulo. Conservamos ese wrapper y añadimos el piloto justo después de que
// server.js instala express.json(), antes del resto de rutas /api.
express.application.use = function qstashRoutinePilotUse(...args) {
  const result = originalUse.apply(this, args);

  if (!attached) {
    attachRoutinePilot(this);
  }

  return result;
};

module.exports = {
  STATUS_PATH,
  isPilotUser,
  pilotEnabled,
  pilotConfiguredForUser,
  qstashDeduplicationId,
  syncRoutinePilotFromState
};
