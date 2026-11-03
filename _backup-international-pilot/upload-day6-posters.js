#!/usr/bin/env node
"use strict";

// Piloto day 6: generar el primer fotograma JPG de los DOS MP4 720p verificados.
// Solo añade 2002.jpg a App Storage, sin tocar videos, catálogo ni producción.
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { Client } = require("@replit/object-storage");
const catalog = require("../biblioteca-internacional-catalog.json");

const BRANCH = "feature/iris-biblioteca-internacional-20261102";
const ROOT = "bot/active/international/v1";
const TARGETS = [
  { key: "collagen/es/6", dir: "ES COLAGENO", name: "Collagen+ España, día 6, material 2", duration: 42.27 },
  { key: "collagen/it/6", dir: "IT COLAGENO", name: "Collagen+ Italia, día 6, material 2", duration: 50.73 }
];

function exec(name, args) {
  const result = spawnSync(name, args, {
    encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    throw Error(name + " falló: " + (result.stderr || result.error?.message || "código " + result.status));
  }
  return result.stdout;
}
function inspect(filename) {
  return JSON.parse(exec("ffprobe", [
    "-v", "error", "-show_entries", "stream=codec_name,codec_type,width,height:format=duration",
    "-of", "json", filename
  ]));
}
function validateSource(filename, item) {
  const info = inspect(filename);
  const video = info.streams?.find(s => s.codec_type === "video");
  const audio = info.streams?.find(s => s.codec_type === "audio");
  if (video?.codec_name !== "h264" || video.width !== 720 || video.height !== 1272 ||
      audio?.codec_name !== "aac" ||
      Math.abs(Number(info.format?.duration) - item.duration) > 0.3) {
    throw Error("El MP4 no coincide con el piloto aprobado: " + filename);
  }
}
function validateJpg(filename) {
  const info = inspect(filename);
  const image = info.streams?.find(s => s.codec_type === "video");
  if (image?.codec_name !== "mjpeg" || image.width !== 360 || image.height !== 636) {
    throw Error("Fotograma JPG inválido: " + filename);
  }
}
async function hashFile(filename) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
async function exists(client, filename) {
  const result = await client.exists(filename);
  if (!result.ok) throw Error("No se pudo consultar " + filename + ": " +
    String(result.error?.message || result.error));
  return result.value === true;
}
async function verify(bucket, remoteName, localName) {
  const expected = await fsp.stat(localName);
  const expectedHash = await hashFile(localName);
  const [metadata] = await bucket.file(remoteName).getMetadata();
  if (metadata.contentType !== "image/jpeg" || Number(metadata.size) !== expected.size) {
    throw Error("Metadata de JPG incorrecta en " + remoteName);
  }
  const hash = crypto.createHash("sha256");
  let size = 0;
  for await (const chunk of bucket.file(remoteName).createReadStream({ decompress: false })) {
    size += chunk.length;
    hash.update(chunk);
  }
  if (size !== expected.size || hash.digest("hex") !== expectedHash) {
    throw Error("JPG remoto no coincide con el original (SHA-256): " + remoteName);
  }
  return expected.size;
}
async function main() {
  if (exec("git", ["branch", "--show-current"]).trim() !== BRANCH) {
    throw Error("Rama incorrecta. Requiere " + BRANCH);
  }
  for (const item of TARGETS) {
    if (catalog[item.key]?.[1]?.filename !== "2002.mp4" ||
        catalog[item.key]?.[1]?.type !== "video") {
      throw Error("Catálogo inesperado para " + item.key + "; no se tocará App Storage.");
    }
  }
  const storage = new Client();
  const bucket = await storage.getBucket();
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "nu-day6-posters-"));
  console.log("CARPETA TEMPORAL:", temp);
  console.log("Primer fotograma de los 2 videos optimizados; sin cambiar referencias.");

  const planned = [];
  // Preparar y validar los DOS JPG antes de subir cualquiera.
  for (const [i, item] of TARGETS.entries()) {
    const objectVideo = [ROOT, item.dir, "DIA 6", "2002.mp4"].join("/");
    const objectPoster = [ROOT, item.dir, "DIA 6", "2002.jpg"].join("/");
    const alternatePoster = [ROOT, item.dir, "DÍA 6", "2002.jpg"].join("/");
    if (await exists(storage, alternatePoster)) {
      throw Error("Ya existe una imagen en la carpeta alternativa: " + alternatePoster);
    }
    const [metadata] = await bucket.file(objectVideo).getMetadata();
    const videoPath = path.join(temp, "video-" + (i + 1) + ".mp4");
    const jpgPath = path.join(temp, "poster-" + (i + 1) + ".jpg");
    await pipeline(bucket.file(objectVideo).createReadStream({ decompress: false }),
      fs.createWriteStream(videoPath));
    const stat = await fsp.stat(videoPath);
    if (stat.size !== Number(metadata.size) || metadata.contentType !== "video/mp4") {
      throw Error("La copia MP4 está incompleta o tiene tipo incorrecto: " + objectVideo);
    }
    validateSource(videoPath, item);
    exec("ffmpeg", [
      "-hide_banner", "-nostdin", "-loglevel", "error", "-n",
      "-i", videoPath, "-vf", "scale=360:-2",
      "-frames:v", "1", "-q:v", "3", jpgPath
    ]);
    validateJpg(jpgPath);
    const jpgStat = await fsp.stat(jpgPath);
    if (jpgStat.size < 2000 || jpgStat.size > 750000) {
      throw Error("Tamaño de la miniatura fuera del rango esperado: " + jpgPath);
    }
    planned.push({ item, objectPoster, jpgPath, size: jpgStat.size });
  }
  for (const [i, target] of planned.entries()) {
    console.log("\n[" + (i + 1) + "/2] " + target.item.name);
    console.log("  Miniatura:", target.size + " bytes, JPEG 360x636");
    console.log("  Destino nuevo:", target.objectPoster);
    if (await exists(storage, target.objectPoster)) {
      console.log("  Ya existe; verificando sin sobrescribir...");
    } else {
      const result = await storage.uploadFromFilename(target.objectPoster, target.jpgPath, {
        contentType: "image/jpeg"
      });
      if (!result.ok) throw Error("Fallo de subida: " +
        String(result.error?.message || result.error));
    }
    await verify(bucket, target.objectPoster, target.jpgPath);
    console.log("  OK: tamaño, image/jpeg y SHA-256 correctos.");
  }
  console.log("\nPOSTERS VERIFICADOS 2/2");
  console.log("Los MP4 y MOV originales permanecen intactos.");
  console.log("No se modificó el código ni el catálogo de Nu App.");
  console.log("Pasame este resultado para activar el nuevo reproductor piloto.");
}

main().catch(error => {
  console.error("PILOTO DETENIDO:", error.message);
  console.error("No se sobrescribieron videos ni se modificó el catálogo.");
  process.exitCode = 1;
});
