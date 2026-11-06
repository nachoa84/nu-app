#!/usr/bin/env node
"use strict";

// Exportación de solo lectura: imágenes livianas + primeras imágenes de MP4.
// Genera una galería HTML local y un archivo comprimido para revisión humana.
// No descarga videos completos, no usa Agent ni modifica Object Storage.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const argv = process.argv.slice(2);
let port = 5000;
let limit = 0;
let all = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--port") { port = Number(argv[++i]); continue; }
  if (argv[i] === "--limit") { limit = Number(argv[++i]); continue; }
  if (argv[i] === "--all") { all = true; continue; }
  throw Error("Argumento desconocido: " + argv[i]);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("Puerto inválido.");
if (!Number.isInteger(limit) || limit < 1 && !all) throw Error("Usá --limit 3 para probar o --all para exportar todo.");
if (all && limit) throw Error("Elegí --all o --limit, no ambos.");

const root = path.resolve(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(
  path.join(root, "biblioteca-internacional-catalog.json"), "utf8"
));
const groups = [
  { id: "collagen/es", title: "Colágeno España", code: "01-ES-COLAGENO" },
  { id: "collagen/it", title: "Colágeno Italia", code: "02-IT-COLAGENO" },
  { id: "lumispa/it", title: "LumiSpa Italia", code: "03-IT-LUMI" }
];
const materials = [];
for (const group of groups) {
  for (let day = 1; day <= 10; day++) {
    const key = group.id + "/" + day;
    const entries = catalog[key];
    if (!Array.isArray(entries) || !entries.length) throw Error("Día sin materiales: " + key);
    entries.forEach((entry, idx) => {
      const number = idx + 1;
      if (!entry || !["video", "image"].includes(entry.type) ||
          !/^\d+\.(mp4|jpg)$/i.test(entry.filename)) {
        throw Error("Material inesperado en " + key + " posición " + number);
      }
      const [product, country] = group.id.split("/");
      const route = "/api/international-assets/" + product + "-" + country + "/" + day + "/" + number;
      const variant = entry.type === "video"
        ? "?poster=first-frame&v=international-posters-55-1"
        : "?variant=preview&v=international-images-82-1";
      const filename = group.code + "-dia-" + String(day).padStart(2, "0") +
        "-material-" + String(number).padStart(2, "0") + ".jpg";
      materials.push({ group: group.title, key, day, number, type: entry.type,
        originalName: entry.filename, filename, source: route + variant });
    });
  }
}
if (materials.length !== 137) throw Error("Catálogo diferente: " + materials.length + " materiales.");
const chosen = all ? materials : materials.slice(0, limit);
const outputBase = path.join(root, "scripts", "_audit-output");
const bundleName = "international-visual-review-20261106" + (all ? "" : "-sample");
const outputDir = path.join(outputBase, bundleName);
const framesDir = path.join(outputDir, "frames");
fs.mkdirSync(framesDir, { recursive: true });

const esc = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
async function validLocal(file) {
  try {
    const data = await fs.promises.readFile(file);
    return data.length > 200 && data[0] === 255 && data[1] === 216;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function fetchJpeg(material) {
  const file = path.join(framesDir, material.filename);
  if (await validLocal(file)) return { skipped: true, bytes: fs.statSync(file).size };
  if (fs.existsSync(file)) throw Error("Ya existe un archivo inválido, no lo sobrescribo: " + file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch("http://127.0.0.1:" + port + material.source,
      { signal: controller.signal });
    if (response.status !== 200) throw Error("GET HTTP " + response.status);
    if (!(response.headers.get("content-type") || "").toLowerCase().startsWith("image/jpeg"))
      throw Error("La respuesta no es JPEG");
    const expectedLength = Number(response.headers.get("content-length"));
    const maxBytes = 8 * 1024 * 1024;
    if (expectedLength > maxBytes) throw Error("Vista previa demasiado grande");
    const reader = response.body?.getReader();
    if (!reader) throw Error("No hay datos de imagen");
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      bytes += value.length;
      if (bytes > maxBytes) { await reader.cancel(); throw Error("Superó el máximo de 8 MB"); }
    }
    const data = Buffer.concat(chunks);
    if (data.length < 200 || data[0] !== 255 || data[1] !== 216)
      throw Error("Los datos no tienen formato JPEG válido");
    await fs.promises.writeFile(file, data, { flag: "wx" });
    return { skipped: false, bytes: data.length };
  } finally { clearTimeout(timer); }
}

function makeHtml(items) {
  let section = "", lastKey = "", lastGroup = "";
  for (const material of items) {
    if (material.group !== lastGroup) {
      if (lastKey) section += "</div></section>";
      section += "<h2>" + esc(material.group) + "</h2>";
      lastGroup = material.group;
      lastKey = "";
    }
    if (material.key !== lastKey) {
      if (lastKey) section += "</div></section>";
      section += "<section><h3>Día " + material.day + "</h3><div class=grid>";
      lastKey = material.key;
    }
    section += "<figure><a href=\"frames/" + esc(material.filename) + "\" target=_blank>" +
      "<img loading=lazy src=\"frames/" + esc(material.filename) + "\" alt=\"" +
      esc(material.key + " material " + material.number) + "\"></a>" +
      "<figcaption>Material " + material.number + " · " +
      (material.type === "video" ? "VIDEO (solo primer fotograma)" : "IMAGEN") +
      "</figcaption></figure>";
  }
  if (lastKey) section += "</div></section>";
  return '<!doctype html><html lang="es"><meta charset="utf-8"><title>Auditoría visual · Biblioteca Internacional</title>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    'body{font:16px system-ui,sans-serif;background:#f5f7fa;color:#172335;margin:24px auto;max-width:1400px;padding:0 16px}' +
    'h1{color:#245bd9}h2{border-bottom:3px solid #ff8b25;padding-bottom:8px;margin-top:45px}' +
    'section{background:#fff;border-radius:14px;margin:20px 0;padding:16px;box-shadow:0 2px 12px #0001}' +
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}' +
    'figure{border:1px solid #e1e6eb;border-radius:10px;padding:10px;margin:0;text-align:center;background:#fafafa}' +
    'img{display:block;object-fit:contain;width:100%;height:240px;background:#e7ecf3}' +
    'figcaption{font-size:12px;margin-top:8px;min-height:36px}' +
    '.info{background:#fff0de;border-radius:10px;padding:12px}</style>' +
    '<h1>Biblioteca Internacional · revisión visual</h1>' +
    '<p class=info>Imágenes livianas y primeras imágenes de videos. La imagen de un video NO permite verificar su contenido completo. Revisar precios, exclusiones, texto y orden.</p>' +
    '<p>Materiales exportados: ' + items.length + ' de 137. No se modificó la aplicación.</p>' +
    section + '</html>';
}
async function main() {
  console.log("Exportación visual " + (all ? "COMPLETA" : "DE PRUEBA") +
    ": " + chosen.length + " imágenes JPEG (82 imágenes y 55 primeros fotogramas en total).");
  const results = new Array(chosen.length);
  let next = 0, finished = 0;
  const workers = Array.from({ length: Math.min(4, chosen.length) }, async () => {
    while (next < chosen.length) {
      const i = next++;
      try { results[i] = await fetchJpeg(chosen[i]); }
      catch (error) { results[i] = { error: (error.message || String(error)) }; }
      finished++;
      if (finished % 25 === 0 || finished === chosen.length)
        console.log("  Revisadas: " + finished + "/" + chosen.length);
    }
  });
  await Promise.all(workers);
  const problems = chosen.flatMap((item, i) => results[i].error ?
    [item.key + " material " + item.number + ": " + results[i].error] : []);
  if (problems.length) {
    console.error("No se generó paquete completo: " + problems.length + " errores.");
    problems.slice(0, 25).forEach(problem => console.error("  " + problem));
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(path.join(outputDir, "index.html"), makeHtml(chosen));
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), selected: chosen.length,
    totalCatalog: materials.length, materials: chosen
  }, null, 2) + "\n");
  const zipPath = path.join(outputBase, bundleName + ".zip");
  const zip = spawnSync("zip", ["-q", "-r", zipPath, "."],
    { cwd: outputDir, encoding: "utf8" });
  let archive = zipPath;
  if (zip.error || zip.status !== 0) {
    archive = path.join(outputBase, bundleName + ".tar.gz");
    const tar = spawnSync("tar", ["-czf", archive, "-C", outputDir, "."],
      { encoding: "utf8" });
    if (tar.error || tar.status !== 0) throw Error("No se pudo comprimir: " + (tar.stderr || tar.error));
  }
  console.log("Listo: " + chosen.length + " imágenes exportadas; " +
    results.filter(result => result.skipped).length + " ya existían.");
  console.log("Galería local: " + path.join(outputDir, "index.html"));
  console.log("Archivo para adjuntar a ChatGPT: " + archive);
  console.log("No se descargaron videos completos ni se modificaron originales, catálogo o producción.");
}
main().catch(error => { console.error("Error:", error.message || error); process.exitCode = 1; });
