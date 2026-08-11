// NU APP · ALMACENAMIENTO DE ACCESO V110
// Implementación PostgreSQL del store que usa auth-core.js.
// Los códigos y los tokens de sesión sólo se guardan como hash.

function mapCode(row) {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    codeHash: row.code_hash,
    attempts: Number(row.attempts),
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at
  };
}

function mapUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email || null,
    name: row.name,
    emailVerifiedAt: row.email_verified_at || null
  };
}

function mapSession(row) {
  if (!row) return null;

  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at
  };
}

function linkError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createPgAuthStore(pool, {
  defaultCountry = "",
  defaultTimezone = "UTC"
} = {}) {
  async function withTransaction(work) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("[auth-v110] error en ROLLBACK:", rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    withTransaction,

    async countCodesSince(email, since) {
      const result = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM auth_codes
         WHERE email = $1 AND created_at >= $2`,
        [email, since]
      );
      return result.rows[0].total;
    },

    async countCodesByIpSince(ip, since) {
      const result = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM auth_codes
         WHERE request_ip = $1 AND created_at >= $2`,
        [ip, since]
      );
      return result.rows[0].total;
    },

    async invalidateCodesForEmail(email) {
      await pool.query(
        `UPDATE auth_codes
         SET consumed_at = NOW()
         WHERE email = $1 AND consumed_at IS NULL`,
        [email]
      );
    },

    async createCode({ email, codeHash, expiresAt, createdAt, requestIp }) {
      const result = await pool.query(
        `INSERT INTO auth_codes (
           email, code_hash, expires_at, created_at, request_ip
         ) VALUES ($1, $2, $3, COALESCE($4, NOW()), $5)
         RETURNING *`,
        [email, codeHash, expiresAt, createdAt || null, requestIp || null]
      );
      return mapCode(result.rows[0]);
    },

    // Consumo atómico del código vigente. El UPDATE condicional con
    // RETURNING garantiza que, ante dos verificaciones simultáneas,
    // exactamente una obtenga la fila.
    async consumeMatchingCode({ email, codeHash, now, maxAttempts }) {
      const consumed = await pool.query(
        `WITH candidato AS (
           SELECT id
           FROM auth_codes
           WHERE email = $1 AND consumed_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
         )
         UPDATE auth_codes AS c
         SET consumed_at = COALESCE($3, NOW())
         FROM candidato
         WHERE c.id = candidato.id
           AND c.consumed_at IS NULL
           AND c.expires_at > COALESCE($3, NOW())
           AND c.attempts < $4
           AND c.code_hash = $2
         RETURNING c.id`,
        [email, codeHash, now || null, maxAttempts]
      );

      if (consumed.rowCount) {
        return { status: "consumed", id: consumed.rows[0].id };
      }

      // No se consumió: hay que distinguir el motivo y, si el código no
      // coincide, contabilizar el intento fallido.
      const failed = await pool.query(
        `UPDATE auth_codes AS c
         SET attempts = c.attempts + 1
         FROM (
           SELECT id
           FROM auth_codes
           WHERE email = $1 AND consumed_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
         ) AS candidato
         WHERE c.id = candidato.id
           AND c.consumed_at IS NULL
           AND c.expires_at > COALESCE($3, NOW())
           AND c.attempts < $4
           AND c.code_hash <> $2
         RETURNING c.attempts`,
        [email, codeHash, now || null, maxAttempts]
      );

      if (failed.rowCount) {
        return { status: "mismatch", attempts: failed.rows[0].attempts };
      }

      const current = await pool.query(
        `SELECT expires_at, attempts
         FROM auth_codes
         WHERE email = $1 AND consumed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [email]
      );

      const row = current.rows[0];

      if (!row) return { status: "not_found" };

      const reference = now ? new Date(now) : new Date();

      if (new Date(row.expires_at).getTime() <= reference.getTime()) {
        return { status: "expired" };
      }

      if (Number(row.attempts) >= maxAttempts) {
        return { status: "too_many_attempts" };
      }

      return { status: "not_found" };
    },

    async findUserByEmail(email) {
      const result = await pool.query(
        `SELECT id, email, name, email_verified_at
         FROM users
         WHERE email = $1`,
        [email]
      );
      return mapUser(result.rows[0]);
    },

    async findUserById(userId) {
      const result = await pool.query(
        `SELECT id, email, name, email_verified_at
         FROM users
         WHERE id = $1`,
        [userId]
      );
      return mapUser(result.rows[0]);
    },

    async createUser({ id, email, name, createdAt }) {
      const result = await pool.query(
        `INSERT INTO users (
           id, name, country, timezone, email, email_verified_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), COALESCE($6, NOW()))
         RETURNING id, email, name, email_verified_at`,
        [id, name, defaultCountry, defaultTimezone, email, createdAt || null]
      );
      return mapUser(result.rows[0]);
    },

    async markEmailVerified(userId, verifiedAt) {
      await pool.query(
        `UPDATE users
         SET email_verified_at = COALESCE($2, NOW()), last_seen_at = NOW()
         WHERE id = $1`,
        [userId, verifiedAt || null]
      );
    },

    async attachEmailToUser(userId, email, verifiedAt) {
      const result = await pool.query(
        `UPDATE users
         SET email = $2,
             email_verified_at = COALESCE($3, NOW()),
             updated_at = NOW()
         WHERE id = $1 AND email IS NULL
         RETURNING id`,
        [userId, email, verifiedAt || null]
      );

      if (!result.rowCount) {
        const error = new Error("Esa cuenta ya está vinculada a un correo.");
        error.status = 409;
        throw error;
      }
    },

    async userHasProgress(userId) {
      const result = await pool.query(
        `SELECT
           EXISTS (SELECT 1 FROM day_progress WHERE user_id = $1) AS collagen,
           EXISTS (
             SELECT 1 FROM product_routine_day_progress WHERE user_id = $1
           ) AS products`,
        [userId]
      );
      const row = result.rows[0];
      return Boolean(row.collagen || row.products);
    },

    async deleteUser(userId) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    },

    async createSession({
      tokenHash,
      userId,
      createdAt,
      expiresAt,
      requestIp
    }) {
      await pool.query(
        `INSERT INTO user_sessions (
           token_hash, user_id, created_at, last_seen_at, expires_at, request_ip
         ) VALUES ($1, $2, COALESCE($3, NOW()), COALESCE($3, NOW()), $4, $5)`,
        [tokenHash, userId, createdAt || null, expiresAt, requestIp || null]
      );
    },

    async findSessionByHash(tokenHash) {
      const result = await pool.query(
        `SELECT * FROM user_sessions WHERE token_hash = $1`,
        [tokenHash]
      );
      return mapSession(result.rows[0]);
    },

    async touchSession(tokenHash, seenAt) {
      await pool.query(
        `UPDATE user_sessions
         SET last_seen_at = COALESCE($2, NOW())
         WHERE token_hash = $1`,
        [tokenHash, seenAt || null]
      );
    },

    async deleteSessionByHash(tokenHash) {
      const result = await pool.query(
        `DELETE FROM user_sessions WHERE token_hash = $1`,
        [tokenHash]
      );
      return Boolean(result.rowCount);
    },

    async moveSessions(fromUserId, toUserId) {
      await pool.query(
        `UPDATE user_sessions SET user_id = $2 WHERE user_id = $1`,
        [fromUserId, toUserId]
      );
    },

    // Transición V110 completa en una sola transacción. users.email tiene
    // índice único parcial: el correo se libera de la cuenta temporal antes
    // de asignarlo a la anterior. Cualquier error deshace todo con ROLLBACK.
    async linkLegacyAccount({ sessionUserId, legacyUserId, email, now }) {
      return withTransaction(async client => {
        // Se bloquean las dos filas en orden estable para evitar deadlocks.
        const locked = await client.query(
          `SELECT id, email
           FROM users
           WHERE id = ANY($1::text[])
           ORDER BY id
           FOR UPDATE`,
          [[sessionUserId, legacyUserId].sort()]
        );

        const rows = new Map(locked.rows.map(row => [row.id, row]));
        const current = rows.get(sessionUserId);
        const legacy = rows.get(legacyUserId);

        if (!current) throw linkError("Sesión inválida.", 401);

        if (!legacy) {
          throw linkError("No encontramos esa cuenta anterior.", 404);
        }

        if (legacy.email) {
          throw linkError("Esa cuenta ya está vinculada a un correo.", 409);
        }

        if (current.email !== email) {
          throw linkError("Sesión inválida.", 401);
        }

        const progress = await client.query(
          `SELECT
             EXISTS (
               SELECT 1 FROM day_progress WHERE user_id = $1
             ) AS collagen,
             EXISTS (
               SELECT 1 FROM product_routine_day_progress WHERE user_id = $1
             ) AS products`,
          [sessionUserId]
        );

        if (progress.rows[0].collagen || progress.rows[0].products) {
          throw linkError(
            "Tu cuenta actual ya tiene progreso. " +
            "Escribinos para unificarlas manualmente.",
            409
          );
        }

        await client.query(
          `UPDATE users
           SET email = NULL, email_verified_at = NULL
           WHERE id = $1`,
          [sessionUserId]
        );

        const attached = await client.query(
          `UPDATE users
           SET email = $2, email_verified_at = COALESCE($3, NOW())
           WHERE id = $1 AND email IS NULL
           RETURNING id`,
          [legacyUserId, email, now || null]
        );

        if (!attached.rowCount) {
          throw linkError("Esa cuenta ya está vinculada a un correo.", 409);
        }

        await client.query(
          `UPDATE user_sessions SET user_id = $2 WHERE user_id = $1`,
          [sessionUserId, legacyUserId]
        );

        await client.query(
          `DELETE FROM users WHERE id = $1`,
          [sessionUserId]
        );

        return { userId: legacyUserId, email };
      });
    },

    async deleteExpired(now) {
      const sessions = await pool.query(
        `DELETE FROM user_sessions WHERE expires_at < COALESCE($1, NOW())`,
        [now || null]
      );

      const codes = await pool.query(
        `DELETE FROM auth_codes
         WHERE created_at < COALESCE($1, NOW()) - INTERVAL '1 day'`,
        [now || null]
      );

      return {
        sessions: sessions.rowCount || 0,
        codes: codes.rowCount || 0
      };
    }
  };
}

module.exports = { createPgAuthStore };
