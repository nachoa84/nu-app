"use strict";

const {
  attachDeliveryIdentityV111,
  classifyPushErrorV111,
  endpointHashV111,
  logicalDeliveryKeyV111,
  retryDelayMsV111,
  summarizeDeliveryRowsV111
} = require("./notification-delivery-v111");

const WORKER_ADVISORY_LOCK_V1 = 2026091001;
const ROUTINE_NAMES = {
  "collagen-30": "Collagen+",
  "lumispa-10": "LumiSpa",
  "wellspa-10": "WellSpa",
  "galvanicspa-10": "Galvanic Spa"
};

function buildRoutinePayloadV1(batch) {
  const entries = [
    ...batch.collagen.map(row => ({ routineId: "collagen-30", day: Number(row.day) })),
    ...batch.products.map(row => ({ routineId: row.routine_id, day: Number(row.day) }))
  ];
  const unique = [];
  const seen = new Set();
  for (const entry of entries) {
    const key = `${entry.routineId}:${entry.day}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(entry);
    }
  }
  if (unique.length === 1) {
    const entry = unique[0];
    const name = ROUTINE_NAMES[entry.routineId] || "tu rutina";
    return {
      title: `🔥 Tu Día ${entry.day} de ${name} está disponible`,
      body: "Entrá y descubrí tu acción de hoy.",
      url: `/?routine=${encodeURIComponent(entry.routineId)}&day=${entry.day}&notification=1`,
      tag: `routine_daily_${batch.userId}`
    };
  }
  const routines = [...new Set(unique.map(entry => ROUTINE_NAMES[entry.routineId] || "Rutina"))];
  return {
    title: `🔥 Tenés contenido nuevo en ${routines.length} rutinas`,
    body: `Continuá con ${routines.join(", ")}.`,
    url: "/?routineNotifications=1",
    tag: `routine_daily_${batch.userId}`
  };
}

function safeError(error) {
  return String(error?.message || error || "Error Web Push.").slice(0, 500);
}

function createNotificationWorkerStoreV1({ pool, config }) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new Error("Pool PostgreSQL inválido.");
  }

  async function transaction(callback) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function withRunLock(callback) {
    const client = await pool.connect();
    let locked = false;
    try {
      const result = await client.query(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [WORKER_ADVISORY_LOCK_V1]
      );
      locked = result.rows[0]?.locked === true;
      // El await es deliberado: mantiene la misma sesión PostgreSQL y su
      // advisory lock durante toda la ejecución asíncrona del worker.
      return await callback(locked);
    } finally {
      if (locked) {
        await client.query("SELECT pg_advisory_unlock($1)", [WORKER_ADVISORY_LOCK_V1]);
      }
      client.release();
    }
  }

  async function listOpenRoutineJobs(limit, canaryUserId = null) {
    const result = await pool.query(
      `SELECT *
       FROM (
         SELECT
           'notification_jobs'::text AS source_table,
           id, user_id, NULL::text AS routine_id, cycle, day, kind,
           status, attempts, created_at, NULL::timestamptz AS scheduled_for,
           created_at AS due_at, updated_at
         FROM notification_jobs
         WHERE attempts < $1
           AND ($4::text IS NULL OR user_id = $4)
           AND (
             status = 'pending'
             OR (
               status = 'failed'
               AND updated_at <= NOW() -
                 (POWER(2, GREATEST(attempts - 1, 0)) * $2 * INTERVAL '1 millisecond')
             )
           )
         UNION ALL
         SELECT
           'routine_notification_jobs'::text AS source_table,
           id, user_id, routine_id, cycle, day, kind,
           status, attempts, created_at, scheduled_for,
           scheduled_for AS due_at, updated_at
         FROM routine_notification_jobs
         WHERE attempts < $1
           AND ($4::text IS NULL OR user_id = $4)
           AND scheduled_for <= NOW()
           AND (
             status = 'pending'
             OR (
               status = 'failed'
               AND updated_at <= NOW() -
                 (POWER(2, GREATEST(attempts - 1, 0)) * $2 * INTERVAL '1 millisecond')
             )
           )
       ) AS open_jobs
       ORDER BY due_at, source_table, id
       LIMIT $3`,
      [config.maxAttempts, config.retryBaseMs, limit, canaryUserId]
    );
    return result.rows;
  }

  async function persistTerminalDecisions(decisions) {
    const allowed = new Set(["expired", "superseded", "manual_review"]);
    for (const decision of decisions) {
      if (!allowed.has(decision.outcome)) continue;
      const table = decision.row.source_table;
      if (!new Set(["notification_jobs", "routine_notification_jobs"]).has(table)) {
        continue;
      }
      await pool.query(
        `UPDATE ${table}
         SET status = 'failed', attempts = $2, last_error = $3, updated_at = NOW()
         WHERE id = $1 AND status IN ('pending', 'failed')`,
        [Number(decision.row.id), config.maxAttempts, `worker_v1:${decision.reason}`]
      );
    }
  }

  async function claimRows(client, table, rows) {
    const ids = rows.map(row => Number(row.id)).filter(Number.isInteger);
    if (!ids.length) return [];
    const dueClause = table === "routine_notification_jobs"
      ? "AND scheduled_for <= NOW()"
      : "";
    const result = await client.query(
      `WITH candidates AS (
         SELECT id
         FROM ${table}
         WHERE id = ANY($1::bigint[])
           AND attempts < $2
           AND status IN ('pending', 'failed')
           ${dueClause}
         ORDER BY id
         FOR UPDATE SKIP LOCKED
       )
       UPDATE ${table} AS source
       SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
       FROM candidates
       WHERE source.id = candidates.id
       RETURNING source.*`,
      [ids, config.maxAttempts]
    );
    return result.rows;
  }

  async function claimSourceBatch(batch) {
    return transaction(async client => ({
      userId: batch.userId,
      collagen: await claimRows(client, "notification_jobs", batch.collagen),
      products: await claimRows(client, "routine_notification_jobs", batch.products)
    }));
  }

  async function prepareDeliveries(batch, payload) {
    const logicalKey = logicalDeliveryKeyV111(batch);
    const identified = attachDeliveryIdentityV111(payload, logicalKey);
    const sources = [
      ...batch.collagen.map(row => ({ table: "notification_jobs", id: row.id })),
      ...batch.products.map(row => ({ table: "routine_notification_jobs", id: row.id }))
    ];
    return transaction(async client => {
      const inserted = await client.query(
        `INSERT INTO notification_delivery_batches (
           logical_key, user_id, payload, status, updated_at
         ) VALUES ($1, $2, $3::jsonb, 'pending', NOW())
         ON CONFLICT (logical_key) DO NOTHING
         RETURNING payload`,
        [logicalKey, batch.userId, JSON.stringify(identified)]
      );
      let storedPayload = identified;
      if (!inserted.rowCount) {
        const existing = await client.query(
          "SELECT payload FROM notification_delivery_batches WHERE logical_key = $1",
          [logicalKey]
        );
        storedPayload = existing.rows[0]?.payload || identified;
      }
      for (const source of sources) {
        await client.query(
          `INSERT INTO notification_delivery_sources (logical_key, source_table, source_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (source_table, source_id) DO NOTHING`,
          [logicalKey, source.table, source.id]
        );
      }
      if (inserted.rowCount) {
        const subscriptions = await client.query(
          `SELECT id, endpoint, subscription
           FROM push_subscriptions
           WHERE user_id = $1
           ORDER BY id`,
          [batch.userId]
        );
        for (const row of subscriptions.rows) {
          await client.query(
            `INSERT INTO notification_deliveries (
               logical_key, subscription_id, endpoint_hash,
               subscription_snapshot, status, next_attempt_at, updated_at
             ) VALUES ($1, $2, $3, $4::jsonb, 'pending', NOW(), NOW())
             ON CONFLICT (logical_key, endpoint_hash) DO NOTHING`,
            [logicalKey, row.id, endpointHashV111(row.endpoint), JSON.stringify(row.subscription)]
          );
        }
      }
      const count = await client.query(
        "SELECT COUNT(*)::integer AS count FROM notification_deliveries WHERE logical_key = $1",
        [logicalKey]
      );
      return { logicalKey, payload: storedPayload, subscriptions: Number(count.rows[0].count) };
    });
  }

  async function partitionClaimedBatch(batch) {
    const collagenIds = batch.collagen.map(row => Number(row.id));
    const productIds = batch.products.map(row => Number(row.id));
    const existing = await pool.query(
      `SELECT source_table, source_id, logical_key
       FROM notification_delivery_sources
       WHERE (
         source_table = 'notification_jobs'
         AND source_id = ANY($1::bigint[])
       ) OR (
         source_table = 'routine_notification_jobs'
         AND source_id = ANY($2::bigint[])
       )`,
      [collagenIds, productIds]
    );
    const assigned = new Map(existing.rows.map(row => [
      `${row.source_table}:${row.source_id}`,
      row.logical_key
    ]));
    const groups = new Map();
    function add(key, type, row) {
      if (!groups.has(key)) {
        groups.set(key, { userId: batch.userId, collagen: [], products: [] });
      }
      groups.get(key)[type].push(row);
    }
    for (const row of batch.collagen) {
      add(assigned.get(`notification_jobs:${row.id}`) || "unassigned", "collagen", row);
    }
    for (const row of batch.products) {
      add(assigned.get(`routine_notification_jobs:${row.id}`) || "unassigned", "products", row);
    }
    return [...groups.values()];
  }

  async function recoverStaleWork() {
    const seconds = Math.ceil(config.staleMs / 1000);
    return transaction(async client => {
      let recoveredSources = 0;
      for (const table of ["notification_jobs", "routine_notification_jobs"]) {
        const result = await client.query(
          `UPDATE ${table}
           SET status = CASE WHEN attempts < $2 THEN 'pending' ELSE 'failed' END,
               attempts = LEAST(attempts, $2),
               last_error = 'worker_v1:stale_processing', updated_at = NOW()
           WHERE status = 'processing'
             AND updated_at <= NOW() - make_interval(secs => $1)`,
          [seconds, config.maxAttempts]
        );
        recoveredSources += result.rowCount;
      }
      const deliveries = await client.query(
        `UPDATE notification_deliveries
         SET status = CASE WHEN attempts < $2 THEN 'retryable' ELSE 'permanent' END,
             last_error = 'worker_v1:stale_processing', processing_at = NULL,
             next_attempt_at = NOW(), updated_at = NOW()
         WHERE status = 'processing'
           AND processing_at <= NOW() - make_interval(secs => $1)`,
        [seconds, config.maxAttempts]
      );
      return { sources: recoveredSources, deliveries: deliveries.rowCount };
    });
  }

  async function claimDeliveries(logicalKey) {
    return transaction(async client => {
      const result = await client.query(
        `WITH candidates AS (
           SELECT id FROM notification_deliveries
           WHERE logical_key = $1
             AND attempts < $2
             AND next_attempt_at <= NOW()
             AND status IN ('pending', 'retryable')
           ORDER BY id
           FOR UPDATE SKIP LOCKED
         )
         UPDATE notification_deliveries AS delivery
         SET status = 'processing', attempts = attempts + 1,
             processing_at = NOW(), updated_at = NOW()
         FROM candidates
         WHERE delivery.id = candidates.id
         RETURNING delivery.*`,
        [logicalKey, config.maxAttempts]
      );
      return result.rows;
    });
  }

  async function markDelivery(delivery, status, error = null, retryAt = null, preserve = false) {
    await pool.query(
      `UPDATE notification_deliveries
       SET status = $2, last_error = $3,
           next_attempt_at = COALESCE($4, next_attempt_at),
           attempts = CASE WHEN $5 THEN GREATEST(attempts - 1, 0) ELSE attempts END,
           processing_at = NULL,
           sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
           updated_at = NOW()
       WHERE id = $1 AND status = 'processing' AND attempts = $6`,
      [delivery.id, status, error, retryAt, preserve, delivery.attempts]
    );
  }

  async function sendDelivery(delivery, payload, transport) {
    const active = delivery.subscription_id
      ? await pool.query(
          `SELECT 1 FROM push_subscriptions
           WHERE id = $1 AND subscription = $2::jsonb`,
          [delivery.subscription_id, JSON.stringify(delivery.subscription_snapshot)]
        )
      : { rowCount: 0 };
    if (!active.rowCount) {
      await markDelivery(delivery, "permanent", "worker_v1:inactive_subscription");
      return "permanent";
    }
    try {
      await transport.send(delivery.subscription_snapshot, payload);
      await markDelivery(delivery, "sent");
      return "sent";
    } catch (error) {
      const classification = classifyPushErrorV111(error);
      const reason = safeError(error);
      if (classification.kind === "expired") {
        await pool.query(
          `DELETE FROM push_subscriptions
           WHERE id = $1 AND subscription = $2::jsonb`,
          [delivery.subscription_id, JSON.stringify(delivery.subscription_snapshot)]
        );
        await markDelivery(delivery, "permanent", reason);
        return "permanent";
      }
      if (classification.kind === "configuration") {
        await markDelivery(
          delivery,
          "retryable",
          `configuration_blocked:${reason}`,
          new Date(Date.now() + config.retryBaseMs),
          true
        );
        return "retryable";
      }
      if (classification.kind === "retryable" && delivery.attempts < config.maxAttempts) {
        await markDelivery(
          delivery,
          "retryable",
          reason,
          new Date(Date.now() + retryDelayMsV111(delivery.attempts, config.retryBaseMs))
        );
        return "retryable";
      }
      await markDelivery(delivery, "permanent", reason);
      return "permanent";
    }
  }

  async function markSources(batch, status, reason = null, permanent = false) {
    for (const [table, rows] of [
      ["notification_jobs", batch.collagen],
      ["routine_notification_jobs", batch.products]
    ]) {
      const ids = rows.map(row => Number(row.id));
      if (!ids.length) continue;
      await pool.query(
        `UPDATE ${table}
         SET status = $2, last_error = $3,
             attempts = CASE WHEN $4 THEN $5 ELSE attempts END,
             sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
             updated_at = NOW()
         WHERE id = ANY($1::bigint[]) AND status = 'processing'`,
        [ids, status, reason, permanent, config.maxAttempts]
      );
    }
  }

  async function processDeliveryGroup(batch, transport) {
    try {
      const prepared = await prepareDeliveries(batch, buildRoutinePayloadV1(batch));
      if (!prepared.subscriptions) {
        await markSources(batch, "failed", "worker_v1:no_subscriptions", true);
        return { outcome: "permanent", pushAttempts: 0 };
      }
      const deliveries = await claimDeliveries(prepared.logicalKey);
      const outcomes = [];
      for (const delivery of deliveries) {
        outcomes.push(await sendDelivery(delivery, prepared.payload, transport));
      }
      const states = await pool.query(
        "SELECT status FROM notification_deliveries WHERE logical_key = $1",
        [prepared.logicalKey]
      );
      const summary = summarizeDeliveryRowsV111(states.rows);
      const batchStatus = summary.open > 0 ? "pending" : summary.sent > 0 ? "sent" : "failed";
      await pool.query(
        `UPDATE notification_delivery_batches
         SET status = $2, last_error = $3,
             sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
             updated_at = NOW()
         WHERE logical_key = $1`,
        [prepared.logicalKey, batchStatus, summary.permanent ? `${summary.permanent} permanent` : null]
      );
      if (summary.open > 0) {
        await markSources(batch, "failed", "worker_v1:delivery_retry_pending");
        return { outcome: "retryable", pushAttempts: deliveries.length };
      }
      if (summary.sent > 0) {
        await markSources(batch, "sent", summary.permanent ? "worker_v1:partial_delivery" : null);
        return { outcome: "sent", pushAttempts: deliveries.length };
      }
      await markSources(batch, "failed", "worker_v1:no_delivery_succeeded", true);
      return { outcome: "permanent", pushAttempts: deliveries.length };
    } catch (error) {
      await markSources(batch, "failed", safeError(error));
      return { outcome: "retryable", pushAttempts: 0 };
    }
  }

  async function processClaimedBatch({ batch, transport }) {
    const groups = await partitionClaimedBatch(batch);
    const results = [];
    for (const group of groups) {
      results.push(await processDeliveryGroup(group, transport));
    }
    return {
      outcome: results.some(result => result.outcome === "retryable")
        ? "retryable"
        : results.some(result => result.outcome === "sent")
          ? "sent"
          : "permanent",
      pushAttempts: results.reduce(
        (sum, result) => sum + Number(result.pushAttempts || 0),
        0
      )
    };
  }

  return Object.freeze({
    claimSourceBatch,
    listOpenRoutineJobs,
    persistTerminalDecisions,
    processClaimedBatch,
    recoverStaleWork,
    withRunLock
  });
}

module.exports = {
  WORKER_ADVISORY_LOCK_V1,
  buildRoutinePayloadV1,
  createNotificationWorkerStoreV1
};
