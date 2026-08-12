"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  consumeSharedRateLimitV115,
  rateLimitKeyHashV115
} = require("../shared-rate-limit-v115");

function fakePool() {
  const counts = new Map();
  return {
    async query(_sql, params) {
      const key = params.slice(0, 3).join(":");
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      return { rows: [{ request_count: count }] };
    }
  };
}

test("la clave persistida es hash y no expone la identidad", () => {
  const hash = rateLimitKeyHashV115("api", "user:correo@example.com");
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash.includes("correo"), false);
});

test("dos instancias comparten el mismo contador", async () => {
  const pool = fakePool();
  const options = {
    namespace: "api-write",
    key: "ip:203.0.113.1",
    windowMs: 60000,
    max: 2,
    now: 1786480000000
  };
  const first = await consumeSharedRateLimitV115(pool, options);
  const second = await consumeSharedRateLimitV115(pool, options);
  const third = await consumeSharedRateLimitV115(pool, options);
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.count, 3);
});

test("una ventana nueva reinicia el contador", async () => {
  const pool = fakePool();
  const base = {
    namespace: "push",
    key: "ip:198.51.100.2",
    windowMs: 1000,
    max: 1
  };
  assert.equal(
    (await consumeSharedRateLimitV115(pool, { ...base, now: 1000 })).allowed,
    true
  );
  assert.equal(
    (await consumeSharedRateLimitV115(pool, { ...base, now: 1500 })).allowed,
    false
  );
  assert.equal(
    (await consumeSharedRateLimitV115(pool, { ...base, now: 2000 })).allowed,
    true
  );
});


test("la inicialización del esquema se serializa entre instancias", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8"
  );
  const start = source.indexOf("async function initDatabase");
  const section = source.slice(start, start + 1400);
  assert.match(section, /pg_advisory_lock/);
  assert.match(section, /pg_advisory_unlock/);
  assert.match(section, /client\.release\(\)/);
});
