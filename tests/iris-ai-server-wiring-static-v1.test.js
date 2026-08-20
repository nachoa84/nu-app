"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serverPath = path.join(__dirname, "..", "server.js");

function serverSource() {
  return fs.readFileSync(serverPath, "utf8");
}

test("server wiring de Iris AI se limita a importar e inicializar runtime", () => {
  const source = serverSource();

  assert.match(
    source,
    /require\(["']\.\/iris-ai-server-runtime-v1["']\)/
  );
  assert.match(
    source,
    /initializeIrisAiServerRuntimeV1\s*\(\s*\{[\s\S]*?pool[\s\S]*?env:\s*process\.env[\s\S]*?secrets:\s*process\.env[\s\S]*?\}\s*\)/
  );
});

test("este wiring no agrega endpoint Iris ni ejecuta preguntas", () => {
  const source = serverSource();

  assert.doesNotMatch(source, /["']\/api\/iris(?:[\/"'])/);
  assert.doesNotMatch(source, /\.answerQuestion\s*\(/);
});

test("server no duplica secretos ni barreras del provider", () => {
  const source = serverSource();

  assert.doesNotMatch(source, /GROQ_API_KEY/);
  assert.doesNotMatch(source, /IRIS_AI_PROVIDER_EMERGENCY_STOP/);
});

test("server no ejecuta migraciones Iris AI automáticamente", () => {
  const source = serverSource();

  assert.doesNotMatch(
    source,
    /migration-iris-ai-persistence-v1\.sql/
  );
});
