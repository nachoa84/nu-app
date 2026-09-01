const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function normalizeLocalReference(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (
    !raw ||
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("//") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("#") ||
    raw.startsWith("/api/")
  ) {
    return null;
  }

  return raw
    .replace(/^\.\//, "")
    .split(/[?#]/)[0]
    .replace(/^\//, "");
}

function assertLocalReferencesFromHtml() {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = new Set();
  const attributePattern = /\b(?:src|href)=["']([^"']+)["']/gi;
  let match;

  while ((match = attributePattern.exec(html))) {
    const local = normalizeLocalReference(match[1]);
    if (local) refs.add(local);
  }

  for (const ref of refs) {
    if (!exists(ref)) failures.push(`index.html referencia un archivo inexistente: ${ref}`);
  }
}

function assertServiceWorkerCore() {
  const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  const coreMatch = sw.match(/const\s+CORE\s*=\s*\[([\s\S]*?)\];/);
  if (!coreMatch) {
    failures.push("No se pudo localizar CORE en service-worker.js");
    return;
  }

  const stringPattern = /["']([^"']+)["']/g;
  let match;
  while ((match = stringPattern.exec(coreMatch[1]))) {
    const local = normalizeLocalReference(match[1]);
    if (!local || local === "") continue;
    if (!exists(local)) failures.push(`Service Worker precachea un archivo inexistente: ${local}`);
  }
}

function assertNoSensitiveReleaseArtifacts() {
  const forbidden = [
    "iris-dev-backup.sql",
    "iris-dev-full-backup.sql",
    ".env"
  ];

  for (const file of forbidden) {
    if (exists(file)) failures.push(`Artefacto sensible presente en release: ${file}`);
  }
}

function assertServerPublicGuard() {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  if (!server.includes("function isBlockedPublicPath")) {
    failures.push("Falta el guard de rutas públicas en server.js");
  }
  if (!server.includes("express.static")) {
    failures.push("No se encontró configuración de archivos estáticos");
  }
}

assertLocalReferencesFromHtml();
assertServiceWorkerCore();
assertNoSensitiveReleaseArtifacts();
assertServerPublicGuard();

if (failures.length) {
  console.error("\nRELEASE STATIC AUDIT: FAILED\n");
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log("RELEASE STATIC AUDIT: OK");
