"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Execute the actual completion controller, not a rewritten implementation.
const source = fs.readFileSync(path.join(__dirname, "..", "daily-view.js"), "utf8");
const start = source.indexOf("// NU APP · CONFIRMACIÓN DE PROGRESO COLLAGEN V170");
const end = source.indexOf("function createCompactMediaItem", start);
assert.ok(start >= 0 && end > start, "Falta el controlador V170");
const code = source.slice(start, end);

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.className = "";
    this.attributes = new Map();
    this.children = [];
    this.isConnected = true;
    this.disabled = false;
    this._html = "";
    this.textContent = "";
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name)
    };
  }
  set innerHTML(value) { this._html = String(value); this.children = []; }
  get innerHTML() { return this._html; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  removeAttribute(key) { this.attributes.delete(key); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  append(...children) { this.children.push(...children); }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const completed = new Set([1, 2]);
  const calls = [];
  const warnings = [];
  let selectedDay = 3;
  let current = null;
  let complete = async () => state([1, 2, 3]);
  let read = async () => state([1, 2]);
  function state(days, currentDay = 3) {
    return { userId: "test-user", currentDay, completedDays: days, nextUnlockAt: null };
  }
  function publish(serverState) {
    completed.clear();
    serverState.completedDays.forEach(day => completed.add(day));
    selectedDay = serverState.currentDay;
  }
  // Like BackendAPI, publish the canonical state before returning a response.
  const api = {
    async completeDay(day) {
      calls.push(day);
      const result = await complete(day);
      publish(result);
      return result;
    },
    async getState() {
      const result = await read();
      publish(result);
      return result;
    }
  };
  const context = vm.createContext({
    window: { BackendAPI: api },
    document: { createElement: tag => new Element(tag) },
    navigator: { vibrate() {} },
    console: { warn: (...args) => warnings.push(args) },
    setTimeout() {},
    Map, Set, Number, String, Promise, Error,
    ICONS: { check: "✓", arrow: "→" },
    getRoutineProfile: () => ({ userId: "test-user" }),
    getActiveRoutineId: () => "collagen-30",
    isBackendManagedRoutine: () => true,
    isDayComplete: day => completed.has(day),
    setDayComplete: (day, value) => value ? completed.add(day) : completed.delete(day),
    renderDays() {},
    renderStructuredDayDetail() { redraw(); },
    prefersReducedMotion: () => true,
    toast() {},
    get selectedDay() { return selectedDay; },
    set selectedDay(value) { selectedDay = value; }
  });
  vm.runInContext(code, context);
  function redraw() {
    if (current) current.isConnected = false;
    current = context.createBlock({ type: "complete" });
    return current;
  }
  return {
    redraw, state, calls, warnings, completed,
    current: () => current,
    button: card => card.children[0],
    helper: card => card.children[1],
    setComplete: fn => { complete = fn; },
    setRead: fn => { read = fn; },
    select: day => { selectedDay = day; }
  };
}

test("error tras redibujar: conserva el aviso y permite reintentar", async () => {
  const h = harness();
  const wait = deferred();
  h.setComplete(() => wait.promise);
  const original = h.redraw();
  const task = h.button(original).onclick();
  const redrawn = h.redraw();
  assert.equal(h.button(redrawn).disabled, true);
  assert.equal(redrawn.getAttribute("aria-busy"), "true");
  h.button(redrawn).onclick();
  assert.equal(h.calls.length, 1, "No debe haber un segundo POST pendiente");
  wait.reject(new Error("NetworkError"));
  await task;
  const visible = h.current();
  assert.equal(h.completed.has(3), false);
  assert.equal(h.button(visible).disabled, false);
  assert.match(h.button(visible).innerHTML, /Volver a intentar/);
  assert.equal(h.helper(visible).getAttribute("role"), "alert");
  assert.match(h.helper(visible).textContent, /No pudimos confirmar/);
  assert.equal(h.calls.length, 1);
  h.setComplete(async () => h.state([1, 2, 3]));
  await h.button(visible).onclick();
  assert.equal(h.completed.has(3), true);
  assert.match(h.current().innerHTML, /Registrado\./);
  assert.equal(h.calls.length, 2);
});

test("éxito tras redibujar: confirma en la vista nueva sin repetir el POST", async () => {
  const h = harness();
  const wait = deferred();
  h.setComplete(() => wait.promise);
  const original = h.redraw();
  const task = h.button(original).onclick();
  h.redraw();
  wait.resolve(h.state([1, 2, 3]));
  await task;
  assert.equal(h.completed.has(3), true);
  assert.match(h.current().innerHTML, /Registrado\./);
  assert.equal(h.calls.length, 1);
});

test("error al cambiar de día: no reemplaza la pantalla actual", async () => {
  const h = harness();
  const wait = deferred();
  h.setComplete(() => wait.promise);
  h.setRead(async () => h.state([1, 2], 4));
  const original = h.redraw();
  const task = h.button(original).onclick();
  h.select(4);
  const other = h.redraw();
  wait.reject(new Error("NetworkError"));
  await task;
  assert.equal(h.current(), other);
  assert.equal(h.completed.has(3), false);
  assert.equal(h.calls.length, 1);
});
