"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const enabled = Boolean(process.env.NUAPP_PGLITE_MODULE);
const root = path.resolve(__dirname, "..");
const base = "http://127.0.0.1:3101";
let child;
let output = "";
async function request(route, body) {
  const response = await fetch(base + route, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  } : {});
  return { status: response.status, ...(await response.json()) };
}
async function user(userId) {
  const result = await request("/api/bootstrap", { profile: {
    userId, name: "Supplement test", country: "Argentina", timezone: "America/Argentina/Buenos_Aires", notificationTime: "09:00"
  }, localState: { currentDay: 1, openedDays: {} }, completedDays: [] });
  assert.equal(result.status, 200);
}
before(async () => {
  if (!enabled) return;
  child = spawn(process.execPath, ["-r", "./tests/helpers/supplements-pglite.cjs", "server.js"], {
    cwd: root, env: { ...process.env, PORT: "3101", DATABASE_URL: "postgres://localhost/isolated-supplements-test", SCHEDULER_INTERVAL_MS: "3600000" }
  });
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (output.includes("Servidor listo")) return;
    if (child.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start: " + output);
});
after(() => { child?.kill("SIGTERM"); });

test("API persists independent product/user progress, keeps future days locked, and finishes at 5/10", { skip: !enabled }, async () => {
  await user("pilot-a"); await user("pilot-b");
  let result = await request("/api/product-routines/bootstrap", { userId: "pilot-a", routines: {} });
  assert.equal(result.status, 200);
  result = await request("/api/product-routines/complete", { userId: "pilot-a", routineId: "lifepak-5", day: 1 });
  assert.equal(result.status, 200);
  assert.deepEqual(result.state.routines["lifepak-5"].completedDays, [1]);
  assert.equal(result.state.routines["lifepak-5"].currentDay, 1);
  assert.ok(result.state.routines["lifepak-5"].nextUnlockAt > Date.now());
  assert.deepEqual(result.state.routines["colageno-10"].completedDays, []);
  result = await request("/api/product-routines/open", { userId: "pilot-a", routineId: "lifepak-5", day: 2 });
  assert.equal(result.status, 409);
  result = await request("/api/product-routines/state/pilot-b");
  assert.deepEqual(result.state.routines["lifepak-5"].completedDays, []);
  result = await request("/api/product-routines/state/pilot-a");
  assert.deepEqual(result.state.routines["lifepak-5"].completedDays, [1]);

  await user("pilot-final");
  const yesterday = Date.now() - 2 * 86400000;
  result = await request("/api/product-routines/bootstrap", { userId: "pilot-final", routines: {
    "lifepak-5": { currentDay: 4, completedDays: [1, 2, 3, 4], completedAtByDay: { 1: yesterday, 2: yesterday, 3: yesterday, 4: yesterday } },
    "colageno-10": { currentDay: 9, completedDays: [9], completedAtByDay: { 9: yesterday } }
  } });
  assert.equal(result.status, 200);
  assert.equal(result.state.routines["lifepak-5"].currentDay, 5);
  assert.equal(result.state.routines["colageno-10"].currentDay, 10);
  const repeated = await Promise.all([1, 2].map(() => request("/api/product-routines/complete", { userId: "pilot-final", routineId: "lifepak-5", day: 5 })));
  for (const response of repeated) {
    assert.equal(response.status, 200);
    assert.deepEqual(response.state.routines["lifepak-5"].completedDays, [1, 2, 3, 4, 5]);
    assert.equal(response.state.routines["lifepak-5"].nextUnlockAt, null);
  }
  result = await request("/api/product-routines/complete", { userId: "pilot-final", routineId: "colageno-10", day: 10 });
  assert.equal(result.state.routines["colageno-10"].nextUnlockAt, null);
  result = await request("/api/product-routines/complete", { userId: "pilot-final", routineId: "lifepak-5", day: 6 });
  assert.equal(result.status, 400);
  result = await request("/api/product-routines/bootstrap", { userId: "pilot-final", routines: { "lifepak-5": { currentDay: 6 } } });
  assert.equal(result.status, 400);
  const collagen = await request("/api/state/pilot-final");
  assert.equal(collagen.state.currentDay, 1);
  assert.deepEqual(collagen.state.completedDays, []);
});

test("migration upgrades legacy constraints twice without changing existing Collagen+ or product progress", { skip: !enabled }, async () => {
  const { PGlite } = require(process.env.NUAPP_PGLITE_MODULE);
  const db = new PGlite();
  try {
    const schema = fs.readFileSync(path.join(__dirname, "fixtures/schema-before-supplements.sql"), "utf8");
    await db.exec(schema);
    await db.exec("INSERT INTO users (id,name,country,timezone,current_day) VALUES ('legacy','Legacy','Argentina','UTC',30); INSERT INTO day_progress (user_id,cycle,day,completed_at) VALUES ('legacy',1,30,NOW()); INSERT INTO product_routine_states (user_id,routine_id,current_day) VALUES ('legacy','wellspa-10',8);");
    const before = await db.query("SELECT * FROM users WHERE id='legacy'");
    const migration = fs.readFileSync(path.join(root, "migration-supplements-pilot-v1.sql"), "utf8");
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await db.query("SELECT * FROM users WHERE id='legacy'")).rows, before.rows);
    assert.equal((await db.query("SELECT current_day FROM product_routine_states WHERE user_id='legacy'")).rows[0].current_day, 8);
    assert.equal((await db.query("SELECT day FROM day_progress WHERE user_id='legacy'")).rows[0].day, 30);
    await assert.rejects(db.exec("INSERT INTO product_routine_states (user_id,routine_id,current_day) VALUES ('legacy','lifepak-5',6)"));
    await db.exec("INSERT INTO routine_notification_jobs (user_id,routine_id,day,scheduled_for) VALUES ('legacy','lifepak-5',5,NOW())");
    await assert.rejects(db.exec("INSERT INTO routine_notification_jobs (user_id,routine_id,day,scheduled_for) VALUES ('legacy','lifepak-5',6,NOW())"));
    await db.exec("INSERT INTO qstash_product_routine_pilot_jobs (user_id,routine_id,day,scheduled_for,message_id,delivery_id) VALUES ('legacy','colageno-10',10,NOW(),'m','d')");
  } finally { await db.close(); }
});
