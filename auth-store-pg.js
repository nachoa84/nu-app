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

function createPgAuthStore(pool, {
  defaultCountry = "",
  defaultTimezone = "UTC"
} = {}) {
  return {
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

    async findActiveCode(email) {
      const result = await pool.query(
        `SELECT *
         FROM auth_codes
         WHERE email = $1 AND consumed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [email]
      );
      return mapCode(result.rows[0]);
    },

    async incrementCodeAttempts(id) {
      await pool.query(
        `UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1`,
        [id]
      );
    },

    async consumeCode(id, consumedAt) {
      await pool.query(
        `UPDATE auth_codes
         SET consumed_at = COALESCE($2, NOW())
         WHERE id = $1`,
        [id, consumedAt || null]
      );
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

    async deleteExpired(now) {
      await pool.query(
        `DELETE FROM user_sessions WHERE expires_at < COALESCE($1, NOW())`,
        [now || null]
      );
      await pool.query(
        `DELETE FROM auth_codes
         WHERE created_at < COALESCE($1, NOW()) - INTERVAL '1 day'`,
        [now || null]
      );
    }
  };
}

module.exports = { createPgAuthStore };
