"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LEGACY_OUTBOX_KEY,
  OUTBOX_PREFIX,
  operationStorageKey,
  createRoutineProgressSyncV1
} = require("../routine-progress-sync-v1");

function sharedStorage(initial = {}) {
  const map = new Map(Object.entries(initial));

  const storage = {
    get length() {
      return map.size;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map);
    }
  };

  return { storage, map };
}

function controller(storage, userId, transport) {
  return createRoutineProgressSyncV1({
    storage,
    getUserId: () => userId,
    isOnline: () => true,
    isVisible: () => true,
    transport: transport || (async payload => ({
      ackedIds: payload.operations.map(operation => operation.id),
      canonicalState: {
        userId,
        currentDay: 1,
        nextUnlockAt: null,
        completedDays: []
      },
      productState: {
        userId,
        routines: {}
      }
    })),
    publishCanonical() {},
    publishProducts() {},
    warn() {}
  });
}

test("V3 stores each pending completion under its own deterministic key", () => {
  const { storage, map } = sharedStorage();
  const sync = controller(storage, "user-A");

  sync.recordCompletion({
    routineId: "collagen-30",
    day: 4,
    completedAt: 1800000000000
  });

  const key = operationStorageKey(
    "user-A",
    "collagen-30",
    4
  );

  assert.equal(key.startsWith(OUTBOX_PREFIX), true);
  assert.equal(map.has(key), true);
  assert.equal(map.has(LEGACY_OUTBOX_KEY), false);

  const persisted = JSON.parse(map.get(key));
  assert.equal(persisted.userId, "user-A");
  assert.equal(persisted.routineId, "collagen-30");
  assert.equal(persisted.day, 4);
});

test("V3 two tabs writing different completions cannot overwrite each other", () => {
  const { storage, map } = sharedStorage();

  const tabA = controller(storage, "same-user");
  const tabB = controller(storage, "same-user");

  tabA.recordCompletion({
    routineId: "collagen-30",
    day: 4,
    completedAt: 1800000000000
  });

  tabB.recordCompletion({
    routineId: "lumispa-10",
    day: 2,
    completedAt: 1800000000100
  });

  const collagenKey = operationStorageKey(
    "same-user",
    "collagen-30",
    4
  );
  const lumiKey = operationStorageKey(
    "same-user",
    "lumispa-10",
    2
  );

  assert.equal(map.has(collagenKey), true);
  assert.equal(map.has(lumiKey), true);
  assert.equal(tabA.pendingForCurrentUser().length, 2);
  assert.equal(tabB.pendingForCurrentUser().length, 2);
});

test("V3 interleaved tabs still preserve both independent keys", () => {
  const shared = new Map();
  let tabB = null;
  let inject = true;

  const storageB = {
    get length() { return shared.size; },
    key(index) { return [...shared.keys()][index] ?? null; },
    getItem(key) {
      return shared.has(key) ? shared.get(key) : null;
    },
    setItem(key, value) {
      shared.set(key, String(value));
    },
    removeItem(key) {
      shared.delete(key);
    }
  };

  const storageA = {
    get length() { return shared.size; },
    key(index) { return [...shared.keys()][index] ?? null; },
    getItem(key) {
      const value =
        shared.has(key) ? shared.get(key) : null;

      if (
        inject &&
        tabB &&
        key === operationStorageKey(
          "same-user",
          "collagen-30",
          4
        )
      ) {
        inject = false;
        tabB.recordCompletion({
          routineId: "lumispa-10",
          day: 2,
          completedAt: 1800000000100
        });
      }

      return value;
    },
    setItem(key, value) {
      shared.set(key, String(value));
    },
    removeItem(key) {
      shared.delete(key);
    }
  };

  tabB = controller(storageB, "same-user");
  const tabA = controller(storageA, "same-user");

  tabA.recordCompletion({
    routineId: "collagen-30",
    day: 4,
    completedAt: 1800000000000
  });

  assert.equal(
    shared.has(
      operationStorageKey(
        "same-user",
        "collagen-30",
        4
      )
    ),
    true
  );
  assert.equal(
    shared.has(
      operationStorageKey(
        "same-user",
        "lumispa-10",
        2
      )
    ),
    true
  );
});

test("V3 ACK removes only confirmed operation keys", async () => {
  const { storage } = sharedStorage();

  let collagenId = null;

  const sync = controller(
    storage,
    "user-A",
    async payload => ({
      ackedIds: collagenId ? [collagenId] : [],
      canonicalState: {
        userId: "user-A",
        currentDay: 2,
        nextUnlockAt: null,
        completedDays: [1]
      },
      productState: {
        userId: "user-A",
        routines: {}
      }
    })
  );

  const collagen = sync.recordCompletion({
    routineId: "collagen-30",
    day: 1,
    completedAt: 1800000000000
  });

  collagenId = collagen.id;

  sync.recordCompletion({
    routineId: "galvanicspa-10",
    day: 1,
    completedAt: 1800000000100
  });

  await sync.flush("partial-ack");

  const pending = sync.pendingForCurrentUser();

  assert.equal(pending.length, 1);
  assert.equal(pending[0].routineId, "galvanicspa-10");
  assert.equal(
    sync.isCompletionPending("collagen-30", 1),
    false
  );
  assert.equal(
    sync.isCompletionPending("galvanicspa-10", 1),
    true
  );

  sync.suspend();
});

test("V3 automatically migrates the legacy JSON outbox without losing IDs or timestamps", () => {
  const legacy = [
    {
      id: "legacy-collagen",
      userId: "legacy-user",
      routineId: "collagen-30",
      day: 5,
      completedAt: 1700000000000
    },
    {
      id: "legacy-wellspa",
      userId: "legacy-user",
      routineId: "wellspa-10",
      day: 2,
      completedAt: 1700000000100
    }
  ];

  const { storage, map } = sharedStorage({
    [LEGACY_OUTBOX_KEY]: JSON.stringify(legacy)
  });

  const sync = controller(
    storage,
    "legacy-user"
  );

  assert.equal(map.has(LEGACY_OUTBOX_KEY), false);

  const pending =
    sync.pendingForCurrentUser()
      .sort((a, b) =>
        a.routineId.localeCompare(b.routineId)
      );

  assert.equal(pending.length, 2);

  const collagen =
    pending.find(op =>
      op.routineId === "collagen-30"
    );
  const wellspa =
    pending.find(op =>
      op.routineId === "wellspa-10"
    );

  assert.equal(collagen.id, "legacy-collagen");
  assert.equal(collagen.completedAt, 1700000000000);
  assert.equal(wellspa.id, "legacy-wellspa");
  assert.equal(wellspa.completedAt, 1700000000100);
});

test("V3 legacy migration is idempotent across two tabs", () => {
  const legacy = [
    {
      id: "legacy-one",
      userId: "legacy-user",
      routineId: "collagen-30",
      day: 6,
      completedAt: 1700000000000
    }
  ];

  const { storage } = sharedStorage({
    [LEGACY_OUTBOX_KEY]: JSON.stringify(legacy)
  });

  const first = controller(storage, "legacy-user");
  const second = controller(storage, "legacy-user");

  assert.equal(first.pendingForCurrentUser().length, 1);
  assert.equal(second.pendingForCurrentUser().length, 1);
  assert.equal(
    first.pendingForCurrentUser()[0].id,
    "legacy-one"
  );
});

test("V3 same routine/day remains deduplicated across tabs", () => {
  const { storage } = sharedStorage();

  const tabA = controller(storage, "same-user");
  const tabB = controller(storage, "same-user");

  const first = tabA.recordCompletion({
    routineId: "collagen-30",
    day: 8,
    completedAt: 1800000000000
  });

  const second = tabB.recordCompletion({
    routineId: "collagen-30",
    day: 8,
    completedAt: 1800000000500
  });

  assert.equal(first.id, second.id);
  assert.equal(
    tabA.pendingForCurrentUser().length,
    1
  );
  assert.equal(
    tabA.pendingForCurrentUser()[0].completedAt,
    1800000000000
  );
});


require("./routine-progress-sync-v3-rollback.audit.test.js");
