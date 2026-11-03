#!/usr/bin/env node
"use strict";

// Piloto aislado: Collagen+ España, día 1, material 1 (.mov -> .mp4).
// Solo LEE el original desde App Storage y escribe COPIAS en /tmp.
// No sube, reemplaza, borra ni modifica archivos de Nu App.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { Client } = require("@replit/object-storage");

const OBJECT_NAME = "bot/active/international/v1/ES COLAGENO/DIA 1/1.mov";
const OUTPUT_FILE = "collagen-es-dia-1-material-1.mp4";

function hasTool(name) {
  const result = spawnSync(name, ["-version"], { encoding: "utf8", timeout: 10000 });
  return !result.error && result.status === 0;
}

function runTool(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, { stdio: ["ignore", "pipe", "pipe"] });
    let recentErrors = "";
    child.stderr.on("data", (chunk) => {
      recentErrors = (recentErrors + chunk.toString()).slice(-5000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(name + " terminó con código " + code + "\n" + recentErrors));
    });
  });
}

function showMiB(size) {
  return (size / (1024 * 1024)).toFixed(2) + " MB";
}

async function main() {
  if (!hasTool("ffmpeg")) {
    throw new Error("Este entorno no tiene ffmpeg. No se convirtió ni modificó nada.");
  }

  console.log("Piloto: Collagen+ España / Día 1 / Material 1");
  console.log("Acceso de solo lectura al original:", OBJECT_NAME);

  const storage = new Client();
  const bucket = await storage.getBucket();
  const originalObject = bucket.file(OBJECT_NAME);
  const [metadata] = await originalObject.getMetadata();
  const expectedSize = Number(metadata?.size);
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
    throw new Error("El tamaño del MOV original no es válido.");
  }

  // Nunca trabajar dentro del repositorio ni sobrescribir el original.
  const temporaryFolder = await fsp.mkdtemp(path.join(os.tmpdir(), "nu-es-collagen-d1-pilot-"));
  const sourceCopy = path.join(temporaryFolder, "fuente-1.mov");
  const convertedCopy = path.join(temporaryFolder, OUTPUT_FILE);
  console.log("Carpeta temporal:", temporaryFolder);
  console.log("Copiando MOV original (" + showMiB(expectedSize) + ")...");

  await pipeline(originalObject.createReadStream({ decompress: false }), fs.createWriteStream(sourceCopy));
  const sourceSize = (await fsp.stat(sourceCopy)).size;
  if (sourceSize !== expectedSize) {
    throw new Error("La copia local no coincide en tamaño con el original.");
  }

  console.log("Convirtiendo a MP4 H.264/AAC (sin modificar el MOV)...");
  await runTool("ffmpeg", [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-stats",
    "-i", sourceCopy,
    "-map", "0:v:0", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    convertedCopy
  ]);

  const convertedSize = (await fsp.stat(convertedCopy)).size;
  if (convertedSize <= 0) throw new Error("La conversión creó un MP4 vacío.");

  if (hasTool("ffprobe")) {
    const probe = spawnSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=codec_name,codec_type",
      "-of", "default=noprint_wrappers=1", convertedCopy
    ], { encoding: "utf8", timeout: 30000 });
    if (probe.error || probe.status !== 0 || !probe.stdout.includes("codec_name=h264")) {
      throw new Error("El MP4 no pasó la verificación de códec H.264.");
    }
    console.log("Códecs:", probe.stdout.trim().replace(/\n/g, " | "));
  }

  console.log("CONVERSIÓN TEMPORAL COMPLETADA");
  console.log("MP4:", convertedCopy);
  console.log("Tamaño:", showMiB(convertedSize));
  console.log("Original intacto en App Storage.");
  console.log("ATENCIÓN: El MP4 NO se subió a App Storage ni está disponible en Nu App.");
}

main().catch((error) => {
  console.error("PILOTO DETENIDO:", error.message);
  console.error("No se modificó ningún material del almacenamiento de Nu App.");
  process.exitCode = 1;
});
