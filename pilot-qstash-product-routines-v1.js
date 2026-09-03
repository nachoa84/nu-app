"use strict";

// NU APP · QSTASH PRODUCT ROUTINES PILOT V1
// Piloto controlado para LumiSpa, WellSpa y Galvanic Spa.
// Usa el mismo flag/allowlist del piloto de Collagen+ y mantiene
// el scheduler actual como fallback hasta terminar la migración.

const crypto = require("crypto");
const express = require("express");
const { Pool } = require("pg");
const {
  DELIVERY_PATH,
  encryptPayload,
  normalizeBaseUrl
} = require("./qstash-notification-server-v1");
const {
  isPilotUser,
  pilotEnabled,
  pilotConfiguredForUser
} = require("./qstash-routine-pilot-v1");
const {
  databasePoolOptionsV113
} = require("./runtime-config-v113");

const originalUse = express.application.use;
const STATUS_PATH = "/api/admin/qstash-product-routine-pilot-status";
const COMPLETE_PATH = "/api/product-routines/complete";
const BOOTSTRAP_PATH = "/api/product-routines/bootstrap";
const PROFILE_PATH_PREFIX = "/api/profile/";

const ROUTINES = Object.freeze({
  "lumispa-10": "LumiSpa",
  "wellspa-10": "WellSpa",
  "galvanicspa-10": "Galvanic Spa"
});

const QSTASH_API_BASE = String(
  process.env.QSTASH_URL || "https://qstash.upstash.io"
).trim().replace(/\/$/, "");

let attached = false;
let pool = null;

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

function destinationUrl() {
  const base = normalizeBaseUrl(process.env.QSTASH_DESTINATION_BASE_URL);
  return base ? `${base}${DELIVERY_PATH}` : "";
}

function isProductRoutineId(value) {
  return Object.prototype.hasOwnProperty.call(
    ROUTINES,
    String(value || "").trim()
  );
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
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function deduplicationId({ userId, routineId, cycle, day, scheduledAt }) {
  return crypto
    .createHash("sha256")
    .update(`${userId}:${routineId}:${cycle}:${day}:${scheduledAt}`)
    .digest("hex");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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
    return { ok: true, notFound: response.status === 404 };
  }
  const detail = await response.text().catch(() => "");
  throw new Error(
    `QStash no pudo cancelar ${normalized}: ${detail || `HTTP ${response.status}`}`
  );
}

async function publishMessage({ destination, body, notBefore, deduplicationId: dedupe }) {
  const response = await fetchWithTimeout(
    `${QSTASH_API_BASE}/v2/publish/${destination}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${String(process.env.QSTASH_TOKEN || "").trim()}`,
        "Content-Type": "application/json",
        "Upstash-Not-Before": String(notBefore),
        "Upstash-Retries": "3",
        "Upstash-Label": "nu-app-product-routine-pilot-v1",
        "Upstash-Deduplication-Id": dedupe,
        "Upstash-Redact-Fields": "body"
      },
      body
    }
  );
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_) {
    parsed = null;
  }
  if (!response.ok) {
    const detail = parsed?.error || parsed?.message || text || `HTTP ${response.status}`;
    throw new Error(`QStash rechazó la programación de rutina: ${detail}`);
  }
  return parsed || {};
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

async function readProductState(db, userId) {
  const result = await db.query(
    `SELECT routine_id, current_day, next_unlock_at
     FROM product_routine_states
     WHERE user_id = $1
     ORDER BY routine_id`,
    [userId]
  );
  const routines = {};
  for (const row of result.rows) {
    if (!isProductRoutineId(row.routine_id)) continue;
    routines[row.routine_id] = {
      initialized: true,
      currentDay: Number(row.current_day),
      nextUnlockAt: row.next_unlock_at
        ? new Date(row.next_unlock_at).getTime()
        : null
    };
  }
  return { userId, routines };
}

async function currentJob(db, { userId, routineId, cycle, day }) {
  const result = await db.query(
    `SELECT message_id, delivery_id, scheduled_for, status, source
     FROM qstash_product_routine_pilot_jobs
     WHERE user_id = $1
       AND routine_id = $2
       AND cycle = $3
       AND day = $4
     LIMIT 1`,
    [userId, routineId, cycle, day]
  );
  return result.rows[0] || null;
}

async function markCancelled(db, { userId, routineId, cycle, day }) {
  await db.query(
    `UPDATE qstash_product_routine_pilot_jobs
     SET status = 'cancelled', updated_at = NOW()
     WHERE user_id = $1
       AND routine_id = $2
       AND cycle = $3
       AND day = $4
       AND status = 'scheduled'`,
    [userId, routineId, cycle, day]
  );
}

async function cancelScheduledJobsForRoutine(db, { userId, routineId }) {
  const result = await db.query(
    `SELECT cycle, day, message_id
     FROM qstash_product_routine_pilot_jobs
     WHERE user_id = $1
       AND routine_id = $2
       AND status = 'scheduled'`,
    [userId, routineId]
  );
  for (const row of result.rows) {
    await cancelQStashMessage(row.message_id);
    await markCancelled(db, {
      userId,
      routineId,
      cycle: Number(row.cycle),
      day: Number(row.day)
    });
  }
  return result.rowCount;
}

async function saveJob(db, {
  userId,
  routineId,
  cycle,
  day,
  scheduledFor,
  messageId,
  deliveryId,
  source
}) {
  await db.query(
    `INSERT INTO qstash_product_routine_pilot_jobs (
       user_id, routine_id, cycle, day, scheduled_for,
       message_id, delivery_id, status, source, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8, NOW())
     ON CONFLICT (user_id, routine_id, cycle, day)
     DO UPDATE SET
       scheduled_for = EXCLUDED.scheduled_for,
       message_id = EXCLUDED.message_id,
       delivery_id = EXCLUDED.delivery_id,
       status = 'scheduled',
       source = EXCLUDED.source,
       updated_at = NOW()`,
    [
      userId,
      routineId,
      cycle,
      day,
      new Date(scheduledFor),
      messageId,
      deliveryId,
      source
    ]
  );
}

async function syncOneRoutine({
  db,
  userId,
  routineId,
  routine,
  source,
  completedDay = null
}) {
  if (!isProductRoutineId(routineId)) {
    return { ok: true, routineId, scheduled: false, reason: "unsupported_routine" };
  }

  const currentDay = Number(routine?.currentDay);
  const scheduledAt = parseScheduledAt(routine?.nextUnlockAt);
  const cycle = 1;

  if (
    !Number.isInteger(currentDay) ||
    currentDay < 1 ||
    currentDay >= 10 ||
    !scheduledAt
  ) {
    const cancelled = await cancelScheduledJobsForRoutine(
      db,
      { userId, routineId }
    );
    return {
      ok: true,
      routineId,
      scheduled: false,
      cancelled,
      reason: "no_pending_unlock"
    };
  }

  if (
    source === "product_routine_complete" &&
    Number.isFinite(Number(completedDay)) &&
    Number(completedDay) !== currentDay
  ) {
    return {
      ok: true,
      routineId,
      scheduled: false,
      reason: "completed_day_not_current"
    };
  }

  const nextDay = currentDay + 1;
  const existing = await currentJob(db, {
    userId,
    routineId,
    cycle,
    day: nextDay
  });
  const existingAt = existing?.scheduled_for
    ? new Date(existing.scheduled_for).getTime()
    : null;

  if (
    existing?.status === "scheduled" &&
    existing?.message_id &&
    existingAt &&
    Math.abs(existingAt - scheduledAt) <= 1000
  ) {
    return {
      ok: true,
      routineId,
      scheduled: true,
      reused: true,
      day: nextDay,
      messageId: existing.message_id,
      deliveryId: existing.delivery_id,
      scheduledFor: new Date(scheduledAt).toISOString()
    };
  }

  if (existing?.status === "scheduled" && existing?.message_id) {
    await cancelQStashMessage(existing.message_id);
    await markCancelled(db, {
      userId,
      routineId,
      cycle,
      day: nextDay
    });
  }

  const subscription = await latestSubscription(db, userId);
  if (!subscription) {
    return {
      ok: false,
      routineId,
      scheduled: false,
      reason: "no_push_subscription"
    };
  }

  const deliveryId = crypto.randomUUID();
  const destination = destinationUrl();
  const name = ROUTINES[routineId];
  const privateMessage = {
    version: 1,
    deliveryId,
    subscription,
    payload: {
      title: `🔥 Tu Día ${nextDay} de ${name} está disponible`,
      body: "Entrá y descubrí tu acción de hoy.",
      url: `/?routine=${encodeURIComponent(routineId)}&day=${nextDay}&notification=1`,
      tag: `routine_daily_${userId}_${routineId}`
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
  const dedupe = deduplicationId({
    userId,
    routineId,
    cycle,
    day: nextDay,
    scheduledAt
  });
  const published = await publishMessage({
    destination,
    body: rawBody,
    notBefore,
    deduplicationId: dedupe
  });
  const messageId = String(published.messageId || "").trim();
  if (!messageId) {
    throw new Error("QStash no devolvió messageId para la rutina.");
  }

  try {
    await saveJob(db, {
      userId,
      routineId,
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
      console.error("[qstash-product-pilot] rollback cancel error:", cancelError);
    }
    throw error;
  }

  console.log(
    `[qstash-product-pilot] user=${userId} routine=${routineId} ` +
    `day=${nextDay} message=${messageId} ` +
    `scheduled=${new Date(scheduledAt).toISOString()}`
  );

  return {
    ok: true,
    routineId,
    scheduled: true,
    reused: Boolean(published.deduplicated),
    day: nextDay,
    messageId,
    deliveryId,
    scheduledFor: new Date(scheduledAt).toISOString()
  };
}

async function syncProductRoutines({
  userId,
  state = null,
  targetRoutineId = null,
  completedDay = null,
  source = "unknown"
}) {
  const normalizedUserId = String(userId || "").trim();
  if (!isPilotUser(normalizedUserId)) {
    return { ok: true, enabled: false, reason: "user_not_in_pilot" };
  }
  if (!pilotConfiguredForUser(normalizedUserId)) {
    return { ok: false, enabled: true, reason: "pilot_not_configured" };
  }
  const db = getPool();
  if (!db) {
    return { ok: false, enabled: true, reason: "database_unavailable" };
  }

  const productState = state?.routines && state.userId
    ? state
    : await readProductState(db, normalizedUserId);
  const routineIds = targetRoutineId
    ? [String(targetRoutineId)]
    : Object.keys(ROUTINES);
  const results = [];

  for (const routineId of routineIds) {
    const routine = productState.routines?.[routineId];
    results.push(
      await syncOneRoutine({
        db,
        userId: normalizedUserId,
        routineId,
        routine,
        source,
        completedDay:
          routineId === targetRoutineId ? completedDay : null
      })
    );
  }

  return {
    ok: results.every(result => result.ok !== false),
    enabled: true,
    userId: normalizedUserId,
    results
  };
}

function requestSource(req) {
  const method = String(req.method || "").toUpperCase();
  const requestPath = String(req.path || req.url || "").split("?")[0];
  if (method === "POST" && requestPath === COMPLETE_PATH) {
    return "product_routine_complete";
  }
  if (method === "POST" && requestPath === BOOTSTRAP_PATH) {
    return "product_routine_bootstrap";
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

    res.json = function qstashProductRoutineJson(payload) {
      if (intercepted || res.statusCode >= 400 || !payload?.ok) {
        return originalJson.call(this, payload);
      }

      const userId = source === "profile_patch"
        ? String(payload?.state?.userId || req.params?.userId || "").trim()
        : String(payload?.state?.userId || req.body?.userId || "").trim();

      if (!userId || !isPilotUser(userId)) {
        return originalJson.call(this, payload);
      }

      intercepted = true;
      syncProductRoutines({
        userId,
        state: source === "profile_patch" ? null : payload.state,
        targetRoutineId:
          source === "product_routine_complete" ? req.body?.routineId : null,
        completedDay:
          source === "product_routine_complete" ? req.body?.day : null,
        source
      })
        .then(result => {
          payload.qstashProductRoutinePilot = result;
        })
        .catch(error => {
          console.error(`[qstash-product-pilot] ${source} sync error:`, error);
          payload.qstashProductRoutinePilot = {
            ok: false,
            enabled: true,
            error: error?.message || "No se pudo programar QStash para la rutina."
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

function attachProductRoutinePilot(app) {
  if (attached) return;
  attached = true;

  app.get(STATUS_PATH, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getPool();
    const ids = String(process.env.QSTASH_ROUTINE_PILOT_USER_IDS || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
    let jobs = [];

    if (db && ids.length) {
      try {
        const result = await db.query(
          `SELECT
             jobs.user_id,
             users.name,
             jobs.routine_id,
             jobs.cycle,
             jobs.day,
             jobs.scheduled_for,
             jobs.message_id,
             jobs.delivery_id,
             jobs.status,
             jobs.source,
             jobs.updated_at
           FROM qstash_product_routine_pilot_jobs AS jobs
           LEFT JOIN users ON users.id = jobs.user_id
           WHERE jobs.user_id = ANY($1::text[])
           ORDER BY jobs.updated_at DESC
           LIMIT 30`,
          [ids]
        );
        jobs = result.rows;
      } catch (error) {
        return res.status(503).json({
          ok: false,
          error: error?.message || "No se pudo leer el estado del piloto de rutinas."
        });
      }
    }

    return res.json({
      ok: true,
      enabled: pilotEnabled(),
      configured:
        Boolean(destinationUrl()) &&
        ids.some(id => pilotConfiguredForUser(id)),
      pilotUsersConfigured: ids.length,
      routines: Object.keys(ROUTINES),
      jobs
    });
  });

  installResponseSyncMiddleware(app);
}

express.application.use = function qstashProductRoutinePilotUse(...args) {
  const result = originalUse.apply(this, args);
  if (!attached) {
    attachProductRoutinePilot(this);
  }
  return result;
};

module.exports = {
  STATUS_PATH,
  ROUTINES,
  deduplicationId,
  isProductRoutineId,
  syncProductRoutines
};
