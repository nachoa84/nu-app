#!/usr/bin/env node
"use strict";
// Ejecutar dentro de Replit: crea un prefijo nuevo y nunca sobrescribe originales.
// El marcador que habilita la tarjeta se escribe solo al verificar TODOS los objetos.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const combo = require("../international-combo-es");

function planUploads(source) {
  if (combo.manifest.files.length !== 58) throw Error("Manifest incompleto");
  return combo.manifest.files.map(item => {
    if (!/^DIA [1-7]\/[1-5](?:\.(?:preview|thumb))?\.(?:png|jpg|mp4)$/.test(item.path)) {
      throw Error("Ruta no permitida: " + item.path);
    }
    const filename = path.join(source, item.path);
    const bytes = fs.readFileSync(filename);
    if (bytes.length !== item.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== item.sha256) {
      throw Error("Archivo no coincide con la copia aprobada: " + item.path);
    }
    return { ...item, source: filename, destination: `${combo.base}/${item.path}` };
  });
}

async function uploadPlans(plans, bucket, log = console.log) {
  if (plans.length !== combo.manifest.files.length || plans.some((item, index) => {
    const approved = combo.manifest.files[index];
    return item.path !== approved.path || item.sha256 !== approved.sha256 ||
      item.destination !== `${combo.base}/${approved.path}`;
  })) throw Error("La carga debe incluir todos los objetos aprobados en orden");
  for (const item of plans) {
    const remote = bucket.file(item.destination);
    const [exists] = await remote.exists();
    if (!exists) {
      await bucket.upload(item.source, {
        destination: item.destination, resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: item.contentType }
      });
    }
    const [metadata] = await remote.getMetadata();
    if (Number(metadata.size) !== item.bytes || metadata.md5Hash !== item.md5) {
      throw Error("La copia remota no coincide; no se habilitará la tarjeta: " + item.path);
    }
    log(`${exists ? "Ya coincide" : "Subido y verificado"}: ${item.path}`);
  }
  // La ruta del marcador incorpora el hash de todo el manifest aprobado.
  const ready = bucket.file(combo.readyPath);
  const [readyExists] = await ready.exists();
  if (!readyExists) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "nu-europe-combo-"));
    try {
      const filename = path.join(temp, "ready.json");
      fs.writeFileSync(filename, JSON.stringify({ manifestHash: combo.manifestHash, materials: 26, objects: plans.length }));
      await bucket.upload(filename, {
        destination: combo.readyPath, resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: "application/json" }
      });
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
  const [metadata] = await ready.getMetadata();
  if (!Number(metadata.size)) throw Error("No se pudo verificar el marcador final");
  log("Listo: 26 historias verificadas. Reiniciá Run y recargá el preview. No se publicó la app.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--dry-run", "--upload-preview"].includes(arg)) ||
      (args.includes("--dry-run") && args.includes("--upload-preview"))) {
    throw Error("Usá --dry-run o --upload-preview");
  }
  if (process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production") {
    throw Error("Este importador se ejecuta en el workspace de Replit, fuera del deployment publicado");
  }
  const source = path.resolve(__dirname, "..", "assets", "europe-combo-review");
  const plans = planUploads(source);
  console.log("Paquete verificado: 26 historias, 7 días, 58 objetos con miniaturas.");
  if (!args.includes("--upload-preview")) {
    console.log("Solo verificación local. Para subir: --upload-preview"); return;
  }
  const { Client } = require("@replit/object-storage");
  await uploadPlans(plans, await new Client().getBucket());
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { planUploads, uploadPlans };
