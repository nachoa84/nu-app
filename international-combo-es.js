"use strict";
const crypto = require("node:crypto");
const manifest = require("./europe-combo-es-manifest.json");
const manifestHash = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
const base = `${manifest.prefix}/${manifest.folder}`;
module.exports = Object.freeze({
  id: "lumispa-collagen/es",
  route: "lumispa-collagen-es",
  days: 7,
  manifest,
  manifestHash,
  base,
  readyPath: `${base}/ready-${manifestHash}.json`
});
