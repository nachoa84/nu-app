"use strict";

const SOURCE_TABLES = new Set([
  "notification_jobs",
  "routine_notification_jobs"
]);

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function routineIdFor(row) {
  return row.source_table === "notification_jobs"
    ? "collagen-30"
    : String(row.routine_id || "");
}

function decisionKey(row) {
  return [
    String(row.user_id || ""),
    routineIdFor(row),
    Number(row.cycle || 1),
    String(row.kind || "day_available")
  ].join(":");
}

function classifyRoutineJobsV1(rows = [], { now = Date.now(), ttlHours = 24 } = {}) {
  const ttlMs = Number(ttlHours) * 60 * 60 * 1000;
  const decisions = [];
  const candidates = new Map();

  for (const row of rows) {
    const sourceAt = timestamp(
      row.source_table === "notification_jobs"
        ? row.created_at
        : row.scheduled_for
    );
    const dueAt = timestamp(row.due_at);
    const valid =
      SOURCE_TABLES.has(row.source_table) &&
      Number.isInteger(Number(row.id)) &&
      Number(row.id) > 0 &&
      String(row.user_id || "") &&
      routineIdFor(row) &&
      Number.isInteger(Number(row.day)) &&
      sourceAt !== null &&
      dueAt !== null;

    if (!valid) {
      decisions.push({ row, outcome: "manual_review", reason: "invalid_identity" });
      continue;
    }
    if (dueAt > now) {
      decisions.push({ row, outcome: "not_due", reason: "scheduled_in_future" });
      continue;
    }
    if (sourceAt <= now - ttlMs) {
      decisions.push({ row, outcome: "expired", reason: "expired_ttl" });
      continue;
    }

    const key = decisionKey(row);
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push({ row, sourceAt });
  }

  for (const group of candidates.values()) {
    group.sort((left, right) =>
      right.sourceAt - left.sourceAt || Number(right.row.id) - Number(left.row.id)
    );
    group.forEach((entry, index) => {
      decisions.push({
        row: entry.row,
        outcome: index === 0 ? "eligible" : "superseded",
        reason: index === 0 ? "current" : "newer_job_exists"
      });
    });
  }

  return decisions.sort((left, right) =>
    String(left.row.source_table).localeCompare(String(right.row.source_table)) ||
    Number(left.row.id || 0) - Number(right.row.id || 0)
  );
}

function summarizeDecisionsV1(decisions = []) {
  const summary = {
    total: decisions.length,
    eligible: 0,
    expired: 0,
    superseded: 0,
    not_due: 0,
    manual_review: 0
  };
  for (const decision of decisions) {
    if (Object.hasOwn(summary, decision.outcome)) summary[decision.outcome] += 1;
  }
  return summary;
}

module.exports = {
  classifyRoutineJobsV1,
  decisionKey,
  routineIdFor,
  summarizeDecisionsV1,
  timestamp
};
