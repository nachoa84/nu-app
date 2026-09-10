"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const { chromium } = require("playwright");

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL o DATABASE_URL es obligatorio para esta prueba."
  );
}

const PORT = Number(process.env.TEST_BROWSER_PORT || 43174);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

const TEST_SERVER_BOOTSTRAP = `
const storagePath = require.resolve("@replit/object-storage");
const storageModule = require(storagePath);
class TestObjectStorageClient {
  async getBucket() {
    throw new Error("Object Storage disabled in V172 browser E2E.");
  }
}
require.cache[storagePath].exports = {
  ...storageModule,
  Client: TestObjectStorageClient
};
require("./server.js");
`;

let serverProcess = null;
let serverOutput = "";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntil(check, {
  timeoutMs = 15000,
  intervalMs = 100,
  description = "condición"
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  const detail = lastError ? ` Último error: ${lastError.message}` : "";
  throw new Error(`Timeout esperando ${description}.${detail}`);
}

async function waitForServer() {
  await waitUntil(
    async () => {
      if (serverProcess?.exitCode !== null) {
        throw new Error(
          `server.js terminó antes de estar listo.\n${serverOutput}`
        );
      }

      try {
        const response = await fetch(`${BASE_URL}/api/health`, {
          cache: "no-store"
        });
        if (!response.ok) return false;
        const body = await response.json();
        return Boolean(body?.ok && body?.database);
      } catch (_) {
        return false;
      }
    },
    { timeoutMs: 30000, description: "server.js + PostgreSQL" }
  );
}

async function dbUser(userId) {
  const result = await pool.query(
    `SELECT id, current_day, cycle, next_unlock_at
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function dbCompletion(userId, day = 1) {
  const result = await pool.query(
    `SELECT completed_at
     FROM day_progress
     WHERE user_id = $1
       AND cycle = 1
       AND day = $2`,
    [userId, day]
  );
  return result.rows[0]?.completed_at || null;
}

async function dbDayAvailableCount(userId, day = 2) {
  const result = await pool.query(
    `SELECT COUNT(*)::integer AS count
     FROM notification_jobs
     WHERE user_id = $1
       AND cycle = 1
       AND day = $2
       AND kind = 'day_available'`,
    [userId, day]
  );
  return Number(result.rows[0]?.count || 0);
}

async function currentLocalDay(page) {
  return page.evaluate(() => {
    try {
      const state = JSON.parse(localStorage.getItem("routineState") || "null");
      return Number(state?.currentDay || 0);
    } catch (_) {
      return 0;
    }
  });
}

async function browserSnapshot(page) {
  if (!page || page.isClosed()) return { pageClosed: true };

  return page.evaluate(() => {
    let routineState = null;
    try {
      routineState = JSON.parse(localStorage.getItem("routineState") || "null");
    } catch (_) {
      routineState = "invalid-json";
    }

    return {
      readyState: document.readyState,
      activeView: document.body?.dataset?.activeView || null,
      routineState,
      selectedDay: localStorage.getItem("selectedDay"),
      activeRoutineId: localStorage.getItem("activeRoutineId"),
      todayLabel:
        document.querySelector(".app-today-main")
          ?.getAttribute("aria-label") || null,
      dayHeader:
        document.getElementById("dailyNativeDayLabel")?.textContent || null,
      dayHero:
        document.querySelector(".native-day-hero h2")?.textContent || null,
      daysGridText:
        (document.getElementById("daysGrid")?.innerText || "").slice(0, 1200),
      routineCards: Array.from(
        document.querySelectorAll("[data-routine-id]")
      ).map(card => ({
        id: card.dataset.routineId || null,
        className: card.className,
        text: (card.innerText || "").slice(0, 300)
      })),
      backendApi: Boolean(window.BackendAPI),
      v172: Boolean(window.NuRoutineActiveSyncV172),
      selectDay: typeof window.selectDay,
      swController: Boolean(navigator.serviceWorker?.controller),
      online: navigator.onLine
    };
  });
}

async function waitForApp(page) {
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

async function openVisibleDay(page, day) {
  await page.waitForFunction(
    expectedDay =>
      document.querySelector(".app-today-main")
        ?.getAttribute("aria-label") === `Continuar día ${expectedDay}`,
    day,
    { timeout: 10000 }
  );

  await page.evaluate(expectedDay => {
    window.selectDay(expectedDay, true);
  }, day);

  const hero = page.locator(".native-day-hero h2");
  await hero.waitFor({ state: "visible", timeout: 10000 });
  assert.equal((await hero.textContent()).trim(), `Día ${day}`);

  const header = page.locator("#dailyNativeDayLabel");
  assert.equal((await header.textContent()).trim(), `Día ${day} de 30`);
}

async function waitForServiceWorkerControl(page) {
  await page.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Service Worker ready timeout")),
          15000
        )
      )
    ]);
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    null,
    { timeout: 15000 }
  );
}

async function main() {
  serverProcess = spawn(
    process.execPath,
    ["-e", TEST_SERVER_BOOTSTRAP],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL,
        PORT: String(PORT),
        LEGACY_SCHEDULER_ENABLED: "false",
        ENABLE_ADMIN_TEST_ROUTES: "false",
        ENABLE_DEMO_ROUTES: "false",
        IRIS_AI_USER_ROUTE_ENABLED: "false"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  serverProcess.stdout.on("data", chunk => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr.on("data", chunk => {
    serverOutput += chunk.toString();
  });

  await waitForServer();

  const userId = `v172-browser-${crypto.randomUUID()}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "allow"
  });

  await context.addInitScript(({ syntheticUserId }) => {
    if (!/^https?:$/.test(location.protocol)) return;

    if (!localStorage.getItem("routineUserProfile")) {
      localStorage.setItem(
        "routineUserProfile",
        JSON.stringify({
          userId: syntheticUserId,
          name: "V172 Browser",
          country: "AR",
          timezone: "America/Argentina/Buenos_Aires",
          notificationTime: "09:00",
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      );
    }

    if (!localStorage.getItem("routineState")) {
      localStorage.setItem(
        "routineState",
        JSON.stringify({
          currentDay: 1,
          openedDays: {},
          nextUnlockAt: null,
          pendingNextDay: null
        })
      );
    }

    if (!localStorage.getItem("activeRoutineId")) {
      localStorage.setItem("activeRoutineId", "collagen-30");
    }

    if (!localStorage.getItem("selectedDay")) {
      localStorage.setItem("selectedDay", "1");
    }

    sessionStorage.setItem("nuapp:intro-shown:v122", "1");
  }, { syntheticUserId: userId });

  let page = await context.newPage();
  const pageErrors = [];
  const attachPageError = currentPage => {
    currentPage.on("pageerror", error => pageErrors.push(error.message));
  };
  attachPageError(page);

  try {
    console.log("[browser-v172] 1/7 Carga inicial y bootstrap sintético");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await waitUntil(
      async () => Boolean(await dbUser(userId)),
      { description: "usuario sintético en PostgreSQL" }
    );
    assert.equal(await currentLocalDay(page), 1);
    await openVisibleDay(page, 1);

    console.log("[browser-v172] 2/7 Service Worker instalado y página controlada");
    await waitForServiceWorkerControl(page);
    assert.equal(
      await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      true
    );
    assert.equal(
      await page.evaluate(() => Boolean(window.NuRoutineActiveSyncV172)),
      true
    );

    console.log("[browser-v172] 3/7 Completado desde el botón real de la PWA");
    await openVisibleDay(page, 1);
    const completeButton = page.locator(".complete-day-btn");
    await completeButton.waitFor({ state: "visible", timeout: 10000 });
    await completeButton.click();
    await page.locator(".complete-card.done")
      .waitFor({ state: "visible", timeout: 10000 });
    await waitUntil(
      async () => Boolean(await dbCompletion(userId, 1)),
      { description: "completed_at oficial del Día 1" }
    );
    assert.equal(Number((await dbUser(userId)).current_day), 1);

    console.log("[browser-v172] 4/7 Vencimiento equivalente a 48 h y recarga offline");
    await pool.query(
      `UPDATE users
       SET next_unlock_at = NOW() - INTERVAL '48 hours'
       WHERE id = $1`,
      [userId]
    );

    await context.setOffline(true);
    await page.goto(BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });
    await waitForApp(page);
    assert.equal(
      await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      true,
      "La recarga offline debe seguir controlada por el Service Worker."
    );
    assert.equal(
      await page.evaluate(() => Boolean(window.NuRoutineActiveSyncV172)),
      true,
      "V172 debe estar disponible desde el precache durante la recarga offline."
    );
    assert.equal(await currentLocalDay(page), 1);
    assert.equal(Number((await dbUser(userId)).current_day), 1);
    assert.equal(await dbDayAvailableCount(userId, 2), 0);
    await openVisibleDay(page, 1);

    console.log("[browser-v172] 5/7 Recuperación real del evento online");
    await context.setOffline(false);
    await page.waitForFunction(
      () => {
        try {
          return Number(
            JSON.parse(localStorage.getItem("routineState") || "null")?.currentDay
          ) === 2;
        } catch (_) {
          return false;
        }
      },
      null,
      { timeout: 15000 }
    );

    await waitUntil(
      async () => Number((await dbUser(userId))?.current_day) === 2,
      { description: "avance oficial a Día 2" }
    );
    assert.equal(await dbDayAvailableCount(userId, 2), 1);

    await page.waitForFunction(() =>
      document.querySelector(".app-today-main")
        ?.getAttribute("aria-label") === "Continuar día 2"
    );
    await openVisibleDay(page, 2);

    console.log("[browser-v172] 6/7 Reapertura completa conserva Día 2 sin doble avance");
    await page.close();
    page = await context.newPage();
    attachPageError(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await page.waitForFunction(() => {
      try {
        return Number(
          JSON.parse(localStorage.getItem("routineState") || "null")?.currentDay
        ) === 2;
      } catch (_) {
        return false;
      }
    });
    await openVisibleDay(page, 2);
    assert.equal(Number((await dbUser(userId)).current_day), 2);
    assert.equal(await dbDayAvailableCount(userId, 2), 1);

    console.log("[browser-v172] 7/7 Invariantes finales");
    const finalUser = await dbUser(userId);
    assert.equal(Number(finalUser.current_day), 2);
    assert.equal(finalUser.next_unlock_at, null);
    assert.equal(await dbDayAvailableCount(userId, 2), 1);
    assert.deepEqual(
      pageErrors,
      [],
      `Errores JS del navegador: ${pageErrors.join(" | ")}`
    );

    console.log(
      "[browser-v172] PASS " +
      JSON.stringify({
        initialDay: 1,
        offlineReloadServiceWorker: true,
        recoveredDay: 2,
        dayAvailableJobs: 1,
        freshReopenDay: 2,
        pageErrors: pageErrors.length
      })
    );
  } catch (error) {
    let snapshot = { unavailable: true };
    try {
      snapshot = await browserSnapshot(page);
    } catch (snapshotError) {
      snapshot = { error: snapshotError.message };
    }

    console.error("[browser-v172] SNAPSHOT", JSON.stringify(snapshot, null, 2));
    console.error("[browser-v172] PAGE_ERRORS", JSON.stringify(pageErrors));
    console.error(
      "[browser-v172] SERVER_TAIL\n" +
      serverOutput.slice(-5000)
    );
    throw error;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});

    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill("SIGTERM");
      await Promise.race([
        new Promise(resolve => serverProcess.once("exit", resolve)),
        sleep(3000)
      ]);
      if (serverProcess.exitCode === null) {
        serverProcess.kill("SIGKILL");
      }
    }

    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
