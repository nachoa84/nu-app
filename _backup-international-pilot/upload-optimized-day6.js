#!/usr/bin/env node
"use strict";

// Nu App / Biblioteca Internacional - piloto de compresión de Collagen+ día 6.
// Sube SOLO dos MP4 nuevos a App Storage y verifica tamaño, tipo y SHA-256.
// No reemplaza ni elimina objetos, no edita el catálogo y no publica la app.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { Client } = require("@replit/object-storage");
const catalog = require("../biblioteca-internacional-catalog.json");

const BRANCH = "feature/iris-biblioteca-internacional-20261102";
const PREFIX = "bot/active/international/v1";
const TARGETS = [
  {
    key: "collagen/es/6", folder: "ES COLAGENO", label: "Collagen+ España / día 6 / material 2",
    filename: "collagen-es-dia6-optimizado.mp4", duration: 42.27
  },
  {
    key: "collagen/it/6", folder: "IT COLAGENO", label: "Collagen+ Italia / día 6 / material 2",
    filename: "collagen-it-dia6-optimizado.mp4", duration: 50.73
  }
];
const sizeMB = n => (n / 1048576).toFixed(2) + " MB";

function guardBranchAndCatalog() {
  const branch = spawnSync("git", ["branch", "--show-current"], {
    encoding: "utf8", timeout: 10000
  });
  if (branch.error || branch.status !== 0 || branch.stdout.trim() !== BRANCH) {
    throw Error("Rama incorrecta. Requiere " + BRANCH + ". No se subió nada.");
  }
  for (const item of TARGETS) {
    if (catalog[item.key]?.[1]?.filename !== "2.mp4" ||
        catalog[item.key]?.[1]?.type !== "video") {
      throw Error("El catálogo ya cambió o falta " + item.key + " / material 2. Detener.");
    }
  }
}

function inspectVideo(filename, item) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_name,codec_type,width,height",
    "-of", "json", filename
  ], { encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw Error("No se pudo analizar " + filename + ": " + (result.stderr || result.error?.message || ""));
  }
  const info = JSON.parse(result.stdout);
  const streams = info.streams || [];
  const video = streams.find(s => s.codec_type === "video");
  const audio = streams.find(s => s.codec_type === "audio");
  const seconds = Number(info.format?.duration);
  if (video?.codec_name !== "h264" || video.width !== 720 ||
      video.height !== 1272 || audio?.codec_name !== "aac" ||
      !Number.isFinite(seconds) || Math.abs(seconds - item.duration) > 0.3) {
    throw Error("Formato, resolución o duración inesperada en " + filename);
  }
}

async function locateOptimizations() {
  const names = (await fsp.readdir(os.tmpdir()))
    .filter(name => name.startsWith("nu-day6-compression-pilot-"));
  const candidates = [];
  for (const name of names) {
    const folder = path.join(os.tmpdir(), name);
    try {
      const folderStat = await fsp.stat(folder);
      if (!folderStat.isDirectory()) continue;
      const files = TARGETS.map(item => path.join(folder, item.filename));
      const stats = await Promise.all(files.map(file => fsp.stat(file)));
      if (stats.every(stat => stat.isFile() && stat.size > 0)) {
        candidates.push({ folder, files, stats, timestamp: folderStat.mtimeMs });
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  candidates.sort((a, b) => b.timestamp - a.timestamp);
  if (!candidates.length) {
    throw Error("No están los dos MP4 temporales. Volvé a ejecutar node _backup-international-pilot/optimize-day6-dryrun.js y después repetí esta subida.");
  }
  const chosen = candidates[0];
  for (const [i, item] of TARGETS.entries()) {
    inspectVideo(chosen.files[i], item);
    if (chosen.stats[i].size >= 30 * 1048576) {
      throw Error("El archivo optimizado no tiene el tamaño esperado: " + chosen.files[i]);
    }
  }
  return chosen;
}

async function localSHA256(filename) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

async function exists(storage, filename) {
  const result = await storage.exists(filename);
  if (!result.ok) throw Error("No se pudo verificar existencia: " + filename +
    " / " + String(result.error?.message || result.error));
  return result.value === true;
}

async function verify(bucket, target, local, expectedSize, expectedHash) {
  const remote = bucket.file(target);
  const [metadata] = await remote.getMetadata();
  if (Number(metadata.size) !== expectedSize || metadata.contentType !== "video/mp4") {
    throw Error("Metadata remota inválida para " + target +
      ": " + metadata.size + " bytes / " + metadata.contentType);
  }
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for await (const chunk of remote.createReadStream({ decompress: false })) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  if (bytes !== expectedSize || hash.digest("hex") !== expectedHash) {
    throw Error("SHA-256 o cantidad de bytes no coincide en " + target);
  }
}

async function main() {
  guardBranchAndCatalog();
  const chosen = await locateOptimizations();
  const storage = new Client();
  const bucket = await storage.getBucket();
  console.log("ORIGEN TEMPORAL:", chosen.folder);
  console.log("SUBIDA DE PRUEBA: sin cambios de catálogo ni originales.");
  // Preflight de ambas fuentes y rutas antes de escribir.
  const planned = [];
  for (const [index, item] of TARGETS.entries()) {
    const destination = [PREFIX, item.folder, "DIA 6", "2002.mp4"].join("/");
    const alternate = [PREFIX, item.folder, "DÍA 6", "2002.mp4"].join("/");
    if (await exists(storage, alternate)) {
      throw Error("Existe otra variante de la ruta, requiere revisión: " + alternate);
    }
    const file = chosen.files[index];
    const stat = chosen.stats[index];
    const sha = await localSHA256(file);
    const uploaded = await exists(storage, destination);
    planned.push({ item, destination, file, size: stat.size, sha, uploaded });
  }

  for (const [index, job] of planned.entries()) {
    console.log("\n[" + (index + 1) + "/2] " + job.item.label);
    console.log("  MP4 optimizado:", sizeMB(job.size));
    console.log("  Nuevo objeto:", job.destination);
    if (job.uploaded) {
      console.log("  Ya existe; verificando sin reemplazar...");
    } else {
      console.log("  Subiendo nuevo objeto...");
      const result = await storage.uploadFromFilename(job.destination, job.file, {
        contentType: "video/mp4"
      });
      if (!result.ok) throw Error("Falló la subida: " +
        String(result.error?.message || result.error));
    }
    await verify(bucket, job.destination, job.file, job.size, job.sha);
    console.log("  OK: tamaño, video/mp4 y SHA-256 coinciden.");
  }
  console.log("\nOPTIMIZADOS VERIFICADOS 2/2");
  console.log("Los MP4 previos y MOV originales siguen intactos.");
  console.log("El catálogo todavía apunta a 2.mp4 en ambos países.");
  console.log("Enviame este resultado para activar solo dos referencias en la rama de prueba.");
}

main().catch(error => {
  console.error("SUBIDA DETENIDA:", error.message);
  console.error("No se modificó el catálogo. No se reemplazaron archivos existentes.");
  process.exitCode = 1;
});
