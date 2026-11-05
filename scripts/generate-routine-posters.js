#!/usr/bin/env node
"use strict";

// Herramienta de desarrollo, de una sola ejecución, para crear fotogramas
// reales de WellSpa, Galvanic Spa y LumiSpa. Nunca corre en el servidor web.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const inputFile = path.join(root, "routine-products-v92.js");
const outputDir = path.join(root, "assets", "routine-posters");
const manifestFile = path.join(root, "routine-video-posters.generated.js");
const previewSource = fs.readFileSync(inputFile, "utf8");
const configMatch = previewSource.match(/const PRODUCT_ROUTINE_DAYS = (\{.*?\});/s);
if (!configMatch) throw new Error("No pude encontrar PRODUCT_ROUTINE_DAYS.");
const routines = JSON.parse(configMatch[1]);

const sourceUrls = Array.from(new Set(
  Object.values(routines).flatMap(routine =>
    Object.values(routine.days).flatMap(day =>
      (day.blocks || [])
        .filter(block => block.type === "media" && block.mediaType === "video")
        .map(block => block.src)
    )
  )
));

const knownPosters = new Map();
const existingHelpers = fs.readFileSync(path.join(root, "ui-core.js"), "utf8");
for (const match of existingHelpers.matchAll(
  /\["(\/api\/routine-assets\/[a-f0-9]{64}\.mp4)", "(assets\/[^"\n]+\.webp)"\]/g
)) {
  knownPosters.set(match[1], match[2]);
}

const planned = [];
const ready = new Map();
for (const src of sourceUrls) {
  const match = /^\/api\/routine-assets\/([a-f0-9]{64})\.mp4$/.exec(src);
  if (!match) throw new Error(`Ruta de video inesperada: ${src}`);
  const existingPoster = knownPosters.get(src);
  if (existingPoster && fs.existsSync(path.join(root, existingPoster))) {
    ready.set(src, existingPoster);
    continue;
  }
  const relativePoster = `assets/routine-posters/${match[1]}.webp`;
  if (fs.existsSync(path.join(root, relativePoster))) {
    ready.set(src, relativePoster);
    continue;
  }
  planned.push({ src, relativePoster });
}

console.log(`Videos únicos: ${sourceUrls.length}`);
console.log(`Miniaturas existentes: ${ready.size}`);
console.log(`Miniaturas por crear: ${planned.length}`);

if (process.argv.includes("--dry-run")) process.exit(0);

const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8", timeout: 10000 });
if (ffmpeg.error || ffmpeg.status !== 0) {
  console.error("Necesito ffmpeg en la Shell de Replit. No modifiqué archivos.");
  process.exit(2);
}

const portArgIndex = process.argv.indexOf("--port");
const port = portArgIndex >= 0
  ? process.argv[portArgIndex + 1]
  : (process.env.PORT || "5000");
if (!/^\d{2,5}$/.test(String(port))) throw new Error("Puerto inválido.");
const origin = `http://127.0.0.1:${port}`;

fs.mkdirSync(outputDir, { recursive: true });
const errors = [];
for (let i = 0; i < planned.length; i++) {
  const { src, relativePoster } = planned[i];
  const destination = path.join(root, relativePoster);
  const temporary = destination + ".tmp.webp";
  console.log(`[${i + 1}/${planned.length}] ${src.split("/").pop()}`);
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  let success = false;
  for (const seek of ["2", "0.5"]) {
    const result = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin",
      "-ss", seek, "-rw_timeout", "30000000", "-i", origin + src,
      "-an", "-frames:v", "1", "-vf", "scale=360:-2:flags=lanczos",
      "-c:v", "libwebp", "-quality", "76", "-compression_level", "4",
      "-y", temporary
    ], { encoding: "utf8", timeout: 120000 });
    const ok = result.status === 0 &&
      fs.existsSync(temporary) && fs.statSync(temporary).size > 500;
    if (ok) {
      fs.renameSync(temporary, destination);
      ready.set(src, relativePoster);
      success = true;
      break;
    }
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    if (seek === "0.5") {
      errors.push({ src, reason: (result.stderr || String(result.error || "falló ffmpeg")).slice(-250) });
    }
  }
  if (!success) console.error(`  No se pudo generar: ${src}`);
}

if (errors.length) {
  console.error(`Quedaron ${errors.length} videos pendientes; no cambié el manifiesto.`);
  errors.forEach(error => console.error(`${error.src}: ${error.reason}`));
  process.exit(1);
}

const lines = sourceUrls.map(src => {
  const poster = ready.get(src);
  if (!poster) throw new Error(`Falta miniatura para ${src}`);
  return `  ${JSON.stringify(src)}: ${JSON.stringify(poster)}`;
});
const output = [
  "// AUTO-GENERATED routine poster manifest. No editar a mano.",
  "window.NuRoutineVideoPosters = Object.freeze({",
  lines.join(",\n"),
  "});",
  ""
].join("\n");
if (fs.existsSync(manifestFile)) {
  const current = fs.readFileSync(manifestFile, "utf8");
  if (!current.startsWith("// AUTO-GENERATED routine poster manifest.")) {
    throw new Error("El manifiesto tiene contenido manual; no lo sobrescribí.");
  }
}
fs.writeFileSync(manifestFile, output, "utf8");
console.log(`Listo: ${ready.size} miniaturas reales disponibles.`);
console.log("Revisá los archivos antes de hacer git add/commit/push.");
