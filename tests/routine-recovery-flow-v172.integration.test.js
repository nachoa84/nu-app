"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const {
  createRoutineActiveSyncV172
} = require("../routine-active-sync-v172");

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL o DATABASE_URL es obligatorio para esta prueba."
  );
}

const PORT = Number(process.env.TEST_RECOVERY_PORT || 43173);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const pool = new Pool({ connectionString: DATABASE_URL, max: 20 });

const TEST_SERVER_BOOTSTRAP = `
const storagePath = require.resolve("@replit/object-storage");
const storageModule = require(storagePath);
class TestObjectStorageClient {
  async getBucket() {
    throw new Error("Object Storage disabled in V172 recovery integration test.");
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

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null) {
      throw new Error(
        `server.js terminó antes de estar listo.\n${serverOutput}`
      );
    }
    try {
      const response = await fetch(`${BASE_URL}/api/health`, {
        cache: "no-store"
      });
      if (response.ok) {
        const body = await response.json();
        if (body?.ok && body?.database) return;
      }
    } catch (_) {
      // El servidor todavía puede estar inicializando.
    }
    await sleep(200);
  }
  throw new Error(
    `server.js no quedó listo dentro del tiempo esperado.\n${serverOutput}`
  );
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(
      `${options.method || "GET"} ${path} -> ${response.status}: ${text}`
    );
    error.status = response.status;
    throw error;
  }
  return body;
}

function jsonBody(value) {
  return JSON.stringify(value);
}

function syntheticUserId(label) {
  return `v172-recovery-${label}-${crypto.randomUUID()}`;
}

async function bootstrapUser(label) {
  const userId = syntheticUserId(label);
  const response = await api("/api/bootstrap", {
    method: "POST",
    body: jsonBody({
      profile: {
        userId,
        name: "V172 Recovery Synthetic",
        country: "AR",
        timezone: "America/Argentina/Buenos_Aires",
        notificationTime: "09:00"
      },
      localState: {
        currentDay: 1,
        openedDays: {},
        nextUnlockAt: null
      },
      completedDays: [],
      completedAtByDay: {}
    })
  });
  return { userId, state: response.state };
}

async function reopenBootstrap(userId, priorState) {
  return api("/api/bootstrap", {
    method: "POST",
    body: jsonBody({
      profile: {
        userId,
        name: "V172 Recovery Synthetic",
        country: "AR",
        timezone: "America/Argentina/Buenos_Aires",
        notificationTime: "09:00"
      },
      localState: {
        currentDay: priorState?.currentDay || 1,
        openedDays: priorState?.openedDays || {},
        nextUnlockAt: priorState?.nextUnlockAt || null
      },
      completedDays: priorState?.completedDays || [1],
      completedAtByDay: priorState?.completedAtByDay || {}
    })
  });
}

async function openCollagen(userId, day = 1) {
  return api("/api/routine/open", {
    method: "POST",
    body: jsonBody({ userId, day })
  });
}

async function completeCollagen(userId, day = 1) {
  return api("/api/routine/complete", {
    method: "POST",
    body: jsonBody({ userId, day })
  });
}

async function getCollagenState(userId) {
  return api(`/api/state/${encodeURIComponent(userId)}`);
}

async function initializeProducts(userId) {
  return api("/api/product-routines/bootstrap", {
    method: "POST",
    body: jsonBody({ userId, routines: {} })
  });
}

async function openProduct(userId, routineId, day = 1) {
  return api("/api/product-routines/open", {
    method: "POST",
    body: jsonBody({ userId, routineId, day })
  });
}

async function completeProduct(userId, routineId, day = 1) {
  return api("/api/product-routines/complete", {
    method: "POST",
    body: jsonBody({ userId, routineId, day })
  });
}

async function getProductState(userId) {
  return api(
    `/api/product-routines/state/${encodeURIComponent(userId)}`
  );
}

async function collagenDbState(userId) {
  const result = await pool.query(
    `SELECT current_day, cycle, next_unlock_at
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0];
}

async function productDbStates(userId) {
  const result = await pool.query(
    `SELECT routine_id, current_day, next_unlock_at
     FROM product_routine_states
     WHERE user_id = $1
     ORDER BY routine_id`,
    [userId]
  );
  return result.rows;
}

function createRecoveryClient(userId, options = {}) {
  let now = Number(options.now || Date.now());
  let timerId = 0;
  let visible = options.visible !== false;
  let online = options.online !== false;
  let canonicalFailures = Number(options.canonicalFailures || 0);
  let productFailures = Number(options.productFailures || 0);
  let canonicalCalls = 0;
  let productCalls = 0;
  const timers = new Map();
  const canonicalPublished = [];
  const productsPublished = [];

  const controller = createRoutineActiveSyncV172({
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++timerId;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    getIdentity: () => userId,
    isVisible: () => visible,
    isOnline: () => online,
    fetchCanonical: async () => {
      canonicalCalls += 1;
      if (canonicalFailures > 0) {
        canonicalFailures -= 1;
        throw new Error("synthetic network failure");
      }
      if (options.fetchCanonical) {
        return options.fetchCanonical();
      }
      return (await getCollagenState(userId)).state;
    },
    fetchProducts: async () => {
      productCalls += 1;
      if (productFailures > 0) {
        productFailures -= 1;
        throw new Error("synthetic product network failure");
      }
      if (options.fetchProducts) {
        return options.fetchProducts();
      }
      return (await getProductState(userId)).state;
    },
    publishCanonical: state => {
      canonicalPublished.push(state);
      return state;
    },
    publishProducts: state => {
      productsPublished.push(state);
      return state;
    },
    warn() {},
    onStatus() {},
    jitter: () => 0,
    requestTimeoutMs: 5000
  });

  async function settle() {
    for (let i = 0; i < 200; i += 1) {
      await new Promise(resolve => setImmediate(resolve));
      if (!controller.inspect().running) break;
    }
  }

  async function advance(ms) {
    const end = now + ms;
    for (let guard = 0; guard < 1000; guard += 1) {
      const next = [...timers.entries()]
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
      await settle();
    }
    now = end;
    await settle();
  }

  return {
    controller,
    advance,
    settle,
    canonicalPublished,
    productsPublished,
    calls: () => ({ canonical: canonicalCalls, products: productCalls }),
    setVisible(value) { visible = value; },
    setOnline(value) { online = value; },
    now: () => now
  };
}

before(async () => {
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
});

after(async () => {
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
});

test(
  "fallo transitorio al vencer se recupera y publica el día siguiente sin duplicados",
  async () => {
    const { userId } = await bootstrapUser("retry");
    await openCollagen(userId, 1);
    const completed = await completeCollagen(userId, 1);

    await pool.query(
      `UPDATE users
       SET next_unlock_at = NOW() - INTERVAL '1 second'
       WHERE id = $1`,
      [userId]
    );

    const row = await collagenDbState(userId);
    const client = createRecoveryClient(userId, {
      canonicalFailures: 1,
      fetchProducts: async () => ({ userId, routines: {} })
    });

    client.controller.start({
      initial: false,
      deferInitialPassive: false
    });
    client.controller.rememberCanonical({
      ...completed.state,
      userId,
      currentDay: 1,
      cycle: Number(row.cycle || 1),
      nextUnlockAt: row.next_unlock_at.toISOString()
    });

    await client.advance(3000);
    assert.equal(client.calls().canonical, 1);
    assert.equal((await collagenDbState(userId)).current_day, 1);

    await client.advance(2000);

    const finalState = await collagenDbState(userId);
    const jobs = await pool.query(
      `SELECT COUNT(*)::integer AS count
       FROM notification_jobs
       WHERE user_id = $1
         AND cycle = 1
         AND day = 2
         AND kind = 'day_available'`,
      [userId]
    );

    assert.equal(Number(finalState.current_day), 2);
    assert.equal(client.calls().canonical, 2);
    assert.equal(client.canonicalPublished.at(-1).currentDay, 2);
    assert.equal(jobs.rows[0].count, 1);
  }
);

test(
  "app oculta 48 h y luego offline recupera el desbloqueo al volver online",
  async () => {
    const { userId } = await bootstrapUser("hidden-48h");
    await openCollagen(userId, 1);
    const completed = await completeCollagen(userId, 1);
    const initialRow = await collagenDbState(userId);

    const client = createRecoveryClient(userId, {
      fetchProducts: async () => ({ userId, routines: {} })
    });
    client.controller.start({
      initial: false,
      deferInitialPassive: false
    });
    client.controller.rememberCanonical({
      ...completed.state,
      userId,
      currentDay: 1,
      cycle: Number(initialRow.cycle || 1),
      nextUnlockAt: initialRow.next_unlock_at.toISOString()
    });

    client.setVisible(false);
    client.controller.suspend();
    await client.advance(48 * 60 * 60 * 1000);
    assert.equal(client.calls().canonical, 0);

    await pool.query(
      `UPDATE users
       SET next_unlock_at = NOW() - INTERVAL '24 hours'
       WHERE id = $1`,
      [userId]
    );

    client.setVisible(true);
    client.setOnline(false);
    client.controller.onResume("visibilitychange");
    await client.settle();
    assert.equal(client.calls().canonical, 0);

    client.setOnline(true);
    client.controller.onResume("online");
    await client.settle();

    const finalState = await collagenDbState(userId);
    const jobs = await pool.query(
      `SELECT COUNT(*)::integer AS count
       FROM notification_jobs
       WHERE user_id = $1
         AND cycle = 1
         AND day = 2
         AND kind = 'day_available'`,
      [userId]
    );

    assert.equal(Number(finalState.current_day), 2);
    assert.equal(client.calls().canonical, 1);
    assert.equal(client.canonicalPublished.at(-1).currentDay, 2);
    assert.equal(jobs.rows[0].count, 1);
  }
);

test(
  "reapertura fresca 48 h después no pierde un desbloqueo vencido",
  async () => {
    const { userId } = await bootstrapUser("fresh-reopen");
    await openCollagen(userId, 1);
    const completed = await completeCollagen(userId, 1);

    await pool.query(
      `UPDATE users
       SET next_unlock_at = NOW() - INTERVAL '48 hours'
       WHERE id = $1`,
      [userId]
    );

    const client = createRecoveryClient(userId, {
      fetchProducts: async () => ({ userId, routines: {} })
    });
    client.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    const bootstrap = await reopenBootstrap(userId, completed.state);
    client.canonicalPublished.push(bootstrap.state);
    client.controller.rememberCanonical(bootstrap.state);
    await client.advance(3000);

    const finalState = await collagenDbState(userId);
    const jobs = await pool.query(
      `SELECT COUNT(*)::integer AS count
       FROM notification_jobs
       WHERE user_id = $1
         AND cycle = 1
         AND day = 2
         AND kind = 'day_available'`,
      [userId]
    );

    assert.equal(Number(finalState.current_day), 2);
    assert.equal(client.canonicalPublished.at(-1).currentDay, 2);
    assert.equal(jobs.rows[0].count, 1);
  }
);

test(
  "LumiSpa WellSpa y Galvanic recuperan juntas después de 48 h sin saltos",
  async () => {
    const { userId } = await bootstrapUser("products-48h");
    const routineIds = [
      "lumispa-10",
      "wellspa-10",
      "galvanicspa-10"
    ];

    await initializeProducts(userId);
    for (const routineId of routineIds) {
      await openProduct(userId, routineId, 1);
      await completeProduct(userId, routineId, 1);
    }

    const rows = await productDbStates(userId);
    const routines = Object.fromEntries(
      rows.map(row => [
        row.routine_id,
        {
          initialized: true,
          currentDay: 1,
          nextUnlockAt: row.next_unlock_at.toISOString()
        }
      ])
    );

    const client = createRecoveryClient(userId, {
      fetchCanonical: async () => ({
        userId,
        currentDay: 1,
        cycle: 1,
        nextUnlockAt: null
      })
    });
    client.controller.start({
      initial: false,
      deferInitialPassive: false
    });
    client.controller.rememberProducts({ userId, routines });

    client.setVisible(false);
    client.controller.suspend();
    await client.advance(48 * 60 * 60 * 1000);
    assert.equal(client.calls().products, 0);

    await pool.query(
      `UPDATE product_routine_states
       SET next_unlock_at = NOW() - INTERVAL '24 hours'
       WHERE user_id = $1`,
      [userId]
    );

    client.setVisible(true);
    client.setOnline(true);
    client.controller.onResume("visibilitychange");
    await client.settle();

    const finalStates = await productDbStates(userId);
    const jobs = await pool.query(
      `SELECT routine_id, day, COUNT(*)::integer AS count
       FROM routine_notification_jobs
       WHERE user_id = $1
       GROUP BY routine_id, day
       ORDER BY routine_id, day`,
      [userId]
    );

    assert.deepEqual(
      finalStates.map(row => ({
        routineId: row.routine_id,
        currentDay: Number(row.current_day),
        nextUnlockAt: row.next_unlock_at
      })),
      [
        { routineId: "galvanicspa-10", currentDay: 2, nextUnlockAt: null },
        { routineId: "lumispa-10", currentDay: 2, nextUnlockAt: null },
        { routineId: "wellspa-10", currentDay: 2, nextUnlockAt: null }
      ]
    );
    assert.equal(client.calls().products, 1);
    assert.deepEqual(
      jobs.rows.map(row => ({
        routineId: row.routine_id,
        day: Number(row.day),
        count: Number(row.count)
      })),
      [
        { routineId: "galvanicspa-10", day: 2, count: 1 },
        { routineId: "lumispa-10", day: 2, count: 1 },
        { routineId: "wellspa-10", day: 2, count: 1 }
      ]
    );
  }
);
