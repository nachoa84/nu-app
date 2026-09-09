"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRoutineActiveSyncV172 } = require("../routine-active-sync-v172");

function harness(options = {}) {
  let now = 1_000_000, id = 0, user = "A", visible = true, online = true;
  const timers = new Map(), calls = [], statuses = [], published = [];
  let canonical = { userId: "A", currentDay: 2, cycle: 1, nextUnlockAt: null };
  let products = { userId: "A", routines: {} };
  let canonicalFetch = null, productFetch = null;
  const controller = createRoutineActiveSyncV172({
    now: () => now,
    setTimeout(fn, ms) { const key = ++id; timers.set(key, { fn, at: now + ms }); return key; },
    clearTimeout(key) { timers.delete(key); },
    getIdentity: () => user,
    isVisible: () => visible,
    isOnline: () => online,
    fetchCanonical: async identity => {
      calls.push(["canonical", identity]);
      return canonicalFetch ? canonicalFetch(identity) : { ...canonical, userId: identity };
    },
    fetchProducts: async identity => {
      calls.push(["products", identity]);
      return productFetch ? productFetch(identity) : { ...products, userId: identity };
    },
    publishCanonical: state => {
      const accepted = options.acceptCanonical ? options.acceptCanonical(state) : state;
      if (!accepted) return false;
      published.push(["canonical", accepted]); return accepted;
    },
    publishProducts: state => { published.push(["products", state]); return state; },
    onStatus: status => statuses.push(status),
    warn() {}, jitter: () => 0
  });
  async function flush() {
    for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
  }
  async function advance(ms) {
    const end = now + ms;
    for (let n = 0; n < 1000; n++) {
      const entries = [...timers.entries()].sort((a,b) => a[1].at - b[1].at);
      if (!entries.length || entries[0][1].at > end) break;
      const [key, timer] = entries[0]; timers.delete(key);
      now = timer.at; timer.fn(); await flush();
    }
    now = end;
    await flush();
  }
  return {
    controller, calls, statuses, published, timers, advance, flush,
    setCanonical(value) { canonical = value; },
    setProducts(value) { products = value; },
    canonicalFetch(fn) { canonicalFetch = fn; }, productFetch(fn) { productFetch = fn; },
    setVisible(value) { visible = value; }, setOnline(value) { online = value; },
    setUser(value) { user = value; }, now: () => now
  };
}
const count = (h, type) => h.calls.filter(call => call[0] === type).length;
const wait = () => new Promise(resolve => setImmediate(resolve));

test("initial reconciliation does not require a cached due time or product state", async () => {
  const h = harness(); h.controller.start(); await h.flush();
  assert.equal(count(h,"canonical"),1); assert.equal(count(h,"products"),1);
  assert.equal(h.controller.inspect().timerAt,null);
});

test("due-time failure retries within a finite budget and resolves after success", async () => {
  const h = harness(); h.controller.start(); await h.flush();
  const due = h.now()+1000;
  h.setCanonical({userId:"A",currentDay:2,cycle:1,nextUnlockAt:due});
  h.controller.rememberCanonical({userId:"A",currentDay:2,nextUnlockAt:due});
  let failures=0;
  h.canonicalFetch(async () => {
    if (failures++ < 2) throw new Error("network");
    return {userId:"A",currentDay:3,cycle:1,nextUnlockAt:null};
  });
  await h.advance(4000);
  assert.equal(count(h,"canonical"),2);
  await h.advance(4000); assert.equal(count(h,"canonical"),3);
  await h.advance(5000); assert.equal(count(h,"canonical"),4);
  assert.equal(h.controller.inspect().dueAt,null);
  assert.equal(h.controller.inspect().timerAt,null);
});

test("persistent failures stop after four retries, without polling", async () => {
  const h = harness(); h.controller.start(); await h.flush();
  h.canonicalFetch(async () => {throw new Error("offline service");});
  h.controller.request("manual",{force:true}); await h.flush();
  await h.advance(120000);
  assert.equal(count(h,"canonical"),6);
  assert.equal(h.controller.inspect().exhausted,true);
  assert.equal(h.timers.size,0);
  await h.advance(48*60*60*1000);
  assert.equal(count(h,"canonical"),6);
});

test("hidden and offline due times remain recoverable on resume", async () => {
  const h=harness(); h.controller.start(); await h.flush();
  const due=h.now()+1000;
  h.controller.rememberCanonical({userId:"A",currentDay:2,nextUnlockAt:due});
  h.setVisible(false);h.controller.suspend(); await h.advance(48*60*60*1000);
  assert.equal(count(h,"canonical"),1);
  h.setVisible(true);h.setOnline(false);h.controller.onResume("visible");
  assert.equal(count(h,"canonical"),1);
  h.setOnline(true);h.controller.onResume("online");await h.flush();
  assert.equal(count(h,"canonical"),2);
});

test("passive events in initial grace and cooldown are deferred, not discarded", async () => {
  const h=harness();h.controller.start();await h.flush();
  h.controller.onResume("focus");await h.flush();
  assert.equal(count(h,"canonical"),1);
  await h.advance(3999);assert.equal(count(h,"canonical"),1);
  await h.advance(1);assert.equal(count(h,"canonical"),2);
});

test("a failed canonical request does not prevent product state publication", async () => {
  const h=harness();h.controller.start();await h.flush();
  h.canonicalFetch(async()=>{throw new Error("canonical unavailable");});
  h.setProducts({userId:"A",routines:{"wellspa-10":{initialized:true,currentDay:3,nextUnlockAt:null}}});
  h.controller.request("manual",{force:true});await h.flush();
  assert.equal(h.published.at(-1)[0],"products");
  assert.equal(h.statuses.at(-1).partial,true);
});

test("old account responses cannot publish after a session change", async () => {
  const h=harness();h.controller.start();await h.flush();
  let release;
  h.canonicalFetch(()=>new Promise(resolve=>{release=resolve;}));
  h.controller.request("manual",{force:true});await h.flush();
  const before=h.published.length;
  h.setUser("B");h.controller.invalidate();
  release({userId:"A",currentDay:30,nextUnlockAt:null});await h.flush();
  assert.equal(h.published.slice(before).some(([,s])=>s.userId==="A"),false);
  assert.equal(h.controller.inspect().identity,"B");
});

test("a new due time can recover after another resource exhausted its retries", async () => {
  const h=harness();h.controller.start();await h.flush();
  h.productFetch(async()=>{throw new Error("product service");});
  h.controller.request("manual",{force:true});await h.flush();await h.advance(120000);
  assert.equal(h.controller.inspect().exhausted,true);
  const due=h.now()-1000;
  h.controller.rememberCanonical({userId:"A",currentDay:2,nextUnlockAt:due});
  await h.advance(0);
  assert.equal(h.controller.inspect().exhausted,false);
});

test("a duplicate event while a request is running is coalesced", async () => {
  const h=harness();h.controller.start();await h.flush();
  let release;
  h.canonicalFetch(()=>new Promise(resolve=>{release=resolve;}));
  h.controller.request("manual",{force:true});await h.flush();
  h.controller.onResume("focus");h.controller.onResume("focus");
  assert.equal(count(h,"canonical"),2);
  release({userId:"A",currentDay:2,nextUnlockAt:null});await h.flush();
  assert.ok(count(h,"canonical")<=3);
});

test("a hung request times out and can retry without publishing its late response", async () => {
  const h=harness();h.controller.start();await h.flush();
  let release;
  h.canonicalFetch(()=>new Promise(resolve=>{release=resolve;}));
  h.controller.request("manual",{force:true});await h.flush();
  const before=h.published.length;
  await h.advance(15000);
  assert.equal(h.controller.inspect().running,false);
  assert.equal(h.controller.inspect().pending,true);
  release({userId:"A",currentDay:30,nextUnlockAt:null});await h.flush();
  assert.equal(h.published.slice(before).some(([,s])=>s.currentDay===30),false);
  assert.ok(h.controller.inspect().retryAt>h.now());
});

test("a non-transient 403 stops automatic retries until a new explicit demand", async () => {
  const h=harness();h.controller.start();await h.flush();
  h.canonicalFetch(async()=>{const e=new Error("Forbidden");e.status=403;throw e;});
  h.controller.request("manual",{force:true});await h.flush();
  assert.equal(h.controller.inspect().exhausted,true);
  const before=count(h,"canonical");await h.advance(120000);
  assert.equal(count(h,"canonical"),before);
  h.controller.onResume("online");await h.flush();
  assert.equal(count(h,"canonical"),before+1);
});

test("429 Retry-After is respected instead of creating an immediate retry storm", async () => {
  const h=harness();h.controller.start();await h.flush();
  h.canonicalFetch(async()=>{const e=new Error("Rate limited");e.status=429;e.retryAfterMs=60000;throw e;});
  h.controller.request("manual",{force:true});await h.flush();
  assert.equal(h.controller.inspect().retryAt,h.now()+60000);
  await h.advance(59999);assert.equal(count(h,"canonical"),2);
  await h.advance(1);assert.equal(count(h,"canonical"),3);
});

test("a successful response with the same overdue state is not treated as an unlock", async () => {
  const h=harness();h.controller.start();await h.flush();
  const due=h.now()-1000;
  h.setCanonical({userId:"A",currentDay:2,cycle:1,nextUnlockAt:due});
  h.controller.rememberCanonical({userId:"A",currentDay:2,nextUnlockAt:due});
  await h.advance(120000);
  assert.equal(h.controller.inspect().exhausted,true);
  assert.equal(h.controller.inspect().dueAt,due);
  assert.equal(count(h,"canonical"),6);
});

test("a rejected stale snapshot cannot regress the known due time", async () => {
  const h=harness({acceptCanonical: state => state.currentDay < 3 ? false : state});
  h.controller.start();await h.flush();
  const due=h.now()+10000;
  h.controller.rememberCanonical({userId:"A",currentDay:3,nextUnlockAt:due});
  h.setCanonical({userId:"A",currentDay:2,cycle:1,nextUnlockAt:h.now()-1000});
  h.controller.request("manual",{force:true});await h.flush();
  assert.equal(h.controller.inspect().dueAt,due);
  assert.equal(h.published.some(([,s])=>s.currentDay===2),false);
});

test("timestamps accept UTC strings and reject absent or invalid values", () => {
  const {timestamp}=require("../routine-active-sync-v172");
  assert.equal(timestamp("2026-09-09T07:00:00.000Z"),1788937200000);
  assert.equal(timestamp(null),null);
  assert.equal(timestamp(""),null);
  assert.equal(timestamp("not a date"),null);
});
