"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const imagePath = path.join(root, "assets/iris/tramites/cambio-miembro-afiliado-marca.jpg");

function loadIris() {
  const noop = () => {};
  const context = vm.createContext({
    window: { addEventListener: noop },
    document: {
      querySelector: () => null,
      getElementById: () => null,
      documentElement: { style: { setProperty: noop } },
      body: { classList: { toggle: noop } }
    },
    localStorage: { getItem: () => null, setItem: noop },
    getRoutineProfile: () => ({}),
    setTimeout,
    clearTimeout,
    console
  });

  for (const file of ["bot-content.js", "bot.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, {
      filename: file
    });
  }

  return context;
}

test("la guía es la imagen JPEG original y se ofrece para descargar", () => {
  const iris = loadIris();
  const topic = iris.window.BotContent.find(item => item.id === "cambio-miembro-afiliado");
  assert.ok(topic);
  const guide = topic.blocks.find(block => block.type === "download-image");
  assert.ok(guide);
  assert.equal(guide.src, "/assets/iris/tramites/cambio-miembro-afiliado-marca.jpg");
  assert.equal(guide.filename, "guia-cambio-miembro-afiliado-de-marca.jpg");
  const image = fs.readFileSync(imagePath);
  assert.equal(image.subarray(0, 3).toString("hex"), "ffd8ff");
  assert.ok(image.length > 100_000);
});

test("las formas habituales de preguntar encuentran la guía correcta", () => {
  const iris = loadIris();
  const queries = [
    "cambio miembro afiliado",
    "miembro a afiliado",
    "pasar de miembro a afiliado de marca",
    "¿Cómo cambiar de miembro a afiliado de marca?",
    "QUIERO CONVERTIRME EN AFILIADO DE MARCA",
    "como me convierto en afiliado de marca",
    "cómo me hago afiliada de marca",
    "soy miembro y quiero ser afiliada de marca",
    "quiero convertirme en afiliada de marca",
    "pasar de cliente preferente a afiliado",
    "cómo cambio mi tipo de cuenta",
    "conviértete en afiliado de marca",
    "descargar guía cambio afiliado",
    "¿Cómo puedo pasar de cliente preferente a afiliado de marca?"
  ];

  for (const query of queries) {
    assert.equal(iris.resolveBotAnswer(query).topicId, "cambio-miembro-afiliado", query);
  }
});

test("los comandos cercanos conservan su respuesta original", () => {
  const iris = loadIris();
  const expected = new Map([
    ["crear nuevo id", "crear-nuevo-id"],
    ["carta loi", "loi"],
    ["cancelar pedidos", "cancelacion-pedidos"],
    ["tramites argentina", "tramites-argentina"]
  ]);

  for (const [query, topicId] of expected) {
    assert.equal(iris.resolveBotAnswer(query).topicId, topicId, query);
  }
});

test("la nueva guía no duplica comandos exactos de otros temas", () => {
  const iris = loadIris();
  const target = iris.window.BotContent.find(item => item.id === "cambio-miembro-afiliado");
  const terms = [target.command, ...target.aliases, ...target.phrases]
    .map(iris.normalizeBotText);
  assert.equal(terms.length, new Set(terms).size);

  for (const other of iris.window.BotContent.filter(item => item.id !== target.id)) {
    const otherTerms = [other.command, ...(other.commands || []), ...(other.aliases || []), ...(other.phrases || [])]
      .map(iris.normalizeBotText);
    assert.ok(!otherTerms.some(term => terms.includes(term)), other.id);
  }
});
