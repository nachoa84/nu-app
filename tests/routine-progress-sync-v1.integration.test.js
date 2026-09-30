"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL o DATABASE_URL es obligatorio.");
}

const PORT = Number(process.env.TEST_PROGRESS_SYNC_PORT || 43181);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

const TEST_SERVER_BOOTSTRAP = `
const storagePath = require.resolve("@replit/object-storage");
const storageModule = require(storagePath);
class TestObjectStorageClient {
  async getBucket() {
    throw new Error("Object Storage disabled in progress sync integration.");
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
      throw new Error(`server.js terminó antes de estar listo.\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${BASE_URL}/api/health`, {
        cache: "no-store"
      });
      if (response.ok) {
        const body = await response.json();
        if (body?.ok && body?.database) return;
      }
    } catch (_) {}
    await sleep(100);
  }
  throw new Error(`server.js no quedó listo.\n${serverOutput}`);
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
    throw new Error(
      `${options.method || "GET"} ${path} -> ${response.status}: ${text}`
    );
  }
  return body;
}

function userId(label) {
  return `progress-sync-${label}-${crypto.randomUUID()}`;
}

async function bootstrap(label) {
  const id = userId(label);
  const body = await api("/api/bootstrap", {
    method: "POST",
    body: JSON.stringify({
      profile: {
        userId: id,
        name: "Progress Sync Test",
        country: "Argentina",
        timezone: "UTC",
        notificationTime: "23:59"
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
  return { id, state: body.state };
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
    if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
  }
  await pool.end();
});

test("mixed collagen and product batch is committed and acknowledged atomically", async () => {
  const { id } = await bootstrap("mixed");
  const completedAt = Date.now() - 1000;

  const operations = [
    {
      id: "op-collagen-1",
      routineId: "collagen-30",
      day: 1,
      completedAt
    },
    {
      id: "op-lumispa-1",
      routineId: "lumispa-10",
      day: 1,
      completedAt
    }
  ];

  const result = await api("/api/progress/sync", {
    method: "POST",
    body: JSON.stringify({ userId: id, operations })
  });

  assert.deepEqual(
    [...result.ackedIds].sort(),
    ["op-collagen-1", "op-lumispa-1"]
  );
  assert.equal(result.deferredIds.length, 0);
  assert.equal(result.canonicalState.completedDays.includes(1), true);
  assert.equal(
    result.productState.routines["lumispa-10"].completedDays.includes(1),
    true
  );

  const collagen = await pool.query(
    `SELECT COUNT(*)::integer AS count
     FROM day_progress
     WHERE user_id = $1 AND cycle = 1 AND day = 1 AND completed_at IS NOT NULL`,
    [id]
  );
  const product = await pool.query(
    `SELECT COUNT(*)::integer AS count
     FROM product_routine_day_progress
     WHERE user_id = $1
       AND routine_id = 'lumispa-10'
       AND day = 1
       AND completed_at IS NOT NULL`,
    [id]
  );

  assert.equal(collagen.rows[0].count, 1);
  assert.equal(product.rows[0].count, 1);
});

test("replaying the same operations is idempotent and acknowledged again", async () => {
  const { id } = await bootstrap("replay");
  const completedAt = Date.now() - 1000;
  const operations = [
    {
      id: "same-collagen",
      routineId: "collagen-30",
      day: 1,
      completedAt
    },
    {
      id: "same-galvanic",
      routineId: "galvanicspa-10",
      day: 1,
      completedAt
    }
  ];

  const first = await api("/api/progress/sync", {
    method: "POST",
    body: JSON.stringify({ userId: id, operations })
  });
  const second = await api("/api/progress/sync", {
    method: "POST",
    body: JSON.stringify({ userId: id, operations })
  });

  assert.deepEqual(first.ackedIds, second.ackedIds);

  const collagen = await pool.query(
    `SELECT COUNT(*)::integer AS count
     FROM day_progress
     WHERE user_id = $1 AND cycle = 1 AND day = 1`,
    [id]
  );
  const product = await pool.query(
    `SELECT COUNT(*)::integer AS count
     FROM product_routine_day_progress
     WHERE user_id = $1
       AND routine_id = 'galvanicspa-10'
       AND day = 1`,
    [id]
  );

  assert.equal(collagen.rows[0].count, 1);
  assert.equal(product.rows[0].count, 1);
});

test("future-day operation is deferred rather than lost", async () => {
  const { id } = await bootstrap("future");

  const result = await api("/api/progress/sync", {
    method: "POST",
    body: JSON.stringify({
      userId: id,
      operations: [
        {
          id: "future-day-2",
          routineId: "collagen-30",
          day: 2,
          completedAt: Date.now() - 1000
        }
      ]
    })
  });

  assert.deepEqual(result.ackedIds, []);
  assert.deepEqual(result.deferredIds, ["future-day-2"]);

  const row = await pool.query(
    `SELECT completed_at
     FROM day_progress
     WHERE user_id = $1 AND cycle = 1 AND day = 2`,
    [id]
  );

  assert.equal(row.rowCount, 0);
});

test("client completedAt is preserved when valid", async () => {
  const { id } = await bootstrap("timestamp");
  await sleep(20);
  const completedAt = Date.now();

  await api("/api/progress/sync", {
    method: "POST",
    body: JSON.stringify({
      userId: id,
      operations: [
        {
          id: "timestamp-collagen",
          routineId: "collagen-30",
          day: 1,
          completedAt
        }
      ]
    })
  });

  const row = await pool.query(
    `SELECT completed_at
     FROM day_progress
     WHERE user_id = $1 AND cycle = 1 AND day = 1`,
    [id]
  );

  assert.equal(row.rowCount, 1);
  assert.ok(
    Math.abs(
      new Date(row.rows[0].completed_at).getTime() - completedAt
    ) < 1500
  );
});
