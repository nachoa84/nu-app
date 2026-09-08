"use strict";

// Development-only fixture for a genuine, near-future Collagen unlock.
// Creates one new synthetic account. No existing-user repairs, clock mocks,
// scheduler changes, demo routes, or direct next_unlock_at overrides.
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const OLD_TEST_ID = "93237fe7-0a64-4a15-bbff-6ef13d1b3ff7";
const DEV_WITNESS = "1a7e811a-e701-49c6-a3fd-1d7315975c36";
const PRODUCTION_WITNESS = "4fa0a37d-b0b8-40d8-a2e4-1322ff69d4fd";
const NAME = "Test Collagen V170 Cierre";
const ZONE = "Europe/Madrid";
const BASE = "http://127.0.0.1:5000";
const RECEIPT = path.join(os.tmpdir(), "nu-collagen-v170-closed-test.json");
const EXPECTED_DAYS = [1, 2, 3, 4, 5];

function assertEnvironment({ env, branch, source, remote }) {
  if (branch !== "development") throw new Error("La rama debe ser development.");
  if (env.REPLIT_DEPLOYMENT || env.NODE_ENV === "production") {
    throw new Error("Prohibido en despliegues o Production.");
  }
  if (String(env.ENABLE_DEMO_ROUTES || "").toLowerCase() === "true") {
    throw new Error("El modo demo debe permanecer desactivado.");
  }
  if (!source.includes("CONFIRMACIÓN DE PROGRESO COLLAGEN V170") ||
      !source.includes("confirmCollagenDayV170(day)")) {
    throw new Error("El archivo local no contiene la corrección V170 esperada.");
  }
  if (!/(?:github\.com[:/])nachoa84\/nu-app(?:\.git)?$/.test(remote)) {
    throw new Error("El remoto de Git no coincide con el repositorio previsto.");
  }
  if (!env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  const url = new URL(env.DATABASE_URL);
  if (url.hostname !== "helium" || url.pathname !== "/heliumdb") {
    throw new Error("La conexión no coincide con la base Development comprobada.");
  }
}

function buildPlan(now, DateTime) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Hora de referencia inválida.");
  }
  const current = DateTime.fromJSDate(now, { zone: ZONE });
  if (!current.isValid) throw new Error("Zona horaria inválida.");
  const target = current.plus({ minutes: 16 }).startOf("minute");
  const hour = target.hour;
  const minute = target.minute;
  const nextUnlock = completed => completed.plus({ days: 1 }).startOf("day")
    .set({ hour, minute, second: 0, millisecond: 0 });
  const progress = [];
  for (let day = 1; day <= 5; day++) {
    const opened = target.minus({ days: 6 - day });
    const completed = opened.plus({ seconds: 5 });
    if (!opened.isValid || !completed.isValid || completed.toMillis() > now.getTime()) {
      throw new Error("Las fechas sintéticas no son válidas.");
    }
    const expectedNext = day === 5 ? target : target.minus({ days: 5 - day });
    if (nextUnlock(completed).toMillis() !== expectedNext.toMillis()) {
      throw new Error("El calendario local cruza una transición horaria; elegí otro momento de prueba.");
    }
    progress.push({ day, openedAt: opened.toUTC().toISO(), completedAt: completed.toUTC().toISO() });
  }
  const delay = target.toMillis() - now.getTime();
  if (delay < 14 * 60000 || delay > 17 * 60000) {
    throw new Error("El vencimiento no está dentro del margen seguro.");
  }
  return {
    name: NAME, timezone: ZONE, notificationTime: target.toFormat("HH:mm"),
    currentDay: 5, cycle: 1, targetAt: target.toUTC().toISO(),
    createdAt: target.minus({ days: 5, minutes: 1 }).toUTC().toISO(), progress
  };
}

async function requestJson(request, endpoint, options = {}) {
  const response = await request(BASE + endpoint, {
    ...options, signal: AbortSignal.timeout(10000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(`${endpoint}: HTTP ${response.status}; ${payload?.error || "respuesta inválida"}`);
  }
  return payload;
}

async function assertDatabaseIdentity(db, id) {
  const identity = await db.query("SELECT current_database() AS database_name, current_user AS database_user, clock_timestamp() AS db_now");
  const witness = await db.query(
    "SELECT id, name, current_day FROM users WHERE id = ANY($1::text[])",
    [[DEV_WITNESS, OLD_TEST_ID, PRODUCTION_WITNESS, id]]
  );
  const rows = witness.rows;
  if (identity.rows[0]?.database_name !== "heliumdb" ||
      !rows.some(row => row.id === DEV_WITNESS && row.name === "Test Maria Noel") ||
      !rows.some(row => row.id === OLD_TEST_ID && row.name === "Test Collagen V170" && Number(row.current_day) >= 5) ||
      rows.some(row => row.id === PRODUCTION_WITNESS) || rows.some(row => row.id === id)) {
    throw new Error("La identidad de Development no coincide o el ID ya existe. No se creó nada.");
  }
  return new Date(identity.rows[0].db_now);
}

async function verifyFixture(db, id, plan, state) {
  const rows = await db.query(
    `SELECT u.name, u.current_day, u.cycle, u.timezone, u.notification_time,
            u.next_unlock_at, dp.day, dp.opened_at, dp.completed_at
       FROM users u LEFT JOIN day_progress dp
         ON dp.user_id = u.id AND dp.cycle = u.cycle
      WHERE u.id = $1 ORDER BY dp.day`, [id]
  );
  const completed = [...(state.completedDays || [])].map(Number).sort((a, b) => a - b);
  if (state.userId !== id || Number(state.currentDay) !== 5 ||
      JSON.stringify(completed) !== JSON.stringify(EXPECTED_DAYS) ||
      Number(state.nextUnlockAt) !== Date.parse(plan.targetAt) || rows.rowCount !== 5 ||
      rows.rows.some(row => row.name !== NAME || Number(row.current_day) !== 5 ||
        Number(row.cycle) !== 1 || row.timezone !== ZONE ||
        row.notification_time !== plan.notificationTime ||
        new Date(row.next_unlock_at).getTime() !== Date.parse(plan.targetAt) ||
        new Date(row.opened_at).getTime() !== Date.parse(plan.progress[Number(row.day) - 1]?.openedAt) ||
        new Date(row.completed_at).getTime() !== Date.parse(plan.progress[Number(row.day) - 1]?.completedAt))) {
    throw new Error(`El fixture ${id} no coincide con el estado esperado. No se hará ninguna reparación automática.`);
  }
}

async function createFixture({ db, request, env, branch, source, remote, id, DateTime }) {
  assertEnvironment({ env, branch, source, remote });
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
      [OLD_TEST_ID, DEV_WITNESS, PRODUCTION_WITNESS].includes(id)) {
    throw new Error("ID sintético inválido.");
  }
  await requestJson(request, "/api/health");
  const served = await request(BASE + "/daily-view.js", { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!served.ok || (await served.text()) !== source) {
    throw new Error("El Preview local no está sirviendo exactamente el V170 del workspace.");
  }
  await db.query("BEGIN");
  let committed = false;
  let plan;
  try {
    const now = await assertDatabaseIdentity(db, id);
    plan = buildPlan(now, DateTime);
    await db.query(
      `INSERT INTO users
        (id, name, country, timezone, notification_time, current_day, cycle, created_at)
       VALUES ($1, $2, 'ES', $3, $4, 5, 1, $5)`,
      [id, NAME, ZONE, plan.notificationTime, plan.createdAt]
    );
    for (const row of plan.progress) {
      await db.query(
        `INSERT INTO day_progress (user_id, cycle, day, opened_at, completed_at)
         VALUES ($1, 1, $2, $3, $4)`,
        [id, row.day, row.openedAt, row.completedAt]
      );
    }
    await db.query("COMMIT");
    committed = true;
  } finally {
    if (!committed) await db.query("ROLLBACK");
  }
  // Use the real, unchanged bootstrap to calculate the pending unlock.
  const payload = await requestJson(request, "/api/bootstrap", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: { userId: id, name: NAME, country: "ES", timezone: ZONE,
        notificationTime: plan.notificationTime },
      localState: { currentDay: 5, openedDays: {}, nextUnlockAt: null },
      completedDays: [], completedAtByDay: {}
    })
  });
  await verifyFixture(db, id, plan, payload.state);
  return { id, ...plan, status: "verified" };
}

function writeReceipt(receipt) {
  const temporary = RECEIPT + "." + process.pid + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, RECEIPT);
}

async function main() {
  const env = process.env;
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const branch = git("branch", "--show-current");
  const remote = git("remote", "get-url", "origin");
  const source = fs.readFileSync(path.join(__dirname, "..", "daily-view.js"), "utf8");
  assertEnvironment({ env, branch, source, remote });
  try {
    git("diff", "--quiet", "HEAD", "--", "server.js", "backend-client.js", "routine-sync.js");
  } catch (_) {
    throw new Error("Hay modificaciones locales en el backend o la sincronización. No se prepara el fixture.");
  }
  const { Client } = require("pg");
  const { DateTime } = require("luxon");
  const db = new Client({ connectionString: env.DATABASE_URL, application_name: "collagen-v170-closed-fixture" });
  await db.connect();
  try {
    if (fs.existsSync(RECEIPT)) {
      const receipt = JSON.parse(fs.readFileSync(RECEIPT, "utf8"));
      const existing = await db.query("SELECT id, name, current_day, next_unlock_at FROM users WHERE id = $1", [receipt.id]);
      console.log(JSON.stringify({ receipt: RECEIPT, account: existing.rows[0] || null, status: receipt.status, targetAt: receipt.targetAt || null }, null, 2));
      console.log("Ya existe una ficha. No se crea otro usuario. Conservá esta salida para continuar.");
      return;
    }
    const id = crypto.randomUUID();
    fs.writeFileSync(RECEIPT, JSON.stringify({ id, name: NAME, status: "allocated" }) + "\n", { mode: 0o600, flag: "wx" });
    let result;
    try {
      result = await createFixture({ db, request: fetch, env, branch, source, remote, id, DateTime });
    } catch (error) {
      console.error("Fixture detenido. ID reservado:", id);
      console.error("No se crearán cuentas adicionales ni se reparará ningún usuario automáticamente.");
      throw error;
    }
    writeReceipt(result);
    console.log("Fixture de cierre verificado en Development:");
    console.log(JSON.stringify({ id: result.id, name: result.name, currentDay: 5,
      completedDays: EXPECTED_DAYS, notificationTime: result.notificationTime,
      nextUnlockAt: result.targetAt, timezone: ZONE }, null, 2));
    console.log("Ficha local:", RECEIPT);
    console.log("Solo se creó el usuario sintético. No se cambió el reloj, el scheduler ni el vencimiento de otros usuarios.");
  } finally {
    await db.end();
  }
}

if (require.main === module) main().catch(error => {
  console.error("V170 cierre detenido:", error.message);
  process.exitCode = 1;
});
module.exports = { assertEnvironment, buildPlan, createFixture, verifyFixture };
