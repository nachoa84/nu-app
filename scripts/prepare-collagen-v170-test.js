"use strict";

// Fixture V170. Creates a fresh Collagen test account, never repairs users.
// No demo routes, scheduler, existing progress, or Production writes.
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DEV_WITNESS = "1a7e811a-e701-49c6-a3fd-1d7315975c36";
const PRODUCTION_WITNESS = "4fa0a37d-b0b8-40d8-a2e4-1322ff69d4fd";
const NAME = "Test Collagen V170";
const DEFAULT_BASE = "http://127.0.0.1:5000";

function assertEnvironment(env, branch, source) {
  if (branch !== "development") throw new Error("La rama debe ser development.");
  if (env.REPLIT_DEPLOYMENT || env.NODE_ENV === "production") {
    throw new Error("No se permite ejecutar este fixture en un despliegue.");
  }
  if (String(env.ENABLE_DEMO_ROUTES || "").toLowerCase() === "true") {
    throw new Error("El demo debe permanecer desactivado para esta prueba.");
  }
  if (!source.includes("CONFIRMACIÓN DE PROGRESO COLLAGEN V170") ||
      !source.includes("confirmCollagenDayV170(day)")) {
    throw new Error("No se encontró la corrección V170 en el archivo local.");
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");
  const url = new URL(env.DATABASE_URL);
  if (url.hostname !== "helium" || url.pathname !== "/heliumdb") {
    throw new Error("La conexión no coincide con la base de Development comprobada.");
  }
  return crypto.createHash("sha256").update(env.DATABASE_URL).digest("hex");
}

async function requestJson(request, base, endpoint, options = {}) {
  const response = await request(base + endpoint, {
    ...options,
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = null; }
  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(`${endpoint}: HTTP ${response.status}; ${payload?.error || "respuesta inválida"}`);
  }
  return payload;
}

async function provision({ db, request, base = DEFAULT_BASE, id, now = new Date(), env, branch, source }) {
  const fingerprint = assertEnvironment(env, branch, source);
  if (!crypto.randomUUID || !/^[0-9a-f-]{36}$/i.test(id) ||
      id === DEV_WITNESS || id === PRODUCTION_WITNESS) {
    throw new Error("ID de prueba inválido.");
  }
  if (!Number.isFinite(now.getTime())) throw new Error("Fecha de prueba inválida.");

  await requestJson(request, base, "/api/health");
  const served = await request(base + "/daily-view.js", { signal: AbortSignal.timeout(10000) });
  if (!served.ok || !(await served.text()).includes("CONFIRMACIÓN DE PROGRESO COLLAGEN V170")) {
    throw new Error("El servidor local no está sirviendo V170. No se creó ninguna cuenta.");
  }

  await db.query("BEGIN");
  let committed = false;
  try {
    const identity = await db.query(
      "SELECT current_database() AS database_name, current_user AS database_user"
    );
    const witness = await db.query(
      "SELECT id, name FROM users WHERE id = ANY($1::text[])",
      [[DEV_WITNESS, PRODUCTION_WITNESS, id]]
    );
    const rows = witness.rows;
    if (identity.rows[0]?.database_name !== "heliumdb" ||
        !rows.some(row => row.id === DEV_WITNESS && row.name === "Test Maria Noel") ||
        rows.some(row => row.id === PRODUCTION_WITNESS) ||
        rows.some(row => row.id === id)) {
      throw new Error("La identidad de Development no coincide o el ID ya existe. No se creó nada.");
    }

    await db.query(
      `INSERT INTO users (id, name, country, timezone, notification_time, current_day, cycle)
       VALUES ($1, $2, 'ES', 'Europe/Madrid', '09:00', 3, 1)`,
      [id, NAME]
    );
    const day1 = new Date(now.getTime() - 3 * 86400000);
    const day2 = new Date(now.getTime() - 2 * 86400000);
    await db.query(
      `INSERT INTO day_progress (user_id, cycle, day, opened_at, completed_at)
       VALUES ($1, 1, 1, $2, $2), ($1, 1, 2, $3, $3)`,
      [id, day1, day2]
    );
    await db.query("COMMIT");
    committed = true;
  } finally {
    if (!committed) await db.query("ROLLBACK");
  }

  let payload;
  try {
    payload = await requestJson(request, base, `/api/state/${encodeURIComponent(id)}`);
  } catch (error) {
    throw new Error(`La cuenta de prueba ${id} fue creada, pero no se pudo verificar el servidor: ${error.message}`);
  }
  const state = payload.state;
  if (String(state?.userId) !== id || Number(state.currentDay) !== 3 ||
      state.nextUnlockAt != null ||
      JSON.stringify((state.completedDays || []).map(Number).sort((a,b) => a-b)) !== "[1,2]") {
    throw new Error(`La cuenta ${id} fue creada, pero el servidor no devolvió el estado esperado. No continúes con el guardado.`);
  }
  const check = await db.query(
    `SELECT u.current_day, u.next_unlock_at, dp.day, dp.completed_at
     FROM users u LEFT JOIN day_progress dp ON dp.user_id = u.id AND dp.cycle = u.cycle
     WHERE u.id = $1 ORDER BY dp.day`, [id]
  );
  if (check.rows.some(row => Number(row.current_day) !== 3 || row.next_unlock_at != null) ||
      check.rows.filter(row => row.completed_at != null).map(row => Number(row.day)).join(",") !== "1,2") {
    throw new Error(`La cuenta ${id} fue creada, pero la verificación final de PostgreSQL no coincide.`);
  }
  return { id, name: NAME, timezone: "Europe/Madrid", notificationTime: "09:00",
    currentDay: 3, completedDays: [1,2], nextUnlockAt: null, databaseFingerprint: fingerprint };
}

async function main() {
  const env = process.env;
  const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  const source = fs.readFileSync(path.join(__dirname, "..", "daily-view.js"), "utf8");
  assertEnvironment(env, branch, source);
  const id = crypto.randomUUID();
  const { Client } = require("pg");
  const db = new Client({ connectionString: env.DATABASE_URL, application_name: "collagen-v170-fixture" });
  const base = env.COLLAGEN_V170_TEST_BASE || DEFAULT_BASE;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
    throw new Error("El servidor de prueba debe ser local.");
  }
  await db.connect();
  try {
    const result = await provision({ db, request: fetch, base, id, env, branch, source });
    const filename = path.join(os.tmpdir(), `nu-collagen-v170-test-${id}.json`);
    fs.writeFileSync(filename, JSON.stringify(result, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log("Cuenta nueva de prueba verificada en Development:");
    console.log(JSON.stringify({ id: result.id, name: result.name, timezone: result.timezone,
      notificationTime: result.notificationTime, currentDay: result.currentDay,
      completedDays: result.completedDays, nextUnlockAt: result.nextUnlockAt }, null, 2));
    console.log("Ficha local:", filename);
    console.log("Demo desactivado. No se modificaron usuarios existentes.");
  } finally { await db.end(); }
}

if (require.main === module) main().catch(error => {
  console.error("V170 detenido:", error.message);
  process.exitCode = 1;
});
module.exports = { assertEnvironment, provision };
