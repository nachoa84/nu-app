"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "..", "routine-active-sync-v172.js"),
  "utf8"
);

const source = fs.readFileSync(
  path.join(__dirname, "..", "backend-client.js"),
  "utf8"
);
const indexSource = fs.readFileSync(
  path.join(__dirname, "..", "index.html"),
  "utf8"
);
const serviceWorkerSource = fs.readFileSync(
  path.join(__dirname, "..", "service-worker.js"),
  "utf8"
);

class EventHub {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const current = this.listeners.get(type) || [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  dispatchEvent(event) {
    const current = this.listeners.get(event.type) || [];
    current.forEach(listener => listener(event));
    return true;
  }
}

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

function flushAsync() {
  return new Promise(resolve => setImmediate(resolve));
}

async function flushAll() {
  for (let index = 0; index < 8; index++) {
    await flushAsync();
  }
}

function createHarness({
  withProductState = false,
  readyState = "complete"
} = {}) {
  let now = 1_000_000;
  let timerId = 0;

  class FakeDate extends Date {
    static now() {
      return now;
    }
  }

  const window = new EventHub();
  const document = new EventHub();
  document.readyState = readyState;
  document.visibilityState = "visible";

  const storage = new Map([
    [
      "routineUserProfile",
      JSON.stringify({
        userId: "user-test",
        name: "Test",
        country: "España",
        timezone: "Europe/Madrid",
        notificationTime: "09:00"
      })
    ]
  ]);

  if (withProductState) {
    storage.set(
      "routineState:wellspa-10",
      JSON.stringify({
        currentDay: 2,
        openedDays: {},
        nextUnlockAt: null
      })
    );
  }

  const localStorage = {
    getItem(key) {
      return storage.has(key)
        ? storage.get(key)
        : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    }
  };

  const timers = new Map();

  function fakeSetTimeout(fn, delay) {
    timerId += 1;
    timers.set(timerId, {
      fn,
      delay: Number(delay)
    });
    return timerId;
  }

  function fakeClearTimeout(id) {
    timers.delete(id);
  }

  const calls = [];
  const statePayload = () => ({
    state: {
      userId: "user-test",
      currentDay: 3,
      nextUnlockAt: null,
      openedDays: {},
      completedDays: [1, 2],
      profile: {
        name: "Test",
        country: "España",
        timezone: "Europe/Madrid",
        notificationTime: "09:00"
      }
    }
  });

  async function fakeFetch(requestPath, options = {}) {
    const requestUrl = String(requestPath);
    calls.push({
      path: requestUrl,
      method: options.method || "GET"
    });

    let payload = statePayload();

    if (requestUrl.startsWith("/api/product-routines/state/")) {
      payload = {
        state: {
          routines: {
            "wellspa-10": {
              initialized: true,
              currentDay: 2,
              nextUnlockAt: null,
              openedDays: {},
              completedDays: [1]
            }
          }
        }
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return payload;
      }
    };
  }

  window.crypto = {
    randomUUID() {
      return "generated-user";
    }
  };

  const navigator = {
    onLine: true
  };

  const context = vm.createContext({
      window,
      document,
      navigator,
      localStorage,
      fetch: fakeFetch,
      CustomEvent: FakeCustomEvent,
      Date: FakeDate,
      Math,
      console: {
        warn() {},
        error() {},
        log() {}
      },
      setTimeout: fakeSetTimeout,
      clearTimeout: fakeClearTimeout,
      AbortController,
      encodeURIComponent
    });

  vm.runInContext(controllerSource, context);
  vm.runInContext(source, context);

  return {
    window,
    document,
    navigator,
    calls,
    timers,
    advance(ms) {
      now += ms;
    },
    clearCalls() {
      calls.length = 0;
    }
  };
}

test("la sincronización activa no usa polling", () => {
  assert.doesNotMatch(
    source,
    /setInterval\s*\(/
  );
});

test("V169 fue reemplazado por una única instancia del coordinador V172", () => {
  assert.doesNotMatch(
    source,
    /SINCRONIZACIÓN ACTIVA DE ESTADO V169|ACTIVE_SYNC_PASSIVE_MIN_MS/
  );
  assert.equal(
    source.match(/activeSyncFactoryV172\(\{/g)?.length,
    1
  );
});

test("index y service worker cargan una sola versión V172 antes del adaptador", () => {
  const controllerAsset =
    "routine-active-sync-v172.js?v=172-progress-stabilization";
  const backendAsset =
    "backend-client.js?v=172-progress-stabilization";

  assert.ok(
    indexSource.indexOf(controllerAsset) <
      indexSource.indexOf(backendAsset)
  );
  assert.equal(
    indexSource.match(/routine-active-sync-v172\.js/g)?.length,
    1
  );
  assert.equal(
    serviceWorkerSource.match(/routine-active-sync-v172\.js/g)?.length,
    1
  );
  assert.match(
    serviceWorkerSource,
    /const CACHE="nuapp-v172-progress-stabilization"/
  );
  assert.match(serviceWorkerSource, new RegExp(controllerAsset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(serviceWorkerSource, new RegExp(backendAsset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("DOMContentLoaded conserva el bootstrap y no agrega lecturas iniciales duplicadas", async () => {
  const harness = createHarness({
    readyState: "loading"
  });

  harness.window.dispatchEvent({
    type: "DOMContentLoaded"
  });
  await flushAll();
  harness.window.dispatchEvent({
    type: "pageshow",
    persisted: false
  });
  await flushAll();

  assert.equal(
    harness.calls.filter(call =>
      call.path === "/api/bootstrap" &&
      call.method === "POST"
    ).length,
    1
  );
  assert.equal(
    harness.calls.filter(call =>
      call.path === "/api/product-routines/bootstrap" &&
      call.method === "POST"
    ).length,
    1
  );
  assert.equal(
    harness.calls.filter(call =>
      call.path.startsWith("/api/state/") ||
      call.path.startsWith("/api/product-routines/state/")
    ).length,
    0
  );
  assert.equal(harness.timers.size, 0);
});

test("pageshow reconcilia el estado y evita llamadas duplicadas inmediatas", async () => {
  const harness = createHarness({
    withProductState: true
  });

  harness.advance(5000);
  harness.window.dispatchEvent({
    type: "pageshow"
  });

  await flushAll();

  assert.equal(
    harness.calls.filter(call =>
      call.path.startsWith("/api/state/")
    ).length,
    1
  );

  assert.equal(
    harness.calls.filter(call =>
      call.path.startsWith("/api/product-routines/state/")
    ).length,
    1
  );

  harness.window.dispatchEvent({
    type: "focus"
  });

  await flushAll();

  assert.equal(
    harness.calls.filter(call =>
      call.path.startsWith("/api/state/")
    ).length,
    1
  );
});

test("visibilitychange refresca al volver a primer plano, no mientras está oculta", async () => {
  const harness = createHarness();
  harness.advance(5000);

  harness.document.visibilityState = "hidden";
  harness.document.dispatchEvent({
    type: "visibilitychange"
  });

  await flushAsync();
  assert.equal(harness.calls.length, 0);

  harness.document.visibilityState = "visible";
  harness.document.dispatchEvent({
    type: "visibilitychange"
  });

  await flushAll();

  assert.equal(
    harness.calls.filter(call =>
      call.path.startsWith("/api/state/")
    ).length,
    1
  );
});

test("un nextUnlockAt confirmado programa una única reconciliación al vencer", async () => {
  const harness = createHarness();
  const target = 1_001_000;

  harness.window.dispatchEvent({
    type: "backend-state-updated",
    detail: {
      userId: "user-test",
      currentDay: 2,
      nextUnlockAt: target
    }
  });

  assert.equal(harness.timers.size, 1);

  const timer = [...harness.timers.values()][0];
  assert.ok(timer.delay >= 1000);

  harness.advance(2000);
  timer.fn();

  await flushAll();

  assert.equal(
    harness.calls.filter(call =>
      call.path.startsWith("/api/state/")
    ).length,
    1
  );
});

test("al recuperar conexión se fuerza una reconciliación aunque haya una reciente", async () => {
  const harness = createHarness();

  harness.window.dispatchEvent({
    type: "online"
  });
  await flushAll();

  harness.window.dispatchEvent({
    type: "online"
  });
  await flushAsync();
  await flushAsync();

  assert.equal(
    harness.calls.filter(call =>
      call.path.startsWith("/api/state/")
    ).length,
    2
  );
});
