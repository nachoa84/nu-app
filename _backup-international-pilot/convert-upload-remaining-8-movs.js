#!/usr/bin/env node
"use strict";

// Biblioteca Internacional: convertir y subir únicamente los 8 MOV que quedan.
// No se reemplazan los MOV originales, no se toca el catálogo ni se publica la app.
// Cada MP4 se guarda en una ruta nueva y se verifica por SHA-256 antes de informar éxito.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { Client } = require("@replit/object-storage");
const catalog = require("../biblioteca-internacional-catalog.json");

const PREFIX = "bot/active/international/v1";
const TARGETS = [
  { key: "collagen/es/2",  folder: "ES COLAGENO", day: 2, index: 1 },
  { key: "collagen/es/6",  folder: "ES COLAGENO", day: 6, index: 2 },
  { key: "collagen/es/9",  folder: "ES COLAGENO", day: 9, index: 2 },
  { key: "collagen/it/6",  folder: "IT COLAGENO", day: 6, index: 2 },
  { key: "lumispa/it/7",  folder: "IT LUMI",     day: 7, index: 1 },
  { key: "lumispa/it/7",  folder: "IT LUMI",     day: 7, index: 2 },
  { key: "lumispa/it/7",  folder: "IT LUMI",     day: 7, index: 3 },
  { key: "lumispa/it/7",  folder: "IT LUMI",     day: 7, index: 4 }
];

function formatSize(bytes) {
  return (bytes / 1048576).toFixed(2) + " MB";
}

function checkBinary(name) {
  const run = spawnSync(name, ["-version"], { encoding: "utf8", timeout: 10000 });
  return !run.error && run.status === 0;
}

function runBinary(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, { stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", chunk => {
      errors = (errors + chunk.toString()).slice(-6000);
    });
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve() :
      reject(new Error(name + " terminó con código " + code + "\n" + errors)));
  });
}

function getCodecs(filename) {
  const run = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "stream=codec_name,codec_type",
    "-of", "json", filename
  ], { encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 });
  if (run.error || run.status !== 0) {
    throw new Error("ffprobe no pudo analizar " + path.basename(filename) + ": " + (run.stderr || run.error?.message || ""));
  }
  return JSON.parse(run.stdout).streams || [];
}

async function hashFile(filename) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyRemote(bucket, objectName, filePath) {
  const expected = await fsp.stat(filePath);
  const expectedHash = await hashFile(filePath);
  const remote = bucket.file(objectName);
  const [metadata] = await remote.getMetadata();
  if (Number(metadata.size) !== expected.size) {
    throw new Error("El tamaño subido no coincide con el MP4 local.");
  }
  if (metadata.contentType !== "video/mp4") {
    throw new Error("Content-Type incorrecto: " + String(metadata.contentType));
  }
  const remoteHash = crypto.createHash("sha256");
  let received = 0;
  for await (const chunk of remote.createReadStream({ decompress: false })) {
    received += chunk.length;
    remoteHash.update(chunk);
  }
  if (received !== expected.size || remoteHash.digest("hex") !== expectedHash) {
    throw new Error("El SHA-256 del MP4 remoto no coincide con el convertido.");
  }
  return expected.size;
}

async function storageExists(client, objectName) {
  const result = await client.exists(objectName);
  if (!result.ok) {
    throw new Error("No se pudo comprobar existencia de " + objectName + ": " +
      String(result.error?.message || result.error));
  }
  return result.value === true;
}

async function findOriginal(bucket, item) {
  const filenames = [item.index + ".mov"];
  for (const folder of ["DIA " + item.day, "DÍA " + item.day]) {
    const objectName = [PREFIX, item.folder, folder, filenames[0]].join("/");
    try {
      const file = bucket.file(objectName);
      const [metadata] = await file.getMetadata();
      const size = Number(metadata?.size);
      if (!Number.isSafeInteger(size) || size <= 0) {
        throw new Error("MOV original vacío o de tamaño inválido: " + objectName);
      }
      return { objectName, file, folder, size };
    } catch (error) {
      if (Number(error?.code) !== 404 && Number(error?.status) !== 404) throw error;
    }
  }
  throw new Error("MOV original no encontrado: " + item.folder + " / Día " + item.day + " / " + filenames[0]);
}

async function convertOne(storage, bucket, item, position) {
  const label = item.folder + " / Día " + item.day + " / " + item.index + ".mov";
  console.log("\n[" + position + "/" + TARGETS.length + "] " + label);
  const original = await findOriginal(bucket, item);
  const outputName = item.index + ".mp4";
  const destination = [PREFIX, item.folder, original.folder, outputName].join("/");

  // Si existe un MP4 en la variante de carpeta opuesta, el servidor podría
  // resolverlo antes. Detenerse para evitar utilizar un archivo equivocado.
  for (const alternate of ["DIA " + item.day, "DÍA " + item.day]) {
    const possible = [PREFIX, item.folder, alternate, outputName].join("/");
    if (possible !== destination && await storageExists(storage, possible)) {
      throw new Error("Ya hay un MP4 en otra variante de carpeta; requiere revisión: " + possible);
    }
  }

  const tempFolder = await fsp.mkdtemp(path.join(os.tmpdir(), "nu-international-mp4-batch-"));
  const sourceCopy = path.join(tempFolder, "fuente.mov");
  const convertedCopy = path.join(tempFolder, "convertido.mp4");
  let verified = false;
  try {
    console.log("  Copiando original:", formatSize(original.size));
    await pipeline(original.file.createReadStream({ decompress: false }), fs.createWriteStream(sourceCopy));
    if ((await fsp.stat(sourceCopy)).size !== original.size) throw new Error("La copia MOV quedó incompleta.");

    const sourceCodecs = getCodecs(sourceCopy);
    if (!sourceCodecs.some(stream => stream.codec_type === "video")) {
      throw new Error("El MOV no contiene una pista de video.");
    }
    console.log("  Convirtiendo a MP4 H.264/AAC (puede tardar)...");
    await runBinary("ffmpeg", [
      "-hide_banner", "-nostdin", "-loglevel", "error", "-n",
      "-i", sourceCopy, "-map", "0:v:0", "-map", "0:a?",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
      convertedCopy
    ]);

    const outputCodecs = getCodecs(convertedCopy);
    if (!outputCodecs.some(stream => stream.codec_type === "video" && stream.codec_name === "h264")) {
      throw new Error("El MP4 no tiene video H.264.");
    }
    if (sourceCodecs.some(stream => stream.codec_type === "audio") &&
        !outputCodecs.some(stream => stream.codec_type === "audio" && stream.codec_name === "aac")) {
      throw new Error("El MP4 perdió la pista de audio.");
    }

    const outputStats = await fsp.stat(convertedCopy);
    if (!outputStats.isFile() || outputStats.size <= 0) throw new Error("El MP4 quedó vacío.");

    const alreadyUploaded = await storageExists(storage, destination);
    if (alreadyUploaded) {
      console.log("  Ya existe MP4: verificando sin sobrescribir...");
    } else {
      console.log("  Subiendo MP4 nuevo:", formatSize(outputStats.size));
      const result = await storage.uploadFromFilename(destination, convertedCopy, { contentType: "video/mp4" });
      if (!result.ok) throw new Error("Falló la subida: " + String(result.error?.message || result.error));
    }

    const verifiedSize = await verifyRemote(bucket, destination, convertedCopy);
    console.log("  OK verificado (SHA-256 + video/mp4):", formatSize(verifiedSize));
    console.log("  Archivo:", destination);
    verified = true;
    return { label, destination, originalSize: original.size, outputSize: verifiedSize };
  } finally {
    if (verified) {
      // Limpiar únicamente los archivos temporales creados por este paso.
      await fsp.unlink(sourceCopy).catch(() => {});
      await fsp.unlink(convertedCopy).catch(() => {});
      await fsp.rmdir(tempFolder).catch(() => {});
    } else {
      console.error("  Copias temporales conservadas para diagnóstico:", tempFolder);
    }
  }
}

async function main() {
  if (!checkBinary("ffmpeg") || !checkBinary("ffprobe")) {
    throw new Error("Falta ffmpeg o ffprobe. No se subió ningún material.");
  }
  if (TARGETS.length !== 8) throw new Error("Cantidad de pilotos inesperada.");
  for (const target of TARGETS) {
    const actual = catalog[target.key]?.[target.index - 1];
    if (actual?.filename !== target.index + ".mov" || actual.type !== "video") {
      throw new Error("El catálogo cambió; abortando antes de subir: " + target.key);
    }
  }

  console.log("Conversión de 8 MOV restantes de Biblioteca Internacional.");
  console.log("No reemplaza originales; el catálogo permanece sin cambios.");
  const storage = new Client();
  const bucket = await storage.getBucket();
  const successes = [], failures = [];
  for (let i = 0; i < TARGETS.length; i++) {
    try {
      successes.push(await convertOne(storage, bucket, TARGETS[i], i + 1));
    } catch (error) {
      const item = TARGETS[i];
      const name = item.folder + " / Día " + item.day + " / " + item.index + ".mov";
      failures.push({ name, error: error.message });
      console.error("  FALLÓ " + name + ": " + error.message);
    }
  }

  console.log("\nRESUMEN: " + successes.length + "/" + TARGETS.length + " MP4 verificados.");
  for (const item of successes) {
    console.log("  OK " + item.label + " (" + formatSize(item.originalSize) + " → " + formatSize(item.outputSize) + ")");
  }
  for (const failure of failures) {
    console.error("  PENDIENTE " + failure.name + ": " + failure.error);
  }
  console.log("Los MOV originales y el catálogo NO se modificaron.");
  if (failures.length) {
    console.error("LOTE INCOMPLETO: no activar el catálogo hasta resolver los pendientes.");
    process.exitCode = 1;
  } else {
    console.log("LOTE VERIFICADO 8/8: listo para activar SOLO estas 8 referencias en la rama de prueba.");
  }
}

main().catch(error => {
  console.error("LOTE DETENIDO:", error.message);
  console.error("No se modificó el catálogo ni se reemplazaron originales.");
  process.exitCode = 1;
});
