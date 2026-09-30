"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  OUTBOX_KEY,
  collectLegacyCurrentCompletionsV1,
  createRoutineProgressSyncV1
} = require("../routine-progress-sync-v1");

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
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
}

function harness(options = {}) {
  let now = 1_000_000;
  let timerId = 0;
  let online = true;
  let visible = true;
  const timers = new Map();
  const calls = [];
  const published = [];
  const storage = memoryStorage();

  const controller = createRoutineProgressSyncV1({
    storage,
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++timerId;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    getUserId: () => "A",
    isOnline: () => online,
    isVisible: () => visible,
    transport: async payload => {
      calls.push(payload);
      if (options.transport) return options.transport(payload);
      return {
        ackedIds: payload.operations.map(op => op.id),
        canonicalState: {
          userId: "A",
          currentDay: 2,
          nextUnlockAt: null,
          completedDays: []
        },
        productState: {
          userId: "A",
          routines: {}
        }
      };
    },
    publishCanonical(state) {
      published.push(["canonical", state]);
    },
    publishProducts(state) {
      published.push(["products", state]);
    },
    warn() {}
  });

  async function flush() {
    for (let i = 0; i < 8; i += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  async function advance(ms) {
    const end = now + ms;
    for (let guard = 0; guard < 1000; guard += 1) {
      const entries = [...timers.entries()]
        .sort((a,b) => a[1].at - b[1].at);
      if (!entries.length || entries[0][1].at > end) break;
      const [id, timer] = entries[0];
      timers.delete(id);
      now = timer.at;
      timer.fn();
      await flush();
    }
    now = end;
    await flush();
  }

  return {
    controller,
    storage,
    calls,
    published,
    timers,
    flush,
    advance,
    now: () => now,
    setOnline(value) { online = value; },
    setVisible(value) { visible = value; }
  };
}

test("V2 schedules one canonical reconcile when Collagen nextUnlockAt becomes due", async () => {
  const h = harness();

  h.controller.rememberCanonical({
    userId: "A",
    currentDay: 2,
    nextUnlockAt: h.now() + 1000
  });

  assert.ok(h.controller.inspect().dueAt > h.now());
  assert.ok(h.controller.inspect().dueTimerAt > h.now());

  await h.advance(2000);

  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].operations, []);
  assert.equal(h.controller.inspect().dueAt, null);
});

test("V2 tracks the earliest due time across Collagen and product routines", () => {
  const h = harness();

  h.controller.rememberCanonical({
    userId: "A",
    currentDay: 3,
    nextUnlockAt: h.now() + 5000
  });

  h.controller.rememberProducts({
    userId: "A",
    routines: {
      "lumispa-10": {
        initialized: true,
        currentDay: 2,
        nextUnlockAt: h.now() + 2000
      },
      "wellspa-10": {
        initialized: true,
        currentDay: 4,
        nextUnlockAt: h.now() + 8000
      }
    }
  });

  assert.equal(
    h.controller.inspect().dueAt,
    h.now() + 2000
  );
});

test("V2 does not fire a due reconcile while hidden and recovers on resume", async () => {
  const h = harness();

  h.controller.rememberCanonical({
    userId: "A",
    currentDay: 2,
    nextUnlockAt: h.now() + 1000
  });

  h.setVisible(false);
  h.controller.suspend();

  await h.advance(5000);
  assert.equal(h.calls.length, 0);

  h.setVisible(true);
  await h.controller.onResume("visibilitychange");

  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].operations, []);
});

test("V2 due reconcile waits offline and resumes when online", async () => {
  const h = harness();

  h.controller.rememberCanonical({
    userId: "A",
    currentDay: 2,
    nextUnlockAt: h.now() + 1000
  });

  h.setOnline(false);
  await h.advance(5000);

  assert.equal(h.calls.length, 0);

  h.setOnline(true);
  await h.controller.onResume("online");

  assert.equal(h.calls.length, 1);
});

test("V2 canonical response updates due scheduling without a second coordinator", async () => {
  const h = harness({
    transport: async payload => ({
      ackedIds: payload.operations.map(op => op.id),
      canonicalState: {
        userId: "A",
        currentDay: 4,
        nextUnlockAt: h.now() + 4000,
        completedDays: []
      },
      productState: {
        userId: "A",
        routines: {}
      }
    })
  });

  await h.controller.reconcile("manual");

  assert.equal(
    h.controller.inspect().dueAt,
    h.now() + 4000
  );
  assert.ok(h.controller.inspect().dueTimerAt !== null);
});

test("V2 legacy collector rejects out-of-range current days instead of producing invalid operations", () => {
  const storage = memoryStorage({
    routineState: JSON.stringify({ currentDay: 999 }),
    day999Complete: "1",
    day999CompletedAt: "1800000000000",
    "routineState:lumispa-10": JSON.stringify({ currentDay: -4 }),
    "day:lumispa-10:-4:complete": "1",
    "day:lumispa-10:-4:completedAt": "1800000000000"
  });

  assert.deepEqual(
    collectLegacyCurrentCompletionsV1(storage, "legacy-user"),
    []
  );
});

test("runtime uses Progress Sync as the only routine reconciliation coordinator", () => {
  const backend = fs.readFileSync(
    path.join(__dirname, "..", "backend-client.js"),
    "utf8"
  );
  const index = fs.readFileSync(
    path.join(__dirname, "..", "index.html"),
    "utf8"
  );
  const serviceWorker = fs.readFileSync(
    path.join(__dirname, "..", "service-worker.js"),
    "utf8"
  );

  assert.doesNotMatch(backend, /activeSyncControllerV172/);
  assert.doesNotMatch(index, /routine-active-sync-v172\.js/);
  assert.doesNotMatch(serviceWorker, /routine-active-sync-v172\.js/);
  assert.match(
    backend,
    /function refreshActiveState[\s\S]*?progressSyncControllerV1[\s\S]*?reconcile/
  );
});

test("legacy migration has a per-user one-shot marker and cannot repeat every startup", () => {
  const backend = fs.readFileSync(
    path.join(__dirname, "..", "backend-client.js"),
    "utf8"
  );

  assert.match(
    backend,
    /nuapp:routine-progress-legacy-migrated:v1:/
  );
  assert.match(
    backend,
    /localStorage\.setItem\(\s*migrationKey/
  );
});

test("legacy migration isolates malformed operations instead of aborting startup", () => {
  const backend = fs.readFileSync(
    path.join(__dirname, "..", "backend-client.js"),
    "utf8"
  );

  assert.match(
    backend,
    /for \(const operation of operations\)[\s\S]*?try \{[\s\S]*?recordCompletion/
  );
  assert.match(
    backend,
    /catch \(error\)[\s\S]*?migración legacy/
  );
});


test("V2 unresolved overdue state stops after bounded retries instead of polling forever", async () => {
  let overdueAt = null;
  const h = harness({
    transport: async payload => ({
      ackedIds: payload.operations.map(op => op.id),
      canonicalState: {
        userId: "A",
        currentDay: 2,
        nextUnlockAt: overdueAt,
        completedDays: [1]
      },
      productState: {
        userId: "A",
        routines: {}
      }
    })
  });

  overdueAt = h.now() - 1000;

  h.controller.rememberCanonical({
    userId: "A",
    currentDay: 2,
    nextUnlockAt: overdueAt
  });

  await h.advance(120000);

  assert.equal(h.calls.length, 5);
  assert.equal(h.controller.inspect().exhausted, true);
  assert.equal(h.timers.size, 0);
});

test("V2 late response from old identity cannot ACK or publish into the new account", async () => {
  let userId = "A";
  let release;

  const storage = memoryStorage();
  const published = [];

  const controller = createRoutineProgressSyncV1({
    storage,
    getUserId: () => userId,
    isOnline: () => true,
    isVisible: () => true,
    transport: async () =>
      new Promise(resolve => {
        release = resolve;
      }),
    publishCanonical(state) {
      published.push(state);
    },
    publishProducts() {},
    warn() {}
  });

  controller.recordCompletion({
    routineId: "collagen-30",
    day: 1,
    completedAt: Date.now()
  });

  const running = controller.flush("completion");

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof release, "function");

  userId = "B";
  controller.inspect();

  release({
    ackedIds: controller
      .inspectOutbox()
      .filter(op => op.userId === "A")
      .map(op => op.id),
    canonicalState: {
      userId: "A",
      currentDay: 2,
      nextUnlockAt: null
    },
    productState: {
      userId: "A",
      routines: {}
    }
  });

  await running;

  assert.equal(published.length, 0);
  assert.equal(
    controller.inspectOutbox().some(op => op.userId === "A"),
    true
  );
  assert.equal(controller.inspect().identity, "B");
});


test("AUDIT: dos pestañas pueden perder una operación por read-modify-write del outbox JSON", () => {
  const shared = new Map();
  let controllerB = null;
  let injectConcurrentWrite = true;

  const storageB = {
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
    getItem(key) {
      const snapshot =
        shared.has(key) ? shared.get(key) : null;

      if (
        key === OUTBOX_KEY &&
        injectConcurrentWrite &&
        controllerB
      ) {
        injectConcurrentWrite = false;

        controllerB.recordCompletion({
          routineId: "lumispa-10",
          day: 2,
          completedAt: 1800000000100
        });
      }

      return snapshot;
    },
    setItem(key, value) {
      shared.set(key, String(value));
    },
    removeItem(key) {
      shared.delete(key);
    }
  };

  controllerB = createRoutineProgressSyncV1({
    storage: storageB,
    getUserId: () => "same-user",
    transport: async () => ({
      ackedIds: [],
      canonicalState: null,
      productState: null
    })
  });

  const controllerA = createRoutineProgressSyncV1({
    storage: storageA,
    getUserId: () => "same-user",
    transport: async () => ({
      ackedIds: [],
      canonicalState: null,
      productState: null
    })
  });

  controllerA.recordCompletion({
    routineId: "collagen-30",
    day: 4,
    completedAt: 1800000000000
  });

  const persisted =
    JSON.parse(shared.get(OUTBOX_KEY) || "[]");

  assert.equal(
    persisted.some(op => op.routineId === "collagen-30" && op.day === 4),
    true
  );
  assert.equal(
    persisted.some(op => op.routineId === "lumispa-10" && op.day === 2),
    false,
    "la escritura de la segunda pestaña fue sobrescrita por la primera"
  );
});
