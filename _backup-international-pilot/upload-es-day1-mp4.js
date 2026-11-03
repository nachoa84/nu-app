#!/usr/bin/env node
"use strict";

// Piloto controlado: subir SOLO el MP4 convertido del día 1 / material 1
// de Collagen+ España, en una ruta NUEVA de App Storage.
// No borra ni reemplaza el .mov. No cambia el catálogo.

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { Client } = require("@replit/object-storage");

const DEFAULT_SOURCE = "/tmp/nu-es-collagen-d1-pilot-Gg7f9H/collagen-es-dia-1-material-1.mp4";
const DESTINATION = "bot/active/international/v1/ES COLAGENO/DIA 1/1.mp4";
const SOURCE_FILENAME = "collagen-es-dia-1-material-1.mp4";
const SOURCE_PARENT_PREFIX = "/tmp/nu-es-collagen-d1-pilot-";

function hash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function checkH264Aac(filename) {
  const probe = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "stream=codec_name,codec_type",
    "-of", "default=noprint_wrappers=1", filename
  ], { encoding: "utf8", timeout: 30000 });
  if (probe.error || probe.status !== 0) {
    throw new Error("No se pudo verificar el MP4 con ffprobe.");
  }
  if (!probe.stdout.includes("codec_name=h264") || !probe.stdout.includes("codec_name=aac")) {
    throw new Error("El archivo no tiene los códecs H.264 y AAC esperados.");
  }
}

async function main() {
  const source = path.resolve(process.argv[2] || DEFAULT_SOURCE);
  if (!source.startsWith(SOURCE_PARENT_PREFIX) || path.basename(source) !== SOURCE_FILENAME) {
    throw new Error("Ruta de origen no permitida. Solo se admite el MP4 temporal del piloto.");
  }
  const stats = await fs.stat(source);
  if (!stats.isFile() || stats.size < 1000 || stats.size > 100 * 1024 * 1024) {
    throw new Error("El MP4 temporal no existe o su tamaño es inválido.");
  }

  checkH264Aac(source);
  const sourceBuffer = await fs.readFile(source);
  const expectedHash = hash(sourceBuffer);

  console.log("Origen temporal:", source);
  console.log("Destino NUEVO:", DESTINATION);
  console.log("Tamaño:", (stats.size / 1024 / 1024).toFixed(2), "MB");
  console.log("Verificando que no exista el destino...");

  const storage = new Client();
  const existing = await storage.exists(DESTINATION);
  if (!existing.ok) {
    throw new Error("No se pudo comprobar el destino: " + String(existing.error?.message || existing.error));
  }
  if (existing.value === true) {
    throw new Error("El destino ya existe. Se detuvo para NO sobrescribirlo.");
  }

  console.log("Subiendo únicamente el MP4...");
  const uploaded = await storage.uploadFromFilename(DESTINATION, source, { contentType: "video/mp4" });
  if (!uploaded.ok) {
    throw new Error("Falló la subida: " + String(uploaded.error?.message || uploaded.error));
  }

  console.log("Verificando el archivo subido...");
  const check = await storage.downloadAsBytes(DESTINATION);
  if (!check.ok || !Buffer.isBuffer(check.value)) {
    throw new Error("Se subió el MP4 pero no se pudo descargar para verificarlo.");
  }
  const uploadedHash = hash(check.value);
  if (expectedHash !== uploadedHash) {
    throw new Error("El archivo subido no coincide con el MP4 temporal. No modificar el catálogo.");
  }

  const bucket = await storage.getBucket();
  const [metadata] = await bucket.file(DESTINATION).getMetadata();
  if (metadata.contentType !== "video/mp4") {
    throw new Error("El archivo subido tiene Content-Type " + metadata.contentType + " y requiere revisión antes de activarlo.");
  }

  console.log("SUBIDA PILOTO VERIFICADA: SHA-256 y video/mp4 correctos.");
  console.log("Destino:", DESTINATION);
  console.log("MOV original intacto. El catálogo todavía apunta al MOV.");
  console.log("Enviar este resultado para cambiar SOLO el material 1 del día 1 en la rama de prueba.");
}

main().catch((error) => {
  console.error("PILOTO DETENIDO:", error.message);
  console.error("No se modificó el catálogo ni se reemplazó el MOV original.");
  process.exitCode = 1;
});
