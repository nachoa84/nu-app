const fs = require("fs");
const { execFileSync } = require("child_process");

const serverPath = "server.js";
const schemaPath = "schema.sql";

const originalServer = fs.readFileSync(serverPath, "utf8");
const originalSchema = fs.readFileSync(schemaPath, "utf8");
let server = originalServer;
let schema = originalSchema;

function fail(message) {
  throw new Error(`[foco-v2-patch] ${message}`);
}

const deliveryStart = server.indexOf("async function sendFocoPushV1(payload) {");
const processStart = server.indexOf("async function processFocoNotificationsV1() {");
const afterProcessMarker = "\n// NU APP · ENTREGA POR DISPOSITIVO V111";
const processEnd = server.indexOf(afterProcessMarker, processStart);

if (server.includes("async function sendFocoPushV2(")) {
  fail("Foco V2 ya parece estar aplicado en server.js.");
}
if (deliveryStart < 0 || processStart < 0 || processEnd < 0 || deliveryStart >= processStart) {
  fail("No se encontró el bloque Foco V1 esperado en server.js.");
}

const deliveryV2 = `async function prepareFocoDeliveriesV2(eventKey) {
  const subscriptions = await pool.query(
    \`SELECT id, endpoint, subscription
     FROM push_subscriptions
     ORDER BY id\`
  );

  for (const row of subscriptions.rows) {
    await pool.query(
      \`INSERT INTO foco_notification_deliveries (
         event_key,
         subscription_id,
         endpoint_hash,
         subscription_snapshot,
         status,
         next_attempt_at,
         updated_at
       ) VALUES ($1, $2, $3, $4::jsonb, 'pending', NOW(), NOW())
       ON CONFLICT (event_key, endpoint_hash) DO NOTHING\`,
      [
        eventKey,
        row.id,
        endpointHashV111(row.endpoint),
        JSON.stringify(row.subscription)
      ]
    );
  }

  return subscriptions.rowCount;
}

async function recoverStaleFocoDeliveriesV2(eventKey) {
  const staleSeconds = 90;
  const result = await pool.query(
    \`UPDATE foco_notification_deliveries
     SET status = CASE
           WHEN attempts < $3 THEN 'retryable'
           ELSE 'permanent'
         END,
         last_error = 'Entrega Foco recuperada después de una interrupción.',
         processing_at = NULL,
         next_attempt_at = NOW(),
         updated_at = NOW()
     WHERE event_key = $1
       AND status = 'processing'
       AND processing_at <= NOW() - make_interval(secs => $2)\`,
    [
      eventKey,
      staleSeconds,
      NOTIFICATION_DELIVERY_MAX_ATTEMPTS_V111
    ]
  );

  return result.rowCount;
}

async function claimFocoDeliveriesV2(eventKey) {
  return withTransaction(async client => {
    const result = await client.query(
      \`WITH candidates AS (
         SELECT id
         FROM foco_notification_deliveries
         WHERE event_key = $1
           AND attempts < $2
           AND next_attempt_at <= NOW()
           AND status IN ('pending', 'retryable')
         ORDER BY id
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       UPDATE foco_notification_deliveries AS delivery
       SET status = 'processing',
           attempts = attempts + 1,
           processing_at = NOW(),
           updated_at = NOW()
       FROM candidates
       WHERE delivery.id = candidates.id
       RETURNING
         delivery.id,
         delivery.subscription_id,
         delivery.subscription_snapshot,
         delivery.attempts\`,
      [
        eventKey,
        NOTIFICATION_DELIVERY_MAX_ATTEMPTS_V111,
        NOTIFICATION_MAX_PER_CYCLE_V109
      ]
    );

    return result.rows;
  });
}

async function markFocoDeliveryV2(
  delivery,
  status,
  lastError = null,
  nextAttemptAt = null,
  preserveAttempt = false
) {
  await pool.query(
    \`UPDATE foco_notification_deliveries
     SET status = $2,
         last_error = $3,
         next_attempt_at = COALESCE($4, next_attempt_at),
         attempts = CASE
           WHEN $5 THEN GREATEST(attempts - 1, 0)
           ELSE attempts
         END,
         processing_at = NULL,
         sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
         updated_at = NOW()
     WHERE id = $1\`,
    [
      delivery.id,
      status,
      lastError,
      nextAttemptAt,
      preserveAttempt
    ]
  );
}

async function sendFocoDeliveryV2(delivery, payload) {
  const activeSubscription = delivery.subscription_id
    ? await pool.query(
        \`SELECT 1
         FROM push_subscriptions
         WHERE id = $1
           AND subscription = $2::jsonb\`,
        [
          delivery.subscription_id,
          JSON.stringify(delivery.subscription_snapshot)
        ]
      )
    : { rowCount: 0 };

  if (!activeSubscription.rowCount) {
    await markFocoDeliveryV2(
      delivery,
      "permanent",
      "La suscripción fue retirada o actualizada."
    );
    return "inactive";
  }

  try {
    await webpush.sendNotification(
      delivery.subscription_snapshot,
      JSON.stringify(payload)
    );
    await markFocoDeliveryV2(delivery, "sent");
    return "sent";
  } catch (error) {
    const classification = classifyPushErrorV111(error);
    const reason = safePushErrorV111(error);

    if (classification.kind === "configuration") {
      const retryAt = new Date(
        Date.now() + NOTIFICATION_RETRY_BASE_MS_V109
      );
      await markFocoDeliveryV2(
        delivery,
        "retryable",
        reason,
        retryAt,
        true
      );
      return "configuration";
    }

    if (classification.kind === "expired") {
      if (delivery.subscription_id) {
        await pool.query(
          \`DELETE FROM push_subscriptions
           WHERE id = $1
             AND subscription = $2::jsonb\`,
          [
            delivery.subscription_id,
            JSON.stringify(delivery.subscription_snapshot)
          ]
        );
      }
      await markFocoDeliveryV2(delivery, "permanent", reason);
      return "removed";
    }

    if (
      classification.kind === "retryable" &&
      delivery.attempts < NOTIFICATION_DELIVERY_MAX_ATTEMPTS_V111
    ) {
      const retryAt = new Date(
        Date.now() +
        retryDelayMsV111(
          delivery.attempts,
          NOTIFICATION_RETRY_BASE_MS_V109
        )
      );
      await markFocoDeliveryV2(
        delivery,
        "retryable",
        reason,
        retryAt
      );
      return "retryable";
    }

    await markFocoDeliveryV2(delivery, "permanent", reason);
    return "permanent";
  }
}

async function summarizeFocoDeliveriesV2(eventKey) {
  const result = await pool.query(
    \`SELECT status, COUNT(*)::integer AS count
     FROM foco_notification_deliveries
     WHERE event_key = $1
     GROUP BY status\`,
    [eventKey]
  );

  const summary = {
    pending: 0,
    processing: 0,
    retryable: 0,
    sent: 0,
    permanent: 0,
    open: 0,
    total: 0
  };

  for (const row of result.rows) {
    const status = String(row.status || "");
    const count = Number(row.count || 0);
    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] = count;
    }
    summary.total += count;
  }

  summary.open =
    summary.pending +
    summary.processing +
    summary.retryable;

  return summary;
}

async function sendFocoPushV2(eventKey, payload) {
  assertDatabase();
  assertPushConfigured();

  const subscriptions = await prepareFocoDeliveriesV2(eventKey);
  await recoverStaleFocoDeliveriesV2(eventKey);

  const deliveries = await claimFocoDeliveriesV2(eventKey);
  const results = await mapWithConcurrencyV109(
    deliveries,
    NOTIFICATION_CONCURRENCY_V109,
    delivery => sendFocoDeliveryV2(delivery, payload)
  );

  let removed = 0;
  for (const result of results) {
    if (result === "removed") removed += 1;
  }

  const deliverySummary = await summarizeFocoDeliveriesV2(eventKey);

  return {
    subscriptions,
    processed: deliveries.length,
    sent: deliverySummary.sent,
    removed,
    retryable: deliverySummary.retryable,
    permanent: deliverySummary.permanent,
    open: deliverySummary.open,
    total: deliverySummary.total
  };
}`;

const processV2 = `async function processFocoNotificationsV1() {
  const summary = { processed: 0, sent: 0, removed: 0, failed: 0 };
  if (!pool || !pushConfigured) return summary;

  const lockClient = await pool.connect();
  let locked = false;

  try {
    const lockResult = await lockClient.query(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [FOCO_SCHEDULER_ADVISORY_LOCK_V1]
    );
    locked = Boolean(lockResult.rows[0]?.locked);
    if (!locked) return summary;

    const now = DateTime.now().toUTC();
    for (const event of getDueFocoEventsV1(now)) {
      const claimed = await withTransaction(async client => {
        await client.query(
          \`INSERT INTO foco_notification_runs (
             event_key, kind, scheduled_for, status
           ) VALUES ($1, $2, $3, 'pending')
           ON CONFLICT (event_key) DO NOTHING\`,
          [event.eventKey, event.kind, event.scheduledFor]
        );

        await client.query(
          \`UPDATE foco_notification_runs
           SET status = 'failed',
               last_error = 'stale_processing_lease',
               updated_at = NOW()
           WHERE event_key = $1
             AND status = 'processing'
             AND updated_at < $2 - INTERVAL '90 seconds'\`,
          [event.eventKey, now.toJSDate()]
        );

        const result = await client.query(
          \`UPDATE foco_notification_runs
           SET status = 'processing',
               attempts = attempts + 1,
               updated_at = NOW()
           WHERE event_key = $1
             AND status IN ('pending', 'failed')
             AND scheduled_for <= $2
             AND scheduled_for > $2 - INTERVAL '5 minutes'
           RETURNING event_key\`,
          [event.eventKey, now.toJSDate()]
        );

        return result.rowCount > 0;
      });

      if (!claimed) continue;

      try {
        const result = await sendFocoPushV2(
          event.eventKey,
          {
            title: event.title,
            body: event.body,
            url: event.url,
            tag: event.tag,
            focoEvent: event.focoEvent === true,
            focoKind: event.focoKind || event.kind
          }
        );

        if (result.open > 0) {
          await pool.query(
            \`UPDATE foco_notification_runs
             SET status = 'failed',
                 last_error = $2,
                 updated_at = NOW()
             WHERE event_key = $1\`,
            [
              event.eventKey,
              \`open_push_deliveries:\${result.open}\`
            ]
          );
        } else {
          await pool.query(
            \`UPDATE foco_notification_runs
             SET status = 'sent',
                 sent_at = NOW(),
                 updated_at = NOW(),
                 last_error = $2
             WHERE event_key = $1\`,
            [
              event.eventKey,
              result.permanent > 0
                ? \`permanent_push_failures:\${result.permanent}\`
                : null
            ]
          );
        }

        summary.processed += 1;
        summary.sent += result.sent;
        summary.removed += result.removed;
        summary.failed += result.open + result.permanent;
      } catch (error) {
        await pool.query(
          \`UPDATE foco_notification_runs
           SET status = 'failed',
               last_error = $2,
               updated_at = NOW()
           WHERE event_key = $1\`,
          [event.eventKey, error.message || String(error)]
        );
        summary.processed += 1;
        summary.failed += 1;
      }
    }

    return summary;
  } finally {
    if (locked) {
      try {
        await lockClient.query(
          "SELECT pg_advisory_unlock($1)",
          [FOCO_SCHEDULER_ADVISORY_LOCK_V1]
        );
      } catch (unlockError) {
        console.error("[foco-v2] error liberando lock:", unlockError);
      }
    }
    lockClient.release();
  }
}`;

server =
  server.slice(0, deliveryStart) +
  deliveryV2 +
  "\n\n" +
  processV2 +
  server.slice(processEnd);

if (!server.includes('"/api/cron/foco-run"')) {
  const adminSchedulerMarker = 'app.post(\n  "/api/admin/scheduler-run",';
  const adminSchedulerIndex = server.indexOf(adminSchedulerMarker);
  if (adminSchedulerIndex < 0) {
    fail("No se encontró el endpoint /api/admin/scheduler-run.");
  }

  const focoEndpoint = `app.post(
  "/api/cron/foco-run",
  cronLimiter,
  async (req, res, next) => {
    try {
      assertCronSecret(req);
      const result = await processFocoNotificationsV1();
      res.json({ ok: true, foco: result });
    } catch (error) {
      next(error);
    }
  }
);

`;

  server =
    server.slice(0, adminSchedulerIndex) +
    focoEndpoint +
    server.slice(adminSchedulerIndex);
}

if (!schema.includes("CREATE TABLE IF NOT EXISTS foco_notification_deliveries")) {
  const schemaAnchor = `CREATE INDEX IF NOT EXISTS idx_foco_notification_runs_due
  ON foco_notification_runs(status, scheduled_for)
  WHERE status IN ('pending', 'failed');`;
  const schemaIndex = schema.indexOf(schemaAnchor);
  if (schemaIndex < 0) {
    fail("No se encontró el bloque foco_notification_runs en schema.sql.");
  }

  const focoSchema = `

-- NU APP · ENTREGAS DE FOCO POR DISPOSITIVO V2
CREATE TABLE IF NOT EXISTS foco_notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  event_key TEXT NOT NULL
    REFERENCES foco_notification_runs(event_key) ON DELETE CASCADE,
  subscription_id BIGINT NULL
    REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  endpoint_hash TEXT NOT NULL,
  subscription_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL,
  UNIQUE (event_key, endpoint_hash),
  CHECK (
    status IN ('pending', 'processing', 'retryable', 'sent', 'permanent')
  )
);

CREATE INDEX IF NOT EXISTS idx_foco_notification_deliveries_due
  ON foco_notification_deliveries(event_key, status, next_attempt_at)
  WHERE status IN ('pending', 'retryable');

CREATE INDEX IF NOT EXISTS idx_foco_notification_deliveries_processing
  ON foco_notification_deliveries(processing_at)
  WHERE status = 'processing';`;

  schema =
    schema.slice(0, schemaIndex + schemaAnchor.length) +
    focoSchema +
    schema.slice(schemaIndex + schemaAnchor.length);
}

try {
  fs.writeFileSync(serverPath, server);
  fs.writeFileSync(schemaPath, schema);
  execFileSync(process.execPath, ["--check", serverPath], { stdio: "inherit" });
} catch (error) {
  fs.writeFileSync(serverPath, originalServer);
  fs.writeFileSync(schemaPath, originalSchema);
  throw error;
}

console.log("[foco-v2-patch] OK: server.js y schema.sql actualizados; sintaxis válida.");
