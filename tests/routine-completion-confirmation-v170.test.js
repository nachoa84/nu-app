"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "daily-view.js"), "utf8");
const marker = "// NU APP · CONFIRMACIÓN DE PROGRESO V171";
const start = source.indexOf(marker);
const end = source.indexOf("function createCompactMediaItem", start);
assert.ok(start >= 0, "Falta el controlador de confirmación V171");
const code = source.slice(start, end >= 0 ? end : undefined);

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.className = "";
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      contains: name => this.classes.has(name) || this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        if (force) this.classes.add(name);
        else this.classes.delete(name);
      }
    };
    this.attributes = new Map();
    this.children = [];
    this.isConnected = true;
    this.disabled = false;
    this._html = "";
    this.textContent = "";
  }
  set innerHTML(value) {
    this._html = String(value);
    this.children = [];
  }
  get innerHTML() { return this._html; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...children) { this.children.push(...children); }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ backend = true, routineId = "collagen-30", initial = [] } = {}) {
  const storage = new Map();
  const writes = [];
  const warnings = [];
  const calls = { complete: [], getState: 0, render: 0, detail: 0, vibrate: 0 };
  let selectedDay = 3;
  let activeRoutine = routineId;
  let userId = "test-user";
  let complete = async () => state([1, 2, 3]);
  let getState = async () => state([1, 2]);
  let api = null;

  function state(completedDays, currentDay = 3) {
    if (activeRoutine !== "collagen-30") {
      return {
        userId,
        routines: {
          [activeRoutine]: {
            initialized: true,
            currentDay,
            completedDays,
            nextUnlockAt: null
          }
        }
      };
    }

    return { userId, currentDay, completedDays, nextUnlockAt: null };
  }
  function persist(day, value) {
    writes.push([day, value]);
    if (value) {
      storage.set(day, true);
      if (!storage.has(`at:${day}`)) storage.set(`at:${day}`, Date.now());
    } else {
      storage.delete(day);
      storage.delete(`at:${day}`);
    }
  }
  function publish(serverState) {
    for (let day = 1; day <= 30; day++) {
      if (serverState.completedDays.includes(day)) persist(day, true);
      else persist(day, false);
    }
    selectedDay = serverState.currentDay;
  }
  for (const day of initial) persist(day, true);
  writes.length = 0;
  function makeApi() {
    return {
      async completeDay(day) {
        calls.complete.push(day);
        return complete(day);
      },
      async getState() {
        calls.getState++;
        return getState();
      },
      async completeProductRoutineDay(routineId, day) {
        calls.complete.push(day);
        return complete(day);
      },
      async getProductRoutineStatesV136() {
        calls.getState++;
        return getState();
      }
    };
  }
  api = backend ? makeApi() : null;
  const window = {};
  Object.defineProperty(window, "BackendAPI", { get: () => api });
  const context = vm.createContext({
    window,
    document: { createElement: tag => new Element(tag) },
    navigator: { vibrate: () => { calls.vibrate++; } },
    console: { warn: (...args) => warnings.push(args), log() {}, error() {} },
    setTimeout() {},
    Map, Number, String, Promise, Error,
    ICONS: { check: "✓", arrow: "→" },
    getRoutineProfile: () => ({ userId }),
    getActiveRoutineId: () => activeRoutine,
    isBackendManagedRoutine: () => activeRoutine === "collagen-30",
    isDayComplete: day => storage.get(day) === true,
    setDayComplete: persist,
    renderDays: () => { calls.render++; },
    renderStructuredDayDetail: () => { calls.detail++; },
    prefersReducedMotion: () => true,
    toast() {},
    get selectedDay() { return selectedDay; },
    set selectedDay(value) { selectedDay = value; }
  });
  vm.runInContext(code, context);
  function card() {
    return context.createBlock({ type: "complete" });
  }
  return {
    card, state, publish, calls, warnings, writes, storage,
    setComplete(fn) { complete = fn; },
    setGetState(fn) { getState = fn; },
    setBackend(value) { api = value ? makeApi() : null; },
    setUserId(value) { userId = value; },
    setRoutineId(value) { activeRoutine = value; },
    setSelectedDay(value) { selectedDay = value; },
    isComplete: day => storage.get(day) === true
  };
}

function button(card) { return card.children[0]; }
function helper(card) { return card.children[1]; }
function assertPending(h, card) {
  assert.equal(h.isComplete(3), false);
  assert.equal(h.storage.has("at:3"), false);
  assert.doesNotMatch(card.innerHTML, /Registrado\./);
  assert.equal(button(card).disabled, true);
  assert.equal(card.getAttribute("aria-busy"), "true");
}

// Reproduce the actual pre-fix handler, kept as a regression fixture.
test("reproducción: el handler anterior confirmaba aunque fallara la red", async () => {
  const old = fs.readFileSync(path.join(__dirname, "fixtures", "routine-completion-v169.js"), "utf8");
  const h = harness();
  const context = vm.createContext({
    window: { BackendAPI: { completeDay: async () => { throw new Error("offline"); } } },
    document: { createElement: tag => new Element(tag) },
    navigator: {},
    console: { warn() {} },
    setTimeout() {},
    ICONS: { check: "✓" },
    selectedDay: 3,
    isDayComplete: () => false,
    isBackendManagedRoutine: () => true,
    setDayComplete: (day, value) => h.writes.push([day, value]),
    renderDays() {},
    prefersReducedMotion: () => true
  });
  vm.runInContext(old, context);
  const card = context.createBlock({ type: "complete" });
  button(card).onclick();
  await Promise.resolve();
  assert.match(card.innerHTML, /Registrado\./);
  assert.deepEqual(h.writes, [[3, true]]);
});

test("red fallida: no confirma ni persiste y permite reintentar", async () => {
  const h = harness();
  h.setComplete(async () => { throw new TypeError("Failed to fetch"); });
  const card = h.card();
  await button(card).onclick();
  assert.equal(h.isComplete(3), false);
  assert.equal(h.storage.has("at:3"), false);
  assert.doesNotMatch(card.innerHTML, /Registrado\./);
  assert.equal(button(card).disabled, false);
  assert.match(button(card).innerHTML, /Volver a intentar/);
  assert.equal(helper(card).getAttribute("role"), "alert");
  assert.equal(h.calls.complete.length, 1);
  assert.equal(h.calls.getState, 1);
  h.setComplete(async () => h.state([1, 2, 3]));
  await button(card).onclick();
  assert.equal(h.isComplete(3), true);
  assert.match(card.innerHTML, /Registrado\./);
  assert.equal(h.calls.complete.length, 2);
});

test("solicitud pendiente: no hay confirmación anticipada ni doble POST", async () => {
  const h = harness();
  const wait = deferred();
  h.setComplete(() => wait.promise);
  const card = h.card();
  const first = button(card).onclick();
  assertPending(h, card);
  button(card).onclick();
  const rerendered = h.card();
  assertPending(h, rerendered);
  assert.equal(h.calls.complete.length, 1);
  wait.resolve(h.state([1, 2, 3]));
  await first;
  assert.equal(h.isComplete(3), true);
  assert.match(card.innerHTML, /Registrado\./);
  assert.equal(h.calls.complete.length, 1);
});

test("HTTP 500 después del COMMIT: GET confirma sin repetir el POST", async () => {
  const h = harness();
  h.setComplete(async () => { throw new Error("Error HTTP 500"); });
  h.setGetState(async () => h.state([1, 2, 3]));
  const card = h.card();
  await button(card).onclick();
  assert.equal(h.isComplete(3), true);
  assert.match(card.innerHTML, /Registrado\./);
  assert.equal(h.calls.complete.length, 1);
  assert.equal(h.calls.getState, 1);
});

test("409 con día ya completado: recupera el estado oficial", async () => {
  const h = harness();
  h.setComplete(async () => { throw new Error("Error HTTP 409"); });
  h.setGetState(async () => h.state([1, 2, 3]));
  const card = h.card();
  await button(card).onclick();
  assert.equal(h.isComplete(3), true);
  assert.equal(h.calls.complete.length, 1);
});

test("409 sin confirmación: conserva el día pendiente", async () => {
  const h = harness();
  h.setComplete(async () => { throw new Error("Error HTTP 409"); });
  const card = h.card();
  await button(card).onclick();
  assert.equal(h.isComplete(3), false);
  assert.match(button(card).innerHTML, /Volver a intentar/);
});

test("HTTP 200 sin día confirmado: verifica y no acepta un falso éxito", async () => {
  const h = harness();
  h.setComplete(async () => h.state([1, 2]));
  const card = h.card();
  await button(card).onclick();
  assert.equal(h.isComplete(3), false);
  assert.equal(h.calls.getState, 1);
});

test("sin backend: no registra localmente Collagen", async () => {
  const h = harness({ backend: false });
  const card = h.card();
  await button(card).onclick();
  assert.equal(h.isComplete(3), false);
  assert.match(button(card).innerHTML, /Volver a intentar/);
});

test("cambio de cuenta: no aplica una respuesta de otro usuario", async () => {
  const h = harness();
  const wait = deferred();
  h.setComplete(() => wait.promise);
  const card = h.card();
  const task = button(card).onclick();
  h.setUserId("other-user");
  wait.resolve({ userId: "test-user", currentDay: 3, completedDays: [1, 2, 3] });
  await task;
  assert.equal(h.isComplete(3), false);
});

test("las rutinas de producto ya no confirman antes del servidor", async () => {
  const h = harness({ routineId: "lumispa-10" });
  const wait = deferred();

  h.calls.completeProduct = [];
  h.setComplete(() => wait.promise);

  const card = h.card();
  const task = button(card).onclick();

  assertPending(h, card);
  assert.equal(h.isComplete(3), false);

  wait.resolve({
    userId: "test-user",
    routines: {
      "lumispa-10": {
        initialized: true,
        currentDay: 3,
        completedDays: [1, 2, 3]
      }
    }
  });

  await task;
  assert.equal(h.isComplete(3), true);
  assert.match(card.innerHTML, /Registrado\./);
});

test("la confirmación no calcula ni adelanta días localmente", () => {
  assert.doesNotMatch(code, /setInterval\s*\(/);
  assert.doesNotMatch(code, /nextUnlockTimestampFromProfile\s*\(/);
  assert.doesNotMatch(code, /advanceRoutineIfEligible\s*\(/);
  assert.match(code, /await confirmRoutineDayV171\(day, routineId\)/);
});
