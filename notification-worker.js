#!/usr/bin/env node
"use strict";

const { Pool } = require("pg");
const webpush = require("web-push");
const { readNotificationWorkerConfigV1 } = require("./notification-worker-config-v1");
const { runNotificationWorkerV1 } = require("./notification-worker-core-v1");
const { createNotificationWorkerStoreV1 } = require("./notification-worker-store-v1");
const { createWebPushTransportV1 } = require("./web-push-transport-v1");

async function main({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const config = readNotificationWorkerConfigV1(env, argv);
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 3,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true
  });
  try {
    const store = createNotificationWorkerStoreV1({ pool, config });
    const transport = config.dryRun
      ? Object.freeze({
          async send() {
            throw new Error("dry_run_transport_must_not_be_called");
          }
        })
      : createWebPushTransportV1({ webpush, config });
    const summary = await runNotificationWorkerV1({ store, transport, config });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return summary;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main };
