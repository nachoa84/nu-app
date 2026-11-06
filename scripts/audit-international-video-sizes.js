#!/usr/bin/env node
"use strict";

// Auditoría de peso de los MP4 aprobados de Biblioteca Internacional.
// Solo hace HEAD (o Range mínimo si HEAD no informa tamaño). No modifica assets.
const fs = require("node:fs");
const path = require("node:path");

const argv = process.argv.slice(2);
function flag(name, defaultValue) {
  const i = argv.indexOf(name);
  return i < 0 ? defaultValue : argv[i + 1];
}
const port = Number(flag("--port", "5000"));
const top = Number(flag("--top", "15"));
const limit = Number(flag("--limit", "0"));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("Puerto inválido");
const base = "http://127.0.0.1:" + port;
const catalog = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "biblioteca-internacional-catalog.json"), "utf8"
));
const videos = [];
for (const [key, items] of Object.entries(catalog)) {
  const [product, country, day] = key.split("/");
  if (!Array.isArray(items)) continue;
  items.forEach((item, index) => {
    if (item.type !== "video") return;
    videos.push({
      label: key + " material " + (index + 1),
      url: base + "/api/international-assets/" + product + "-" + country +
        "/" + day + "/" + (index + 1)
    });
  });
}
const selected = limit > 0 ? videos.slice(0, limit) : videos;

async function getSize(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    let response = await fetch(url, { method: "HEAD", signal: controller.signal });
    if (!response.ok) throw Error("HEAD HTTP " + response.status);
    let bytes = Number(response.headers.get("content-length")) || 0;
    if (!bytes) {
      // Solo pide el primer byte y cancela el body: no descarga el video.
      response = await fetch(url, {
        headers: { Range: "bytes=0-0" },
        signal: controller.signal
      });
      const range = response.headers.get("content-range");
      const match = range && range.match(/\/(\d+)$/);
      bytes = match ? Number(match[1]) :
        response.status === 206 ? Number(response.headers.get("content-length")) || 0 : 0;
      if (response.body) await response.body.cancel();
    }
    if (!bytes) throw Error("Sin Content-Length/Content-Range");
    return { bytes };
  } catch (error) {
    return { bytes: 0, error: error.message || String(error) };
  } finally {
    clearTimeout(timeout);
  }
}
async function main() {
  const results = new Array(selected.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(3, selected.length) }, async () => {
    while (next < selected.length) {
      const i = next++;
      results[i] = { ...selected[i], ...(await getSize(selected[i].url)) };
    }
  });
  await Promise.all(workers);
  const known = results.filter(x => x.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  const unknown = results.filter(x => !x.bytes);
  const mb = bytes => (bytes / 1048576).toFixed(1) + " MB";
  console.log("Videos del catálogo: " + videos.length);
  console.log("Medidos: " + known.length + " | Sin tamaño: " + unknown.length);
  console.log("Total de MP4 medidos: " + mb(known.reduce((s, x) => s + x.bytes, 0)));
  console.log("Mayores de 15 MB: " + known.filter(x => x.bytes > 15 * 1048576).length);
  console.log("\nLos " + Math.min(top, known.length) + " videos más pesados:");
  known.slice(0, top).forEach((x, i) =>
    console.log(String(i + 1).padStart(2) + ". " + mb(x.bytes).padStart(9) + "  " + x.label)
  );
  unknown.forEach(x => console.log("SIN MEDIR " + x.label + ": " + x.error));
  if (unknown.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
