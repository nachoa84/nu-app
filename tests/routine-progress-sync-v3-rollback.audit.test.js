"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  LEGACY_OUTBOX_KEY,
  OUTBOX_PREFIX,
  operationStorageKey,
  createRoutineProgressSyncV1
} = require("../routine-progress-sync-v1");

function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    dump() { return Object.fromEntries(map); }
  };
}

test("AUDIT rollback: V3 pending key is not represented in legacy JSON outbox", () => {
  const storage = memoryStorage();

  const sync = createRoutineProgressSyncV1({
    storage,
    getUserId: () => "rollback-user",
    isOnline: () => false,
    isVisible: () => true,
    transport: async () => {
      throw new Error("offline");
    },
    warn() {}
  });

  sync.recordCompletion({
    routineId: "collagen-30",
    day: 4,
    completedAt: 1800000000000
  });

  const key = operationStorageKey(
    "rollback-user",
    "collagen-30",
    4
  );

  assert.equal(storage.getItem(key) !== null, true);
  assert.equal(storage.getItem(LEGACY_OUTBOX_KEY), null);
  assert.equal(key.startsWith(OUTBOX_PREFIX), true);
});

test("AUDIT rollback: UI completion evidence still exists independently of outbox format", () => {
  const stateSource = fs.readFileSync(
    path.join(__dirname, "..", "routine-state.js"),
    "utf8"
  );

  assert.match(
    stateSource,
    /localStorage\.setItem\(key, "1"\)/
  );
  assert.match(
    stateSource,
    /localStorage\.setItem\(\s*completedAtKey,\s*String\(completedAt\)/
  );
});

test("AUDIT rollback: bootstrap still serializes local completion evidence", () => {
  const backend = fs.readFileSync(
    path.join(__dirname, "..", "backend-client.js"),
    "utf8"
  );

  assert.match(
    backend,
    /completedDays:\s*local\.completedDays/
  );
  assert.match(
    backend,
    /completedAtByDay:\s*local\.completedAtByDay/
  );
});
