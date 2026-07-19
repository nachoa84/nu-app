const express = require("express");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
const {
  DateTime,
  IANAZone
} = require("luxon");

const app = express();

const PORT =
  Number(process.env.PORT || 3000);

const MAX_DAY =
  Number(process.env.MAX_DAY || 7);

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

app.use(
  express.json({
    limit: "256kb"
  })
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
    await client.query(
      `
      UPDATE users
      SET
        current_day = current_day + 1,
        next_unlock_at = NULL,
        updated_at = NOW(),
        last_seen_at = NOW()
      WHERE id = $1
      `,
      [userId]
    );
  } else {
    await client.query(
      `
      UPDATE users
      SET last_seen_at = NOW()
      WHERE id = $1
      `,
      [userId]
    );
  }
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
                `,
                [
                  profile.userId,
                  profile.name,
                  profile.country,
                  profile.timezone,
                  profile.notificationTime
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
        clampDay(
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
        clampDay(
          req.body.day
        );

      const state =
        await withTransaction(
          async client => {
            const userResult =
              await client.query(
                `
                SELECT cycle
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

            const cycle =
              userResult.rows[0]
                .cycle;

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

app.use(
  (req, res, next) => {
    const blocked =
      req.path === "/server.js" ||
      req.path === "/package.json" ||
      req.path === "/package-lock.json" ||
      req.path === "/schema.sql" ||
      req.path.startsWith(
        "/node_modules/"
      );

    if (blocked) {
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
    console.error(error);

    res.status(
      error.status || 500
    ).json({
      ok: false,
      error:
        error.message ||
        "Error interno del servidor."
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
    }
  );
}

start();
