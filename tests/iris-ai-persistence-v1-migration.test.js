"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPath = path.join(
  __dirname,
  "..",
  "migration-iris-ai-persistence-v1.sql"
);

function executableSqlV1() {
  const raw = fs.readFileSync(migrationPath, "utf8");

  return raw
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

test("migración Iris AI persistence v1 es aditiva y transaccional", () => {
  const sql = executableSqlV1();

  assert.match(sql, /^\s*BEGIN\s*;/i);
  assert.match(sql, /COMMIT\s*;\s*$/i);

  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS iris_ai_usage_counters/i
  );
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS iris_ai_question_counters/i
  );
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS iris_ai_provider_budget_counters/i
  );
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS iris_ai_provider_reservations/i
  );
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS iris_ai_metrics/i
  );

  assert.doesNotMatch(sql, /\bDROP\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bCREATE\s+EXTENSION\b/i);

  assert.equal(
    (sql.match(/\bBEGIN\s*;/gi) || []).length,
    1
  );
  assert.equal(
    (sql.match(/\bCOMMIT\s*;/gi) || []).length,
    1
  );
});
