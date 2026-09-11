"use strict";

const {
  classifyRoutineJobsV1,
  summarizeDecisionsV1
} = require("./notification-eligibility-v1");

function groupByUser(rows) {
  const groups = new Map();
  for (const row of rows) {
    const userId = String(row.user_id);
    if (!groups.has(userId)) {
      groups.set(userId, { userId, collagen: [], products: [] });
    }
    const target = groups.get(userId);
    if (row.source_table === "notification_jobs") target.collagen.push(row);
    else target.products.push(row);
  }
  return [...groups.values()];
}

async function mapLimited(items, concurrency, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, run)
  );
  return output;
}

async function runNotificationWorkerV1({ store, transport, config, now = Date.now }) {
  const startedAt = now();
  const deadline = startedAt + config.runBudgetMs;
  async function inspect() {
    const rows = await store.listOpenRoutineJobs(
      config.maxPerRun,
      config.canaryUserId || null
    );
    const decisions = classifyRoutineJobsV1(rows, {
      now: startedAt,
      ttlHours: config.ttlHours
    });
    return { decisions, classification: summarizeDecisionsV1(decisions) };
  }

  if (config.dryRun) {
    const { classification } = await inspect();
    return {
      mode: "dry-run",
      scope: config.canaryUserId ? "canary" : "all",
      classification,
      writes: 0,
      pushAttempts: 0
    };
  }

  return store.withRunLock(async locked => {
    if (!locked) {
      return {
        mode: "consume",
        scope: config.canaryUserId ? "canary" : "all",
        locked: false,
        classification: null,
        writes: 0,
        pushAttempts: 0
      };
    }

    await store.recoverStaleWork(config.canaryUserId || null);
    const { decisions, classification } = await inspect();

    const terminal = decisions.filter(decision =>
      new Set(["expired", "superseded", "manual_review"]).has(decision.outcome)
    );
    await store.persistTerminalDecisions(terminal);

    const eligible = decisions
      .filter(decision => decision.outcome === "eligible")
      .map(decision => decision.row);
    const batches = groupByUser(eligible);
    const results = await mapLimited(batches, config.concurrency, async batch => {
      if (now() >= deadline) return { outcome: "budget_exhausted", pushAttempts: 0 };
      const claimed = await store.claimSourceBatch(batch, config.maxAttempts);
      if (!claimed.collagen.length && !claimed.products.length) {
        return { outcome: "already_claimed", pushAttempts: 0 };
      }
      return store.processClaimedBatch({
        batch: claimed,
        transport,
        retryBaseMs: config.retryBaseMs,
        maxAttempts: config.maxAttempts,
        deadline
      });
    });

    return {
      mode: "consume",
      scope: config.canaryUserId ? "canary" : "all",
      locked: true,
      classification,
      processedBatches: results.length,
      sentBatches: results.filter(result => result.outcome === "sent").length,
      retryableBatches: results.filter(result => result.outcome === "retryable").length,
      pushAttempts: results.reduce((sum, result) => sum + Number(result.pushAttempts || 0), 0)
    };
  });
}

module.exports = {
  groupByUser,
  mapLimited,
  runNotificationWorkerV1
};
