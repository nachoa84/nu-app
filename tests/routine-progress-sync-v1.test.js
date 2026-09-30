"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
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
  let now = 1_800_000_000_000;
  let timerId = 0;
  const timers = new Map();
  const storage = memoryStorage();
  const sent = [];
  const published = [];
  let online = true;
  let visible = true;
  let userId = options.userId || "user-A";
  const responses = [...(options.responses || [])];

  const sync = createRoutineProgressSyncV1({
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
    getUserId: () => userId,
    isOnline: () => online,
    isVisible: () => visible,
    transport: async payload => {
      sent.push(payload);
      if (responses.length) {
        const next = responses.shift();
        if (next instanceof Error) throw next;
        if (next !== null) return next;
      }
      return {
        ackedIds: payload.operations.map(operation => operation.id),
        canonicalState: {
          userId,
          currentDay: 1,
          completedDays: payload.operations
            .filter(operation => operation.routineId === "collagen-30")
            .map(operation => operation.day)
        },
        productState: {
          userId,
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

  async function flushMicrotasks() {
    for (let i = 0; i < 8; i += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  async function advance(ms) {
    const end = now + ms;
    for (let guard = 0; guard < 100; guard += 1) {
      const next = [...timers.entries()]
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
      await flushMicrotasks();
    }
    now = end;
    await flushMicrotasks();
  }

  return {
    sync,
    storage,
    sent,
    published,
    advance,
    flushMicrotasks,
    setOnline(value) { online = value; },
    setVisible(value) { visible = value; },
    setUserId(value) { userId = value; }
  };
}

test("completion is durable before any network attempt", () => {
  const h = harness();

  const operation = h.sync.recordCompletion({
    routineId: "collagen-30",
    day: 4,
    completedAt: 1_799_999_000_000
  });

  assert.equal(operation.userId, "user-A");
  assert.equal(operation.routineId, "collagen-30");
  assert.equal(operation.day, 4);

  const pending = h.sync.pendingForCurrentUser();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, operation.id);
});

test("same user routine and day is deduplicated while pending", () => {
  const h = harness();

  const first = h.sync.recordCompletion({
    routineId: "lumispa-10",
    day: 3,
    completedAt: 1_799_999_000_000
  });
  const second = h.sync.recordCompletion({
    routineId: "lumispa-10",
    day: 3,
    completedAt: 1_799_999_500_000
  });

  assert.equal(first.id, second.id);
  assert.equal(h.sync.pendingForCurrentUser().length, 1);
  assert.equal(
    h.sync.pendingForCurrentUser()[0].completedAt,
    1_799_999_000_000
  );
});

test("pending operations are isolated by user identity", () => {
  const h = harness();

  h.sync.recordCompletion({
    routineId: "collagen-30",
    day: 2,
    completedAt: 1_799_999_000_000
  });

  h.setUserId("user-B");

  assert.equal(h.sync.pendingForCurrentUser().length, 0);

  h.sync.recordCompletion({
    routineId: "collagen-30",
    day: 1,
    completedAt: 1_799_999_100_000
  });

  assert.equal(h.sync.inspectOutbox().length, 2);
  assert.equal(h.sync.pendingForCurrentUser().length, 1);
  assert.equal(h.sync.pendingForCurrentUser()[0].userId, "user-B");
});

test("successful flush removes only server-acked operations", async () => {
  const partial = {
    ackedIds: [],
    canonicalState: {
      userId: "user-A",
      currentDay: 2,
      completedDays: []
    },
    productState: {
      userId: "user-A",
      routines: {}
    }
  };
  const h = harness({ responses: [partial] });

  const one = h.sync.recordCompletion({
    routineId: "collagen-30",
    day: 2,
    completedAt: 1_799_999_000_000
  });
  h.sync.recordCompletion({
    routineId: "lumispa-10",
    day: 2,
    completedAt: 1_799_999_000_000
  });

  partial.ackedIds = [one.id];

  await h.sync.flush("test");

  const remaining = h.sync.pendingForCurrentUser();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].routineId, "lumispa-10");
});

test("network failure never deletes pending progress and schedules bounded retry", async () => {
  const h = harness({
    responses: [
      new Error("synthetic network failure"),
      null
    ]
  });

  h.sync.recordCompletion({
    routineId: "collagen-30",
    day: 5,
    completedAt: 1_799_999_000_000
  });

  await h.sync.flush("initial");

  assert.equal(h.sync.pendingForCurrentUser().length, 1);
  assert.ok(h.sync.inspect().retryAt !== null);

  await h.advance(2000);

  assert.equal(h.sync.pendingForCurrentUser().length, 0);
  assert.equal(h.sent.length, 2);
});

test("canonical snapshots cannot hide a completion that is still pending locally", () => {
  const h = harness();

  h.sync.recordCompletion({
    routineId: "collagen-30",
    day: 6,
    completedAt: 1_799_999_000_000
  });
  h.sync.recordCompletion({
    routineId: "galvanicspa-10",
    day: 4,
    completedAt: 1_799_999_000_000
  });

  assert.equal(
    h.sync.isCompletionPending("collagen-30", 6),
    true
  );
  assert.equal(
    h.sync.isCompletionPending("galvanicspa-10", 4),
    true
  );
  assert.equal(
    h.sync.isCompletionPending("wellspa-10", 4),
    false
  );
});

test("offline queue survives until an online resume requests a flush", async () => {
  const h = harness();
  h.setOnline(false);

  h.sync.recordCompletion({
    routineId: "wellspa-10",
    day: 2,
    completedAt: 1_799_999_000_000
  });

  await h.sync.flush("offline");
  assert.equal(h.sent.length, 0);
  assert.equal(h.sync.pendingForCurrentUser().length, 1);

  h.setOnline(true);
  await h.sync.onResume("online");

  assert.equal(h.sent.length, 1);
  assert.equal(h.sync.pendingForCurrentUser().length, 0);
});


test("explicit reconcile sends an empty batch and publishes canonical state", async () => {
  const h = harness();

  await h.sync.reconcile("bootstrap-failed");

  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.sent[0].operations, []);
  assert.equal(
    h.published.some(([type]) => type === "canonical"),
    true
  );
  assert.equal(h.sync.inspect().reconcileRequested, false);
});

test("failed empty reconciliation retries without requiring an outbox item", async () => {
  const h = harness({
    responses: [
      new Error("cold start"),
      null
    ]
  });

  await h.sync.reconcile("bootstrap-failed");

  assert.equal(h.sync.inspect().reconcileRequested, true);
  assert.ok(h.sync.inspect().retryAt !== null);

  await h.advance(2000);

  assert.equal(h.sent.length, 2);
  assert.equal(h.sync.inspect().reconcileRequested, false);
});


test("legacy migration collects only current-day completion evidence", () => {
  const storage = memoryStorage({
    routineState: JSON.stringify({ currentDay: 4 }),
    day3Complete: "1",
    day3CompletedAt: "1700000000000",
    day4Complete: "1",
    day4CompletedAt: "1800000000000",
    "routineState:lumispa-10": JSON.stringify({ currentDay: 3 }),
    "day:lumispa-10:2:complete": "1",
    "day:lumispa-10:2:completedAt": "1700000000000",
    "day:lumispa-10:3:complete": "1",
    "day:lumispa-10:3:completedAt": "1800000000100"
  });

  const operations =
    collectLegacyCurrentCompletionsV1(
      storage,
      "legacy-user"
    );

  assert.deepEqual(
    operations.map(operation => ({
      routineId: operation.routineId,
      day: operation.day
    })),
    [
      { routineId: "collagen-30", day: 4 },
      { routineId: "lumispa-10", day: 3 }
    ]
  );
});

test("legacy migration ignores completion flags without a timestamp", () => {
  const storage = memoryStorage({
    routineState: JSON.stringify({ currentDay: 2 }),
    day2Complete: "1"
  });

  assert.deepEqual(
    collectLegacyCurrentCompletionsV1(
      storage,
      "legacy-user"
    ),
    []
  );
});


test("outbox survives controller recreation with the same storage", () => {
  const storage = memoryStorage();

  const first = createRoutineProgressSyncV1({
    storage,
    getUserId: () => "reload-user",
    transport: async () => ({
      ackedIds: [],
      canonicalState: null,
      productState: null
    })
  });

  first.recordCompletion({
    routineId: "collagen-30",
    day: 7,
    completedAt: 1_800_000_000_000
  });

  const second = createRoutineProgressSyncV1({
    storage,
    getUserId: () => "reload-user",
    transport: async () => ({
      ackedIds: [],
      canonicalState: null,
      productState: null
    })
  });

  assert.equal(second.pendingForCurrentUser().length, 1);
  assert.equal(second.pendingForCurrentUser()[0].day, 7);
});

test("UI no longer uses fire-and-forget completion endpoints", () => {
  const daily = fs.readFileSync(
    path.join(__dirname, "..", "daily-view.js"),
    "utf8"
  );
  const state = fs.readFileSync(
    path.join(__dirname, "..", "routine-state.js"),
    "utf8"
  );

  assert.doesNotMatch(daily, /\.completeDay\s*\(/);
  assert.doesNotMatch(state, /completeProductRoutineDay\s*\(/);
  assert.match(state, /queueRoutineCompletion\s*\(/);
});

test("canonical merge protects explicitly pending outbox operations", () => {
  const sync = fs.readFileSync(
    path.join(__dirname, "..", "routine-sync.js"),
    "utf8"
  );

  assert.match(
    sync,
    /isRoutineCompletionPending[\s\S]*?collagen-30/
  );
  assert.match(
    sync,
    /isRoutineCompletionPending[\s\S]*?routineId/
  );
});


test("startup and product bootstrap failures route through durable reconciliation", () => {
  const backend = fs.readFileSync(
    path.join(__dirname, "..", "backend-client.js"),
    "utf8"
  );

  assert.match(
    backend,
    /requestWithTimeoutV1\(\s*"\/api\/bootstrap"/
  );
  assert.match(
    backend,
    /requestWithTimeoutV1\(\s*"\/api\/product-routines\/bootstrap"/
  );
  assert.match(
    backend,
    /reconcile\(\s*"bootstrap-failed"\s*\)/
  );
  assert.match(
    backend,
    /reconcile\(\s*"product-bootstrap-failed"\s*\)/
  );
});
