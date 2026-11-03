#!/usr/bin/env node
"use strict";

// Verificación SOLO LECTURA del MP4 ya subido para el piloto.
// No vuelve a subir, reemplaza, borra ni modifica objetos o catálogo.

const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { Client } = require("@replit/object-storage");

const LOCAL_MP4 = "/tmp/nu-es-collagen-d1-pilot-Gg7f9H/collagen-es-dia-1-material-1.mp4";
const STORAGE_MP4 = "bot/active/international/v1/ES COLAGENO/DIA 1/1.mp4";

async function main() {
  const local = await fs.readFile(LOCAL_MP4);
  if (!local.length) throw new Error("No se encontró el MP4 temporal.");

  const localHash = crypto.createHash("sha256").update(local).digest("hex");
  const storage = new Client();
  const bucket = await storage.getBucket();
  const remote = bucket.file(STORAGE_MP4);
  const [metadata] = await remote.getMetadata();

  console.log("Verificando MP4 en App Storage (solo lectura)...");
  console.log("Destino:", STORAGE_MP4);
  console.log("Tamaño temporal:", local.length, "bytes");
  console.log("Tamaño almacenado:", metadata.size, "bytes");
  console.log("Tipo de contenido:", metadata.contentType || "(sin identificar)");

  if (Number(metadata.size) !== local.length) {
    throw new Error("El MP4 subido tiene un tamaño diferente al temporal.");
  }

  const readStream = remote.createReadStream({ decompress: false });
  const remoteHashStream = crypto.createHash("sha256");
  let downloadedSize = 0;
  for await (const chunk of readStream) {
    downloadedSize += chunk.length;
    remoteHashStream.update(chunk);
  }

  const remoteHash = remoteHashStream.digest("hex");
  if (downloadedSize !== local.length || localHash !== remoteHash) {
    throw new Error("El MP4 subido no coincide con el temporal; NO activar el catálogo.");
  }
  if (metadata.contentType !== "video/mp4") {
    throw new Error("Los bytes coinciden, pero Content-Type debe ser video/mp4 antes de activarlo.");
  }

  console.log("PILOTO VERIFICADO: SHA-256, tamaño y video/mp4 correctos.");
  console.log("Se conservó el MOV original. El catálogo todavía apunta al MOV.");
  console.log("No se efectuó ninguna escritura durante esta comprobación.");
}

main().catch((error) => {
  console.error("VERIFICACIÓN PENDIENTE:", error.message);
  console.error("No se modificó ningún archivo de App Storage ni el catálogo.");
  process.exitCode = 1;
});
