"use strict";

const crypto = require("node:crypto");

function rateLimitKeyHashV115(namespace, key) {
  return crypto
    .createHash("sha256")
    .update(`${namespace}:\0${String(key)}`)
    .digest("hex");
}

async function consumeSharedRateLimitV115(
  pool,
  { namespace, key, windowMs, max, now = Date.now() }
) {
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const resetAtMs = windowStartMs + windowMs;
  const result = await pool.query(
    `INSERT INTO rate_limit_buckets (
       namespace, key_hash, window_started_at, expires_at, request_count
     )
     VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), 1)
     ON CONFLICT (namespace, key_hash, window_started_at)
     DO UPDATE SET
       request_count = rate_limit_buckets.request_count + 1,
       expires_at = EXCLUDED.expires_at
     RETURNING request_count`,
    [
      String(namespace),
      rateLimitKeyHashV115(namespace, key),
      windowStartMs,
      resetAtMs
    ]
  );
  const count = Number(result.rows[0].request_count);
  return {
    allowed: count <= max,
    count,
    remaining: Math.max(max - count, 0),
    resetAt: resetAtMs,
    retryAfter: Math.max(Math.ceil((resetAtMs - now) / 1000), 1)
  };
}

async function pruneSharedRateLimitsV115(pool) {
  const result = await pool.query(
    `DELETE FROM rate_limit_buckets
     WHERE expires_at < NOW() - INTERVAL '5 minutes'`
  );
  return result.rowCount || 0;
}

module.exports = {
  consumeSharedRateLimitV115,
  pruneSharedRateLimitsV115,
  rateLimitKeyHashV115
};
