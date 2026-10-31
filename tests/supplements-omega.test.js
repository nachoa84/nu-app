"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Optimum Omega serves all ten days in inventory order with intact local media", () => {
  const context = vm.createContext({});
  vm.runInContext(read("supplements-content.js") + "\nglobalThis.programs = SUPPLEMENT_ROUTINE_DAYS", context);
  const program = context.programs["omega-10"];
  const manifest = JSON.parse(read("docs/supplements-pilot-media.json")).filter(asset => asset.routine === "omega-10");

  assert.equal(program.totalDays, 10);
  assert.deepEqual(Object.keys(program.days), Array.from({ length: 10 }, (_, i) => String(i + 1)));
  assert.equal(manifest.length, 30);
  for (let day = 1; day <= 10; day++) {
    const blocks = program.days[day].blocks;
    const media = blocks.filter(block => block.type === "media");
    assert.equal(media.length, 3);
    assert.equal(blocks.at(-1).type, "complete");
    assert.equal(blocks.some(block => block.type === "task"), false);
    for (let i = 0; i < 3; i++) {
      const entry = manifest.find(asset => asset.day === day && asset.position === i + 1);
      assert.ok(entry);
      assert.equal(media[i].src, entry.src);
      assert.equal(media[i].mediaType, entry.kind);
      const bytes = fs.readFileSync(path.join(root, entry.src));
      assert.equal(bytes.length, entry.optimized_bytes);
      assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), entry.optimized_sha256);
      if (entry.poster) assert.equal(media[i].poster, entry.poster);
    }
  }
  assert.equal(manifest.filter(asset => asset.kind === "video").length, 11);
});

test("Optimum Omega has independent progress, a cover and ten-day server boundaries", () => {
  const products = require("../product-routine-config");
  assert.equal(products["omega-10"].totalDays, 10);
  let userId = "one";
  const sandbox = { localStorage: { getItem: () => JSON.stringify({ userId }) } };
  vm.runInNewContext(read("product-routine-config.js"), sandbox);
  const keys = sandbox.NuProductStorage;
  const first = keys.completeKey("omega-10", 1);
  assert.notEqual(first, keys.completeKey("nubi-10", 1));
  userId = "two";
  assert.notEqual(first, keys.completeKey("omega-10", 1));
  assert.ok(fs.existsSync(path.join(root, "assets/supplements/covers/omega-10.png")));
  for (const sql of [read("schema.sql"), read("migration-supplements-omega-v1.sql")]) {
    assert.match(sql, /supplement_omega_state_duration/);
    assert.match(sql, /supplement_omega_progress_duration/);
    assert.match(sql, /routine_id <> 'omega-10' OR day <= 10/);
  }
});
