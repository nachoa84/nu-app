"use strict";

// V171: executable contract baseline. No HTTP server, database connection,
// external service, or real browser storage is created by this suite.
// Expected red tests document defects; they must not be converted to skips.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const IDS = ["collagen-30", "lumispa-10", "wellspa-10", "galvanicspa-10"];
const USER_A = "fixture-account-a";
const USER_B = "fixture-account-b";
const AT = Date.parse("2026-09-07T10:00:00.000Z");

function between(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `Missing source boundary: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `Missing source boundary: ${end}`);
  return source.slice(from, to);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(), values
  };
}
function completedState(userId = USER_A, day = 3, completed = [1, 2, 3], cycle = 1) {
  return { userId, currentDay: day, cycle, completedDays: completed,
    completedAtByDay: { 1: AT, 2: AT, 3: AT }, nextUnlockAt: null,
    profile: { name: "Fixture", country: "ES", timezone: "Europe/Madrid", notificationTime: "09:00" } };
}
function productsState(userId = USER_A, day = 3, completed = [1, 2, 3]) {
  return { userId, routines: Object.fromEntries(IDS.slice(1).map(id => [id, {
    initialized: true, currentDay: day, nextUnlockAt: null,
    openedDays: {}, completedDays: completed, completedAtByDay: { 3: AT }
  }])) };
}

function backendHarness() {
  const store = storage({ routineUserProfile: JSON.stringify({ userId: USER_A, name: "Fixture" }) });
  const events = [], requests = [], listeners = new Map();
  let responder = async () => ({ ok: true, state: completedState() });
  const window = {
    addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
    dispatchEvent(event) { events.push(event); for (const fn of listeners.get(event.type) || []) fn(event); },
    setTimeout, clearTimeout
  };
  const context = vm.createContext({ window, localStorage: store,
    document: { readyState: "loading", visibilityState: "visible", addEventListener() {} },
    navigator: { onLine: true },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: async (url, options = {}) => {
      const request = { url: String(url), options }; requests.push(request);
      const result = await responder(request);
      if (result && typeof result.json === "function") return result;
      return { ok: result.ok !== false, status: result.status || 200,
        json: async () => result, headers: { get: () => null } };
    },
    console: { warn() {}, error() {}, log() {} },
    setTimeout: () => 1, clearTimeout() {},
    Date, JSON, Promise, Map, Set, Number, String, Error, URL, URLSearchParams
  });
  vm.runInContext(read("backend-client.js"), context, { filename: "backend-client.js" });
  return { api: window.BackendAPI, store, events, requests,
    respond(fn) { responder = fn; },
    setUser(userId) { store.setItem("routineUserProfile", JSON.stringify({ userId, name: "Fixture" })); },
    user() { return JSON.parse(store.getItem("routineUserProfile")).userId; },
    states(type) { return events.filter(event => event.type === type).map(event => event.detail); }
  };
}

function localStateHarness(routineId = "lumispa-10") {
  const store = storage({
    [`routineState:${routineId}`]: JSON.stringify({ currentDay: 3, openedDays: {}, nextUnlockAt: null }),
    routineState: JSON.stringify({ currentDay: 3, openedDays: {}, nextUnlockAt: null })
  });
  const calls = [];
  const api = {
    completeProductRoutineDay(...args) { calls.push(["complete", ...args]); return Promise.resolve(null); },
    openProductRoutineDay(...args) { calls.push(["open", ...args]); return Promise.resolve(null); }
  };
  const context = vm.createContext({
    window: { BackendAPI: api }, localStorage: store,
    getActiveRoutineId: () => routineId,
    getActiveRoutineConfig: () => ({ backend: routineId === "collagen-30", totalDays: routineId === "collagen-30" ? 30 : 10 }),
    isBackendManagedRoutine: () => routineId === "collagen-30",
    renderRoutineCardsV92a() {}, console: { warn() {} },
    Date, JSON, Number, String, Set, Map
  });
  vm.runInContext(read("routine-state.js"), context, { filename: "routine-state.js" });
  return { context, store, calls, api };
}

class Element {
  constructor(tag) {
    this.tagName = tag; this.className = ""; this.children = []; this.disabled = false;
    this.isConnected = true; this.attributes = new Map(); this._html = ""; this.textContent = "";
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => { if (force) classes.add(name); else classes.delete(name); }
    };
  }
  set innerHTML(value) { this._html = String(value); this.children = []; }
  get innerHTML() { return this._html; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  removeAttribute(key) { this.attributes.delete(key); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  append(...children) { this.children.push(...children); }
  appendChild(child) {
    this.append(child);
    return child;
  }
  querySelector(selector) {
    if (selector === ".app-checkin-btn") return this.checkin ||= new Element("button");
    if (selector === ".app-today-main") return this.main ||= new Element("button");
    if (selector === ".app-progress-fill") return this.fill ||= new Element("span");
    return null;
  }
}

function uiHarness(routineId) {
  const store = storage({
    routineState: JSON.stringify({ currentDay: 3, openedDays: {}, nextUnlockAt: null }),
    [`routineState:${routineId}`]: JSON.stringify({ currentDay: 3, openedDays: {}, nextUnlockAt: null }),
    routineUserProfile: JSON.stringify({ userId: USER_A, name: "Fixture" })
  });
  let active = routineId, userId = USER_A;
  const calls = [], wait = deferred();
  const api = {
    completeDay(day) { calls.push(["complete", "collagen-30", day]); return wait.promise; },
    completeProductRoutineDay(id, day) { calls.push(["complete", id, day]); return wait.promise; },
    getState: async () => completedState(userId, 3, [1, 2]),
    getProductRoutineStatesV136: async () => productsState(userId, 3, [1, 2])
  };
  const grid = new Element("div");
  const document = { createElement: tag => new Element(tag),
    getElementById: id => id === "daysGrid" ? grid : null };
  const config = () => ({ id: active, title: active, backend: active === "collagen-30", totalDays: active === "collagen-30" ? 30 : 10 });
  const context = vm.createContext({
    window: { BackendAPI: api }, document, localStorage: store,
    navigator: { vibrate() {} }, console: { warn() {}, error() {}, log() {} },
    getActiveRoutineId: () => active, getActiveRoutineConfig: config,
    isBackendManagedRoutine: () => active === "collagen-30",
    renderRoutineCardsV92a() {}, renderStructuredDayDetail() {}, renderFavorites() {},
    renderSelectedDayHeader() {}, ensureDemoControls() {}, advanceRoutineIfEligible() {},
    selectDay() {}, prefersReducedMotion: () => true, toast() {},
    requestAnimationFrame() {}, setTimeout() {},
    ICONS: { check: "✓", checkCircleFilled: "✓", arrow: "→", lock: "lock" },
    days: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, {}])),
    selectedDay: 3, isPreviewMode: false,
    Date, JSON, Number, String, Set, Map, Promise, Error
  });
  vm.runInContext(read("routine-state.js"), context, { filename: "routine-state.js" });
  const daily = read("daily-view.js");
  vm.runInContext(between(daily, "// NU APP · CONFIRMACIÓN DE PROGRESO COLLAGEN V170", "function createCompactMediaItem"), context);
  vm.runInContext(read("progress-view.js"), context);
  return { context, store, calls, wait, grid,
    card: () => context.createBlock({ type: "complete" }),
    calendar() { context.renderDays(); return grid.children[1].checkin; },
    complete: day => store.getItem(active === "collagen-30" ? `day${day}Complete` : `day:${active}:${day}:complete`) === "1",
    setUser(value) { userId = value; store.setItem("routineUserProfile", JSON.stringify({ userId: value, name: "Fixture" })); },
    setRoutine(value) { active = value; }
  };
}

// Expected red on cc6cc33. Assertions check observable behavior, not a
// speculative implementation name. Keep existing V170 regression tests intact.
for (const routineId of IDS.slice(1)) {
  test(`${routineId}: the day card does not confirm before the server`, async () => {
    const h = uiHarness(routineId), card = h.card();
    const task = card.children[0].onclick();
    try {
      assert.equal(h.complete(3), false, "Local progress was written before confirmation");
      assert.doesNotMatch(card.innerHTML, /Registrado\./);
      assert.equal(h.calls.length, 1);
    } finally {
      h.wait.resolve(productsState(USER_A));
      await Promise.resolve(task);
    }
  });
}

test("calendar: the check-in waits for confirmation and shares the pending operation", async () => {
  const h = uiHarness("lumispa-10"), card = h.card(), calendar = h.calendar();
  const first = card.children[0].onclick(), second = calendar.onclick();
  try {
    assert.equal(h.complete(3), false);
    assert.equal(h.calls.length, 1, "Two surfaces must not produce two POSTs");
  } finally {
    h.wait.resolve(productsState(USER_A));
    await Promise.all([Promise.resolve(first), Promise.resolve(second)]);
  }
});

test("local completion application does not trigger a product POST", () => {
  const h = localStateHarness();
  h.context.setDayComplete(3, true);
  assert.equal(h.store.getItem("day:lumispa-10:3:complete"), "1");
  assert.deepEqual(h.calls, [], "Applying a confirmed state must be network-free");
});

test("Collagen local completion helper does not issue a product request", () => {
  const h = localStateHarness("collagen-30");
  h.context.setDayComplete(3, true);
  assert.equal(h.store.getItem("day3Complete"), "1");
  assert.deepEqual(h.calls, []);
});

test("saving a product state does not implicitly open a day", () => {
  const h = localStateHarness();
  h.context.saveRoutineState({ currentDay: 3, openedDays: {}, nextUnlockAt: null });
  assert.deepEqual(h.calls, [], "State persistence must not issue a hidden POST");
});

test("Collagen: a late response cannot replace the current account", async () => {
  const h = backendHarness(), wait = deferred();
  h.respond(() => wait.promise);
  const task = h.api.completeDay(3);
  h.setUser(USER_B);
  wait.resolve({ ok: true, state: completedState(USER_A) });
  await task.catch(() => null);
  assert.equal(h.user(), USER_B);
  assert.equal(h.states("backend-state-updated").length, 0);
});

test("products: a late response cannot publish into another account", async () => {
  const h = backendHarness(), wait = deferred();
  h.respond(() => wait.promise);
  const task = h.api.completeProductRoutineDay("lumispa-10", 3);
  h.setUser(USER_B);
  wait.resolve({ ok: true, state: productsState(USER_A) });
  await task.catch(() => null);
  assert.equal(h.user(), USER_B);
  assert.equal(h.states("product-routines-state-updated").length, 0);
});

test("same-cycle responses cannot roll Collagen back to an older state", async () => {
  const h = backendHarness(), old = deferred(), current = deferred();
  h.respond(({ url }) => url.includes("/api/state/") ? old.promise : current.promise);
  const slow = h.api.getState(), fast = h.api.completeDay(4);
  current.resolve({ ok: true, state: completedState(USER_A, 5, [1, 2, 3, 4]) });
  await fast;
  old.resolve({ ok: true, state: completedState(USER_A, 3, [1, 2, 3]) });
  await slow;
  const states = h.states("backend-state-updated");
  assert.equal(states.at(-1).currentDay, 5);
  assert.ok(states.at(-1).completedDays.includes(4));
});

function serverFunction(name, end, dependencies = {}) {
  const source = between(read("server.js"), `async function ${name}(`, end);
  const context = vm.createContext({ Date, Number, String, Set, Map, Error, ...dependencies });
  return vm.runInContext(source + `\n${name}`, context);
}

test("Collagen state returns the server's original completion timestamps", async () => {
  const getState = serverFunction("getState", "async function recalculatePendingUnlock(");
  const user = { id: USER_A, current_day: 3, cycle: 1, next_unlock_at: null,
    name: "Fixture", country: "ES", timezone: "Europe/Madrid", notification_time: "09:00" };
  const db = { async query(sql) {
    if (sql.includes("FROM users")) return { rowCount: 1, rows: [user] };
    if (sql.includes("FROM day_progress")) return { rowCount: 1, rows: [{ day: 3, opened_at: new Date(AT - 1000), completed_at: new Date(AT) }] };
    throw new Error("Unexpected SQL: " + sql);
  } };
  const state = await getState(db, USER_A);
  assert.equal(state.completedAtByDay?.[3], AT);
});

test("product state returns the exact official timestamps for each routine", async () => {
  const getState = serverFunction("getProductRoutineStatesV98", 'app.post("/api/product-routines/bootstrap"', {
    PRODUCT_ROUTINE_IDS_V98: new Set(IDS.slice(1)), assertProductRoutineUserV98: async () => {}
  });
  const db = { async query(sql) {
    if (sql.includes("FROM product_routine_states")) return { rows: IDS.slice(1).map(routine_id => ({ routine_id, current_day: 3, next_unlock_at: null })) };
    if (sql.includes("FROM product_routine_day_progress")) return { rows: [{ routine_id: "lumispa-10", day: 3, opened_at: new Date(AT - 1000), completed_at: new Date(AT) }] };
    throw new Error("Unexpected SQL: " + sql);
  } };
  const state = await getState(db, USER_A);
  assert.equal(state.routines["lumispa-10"].completedAtByDay?.[3], AT);
  assert.equal(state.routines["wellspa-10"].completedAtByDay?.[3], undefined);
});

// Bootstrap tests use a fake transaction and a small in-memory table.
// No pg module, DATABASE_URL, or network connection is used.
async function runCollagenBootstrap({ existing, completedDays, completedAtByDay, currentDay = 3 }) {
  const source = between(read("server.js"), 'app.post(\n  "/api/bootstrap",', 'app.get(\n  "/api/state/:userId",');
  const rows = new Map(existing ? [[1, AT - 2 * 86400000], [2, AT - 86400000]] : []);
  const writes = [];
  let registered = existing;
  const user = { id: USER_A, cycle: 1, current_day: currentDay, created_at: new Date(AT - 10 * 86400000) };
  const db = { async query(sql, params = []) {
    if (sql.includes("SELECT *") && sql.includes("FROM users")) return { rowCount: registered ? 1 : 0, rows: registered ? [user] : [] };
    if (sql.includes("INSERT INTO users")) { registered = true; writes.push({ kind: "user", params }); return { rowCount: 1, rows: [] }; }
    if (sql.includes("SELECT cycle, current_day, created_at")) return { rowCount: 1, rows: [user] };
    if (sql.includes("INSERT INTO day_progress")) {
      if (sql.includes("completed_at")) {
        const day = Number(params[2]);
        if (!rows.has(day)) rows.set(day, new Date(params[3]).getTime());
        writes.push({ kind: "completion", day, at: rows.get(day) });
      } else writes.push({ kind: "open", params });
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("UPDATE users") && sql.includes("last_seen_at")) return { rowCount: 1, rows: [] };
    throw new Error("Unexpected SQL: " + sql);
  } };
  const handlers = new Map();
  const app = { post(route, handler) { handlers.set(route, handler); } };
  const context = vm.createContext({ app, Date, Number, String, Array, Object, Error,
    normalizeProfile: value => value, clampDay: value => Math.min(30, Math.max(1, Number(value || 1))),
    parseRoutineDay: value => { const day = Number(value); if (!Number.isInteger(day) || day < 1 || day > 30) throw new Error("Invalid day"); return day; },
    normalizeClientCompletedAt: value => new Date(Number(value)),
    withTransaction: async fn => fn(db),
    recalculatePendingUnlock: async () => {}, advanceIfEligible: async () => {},
    getState: async () => ({ ...completedState(USER_A, currentDay, [...rows.keys()]), completedAtByDay: Object.fromEntries(rows) })
  });
  vm.runInContext(source, context);
  const request = { body: {
    profile: { userId: USER_A, name: "Fixture", country: "ES", timezone: "Europe/Madrid", notificationTime: "09:00" },
    localState: { currentDay, openedDays: {} }, completedDays, completedAtByDay
  } };
  let payload, error;
  await handlers.get("/api/bootstrap")(request, { json(value) { payload = value; } }, value => { error = value; });
  if (error) throw error;
  return { payload, rows, writes };
}

test("established Collagen accounts do not promote an untrusted local completion", async () => {
  const result = await runCollagenBootstrap({ existing: true, completedDays: [1, 2, 3], completedAtByDay: { 3: AT } });
  assert.equal(result.rows.has(3), false, "An ordinary bootstrap must not certify an unconfirmed local tap");
});

test("a new Collagen account can recover legitimate historical progress", async () => {
  const result = await runCollagenBootstrap({ existing: false, completedDays: [1, 2, 3], completedAtByDay: { 1: AT - 2 * 86400000, 2: AT - 86400000, 3: AT } });
  assert.deepEqual([...result.rows.keys()], [1, 2, 3]);
  assert.equal(result.rows.get(3), AT);
});

async function runProductBootstrap({ initialized, completedDays, completedAtByDay }) {
  const source = between(read("server.js"),
    'app.post("/api/product-routines/bootstrap"',
    'app.get("/api/product-routines/state/:userId"');
  const rows = new Map(initialized ? [[1, AT - 2 * 86400000], [2, AT - 86400000]] : []);
  const writes = [];
  const states = new Set(initialized ? IDS.slice(1) : []);
  const db = { async query(sql, params = []) {
    if (sql.includes("SELECT created_at FROM users")) return { rowCount: 1, rows: [{ created_at: new Date(AT - 10 * 86400000) }] };
    if (sql.includes("SELECT current_day") && sql.includes("FROM product_routine_states")) {
      return { rowCount: states.has(params[1]) ? 1 : 0, rows: states.has(params[1]) ? [{ current_day: 3 }] : [] };
    }
    if (sql.includes("INSERT INTO product_routine_states")) { states.add(params[1]); return { rowCount: 1, rows: [] }; }
    if (sql.includes("INSERT INTO product_routine_day_progress")) {
      if (sql.includes("completed_at") && params[1] === "lumispa-10") {
        const day = Number(params[2]);
        if (!rows.has(day)) rows.set(day, new Date(params[3]).getTime());
        writes.push({ routineId: params[1], day });
      }
      return { rowCount: 1, rows: [] };
    }
    throw new Error("Unexpected SQL: " + sql);
  } };
  const handlers = new Map();
  const context = vm.createContext({
    app: { post(route, handler) { handlers.set(route, handler); } },
    Date, Number, String, Array, Object, Error,
    PRODUCT_ROUTINE_IDS_V98: new Set(IDS.slice(1)),
    assertProductRoutineUserV98: async () => {},
    parseProductRoutineDayV98: value => { const day = Number(value); if (!Number.isInteger(day) || day < 1 || day > 10) throw new Error("Invalid day"); return day; },
    normalizeClientCompletedAt: value => new Date(Number(value)),
    withTransaction: async fn => fn(db),
    recalculateProductRoutinePendingUnlock: async () => {},
    advanceProductRoutinesIfEligible: async () => {},
    getProductRoutineStatesV98: async () => ({ userId: USER_A, routines: {} })
  });
  vm.runInContext(source, context);
  let error;
  await handlers.get("/api/product-routines/bootstrap")({ body: {
    userId: USER_A, routines: {
      "lumispa-10": { currentDay: 3, openedDays: {}, completedDays, completedAtByDay }
    }
  } }, { json() {} }, value => { error = value; });
  if (error) throw error;
  return { rows, writes };
}

test("established product routines do not promote an untrusted local completion", async () => {
  const result = await runProductBootstrap({ initialized: true, completedDays: [1, 2, 3], completedAtByDay: { 3: AT } });
  assert.equal(result.rows.has(3), false);
});

test("a newly initialized product routine can recover legitimate historical progress", async () => {
  const result = await runProductBootstrap({ initialized: false, completedDays: [1, 2, 3], completedAtByDay: { 1: AT - 2 * 86400000, 2: AT - 86400000, 3: AT } });
  assert.deepEqual([...result.rows.keys()], [1, 2, 3]);
  assert.equal(result.rows.get(3), AT);
});
