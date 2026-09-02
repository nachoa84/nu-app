const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const { Pool } = require("pg");
const { databasePoolOptionsV113 } = require("./runtime-config-v113");

const originalListen = express.application.listen;
const originalStatic = express.static;
const ANALYTICS_SINCE = "2026-09-02";
const SYNC_WINDOW_MS = 60 * 1000;
const SYNC_MAX_PER_WINDOW = 30;
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;
const syncRateBuckets = new Map();
let analyticsAttached = false;
let analyticsPool = null;
let schemaPromise = null;

function getPool() {
  if (analyticsPool) return analyticsPool;

  const options = databasePoolOptionsV113(
    process.env.DATABASE_URL,
    process.env
  );

  if (!options) return null;

  analyticsPool = new Pool({
    ...options,
    max: Math.min(Number(options.max || 2), 2)
  });

  return analyticsPool;
}

async function ensureAnalyticsSchema() {
  const pool = getPool();
  if (!pool) return false;

  if (!schemaPromise) {
    schemaPromise = pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS pwa_installed_at TIMESTAMPTZ NULL;
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS guide_started_at TIMESTAMPTZ NULL;
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS guide_completed_at TIMESTAMPTZ NULL;
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS guide_completed_steps INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS guide_total_steps INTEGER NOT NULL DEFAULT 9;
      CREATE INDEX IF NOT EXISTS idx_users_pwa_installed_at
        ON users(pwa_installed_at)
        WHERE pwa_installed_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_users_guide_completed_at
        ON users(guide_completed_at)
        WHERE guide_completed_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users(last_seen_at);
    `).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
  return true;
}

function safeEqualToken(provided, expected) {
  if (!provided || !expected) return false;
  const a = crypto.createHash("sha256").update(String(provided)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res) {
  const expectedToken = String(process.env.ADMIN_TEST_TOKEN || "");
  const providedToken = String(req.headers["x-admin-token"] || "");

  if (!expectedToken) {
    res.status(503).json({ ok: false, error: "ADMIN_TEST_TOKEN no configurado." });
    return false;
  }

  if (!safeEqualToken(providedToken, expectedToken)) {
    res.status(401).json({ ok: false, error: "Token administrativo inválido." });
    return false;
  }

  return true;
}

function normalizeCount(value, max = 100) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return 0;
  return Math.min(number, max);
}

function clientKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
}

function allowAnalyticsSync(req, res) {
  const now = Date.now();
  const key = clientKey(req);
  const current = syncRateBuckets.get(key);

  if (!current || now - current.startedAt >= SYNC_WINDOW_MS) {
    syncRateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }

  if (current.count >= SYNC_MAX_PER_WINDOW) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((SYNC_WINDOW_MS - (now - current.startedAt)) / 1000)
    );
    res.set("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ ok: false, error: "Demasiadas actualizaciones de analytics." });
    return false;
  }

  current.count += 1;
  return true;
}

function validateSyncBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Payload inválido." };
  }

  const allowedKeys = new Set([
    "userId",
    "installed",
    "guideStarted",
    "guideCompletedSteps",
    "guideTotalSteps"
  ]);
  if (Object.keys(body).some(key => !allowedKeys.has(key))) {
    return { ok: false, error: "Payload contiene campos no permitidos." };
  }

  const userId = String(body.userId || "").trim();
  if (!USER_ID_PATTERN.test(userId)) {
    return { ok: false, error: "Usuario inválido." };
  }

  if (body.installed !== undefined && typeof body.installed !== "boolean") {
    return { ok: false, error: "installed inválido." };
  }

  if (body.guideStarted !== undefined && typeof body.guideStarted !== "boolean") {
    return { ok: false, error: "guideStarted inválido." };
  }

  const guideCompletedSteps = normalizeCount(body.guideCompletedSteps, 50);
  const guideTotalSteps = normalizeCount(body.guideTotalSteps, 50);

  if (
    body.guideCompletedSteps !== undefined &&
    Number(body.guideCompletedSteps) !== guideCompletedSteps
  ) {
    return { ok: false, error: "guideCompletedSteps inválido." };
  }

  if (
    body.guideTotalSteps !== undefined &&
    Number(body.guideTotalSteps) !== guideTotalSteps
  ) {
    return { ok: false, error: "guideTotalSteps inválido." };
  }

  if (guideTotalSteps > 0 && guideCompletedSteps > guideTotalSteps) {
    return { ok: false, error: "Progreso de guía inválido." };
  }

  return {
    ok: true,
    value: {
      userId,
      installed: body.installed === true,
      guideStarted: body.guideStarted === true || guideCompletedSteps > 0,
      guideCompletedSteps,
      guideTotalSteps
    }
  };
}

function attachBasicAnalytics(app) {
  if (analyticsAttached) return;
  analyticsAttached = true;

  app.post("/api/analytics/sync", async (req, res) => {
    if (!allowAnalyticsSync(req, res)) return;

    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > 4096) {
      return res.status(413).json({ ok: false, error: "Payload demasiado grande." });
    }

    const validation = validateSyncBody(req.body);
    if (!validation.ok) {
      return res.status(400).json({ ok: false, error: validation.error });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ ok: false, error: "Base de datos no disponible." });
    }

    try {
      await ensureAnalyticsSchema();

      const {
        userId,
        installed,
        guideStarted,
        guideCompletedSteps,
        guideTotalSteps
      } = validation.value;
      const guideComplete = guideTotalSteps > 0 && guideCompletedSteps >= guideTotalSteps;

      const result = await pool.query(
        `UPDATE users
         SET
           pwa_installed_at = CASE
             WHEN $2::boolean THEN COALESCE(pwa_installed_at, NOW())
             ELSE pwa_installed_at
           END,
           guide_started_at = CASE
             WHEN $3::boolean THEN COALESCE(guide_started_at, NOW())
             ELSE guide_started_at
           END,
           guide_completed_at = CASE
             WHEN $4::boolean THEN COALESCE(guide_completed_at, NOW())
             ELSE guide_completed_at
           END,
           guide_completed_steps = GREATEST(guide_completed_steps, $5::integer),
           guide_total_steps = CASE
             WHEN $6::integer > 0 THEN $6::integer
             ELSE guide_total_steps
           END,
           last_seen_at = NOW(),
           updated_at = NOW()
         WHERE id = $1
         RETURNING id, pwa_installed_at, guide_started_at,
                   guide_completed_at, guide_completed_steps, guide_total_steps`,
        [userId, installed, guideStarted, guideComplete, guideCompletedSteps, guideTotalSteps]
      );

      if (!result.rowCount) {
        return res.status(404).json({ ok: false, error: "Usuario no encontrado." });
      }

      return res.json({ ok: true, analytics: result.rows[0] });
    } catch (error) {
      console.error("[basic-analytics] sync error:", error);
      return res.status(500).json({ ok: false, error: "No se pudo guardar analytics." });
    }
  });

  app.get("/api/analytics/summary", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ ok: false, error: "Base de datos no disponible." });
    }

    try {
      await ensureAnalyticsSchema();

      const [overview, countries, notifications, completedUsers, guideProgressUsers, users] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*)::int AS total_users,
             COUNT(*) FILTER (WHERE pwa_installed_at IS NOT NULL)::int AS installed,
             COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '1 day')::int AS active_1d,
             COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '7 days')::int AS active_7d,
             COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '30 days')::int AS active_30d,
             COUNT(*) FILTER (WHERE guide_started_at IS NOT NULL)::int AS guide_started,
             COUNT(*) FILTER (WHERE guide_completed_at IS NOT NULL)::int AS guide_completed
           FROM users`
        ),
        pool.query(
          `SELECT country, COUNT(*)::int AS installed
           FROM users
           WHERE pwa_installed_at IS NOT NULL
           GROUP BY country
           ORDER BY installed DESC, country ASC`
        ),
        pool.query(
          `SELECT
             (SELECT COUNT(DISTINCT user_id)::int FROM push_subscriptions) AS notifications_enabled,
             (SELECT COUNT(DISTINCT b.user_id)::int
                FROM notification_delivery_batches b
                JOIN notification_deliveries d ON d.logical_key = b.logical_key
               WHERE d.status = 'sent') AS users_reached,
             (SELECT COUNT(*)::int
                FROM notification_deliveries
               WHERE status = 'sent') AS successful_device_deliveries`
        ),
        pool.query(
          `SELECT id, name, country, guide_completed_at
           FROM users
           WHERE guide_completed_at IS NOT NULL
           ORDER BY guide_completed_at DESC
           LIMIT 200`
        ),
        pool.query(
          `SELECT
             id,
             name,
             country,
             guide_completed_steps,
             guide_total_steps,
             guide_started_at,
             guide_completed_at,
             (guide_completed_at IS NOT NULL) AS completed
           FROM users
           WHERE guide_started_at IS NOT NULL
           ORDER BY
             (guide_completed_at IS NULL) DESC,
             guide_completed_steps DESC,
             guide_started_at DESC
           LIMIT 200`
        ),
        pool.query(
          `SELECT
             id,
             name,
             country,
             created_at,
             last_seen_at,
             pwa_installed_at,
             guide_completed_steps,
             guide_total_steps,
             (guide_completed_at IS NOT NULL) AS guide_completed
           FROM users
           ORDER BY last_seen_at DESC NULLS LAST, created_at DESC
           LIMIT 250`
        )
      ]);

      return res.json({
        ok: true,
        analyticsSince: ANALYTICS_SINCE,
        overview: overview.rows[0],
        countries: countries.rows,
        notifications: notifications.rows[0],
        users: users.rows,
        guideCompletedUsers: completedUsers.rows,
        guideProgressUsers: guideProgressUsers.rows
      });
    } catch (error) {
      console.error("[basic-analytics] summary error:", error);
      return res.status(500).json({ ok: false, error: "No se pudo consultar analytics." });
    }
  });
}

express.static = function analyticsAwareStatic(root, options) {
  const staticMiddleware = originalStatic(root, options);

  return async function analyticsStaticMiddleware(req, res, next) {
    if (req.path !== "/backend-client.js") {
      return staticMiddleware(req, res, next);
    }

    try {
      const [baseClient, analyticsClient] = await Promise.all([
        fs.promises.readFile(path.join(root, "backend-client.js"), "utf8"),
        fs.promises.readFile(path.join(root, "analytics-basic-client-v1.js"), "utf8")
      ]);

      res.set("Cache-Control", "no-cache");
      res.type("application/javascript; charset=utf-8");
      return res.send(`${baseClient}\n\n${analyticsClient}\n`);
    } catch (error) {
      return next(error);
    }
  };
};

express.application.listen = function basicAnalyticsListen(...args) {
  attachBasicAnalytics(this);
  return originalListen.apply(this, args);
};
