"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRoutineActiveSyncV172 } = require("../routine-active-sync-v172");

function source(name) {
  return fs.readFileSync(path.join(__dirname, "..", name), "utf8");
}

function extractFunction(fileSource, functionName) {
  const marker = `function ${functionName}(`;
  const start = fileSource.indexOf(marker);
  assert.ok(start >= 0, `${functionName} no existe`);

  let brace = fileSource.indexOf("{", start);
  assert.ok(brace >= 0);
  let depth = 0;
  let end = -1;

  for (let i = brace; i < fileSource.length; i++) {
    if (fileSource[i] === "{") depth += 1;
    if (fileSource[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  assert.ok(end > start, `no se pudo extraer ${functionName}`);
  return fileSource.slice(start, end);
}

test(
  "V174 preserva evidencia local sólo para el día canónico actual no confirmado",
  () => {
    const stateSource = source("routine-state.js");
    const fnSource = extractFunction(
      stateSource,
      "shouldPreserveLocalCompletionV174"
    );

    const storage = new Map([
      ["day4Complete", "1"],
      ["day4CompletedAt", "1780000000000"],
      ["day3Complete", "1"],
      ["day3CompletedAt", "1770000000000"]
    ]);

    const context = {
      localStorage: {
        getItem(key) {
          return storage.has(key) ? storage.get(key) : null;
        }
      },
      Number
    };

    const fn = vm.runInNewContext(
      `(${fnSource})`,
      context
    );

    assert.equal(
      fn(4, 4, "day4Complete", "day4CompletedAt"),
      true
    );
    assert.equal(
      fn(3, 4, "day3Complete", "day3CompletedAt"),
      false
    );
    assert.equal(
      fn(5, 4, "day5Complete", "day5CompletedAt"),
      false
    );
  }
);

test(
  "V174 Collagen merge pasa currentDay para preservar evidencia local pendiente",
  () => {
    const sync = source("routine-sync.js");

    assert.match(
      sync,
      /replaceCompletedDays\([\s\S]*?serverState\.completedDays[\s\S]*?TOTAL_PROGRAM_DAYS[\s\S]*?serverState\.currentDay/
    );
  }
);

test(
  "V174 productos preservan evidencia local del currentDay ausente del snapshot",
  () => {
    const sync = source("routine-sync.js");

    assert.match(
      sync,
      /shouldPreserveLocalCompletionV174\(\s*day,\s*currentDay,\s*key,\s*completedAtKey\s*\)/
    );
  }
);

function activeHarness() {
  let now = 1_000_000;
  let id = 0;
  const timers = new Map();
  const calls = [];

  const controller = createRoutineActiveSyncV172({
    now: () => now,
    setTimeout(fn, ms) {
      const key = ++id;
      timers.set(key, { fn, at: now + ms });
      return key;
    },
    clearTimeout(key) {
      timers.delete(key);
    },
    getIdentity: () => "A",
    isVisible: () => true,
    isOnline: () => true,
    fetchCanonical: async identity => {
      calls.push(["canonical", identity]);
      return { userId: identity, currentDay: 2, nextUnlockAt: null };
    },
    fetchProducts: async identity => {
      calls.push(["products", identity]);
      return { userId: identity, routines: {} };
    },
    publishCanonical: state => state,
    publishProducts: state => state,
    onStatus() {},
    warn() {},
    jitter: () => 0
  });

  async function flush() {
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  async function advance(ms) {
    const end = now + ms;
    for (let n = 0; n < 1000; n++) {
      const entries = [...timers.entries()].sort((a,b) => a[1].at - b[1].at);
      if (!entries.length || entries[0][1].at > end) break;
      const [key, timer] = entries[0];
      timers.delete(key);
      now = timer.at;
      timer.fn();
      await flush();
    }
    now = end;
    await flush();
  }

  return { controller, calls, flush, advance };
}

test(
  "V174 bootstrap exitoso antes de 3s cancela GET pasivo diferido",
  async () => {
    const h = activeHarness();

    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    h.controller.onResume("pageshow");
    await h.flush();

    h.controller.rememberCanonical({
      userId: "A",
      currentDay: 2,
      nextUnlockAt: null
    });

    await h.advance(3000);

    assert.equal(
      h.calls.filter(call => call[0] === "canonical").length,
      0
    );
    assert.equal(
      h.calls.filter(call => call[0] === "products").length,
      0
    );
  }
);

test(
  "V174 bootstrap general y de productos usan request con timeout explícito",
  () => {
    const backend = source("backend-client.js");

    assert.match(
      backend,
      /const BOOTSTRAP_REQUEST_TIMEOUT_MS_V174\s*=\s*15000/
    );
    assert.match(
      backend,
      /requestWithTimeoutV174\(\s*"\/api\/bootstrap"/
    );
    assert.match(
      backend,
      /requestWithTimeoutV174\(\s*"\/api\/product-routines\/bootstrap"/
    );
  }
);
