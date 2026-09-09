"use strict";

const {
  test,
  before,
  after
} = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL o DATABASE_URL es obligatorio para esta prueba."
  );
}

const PORT = Number(
  process.env.TEST_PORT ||
  43172
);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20
});

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
      // El servidor todavía puede estar inicializando el esquema.
    }

    await sleep(200);
  }

  throw new Error(
    `server.js no quedó listo dentro del tiempo esperado.\n${serverOutput}`
  );
}

async function api(path, options = {}) {
  const headers = {
    ...(options.body
      ? { "Content-Type": "application/json" }
      : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });

  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(
      `${options.method || "GET"} ${path} -> ${response.status}: ${text}`
    );
  }

  return body;
}

function jsonBody(value) {
  return JSON.stringify(value);
}

function syntheticUserId(label) {
  return `v172-${label}-${crypto.randomUUID()}`;
}

async function bootstrapUser(label) {
  const userId = syntheticUserId(label);

  await api("/api/bootstrap", {
    method: "POST",
    body: jsonBody({
      profile: {
        userId,
        name: "V172 Synthetic",
        country: "AR",
        timezone: "America/Argentina/Buenos_Aires",
        notificationTime: "09:00"
      },
      localState: {
        currentDay: 1,
        openedDays: {}
      },
      completedDays: [],
      completedAtByDay: {}
    })
  });

  return userId;
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

async function getProductState(userId) {
  return api(
    `/api/product-routines/state/${encodeURIComponent(userId)}`
  );
}

async function initializeProducts(userId) {
  return api("/api/product-routines/bootstrap", {
    method: "POST",
    body: jsonBody({
      userId,
      routines: {}
    })
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

function concurrent(count, fn) {
  return Promise.all(
    Array.from({ length: count }, (_, index) => fn(index))
  );
}

before(async () => {
  serverProcess = spawn(
    process.execPath,
    ["server.js"],
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
  "Collagen no avanza con next_unlock_at vencido si falta completed_at oficial",
  async () => {
    const userId = await bootstrapUser("collagen-uncompleted");

    await pool.query(
      `UPDATE users
       SET next_unlock_at = NOW() - INTERVAL '1 hour'
       WHERE id = $1`,
      [userId]
    );

    const responses = await concurrent(
      16,
      () => getCollagenState(userId)
    );

    for (const response of responses) {
      assert.equal(response.state.currentDay, 1);
    }

    const state = await pool.query(
      `SELECT current_day, next_unlock_at
       FROM users
       WHERE id = $1`,
      [userId]
    );
    const jobs = await pool.query(
      `SELECT COUNT(*)::integer AS count
       FROM notification_jobs
       WHERE user_id = $1`,
      [userId]
    );

    assert.equal(Number(state.rows[0].current_day), 1);
    assert.notEqual(state.rows[0].next_unlock_at, null);
    assert.equal(jobs.rows[0].count, 0);
  }
);

test(
  "Collagen no avanza antes del vencimiento aunque el día esté completado",
  async () => {
    const userId = await bootstrapUser("collagen-not-due");
    await openCollagen(userId);
    await completeCollagen(userId);

    await pool.query(
      `UPDATE users
       SET next_unlock_at = NOW() + INTERVAL '1 hour'
       WHERE id = $1`,
      [userId]
    );

    const responses = await concurrent(
      16,
      () => getCollagenState(userId)
    );

    for (const response of responses) {
      assert.equal(response.state.currentDay, 1);
    }

    const jobs = await pool.query(
      `SELECT COUNT(*)::integer AS count
       FROM notification_jobs
       WHERE user_id = $1`,
      [userId]
    );

    assert.equal(jobs.rows[0].count, 0);
  }
);

test(
  "Collagen bajo concurrencia avanza exactamente una vez y crea un solo job",
  async () => {
    const userId = await bootstrapUser("collagen-due");
    await openCollagen(userId);
    await completeCollagen(userId);

    await pool.query(
      `UPDATE users
       SET next_unlock_at = NOW() - INTERVAL '1 second'
       WHERE id = $1`,
      [userId]
    );

    const responses = await concurrent(
      24,
      () => getCollagenState(userId)
    );

    for (const response of responses) {
      assert.equal(response.state.currentDay, 2);
    }

    await concurrent(
      24,
      () => getCollagenState(userId)
    );

    const state = await pool.query(
      `SELECT current_day, next_unlock_at
       FROM users
       WHERE id = $1`,
      [userId]
    );
    const jobs = await pool.query(
      `SELECT day, COUNT(*)::integer AS count
       FROM notification_jobs
       WHERE user_id = $1
       GROUP BY day
       ORDER BY day`,
      [userId]
    );

    assert.equal(Number(state.rows[0].current_day), 2);
    assert.equal(state.rows[0].next_unlock_at, null);
    assert.deepEqual(
      jobs.rows.map(row => ({
        day: Number(row.day),
        count: Number(row.count)
      })),
      [{ day: 2, count: 1 }]
    );
  }
);

test(
  "GET state y completes duplicados simultáneos no producen salto ni doble job",
  async () => {
    const userId = await bootstrapUser("collagen-race");
    await openCollagen(userId);
    await completeCollagen(userId);

    await pool.query(
      `UPDATE users
       SET next_unlock_at = NOW() - INTERVAL '1 second'
       WHERE id = $1`,
      [userId]
    );

    await Promise.all([
      ...Array.from(
        { length: 12 },
        () => getCollagenState(userId)
      ),
      ...Array.from(
        { length: 12 },
        () => completeCollagen(userId, 1)
      )
    ]);

    const state = await pool.query(
      `SELECT current_day
       FROM users
       WHERE id = $1`,
      [userId]
    );
    const jobs = await pool.query(
      `SELECT COUNT(*)::integer AS count
       FROM notification_jobs
       WHERE user_id = $1
         AND cycle = 1
         AND day = 2
         AND kind = 'day_available'`,
      [userId]
    );

    assert.equal(Number(state.rows[0].current_day), 2);
    assert.equal(jobs.rows[0].count, 1);
  }
);

test(
  "LumiSpa, WellSpa y Galvanic no avanzan con vencimiento si falta completed_at",
  async () => {
    const userId = await bootstrapUser("products-uncompleted");
    await initializeProducts(userId);

    await pool.query(
      `UPDATE product_routine_states
       SET next_unlock_at = NOW() - INTERVAL '1 hour'
       WHERE user_id = $1`,
      [userId]
    );

    const responses = await concurrent(
      20,
      () => getProductState(userId)
    );

    for (const response of responses) {
      for (const routineId of [
        "lumispa-10",
        "wellspa-10",
        "galvanicspa-10"
      ]) {
        assert.equal(
          response.state.routines[routineId].currentDay,
          1
        );
      }
    }

    const jobs = await pool.query(
      `SELECT COUNT(*)::integer AS count
       FROM routine_notification_jobs
       WHERE user_id = $1`,
      [userId]
    );

    assert.equal(jobs.rows[0].count, 0);
  }
);

test(
  "las tres rutinas de producto vencidas y completadas avanzan una sola vez bajo concurrencia",
  async () => {
    const userId = await bootstrapUser("products-due");
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

    await pool.query(
      `UPDATE product_routine_states
       SET next_unlock_at = NOW() - INTERVAL '1 second'
       WHERE user_id = $1`,
      [userId]
    );

    const responses = await concurrent(
      24,
      () => getProductState(userId)
    );

    for (const response of responses) {
      for (const routineId of routineIds) {
        assert.equal(
          response.state.routines[routineId].currentDay,
          2
        );
      }
    }

    await concurrent(
      24,
      () => getProductState(userId)
    );

    const states = await pool.query(
      `SELECT routine_id, current_day, next_unlock_at
       FROM product_routine_states
       WHERE user_id = $1
       ORDER BY routine_id`,
      [userId]
    );
    const jobs = await pool.query(
      `SELECT routine_id, day, COUNT(*)::integer AS count
       FROM routine_notification_jobs
       WHERE user_id = $1
       GROUP BY routine_id, day
       ORDER BY routine_id, day`,
      [userId]
    );

    assert.deepEqual(
      states.rows.map(row => ({
        routineId: row.routine_id,
        day: Number(row.current_day),
        nextUnlockAt: row.next_unlock_at
      })),
      [
        {
          routineId: "galvanicspa-10",
          day: 2,
          nextUnlockAt: null
        },
        {
          routineId: "lumispa-10",
          day: 2,
          nextUnlockAt: null
        },
        {
          routineId: "wellspa-10",
          day: 2,
          nextUnlockAt: null
        }
      ]
    );

    assert.deepEqual(
      jobs.rows.map(row => ({
        routineId: row.routine_id,
        day: Number(row.day),
        count: Number(row.count)
      })),
      [
        {
          routineId: "galvanicspa-10",
          day: 2,
          count: 1
        },
        {
          routineId: "lumispa-10",
          day: 2,
          count: 1
        },
        {
          routineId: "wellspa-10",
          day: 2,
          count: 1
        }
      ]
    );
  }
);
