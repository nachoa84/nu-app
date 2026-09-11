"use strict";

function trueFlag(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function boundedInteger(env, name, fallback, minimum, maximum) {
  const raw = env[name];
  const parsed = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} debe ser un entero entre ${minimum} y ${maximum}.`);
  }
  return parsed;
}

function buildNotificationPoolOptionsV1(config) {
  return {
    connectionString: config.databaseUrl,
    max: 3,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    ...(config.dryRun
      ? { options: "-c default_transaction_read_only=on" }
      : {})
  };
}

function readNotificationWorkerConfigV1(env = process.env, argv = process.argv.slice(2)) {
  const command = String(argv[0] || "audit").trim().toLowerCase();
  if (!new Set(["audit", "consume"]).has(command)) {
    throw new Error("Comando inválido. Usá audit o consume.");
  }

  const dryRun = command === "audit" || trueFlag(env.NOTIFICATION_WORKER_DRY_RUN);
  const config = {
    command,
    dryRun,
    enabled: trueFlag(env.NOTIFICATION_WORKER_ENABLED),
    pushSendEnabled: trueFlag(env.PUSH_SEND_ENABLED),
    databaseUrl: String(env.DATABASE_URL || "").trim(),
    batchSize: boundedInteger(env, "NOTIFICATION_BATCH_SIZE", 25, 1, 100),
    maxPerRun: boundedInteger(env, "NOTIFICATION_MAX_PER_RUN", 100, 1, 500),
    concurrency: boundedInteger(env, "NOTIFICATION_CONCURRENCY", 5, 1, 10),
    runBudgetMs: boundedInteger(env, "NOTIFICATION_RUN_BUDGET_MS", 20000, 1000, 55000),
    maxAttempts: boundedInteger(env, "NOTIFICATION_MAX_ATTEMPTS", 5, 1, 5),
    ttlHours: boundedInteger(env, "ROUTINE_NOTIFICATION_TTL_HOURS", 24, 1, 72),
    retryBaseMs: boundedInteger(env, "NOTIFICATION_RETRY_BASE_MS", 60000, 30000, 3600000),
    staleMs: boundedInteger(env, "NOTIFICATION_DELIVERY_STALE_MS", 300000, 60000, 1800000),
    pushTimeoutMs: boundedInteger(env, "NOTIFICATION_PUSH_TIMEOUT_MS", 10000, 1000, 30000),
    canaryUserId: String(env.NOTIFICATION_CANARY_USER_ID || "").trim() || null,
    vapidPublicKey: String(env.VAPID_PUBLIC_KEY || "").trim(),
    vapidPrivateKey: String(env.VAPID_PRIVATE_KEY || "").trim(),
    vapidSubject: String(env.VAPID_SUBJECT || "").trim()
  };

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL es obligatorio para ejecutar el worker.");
  }
  if (config.pushTimeoutMs >= config.staleMs) {
    throw new Error("NOTIFICATION_PUSH_TIMEOUT_MS debe ser menor que NOTIFICATION_DELIVERY_STALE_MS.");
  }
  if (config.canaryUserId && (
    config.canaryUserId.length > 128 || /[\u0000-\u001f\u007f]/.test(config.canaryUserId)
  )) {
    throw new Error("NOTIFICATION_CANARY_USER_ID inválido.");
  }

  if (!dryRun) {
    if (!config.enabled) {
      throw new Error("configuration_blocked: NOTIFICATION_WORKER_ENABLED debe ser true.");
    }
    if (!config.pushSendEnabled) {
      throw new Error("configuration_blocked: PUSH_SEND_ENABLED debe ser true.");
    }
    if (!config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) {
      throw new Error("configuration_blocked: configuración VAPID incompleta.");
    }
  }

  return Object.freeze(config);
}

module.exports = {
  boundedInteger,
  buildNotificationPoolOptionsV1,
  readNotificationWorkerConfigV1,
  trueFlag
};
