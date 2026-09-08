"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createController, isConfirmed } = require("../routine-completion-core-v171");

const IDS = ["collagen-30", "lumispa-10", "wellspa-10", "galvanicspa-10"];
const A = "fixture-a", B = "fixture-b";
const input = (routineId = IDS[0], day = 3, userId = A, cycle = 1) =>
  ({ userId, routineId, day, cycle, currentDay: day });
const state = (identity, completed = [1, 2, 3], currentDay = identity.currentDay) => {
  const routine = { initialized: true, currentDay, completedDays: completed };
  return identity.routineId === IDS[0]
    ? { userId: identity.userId, cycle: identity.cycle, ...routine }
    : { userId: identity.userId, routines: { [identity.routineId]: routine } };
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function harness() {
  let session = { userId: A, epoch: 0 };
  let submit = async id => state(id);
  let read = async id => state(id, [1, 2]);
  let accept = (value, id) => value;
  const calls = [], events = [];
  const controller = createController({
    getSession: () => ({ ...session }),
    transport: {
      complete(id) { calls.push(["POST", id]); return submit(id); },
      read(id) { calls.push(["GET", id]); return read(id); },
      accept(value, id) { calls.push(["ACCEPT", id]); return accept(value, id); }
    },
    onChange: event => events.push(event)
  });
  return { controller, calls, events,
    submit(fn) { submit = fn; }, read(fn) { read = fn; }, accept(fn) { accept = fn; },
    session(userId, epoch) { session = { userId, epoch }; },
    counts() { return { post: calls.filter(x => x[0] === "POST").length,
      get: calls.filter(x => x[0] === "GET").length,
      accept: calls.filter(x => x[0] === "ACCEPT").length }; }
  };
}

for (const id of IDS) {
  test(`${id}: confirms only after the accepted canonical state`, async () => {
    const h = harness(), wait = deferred();
    h.submit(() => wait.promise);
    const task = h.controller.complete(input(id));
    assert.equal(h.controller.status(input(id)).phase, "pending");
    assert.equal(h.events.some(e => e.phase === "confirmed"), false);
    await Promise.resolve();
    assert.equal(h.counts().post, 1);
    wait.resolve(state(input(id)));
    const result = await task;
    assert.equal(isConfirmed(result.state, result.identity), true);
    assert.equal(result.reconciled, false);
    assert.equal(h.counts().get, 0);
    assert.equal(h.events.at(-1).phase, "confirmed");
    assert.equal(h.controller.status(input(id)).phase, "idle");
  });
}

test("two surfaces share the same promise and issue one POST", async () => {
  const h = harness(), wait = deferred();
  h.submit(() => wait.promise);
  const a = h.controller.complete(input(IDS[1]));
  const b = h.controller.complete(input(IDS[1]));
  assert.strictEqual(a, b);
  await Promise.resolve();
  assert.equal(h.counts().post, 1);
  wait.resolve(state(input(IDS[1])));
  await Promise.all([a, b]);
});

test("identity separates products, days, cycles, accounts and sessions", async () => {
  const h = harness(), waits = [];
  h.submit(() => { const d = deferred(); waits.push(d); return d.promise; });
  const a = h.controller.complete(input(IDS[1]));
  const b = h.controller.complete(input(IDS[2]));
  const c = h.controller.complete(input(IDS[1], 4));
  const d = h.controller.complete(input(IDS[0], 3, A, 2));
  await Promise.resolve();
  assert.equal(h.counts().post, 4);
  const ids = h.calls.filter(x => x[0] === "POST").map(x => x[1]);
  waits.forEach((wait, i) => wait.resolve(state(ids[i], [1, 2, 3, 4])));
  await Promise.all([a, b, c, d]);
  assert.equal(h.counts().get, 0);
});

test("a 500 after COMMIT is reconciled by one GET, never another POST", async () => {
  const h = harness();
  h.submit(async () => { throw new Error("HTTP 500"); });
  h.read(async id => state(id));
  const result = await h.controller.complete(input());
  assert.equal(result.reconciled, true);
  assert.deepEqual(h.counts(), { post: 1, get: 1, accept: 1 });
});

test("409 already completed reconciles; a missing completion remains retryable", async () => {
  const h = harness();
  h.submit(async () => { throw new Error("HTTP 409"); });
  h.read(async id => state(id));
  await h.controller.complete(input(IDS[2]));
  assert.equal(h.counts().post, 1);
  h.read(async id => state(id, [1, 2]));
  await assert.rejects(h.controller.complete(input(IDS[2])), { code: "UNCONFIRMED" });
  assert.equal(h.controller.status(input(IDS[2])).phase, "failed");
  assert.deepEqual(h.counts(), { post: 2, get: 2, accept: 1 });
});

test("HTTP 200 without the requested completion is not success", async () => {
  const h = harness();
  h.submit(async id => state(id, [1, 2]));
  await assert.rejects(h.controller.complete(input()), { code: "UNCONFIRMED" });
  assert.deepEqual(h.counts(), { post: 1, get: 1, accept: 0 });
  assert.equal(h.events.some(e => e.phase === "confirmed"), false);
});

test("wrong user, cycle, routine, or future-day proof is rejected", async () => {
  for (const invalid of [
    { userId: B, cycle: 1, currentDay: 3, completedDays: [3] },
    { userId: A, cycle: 2, currentDay: 3, completedDays: [3] },
    { userId: A, cycle: 1, currentDay: 2, completedDays: [3] },
    { userId: A, routines: { [IDS[2]]: { initialized: true, currentDay: 3, completedDays: [3] } } }
  ]) {
    const h = harness();
    h.submit(async () => invalid);
    h.read(async () => invalid);
    await assert.rejects(h.controller.complete(input()), { code: "UNCONFIRMED" });
    assert.equal(h.counts().accept, 0);
  }
});

test("a changed session cannot send, accept, or notify success", async () => {
  const h = harness(), wait = deferred();
  h.submit(() => wait.promise);
  const task = h.controller.complete(input());
  await Promise.resolve();
  h.session(B, 1);
  wait.resolve(state(input()));
  await assert.rejects(task, { code: "SESSION_CHANGED" });
  assert.equal(h.counts().accept, 0);
  assert.equal(h.counts().get, 0);
  assert.equal(h.events.some(e => e.phase === "confirmed"), false);
});

test("returning to the same account does not revive an old session", async () => {
  const h = harness(), wait = deferred();
  h.submit(() => wait.promise);
  const task = h.controller.complete(input());
  await Promise.resolve();
  h.session(B, 1);
  h.session(A, 2);
  wait.resolve(state(input()));
  await assert.rejects(task, { code: "SESSION_CHANGED" });
  assert.equal(h.counts().accept, 0);
  await h.controller.complete(input());
  assert.equal(h.counts().post, 2);
});

test("rejected stale publications reconcile once; a newer accepted state can confirm", async () => {
  const h = harness();
  let first = true;
  h.accept((value, id) => {
    if (first) { first = false; return null; }
    return state(id, [1, 2, 3, 4], 4);
  });
  h.read(async id => state(id, [1, 2, 3, 4], 4));
  const result = await h.controller.complete(input());
  assert.equal(result.state.currentDay, 4);
  assert.deepEqual(h.counts(), { post: 1, get: 1, accept: 2 });
});

test("a publisher that rejects both states cannot produce a false success", async () => {
  const h = harness();
  h.accept(() => null);
  h.read(async id => state(id));
  await assert.rejects(h.controller.complete(input()), { code: "UNCONFIRMED" });
  assert.deepEqual(h.counts(), { post: 1, get: 1, accept: 2 });
});

test("invalid input and asynchronous publishers fail closed", async () => {
  const h = harness();
  for (const bad of [input("unknown"), input(IDS[1], 11),
    input(IDS[1], 3, B), input(IDS[1], 3, A, 2),
    { ...input(), currentDay: 2 }]) {
    await assert.rejects(h.controller.complete(bad), { code: "INVALID_CONTEXT" });
  }
  assert.equal(h.counts().post, 0);
  h.accept(async value => value);
  await assert.rejects(h.controller.complete(input()), { code: "ASYNC_PUBLISHER" });
});

test("a pending listener cannot reenter and create a duplicate request", async () => {
  let session = { userId: A, epoch: 0 }, nested;
  const wait = deferred(), calls = [];
  let controller;
  controller = createController({
    getSession: () => session,
    transport: {
      complete(id) { calls.push(id); return wait.promise; },
      read: async id => state(id), accept: value => value
    },
    onChange(event) {
      if (event.phase === "pending") nested = controller.complete(input());
    }
  });
  const task = controller.complete(input());
  assert.strictEqual(task, nested);
  await Promise.resolve();
  assert.equal(calls.length, 1);
  wait.resolve(state(input()));
  await task;
});

test("the core cannot synthesize a local timestamp or advance a day", async () => {
  const h = harness();
  const result = await h.controller.complete(input());
  assert.equal(result.identity.currentDay, 3);
  assert.equal(result.state.currentDay, 3);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "completedAtByDay"), false);
  assert.equal(h.counts().get, 0);
});
