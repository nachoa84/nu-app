#!/usr/bin/env node
"use strict";

// Herramienta de desarrollo, de una sola ejecución, para crear fotogramas
// reales de WellSpa, Galvanic Spa y LumiSpa. Nunca corre en el servidor web.
const fs = require("node:fs");
const os = require("node:os");
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
const curl = spawnSync("curl", ["--version"], { encoding: "utf8", timeout: 10000 });
if (curl.error || curl.status !== 0) {
  console.error("Necesito curl en la Shell de Replit. No modifiqué archivos.");
  process.exit(2);
}

const portArgIndex = process.argv.indexOf("--port");
const port = portArgIndex >= 0
  ? process.argv[portArgIndex + 1]
  : (process.env.PORT || "5000");
if (!/^\d{2,5}$/.test(String(port))) throw new Error("Puerto inválido.");
const origin = `http://127.0.0.1:${port}`;
const limitArgIndex = process.argv.indexOf("--limit");
const limit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : planned.length;
if (!Number.isInteger(limit) || limit < 0 || (limitArgIndex >= 0 && limit < 1)) {
  throw new Error("Límite inválido.");
}
const worklist = planned.slice(0, limit);

fs.mkdirSync(outputDir, { recursive: true });
const errors = [];
// FFmpeg busca fragmentos aleatorios en un MP4 remoto. Si la conexión falla,
// puede recibir átomos incompletos aunque el archivo original esté correcto.
// Descargar primero a un temporal fuera del sitio permite extraer el fotograma
// localmente. Solo se descargan videos que aún no tienen miniatura y el temporal
// se elimina antes de avanzar al siguiente archivo.
const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "nu-routine-poster-"));
try {
  for (let i = 0; i < worklist.length; i++) {
    const { src, relativePoster } = worklist[i];
    const destination = path.join(root, relativePoster);
    const temporary = destination + ".tmp.webp";
    const temporaryVideo = path.join(temporaryDir, "video.mp4");
    console.log(`[${i + 1}/${worklist.length}] ${src.split("/").pop()}`);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    if (fs.existsSync(temporaryVideo)) fs.unlinkSync(temporaryVideo);

    const download = spawnSync("curl", [
      "-fLsS", "--retry", "2", "--retry-all-errors",
      "--retry-delay", "1", "--max-time", "120",
      "-o", temporaryVideo, origin + src
    ], { encoding: "utf8", timeout: 370000 });
    if (download.status !== 0 || !fs.existsSync(temporaryVideo) ||
        fs.statSync(temporaryVideo).size < 1024) {
      errors.push({ src, reason: `Descarga: ${(download.stderr || String(download.error || download.status)).slice(-220)}` });
      console.error(`  No se pudo descargar: ${src}`);
      continue;
    }

    let success = false;
    for (const seek of ["2", "0.5"]) {
      const result = spawnSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-i", temporaryVideo, "-ss", seek,
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
    if (fs.existsSync(temporaryVideo)) fs.unlinkSync(temporaryVideo);
  }
} finally {
  const temporaryVideo = path.join(temporaryDir, "video.mp4");
  if (fs.existsSync(temporaryVideo)) fs.unlinkSync(temporaryVideo);
  fs.rmdirSync(temporaryDir);
}

if (errors.length) {
  console.error(`Quedaron ${errors.length} videos pendientes; no cambié el manifiesto.`);
  errors.forEach(error => console.error(`${error.src}: ${error.reason}`));
  process.exit(1);
}

if (worklist.length < planned.length) {
  console.log(`Prueba completada: ${worklist.length} miniatura(s) creada(s); no cambié el manifiesto.`);
  console.log(`Pendientes: ${planned.length - worklist.length}. Podés reanudar sin repetir lo generado.`);
  process.exit(0);
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
