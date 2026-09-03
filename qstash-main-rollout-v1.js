"use strict";

// NU APP · QSTASH MAIN ROLLOUT V1
// Carga el piloto validado sólo cuando el interruptor seguro de Production
// está habilitado. El rollout inicial exige IDs explícitos y rechaza '*'.

function trueFlag(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function isPublishedEnvironment(env = process.env) {
  return (
    String(env.REPLIT_DEPLOYMENT || "").trim() === "1" ||
    String(env.NODE_ENV || "").trim().toLowerCase() === "production"
  );
}

function rolloutUserIds(env = process.env) {
  return String(env.QSTASH_ROUTINE_NOTIFICATION_USER_IDS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function installMainQStashRollout(env = process.env) {
  if (!trueFlag(env.QSTASH_ROUTINE_NOTIFICATIONS_ENABLED)) {
    return { enabled: false, users: 0 };
  }

  const ids = rolloutUserIds(env);
  if (!ids.length) {
    throw new Error(
      "QSTASH_ROUTINE_NOTIFICATIONS_ENABLED requiere QSTASH_ROUTINE_NOTIFICATION_USER_IDS."
    );
  }

  if (isPublishedEnvironment(env) && ids.includes("*")) {
    throw new Error(
      "El rollout inicial de QStash en Production requiere IDs explícitos; '*' todavía no está permitido."
    );
  }

  // Los módulos ya validados en development conservan sus nombres de piloto,
  // pero estas variables se generan internamente después del guard de release.
  // No deben configurarse directamente como Secrets de Production.
  env.QSTASH_ROUTINE_PILOT_ENABLED = "true";
  env.QSTASH_ROUTINE_PILOT_USER_IDS = ids.join(",");

  require("./qstash-notification-server-v1");
  require("./qstash-routine-pilot-v1");
  require("./pilot-qstash-product-routines-v1");

  console.log(`[qstash-main-rollout] enabled=1 users=${ids.length}`);
  return { enabled: true, users: ids.length };
}

module.exports = {
  installMainQStashRollout,
  isPublishedEnvironment,
  rolloutUserIds,
  trueFlag
};
