#!/usr/bin/env node
"use strict";

// Auditoría de reproducción de 6 MP4 de Biblioteca Internacional.
// SOLO LECTURA de App Storage; usa copias temporales y no cambia el catálogo.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { Client } = require("@replit/object-storage");

const PREFIX = "bot/active/international/v1";
const TARGETS = [
  { folder: "ES COLAGENO", day: 6, index: 2, label: "Collagen+ España / día 6 / material 2" },
  { folder: "IT COLAGENO", day: 6, index: 2, label: "Collagen+ Italia / día 6 / material 2" },
  { folder: "IT LUMI", day: 7, index: 1, label: "Lumi Italia / día 7 / material 1" },
  { folder: "IT LUMI", day: 7, index: 2, label: "Lumi Italia / día 7 / material 2" },
  { folder: "IT LUMI", day: 7, index: 3, label: "Lumi Italia / día 7 / material 3" },
  { folder: "IT LUMI", day: 7, index: 4, label: "Lumi Italia / día 7 / material 4 (control)" }
];

async function findObject(bucket, target) {
  for (const folderName of ["DIA " + target.day, "DÍA " + target.day]) {
    const name = [PREFIX, target.folder, folderName, target.index + ".mp4"].join("/");
    try {
      const file = bucket.file(name);
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size);
      if (!Number.isSafeInteger(size) || size <= 0) throw new Error("MP4 de tamaño inválido: " + name);
      return { name, file, size, type: metadata.contentType };
    } catch (error) {
      if (Number(error?.code) !== 404 && Number(error?.status) !== 404) throw error;
    }
  }
  throw new Error("No se encontró el MP4 del material.");
}

function videoInfo(file) {
  const run = spawnSync("ffprobe", [
    "-v", "error", "-show_entries",
    "format=duration,bit_rate:stream=codec_type,codec_name,profile,level,width,height,pix_fmt,avg_frame_rate,bit_rate",
    "-of", "json", file
  ], { encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 });
  if (run.error || run.status !== 0) throw new Error("ffprobe falló: " + (run.stderr || run.error?.message || ""));
  return JSON.parse(run.stdout);
}

async function main() {
  const bin = spawnSync("ffprobe", ["-version"], { encoding: "utf8", timeout: 10000 });
  if (bin.error || bin.status !== 0) throw new Error("No está disponible ffprobe.");
  const storage = new Client();
  const bucket = await storage.getBucket();
  console.log("AUDITORÍA DE REPRODUCCIÓN / SIN CAMBIOS EN APP STORAGE");
  for (const item of TARGETS) {
    console.log("\n" + item.label);
    try {
      const remote = await findObject(bucket, item);
      console.log("  Objeto:", remote.name);
      console.log("  Tamaño:", (remote.size / 1048576).toFixed(2), "MB; tipo:", remote.type);
      const tempFolder = await fsp.mkdtemp(path.join(os.tmpdir(), "nu-media-audit-"));
      const copy = path.join(tempFolder, "video.mp4");
      try {
        await pipeline(remote.file.createReadStream({ decompress: false }), fs.createWriteStream(copy));
        if ((await fsp.stat(copy)).size !== remote.size) throw new Error("Copia incompleta.");
        const info = videoInfo(copy);
        const duration = Number(info.format?.duration) || 0;
        const v = (info.streams || []).find(s => s.codec_type === "video");
        const a = (info.streams || []).find(s => s.codec_type === "audio");
        console.log("  Duración:", duration.toFixed(2), "s");
        console.log("  Video:", v?.codec_name || "sin pista",
          v?.profile || "", v?.width + "x" + v?.height,
          "pix_fmt=" + (v?.pix_fmt || "?"),
          "level=" + (v?.level ?? "?"),
          "fps=" + (v?.avg_frame_rate || "?"));
        console.log("  Audio:", a?.codec_name || "(sin audio)");
        console.log("  Bitrate total:", ((Number(info.format?.bit_rate) || 0) / 1000).toFixed(0), "kbps");
      } finally {
        await fsp.unlink(copy).catch(() => {});
        await fsp.rmdir(tempFolder).catch(() => {});
      }
    } catch (error) {
      console.error("  ERROR DE AUDITORÍA:", error.message);
    }
  }
  console.log("\nAUDITORÍA FINALIZADA: solo se leyeron los MP4. Ningún objeto se modificó.");
}
main().catch(error => { console.error("AUDITORÍA DETENIDA:", error.message); process.exitCode = 1; });
