"use strict";
// Optional test-only PostgreSQL/WASM adapter. Production continues to use pg unchanged.
const { PGlite } = require(process.env.NUAPP_PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite(process.env.NUAPP_TEST_DATA_DIR || "memory://");
let tail = Promise.resolve();
async function acquire() {
  const prior = tail;
  let unlock;
  tail = new Promise(resolve => { unlock = resolve; });
  await prior;
  return unlock;
}
async function query(text, params) {
  // PGlite has one session. Decline background leadership because the real
  // scheduler deliberately holds one pg connection while opening another.
  // Unlocks are still exercised through the actual API transactions.
  if (/SELECT\s+pg_try_advisory_lock\(/i.test(text)) return { rows: [{ locked: false }], rowCount: 1 };
  const result = params?.length ? await db.query(text, params) : (await db.exec(text)).at(-1);
  return { ...result, rowCount: result?.affectedRows || result?.rows?.length || 0 };
}
class TestPool {
  on() { return this; }
  async connect() {
    const release = await acquire();
    return { query, release };
  }
  async query(text, params) {
    const client = await this.connect();
    try { return await client.query(text, params); } finally { client.release(); }
  }
  async end() {}
}
require("pg").Pool = TestPool;
// Replit object storage is not available in this isolated test environment.
// Pilot assets are served locally by the unchanged Express static handler.
const storagePath = require.resolve("@replit/object-storage");
require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true,
  exports: { Client: class { constructor() {} } } };
module.exports = { db, TestPool };
