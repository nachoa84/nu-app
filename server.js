const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Pool } = require("pg");
const webpush = require("web-push");
const {
  DateTime,
  IANAZone
} = require("luxon");

const app = express();

// Replit publica la app detrás de un proxy.
// Necesario para que req.ip represente al cliente real.
app.set("trust proxy", 1);

const PORT =
  Number(process.env.PORT || 3000);

const MAX_DAY =
  Number(process.env.MAX_DAY || 7);

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

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL
    })
  : null;


const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY || "";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || "";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "";

const ADMIN_TEST_TOKEN =
  process.env.ADMIN_TEST_TOKEN || "";

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
  windowMs,
  max,
  keyFn = requestRateKey,
  message =
    "Demasiadas solicitudes. Esperá un momento e intentá nuevamente."
}) {
  const buckets =
    new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key =
      String(
        keyFn(req) ||
        requestRateKey(req)
      );

    let bucket =
      buckets.get(key);

    if (
      !bucket ||
      now >= bucket.resetAt
    ) {
      bucket = {
        count: 0,
        resetAt:
          now + windowMs
      };

      buckets.set(
        key,
        bucket
      );
    }

    if (bucket.count >= max) {
      const retryAfter =
        Math.max(
          Math.ceil(
            (
              bucket.resetAt -
              now
            ) / 1000
          ),
          1
        );

      res.set(
        "Retry-After",
        String(retryAfter)
      );

      return res
        .status(429)
        .json({
          ok: false,
          error: message,
          retryAfter
        });
    }

    bucket.count += 1;

    // Limpieza oportunista para que el Map no crezca sin límite.
    if (
      buckets.size > 500 &&
      bucket.count === 1
    ) {
      for (
        const [
          existingKey,
          existing
        ] of buckets
      ) {
        if (
          now >=
          existing.resetAt
        ) {
          buckets.delete(
            existingKey
          );
        }
      }

      // Cota defensiva para que un barrido de claves distintas
      // no haga crecer memoria indefinidamente durante la ventana.
      while (buckets.size > 2000) {
        const oldestKey =
          buckets.keys().next().value;

        if (!oldestKey) break;

        buckets.delete(oldestKey);
      }
    }

    return next();
  };
}

const apiWriteLimiter =
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 120
  });

const pushLimiter =
  createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 30,
    message:
      "Demasiadas operaciones de notificaciones. Esperá unos minutos."
  });

const pushTestLimiter =
  createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyFn: targetUserRateKey,
    message:
      "Alcanzaste el límite de pruebas de notificaciones por ahora."
  });

const adminLimiter =
  createRateLimiter({
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

  await pool.query(schema);

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


let schedulerRunning = false;

async function sendPushToUser(
  userId,
  payload
) {
  assertDatabase();
  assertPushConfigured();

  const result =
    await pool.query(
      `
      SELECT
        id,
        subscription
      FROM push_subscriptions
      WHERE user_id = $1
      ORDER BY updated_at DESC
      `,
      [userId]
    );

  let sent = 0;
  let removed = 0;
  const errors = [];

  for (
    const row of result.rows
  ) {
    try {
      await webpush
        .sendNotification(
          row.subscription,
          JSON.stringify(payload)
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
        errors.push(
          error.message ||
          String(error)
        );
      }
    }
  }

  return {
    sent,
    removed,
    errors,
    subscriptions:
      result.rowCount
  };
}

async function enqueueDueUnlocks() {
  assertDatabase();

  const dueResult =
    await pool.query(
      `
      SELECT id
      FROM users
      WHERE
        current_day < $1
        AND next_unlock_at IS NOT NULL
        AND next_unlock_at <= NOW()
      ORDER BY next_unlock_at ASC
      LIMIT 200
      `,
      [MAX_DAY]
    );

  let advanced = 0;

  for (
    const row of dueResult.rows
  ) {
    const result =
      await withTransaction(
        async client => {
          return advanceIfEligible(
            client,
            row.id
          );
        }
      );

    if (result.advanced) {
      advanced += 1;
    }
  }

  return advanced;
}

async function claimNextNotificationJob() {
  return withTransaction(
    async client => {
      const result =
        await client.query(
          `
          SELECT *
          FROM notification_jobs
          WHERE
            status IN (
              'pending',
              'failed'
            )
            AND attempts < 5
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
          `
        );

      if (!result.rowCount) {
        return null;
      }

      const job =
        result.rows[0];

      await client.query(
        `
        UPDATE notification_jobs
        SET
          status = 'processing',
          attempts = attempts + 1,
          updated_at = NOW()
        WHERE id = $1
        `,
        [job.id]
      );

      return job;
    }
  );
}

async function markNotificationJob(
  jobId,
  {
    status,
    lastError = null
  }
) {
  await pool.query(
    `
    UPDATE notification_jobs
    SET
      status = $2,
      last_error = $3,
      updated_at = NOW(),
      sent_at =
        CASE
          WHEN $2 = 'sent'
          THEN NOW()
          ELSE sent_at
        END
    WHERE id = $1
    `,
    [
      jobId,
      status,
      lastError
    ]
  );
}

async function processNotificationJobs() {
  let processed = 0;

  while (processed < 100) {
    const job =
      await claimNextNotificationJob();

    if (!job) {
      break;
    }

    const payload = {
      title:
        `🔥 Tu Día ${job.day} ya está disponible`,
      body:
        "Entrá y descubrí tu acción de hoy.",
      url: "/",
      tag:
        `day_available_${job.cycle}_${job.day}`
    };

    try {
      const result =
        await sendPushToUser(
          job.user_id,
          payload
        );

      if (result.sent > 0) {
        await markNotificationJob(
          job.id,
          {
            status: "sent"
          }
        );
      } else {
        const reason =
          result.subscriptions === 0
            ? "El usuario no tiene dispositivos suscriptos."
            : (
                result.errors.join(
                  " | "
                ) ||
                "No se pudo enviar la notificación."
              );

        await markNotificationJob(
          job.id,
          {
            status: "failed",
            lastError: reason
          }
        );
      }
    } catch (error) {
      await markNotificationJob(
        job.id,
        {
          status: "failed",
          lastError:
            error.message ||
            String(error)
        }
      );
    }

    processed += 1;
  }

  return processed;
}

async function runSchedulerCycle() {
  if (
    schedulerRunning ||
    !pool ||
    !pushConfigured
  ) {
    return;
  }

  schedulerRunning = true;

  try {
    const advanced =
      await enqueueDueUnlocks();

    const notifications =
      await processNotificationJobs();

    if (
      advanced > 0 ||
      notifications > 0
    ) {
      console.log(
        `[scheduler] desbloqueos=${advanced} notificaciones=${notifications}`
      );
    }
  } catch (error) {
    console.error(
      "[scheduler] error:",
      error
    );
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

app.post(
  "/api/admin/scheduler-run",
  async (req, res, next) => {
    try {
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
      ".backup"
    ]);

  const blockedDirectory =
    segments.some(segment =>
      segment === "node_modules" ||
      segment === "attached_assets" ||
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
