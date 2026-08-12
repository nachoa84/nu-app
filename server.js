const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Client: ObjectStorageClient } = require("@replit/object-storage");
const { Pool } = require("pg");
const webpush = require("web-push");
const {
  DateTime,
  IANAZone
} = require("luxon");
const {
  attachDeliveryIdentityV111,
  classifyPushErrorV111,
  endpointHashV111,
  logicalDeliveryKeyV111,
  retryDelayMsV111,
  sourceReferencesV111,
  summarizeDeliveryRowsV111
} = require("./notification-delivery-v111");
const {
  databasePoolOptionsV113
} = require("./runtime-config-v113");
const {
  shouldHonorRangeV114,
  shouldReturnNotModifiedV114
} = require("./http-cache-v114");
const {
  consumeSharedRateLimitV115
} = require("./shared-rate-limit-v115");

const app = express();

// Replit publica la app detrás de un proxy.
// Necesario para que req.ip represente al cliente real.
app.set("trust proxy", 1);

const PORT =
  Number(process.env.PORT || 3000);

const MAX_DAY =
  Number(process.env.MAX_DAY || 30);

const SCHEDULER_INTERVAL_MS =
  Math.max(
    Number(
      process.env.SCHEDULER_INTERVAL_MS ||
      30000
    ),
    5000
  );

const DATABASE_URL =
  process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "Falta DATABASE_URL. El frontend puede iniciar, pero el backend no podrá guardar datos."
  );
}

const poolOptionsV113 =
  databasePoolOptionsV113(
    DATABASE_URL,
    process.env
  );

const pool = poolOptionsV113
  ? new Pool(poolOptionsV113)
  : null;


const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY || "";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || "";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "";

const ADMIN_TEST_TOKEN =
  process.env.ADMIN_TEST_TOKEN || "";

const CRON_SECRET =
  process.env.CRON_SECRET || "";

const ADMIN_TEST_ROUTES_ENABLED =
  String(
    process.env.ENABLE_ADMIN_TEST_ROUTES ||
    ""
  ).toLowerCase() === "true";

const DEMO_ROUTES_ENABLED =
  String(
    process.env.ENABLE_DEMO_ROUTES ||
    ""
  ).toLowerCase() === "true";

const EXTRA_ALLOWED_ORIGINS =
  new Set(
    String(
      process.env.ALLOWED_ORIGINS ||
      ""
    )
      .split(",")
      .map(value =>
        value.trim().replace(/\/$/, "")
      )
      .filter(Boolean)
  );

const pushConfigured =
  Boolean(
    VAPID_PUBLIC_KEY &&
    VAPID_PRIVATE_KEY &&
    VAPID_SUBJECT
  );

if (pushConfigured) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  console.warn(
    "Push no configurado. Faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT."
  );
}

app.use(
  express.json({
    limit: "256kb"
  })
);

function normalizeOrigin(value) {
  try {
    const url =
      new URL(String(value || ""));

    return `${url.protocol}//${url.host}`;
  } catch (_) {
    return "";
  }
}

function sameHostOrigin(req, origin) {
  const normalized =
    normalizeOrigin(origin);

  if (!normalized) {
    return false;
  }

  try {
    const originUrl =
      new URL(normalized);

    return (
      originUrl.host.toLowerCase() ===
      String(
        req.get("host") || ""
      ).toLowerCase()
    );
  } catch (_) {
    return false;
  }
}

function assertAllowedWriteOrigin(
  req,
  res,
  next
) {
  const safeMethod =
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS";

  if (safeMethod) {
    return next();
  }

  const origin =
    String(
      req.get("origin") || ""
    ).trim();

  // Requests same-origin desde la PWA pueden llegar sin Origin
  // en algunos contextos. En cambio, fetch/XHR cross-site desde
  // un navegador sí incluye Origin y queda bloqueado abajo.
  if (!origin) {
    return next();
  }

  const normalized =
    normalizeOrigin(origin);

  if (
    sameHostOrigin(req, origin) ||
    EXTRA_ALLOWED_ORIGINS.has(
      normalized
    )
  ) {
    return next();
  }

  const error =
    new Error(
      "Origen no permitido."
    );

  error.status = 403;

  return next(error);
}

function requestRateKey(req) {
  return `ip:${String(
    req.ip || "unknown"
  )}`;
}

function targetUserRateKey(req) {
  const userId =
    String(
      req.body?.userId ||
      req.params?.userId ||
      ""
    ).trim();

  return userId
    ? `user:${userId}`
    : requestRateKey(req);
}

function createRateLimiter({
  namespace,
  windowMs,
  max,
  keyFn = requestRateKey,
  message = "Demasiadas solicitudes. Esperá un momento e intentá nuevamente."
}) {
  const fallbackBuckets = new Map();
  return async (req, res, next) => {
    try {
      const now = Date.now();
      const key = String(keyFn(req) || requestRateKey(req));
      let decision;
      if (pool) {
        decision = await consumeSharedRateLimitV115(pool, {
          namespace, key, windowMs, max, now
        });
      } else {
        let bucket = fallbackBuckets.get(key);
        if (!bucket || now >= bucket.resetAt) {
          bucket = { count: 0, resetAt: now + windowMs };
          fallbackBuckets.set(key, bucket);
        }
        bucket.count += 1;
        decision = {
          allowed: bucket.count <= max,
          remaining: Math.max(max - bucket.count, 0),
          retryAfter: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1)
        };
      }
      res.set("X-RateLimit-Limit", String(max));
      res.set("X-RateLimit-Remaining", String(decision.remaining));
      if (!decision.allowed) {
        res.set("Retry-After", String(decision.retryAfter));
        return res.status(429).json({
          ok: false, error: message, retryAfter: decision.retryAfter
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

const apiWriteLimiter =
  createRateLimiter({
    namespace: "api-write",
    windowMs: 60 * 1000,
    max: 120
  });

const pushLimiter =
  createRateLimiter({
    namespace: "push",
    windowMs: 10 * 60 * 1000,
    max: 30,
    message:
      "Demasiadas operaciones de notificaciones. Esperá unos minutos."
  });

const pushTestLimiter =
  createRateLimiter({
    namespace: "push-test",
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyFn: targetUserRateKey,
    message:
      "Alcanzaste el límite de pruebas de notificaciones por ahora."
  });

const adminLimiter =
  createRateLimiter({
    namespace: "admin",
    windowMs: 10 * 60 * 1000,
    max: 10,
    keyFn: req =>
      `admin:${String(
        req.ip || "unknown"
      )}`,
    message:
      "Demasiados intentos administrativos."
  });

app.use(
  "/api",
  assertAllowedWriteOrigin
);

app.use(
  "/api",
  (req, res, next) => {
    const isWrite =
      req.method === "POST" ||
      req.method === "PATCH" ||
      req.method === "PUT" ||
      req.method === "DELETE";

    if (!isWrite) {
      return next();
    }

    return apiWriteLimiter(
      req,
      res,
      next
    );
  }
);

app.use(
  "/api/push",
  pushLimiter
);

function assertDatabase() {
  if (!pool) {
    const error =
      new Error(
        "DATABASE_URL no configurado."
      );

    error.status = 503;

    throw error;
  }
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(
    String(value || "")
  );
}

function normalizeProfile(input = {}) {
  const profile = {
    userId:
      String(input.userId || "").trim(),
    name:
      String(input.name || "").trim(),
    country:
      String(input.country || "").trim(),
    timezone:
      String(input.timezone || "").trim(),
    notificationTime:
      String(
        input.notificationTime ||
        "09:00"
      ).trim()
  };

  if (!profile.userId) {
    throw new Error(
      "Falta userId."
    );
  }

  if (!profile.name) {
    throw new Error(
      "Falta nombre."
    );
  }

  if (!profile.country) {
    throw new Error(
      "Falta país."
    );
  }

  if (
    !IANAZone.isValidZone(
      profile.timezone
    )
  ) {
    throw new Error(
      "Zona horaria inválida."
    );
  }

  if (
    !validTime(
      profile.notificationTime
    )
  ) {
    throw new Error(
      "Hora de notificación inválida."
    );
  }

  return profile;
}

function clampDay(value) {
  const day =
    Number(value || 1);

  return Math.min(
    Math.max(
      Number.isFinite(day)
        ? Math.trunc(day)
        : 1,
      1
    ),
    MAX_DAY
  );
}

function parseRoutineDay(value) {
  const day =
    Number(value);

  if (
    !Number.isInteger(day) ||
    day < 1 ||
    day > MAX_DAY
  ) {
    const error =
      new Error(
        `Día inválido. Debe ser un entero entre 1 y ${MAX_DAY}.`
      );

    error.status = 400;

    throw error;
  }

  return day;
}


function assertPushConfigured() {
  if (!pushConfigured) {
    const error =
      new Error(
        "Las notificaciones push todavía no están configuradas en el servidor."
      );

    error.status = 503;

    throw error;
  }
}


function assertCronSecret(req) {
  if (!CRON_SECRET) {
    const error = new Error("CRON_SECRET no configurado.");
    error.status = 503;
    throw error;
  }

  const provided = String(req.headers["x-cron-secret"] || "");
  const expectedDigest = crypto.createHash("sha256").update(CRON_SECRET).digest();
  const providedDigest = crypto.createHash("sha256").update(provided).digest();

  if (!provided || !crypto.timingSafeEqual(providedDigest, expectedDigest)) {
    const error = new Error("Secreto de cron inválido.");
    error.status = 401;
    throw error;
  }
}

function assertAdminTestRoutesEnabled() {
  if (!ADMIN_TEST_ROUTES_ENABLED) {
    const error =
      new Error(
        "Ruta no disponible."
      );

    error.status = 404;

    throw error;
  }
}

function assertDemoRoutesEnabled() {
  if (!DEMO_ROUTES_ENABLED) {
    const error =
      new Error(
        "Ruta no disponible."
      );

    error.status = 404;

    throw error;
  }
}

function assertAdminTestToken(req) {
  if (!ADMIN_TEST_TOKEN) {
    const error =
      new Error(
        "ADMIN_TEST_TOKEN no configurado."
      );

    error.status = 503;

    throw error;
  }

  const provided =
    String(
      req.headers[
        "x-admin-token"
      ] || ""
    );

  const expectedDigest =
    crypto
      .createHash("sha256")
      .update(ADMIN_TEST_TOKEN)
      .digest();

  const providedDigest =
    crypto
      .createHash("sha256")
      .update(provided)
      .digest();

  if (
    !provided ||
    !crypto.timingSafeEqual(
      providedDigest,
      expectedDigest
    )
  ) {
    const error =
      new Error(
        "Token de prueba inválido."
      );

    error.status = 401;

    throw error;
  }
}

function normalizePushSubscription(input) {
  if (
    !input ||
    typeof input !== "object" ||
    !input.endpoint ||
    !input.keys?.p256dh ||
    !input.keys?.auth
  ) {
    const error =
      new Error(
        "Suscripción push inválida."
      );

    error.status = 400;

    throw error;
  }

  return {
    endpoint:
      String(input.endpoint),
    expirationTime:
      input.expirationTime || null,
    keys: {
      p256dh:
        String(input.keys.p256dh),
      auth:
        String(input.keys.auth)
    }
  };
}

function nextUnlockAt({
  openedAt,
  timezone,
  notificationTime
}) {
  const [hour, minute] =
    notificationTime
      .split(":")
      .map(Number);

  const openedLocal =
    DateTime
      .fromJSDate(
        new Date(openedAt),
        {
          zone: timezone
        }
      );

  const next =
    openedLocal
      .plus({
        days: 1
      })
      .startOf("day")
      .set({
        hour,
        minute,
        second: 0,
        millisecond: 0
      });

  return next
    .toUTC()
    .toJSDate();
}

async function initDatabase() {
  if (!pool) return;

  const schema =
    fs.readFileSync(
      path.join(
        __dirname,
        "schema.sql"
      ),
      "utf8"
    );

  const client = await pool.connect();
  const schemaLockV115 = 11520260811;

  try {
    await client.query(
      "SELECT pg_advisory_lock($1)",
      [schemaLockV115]
    );
    await client.query(schema);
  } finally {
    try {
      await client.query(
        "SELECT pg_advisory_unlock($1)",
        [schemaLockV115]
      );
    } finally {
      client.release();
    }
  }

  console.log(
    "Base de datos inicializada."
  );
}

async function withTransaction(fn) {
  assertDatabase();

  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");

    const result =
      await fn(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
}

async function advanceIfEligible(
  client,
  userId
) {
  const userResult =
    await client.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
      FOR UPDATE
      `,
      [userId]
    );

  if (!userResult.rowCount) {
    const error =
      new Error(
        "Usuario no encontrado."
      );

    error.status = 404;

    throw error;
  }

  const user =
    userResult.rows[0];

  if (
    user.current_day < MAX_DAY &&
    user.next_unlock_at &&
    new Date(
      user.next_unlock_at
    ).getTime() <= Date.now()
  ) {
    const nextDay =
      Number(user.current_day) + 1;

    await client.query(
      `
      UPDATE users
      SET
        current_day = $2,
        next_unlock_at = NULL,
        updated_at = NOW(),
        last_seen_at = NOW()
      WHERE id = $1
      `,
      [
        userId,
        nextDay
      ]
    );

    await client.query(
      `
      INSERT INTO notification_jobs (
        user_id,
        cycle,
        day,
        kind,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        'day_available',
        'pending'
      )
      ON CONFLICT (
        user_id,
        cycle,
        day,
        kind
      )
      DO NOTHING
      `,
      [
        userId,
        user.cycle,
        nextDay
      ]
    );

    return {
      advanced: true,
      day: nextDay,
      cycle:
        Number(user.cycle)
    };
  }

  await client.query(
    `
    UPDATE users
    SET last_seen_at = NOW()
    WHERE id = $1
    `,
    [userId]
  );

  return {
    advanced: false,
    day:
      Number(user.current_day),
    cycle:
      Number(user.cycle)
  };
}

async function getState(
  client,
  userId
) {
  const userResult =
    await client.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

  if (!userResult.rowCount) {
    const error =
      new Error(
        "Usuario no encontrado."
      );

    error.status = 404;

    throw error;
  }

  const user =
    userResult.rows[0];

  const progressResult =
    await client.query(
      `
      SELECT
        day,
        opened_at,
        completed_at
      FROM day_progress
      WHERE
        user_id = $1
        AND cycle = $2
      ORDER BY day ASC
      `,
      [
        userId,
        user.cycle
      ]
    );

  const openedDays = {};
  const completedDays = [];

  for (
    const row of progressResult.rows
  ) {
    if (row.opened_at) {
      openedDays[row.day] =
        new Date(
          row.opened_at
        ).getTime();
    }

    if (row.completed_at) {
      completedDays.push(
        row.day
      );
    }
  }

  return {
    userId: user.id,
    currentDay:
      Number(user.current_day),
    cycle:
      Number(user.cycle),
    nextUnlockAt:
      user.next_unlock_at
        ? new Date(
            user.next_unlock_at
          ).getTime()
        : null,
    openedDays,
    completedDays,
    profile: {
      name: user.name,
      country: user.country,
      timezone: user.timezone,
      notificationTime:
        user.notification_time
    }
  };
}

async function recalculatePendingUnlock(
  client,
  userId
) {
  const userResult =
    await client.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
      FOR UPDATE
      `,
      [userId]
    );

  if (!userResult.rowCount) {
    return;
  }

  const user =
    userResult.rows[0];

  if (
    user.current_day >= MAX_DAY
  ) {
    await client.query(
      `
      UPDATE users
      SET next_unlock_at = NULL
      WHERE id = $1
      `,
      [userId]
    );

    return;
  }

  const progressResult =
    await client.query(
      `
      SELECT opened_at
      FROM day_progress
      WHERE
        user_id = $1
        AND cycle = $2
        AND day = $3
      `,
      [
        userId,
        user.cycle,
        user.current_day
      ]
    );

  const openedAt =
    progressResult.rows[0]
      ?.opened_at;

  if (!openedAt) {
    await client.query(
      `
      UPDATE users
      SET next_unlock_at = NULL
      WHERE id = $1
      `,
      [userId]
    );

    return;
  }

  const next =
    nextUnlockAt({
      openedAt,
      timezone:
        user.timezone,
      notificationTime:
        user.notification_time
    });

  await client.query(
    `
    UPDATE users
    SET
      next_unlock_at = $2,
      updated_at = NOW()
    WHERE id = $1
    `,
    [
      userId,
      next
    ]
  );
}


// NU APP · NOTIFICACIONES ESCALABLES V109
// Lotes, concurrencia limitada, backoff, recuperación y liderazgo PostgreSQL.
const NOTIFICATION_BATCH_SIZE_V109 = Math.max(
  25,
  Math.min(Number(process.env.NOTIFICATION_BATCH_SIZE || 250), 500)
);
const NOTIFICATION_CONCURRENCY_V109 = Math.max(
  1,
  Math.min(Number(process.env.NOTIFICATION_CONCURRENCY || 20), 50)
);
const NOTIFICATION_MAX_PER_CYCLE_V109 = Math.max(
  NOTIFICATION_BATCH_SIZE_V109,
  Math.min(Number(process.env.NOTIFICATION_MAX_PER_CYCLE || 1000), 5000)
);
const NOTIFICATION_CYCLE_BUDGET_MS_V109 = Math.max(
  5000,
  Math.min(Number(process.env.NOTIFICATION_CYCLE_BUDGET_MS || 25000), 55000)
);
const NOTIFICATION_RETRY_BASE_MS_V109 = Math.max(
  30000,
  Number(process.env.NOTIFICATION_RETRY_BASE_MS || 60000)
);
const NOTIFICATION_PROCESSING_STALE_MS_V109 = Math.max(
  60000,
  Number(process.env.NOTIFICATION_PROCESSING_STALE_MS || 300000)
);
const NOTIFICATION_UNLOCK_LIMIT_V109 = Math.max(
  200,
  Math.min(Number(process.env.NOTIFICATION_UNLOCK_LIMIT || 1000), 5000)
);
const NOTIFICATION_UNLOCK_CONCURRENCY_V109 = Math.max(
  1,
  Math.min(Number(process.env.NOTIFICATION_UNLOCK_CONCURRENCY || 10), 20)
);
const SCHEDULER_ADVISORY_LOCK_V109 = 109030;

// V111 conserva los límites globales de V109 y agrega un ledger por
// suscripción. El máximo se aplica por dispositivo, no por usuario.
const NOTIFICATION_DELIVERY_MAX_ATTEMPTS_V111 = Math.max(
  1,
  // Los jobs padre V109 se reclaman hasta cinco veces. Mantener el mismo
  // techo evita dejar una entrega retryable sin un job capaz de retomarla.
  Math.min(Number(process.env.NOTIFICATION_DELIVERY_MAX_ATTEMPTS || 5), 5)
);
const NOTIFICATION_DELIVERY_STALE_MS_V111 = Math.max(
  60000,
  Number(
    process.env.NOTIFICATION_DELIVERY_STALE_MS ||
    NOTIFICATION_PROCESSING_STALE_MS_V109
  )
);

let schedulerRunning = false;

async function mapWithConcurrencyV109(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(items.length, 1)) },
      runWorker
    )
  );
  return results;
}

async function sendPushToUser(
  userId,
  payload
) {
  assertDatabase();
  assertPushConfigured();

  const result = await pool.query(
    `SELECT id, subscription
     FROM push_subscriptions
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );

  let sent = 0;
  let removed = 0;
  let retryableErrors = 0;
  let permanentErrors = 0;
  const errors = [];

  for (const row of result.rows) {
    try {
      await webpush.sendNotification(
        row.subscription,
        JSON.stringify(payload)
      );
      sent += 1;
    } catch (error) {
      const statusCode = Number(error.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await pool.query(
          `DELETE FROM push_subscriptions WHERE id = $1`,
          [row.id]
        );
        removed += 1;
      } else {
        errors.push(error.message || String(error));
        if (
          !statusCode ||
          statusCode === 408 ||
          statusCode === 429 ||
          statusCode >= 500
        ) {
          retryableErrors += 1;
        } else {
          permanentErrors += 1;
        }
      }
    }
  }

  return {
    sent,
    removed,
    errors,
    retryableErrors,
    permanentErrors,
    subscriptions: result.rowCount
  };
}

async function enqueueDueUnlocksV109(deadline) {
  assertDatabase();
  const dueResult = await pool.query(
    `SELECT id
     FROM users
     WHERE current_day < $1
       AND next_unlock_at IS NOT NULL
       AND next_unlock_at <= NOW()
     ORDER BY next_unlock_at ASC
     LIMIT $2`,
    [MAX_DAY, NOTIFICATION_UNLOCK_LIMIT_V109]
  );

  const results = await mapWithConcurrencyV109(
    dueResult.rows,
    NOTIFICATION_UNLOCK_CONCURRENCY_V109,
    async row => {
      if (Date.now() >= deadline) return false;
      const result = await withTransaction(client =>
        advanceIfEligible(client, row.id)
      );
      return Boolean(result.advanced);
    }
  );

  return results.filter(Boolean).length;
}

async function recoverStaleNotificationJobsV109() {
  const staleSeconds = Math.ceil(
    NOTIFICATION_PROCESSING_STALE_MS_V109 / 1000
  );
  const queries = [
    `UPDATE notification_jobs
     SET status = 'failed',
         last_error = 'Trabajo recuperado después de una interrupción.',
         updated_at = NOW() - make_interval(secs => $1)
     WHERE status = 'processing'
       AND updated_at <= NOW() - make_interval(secs => $1)`,
    `UPDATE routine_notification_jobs
     SET status = 'failed',
         last_error = 'Trabajo recuperado después de una interrupción.',
         updated_at = NOW() - make_interval(secs => $1)
     WHERE status = 'processing'
       AND updated_at <= NOW() - make_interval(secs => $1)`
  ];
  const results = [];
  for (const query of queries) {
    results.push(await pool.query(query, [staleSeconds]));
  }
  return results.reduce((sum, result) => sum + result.rowCount, 0);
}

async function claimUnifiedRoutineNotificationBatchV109(limit) {
  return withTransaction(async client => {
    const retryBase = NOTIFICATION_RETRY_BASE_MS_V109;
    const candidates = await client.query(
      `SELECT user_id, MIN(due_at) AS due_at
       FROM (
         SELECT user_id, created_at AS due_at
         FROM notification_jobs
         WHERE attempts < 5
           AND (
             status = 'pending'
             OR (
               status = 'failed'
               AND updated_at <= NOW() -
                 (POWER(2, GREATEST(attempts - 1, 0)) * $2 * INTERVAL '1 millisecond')
             )
           )
         UNION ALL
         SELECT user_id, scheduled_for AS due_at
         FROM routine_notification_jobs
         WHERE attempts < 5
           AND scheduled_for <= NOW()
           AND (
             status = 'pending'
             OR (
               status = 'failed'
               AND updated_at <= NOW() -
                 (POWER(2, GREATEST(attempts - 1, 0)) * $2 * INTERVAL '1 millisecond')
             )
           )
       ) due
       GROUP BY user_id
       ORDER BY MIN(due_at)
       LIMIT $1`,
      [limit, retryBase]
    );

    const userIds = candidates.rows.map(row => row.user_id);
    if (!userIds.length) return [];

    const collagen = await client.query(
      `SELECT id, user_id, cycle, day
       FROM notification_jobs
       WHERE user_id = ANY($1::text[])
         AND attempts < 5
         AND (
           status = 'pending'
           OR (
             status = 'failed'
             AND updated_at <= NOW() -
               (POWER(2, GREATEST(attempts - 1, 0)) * $2 * INTERVAL '1 millisecond')
           )
         )
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED`,
      [userIds, retryBase]
    );

    const products = await client.query(
      `SELECT id, user_id, routine_id, cycle, day
       FROM routine_notification_jobs
       WHERE user_id = ANY($1::text[])
         AND attempts < 5
         AND scheduled_for <= NOW()
         AND (
           status = 'pending'
           OR (
             status = 'failed'
             AND updated_at <= NOW() -
               (POWER(2, GREATEST(attempts - 1, 0)) * $2 * INTERVAL '1 millisecond')
           )
         )
       ORDER BY scheduled_for, routine_id
       FOR UPDATE SKIP LOCKED`,
      [userIds, retryBase]
    );

    const collagenIds = collagen.rows.map(row => row.id);
    const productIds = products.rows.map(row => row.id);
    if (collagenIds.length) {
      await client.query(
        `UPDATE notification_jobs
         SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
         WHERE id = ANY($1::bigint[])`,
        [collagenIds]
      );
    }
    if (productIds.length) {
      await client.query(
        `UPDATE routine_notification_jobs
         SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
         WHERE id = ANY($1::bigint[])`,
        [productIds]
      );
    }

    const grouped = new Map(
      userIds.map(userId => [userId, { userId, collagen: [], products: [] }])
    );
    for (const row of collagen.rows) grouped.get(row.user_id)?.collagen.push(row);
    for (const row of products.rows) grouped.get(row.user_id)?.products.push(row);
    return [...grouped.values()].filter(
      batch => batch.collagen.length || batch.products.length
    );
  });
}

// NU APP · ENVÍO AGRUPADO DE RUTINAS V109
const ROUTINE_NOTIFICATION_NAMES_V101A = {
  "collagen-30": "Collagen+",
  "lumispa-10": "LumiSpa",
  "wellspa-10": "WellSpa",
  "galvanicspa-10": "Galvanic Spa"
};

function buildUnifiedRoutinePayloadV101A(batch) {
  const entries = [
    ...batch.collagen.map(row => ({ routineId: "collagen-30", day: Number(row.day) })),
    ...batch.products.map(row => ({ routineId: row.routine_id, day: Number(row.day) }))
  ];
  const unique = [];
  const seen = new Set();
  for (const entry of entries) {
    const key = `${entry.routineId}:${entry.day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  if (unique.length === 1) {
    const entry = unique[0];
    const name = ROUTINE_NOTIFICATION_NAMES_V101A[entry.routineId] || "tu rutina";
    return {
      title: `🔥 Tu Día ${entry.day} de ${name} está disponible`,
      body: "Entrá y descubrí tu acción de hoy.",
      url: `/?routine=${encodeURIComponent(entry.routineId)}&day=${entry.day}&notification=1`,
      tag: `routine_daily_${batch.userId}`
    };
  }
  const routines = [...new Set(unique.map(entry =>
    ROUTINE_NOTIFICATION_NAMES_V101A[entry.routineId] || "Rutina"
  ))];
  return {
    title: `🔥 Tenés contenido nuevo en ${routines.length} rutinas`,
    body: `Continuá con ${routines.join(", ")}.`,
    url: "/?routineNotifications=1",
    tag: `routine_daily_${batch.userId}`
  };
}

// NU APP · ENTREGA POR DISPOSITIVO V111
async function prepareNotificationDeliveriesV111(batch, payload) {
  const logicalKey = logicalDeliveryKeyV111(batch);
  const identifiedPayload = attachDeliveryIdentityV111(payload, logicalKey);
  const sources = sourceReferencesV111(batch);

  return withTransaction(async client => {
    const insertedBatch = await client.query(
      `INSERT INTO notification_delivery_batches (
         logical_key, user_id, payload, status, updated_at
       ) VALUES ($1, $2, $3::jsonb, 'pending', NOW())
       ON CONFLICT (logical_key) DO NOTHING
       RETURNING payload`,
      [logicalKey, batch.userId, JSON.stringify(identifiedPayload)]
    );
    const isNewBatch = insertedBatch.rowCount > 0;
    let storedPayload = identifiedPayload;

    if (!isNewBatch) {
      const existingBatch = await client.query(
        `SELECT payload
         FROM notification_delivery_batches
         WHERE logical_key = $1`,
        [logicalKey]
      );
      storedPayload = existingBatch.rows[0].payload;
    }

    for (const source of sources) {
      await client.query(
        `INSERT INTO notification_delivery_sources (
           logical_key, source_table, source_id
         ) VALUES ($1, $2, $3)
         ON CONFLICT (source_table, source_id) DO NOTHING`,
        [logicalKey, source.sourceTable, source.sourceId]
      );
    }

    if (isNewBatch) {
      const subscriptions = await client.query(
        `SELECT id, endpoint, subscription
         FROM push_subscriptions
         WHERE user_id = $1
         ORDER BY id`,
        [batch.userId]
      );

      for (const row of subscriptions.rows) {
        await client.query(
          `INSERT INTO notification_deliveries (
             logical_key,
             subscription_id,
             endpoint_hash,
             subscription_snapshot,
             status,
             next_attempt_at,
             updated_at
           ) VALUES ($1, $2, $3, $4::jsonb, 'pending', NOW(), NOW())
           ON CONFLICT (logical_key, endpoint_hash) DO NOTHING`,
          [
            logicalKey,
            row.id,
            endpointHashV111(row.endpoint),
            JSON.stringify(row.subscription)
          ]
        );
      }
    }

    const deliveryCount = await client.query(
      `SELECT COUNT(*)::integer AS count
       FROM notification_deliveries
       WHERE logical_key = $1`,
      [logicalKey]
    );

    return {
      logicalKey,
      payload: storedPayload,
      subscriptions: deliveryCount.rows[0].count
    };
  });
}

async function claimNotificationDeliveriesV111(logicalKey) {
  return withTransaction(async client => {
    const claimed = await client.query(
      `WITH candidates AS (
         SELECT id
         FROM notification_deliveries
         WHERE logical_key = $1
           AND attempts < $2
           AND next_attempt_at <= NOW()
           AND status IN ('pending', 'retryable')
         ORDER BY id
         FOR UPDATE SKIP LOCKED
       )
       UPDATE notification_deliveries AS delivery
       SET status = 'processing',
           attempts = attempts + 1,
           processing_at = NOW(),
           updated_at = NOW()
       FROM candidates
       WHERE delivery.id = candidates.id
       RETURNING
         delivery.id,
         delivery.subscription_id,
         delivery.endpoint_hash,
         delivery.subscription_snapshot,
         delivery.attempts`,
      [logicalKey, NOTIFICATION_DELIVERY_MAX_ATTEMPTS_V111]
    );

    return claimed.rows;
  });
}

function safePushErrorV111(error) {
  const message = String(error?.message || error || "Error Web Push.");
  return message.slice(0, 500);
}

async function markNotificationDeliveryV111(
  delivery,
  status,
  lastError = null,
  nextAttemptAt = null,
  preserveAttempt = false
) {
  await pool.query(
    `UPDATE notification_deliveries
     SET status = $2,
         last_error = $3,
         next_attempt_at = COALESCE($4, next_attempt_at),
         attempts = CASE
           WHEN $5 THEN GREATEST(attempts - 1, 0)
           ELSE attempts
         END,
         processing_at = NULL,
         sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
         updated_at = NOW()
     WHERE id = $1`,
    [delivery.id, status, lastError, nextAttemptAt, preserveAttempt]
  );
}

async function sendNotificationDeliveryV111(delivery, payload) {
  const activeSubscription = delivery.subscription_id
    ? await pool.query(
        `SELECT 1
         FROM push_subscriptions
         WHERE id = $1
           AND subscription = $2::jsonb`,
        [delivery.subscription_id, JSON.stringify(delivery.subscription_snapshot)]
      )
    : { rowCount: 0 };

  if (!activeSubscription.rowCount) {
    await markNotificationDeliveryV111(
      delivery,
      "permanent",
      "La suscripción fue retirada o actualizada."
    );
    return "inactive";
  }

  try {
    await webpush.sendNotification(
      delivery.subscription_snapshot,
      JSON.stringify(payload)
    );
    await markNotificationDeliveryV111(delivery, "sent");
    return "sent";
  } catch (error) {
    const classification = classifyPushErrorV111(error);
    const reason = safePushErrorV111(error);

    if (classification.kind === "configuration") {
      const retryAt = new Date(
        Date.now() + NOTIFICATION_RETRY_BASE_MS_V109
      );
      await markNotificationDeliveryV111(
        delivery,
        "retryable",
        reason,
        retryAt,
        true
      );
      return "configuration";
    }

    if (classification.kind === "expired") {
      if (delivery.subscription_id) {
        await pool.query(
          `DELETE FROM push_subscriptions
           WHERE id = $1
             AND subscription = $2::jsonb`,
          [delivery.subscription_id, JSON.stringify(delivery.subscription_snapshot)]
        );
      }
      await markNotificationDeliveryV111(delivery, "permanent", reason);
      return "removed";
    }

    if (
      classification.kind === "retryable" &&
      delivery.attempts < NOTIFICATION_DELIVERY_MAX_ATTEMPTS_V111
    ) {
      const retryAt = new Date(
        Date.now() +
        retryDelayMsV111(
          delivery.attempts,
          NOTIFICATION_RETRY_BASE_MS_V109
        )
      );
      await markNotificationDeliveryV111(
        delivery,
        "retryable",
        reason,
        retryAt
      );
      return "retryable";
    }

    await markNotificationDeliveryV111(delivery, "permanent", reason);
    return "permanent";
  }
}

async function summarizeNotificationBatchV111(logicalKey) {
  const result = await pool.query(
    `SELECT status
     FROM notification_deliveries
     WHERE logical_key = $1`,
    [logicalKey]
  );
  return summarizeDeliveryRowsV111(result.rows);
}

async function updateDeliveryBatchStatusV111(logicalKey, summary) {
  const status = summary.open > 0
    ? "pending"
    : summary.sent > 0
      ? "sent"
      : "failed";
  const detail = summary.permanent > 0
    ? `${summary.permanent} entrega(s) permanente(s).`
    : null;

  await pool.query(
    `UPDATE notification_delivery_batches
     SET status = $2,
         last_error = $3,
         sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
         updated_at = NOW()
     WHERE logical_key = $1`,
    [logicalKey, status, detail]
  );
}

async function recoverStaleNotificationDeliveriesV111() {
  const staleSeconds = Math.ceil(
    NOTIFICATION_DELIVERY_STALE_MS_V111 / 1000
  );
  const result = await pool.query(
    `UPDATE notification_deliveries
     SET status = CASE
           WHEN attempts < $2 THEN 'retryable'
           ELSE 'permanent'
         END,
         last_error = 'Entrega recuperada después de una interrupción.',
         processing_at = NULL,
         next_attempt_at = NOW(),
         updated_at = NOW()
     WHERE status = 'processing'
       AND processing_at <= NOW() - make_interval(secs => $1)`,
    [staleSeconds, NOTIFICATION_DELIVERY_MAX_ATTEMPTS_V111]
  );
  return result.rowCount;
}

async function markUnifiedRoutineNotificationsV109(
  batch,
  status,
  lastError = null,
  permanent = false,
  preserveAttempt = false
) {
  const collagenIds = batch.collagen.map(row => row.id);
  const productIds = batch.products.map(row => row.id);
  const query = table =>
    `UPDATE ${table}
     SET status = $2,
         last_error = $3,
         attempts = CASE
           WHEN $4 THEN 5
           WHEN $5 THEN GREATEST(attempts - 1, 0)
           ELSE attempts
         END,
         updated_at = NOW(),
         sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END
     WHERE id = ANY($1::bigint[])`;
  if (collagenIds.length) {
    await pool.query(
      query("notification_jobs"),
      [collagenIds, status, lastError, permanent, preserveAttempt]
    );
  }
  if (productIds.length) {
    await pool.query(
      query("routine_notification_jobs"),
      [productIds, status, lastError, permanent, preserveAttempt]
    );
  }
}

async function partitionUnifiedBatchV111(batch) {
  const collagenIds = batch.collagen.map(row => row.id);
  const productIds = batch.products.map(row => row.id);
  const existing = await pool.query(
    `SELECT source_table, source_id, logical_key
     FROM notification_delivery_sources
     WHERE (
       source_table = 'notification_jobs'
       AND source_id = ANY($1::bigint[])
     ) OR (
       source_table = 'routine_notification_jobs'
       AND source_id = ANY($2::bigint[])
     )`,
    [collagenIds, productIds]
  );
  const bySource = new Map(
    existing.rows.map(row => [
      `${row.source_table}:${row.source_id}`,
      row.logical_key
    ])
  );
  const groups = new Map();

  function add(groupKey, type, row) {
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        userId: batch.userId,
        collagen: [],
        products: []
      });
    }
    groups.get(groupKey)[type].push(row);
  }

  for (const row of batch.collagen) {
    add(
      bySource.get(`notification_jobs:${row.id}`) || "unassigned",
      "collagen",
      row
    );
  }
  for (const row of batch.products) {
    add(
      bySource.get(`routine_notification_jobs:${row.id}`) || "unassigned",
      "products",
      row
    );
  }
  return [...groups.values()];
}

async function processDeliveryGroupV111(batch) {
  try {
    const prepared = await prepareNotificationDeliveriesV111(
      batch,
      buildUnifiedRoutinePayloadV101A(batch)
    );

    if (prepared.subscriptions === 0) {
      await updateDeliveryBatchStatusV111(
        prepared.logicalKey,
        {
          open: 0,
          sent: 0,
          permanent: 0
        }
      );
      await markUnifiedRoutineNotificationsV109(
        batch,
        "failed",
        "El usuario no tiene dispositivos suscriptos.",
        true
      );
      return {
        outcome: "permanent_failed",
        deliveries: 0,
        sent: 0,
        retryable: 0,
        permanent: 0,
        removed: 0
      };
    }

    const claimed = await claimNotificationDeliveriesV111(
      prepared.logicalKey
    );
    const outcomes = [];

    // Los lotes de usuarios ya se procesan con concurrencia V109. Dentro
    // de cada usuario enviamos sus pocos dispositivos secuencialmente para
    // no multiplicar NOTIFICATION_CONCURRENCY por segunda vez.
    for (const delivery of claimed) {
      outcomes.push(
        await sendNotificationDeliveryV111(
          delivery,
          prepared.payload
        )
      );
    }

    const summary = await summarizeNotificationBatchV111(
      prepared.logicalKey
    );
    await updateDeliveryBatchStatusV111(prepared.logicalKey, summary);
    const cycleSent = outcomes.filter(
      value => value === "sent"
    ).length;
    const cycleRemoved = outcomes.filter(
      value => value === "removed"
    ).length;
    const cyclePermanent = outcomes.filter(
      value =>
        value === "permanent" ||
        value === "removed" ||
        value === "inactive"
    ).length;

    if (summary.open > 0) {
      await markUnifiedRoutineNotificationsV109(
        batch,
        "failed",
        `${summary.open} dispositivo(s) pendiente(s) de reintento.`,
        false,
        outcomes.includes("configuration")
      );
      return {
        outcome: "retryable_failed",
        deliveries: claimed.length,
        sent: cycleSent,
        retryable: summary.retryable,
        permanent: cyclePermanent,
        removed: cycleRemoved
      };
    }

    if (summary.sent > 0) {
      const partialReason = summary.permanent > 0
        ? `Envío parcial: ${summary.sent} enviada(s), ` +
          `${summary.permanent} permanente(s).`
        : null;
      await markUnifiedRoutineNotificationsV109(
        batch,
        "sent",
        partialReason
      );
      return {
        outcome: "sent",
        deliveries: claimed.length,
        sent: cycleSent,
        retryable: 0,
        permanent: cyclePermanent,
        removed: cycleRemoved
      };
    }

    await markUnifiedRoutineNotificationsV109(
      batch,
      "failed",
      "Ningún dispositivo pudo recibir la notificación.",
      true
    );
    return {
      outcome: "permanent_failed",
      deliveries: claimed.length,
      sent: 0,
      retryable: 0,
      permanent: cyclePermanent,
      removed: cycleRemoved
    };
  } catch (error) {
    await markUnifiedRoutineNotificationsV109(
      batch,
      "failed",
      error.message || String(error),
      false
    );
    return {
      outcome: "retryable_failed",
      deliveries: 0,
      sent: 0,
      retryable: 1,
      permanent: 0,
      removed: 0
    };
  }
}

async function processUnifiedBatchV111(batch) {
  try {
    const groups = await partitionUnifiedBatchV111(batch);
    const results = [];

    // Un trabajo que ya tiene ledger conserva su grupo original. Los trabajos
    // nuevos no se mezclan con un reintento anterior, evitando reenviar a los
    // dispositivos que ya habían recibido correctamente.
    for (const group of groups) {
      results.push(await processDeliveryGroupV111(group));
    }

    const aggregate = {
      outcome: results.some(row => row.outcome === "retryable_failed")
        ? "retryable_failed"
        : results.some(row => row.outcome === "sent")
          ? "sent"
          : "permanent_failed",
      deliveries: 0,
      sent: 0,
      retryable: 0,
      permanent: 0,
      removed: 0
    };

    for (const result of results) {
      aggregate.deliveries += result.deliveries;
      aggregate.sent += result.sent;
      aggregate.retryable += result.retryable;
      aggregate.permanent += result.permanent;
      aggregate.removed += result.removed;
    }
    return aggregate;
  } catch (error) {
    await markUnifiedRoutineNotificationsV109(
      batch,
      "failed",
      error.message || String(error),
      false
    );
    return {
      outcome: "retryable_failed",
      deliveries: 0,
      sent: 0,
      retryable: 1,
      permanent: 0,
      removed: 0
    };
  }
}

async function processUnifiedRoutineNotificationJobsV109(deadline) {
  const summary = {
    processed: 0,
    sent: 0,
    retryableFailed: 0,
    permanentFailed: 0,
    deliveries: 0,
    deviceSent: 0,
    deviceRetryable: 0,
    devicePermanent: 0,
    subscriptionsRemoved: 0
  };

  while (
    summary.processed < NOTIFICATION_MAX_PER_CYCLE_V109 &&
    Date.now() < deadline
  ) {
    const remaining = NOTIFICATION_MAX_PER_CYCLE_V109 - summary.processed;
    const batches = await claimUnifiedRoutineNotificationBatchV109(
      Math.min(NOTIFICATION_BATCH_SIZE_V109, remaining)
    );
    if (!batches.length) break;

    const outcomes = await mapWithConcurrencyV109(
      batches,
      NOTIFICATION_CONCURRENCY_V109,
      processUnifiedBatchV111
    );
    summary.processed += outcomes.length;
    for (const result of outcomes) {
      if (result.outcome === "sent") summary.sent += 1;
      if (result.outcome === "retryable_failed") summary.retryableFailed += 1;
      if (result.outcome === "permanent_failed") summary.permanentFailed += 1;
      summary.deliveries += result.deliveries;
      summary.deviceSent += result.sent;
      summary.deviceRetryable += result.retryable;
      summary.devicePermanent += result.permanent;
      summary.subscriptionsRemoved += result.removed;
    }
  }
  return summary;
}

async function runLeaderMaintenanceV116(deadline) {
  const lockClient = await pool.connect();
  let leader = false;

  try {
    const lockResult = await lockClient.query(
      `SELECT pg_try_advisory_lock($1) AS locked`,
      [SCHEDULER_ADVISORY_LOCK_V109]
    );
    leader = Boolean(lockResult.rows[0]?.locked);

    if (!leader) {
      return { leader: false, recovered: 0, recoveredDeliveries: 0, advanced: 0 };
    }

    const recovered = await recoverStaleNotificationJobsV109();
    const recoveredDeliveries =
      await recoverStaleNotificationDeliveriesV111();
    const advanced = await enqueueDueUnlocksV109(deadline);

    return { leader: true, recovered, recoveredDeliveries, advanced };
  } finally {
    if (leader) {
      try {
        await lockClient.query(
          `SELECT pg_advisory_unlock($1)`,
          [SCHEDULER_ADVISORY_LOCK_V109]
        );
      } catch (unlockError) {
        console.error("[scheduler-v116] error liberando lock:", unlockError);
      }
    }
    lockClient.release();
  }
}

async function runSchedulerCycle() {
  if (schedulerRunning || !pool || !pushConfigured) return;
  schedulerRunning = true;
  const startedAt = Date.now();

  try {
    const deadline = startedAt + NOTIFICATION_CYCLE_BUDGET_MS_V109;
    const emptyNotifications = {
      processed: 0,
      sent: 0,
      retryableFailed: 0,
      permanentFailed: 0,
      deliveries: 0,
      deviceSent: 0,
      deviceRetryable: 0,
      devicePermanent: 0,
      subscriptionsRemoved: 0
    };

    // Mantenimiento y entrega empiezan juntos. Así el worker líder no queda
    // rezagado mientras los demás reclaman todos los trabajos pendientes.
    const [maintenance, notifications] = await Promise.all([
      runLeaderMaintenanceV116(deadline),
      Date.now() < deadline
        ? processUnifiedRoutineNotificationJobsV109(deadline)
        : Promise.resolve(emptyNotifications)
    ]);

    if (
      maintenance.advanced > 0 ||
      maintenance.recovered > 0 ||
      maintenance.recoveredDeliveries > 0 ||
      notifications.processed > 0
    ) {
      console.log(
        `[scheduler-v116] worker=${process.pid} lider=${maintenance.leader ? 1 : 0} ` +
        `ms=${Date.now() - startedAt} ` +
        `desbloqueos=${maintenance.advanced} recuperados=${maintenance.recovered} ` +
        `entregas_recuperadas=${maintenance.recoveredDeliveries} ` +
        `procesados=${notifications.processed} enviados=${notifications.sent} ` +
        `reintentables=${notifications.retryableFailed} ` +
        `permanentes=${notifications.permanentFailed} ` +
        `entregas=${notifications.deliveries} ` +
        `dispositivos_enviados=${notifications.deviceSent} ` +
        `dispositivos_reintentables=${notifications.deviceRetryable} ` +
        `dispositivos_permanentes=${notifications.devicePermanent} ` +
        `suscripciones_eliminadas=${notifications.subscriptionsRemoved}`
      );
    }
  } catch (error) {
    console.error("[scheduler-v116] error:", error);
  } finally {
    schedulerRunning = false;
  }
}

function startScheduler() {
  if (
    !pool ||
    !pushConfigured
  ) {
    console.warn(
      "Scheduler no iniciado: falta base de datos o configuración push."
    );

    return;
  }

  console.log(
    `Scheduler activo cada ${SCHEDULER_INTERVAL_MS} ms.`
  );

  setTimeout(
    runSchedulerCycle,
    3000
  );

  setInterval(
    runSchedulerCycle,
    SCHEDULER_INTERVAL_MS
  );
}

app.get(
  "/api/health",
  async (req, res, next) => {
    try {
      if (!pool) {
        return res.status(503).json({
          ok: false,
          database: false,
          error:
            "DATABASE_URL no configurado."
        });
      }

      await pool.query(
        "SELECT 1 AS ok"
      );

      res.json({
        ok: true,
        database: true,
        maxDay: MAX_DAY
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/bootstrap",
  async (req, res, next) => {
    try {
      const profile =
        normalizeProfile(
          req.body.profile
        );

      const localState =
        req.body.localState || {};

      const completedDays =
        Array.isArray(
          req.body.completedDays
        )
          ? req.body.completedDays
          : [];

      const state =
        await withTransaction(
          async client => {
            const existing =
              await client.query(
                `
                SELECT *
                FROM users
                WHERE id = $1
                FOR UPDATE
                `,
                [
                  profile.userId
                ]
              );

            const isNew =
              !existing.rowCount;

            if (isNew) {
              await client.query(
                `
                INSERT INTO users (
                  id,
                  name,
                  country,
                  timezone,
                  notification_time,
                  current_day
                )
                VALUES (
                  $1, $2, $3, $4, $5, $6
                )
                `,
                [
                  profile.userId,
                  profile.name,
                  profile.country,
                  profile.timezone,
                  profile.notificationTime,
                  clampDay(
                    localState.currentDay
                  )
                ]
              );

              const openedDays =
                localState.openedDays ||
                {};

              for (
                const [
                  dayKey,
                  timestamp
                ] of Object.entries(
                  openedDays
                )
              ) {
                const day =
                  clampDay(dayKey);

                const openedAt =
                  new Date(
                    Number(timestamp)
                  );

                if (
                  Number.isNaN(
                    openedAt.getTime()
                  )
                ) {
                  continue;
                }

                await client.query(
                  `
                  INSERT INTO day_progress (
                    user_id,
                    cycle,
                    day,
                    opened_at
                  )
                  VALUES (
                    $1, 1, $2, $3
                  )
                  ON CONFLICT (
                    user_id,
                    cycle,
                    day
                  )
                  DO UPDATE SET
                    opened_at =
                      COALESCE(
                        day_progress.opened_at,
                        EXCLUDED.opened_at
                      )
                  `,
                  [
                    profile.userId,
                    day,
                    openedAt
                  ]
                );
              }

              for (
                const rawDay of
                completedDays
              ) {
                const day =
                  clampDay(rawDay);

                await client.query(
                  `
                  INSERT INTO day_progress (
                    user_id,
                    cycle,
                    day,
                    completed_at
                  )
                  VALUES (
                    $1, 1, $2, NOW()
                  )
                  ON CONFLICT (
                    user_id,
                    cycle,
                    day
                  )
                  DO UPDATE SET
                    completed_at =
                      COALESCE(
                        day_progress.completed_at,
                        EXCLUDED.completed_at
                      )
                  `,
                  [
                    profile.userId,
                    day
                  ]
                );
              }
            } else {
              // V13.1:
              // Para usuarios existentes, PostgreSQL es la fuente de verdad
              // del perfil. Un navegador/dispositivo NO debe sobrescribir
              // automáticamente timezone, país, nombre u hora preferida
              // durante el bootstrap.
              //
              // Los cambios intencionales de perfil siguen entrando por
              // PATCH /api/profile/:userId.
              await client.query(
                `
                UPDATE users
                SET
                  last_seen_at = NOW()
                WHERE id = $1
                `,
                [
                  profile.userId
                ]
              );
            }

            await recalculatePendingUnlock(
              client,
              profile.userId
            );

            await advanceIfEligible(
              client,
              profile.userId
            );

            return getState(
              client,
              profile.userId
            );
          }
        );

      res.json({
        ok: true,
        state
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/state/:userId",
  async (req, res, next) => {
    try {
      const userId =
        String(
          req.params.userId ||
          ""
        ).trim();

      const state =
        await withTransaction(
          async client => {
            await advanceIfEligible(
              client,
              userId
            );

            return getState(
              client,
              userId
            );
          }
        );

      res.json({
        ok: true,
        state
      });
    } catch (error) {
      next(error);
    }
  }
);

app.patch(
  "/api/profile/:userId",
  async (req, res, next) => {
    try {
      const profile =
        normalizeProfile({
          userId:
            req.params.userId,
          ...req.body
        });

      const state =
        await withTransaction(
          async client => {
            const result =
              await client.query(
                `
                UPDATE users
                SET
                  name = $2,
                  country = $3,
                  timezone = $4,
                  notification_time = $5,
                  updated_at = NOW(),
                  last_seen_at = NOW()
                WHERE id = $1
                RETURNING id
                `,
                [
                  profile.userId,
                  profile.name,
                  profile.country,
                  profile.timezone,
                  profile.notificationTime
                ]
              );

            if (!result.rowCount) {
              const error =
                new Error(
                  "Usuario no encontrado."
                );

              error.status = 404;

              throw error;
            }

            await recalculatePendingUnlock(
              client,
              profile.userId
            );

            await advanceIfEligible(
              client,
              profile.userId
            );

            return getState(
              client,
              profile.userId
            );
          }
        );

      res.json({
        ok: true,
        state
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/routine/open",
  async (req, res, next) => {
    try {
      const userId =
        String(
          req.body.userId ||
          ""
        ).trim();

      const requestedDay =
        parseRoutineDay(
          req.body.day
        );

      const state =
        await withTransaction(
          async client => {
            await advanceIfEligible(
              client,
              userId
            );

            const userResult =
              await client.query(
                `
                SELECT *
                FROM users
                WHERE id = $1
                FOR UPDATE
                `,
                [userId]
              );

            if (!userResult.rowCount) {
              const error =
                new Error(
                  "Usuario no encontrado."
                );

              error.status = 404;

              throw error;
            }

            const user =
              userResult.rows[0];

            if (
              requestedDay >
              user.current_day
            ) {
              const error =
                new Error(
                  "Ese día todavía no está disponible."
                );

              error.status = 409;

              throw error;
            }

            await client.query(
              `
              INSERT INTO day_progress (
                user_id,
                cycle,
                day,
                opened_at
              )
              VALUES (
                $1, $2, $3, NOW()
              )
              ON CONFLICT (
                user_id,
                cycle,
                day
              )
              DO UPDATE SET
                opened_at =
                  COALESCE(
                    day_progress.opened_at,
                    EXCLUDED.opened_at
                  )
              `,
              [
                userId,
                user.cycle,
                requestedDay
              ]
            );

            if (
              requestedDay ===
              user.current_day
            ) {
              await recalculatePendingUnlock(
                client,
                userId
              );
            }

            return getState(
              client,
              userId
            );
          }
        );

      res.json({
        ok: true,
        state
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/routine/complete",
  async (req, res, next) => {
    try {
      const userId =
        String(
          req.body.userId ||
          ""
        ).trim();

      const day =
        parseRoutineDay(
          req.body.day
        );

      const state =
        await withTransaction(
          async client => {
            // El backend decide primero si ya corresponde avanzar
            // el día actual antes de validar el completado.
            await advanceIfEligible(
              client,
              userId
            );

            const userResult =
              await client.query(
                `
                SELECT
                  cycle,
                  current_day
                FROM users
                WHERE id = $1
                FOR UPDATE
                `,
                [userId]
              );

            if (!userResult.rowCount) {
              const error =
                new Error(
                  "Usuario no encontrado."
                );

              error.status = 404;

              throw error;
            }

            const user =
              userResult.rows[0];

            if (
              day >
              Number(user.current_day)
            ) {
              const error =
                new Error(
                  "Ese día todavía no está disponible."
                );

              error.status = 409;

              throw error;
            }

            const cycle =
              user.cycle;

            await client.query(
              `
              INSERT INTO day_progress (
                user_id,
                cycle,
                day,
                completed_at
              )
              VALUES (
                $1, $2, $3, NOW()
              )
              ON CONFLICT (
                user_id,
                cycle,
                day
              )
              DO UPDATE SET
                completed_at =
                  COALESCE(
                    day_progress.completed_at,
                    EXCLUDED.completed_at
                  )
              `,
              [
                userId,
                cycle,
                day
              ]
            );

            return getState(
              client,
              userId
            );
          }
        );

      res.json({
        ok: true,
        state
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/routine/demo-advance",
  async (req, res, next) => {
    try {
      assertDemoRoutesEnabled();

      const userId =
        String(
          req.body.userId ||
          ""
        ).trim();

      const state =
        await withTransaction(
          async client => {
            const userResult =
              await client.query(
                `
                SELECT *
                FROM users
                WHERE id = $1
                FOR UPDATE
                `,
                [userId]
              );

            if (!userResult.rowCount) {
              const error =
                new Error(
                  "Usuario no encontrado."
                );

              error.status = 404;

              throw error;
            }

            const user =
              userResult.rows[0];

            if (
              user.current_day >=
              MAX_DAY
            ) {
              return getState(
                client,
                userId
              );
            }

            const progress =
              await client.query(
                `
                SELECT opened_at
                FROM day_progress
                WHERE
                  user_id = $1
                  AND cycle = $2
                  AND day = $3
                `,
                [
                  userId,
                  user.cycle,
                  user.current_day
                ]
              );

            if (
              !progress.rows[0]
                ?.opened_at
            ) {
              const error =
                new Error(
                  `Primero abrí el Día ${user.current_day}.`
                );

              error.status = 409;

              throw error;
            }

            await client.query(
              `
              UPDATE users
              SET
                current_day =
                  current_day + 1,
                next_unlock_at = NULL,
                updated_at = NOW()
              WHERE id = $1
              `,
              [userId]
            );

            return getState(
              client,
              userId
            );
          }
        );

      res.json({
        ok: true,
        state
      });
    } catch (error) {
      next(error);
    }
  }
);




// NU APP · SINCRONIZACIÓN MULTIRUTINA V98
const PRODUCT_ROUTINE_IDS_V98 = new Set([
  "lumispa-10",
  "wellspa-10",
  "galvanicspa-10"
]);

function parseProductRoutineIdV98(value) {
  const routineId = String(value || "").trim();
  if (!PRODUCT_ROUTINE_IDS_V98.has(routineId)) {
    const error = new Error("Rutina no válida.");
    error.status = 400;
    throw error;
  }
  return routineId;
}

function parseProductRoutineDayV98(value) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 10) {
    const error = new Error("Día de rutina no válido.");
    error.status = 400;
    throw error;
  }
  return day;
}

async function assertProductRoutineUserV98(client, userId) {
  const result = await client.query("SELECT id FROM users WHERE id = $1", [userId]);
  if (!result.rowCount) {
    const error = new Error("Usuario no encontrado.");
    error.status = 404;
    throw error;
  }
}

async function getProductRoutineStatesV98(client, userId) {
  await assertProductRoutineUserV98(client, userId);
  const states = await client.query(
    `SELECT routine_id, current_day FROM product_routine_states
     WHERE user_id = $1 ORDER BY routine_id`,
    [userId]
  );
  const progress = await client.query(
    `SELECT routine_id, day, opened_at, completed_at
     FROM product_routine_day_progress
     WHERE user_id = $1 ORDER BY routine_id, day`,
    [userId]
  );
  const routines = {};
  for (const id of PRODUCT_ROUTINE_IDS_V98) {
    routines[id] = { initialized: false, currentDay: 1, openedDays: {}, completedDays: [] };
  }
  for (const row of states.rows) {
    if (routines[row.routine_id]) {
      routines[row.routine_id].initialized = true;
      routines[row.routine_id].currentDay = Number(row.current_day);
    }
  }
  for (const row of progress.rows) {
    const routine = routines[row.routine_id];
    if (!routine) continue;
    if (row.opened_at) routine.openedDays[row.day] = new Date(row.opened_at).getTime();
    if (row.completed_at) routine.completedDays.push(Number(row.day));
  }
  return { userId, routines };
}

app.post("/api/product-routines/bootstrap", async (req, res, next) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const localRoutines = req.body.routines && typeof req.body.routines === "object"
      ? req.body.routines : {};
    const state = await withTransaction(async client => {
      await assertProductRoutineUserV98(client, userId);
      for (const routineId of PRODUCT_ROUTINE_IDS_V98) {
        const local = localRoutines[routineId] || {};
        const currentDay = parseProductRoutineDayV98(local.currentDay || 1);
        await client.query(
          `INSERT INTO product_routine_states (user_id, routine_id, current_day)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, routine_id) DO UPDATE
           SET updated_at = NOW()`,
          [userId, routineId, currentDay]
        );
        for (const [rawDay, rawTimestamp] of Object.entries(local.openedDays || {})) {
          const day = parseProductRoutineDayV98(rawDay);
          const openedAt = new Date(Number(rawTimestamp));
          if (Number.isNaN(openedAt.getTime())) continue;
          await client.query(
            `INSERT INTO product_routine_day_progress
             (user_id, routine_id, day, opened_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, routine_id, day) DO UPDATE
             SET opened_at = COALESCE(product_routine_day_progress.opened_at, EXCLUDED.opened_at),
                 updated_at = NOW()`,
            [userId, routineId, day, openedAt]
          );
        }
        for (const rawDay of Array.isArray(local.completedDays) ? local.completedDays : []) {
          const day = parseProductRoutineDayV98(rawDay);
          await client.query(
            `INSERT INTO product_routine_day_progress
             (user_id, routine_id, day, completed_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, routine_id, day) DO UPDATE
             SET completed_at = COALESCE(product_routine_day_progress.completed_at, EXCLUDED.completed_at),
                 updated_at = NOW()`,
            [userId, routineId, day]
          );
        }
        await client.query(
          `UPDATE product_routine_states
           SET current_day = COALESCE(
             (
               SELECT candidate.day
               FROM generate_series(1, 10) AS candidate(day)
               WHERE NOT EXISTS (
                 SELECT 1
                 FROM product_routine_day_progress progress
                 WHERE progress.user_id = $1
                   AND progress.routine_id = $2
                   AND progress.day = candidate.day
                   AND progress.completed_at IS NOT NULL
               )
               ORDER BY candidate.day
               LIMIT 1
             ),
             10
           ), updated_at = NOW()
           WHERE user_id = $1 AND routine_id = $2`,
          [userId, routineId]
        );
      }
      return getProductRoutineStatesV98(client, userId);
    });
    res.json({ ok: true, state });
  } catch (error) { next(error); }
});

app.get("/api/product-routines/state/:userId", async (req, res, next) => {
  try {
    const userId = String(req.params.userId || "").trim();
    const state = await withTransaction(client => getProductRoutineStatesV98(client, userId));
    res.json({ ok: true, state });
  } catch (error) { next(error); }
});

app.post("/api/product-routines/open", async (req, res, next) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const routineId = parseProductRoutineIdV98(req.body.routineId);
    const day = parseProductRoutineDayV98(req.body.day);
    const state = await withTransaction(async client => {
      await assertProductRoutineUserV98(client, userId);
      await client.query(
        `INSERT INTO product_routine_states (user_id, routine_id, current_day)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, routine_id) DO UPDATE
         SET updated_at = NOW()`,
        [userId, routineId, 1]
      );
      await client.query(
        `INSERT INTO product_routine_day_progress (user_id, routine_id, day, opened_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, routine_id, day) DO UPDATE
         SET opened_at = COALESCE(product_routine_day_progress.opened_at, EXCLUDED.opened_at),
             updated_at = NOW()`,
        [userId, routineId, day]
      );
      return getProductRoutineStatesV98(client, userId);
    });
    res.json({ ok: true, state });
  } catch (error) { next(error); }
});

app.post("/api/product-routines/complete", async (req, res, next) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const routineId = parseProductRoutineIdV98(req.body.routineId);
    const day = parseProductRoutineDayV98(req.body.day);
    const state = await withTransaction(async client => {
      await assertProductRoutineUserV98(client, userId);
      await client.query(
        `INSERT INTO product_routine_states (user_id, routine_id, current_day)
         VALUES ($1, $2, $3) ON CONFLICT (user_id, routine_id) DO NOTHING`,
        [userId, routineId, day]
      );
      await client.query(
        `INSERT INTO product_routine_day_progress (user_id, routine_id, day, completed_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, routine_id, day) DO UPDATE
         SET completed_at = COALESCE(product_routine_day_progress.completed_at, EXCLUDED.completed_at),
             updated_at = NOW()`,
        [userId, routineId, day]
      );
      await client.query(
        `UPDATE product_routine_states
         SET current_day = COALESCE(
           (
             SELECT candidate.day
             FROM generate_series(1, 10) AS candidate(day)
             WHERE NOT EXISTS (
               SELECT 1
               FROM product_routine_day_progress progress
               WHERE progress.user_id = $1
                 AND progress.routine_id = $2
                 AND progress.day = candidate.day
                 AND progress.completed_at IS NOT NULL
             )
             ORDER BY candidate.day
             LIMIT 1
           ),
           10
         ), updated_at = NOW()
         WHERE user_id = $1 AND routine_id = $2`,
        [userId, routineId]
      );
      // NU APP · PROGRAMACIÓN UNIFICADA DE RUTINAS V101
      // Completar hoy programa el contenido siguiente para mañana,
      // respetando la hora y la zona horaria elegidas por la persona.
      if (day < 10) {
        const notificationProfile = await client.query(
          `SELECT timezone, notification_time FROM users WHERE id = $1`,
          [userId]
        );
        const schedule = notificationProfile.rows[0];
        if (schedule) {
          const scheduledFor = nextUnlockAt({
            openedAt: new Date(),
            timezone: schedule.timezone,
            notificationTime: schedule.notification_time
          });
          await client.query(
            `INSERT INTO routine_notification_jobs (
               user_id, routine_id, cycle, day, kind, scheduled_for, status
             ) VALUES ($1, $2, 1, $3, 'day_available', $4, 'pending')
             ON CONFLICT (user_id, routine_id, cycle, day, kind)
             DO UPDATE SET
               scheduled_for = CASE
                 WHEN routine_notification_jobs.status = 'sent'
                   THEN routine_notification_jobs.scheduled_for
                 ELSE LEAST(routine_notification_jobs.scheduled_for, EXCLUDED.scheduled_for)
               END,
               updated_at = NOW()`,
            [userId, routineId, day + 1, scheduledFor]
          );
        }
      }
      return getProductRoutineStatesV98(client, userId);
    });
    res.json({ ok: true, state });
  } catch (error) { next(error); }
});


app.get(
  "/api/push/public-key",
  (req, res, next) => {
    try {
      assertPushConfigured();

      res.json({
        ok: true,
        publicKey:
          VAPID_PUBLIC_KEY
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/push/subscribe",
  async (req, res, next) => {
    try {
      assertDatabase();
      assertPushConfigured();

      const userId =
        String(
          req.body.userId || ""
        ).trim();

      if (!userId) {
        const error =
          new Error(
            "Falta userId."
          );

        error.status = 400;

        throw error;
      }

      const subscription =
        normalizePushSubscription(
          req.body.subscription
        );

      const userResult =
        await pool.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
          `,
          [userId]
        );

      if (!userResult.rowCount) {
        const error =
          new Error(
            "Usuario no encontrado."
          );

        error.status = 404;

        throw error;
      }

      await pool.query(
        `
        INSERT INTO push_subscriptions (
          user_id,
          endpoint,
          subscription
        )
        VALUES (
          $1, $2, $3::jsonb
        )
        ON CONFLICT (endpoint)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          subscription =
            EXCLUDED.subscription,
          updated_at = NOW()
        `,
        [
          userId,
          subscription.endpoint,
          JSON.stringify(
            subscription
          )
        ]
      );

      res.json({
        ok: true,
        subscribed: true
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/push/unsubscribe",
  async (req, res, next) => {
    try {
      assertDatabase();

      const userId =
        String(
          req.body.userId || ""
        ).trim();

      const endpoint =
        String(
          req.body.endpoint || ""
        ).trim();

      if (!userId || !endpoint) {
        const error =
          new Error(
            "Faltan datos para eliminar la suscripción."
          );

        error.status = 400;

        throw error;
      }

      await pool.query(
        `
        DELETE FROM push_subscriptions
        WHERE
          user_id = $1
          AND endpoint = $2
        `,
        [
          userId,
          endpoint
        ]
      );

      res.json({
        ok: true,
        subscribed: false
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/push/test",
  pushTestLimiter,
  async (req, res, next) => {
    try {
      assertAdminTestRoutesEnabled();
      assertAdminTestToken(req);
      assertDatabase();
      assertPushConfigured();

      const userId =
        String(
          req.body.userId || ""
        ).trim();

      if (!userId) {
        const error =
          new Error(
            "Falta userId."
          );

        error.status = 400;

        throw error;
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            endpoint,
            subscription
          FROM push_subscriptions
          WHERE user_id = $1
          ORDER BY updated_at DESC
          `,
          [userId]
        );

      if (!result.rowCount) {
        const error =
          new Error(
            "Este usuario no tiene dispositivos suscriptos."
          );

        error.status = 404;

        throw error;
      }

      const payload =
        JSON.stringify({
          title:
            "🔥 Notificaciones activadas",
          body:
            "La PWA ya puede avisarte cuando tu próximo día esté disponible.",
          url: "/"
        });

      let sent = 0;
      let removed = 0;

      for (
        const row of result.rows
      ) {
        try {
          await webpush
            .sendNotification(
              row.subscription,
              payload
            );

          sent += 1;
        } catch (error) {
          if (
            error.statusCode === 404 ||
            error.statusCode === 410
          ) {
            await pool.query(
              `
              DELETE FROM push_subscriptions
              WHERE id = $1
              `,
              [row.id]
            );

            removed += 1;
          } else {
            throw error;
          }
        }
      }

      res.json({
        ok: true,
        sent,
        removed
      });
    } catch (error) {
      next(error);
    }
  }
);



app.use(
  "/api/admin",
  adminLimiter,
  (req, res, next) => {
    try {
      assertAdminTestRoutesEnabled();
      next();
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/admin/schedule-auto-test-latest",
  async (req, res, next) => {
    try {
      assertAdminTestRoutesEnabled();
      assertDatabase();
      assertPushConfigured();
      assertAdminTestToken(req);

      const seconds =
        Math.min(
          Math.max(
            Number(
              req.body.seconds ||
              120
            ),
            10
          ),
          3600
        );

      const result =
        await pool.query(
          `
          SELECT
            u.id,
            u.name,
            u.current_day,
            u.cycle
          FROM push_subscriptions ps
          JOIN users u
            ON u.id = ps.user_id
          ORDER BY
            ps.updated_at DESC
          LIMIT 1
          `
        );

      if (!result.rowCount) {
        const error =
          new Error(
            "No hay dispositivos suscriptos."
          );

        error.status = 404;

        throw error;
      }

      const user =
        result.rows[0];

      if (
        Number(user.current_day) >=
        MAX_DAY
      ) {
        const error =
          new Error(
            "El usuario ya está en el último día de la prueba."
          );

        error.status = 409;

        throw error;
      }

      const progress =
        await pool.query(
          `
          SELECT opened_at
          FROM day_progress
          WHERE
            user_id = $1
            AND cycle = $2
            AND day = $3
          `,
          [
            user.id,
            user.cycle,
            user.current_day
          ]
        );

      if (
        !progress.rows[0]
          ?.opened_at
      ) {
        const error =
          new Error(
            `Primero abrí el Día ${user.current_day} en la PWA.`
          );

        error.status = 409;

        throw error;
      }

      const scheduled =
        await pool.query(
          `
          UPDATE users
          SET
            next_unlock_at =
              NOW() +
              ($2 * INTERVAL '1 second'),
            updated_at = NOW()
          WHERE id = $1
          RETURNING next_unlock_at
          `,
          [
            user.id,
            seconds
          ]
        );

      res.json({
        ok: true,
        userId: user.id,
        name: user.name,
        currentDay:
          Number(user.current_day),
        nextDay:
          Number(user.current_day) + 1,
        scheduledFor:
          scheduled.rows[0]
            .next_unlock_at,
        seconds
      });
    } catch (error) {
      next(error);
    }
  }
);

// NU APP V119 · Despertador seguro para Autoscale.
// Endpoint exclusivo para el cron externo; no habilita rutas administrativas.
app.post(
  "/api/cron/scheduler-run",
  adminLimiter,
  async (req, res, next) => {
    try {
      assertCronSecret(req);
      await runSchedulerCycle();
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/admin/scheduler-run",
  async (req, res, next) => {
    try {
      assertAdminTestRoutesEnabled();
      assertAdminTestToken(req);

      await runSchedulerCycle();

      res.json({
        ok: true
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/admin/push-test-latest",
  async (req, res, next) => {
    try {
      assertAdminTestRoutesEnabled();
      assertDatabase();
      assertPushConfigured();
      assertAdminTestToken(req);

      const result =
        await pool.query(
          `
          SELECT
            ps.id,
            ps.user_id,
            ps.subscription,
            u.name
          FROM push_subscriptions ps
          JOIN users u
            ON u.id = ps.user_id
          ORDER BY
            ps.updated_at DESC
          LIMIT 1
          `
        );

      if (!result.rowCount) {
        const error =
          new Error(
            "No hay dispositivos suscriptos."
          );

        error.status = 404;

        throw error;
      }

      const row =
        result.rows[0];

      const payload =
        JSON.stringify({
          title:
            "🔥 Prueba en segundo plano",
          body:
            "Si estás viendo esto, el push funciona aunque la PWA no esté abierta.",
          url: "/"
        });

      try {
        await webpush
          .sendNotification(
            row.subscription,
            payload
          );
      } catch (error) {
        if (
          error.statusCode === 404 ||
          error.statusCode === 410
        ) {
          await pool.query(
            `
            DELETE FROM push_subscriptions
            WHERE id = $1
            `,
            [row.id]
          );
        }

        throw error;
      }

      res.json({
        ok: true,
        sent: 1,
        userId: row.user_id,
        name: row.name
      });
    } catch (error) {
      next(error);
    }
  }
);



// NU APP · APP STORAGE RANGE NATIVO V108
// Sirve bot/active/ y routines/active/ con byte ranges nativos de GCS.
// Evita descargar el objeto completo y evita recalcular SHA-256 por request.
const botAssetStorage = new ObjectStorageClient();
const BOT_ASSET_STORAGE_PREFIX = "bot/active/";
const ROUTINE_ASSET_STORAGE_PREFIX = "routines/active/";
const ASSET_METADATA_CACHE_TTL_MS = 60 * 1000;
const ASSET_METADATA_CACHE_MAX = 512;
const assetMetadataCacheV108 = new Map();
let assetBucketPromiseV108 = null;

function botAssetContentType(objectName) {
  const extension = path.posix.extname(objectName).toLowerCase();
  const types = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".webm": "video/webm",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8"
  };

  return types[extension] || "application/octet-stream";
}

function parseBotAssetRange(rangeHeader, totalSize) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader || "").trim());
  if (!match || totalSize <= 0) return null;

  const rawStart = match[1];
  const rawEnd = match[2];
  let start;
  let end;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : totalSize - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= totalSize ||
    end < start
  ) {
    return { unsatisfiable: true };
  }

  return {
    start,
    end: Math.min(end, totalSize - 1)
  };
}

function normalizeStorageEtagV108(value, objectName) {
  const raw = String(value || "").replace(/^W\//, "").replace(/^"|"$/g, "");
  if (raw) return `"${raw}"`;

  const canonicalHash = path.posix
    .basename(objectName, path.posix.extname(objectName))
    .toLowerCase();

  return /^[a-f0-9]{64}$/.test(canonicalHash)
    ? `"${canonicalHash}"`
    : undefined;
}

async function getAssetBucketV108() {
  if (!assetBucketPromiseV108) {
    assetBucketPromiseV108 = botAssetStorage.getBucket();
  }

  return assetBucketPromiseV108;
}

function rememberAssetMetadataV108(objectName, value) {
  assetMetadataCacheV108.delete(objectName);
  assetMetadataCacheV108.set(objectName, {
    expiresAt: Date.now() + ASSET_METADATA_CACHE_TTL_MS,
    value
  });

  while (assetMetadataCacheV108.size > ASSET_METADATA_CACHE_MAX) {
    const oldestKey = assetMetadataCacheV108.keys().next().value;
    if (!oldestKey) break;
    assetMetadataCacheV108.delete(oldestKey);
  }
}

async function getAssetFileV108(objectName) {
  const cached = assetMetadataCacheV108.get(objectName);
  if (cached && cached.expiresAt > Date.now()) {
    assetMetadataCacheV108.delete(objectName);
    assetMetadataCacheV108.set(objectName, cached);
    return cached.value;
  }

  assetMetadataCacheV108.delete(objectName);

  const bucket = await getAssetBucketV108();
  const file = bucket.file(objectName);
  const [metadata] = await file.getMetadata();
  const totalSize = Number(metadata.size);

  if (!Number.isSafeInteger(totalSize) || totalSize < 0) {
    const error = new Error("Tamaño de asset inválido.");
    error.status = 502;
    throw error;
  }

  const value = {
    file,
    totalSize,
    contentType: metadata.contentType || botAssetContentType(objectName),
    etag: normalizeStorageEtagV108(metadata.etag, objectName)
  };

  rememberAssetMetadataV108(objectName, value);
  return value;
}

function validAssetRelativePathV108(requestPath) {
  const relativePath = decodeURIComponent(requestPath).replace(/^\/+/, "");

  if (
    !relativePath ||
    relativePath.includes("..") ||
    relativePath.includes("\\") ||
    !/^[A-Za-z0-9._/-]+$/.test(relativePath)
  ) {
    return null;
  }

  return relativePath;
}

function pipeAssetStreamV108(stream, res, next) {
  let handled = false;

  stream.once("error", error => {
    if (handled) return;
    handled = true;

    if (res.headersSent) {
      res.destroy(error);
      return;
    }

    next(error);
  });

  res.once("finish", () => {
    handled = true;
  });

  res.once("close", () => {
    if (!handled) {
      handled = true;
      stream.destroy();
    }
  });

  stream.pipe(res);
}

function createStorageAssetHandlerV108(prefix, logLabel) {
  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return res.status(405).set("Allow", "GET, HEAD").end();
    }

    try {
      const relativePath = validAssetRelativePathV108(req.path);
      if (!relativePath) return res.status(400).end();

      const objectName = prefix + relativePath;
      let asset;

      try {
        asset = await getAssetFileV108(objectName);
      } catch (error) {
        if (Number(error?.code) === 404 || Number(error?.status) === 404) {
          console.warn(`[${logLabel}] No disponible:`, objectName);
          return res.status(404).end();
        }
        throw error;
      }

      const { file, totalSize, contentType, etag } = asset;
      const range = parseBotAssetRange(req.headers.range, totalSize);
      const commonHeaders = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType
      };

      if (etag) commonHeaders.ETag = etag;
      res.set(commonHeaders);

      if (shouldReturnNotModifiedV114(req, etag)) {
        return res.status(304).end();
      }

      if (
        req.headers.range &&
        shouldHonorRangeV114(req, etag)
      ) {
        if (!range || range.unsatisfiable) {
          return res
            .status(416)
            .set("Content-Range", `bytes */${totalSize}`)
            .end();
        }

        const contentLength = range.end - range.start + 1;
        res.status(206).set({
          "Content-Range": `bytes ${range.start}-${range.end}/${totalSize}`,
          "Content-Length": String(contentLength)
        });

        if (req.method === "HEAD") return res.end();

        const stream = file.createReadStream({
          start: range.start,
          end: range.end,
          decompress: false
        });

        return pipeAssetStreamV108(stream, res, next);
      }

      res.status(200).set("Content-Length", String(totalSize));
      if (req.method === "HEAD") return res.end();

      return pipeAssetStreamV108(
        file.createReadStream({ decompress: false }),
        res,
        next
      );
    } catch (error) {
      next(error);
    }
  };
}

app.use(
  "/api/bot-assets",
  createStorageAssetHandlerV108(BOT_ASSET_STORAGE_PREFIX, "bot-assets")
);

app.use(
  "/api/routine-assets",
  createStorageAssetHandlerV108(ROUTINE_ASSET_STORAGE_PREFIX, "routine-assets")
);

function isBlockedPublicPath(requestPath) {
  const normalizedPath =
    String(requestPath || "")
      .replace(/\\/g, "/")
      .toLowerCase();

  const segments =
    normalizedPath
      .split("/")
      .filter(Boolean);

  const extension =
    path.posix.extname(
      normalizedPath
    );

  const blockedFiles =
    new Set([
      "/server.js",
      "/package.json",
      "/package-lock.json",
      "/schema.sql",
      "/file-tree.txt"
    ]);

  const blockedExtensions =
    new Set([
      ".zip",
      ".txt",
      ".sql",
      ".log",
      ".bak",
      ".backup",
      ".py",
      ".sh",
      ".tgz"
    ]);

  const blockedDirectory =
    segments.some(segment =>
      segment === "node_modules" ||
      segment === "attached_assets" ||
      segment === "migration-collagen-assets-v1" ||
      segment === "collagen-assets-downloader-v1" ||
      segment === "_archive-manychat" ||
      segment.startsWith("_backup-") ||
      segment.startsWith("_entrega-") ||
      segment.startsWith(
        "respaldo-"
      )
    );

  return (
    blockedFiles.has(
      normalizedPath
    ) ||
    blockedExtensions.has(
      extension
    ) ||
    blockedDirectory
  );
}

app.use(
  (req, res, next) => {
    if (
      isBlockedPublicPath(
        req.path
      )
    ) {
      return res
        .status(404)
        .end();
    }

    next();
  }
);

app.use(
  express.static(
    __dirname,
    {
      dotfiles: "deny",
      index: "index.html"
    }
  )
);

app.use(
  (error, req, res, next) => {
    const requestedStatus =
      Number(
        error?.status ||
        error?.statusCode ||
        500
      );

    const status =
      Number.isInteger(
        requestedStatus
      ) &&
      requestedStatus >= 400 &&
      requestedStatus <= 599
        ? requestedStatus
        : 500;

    console.error(
      `[${req.method} ${req.originalUrl}]`,
      error
    );

    const publicMessage =
      status >= 500
        ? "Error interno del servidor."
        : (
            error?.message ||
            "No se pudo completar la solicitud."
          );

    res.status(
      status
    ).json({
      ok: false,
      error: publicMessage
    });
  }
);

async function start() {
  try {
    await initDatabase();
  } catch (error) {
    console.error(
      "No se pudo inicializar PostgreSQL:",
      error
    );
  }

  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `Servidor listo en puerto ${PORT}`
      );

      startScheduler();
    }
  );
}

start();
