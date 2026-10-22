"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const config = require("../product-routine-config");
const root = path.join(__dirname, "..");

test("supplements have three ordered local materials per day; Prysm adds daily actions", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "supplements-content.js"), "utf8") + "\nglobalThis.routines = SUPPLEMENT_ROUTINE_DAYS", context);
  for (const [id, routine] of Object.entries(context.routines)) {
    assert.equal(Object.keys(routine.days).length, config[id].totalDays);
    for (const [day, content] of Object.entries(routine.days)) {
      assert.equal(content.blocks.filter(b => b.type === "media").length, 3);
      if (id !== "prysm-5") assert.equal(content.blocks.filter(b => b.type === "text" || b.type === "task").length, 0);
      content.blocks.filter(b => b.type === "media").forEach((block, index) => {
        assert.ok(block.src.endsWith(`day-${day.padStart(2, "0")}-${index + 1}.${block.mediaType === "image" ? "jpg" : "mp4"}`));
        assert.ok(fs.statSync(path.join(root, block.src)).size > 1000);
        if (block.poster) assert.ok(fs.existsSync(path.join(root, block.poster)));
      });
    }
  }
});

test("new local progress is scoped to user and program, preserving legacy keys", () => {
  let userId = "a";
  const sandbox = { localStorage: { getItem: () => JSON.stringify({ userId }) } };
  vm.runInNewContext(fs.readFileSync(path.join(root, "product-routine-config.js"), "utf8"), sandbox);
  const keys = sandbox.NuProductStorage;
  const a = keys.completeKey("lifepak-5", 1);
  userId = "b";
  assert.notEqual(a, keys.completeKey("lifepak-5", 1));
  assert.notEqual(keys.completeKey("lifepak-5", 1), keys.completeKey("colageno-10", 1));
  assert.equal(keys.stateKey("wellspa-10"), "routineState:wellspa-10");
  assert.equal(keys.completeKey("lumispa-10", 3), "day:lumispa-10:3:complete");
});

test("pilot keeps the 30-day Collagen+ catalog entry and home order", () => {
  const source = fs.readFileSync(path.join(root, "routine-products-v92.js"), "utf8");
  assert.match(source, /"collagen-30":\{"id":"collagen-30","title":"Collagen\+","totalDays":30/);
  assert.match(source, /const ROUTINE_CARD_ORDER_V92B = \[\s*"collagen-30",\s*"lumispa-10",\s*"wellspa-10",\s*"galvanicspa-10"\s*\]/);
});
