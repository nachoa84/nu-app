"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const DATABASE_URL = process.env.TEST_DATABASE_URL || "";

if (!DATABASE_URL) {
  test("PostgreSQL aislado requerido", { skip: true }, () => {});
} else {
  const { Pool } = require("pg");
  const { runNotificationWorkerV1 } = require("../notification-worker-core-v1");
  const { createNotificationWorkerStoreV1 } = require("../notification-worker-store-v1");

  const pool = new Pool({ connectionString: DATABASE_URL, max: 8 });
  const config = {
    dryRun: false,
    runBudgetMs: 20000,
    maxPerRun: 100,
    ttlHours: 24,
    concurrency: 5,
    maxAttempts: 5,
    retryBaseMs: 30000,
    staleMs: 60000
  };

  async function schema() {
    await pool.query(`
      DROP TABLE IF EXISTS notification_deliveries;
      DROP TABLE IF EXISTS notification_delivery_sources;
      DROP TABLE IF EXISTS notification_delivery_batches;
      DROP TABLE IF EXISTS routine_notification_jobs;
      DROP TABLE IF EXISTS notification_jobs;
      DROP TABLE IF EXISTS push_subscriptions;
      DROP TABLE IF EXISTS users;

      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE push_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        subscription JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE notification_jobs (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cycle INTEGER NOT NULL DEFAULT 1,
        day INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'day_available',
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ,
        UNIQUE (user_id, cycle, day, kind)
      );
      CREATE TABLE routine_notification_jobs (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        routine_id TEXT NOT NULL,
        cycle INTEGER NOT NULL DEFAULT 1,
        day INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'day_available',
        scheduled_for TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ,
        UNIQUE (user_id, routine_id, cycle, day, kind)
      );
      CREATE TABLE notification_delivery_batches (
        logical_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ
      );
      CREATE TABLE notification_delivery_sources (
        logical_key TEXT NOT NULL REFERENCES notification_delivery_batches(logical_key) ON DELETE CASCADE,
        source_table TEXT NOT NULL,
        source_id BIGINT NOT NULL,
        PRIMARY KEY (logical_key, source_table, source_id),
        UNIQUE (source_table, source_id)
      );
      CREATE TABLE notification_deliveries (
        id BIGSERIAL PRIMARY KEY,
        logical_key TEXT NOT NULL REFERENCES notification_delivery_batches(logical_key) ON DELETE CASCADE,
        subscription_id BIGINT REFERENCES push_subscriptions(id) ON DELETE SET NULL,
        endpoint_hash TEXT NOT NULL,
        subscription_snapshot JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processing_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ,
        UNIQUE (logical_key, endpoint_hash)
      );
    `);
  }

  async function seedUser(userId = "worker-user") {
    await pool.query("INSERT INTO users (id) VALUES ($1)", [userId]);
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, subscription)
       VALUES ($1, $2, $3::jsonb)`,
      [userId, `https://push.example/${userId}`, JSON.stringify({ endpoint: `https://push.example/${userId}`, keys: { p256dh: "x", auth: "y" } })]
    );
  }

  test.before(async () => { await schema(); });
  test.after(async () => { await pool.end(); });
  test.beforeEach(async () => {
    await pool.query(`
      TRUNCATE notification_deliveries, notification_delivery_sources,
        notification_delivery_batches, routine_notification_jobs,
        notification_jobs, push_subscriptions, users RESTART IDENTITY CASCADE
    `);
  });

  test("dry-run clasifica sin modificar colas ni ledger", async () => {
    await seedUser();
    await pool.query(
      `INSERT INTO notification_jobs (user_id, day, created_at, updated_at)
       VALUES ('worker-user', 2, NOW() - INTERVAL '48 hours', NOW() - INTERVAL '48 hours'),
              ('worker-user', 3, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour')`
    );
    const store = createNotificationWorkerStoreV1({ pool, config });
    const summary = await runNotificationWorkerV1({
      store,
      transport: { async send() { throw new Error("dry-run must not send"); } },
      config: { ...config, dryRun: true }
    });
    assert.equal(summary.classification.expired, 1);
    assert.equal(summary.classification.eligible, 1);
    const sources = await pool.query("SELECT status, attempts FROM notification_jobs ORDER BY day");
    assert.deepEqual(sources.rows, [
      { status: "pending", attempts: 0 },
      { status: "pending", attempts: 0 }
    ]);
    const ledger = await pool.query("SELECT COUNT(*)::integer AS count FROM notification_deliveries");
    assert.equal(ledger.rows[0].count, 0);
  });

  test("consume crea ledger y confirma exactamente una entrega", async () => {
    await seedUser();
    await pool.query(
      `INSERT INTO notification_jobs (user_id, day, created_at, updated_at)
       VALUES ('worker-user', 7, NOW() - INTERVAL '1 minute', NOW() - INTERVAL '1 minute')`
    );
    let sends = 0;
    const store = createNotificationWorkerStoreV1({ pool, config });
    const summary = await runNotificationWorkerV1({
      store,
      transport: { async send() { sends += 1; } },
      config
    });
    assert.equal(sends, 1);
    assert.equal(summary.sentBatches, 1);
    const source = await pool.query("SELECT status, attempts FROM notification_jobs");
    assert.deepEqual(source.rows, [{ status: "sent", attempts: 1 }]);
    const delivery = await pool.query("SELECT status, attempts FROM notification_deliveries");
    assert.deepEqual(delivery.rows, [{ status: "sent", attempts: 1 }]);
  });

  test("dos workers simultáneos no duplican el push", async () => {
    await seedUser();
    await pool.query(
      `INSERT INTO notification_jobs (user_id, day, created_at, updated_at)
       VALUES ('worker-user', 4, NOW() - INTERVAL '1 minute', NOW() - INTERVAL '1 minute')`
    );
    let releaseSend;
    let sendStarted;
    const started = new Promise(resolve => { sendStarted = resolve; });
    const blocked = new Promise(resolve => { releaseSend = resolve; });
    let sends = 0;
    const transport = {
      async send() {
        sends += 1;
        sendStarted();
        await blocked;
      }
    };
    const firstStore = createNotificationWorkerStoreV1({ pool, config });
    const secondStore = createNotificationWorkerStoreV1({ pool, config });
    const first = runNotificationWorkerV1({ store: firstStore, transport, config });
    await started;
    const second = await runNotificationWorkerV1({ store: secondStore, transport, config });
    assert.equal(second.locked, false);
    releaseSend();
    await first;
    assert.equal(sends, 1);
  });

  test("410 retira solo la suscripción vencida y no reintenta", async () => {
    await seedUser();
    await pool.query(
      `INSERT INTO notification_jobs (user_id, day, created_at, updated_at)
       VALUES ('worker-user', 5, NOW() - INTERVAL '1 minute', NOW() - INTERVAL '1 minute')`
    );
    const store = createNotificationWorkerStoreV1({ pool, config });
    await runNotificationWorkerV1({
      store,
      transport: { async send() { throw Object.assign(new Error("gone"), { statusCode: 410 }); } },
      config
    });
    const subscriptions = await pool.query("SELECT COUNT(*)::integer AS count FROM push_subscriptions");
    const deliveries = await pool.query("SELECT status FROM notification_deliveries");
    assert.equal(subscriptions.rows[0].count, 0);
    assert.deepEqual(deliveries.rows, [{ status: "permanent" }]);
  });
}
