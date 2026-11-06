#!/usr/bin/env node
"use strict";

// Auditoría de solo lectura de Biblioteca Internacional (rama Preview).
// Valida el catálogo y consulta HEAD / Range de los activos permitidos.
// No descarga archivos completos, no sube ni reemplaza objetos y no publica.
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
let port = 5000;
let limit = 0;
let structureOnly = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--structure-only") { structureOnly = true; continue; }
  if (arg === "--port") { port = Number(args[++i]); continue; }
  if (arg === "--limit") { limit = Number(args[++i]); continue; }
  throw Error("Argumento desconocido: " + arg + ". Usá --port 5000, --limit N o --structure-only.");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("Puerto inválido.");
if (!Number.isInteger(limit) || limit < 0) throw Error("--limit debe ser un entero >= 0.");
if (structureOnly && limit) throw Error("--limit no se usa con --structure-only.");

const catalog = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "biblioteca-internacional-catalog.json"), "utf8"
));
const groups = [
  { id: "collagen/es", label: "Colágeno España", total: 48, videos: 11, images: 37 },
  { id: "collagen/it", label: "Colágeno Italia", total: 48, videos: 12, images: 36 },
  { id: "lumispa/it", label: "LumiSpa Italia", total: 41, videos: 32, images: 9 }
];
const optimized = new Set([
  "collagen/it/3/4", "lumispa/it/3/3", "collagen/it/6/2",
  "collagen/es/6/2", "lumispa/it/6/3"
]);
const expectedKeys = new Set(groups.flatMap(group =>
  Array.from({ length: 10 }, (_, i) => group.id + "/" + (i + 1))
));
const issues = [];
const materials = [];
const stats = { videos: 0, images: 0 };

for (const key of Object.keys(catalog)) {
  if (!expectedKeys.has(key)) issues.push("Carpeta no prevista en catálogo: " + key);
}
for (const group of groups) {
  let videos = 0, images = 0, total = 0, presentDays = 0;
  for (let day = 1; day <= 10; day++) {
    const key = group.id + "/" + day;
    const items = catalog[key];
    if (!Array.isArray(items) || !items.length) {
      issues.push("Día vacío o ausente: " + key);
      continue;
    }
    presentDays++;
    const filenames = new Set();
    items.forEach((item, i) => {
      const label = key + " material " + (i + 1);
      if (!item || typeof item !== "object") {
        issues.push("Entrada inválida: " + label); return;
      }
      const ext = typeof item.filename === "string"
        ? item.filename.toLowerCase().split(".").pop() : "";
      if (!/^\d+\.(?:mp4|jpg)$/i.test(item.filename || ""))
        issues.push("Nombre/formato inesperado: " + label + " (" + item.filename + ")");
      if ((item.type === "video" && ext !== "mp4") ||
          (item.type === "image" && ext !== "jpg") ||
          !["video", "image"].includes(item.type)) {
        issues.push("Tipo y extensión no coinciden: " + label);
        return;
      }
      if (filenames.has(item.filename.toLowerCase()))
        issues.push("Nombre duplicado dentro del día: " + label);
      filenames.add(item.filename.toLowerCase());
      stats[item.type === "video" ? "videos" : "images"]++;
      if (item.type === "video") videos++; else images++;
      total++;
      const [product, country] = group.id.split("/");
      const id = key + "/" + (i + 1);
      const url = "/api/international-assets/" + product + "-" + country +
        "/" + day + "/" + (i + 1);
      materials.push({ id, label, type: item.type, url });
    });
  }
  console.log(group.label + ": " + presentDays + "/10 días | " + total + " materiales (" +
    videos + " videos, " + images + " imágenes)");
  if (total !== group.total || videos !== group.videos || images !== group.images)
    issues.push("Cambió la cantidad aprobada de " + group.label +
      ": se esperaba " + group.total + " (" + group.videos + "/" + group.images + ")");
}
if (materials.length !== 137 || stats.videos !== 55 || stats.images !== 82)
  issues.push("Total diferente del catálogo aprobado: " + materials.length +
    " materiales, " + stats.videos + " videos, " + stats.images + " imágenes");
for (const id of optimized) {
  if (!materials.some(material => material.id === id && material.type === "video"))
    issues.push("Video optimizado ausente o cambiado: " + id);
}
console.log("Catálogo: " + materials.length + " materiales | " +
  stats.videos + " videos | " + stats.images + " imágenes.");

function reportIssues(title, list) {
  console.log(title + ": " + list.length);
  for (const issue of list.slice(0, 40)) console.log("  ERROR " + issue);
  if (list.length > 40) console.log("  ...otros " + (list.length - 40) + " problemas omitidos.");
}
if (structureOnly) {
  reportIssues("Problemas de estructura", issues);
  console.log("Auditoría estática finalizada: no se consultó el servidor ni se modificó nada.");
  console.log("Pendiente humano: verificar contenido visual, orden semántico y exclusiones por material.");
  if (issues.length) process.exitCode = 1;
  process.exit();
}

const base = "http://127.0.0.1:" + port;
const selected = limit ? materials.slice(0, limit) : materials;
const tasks = [];
for (const material of selected) {
  tasks.push({ material, role: "original", kind: "head", url: material.url,
    expectType: material.type === "video" ? "video/mp4" : "image/jpeg" });
  if (material.type === "video") {
    tasks.push({ material, role: "poster", kind: "head",
      url: material.url + "?poster=first-frame&v=international-posters-55-1",
      expectType: "image/jpeg" });
    tasks.push({ material, role: "rango", kind: "range", url: material.url });
    if (optimized.has(material.id)) tasks.push({ material, role: "optimizado", kind: "head",
      url: material.url + "?v=optimized-preview-20261106", expectType: "video/mp4" });
  } else {
    for (const variant of ["thumb", "preview"]) {
      tasks.push({ material, role: variant, kind: "head",
        url: material.url + "?variant=" + variant + "&v=international-images-82-1",
        expectType: "image/jpeg" });
    }
  }
}

async function probe(task) {
  try {
    const response = await fetch(base + task.url, {
      method: task.kind === "range" ? "GET" : "HEAD",
      headers: task.kind === "range" ? { Range: "bytes=0-0" } : {},
      signal: AbortSignal.timeout(20000)
    });
    if (task.kind === "range") {
      if (response.body) await response.body.cancel().catch(() => {});
      if (response.status !== 206) throw Error("Range HTTP " + response.status);
      const contentRange = response.headers.get("content-range") || "";
      if (!/^bytes 0-0\/\d+$/i.test(contentRange))
        throw Error("Content-Range inválido: " + contentRange);
      return { ok: true, bytes: 1 };
    }
    if (response.status !== 200) throw Error("HEAD HTTP " + response.status);
    const bytes = Number(response.headers.get("content-length"));
    if (!Number.isSafeInteger(bytes) || bytes <= 0)
      throw Error("Content-Length ausente o inválido");
    const mime = (response.headers.get("content-type") || "").toLowerCase();
    if (!mime.startsWith(task.expectType))
      throw Error("Content-Type inesperado: " + (mime || "vacío"));
    if (task.role === "optimizado") {
      const variant = response.headers.get("x-nu-international-variant");
      if (variant !== "optimized-preview")
        throw Error("No se entregó la copia optimizada: " + (variant || "sin cabecera"));
    }
    return { ok: true, bytes };
  } catch (error) {
    return { ok: false, message: task.material.label + " [" + task.role + "]: " +
      (error.message || String(error)) };
  }
}
async function main() {
  console.log("\nComprobación HTTP " + (limit ? "PARCIAL" : "COMPLETA") +
    ": " + selected.length + " materiales, " + tasks.length +
    " solicitudes livianas (HEAD o Range 1 byte), concurrencia 5.");
  const results = new Array(tasks.length);
  let next = 0, finished = 0;
  const workers = Array.from({ length: Math.min(5, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await probe(tasks[i]);
      finished++;
      if (finished % 75 === 0 || finished === tasks.length)
        console.log("  Comprobaciones: " + finished + "/" + tasks.length);
    }
  });
  await Promise.all(workers);
  const httpIssues = results.filter(result => !result.ok).map(result => result.message);
  for (const material of selected.filter(item => optimized.has(item.id))) {
    const sourceIndex = tasks.findIndex(t => t.material.id === material.id && t.role === "original");
    const optimizedIndex = tasks.findIndex(t => t.material.id === material.id && t.role === "optimizado");
    const before = results[sourceIndex], after = results[optimizedIndex];
    if (before?.ok && after?.ok && after.bytes >= before.bytes)
      httpIssues.push(material.label + ": el optimizado no pesa menos que el original");
  }
  reportIssues("Problemas de estructura", issues);
  reportIssues("Problemas de HTTP/archivos", httpIssues);
  const passed = results.filter(result => result.ok).length;
  console.log("Resultado: " + passed + "/" + tasks.length + " solicitudes correctas.");
  console.log("No se descargaron archivos completos ni se modificó almacenamiento, catálogo o publicación.");
  console.log("Pendiente humano: revisar contenido visual, orden semántico y exclusiones (precios / sin animaciones).");
  if (issues.length || httpIssues.length) process.exitCode = 1;
}
main().catch(error => { console.error("Auditoría falló:", error); process.exitCode = 1; });
