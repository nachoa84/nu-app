"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "backend-client.js"),
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

function createHarness({ withProductState = false } = {}) {
  let now = 1_000_000;
  let timerId = 0;

  class FakeDate extends Date {
    static now() {
      return now;
    }
  }

  const window = new EventHub();
  const document = new EventHub();
  document.readyState = "complete";
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

  vm.runInContext(
    source,
    vm.createContext({
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
      encodeURIComponent
    })
  );

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

test("pageshow reconcilia el estado y evita llamadas duplicadas inmediatas", async () => {
  const harness = createHarness({
    withProductState: true
  });

  harness.advance(5000);
  harness.window.dispatchEvent({
    type: "pageshow"
  });

  await flushAsync();
  await flushAsync();

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

  await flushAsync();

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

  await flushAsync();
  await flushAsync();

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
      currentDay: 2,
      nextUnlockAt: target
    }
  });

  assert.equal(harness.timers.size, 1);

  const timer = [...harness.timers.values()][0];
  assert.ok(timer.delay >= 1000);

  harness.advance(2000);
  timer.fn();

  await flushAsync();
  await flushAsync();

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
  await flushAsync();
  await flushAsync();

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
