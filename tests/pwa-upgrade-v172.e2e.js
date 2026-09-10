"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { execFileSync, spawn } = require("node:child_process");
const { Pool } = require("pg");
const { chromium } = require("playwright");

const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("TEST_DATABASE_URL o DATABASE_URL es obligatorio.");

const BASE_MAIN_SHA = process.env.V172_BASE_MAIN_SHA;
if (!BASE_MAIN_SHA) throw new Error("V172_BASE_MAIN_SHA es obligatorio.");

const PORT = Number(process.env.TEST_BROWSER_UPGRADE_PORT || 43176);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const V172_CACHE = "nuapp-v172-progress-stabilization";
const CLIENT_FILES = ["index.html", "backend-client.js", "service-worker.js"];
const currentFiles = new Map(CLIENT_FILES.map(path => [path, fs.readFileSync(path, "utf8")]));
const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

const TEST_SERVER_BOOTSTRAP = `
const storagePath = require.resolve("@replit/object-storage");
const storageModule = require(storagePath);
class TestObjectStorageClient {
  async getBucket() {
    throw new Error("Object Storage disabled in V172 upgrade E2E.");
  }
}
require.cache[storagePath].exports = { ...storageModule, Client: TestObjectStorageClient };
require("./server.js");
`;

let serverProcess = null;
let serverOutput = "";

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitUntil(check, { timeoutMs = 15000, intervalMs = 100, description = "condición" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) { lastError = error; }
    await sleep(intervalMs);
  }
  throw new Error(`Timeout esperando ${description}.${lastError ? ` Último error: ${lastError.message}` : ""}`);
}

function installOldMainClientFiles() {
  for (const path of CLIENT_FILES) {
    const content = execFileSync("git", ["show", `${BASE_MAIN_SHA}:${path}`], { encoding: "utf8" });
    fs.writeFileSync(path, content);
  }
}

function restoreV172ClientFiles() {
  for (const [path, content] of currentFiles) fs.writeFileSync(path, content);
}

async function waitForServer() {
  await waitUntil(async () => {
    if (serverProcess?.exitCode !== null) throw new Error(`server.js terminó antes de estar listo.\n${serverOutput}`);
    try {
      const response = await fetch(`${BASE_URL}/api/health`, { cache: "no-store" });
      const body = response.ok ? await response.json() : null;
      return Boolean(body?.ok && body?.database);
    } catch (_) { return false; }
  }, { timeoutMs: 30000, description: "server.js + PostgreSQL" });
}

async function dbUser(userId) {
  const result = await pool.query(
    `SELECT id, current_day, cycle, next_unlock_at FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function dbCompletion(userId, day = 1) {
  const result = await pool.query(
    `SELECT completed_at FROM day_progress WHERE user_id = $1 AND cycle = 1 AND day = $2`,
    [userId, day]
  );
  return result.rows[0]?.completed_at || null;
}

async function dbDayAvailableCount(userId, day = 2) {
  const result = await pool.query(
    `SELECT COUNT(*)::integer AS count FROM notification_jobs
     WHERE user_id = $1 AND cycle = 1 AND day = $2 AND kind = 'day_available'`,
    [userId, day]
  );
  return Number(result.rows[0]?.count || 0);
}

async function localSnapshot(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem("routineUserProfile") || "null");
    const routine = JSON.parse(localStorage.getItem("routineState") || "null");
    return {
      userId: profile?.userId || null,
      currentDay: Number(routine?.currentDay || 0),
      selectedDay: localStorage.getItem("selectedDay"),
      v172: Boolean(window.NuRoutineActiveSyncV172),
      swController: Boolean(navigator.serviceWorker?.controller)
    };
  });
}

async function waitForBaseApp(page) {
  await page.waitForFunction(
    () => Boolean(window.BackendAPI && typeof window.selectDay === "function" && document.querySelector(".app-today-main")),
    null,
    { timeout: 15000 }
  );
}

async function waitForV172App(page) {
  await page.waitForFunction(
    () => Boolean(
      window.BackendAPI &&
      window.NuRoutineActiveSyncV172?.createRoutineActiveSyncV172 &&
      typeof window.selectDay === "function" &&
      document.querySelector(".app-today-main")
    ),
    null,
    { timeout: 15000 }
  );
}

async function waitForServiceWorkerControl(page) {
  await page.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Service Worker ready timeout")), 15000))
    ]);
  });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await waitForBaseApp(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 });
}

async function openDay(page, day) {
  await page.waitForFunction(
    expected => document.querySelector(".app-today-main")?.getAttribute("aria-label") === `Continuar día ${expected}`,
    day,
    { timeout: 10000 }
  );
  await page.evaluate(expected => window.selectDay(expected, true), day);
  const hero = page.locator(".native-day-hero h2");
  await hero.waitFor({ state: "visible", timeout: 10000 });
  assert.equal((await hero.textContent()).trim(), `Día ${day}`);
}

async function main() {
  installOldMainClientFiles();

  serverProcess = spawn(process.execPath, ["-e", TEST_SERVER_BOOTSTRAP], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL,
      PORT: String(PORT),
      LEGACY_SCHEDULER_ENABLED: "false",
      DISABLE_QSTASH: "true",
      ENABLE_ADMIN_TEST_ROUTES: "false",
      ENABLE_DEMO_ROUTES: "false",
      IRIS_AI_USER_ROUTE_ENABLED: "false",
      NODE_ENV: "test"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  serverProcess.stdout.on("data", chunk => { serverOutput += chunk.toString(); });
  serverProcess.stderr.on("data", chunk => { serverOutput += chunk.toString(); });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
  const userId = `v172-upgrade-${crypto.randomUUID()}`;
  const pageErrors = [];

  await context.addInitScript(({ syntheticUserId }) => {
    if (!/^https?:$/.test(location.protocol)) return;
    if (!localStorage.getItem("routineUserProfile")) {
      const now = new Date().toISOString();
      localStorage.setItem("routineUserProfile", JSON.stringify({
        userId: syntheticUserId,
        name: "V172 Upgrade",
        country: "AR",
        timezone: "America/Argentina/Buenos_Aires",
        notificationTime: "09:00",
        startedAt: now,
        updatedAt: now
      }));
    }
    if (!localStorage.getItem("routineState")) {
      localStorage.setItem("routineState", JSON.stringify({ currentDay: 1, openedDays: {}, nextUnlockAt: null, pendingNextDay: null }));
    }
    if (!localStorage.getItem("activeRoutineId")) localStorage.setItem("activeRoutineId", "collagen-30");
    if (!localStorage.getItem("selectedDay")) localStorage.setItem("selectedDay", "1");
    sessionStorage.setItem("nuapp:intro-shown:v122", "1");
  }, { syntheticUserId: userId });

  let page = await context.newPage();
  const attachErrors = p => p.on("pageerror", error => pageErrors.push(error.message));
  attachErrors(page);

  try {
    await waitForServer();

    console.log("[upgrade-v172] 1/8 Arranque con cliente exacto de main y backend V172");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await waitForBaseApp(page);
    await waitUntil(async () => Boolean(await dbUser(userId)), { description: "usuario sintético" });
    assert.equal((await localSnapshot(page)).v172, false, "El cliente inicial debe ser el de main, sin V172.");

    console.log("[upgrade-v172] 2/8 Instalación y control del Service Worker anterior");
    await waitForServiceWorkerControl(page);
    const oldSnapshot = await localSnapshot(page);
    assert.equal(oldSnapshot.userId, userId);
    assert.equal(oldSnapshot.currentDay, 1);
    assert.equal(oldSnapshot.v172, false);
    assert.equal(oldSnapshot.swController, true);
    assert.equal((await page.evaluate(() => caches.keys())).includes(V172_CACHE), false);

    console.log("[upgrade-v172] 3/8 Publicación de assets V172 y detección de actualización en espera");
    restoreV172ClientFiles();
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("No hay registro de Service Worker.");
      await registration.update();
    });
    await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting), null, { timeout: 20000 });
    const updateToast = page.locator(".toast-text", { hasText: "Hay una actualización lista." });
    await updateToast.waitFor({ state: "visible", timeout: 15000 });
    const updateButton = page.locator(".toast-action", { hasText: "Actualizar" });
    await updateButton.waitFor({ state: "visible", timeout: 15000 });

    console.log("[upgrade-v172] 4/8 Acción real Actualizar activa V172 sin borrar estado local");
    await updateButton.click();
    await page.waitForFunction(async expectedCache => {
      const registration = await navigator.serviceWorker.getRegistration();
      const keys = await caches.keys();
      return Boolean(registration?.active?.state === "activated" && !registration.waiting && keys.includes(expectedCache));
    }, V172_CACHE, { timeout: 20000 });
    assert.equal((await localSnapshot(page)).userId, userId);
    assert.equal((await localSnapshot(page)).currentDay, 1);

    console.log("[upgrade-v172] 5/8 Reapertura carga V172 y conserva identidad/progreso");
    await page.close();
    page = await context.newPage();
    attachErrors(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await waitForV172App(page);
    const upgraded = await localSnapshot(page);
    assert.equal(upgraded.userId, userId);
    assert.equal(upgraded.currentDay, 1);
    assert.equal(upgraded.v172, true);
    assert.equal(upgraded.swController, true);
    await openDay(page, 1);

    console.log("[upgrade-v172] 6/8 Completar Día 1 ya bajo V172");
    const completeButton = page.locator(".complete-day-btn");
    await completeButton.waitFor({ state: "visible", timeout: 10000 });
    await completeButton.click();
    await page.locator(".complete-card.done").waitFor({ state: "visible", timeout: 10000 });
    await waitUntil(async () => Boolean(await dbCompletion(userId, 1)), { description: "completed_at oficial Día 1" });
    assert.equal(Number((await dbUser(userId)).current_day), 1);

    console.log("[upgrade-v172] 7/8 Vencimiento offline y recuperación online después del upgrade");
    await pool.query(`UPDATE users SET next_unlock_at = NOW() - INTERVAL '48 hours' WHERE id = $1`, [userId]);
    await context.setOffline(true);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await waitForV172App(page);
    assert.equal((await localSnapshot(page)).currentDay, 1);
    assert.equal(Number((await dbUser(userId)).current_day), 1);
    assert.equal(await dbDayAvailableCount(userId, 2), 0);

    await context.setOffline(false);
    await page.waitForFunction(() => {
      try { return Number(JSON.parse(localStorage.getItem("routineState") || "null")?.currentDay) === 2; }
      catch (_) { return false; }
    }, null, { timeout: 15000 });
    await waitUntil(async () => Number((await dbUser(userId))?.current_day) === 2, { description: "avance oficial a Día 2" });
    assert.equal(await dbDayAvailableCount(userId, 2), 1);

    console.log("[upgrade-v172] 8/8 Reapertura final e invariantes");
    await page.close();
    page = await context.newPage();
    attachErrors(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await waitForV172App(page);
    await openDay(page, 2);
    const finalUser = await dbUser(userId);
    assert.equal(Number(finalUser.current_day), 2);
    assert.equal(finalUser.next_unlock_at, null);
    assert.equal(await dbDayAvailableCount(userId, 2), 1);
    assert.deepEqual(pageErrors, [], `Errores JS: ${pageErrors.join(" | ")}`);

    const cacheKeys = await page.evaluate(() => caches.keys());
    assert.equal(cacheKeys.includes(V172_CACHE), true);

    console.log("[upgrade-v172] PASS " + JSON.stringify({
      oldClientDetected: true,
      updatePrompt: true,
      updateAction: true,
      identityPreserved: true,
      upgradedToV172: true,
      offlineRecoveryAfterUpgrade: true,
      finalDay: 2,
      dayAvailableJobs: 1,
      pageErrors: pageErrors.length
    }));
  } catch (error) {
    let snapshot = null;
    try { snapshot = await localSnapshot(page); } catch (_) { snapshot = { unavailable: true }; }
    console.error("[upgrade-v172] SNAPSHOT", JSON.stringify(snapshot, null, 2));
    console.error("[upgrade-v172] PAGE_ERRORS", JSON.stringify(pageErrors));
    console.error("[upgrade-v172] SERVER_TAIL\n" + serverOutput.slice(-5000));
    throw error;
  } finally {
    restoreV172ClientFiles();
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill("SIGTERM");
      await Promise.race([new Promise(resolve => serverProcess.once("exit", resolve)), sleep(3000)]);
      if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
    }
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
