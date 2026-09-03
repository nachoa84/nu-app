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

test("el scheduler apagado retorna antes de crear timers", () => {
  const start =
    source.indexOf("function startScheduler()");
  const end =
    source.indexOf(
      'app.get(\n  "/api/health"',
      start
    );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const section =
    source.slice(start, end);

  const guard =
    section.indexOf(
      "if (!LEGACY_SCHEDULER_ENABLED)"
    );

  const timeout =
    section.indexOf("setTimeout(");

  const interval =
    section.indexOf("setInterval(");

  assert.ok(
    guard >= 0,
    "falta guard LEGACY_SCHEDULER_ENABLED"
  );

  assert.ok(
    timeout > guard,
    "setTimeout quedó antes del guard"
  );

  assert.ok(
    interval > guard,
    "setInterval quedó antes del guard"
  );
});

test("el motor legacy respeta el flag incluso ante invocación directa", () => {
  const start =
    source.indexOf(
      "async function runSchedulerCycle()"
    );

  assert.ok(
    start >= 0,
    "falta runSchedulerCycle"
  );

  const section =
    source.slice(
      start,
      start + 600
    );

  const disabledGuard =
    section.indexOf(
      "if (!LEGACY_SCHEDULER_ENABLED) return;"
    );

  const runningGuard =
    section.indexOf(
      "if (schedulerRunning || !pool) return;"
    );

  assert.ok(
    disabledGuard >= 0,
    "runSchedulerCycle no respeta LEGACY_SCHEDULER_ENABLED"
  );

  assert.ok(
    runningGuard > disabledGuard,
    "el flag debe evaluarse antes de cualquier ejecución del scheduler"
  );
});

test("cron apagado conserva origin check pero evita rate limiter PostgreSQL", () => {
  const originMiddleware =
    source.indexOf(
      'app.use(\n  "/api",\n  assertAllowedWriteOrigin'
    );

  const marker =
    source.indexOf(
      "// NU APP · LEGACY SCHEDULER CONTROL V1"
    );

  const apiWriteLimiterUse =
    source.indexOf(
      "return apiWriteLimiter(",
      marker
    );

  assert.ok(
    originMiddleware >= 0,
    "falta assertAllowedWriteOrigin"
  );

  assert.ok(
    marker > originMiddleware,
    "cron temprano debe conservar el origin check"
  );

  assert.ok(
    apiWriteLimiterUse > marker,
    "cron temprano debe estar antes de apiWriteLimiter"
  );

  const section =
    source.slice(
      marker,
      apiWriteLimiterUse
    );

  const enabledPassThrough =
    section.indexOf(
      "if (LEGACY_SCHEDULER_ENABLED)"
    );

  const passThroughNext =
    section.indexOf(
      "return next();",
      enabledPassThrough
    );

  const cronAuth =
    section.indexOf(
      "assertCronSecret(req)",
      passThroughNext
    );

  const disabledResponse =
    section.indexOf(
      ".status(204)",
      cronAuth
    );

  assert.ok(
    enabledPassThrough >= 0,
    "falta el pass-through cuando el scheduler está habilitado"
  );

  assert.ok(
    passThroughNext > enabledPassThrough,
    "scheduler habilitado debe continuar al flujo histórico"
  );

  assert.ok(
    cronAuth > passThroughNext,
    "scheduler apagado debe autenticar CRON_SECRET"
  );

  assert.ok(
    disabledResponse > cronAuth,
    "el 204 debe ocurrir después de autenticar el cron"
  );

  assert.doesNotMatch(
    section,
    /cronLimiter/
  );

  assert.doesNotMatch(
    section,
    /runSchedulerCycle\(\)/
  );
});

test("scheduler habilitado conserva la ruta cron histórica", () => {
  const occurrences =
    source.match(
      /"\/api\/cron\/scheduler-run"/g
    ) || [];

  assert.equal(
    occurrences.length,
    2,
    "deben existir el gate temprano y la ruta histórica"
  );

  const historicalStart =
    source.lastIndexOf(
      '"/api/cron/scheduler-run"'
    );

  const section =
    source.slice(
      historicalStart,
      historicalStart + 700
    );

  assert.match(
    section,
    /cronLimiter/
  );

  assert.match(
    section,
    /assertCronSecret\(req\)/
  );

  assert.match(
    section,
    /runSchedulerCycle\(\)/
  );
});

test("el control del scheduler no modifica los rate limiters generales", () => {
  const start =
    source.indexOf("function createRateLimiter");

  const end =
    source.indexOf(
      "const apiWriteLimiter",
      start
    );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const section =
    source.slice(start, end);

  assert.doesNotMatch(
    section,
    /LEGACY_SCHEDULER_ENABLED/
  );
});

test("initDatabase sigue ejecutándose antes de escuchar y del scheduler", () => {
  const start =
    source.indexOf("async function start()");

  assert.ok(start >= 0);

  const section =
    source.slice(
      start,
      start + 1000
    );

  const init =
    section.indexOf(
      "await initDatabase();"
    );

  const listen =
    section.indexOf(
      "app.listen("
    );

  const scheduler =
    section.indexOf(
      "startScheduler();"
    );

  assert.ok(
    init >= 0,
    "initDatabase fue eliminado del startup"
  );

  assert.ok(
    listen > init,
    "app.listen debe permanecer después de initDatabase"
  );

  assert.ok(
    scheduler > listen,
    "startScheduler debe permanecer dentro del arranque del servidor"
  );

  assert.doesNotMatch(
    section,
    /if \(!LEGACY_SCHEDULER_ENABLED\)[\s\S]*initDatabase/
  );
});
