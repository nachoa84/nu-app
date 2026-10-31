"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Prysm iO has five distinct task days and fifteen verified daily materials", () => {
  const context = vm.createContext({});
  vm.runInContext(read("supplements-content.js") + "\nglobalThis.programs = SUPPLEMENT_ROUTINE_DAYS", context);
  const program = context.programs["prysm-5"];
  const source = JSON.parse(read("docs/supplements-prysm-5-tasks.json"));
  const manifest = JSON.parse(read("docs/supplements-pilot-media.json")).filter(asset => asset.routine === "prysm-5");
  assert.equal(program.totalDays, 5);
  assert.deepEqual(Object.keys(program.days), ["1", "2", "3", "4", "5"]);
  assert.equal(manifest.length, 15);
  assert.equal(manifest.filter(asset => asset.kind === "video").length, 4);

  const firstActions = new Set();
  for (let day = 1; day <= 5; day++) {
    const blocks = program.days[day].blocks;
    const tasks = blocks.filter(block => block.type === "text");
    const media = blocks.filter(block => block.type === "media");
    assert.equal(tasks.length, source.days[day].length);
    assert.ok(tasks.every(block => block.content.includes("\n") && block.content.length > 70));
    firstActions.add(tasks[0].content);
    assert.equal(media.length, 3);
    assert.equal(blocks.at(-1).type, "complete");
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
  assert.equal(firstActions.size, 5);
  assert.equal(program.days[1].blocks[0].links[0].url, "assets/supplements/prysm-5/Prysm-iO-formacion.pdf");
  assert.equal(program.days[1].blocks[0].links[0].label, "Ver material formativo de Prysm iO");
  assert.ok(fs.readFileSync(path.join(root, program.days[1].blocks[0].links[0].url)).subarray(0, 5).equals(Buffer.from("%PDF-")));
});

test("Prysm iO uses the transparent cover and independent five-day progress", () => {
  assert.equal(require("../product-routine-config")["prysm-5"].totalDays, 5);
  let userId = "one";
  const sandbox = { localStorage: { getItem: () => JSON.stringify({ userId }) } };
  vm.runInNewContext(read("product-routine-config.js"), sandbox);
  const keys = sandbox.NuProductStorage;
  const first = keys.completeKey("prysm-5", 1);
  assert.notEqual(first, keys.completeKey("omega-10", 1));
  userId = "two";
  assert.notEqual(first, keys.completeKey("prysm-5", 1));
  const cover = fs.readFileSync(path.join(root, "assets/supplements/covers/prysm-5.png"));
  assert.equal(cover.toString("ascii", 1, 4), "PNG");
  assert.equal(cover[25], 6); // RGBA; transparent background is retained.
  for (const sql of [read("schema.sql"), read("migration-supplements-prysm-v1.sql")]) {
    assert.match(sql, /supplement_prysm_state_duration/);
    assert.match(sql, /supplement_prysm_progress_duration/);
    assert.match(sql, /routine_id <> 'prysm-5' OR day <= 5/);
  }
});

test("Prysm day one names its PDF on the second content card", () => {
  const context = vm.createContext({
    window: { innerWidth: 390 },
    document: { documentElement: { clientWidth: 390 } }
  });
  for (const file of ["supplements-content.js", "daily-view.js", "routine-content-quality-v2.js"]) {
    vm.runInContext(read(file), context);
  }
  vm.runInContext(
    'globalThis.cards = splitRoutineTextBlocks(SUPPLEMENT_ROUTINE_DAYS["prysm-5"].days[1].blocks.filter(block => block.type === "text"))',
    context
  );
  assert.equal(context.cards[1].content, "Formación Prysm iO");
  assert.equal(context.cards[1].links[0].label, "Ver material formativo de Prysm iO");
});
