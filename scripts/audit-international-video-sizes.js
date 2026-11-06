#!/usr/bin/env node
"use strict";

// Auditoría de peso de los MP4 aprobados de Biblioteca Internacional.
// Solo hace HEAD (o Range mínimo si HEAD no informa tamaño). No modifica assets.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

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
// --probe-heavy descarga temporalmente SOLO MP4 > 15 MB para leer metadatos.
// Cada archivo se elimina al finalizar, sin sobrescribir los objetos originales.
async function probeHeavyVideo(item) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nu-intl-probe-"));
  const local = path.join(dir, "source.mp4");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(item.url, { signal: controller.signal });
    if (!response.ok || !response.body) throw Error("GET HTTP " + response.status);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(local));
    const probe = spawnSync("ffprobe", [
      "-v", "error",
      "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,bit_rate:format=duration,size,bit_rate",
      "-of", "json", local
    ], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    if (probe.status !== 0) throw Error(probe.stderr || "ffprobe falló");
    const info = JSON.parse(probe.stdout);
    const video = info.streams?.find(stream => stream.codec_type === "video") || {};
    const audio = info.streams?.find(stream => stream.codec_type === "audio") || {};
    const duration = Number(info.format?.duration || 0);
    const rate = Number(info.format?.bit_rate || 0);
    const fps = video.r_frame_rate || "?";
    console.log("  " + item.label + ": " +
      (video.width || "?") + "x" + (video.height || "?") + ", " +
      (video.codec_name || "?") + ", " + fps + " fps, " +
      duration.toFixed(1) + " s, " + (rate / 1000000).toFixed(2) + " Mbps, " +
      "audio " + (audio.codec_name || "sin audio"));
  } catch (error) {
    console.log("  " + item.label + ": ERROR " + (error.message || error));
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    await fs.promises.unlink(local).catch(() => {});
    await fs.promises.rmdir(dir).catch(() => {});
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
  if (argv.includes("--probe-heavy")) {
    const heavy = known.filter(x => x.bytes > 15 * 1048576);
    console.log("\nDatos técnicos de " + heavy.length + " videos > 15 MB (copias temporales):");
    for (const item of heavy) await probeHeavyVideo(item);
  }
  if (unknown.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
