"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRoutineActiveSyncV172 } = require("../routine-active-sync-v172");

function source(name) {
  return fs.readFileSync(path.join(__dirname, "..", name), "utf8");
}

function harness() {
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
  "audit: pageshow temprano seguido por bootstrap exitoso todavía deja un GET diferido",
  async () => {
    const h = harness();

    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    h.controller.onResume("pageshow");
    await h.flush();

    // Bootstrap termina bien antes de cerrar la gracia inicial.
    h.controller.rememberCanonical({
      userId: "A",
      currentDay: 2,
      nextUnlockAt: null
    });

    await h.advance(3000);

    assert.equal(
      h.calls.filter(call => call[0] === "canonical").length,
      1,
      "el pending temprano no se canceló al llegar el snapshot exitoso"
    );
  }
);

test(
  "audit: Collagen reemplaza completados locales por completedDays del servidor",
  () => {
    const sync = source("routine-sync.js");

    assert.match(
      sync,
      /replaceCompletedDays\(\s*serverState\.completedDays \|\| \[\],/
    );

    const routineState = source("routine-state.js");
    assert.match(
      routineState,
      /else \{\s*localStorage\.removeItem\(completeKey\);\s*localStorage\.removeItem\(completedAtKey\);/
    );
  }
);

test(
  "audit: productos eliminan evidencia local ausente del snapshot canónico",
  () => {
    const sync = source("routine-sync.js");

    assert.match(
      sync,
      /if \(\(serverState\.completedDays \|\| \[\]\)\.includes\(day\)\) \{[\s\S]*?\} else \{[\s\S]*?localStorage\.removeItem\(key\);[\s\S]*?localStorage\.removeItem\(completedAtKey\);/
    );
  }
);

test(
  "audit: bootstrap general usa fetch sin timeout propio",
  () => {
    const backend = source("backend-client.js");
    const requestStart = backend.indexOf("async function request(path, options = {})");
    const requestEnd = backend.indexOf("function syncProfileFromState", requestStart);
    const requestSection = backend.slice(requestStart, requestEnd);

    assert.doesNotMatch(requestSection, /AbortController/);
    assert.doesNotMatch(requestSection, /setTimeout/);
  }
);

test(
  "audit: fallo de bootstrap de productos se reporta conectado antes de esperar recuperación",
  () => {
    const backend = source("backend-client.js");
    const start = backend.indexOf("async function bootstrapFromLocal()");
    const end = backend.indexOf("async function getState()", start);
    const section = backend.slice(start, end);

    const recovery = section.indexOf('"product-bootstrap-failed"');
    const connected = section.indexOf("connected: true");

    assert.ok(recovery >= 0);
    assert.ok(connected > recovery);
    assert.doesNotMatch(
      section.slice(recovery, connected),
      /await\s+refreshActiveState/
    );
  }
);
