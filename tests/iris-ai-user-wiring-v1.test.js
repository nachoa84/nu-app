"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function read(name) {
  return fs.readFileSync(path.join(__dirname, "..", name), "utf8");
}

test("server mantiene gate Iris AI antes del Origin check", () => {
  const server = read("server.js");
  assert.match(server, /createIrisAiUserRouteV1/);
  assert.match(server, /IRIS_AI_USER_ROUTE_ENABLED/);
  assert.match(server, /app\.use\(\s*["']\/api\/iris-ai["']/);
  assert.match(server, /app\.post\(\s*["']\/api\/iris-ai\/question["']/);

  const gateIndex = server.indexOf('"/api/iris-ai"');
  const originIndex = server.indexOf('"/api",\n  assertAllowedWriteOrigin');
  assert.ok(gateIndex >= 0);
  assert.ok(originIndex >= 0);
  assert.ok(gateIndex < originIndex);
});

test("bot conserva determinista primero y escala solo después de miss", () => {
  const bot = read("bot.js");
  const deterministicIndex = bot.indexOf("const response = resolveBotAnswer(question);");
  const adapterIndex = bot.indexOf("IrisAiClientEscalationV1");
  const escalationIndex = bot.indexOf("tryIrisAiBotEscalationV1");

  assert.ok(deterministicIndex >= 0);
  assert.ok(adapterIndex > deterministicIndex);
  assert.ok(escalationIndex > deterministicIndex);
  assert.match(bot, /isDeterministicMissV1\(response\)/);
});

test("index carga adaptador Iris antes del bot determinista", () => {
  const html = read("index.html");
  const adapterIndex = html.indexOf("iris-ai-client-escalation-v1.js");
  const botIndex = html.indexOf("bot.js?v=");
  assert.ok(adapterIndex >= 0);
  assert.ok(botIndex >= 0);
  assert.ok(adapterIndex < botIndex);
});

test("cliente no activa la escalación por defecto", () => {
  const html = read("index.html");
  const bot = read("bot.js");
  assert.equal(/NU_IRIS_AI_ESCALATION_ENABLED\s*=\s*true/.test(html), false);
  assert.equal(/NU_IRIS_AI_ESCALATION_ENABLED\s*=\s*true/.test(bot), false);
});
