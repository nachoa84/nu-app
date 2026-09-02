const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const { Pool } = require("pg");
const { databasePoolOptionsV113 } = require("./runtime-config-v113");

const originalListen = express.application.listen;
const originalStatic = express.static;
const ANALYTICS_SINCE = "2026-09-02";
const USER_TYPES = new Set(["unknown", "real", "test"]);
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
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS analytics_user_type TEXT NOT NULL DEFAULT 'unknown';
      CREATE INDEX IF NOT EXISTS idx_users_pwa_installed_at
        ON users(pwa_installed_at)
        WHERE pwa_installed_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_users_guide_completed_at
        ON users(guide_completed_at)
        WHERE guide_completed_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users(last_seen_at);
      CREATE INDEX IF NOT EXISTS idx_users_analytics_user_type ON users(analytics_user_type);
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

function scopeWhere(scope, alias = "u") {
  if (scope === "real") return `${alias}.analytics_user_type = 'real'`;
  if (scope === "test") return `${alias}.analytics_user_type = 'test'`;
  if (scope === "unknown") return `${alias}.analytics_user_type = 'unknown'`;
  return "TRUE";
}

function attachBasicAnalytics(app) {
  if (analyticsAttached) return;
  analyticsAttached = true;

  app.post("/api/analytics/sync", async (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ ok: false, error: "Base de datos no disponible." });
    }

    try {
      await ensureAnalyticsSchema();

      const userId = String(req.body?.userId || "").trim();
      if (!userId || userId.length > 200) {
        return res.status(400).json({ ok: false, error: "Usuario inválido." });
      }

      const installed = req.body?.installed === true;
      const guideCompletedSteps = normalizeCount(req.body?.guideCompletedSteps, 50);
      const guideTotalSteps = normalizeCount(req.body?.guideTotalSteps, 50);
      const guideStarted = req.body?.guideStarted === true || guideCompletedSteps > 0;
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
                   guide_completed_at, guide_completed_steps, guide_total_steps,
                   analytics_user_type`,
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

  app.post("/api/analytics/user-type", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ ok: false, error: "Base de datos no disponible." });
    }

    try {
      await ensureAnalyticsSchema();
      const userId = String(req.body?.userId || "").trim();
      const userType = String(req.body?.userType || "").trim().toLowerCase();

      if (!userId || userId.length > 200 || !USER_TYPES.has(userType)) {
        return res.status(400).json({ ok: false, error: "Clasificación inválida." });
      }

      const result = await pool.query(
        `UPDATE users
            SET analytics_user_type = $2,
                updated_at = NOW()
          WHERE id = $1
          RETURNING id, name, country, analytics_user_type`,
        [userId, userType]
      );

      if (!result.rowCount) {
        return res.status(404).json({ ok: false, error: "Usuario no encontrado." });
      }

      return res.json({ ok: true, user: result.rows[0] });
    } catch (error) {
      console.error("[basic-analytics] user type error:", error);
      return res.status(500).json({ ok: false, error: "No se pudo clasificar el usuario." });
    }
  });

  app.get("/api/analytics/summary", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ ok: false, error: "Base de datos no disponible." });
    }

    const requestedScope = String(req.query?.scope || "all").toLowerCase();
    const scope = ["all", "real", "test", "unknown"].includes(requestedScope)
      ? requestedScope
      : "all";
    const where = scopeWhere(scope, "u");

    try {
      await ensureAnalyticsSchema();

      const [overview, countries, notifications, completedUsers, guideProgressUsers, breakdown, users] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*)::int AS total_users,
             COUNT(*) FILTER (WHERE u.pwa_installed_at IS NOT NULL)::int AS installed,
             COUNT(*) FILTER (WHERE u.last_seen_at >= NOW() - INTERVAL '1 day')::int AS active_1d,
             COUNT(*) FILTER (WHERE u.last_seen_at >= NOW() - INTERVAL '7 days')::int AS active_7d,
             COUNT(*) FILTER (WHERE u.last_seen_at >= NOW() - INTERVAL '30 days')::int AS active_30d,
             COUNT(*) FILTER (WHERE u.guide_started_at IS NOT NULL)::int AS guide_started,
             COUNT(*) FILTER (WHERE u.guide_completed_at IS NOT NULL)::int AS guide_completed
           FROM users u
           WHERE ${where}`
        ),
        pool.query(
          `SELECT u.country, COUNT(*)::int AS installed
           FROM users u
           WHERE ${where}
             AND u.pwa_installed_at IS NOT NULL
           GROUP BY u.country
           ORDER BY installed DESC, u.country ASC`
        ),
        pool.query(
          `SELECT
             (SELECT COUNT(DISTINCT ps.user_id)::int
                FROM push_subscriptions ps
                JOIN users u ON u.id = ps.user_id
               WHERE ${where}) AS notifications_enabled,
             (SELECT COUNT(DISTINCT b.user_id)::int
                FROM notification_delivery_batches b
                JOIN notification_deliveries d ON d.logical_key = b.logical_key
                JOIN users u ON u.id = b.user_id
               WHERE ${where} AND d.status = 'sent') AS users_reached,
             (SELECT COUNT(*)::int
                FROM notification_deliveries d
                JOIN notification_delivery_batches b ON b.logical_key = d.logical_key
                JOIN users u ON u.id = b.user_id
               WHERE ${where} AND d.status = 'sent') AS successful_device_deliveries`
        ),
        pool.query(
          `SELECT u.id, u.name, u.country, u.guide_completed_at, u.analytics_user_type
           FROM users u
           WHERE ${where}
             AND u.guide_completed_at IS NOT NULL
           ORDER BY u.guide_completed_at DESC
           LIMIT 200`
        ),
        pool.query(
          `SELECT
             u.id,
             u.name,
             u.country,
             u.analytics_user_type,
             u.guide_completed_steps,
             u.guide_total_steps,
             u.guide_started_at,
             u.guide_completed_at,
             (u.guide_completed_at IS NOT NULL) AS completed
           FROM users u
           WHERE ${where}
             AND u.guide_started_at IS NOT NULL
           ORDER BY
             (u.guide_completed_at IS NULL) DESC,
             u.guide_completed_steps DESC,
             u.guide_started_at DESC
           LIMIT 200`
        ),
        pool.query(
          `SELECT analytics_user_type, COUNT(*)::int AS users
             FROM users
            GROUP BY analytics_user_type
            ORDER BY analytics_user_type`
        ),
        pool.query(
          `SELECT
             u.id,
             u.name,
             u.country,
             u.analytics_user_type,
             u.created_at,
             u.last_seen_at,
             u.pwa_installed_at,
             u.guide_completed_steps,
             u.guide_total_steps,
             (u.guide_completed_at IS NOT NULL) AS guide_completed
           FROM users u
           ORDER BY u.last_seen_at DESC NULLS LAST, u.created_at DESC
           LIMIT 250`
        )
      ]);

      return res.json({
        ok: true,
        analyticsSince: ANALYTICS_SINCE,
        scope,
        overview: overview.rows[0],
        countries: countries.rows,
        notifications: notifications.rows[0],
        userBreakdown: breakdown.rows,
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
