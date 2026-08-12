"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "server.js"),
  "utf8"
);

test("el lock líder queda limitado al mantenimiento", () => {
  const maintenanceStart =
    source.indexOf("async function runLeaderMaintenanceV116");
  const cycleStart =
    source.indexOf("async function runSchedulerCycle");
  const maintenance = source.slice(maintenanceStart, cycleStart);
  assert.match(maintenance, /pg_try_advisory_lock/);
  assert.match(maintenance, /enqueueDueUnlocksV109/);
  assert.doesNotMatch(
    maintenance,
    /processUnifiedRoutineNotificationJobsV109/
  );
});

test("cada instancia procesa notificaciones fuera del lock líder", () => {
  const start = source.indexOf("async function runSchedulerCycle");
  const section = source.slice(start, start + 3200);
  assert.match(section, /runLeaderMaintenanceV116/);
  assert.match(section, /processUnifiedRoutineNotificationJobsV109/);
  assert.doesNotMatch(section, /if \(!leader\) return/);
});

test("los reclamos conservan SKIP LOCKED", () => {
  const matches = source.match(/SKIP LOCKED/g) || [];
  assert.ok(matches.length >= 2);
});

test("la observabilidad identifica worker y liderazgo", () => {
  assert.match(source, /\[scheduler-v116\]/);
  assert.match(source, /worker=\$\{process\.pid\}/);
  assert.match(source, /lider=\$\{maintenance\.leader/);
});


test("mantenimiento y entrega comienzan en paralelo", () => {
  const start = source.indexOf("async function runSchedulerCycle");
  const section = source.slice(start, start + 2200);
  assert.match(section, /Promise\.all/);
  assert.match(section, /runLeaderMaintenanceV116\(deadline\)/);
  assert.match(section, /processUnifiedRoutineNotificationJobsV109\(deadline\)/);
});
