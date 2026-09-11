"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildNotificationPoolOptionsV1,
  readNotificationWorkerConfigV1
} = require("../notification-worker-config-v1");
const {
  classifyRoutineJobsV1,
  summarizeDecisionsV1
} = require("../notification-eligibility-v1");
const {
  groupByUser,
  runNotificationWorkerV1
} = require("../notification-worker-core-v1");
const { buildRoutinePayloadV1 } = require("../notification-worker-store-v1");
const { createWebPushTransportV1 } = require("../web-push-transport-v1");

const NOW = Date.parse("2026-09-10T19:00:00.000Z");

function baseConfig(overrides = {}) {
  return {
    dryRun: true,
    runBudgetMs: 20000,
    maxPerRun: 100,
    ttlHours: 24,
    concurrency: 5,
    maxAttempts: 5,
    retryBaseMs: 60000,
    canaryUserId: null,
    ...overrides
  };
}

function row(overrides = {}) {
  return {
    source_table: "notification_jobs",
    id: 1,
    user_id: "user-a",
    routine_id: null,
    cycle: 1,
    day: 2,
    kind: "day_available",
    created_at: "2026-09-10T18:30:00.000Z",
    scheduled_for: null,
    due_at: "2026-09-10T18:30:00.000Z",
    ...overrides
  };
}

test("audit es el modo predeterminado y no habilita envíos", () => {
  const config = readNotificationWorkerConfigV1(
    { DATABASE_URL: "postgres://isolated/test" },
    []
  );
  assert.equal(config.command, "audit");
  assert.equal(config.dryRun, true);
  assert.equal(config.enabled, false);
  assert.equal(config.pushSendEnabled, false);
});

test("consume exige habilitación, envío y VAPID explícitos", () => {
  assert.throws(
    () => readNotificationWorkerConfigV1(
      { DATABASE_URL: "postgres://isolated/test" },
      ["consume"]
    ),
    /NOTIFICATION_WORKER_ENABLED/
  );
  assert.throws(
    () => readNotificationWorkerConfigV1(
      {
        DATABASE_URL: "postgres://isolated/test",
        NOTIFICATION_WORKER_ENABLED: "true"
      },
      ["consume"]
    ),
    /PUSH_SEND_ENABLED/
  );
});

test("un flag dry-run prevalece incluso sobre consume", () => {
  const config = readNotificationWorkerConfigV1(
    {
      DATABASE_URL: "postgres://isolated/test",
      NOTIFICATION_WORKER_DRY_RUN: "true"
    },
    ["consume"]
  );
  assert.equal(config.dryRun, true);
});

test("acepta un usuario canario explícito y rechaza identificadores inseguros", () => {
  const config = readNotificationWorkerConfigV1({
    DATABASE_URL: "postgres://isolated/test",
    NOTIFICATION_CANARY_USER_ID: "user-canary"
  }, ["audit"]);
  assert.equal(config.canaryUserId, "user-canary");
  assert.throws(
    () => readNotificationWorkerConfigV1({
      DATABASE_URL: "postgres://isolated/test",
      NOTIFICATION_CANARY_USER_ID: "bad\nuser"
    }, ["audit"]),
    /CANARY_USER_ID inválido/
  );
});

test("el timeout Web Push debe vencer antes que la recuperación stale", () => {
  const config = readNotificationWorkerConfigV1(
    { DATABASE_URL: "postgres://isolated/test" },
    ["audit"]
  );
  assert.ok(config.pushTimeoutMs < config.staleMs);
  assert.throws(
    () => readNotificationWorkerConfigV1({
      DATABASE_URL: "postgres://isolated/test",
      NOTIFICATION_PUSH_TIMEOUT_MS: "30001"
    }, ["audit"]),
    /entre 1000 y 30000/
  );
});

test("el transporte aplica el timeout configurado a Web Push", async () => {
  let options;
  const webpush = {
    setVapidDetails() {},
    async sendNotification(_subscription, _payload, received) { options = received; }
  };
  const transport = createWebPushTransportV1({
    webpush,
    config: {
      vapidSubject: "mailto:ops@example.com",
      vapidPublicKey: "public",
      vapidPrivateKey: "private",
      pushTimeoutMs: 12345
    }
  });
  await transport.send({ endpoint: "https://push.example" }, { title: "test" });
  assert.deepEqual(options, { timeout: 12345 });
});

test("audit obliga a PostgreSQL a rechazar cualquier escritura", () => {
  const audit = buildNotificationPoolOptionsV1({
    databaseUrl: "postgres://isolated/test",
    dryRun: true
  });
  const consume = buildNotificationPoolOptionsV1({
    databaseUrl: "postgres://isolated/test",
    dryRun: false
  });
  assert.equal(audit.options, "-c default_transaction_read_only=on");
  assert.equal(Object.hasOwn(consume, "options"), false);
});

test("clasifica backlog viejo, futuros y filas inválidas sin volverlos elegibles", () => {
  const decisions = classifyRoutineJobsV1([
    row({ id: 1, created_at: "2026-09-08T18:00:00.000Z", due_at: "2026-09-08T18:00:00.000Z" }),
    row({ id: 2, due_at: "2026-09-10T20:00:00.000Z" }),
    row({ id: null }),
    row({ id: 4 })
  ], { now: NOW, ttlHours: 24 });
  assert.deepEqual(summarizeDecisionsV1(decisions), {
    total: 4,
    eligible: 1,
    expired: 1,
    superseded: 0,
    not_due: 1,
    manual_review: 1
  });
});

test("conserva solo el trabajo más nuevo por rutina, ciclo y tipo", () => {
  const decisions = classifyRoutineJobsV1([
    row({ id: 1, day: 2, created_at: "2026-09-10T17:00:00.000Z", due_at: "2026-09-10T17:00:00.000Z" }),
    row({ id: 2, day: 3, created_at: "2026-09-10T18:00:00.000Z", due_at: "2026-09-10T18:00:00.000Z" })
  ], { now: NOW, ttlHours: 24 });
  assert.equal(decisions.find(item => item.row.id === 1).outcome, "superseded");
  assert.equal(decisions.find(item => item.row.id === 2).outcome, "eligible");
});

test("rutinas diferentes del mismo usuario forman un solo batch", () => {
  const groups = groupByUser([
    row({ id: 1 }),
    row({ source_table: "routine_notification_jobs", id: 2, routine_id: "lumispa-10" })
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].collagen.length, 1);
  assert.equal(groups[0].products.length, 1);
});

test("dry-run solo lee y jamás toma lock, escribe o envía", async () => {
  const calls = [];
  const store = {
    async listOpenRoutineJobs() { calls.push("read"); return [row()]; },
    async withRunLock() { calls.push("lock"); throw new Error("no debe ejecutarse"); }
  };
  const transport = { async send() { calls.push("send"); } };
  const summary = await runNotificationWorkerV1({
    store,
    transport,
    config: baseConfig(),
    now: () => NOW
  });
  assert.deepEqual(calls, ["read"]);
  assert.equal(summary.eligible, undefined);
  assert.equal(summary.classification.eligible, 1);
  assert.equal(summary.writes, 0);
  assert.equal(summary.pushAttempts, 0);
});

test("el modo canario limita la lectura al usuario configurado", async () => {
  let receivedUserId;
  const store = {
    async listOpenRoutineJobs(_limit, canaryUserId) {
      receivedUserId = canaryUserId;
      return [row({ user_id: canaryUserId })];
    },
    async withRunLock() { throw new Error("dry-run no toma lock"); }
  };
  const summary = await runNotificationWorkerV1({
    store,
    transport: { async send() { throw new Error("dry-run no envía"); } },
    config: baseConfig({ canaryUserId: "user-canary" }),
    now: () => NOW
  });
  assert.equal(receivedUserId, "user-canary");
  assert.equal(summary.scope, "canary");
  assert.equal(summary.classification.eligible, 1);
});

test("un segundo worker sin advisory lock sale sin reclamar", async () => {
  const calls = [];
  const store = {
    async listOpenRoutineJobs() { calls.push("read"); return [row()]; },
    async withRunLock(callback) { return callback(false); },
    async persistTerminalDecisions() { calls.push("terminal"); },
    async claimSourceBatch() { calls.push("claim"); }
  };
  const summary = await runNotificationWorkerV1({
    store,
    transport: { async send() {} },
    config: baseConfig({ dryRun: false }),
    now: () => NOW
  });
  assert.equal(summary.locked, false);
  assert.deepEqual(calls, []);
});

test("el contrato de lock cubre el callback asíncrono completo", async () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "notification-worker-store-v1.js"),
    "utf8"
  );
  assert.match(source, /return await callback\(locked\)/);
});

test("consume persiste descarte antes de reclamar y procesa una vez", async () => {
  const calls = [];
  const current = row({ id: 2 });
  const old = row({ id: 1, created_at: "2026-09-08T18:00:00.000Z", due_at: "2026-09-08T18:00:00.000Z" });
  const store = {
    async listOpenRoutineJobs() { calls.push(["read"]); return [old, current]; },
    async withRunLock(callback) { return callback(true); },
    async recoverStaleWork() { calls.push(["recover"]); },
    async persistTerminalDecisions(items) { calls.push(["terminal", items.map(x => x.outcome)]); },
    async claimSourceBatch(batch) { calls.push(["claim", batch.userId]); return batch; },
    async processClaimedBatch() { calls.push(["process"]); return { outcome: "sent", pushAttempts: 1 }; }
  };
  const summary = await runNotificationWorkerV1({
    store,
    transport: { async send() {} },
    config: baseConfig({ dryRun: false }),
    now: () => NOW
  });
  assert.deepEqual(calls, [
    ["recover"],
    ["read"],
    ["terminal", ["expired"]],
    ["claim", "user-a"],
    ["process"]
  ]);
  assert.equal(summary.sentBatches, 1);
  assert.equal(summary.pushAttempts, 1);
});

test("payload conserva navegación y no incorpora secretos", () => {
  const payload = buildRoutinePayloadV1({
    userId: "user-secret",
    collagen: [{ id: 1, day: 7 }],
    products: []
  });
  assert.match(payload.title, /Día 7 de Collagen\+/);
  assert.equal(payload.url, "/?routine=collagen-30&day=7&notification=1");
  assert.equal(JSON.stringify(payload).includes("user-secret"), true);
  assert.equal(Object.hasOwn(payload, "subscription"), false);
});

test("el store no contiene SQL de progreso o avance", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "notification-worker-store-v1.js"),
    "utf8"
  );
  assert.doesNotMatch(source, /\bUPDATE\s+users\b/i);
  assert.doesNotMatch(source, /\bINSERT\s+INTO\s+(?:day_progress|product_routine_day_progress)\b/i);
  assert.doesNotMatch(source, /advanceIfEligible|enqueueDueUnlocks|advanceProductRoutinesIfEligible/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
});
