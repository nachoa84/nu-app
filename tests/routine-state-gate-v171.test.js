"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGate } = require("../routine-state-gate-v171");
const A = "account-a", B = "account-b";
const IDS = ["lumispa-10", "wellspa-10", "galvanicspa-10"];
const AT = 1788775200000;
const routine = (day = 3, completed = [1, 2, 3], extras = {}) => ({
  initialized: true, currentDay: day, nextUnlockAt: null, openedDays: {},
  completedDays: completed, completedAtByDay: Object.fromEntries(completed.map(d => [d, AT+d])), ...extras
});
const collagen = (cycle = 1, day = 3, completed = [1, 2, 3], extras = {}) => ({
  userId: A, cycle, ...routine(day, completed, extras), profile: extras.profile || { name: "A", timezone: "Europe/Madrid", notificationTime: "09:00" }
});
const products = (overrides = {}) => ({ userId: A, routines: Object.fromEntries(IDS.map(id => [id, overrides[id] || routine()])) });
function harness() {
  let session = { userId: A, epoch: 0 }, fail = false;
  const events = [];
  const gate = createGate({ getSession: () => session, onPublish(state, scope) {
    if (fail) throw new Error("publisher failed");
    events.push([scope, state]);
  } });
  return { gate, events, session(value, epoch) { session = { userId: value, epoch }; }, fail(value) { fail = value; } };
}
test("rejects a response belonging to another account", () => {
  const h = harness(), ticket = h.gate.begin();
  assert.equal(h.gate.accept({ ...collagen(), userId: B }, ticket), null);
  assert.equal(h.events.length, 0);
});
test("rejects responses from an old session, including A-B-A", () => {
  const h = harness(), ticket = h.gate.begin();
  h.session(B, 1); h.gate.begin(); h.session(A, 2);
  assert.equal(h.gate.accept(collagen(), ticket), null);
  assert.equal(h.gate.snapshot("collagen"), null);
});
test("an older same-cycle response cannot roll back completed days or currentDay", () => {
  const h = harness(), old = h.gate.begin(), fresh = h.gate.begin();
  h.gate.accept(collagen(1, 5, [1,2,3,4]), fresh);
  const result = h.gate.accept(collagen(1, 3, [1,2,3]), old);
  assert.equal(result.currentDay, 5);
  assert.deepEqual(result.completedDays, [1,2,3,4]);
  assert.equal(h.events.length, 1);
});
test("a new Collagen cycle permits a legitimate reset; an old cycle cannot return", () => {
  const h = harness();
  h.gate.accept(collagen(1, 30, Array.from({length:30}, (_,i)=>i+1)), h.gate.begin());
  const reset = collagen(2, 1, [], { completedAtByDay: {} });
  assert.equal(h.gate.accept(reset, h.gate.begin()).currentDay, 1);
  assert.equal(h.gate.accept(collagen(1,30,[1,2,3]), h.gate.begin()).cycle, 2);
});
test("product responses merge independently and preserve missing routines", () => {
  const h = harness();
  h.gate.accept(products(), h.gate.begin("products"));
  const result = h.gate.accept({userId:A,routines:{"lumispa-10":routine(4,[1,2,3,4])}}, h.gate.begin("products"));
  assert.equal(result.routines["lumispa-10"].currentDay, 4);
  assert.equal(result.routines["wellspa-10"].currentDay, 3);
  assert.equal(result.routines["galvanicspa-10"].currentDay, 3);
  assert.equal(Object.keys(result.routines).length, 3);
});
test("an uninitialized product response cannot erase established progress", () => {
  const h = harness();
  h.gate.accept(products(), h.gate.begin("products"));
  const result = h.gate.accept(products({"lumispa-10":routine(1,[],{initialized:false,completedAtByDay:{}})}), h.gate.begin("products"));
  assert.equal(result.routines["lumispa-10"].initialized, true);
  assert.deepEqual(result.routines["lumispa-10"].completedDays,[1,2,3]);
});
test("preserves first completion timestamps and rejects conflicting dates", () => {
  const h = harness();
  h.gate.accept(collagen(), h.gate.begin());
  const bad = collagen(1,3,[1,2,3],{completedAtByDay:{1:AT+999,2:AT+2,3:AT+3}});
  const result = h.gate.accept(bad, h.gate.begin());
  assert.equal(result.completedAtByDay[1], AT+1);
  assert.equal(h.events.length,1);
});
test("a newer response may add official dates without inventing missing dates", () => {
  const h = harness();
  const initial = collagen(); delete initial.completedAtByDay;
  h.gate.accept(initial, h.gate.begin());
  assert.deepEqual(h.gate.snapshot("collagen").completedAtByDay,{});
  h.gate.accept(collagen(), h.gate.begin());
  assert.equal(h.gate.snapshot("collagen").completedAtByDay[3],AT+3);
});
test("a stale response cannot replace a newer profile or pending unlock", () => {
  const h = harness(), old = h.gate.begin(), newer = h.gate.begin();
  h.gate.accept(collagen(1,3,[1,2,3], {nextUnlockAt:AT+1000,profile:{name:"new",notificationTime:"10:00"}}),newer);
  const result = h.gate.accept(collagen(1,3,[1,2,3], {nextUnlockAt:AT+2000,profile:{name:"old",notificationTime:"09:00"}}),old);
  assert.equal(result.nextUnlockAt,AT+1000);
  assert.equal(result.profile.name,"new");
});
test("a stale response that advances the day cannot retain the previous day's unlock", () => {
  const h = harness(), old = h.gate.begin(), newer = h.gate.begin();
  h.gate.accept(collagen(1,3,[1,2,3],{nextUnlockAt:AT+1000}),newer);
  const result = h.gate.accept(collagen(1,4,[1,2,3],{nextUnlockAt:null}),old);
  assert.equal(result.currentDay,4);
  assert.equal(result.nextUnlockAt,null);
});
test("malformed state and out-of-range days never publish", () => {
  const h = harness();
  assert.equal(h.gate.accept(collagen(1,2,[1,2,3]),h.gate.begin()),null);
  assert.equal(h.gate.accept({...collagen(),completedDays:[1,2,31]},h.gate.begin()),null);
  assert.equal(h.gate.accept({...collagen(),completedAtByDay:{3:"not-a-date"}},h.gate.begin()),null);
  assert.equal(h.events.length,0);
});
test("publisher errors do not commit an unpublished state", () => {
  const h = harness(); h.fail(true);
  assert.throws(()=>h.gate.accept(collagen(),h.gate.begin()),/publisher failed/);
  assert.equal(h.gate.snapshot("collagen"),null);
  h.fail(false);
  assert.equal(h.gate.accept(collagen(),h.gate.begin()).currentDay,3);
});
test("repeated identical responses do not emit redundant updates", () => {
  const h = harness();
  h.gate.accept(collagen(),h.gate.begin());
  h.gate.accept(collagen(),h.gate.begin());
  assert.equal(h.events.length,1);
});
test("gate cannot access network or storage and does not create a timer", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname,"..","routine-state-gate-v171.js"),"utf8");
  assert.doesNotMatch(source,/\bfetch\s*\(|\blocalStorage\b|\bsetInterval\s*\(|\bsetTimeout\s*\(/);
});
