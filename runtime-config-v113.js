"use strict";

const DB_POOL_MAX_DEFAULT_V113 = 20;
const DB_POOL_MAX_LIMIT_V113 = 40;
const DB_POOL_IDLE_TIMEOUT_MS_DEFAULT_V113 = 30000;
const DB_POOL_CONNECTION_TIMEOUT_MS_DEFAULT_V113 = 5000;

function boundedIntegerV113(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

function databasePoolOptionsV113(databaseUrl, env = process.env) {
  if (!databaseUrl) return null;
  return {
    connectionString: databaseUrl,
    max: boundedIntegerV113(
      env.DB_POOL_MAX,
      DB_POOL_MAX_DEFAULT_V113,
      5,
      DB_POOL_MAX_LIMIT_V113
    ),
    idleTimeoutMillis: boundedIntegerV113(
      env.DB_POOL_IDLE_TIMEOUT_MS,
      DB_POOL_IDLE_TIMEOUT_MS_DEFAULT_V113,
      5000,
      120000
    ),
    connectionTimeoutMillis: boundedIntegerV113(
      env.DB_POOL_CONNECTION_TIMEOUT_MS,
      DB_POOL_CONNECTION_TIMEOUT_MS_DEFAULT_V113,
      1000,
      30000
    )
  };
}

module.exports = {
  DB_POOL_MAX_DEFAULT_V113,
  DB_POOL_MAX_LIMIT_V113,
  databasePoolOptionsV113
};
