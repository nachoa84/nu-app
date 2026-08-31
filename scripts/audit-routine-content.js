const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

function evaluate(source, exportExpression) {
  const context = vm.createContext({ console });
  vm.runInContext(`${source}\n;globalThis.__auditExport = ${exportExpression};`, context, {
    timeout: 2000
  });
  return context.__auditExport;
}

function loadCollagenDays() {
  const context = vm.createContext({ console });
  vm.runInContext(read("routine-content.js"), context, { timeout: 2000 });
  vm.runInContext(read("routine-content-collagen-8-30.js"), context, { timeout: 2000 });
  vm.runInContext("globalThis.__auditDays = days;", context, { timeout: 2000 });
  return context.__auditDays;
}

function loadProductDays() {
  return evaluate(
    read("routine-products-v92.js"),
    "({ catalog: ROUTINE_CATALOG, days: PRODUCT_ROUTINE_DAYS })"
  );
}

function textBlocks(days) {
  const rows = [];
  Object.entries(days || {}).forEach(([day, value]) => {
    (value?.blocks || []).forEach((block, blockIndex) => {
      if (block?.type !== "text") return;
      rows.push({ day: Number(day), blockIndex, block });
    });
  });
  return rows;
}

function countMatches(text, regex) {
  return (String(text || "").match(regex) || []).length;
}

function looksLikeAllCapsLine(line) {
  const letters = String(line || "").replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  return letters.length >= 6 && letters === letters.toUpperCase();
}

function explicitQa(text) {
  return /\bq\s*&\s*a\b|preguntas?\s+frecuentes|preguntas?\s+y\s+respuestas?|pregunta\s*[:\-]|respuesta\s*[:\-]/i.test(text);
}

function structuralQa(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
  let pairs = 0;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (/\?$/.test(lines[i]) && !/\?$/.test(lines[i + 1]) && lines[i + 1].length >= 18) {
      pairs += 1;
      i += 1;
    }
  }
  return pairs >= 2;
}

const typoPatterns = [
  ["personailzada", /\bpersonailzada\b/i],
  ["testimonos", /\btestimonos\b/i],
  ["Instragram", /\binstragram\b/i],
  ["Whatapp", /\bwhatapp\b/i],
  ["A demás", /\ba\s+demás\b/i],
  ["practicas", /\bpracticas\b/i],
  ["a traves", /\ba\s+traves\b/i],
  ["con las cambios", /\bcon\s+las\s+cambios\b/i]
];

function auditBlock(routine, row) {
  const text = String(row.block?.content || "");
  const lines = text.split(/\n/);
  const links = Array.isArray(row.block?.links) ? row.block.links : [];
  const issues = [];

  const rawUrls = countMatches(text, /https?:\/\/\S+/g);
  const inlineLinks = countMatches(text, /\[[^\]]+\]\s*https?:\/\/\S+/g);
  const hashtags = countMatches(text, /(^|\s)#[\wÁÉÍÓÚÜÑáéíóúüñ+]+/g);
  const allCapsLines = lines.filter(looksLikeAllCapsLine).length;
  const blankRuns = countMatches(text, /\n\s*\n\s*\n/g);
  const questionMarks = countMatches(text, /\?/g);

  if (rawUrls) issues.push(`raw_urls:${rawUrls}`);
  if (inlineLinks) issues.push(`inline_links:${inlineLinks}`);
  if (links.length) issues.push(`link_buttons:${links.length}`);
  if (hashtags) issues.push(`hashtags:${hashtags}`);
  if (allCapsLines) issues.push(`all_caps_lines:${allCapsLines}`);
  if (blankRuns) issues.push(`excess_blank_runs:${blankRuns}`);
  if (text.length > 700) issues.push(`very_long:${text.length}`);
  else if (text.length > 420) issues.push(`long:${text.length}`);

  const isQa = explicitQa(text) || structuralQa(text);
  if (isQa) issues.push("qa_candidate");
  else if (questionMarks >= 3) issues.push(`multi_question_normal:${questionMarks}`);

  typoPatterns.forEach(([name, regex]) => {
    if (regex.test(text)) issues.push(`typo:${name}`);
  });

  return {
    routine,
    day: row.day,
    block: row.blockIndex + 1,
    chars: text.length,
    issues
  };
}

function productRoutineDays(product, routineId) {
  const entry = product.days?.[routineId];
  return entry?.days || entry || {};
}

function main() {
  const collagen = loadCollagenDays();
  const product = loadProductDays();
  const routines = [
    ["Collagen+", collagen],
    ["WellSpa", productRoutineDays(product, "wellspa-10")],
    ["Galvanic Spa", productRoutineDays(product, "galvanicspa-10")],
    ["LumiSpa", productRoutineDays(product, "lumispa-10")]
  ];

  const rows = routines.flatMap(([name, days]) =>
    textBlocks(days).map(row => auditBlock(name, row))
  );

  const flagged = rows.filter(row => row.issues.length);
  const qa = flagged.filter(row => row.issues.includes("qa_candidate"));
  const links = flagged.filter(row => row.issues.some(issue => /^(?:raw_urls|inline_links|link_buttons):/.test(issue)));
  const textDefects = flagged.filter(row => row.issues.some(issue => /^(?:all_caps_lines|excess_blank_runs|typo|hashtags):?/.test(issue)));
  const density = flagged.filter(row => row.issues.some(issue => /^(?:long|very_long):/.test(issue)));

  const dayCount = routines.reduce((sum, [, days]) => sum + Object.keys(days || {}).length, 0);

  console.log(`Rutinas auditadas: ${routines.length}`);
  console.log(`Días encontrados: ${dayCount} / 60`);
  console.log(`Bloques de texto auditados: ${rows.length}`);
  console.log(`Bloques con observaciones: ${flagged.length}`);
  console.log(`Q&A candidatos: ${qa.length}`);
  console.log(`Bloques con links: ${links.length}`);
  console.log(`Bloques con defectos de texto/formato: ${textDefects.length}`);
  console.log(`Bloques largos: ${density.length}`);

  if (dayCount !== 60) {
    process.exitCode = 2;
    console.error(`ADVERTENCIA: se esperaban 60 días y se encontraron ${dayCount}.`);
  }

  const print = (title, list) => {
    console.log(`\n=== ${title} ===`);
    list.forEach(row => {
      console.log(`${row.routine} · Día ${row.day} · bloque ${row.block}: ${row.issues.join(", ")}`);
    });
  };

  print("Q&A", qa);
  print("LINKS", links);
  print("TEXTO / FORMATO", textDefects);
  print("DENSIDAD", density);

  if (process.argv.includes("--json")) {
    console.log("\n=== JSON ===");
    console.log(JSON.stringify({ dayCount, rows, flagged, qa, links, textDefects, density }, null, 2));
  }
}

main();
