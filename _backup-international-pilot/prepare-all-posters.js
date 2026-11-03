#!/usr/bin/env node
"use strict";

// Biblioteca Internacional · generar primeros fotogramas para TODO el catálogo.
// Lee MP4 de App Storage y añade únicamente JPG nuevos. No modifica videos,
// catálogo, rutinas existentes, servidor ni publicación. Reanudable.
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
const COLLECTIONS = Object.freeze({
  "collagen/es": "ES COLAGENO",
  "collagen/it": "IT COLAGENO",
  "lumispa/it": "IT LUMI"
});
const MODE = process.argv[2] || "--plan";
if (!["--plan", "--upload"].includes(MODE)) {
  throw Error("Uso: node _backup-international-pilot/prepare-all-posters.js [--plan|--upload]");
}

function exec(binary, args, timeout = 180000) {
  const result = spawnSync(binary, args, {
    encoding: "utf8", timeout, maxBuffer: 2 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    throw Error(binary + ": " + (result.stderr || result.error?.message || "exit " + result.status));
  }
  return result.stdout;
}
function targets() {
  const list = [];
  for (const [key, files] of Object.entries(catalog)) {
    const [routine, country, dayText] = key.split("/");
    const collection = COLLECTIONS[routine + "/" + country];
    const day = Number(dayText);
    if (!collection || !Number.isInteger(day) || day < 1 || day > 10 || !Array.isArray(files)) {
      throw Error("Entrada inesperada del catálogo: " + key);
    }
    files.forEach((file, i) => {
      if (file.type !== "video") return;
      if (!/^\d+\.mp4$/i.test(file.filename)) throw Error("Video no MP4: " + key);
      list.push({
        key, day, index: i + 1, collection,
        video: file.filename,
        poster: file.filename.replace(/\.mp4$/i, ".jpg")
      });
    });
  }
  if (Object.keys(catalog).length !== 30 || list.length !== 55) {
    throw Error("Cantidad inesperada de materiales: se esperaban 30 días y 55 videos.");
  }
  return list;
}
async function exists(storage, filename) {
  const result = await storage.exists(filename);
  if (!result.ok) throw Error("Consulta fallida: " + filename + " (" + result.error?.message + ")");
  return result.value === true;
}
async function locate(storage, target) {
  for (const folder of ["DIA " + target.day, "DÍA " + target.day]) {
    const name = [ROOT, target.collection, folder, target.video].join("/");
    if (await exists(storage, name)) {
      return { source: name, poster: [ROOT, target.collection, folder, target.poster].join("/") };
    }
  }
  throw Error("Video no encontrado: " + target.key + "/" + target.index + " " + target.video);
}
async function sha256(filename) {
  const hash = crypto.createHash("sha256");
  for await (const part of fs.createReadStream(filename)) hash.update(part);
  return hash.digest("hex");
}
async function verifyPoster(bucket, remote, local) {
  const stat = await fsp.stat(local);
  const expectedHash = await sha256(local);
  const object = bucket.file(remote);
  const [metadata] = await object.getMetadata();
  if (metadata.contentType !== "image/jpeg" || Number(metadata.size) !== stat.size) {
    throw Error("Metadatos inesperados en " + remote);
  }
  let received = 0;
  const hash = crypto.createHash("sha256");
  for await (const chunk of object.createReadStream({ decompress: false })) {
    received += chunk.length;
    hash.update(chunk);
  }
  if (received !== stat.size || hash.digest("hex") !== expectedHash) {
    throw Error("SHA-256 distinto en " + remote + ". No se sobreescribió nada.");
  }
}
function validateJpg(file) {
  const probe = JSON.parse(exec("ffprobe", [
    "-v", "error", "-show_entries", "stream=codec_name,codec_type,width,height",
    "-of", "json", file
  ]));
  const stream = probe.streams?.find(s => s.codec_type === "video");
  if (stream?.codec_name !== "mjpeg" || stream.width !== 360 || !Number.isInteger(stream.height)) {
    throw Error("Fotograma inválido: " + file);
  }
}
async function main() {
  if (exec("git", ["branch", "--show-current"]).trim() !== BRANCH) {
    throw Error("Rama incorrecta. Ejecutar solo en " + BRANCH);
  }
  const all = targets();
  const storage = new Client();
  const bucket = await storage.getBucket();
  let existing = 0, missing = 0;
  const locations = [];
  for (const target of all) {
    const location = await locate(storage, target);
    const found = await exists(storage, location.poster);
    if (found) existing++; else missing++;
    locations.push({ ...target, ...location, found });
  }
  console.log("CATÁLOGO INTERNACIONAL:", all.length, "videos");
  console.log("Miniaturas existentes:", existing, "· pendientes:", missing);
  if (MODE === "--plan") {
    locations.filter(x => !x.found).forEach(x =>
      console.log("PENDIENTE:", x.key + "/" + x.index, "→", x.poster)
    );
    console.log("PLAN DE SOLO LECTURA. No se subió ningún archivo.");
    console.log("Para generar y verificar todos: node _backup-international-pilot/prepare-all-posters.js --upload");
    return;
  }
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "nu-intl-posters-"));
  let verified = 0;
  try {
    for (const [i, target] of locations.entries()) {
      const localVideo = path.join(tmp, "source.mp4");
      const localPoster = path.join(tmp, "poster.jpg");
      console.log("[" + (i + 1) + "/" + all.length + "] " +
        target.key + "/" + target.index + " " + target.video);
      const object = bucket.file(target.source);
      const [metadata] = await object.getMetadata();
      const totalSize = Number(metadata.size);
      if (metadata.contentType !== "video/mp4" ||
          !Number.isSafeInteger(totalSize) || totalSize < 1000 || totalSize > 300 * 1024 * 1024) {
        throw Error("MP4 inesperado, detener: " + target.source);
      }
      await pipeline(object.createReadStream({ decompress: false }), fs.createWriteStream(localVideo));
      if ((await fsp.stat(localVideo)).size !== totalSize) throw Error("Descarga incompleta: " + target.source);
      exec("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-n",
        "-i", localVideo, "-vf", "scale=360:-2", "-frames:v", "1", "-q:v", "3", localPoster]);
      validateJpg(localPoster);
      const jpgSize = (await fsp.stat(localPoster)).size;
      if (jpgSize < 1000 || jpgSize > 750000) throw Error("Miniatura de tamaño anormal.");
      if (target.found) {
        // Reanudación segura: si difiere de la miniatura existente, detener.
        await verifyPoster(bucket, target.poster, localPoster);
        console.log("  Existente y coincidente (SHA-256), sin cambios.");
      } else {
        // Única escritura autorizada: JPG nuevo con nombre derivado del MP4.
        if (await exists(storage, target.poster)) {
          await verifyPoster(bucket, target.poster, localPoster);
          console.log("  Creado por otra ejecución; verificado.");
        } else {
          const uploaded = await storage.uploadFromFilename(target.poster, localPoster, {
            contentType: "image/jpeg"
          });
          if (!uploaded.ok) throw Error("No se pudo subir " + target.poster + ": " + uploaded.error?.message);
          await verifyPoster(bucket, target.poster, localPoster);
          console.log("  JPG nuevo verificado:", jpgSize, "bytes.");
        }
      }
      verified++;
      await Promise.all([fsp.unlink(localVideo), fsp.unlink(localPoster)]);
    }
  } finally {
    // Solo se elimina esta carpeta temporal creada por el propio script.
    await fsp.rm(tmp, { recursive: true, force: true });
  }
  console.log("\nPOSTERS VERIFICADOS", verified + "/" + all.length);
  console.log("MP4, MOV originales y catálogo permanecen intactos.");
  console.log("Todavía NO se activó la galería general. Enviame el resultado.");
}
main().catch(error => {
  console.error("LOTE DETENIDO:", error.message);
  console.error("Nada existente fue reemplazado. Podés reanudar el lote.");
  process.exitCode = 1;
});
