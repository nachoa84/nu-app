"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const config = require("../product-routine-config");

test("LifePak Elements has five days with three ordered, usable materials each", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "supplements-content.js"), "utf8") +
    "\nglobalThis.programs = SUPPLEMENT_ROUTINE_DAYS", context);
  const program = context.programs["lifepak-elements-5"];
  assert.equal(config["lifepak-elements-5"].totalDays, 5);
  assert.equal(program.totalDays, 5);
  assert.deepEqual(Object.keys(program.days), ["1", "2", "3", "4", "5"]);
  for (const [day, content] of Object.entries(program.days)) {
    const media = content.blocks.filter(block => block.type === "media");
    assert.equal(media.length, 3);
    assert.equal(content.blocks.some(block => block.type === "task" || block.type === "text"), false);
    media.forEach((block, index) => {
      const base = `day-${day.padStart(2, "0")}-${index + 1}`;
      assert.ok(block.src.endsWith(`${base}.${block.mediaType === "image" ? "jpg" : "mp4"}`));
      assert.ok(fs.statSync(path.join(root, block.src)).size > 1000);
      if (block.mediaType === "video") assert.ok(fs.existsSync(path.join(root, block.poster)));
    });
  }
});

test("LifePak Elements progress is separate from LifePak, Colágeno and other users", () => {
  let userId = "one";
  const sandbox = { localStorage: { getItem: () => JSON.stringify({ userId }) } };
  vm.runInNewContext(fs.readFileSync(path.join(root, "product-routine-config.js"), "utf8"), sandbox);
  const keys = sandbox.NuProductStorage;
  const elements = keys.completeKey("lifepak-elements-5", 1);
  assert.notEqual(elements, keys.completeKey("lifepak-5", 1));
  assert.notEqual(elements, keys.completeKey("colageno-10", 1));
  userId = "two";
  assert.notEqual(elements, keys.completeKey("lifepak-elements-5", 1));
});

test("LifePak Elements has its own cover and five-day SQL boundaries", () => {
  const content = fs.readFileSync(path.join(root, "supplements-content.js"), "utf8");
  const schema = fs.readFileSync(path.join(root, "schema.sql"), "utf8");
  const migration = fs.readFileSync(path.join(root, "migration-supplements-elements-v1.sql"), "utf8");
  assert.match(content, /"cover": "assets\/supplements\/covers\/lifepak-elements-5\.png"/);
  assert.ok(fs.existsSync(path.join(root, "assets/supplements/covers/lifepak-elements-5.png")));
  for (const sql of [schema, migration]) {
    assert.match(sql, /supplement_elements_state_duration/);
    assert.match(sql, /supplement_elements_progress_duration/);
    assert.match(sql, /routine_id <> 'lifepak-elements-5' OR day <= 5/);
  }
});
