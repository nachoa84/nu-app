"use strict";
const crypto = require("node:crypto");
const manifest = require("./europe-collagen-pt-manifest.json");
const manifestHash = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
const base = `${manifest.prefix}/${manifest.folder}`;
module.exports = Object.freeze({
  id: "collagen/pt",
  route: "collagen-pt",
  days: 7,
  manifest,
  manifestHash,
  base,
  readyPath: `${base}/ready-${manifestHash}.json`
});
