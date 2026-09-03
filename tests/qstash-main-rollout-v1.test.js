"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  installMainQStashRollout,
  isPublishedEnvironment,
  rolloutUserIds,
  trueFlag
} = require("../qstash-main-rollout-v1");

test("rollout queda apagado por defecto", () => {
  assert.deepEqual(
    installMainQStashRollout({}),
    { enabled: false, users: 0 }
  );
});

test("parsea IDs explícitos del rollout", () => {
  assert.deepEqual(
    rolloutUserIds({
      QSTASH_ROUTINE_NOTIFICATION_USER_IDS: " user-a, user-b ,,user-c "
    }),
    ["user-a", "user-b", "user-c"]
  );
});

test("production rechaza wildcard durante el rollout inicial", () => {
  assert.throws(
    () => installMainQStashRollout({
      NODE_ENV: "production",
      QSTASH_ROUTINE_NOTIFICATIONS_ENABLED: "true",
      QSTASH_ROUTINE_NOTIFICATION_USER_IDS: "*"
    }),
    /IDs explícitos/
  );
});

test("rollout habilitado exige al menos un usuario", () => {
  assert.throws(
    () => installMainQStashRollout({
      QSTASH_ROUTINE_NOTIFICATIONS_ENABLED: "true"
    }),
    /QSTASH_ROUTINE_NOTIFICATION_USER_IDS/
  );
});

test("helpers reconocen flags y deployment publicado", () => {
  assert.equal(trueFlag("true"), true);
  assert.equal(trueFlag("FALSE"), false);
  assert.equal(
    isPublishedEnvironment({ REPLIT_DEPLOYMENT: "1", NODE_ENV: "development" }),
    true
  );
});
