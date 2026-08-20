"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  countryCodeV1,
  isClientEnabledV1,
  isDeterministicMissV1,
  toBotResponseV1,
  tryIrisAiBotEscalationV1
} = require("../iris-ai-client-escalation-v1");

function deterministicMiss() {
  return {
    topicId: null,
    topicTitle: "",
    blocks: [{
      type: "text",
      content: "No encontré todavía contenido cargado que coincida con esa búsqueda. Probá con otras palabras o buscá otro recurso."
    }]
  };
}

test("cliente queda apagado salvo true booleano explícito", () => {
  assert.equal(isClientEnabledV1({}), false);
  assert.equal(isClientEnabledV1({ NU_IRIS_AI_ESCALATION_ENABLED: "true" }), false);
  assert.equal(isClientEnabledV1({ NU_IRIS_AI_ESCALATION_ENABLED: true }), true);
});

test("solo escala el fallback determinista exacto de no encontrado", () => {
  assert.equal(isDeterministicMissV1(deterministicMiss()), true);
  assert.equal(isDeterministicMissV1({
    topicId: "topic_1",
    blocks: [{ type: "text", content: "respuesta local" }]
  }), false);
  assert.equal(isDeterministicMissV1({
    topicId: null,
    blocks: [{ type: "text", content: "otro mensaje" }]
  }), false);
});

test("normaliza países existentes a códigos ISO", () => {
  assert.equal(countryCodeV1("Argentina"), "AR");
  assert.equal(countryCodeV1("México"), "MX");
  assert.equal(countryCodeV1("Estados Unidos"), "US");
  assert.equal(countryCodeV1("US"), "US");
  assert.equal(countryCodeV1("mercado desconocido"), null);
});

test("bandera apagada nunca hace fetch", async () => {
  let calls = 0;
  const result = await tryIrisAiBotEscalationV1({
    question: "consulta",
    deterministicResponse: deterministicMiss(),
    profile: { userId: "usr_1", country: "Argentina" },
    globalObject: { NU_IRIS_AI_ESCALATION_ENABLED: false },
    fetchImpl: async () => {
      calls += 1;
    }
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("respuesta local existente nunca hace fetch aunque bandera esté abierta", async () => {
  let calls = 0;
  const result = await tryIrisAiBotEscalationV1({
    question: "consulta",
    deterministicResponse: {
      topicId: "topic_1",
      blocks: [{ type: "text", content: "local" }]
    },
    profile: { userId: "usr_1", country: "Argentina" },
    globalObject: { NU_IRIS_AI_ESCALATION_ENABLED: true },
    fetchImpl: async () => {
      calls += 1;
    }
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("escalación válida envía solo contrato mínimo", async () => {
  let request = null;
  const result = await tryIrisAiBotEscalationV1({
    question: "  consulta autorizada  ",
    deterministicResponse: deterministicMiss(),
    profile: { userId: "usr_1", country: "Argentina", name: "No enviar" },
    globalObject: { NU_IRIS_AI_ESCALATION_ENABLED: true },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            status: "ok",
            classification: "direct_retrieval",
            answer: "Respuesta autorizada",
            citations: []
          };
        }
      };
    }
  });

  assert.equal(request.url, "/api/iris-ai/question");
  assert.deepEqual(JSON.parse(request.options.body), {
    question: "consulta autorizada",
    userId: "usr_1",
    country: "AR",
    language: "es"
  });
  assert.deepEqual(result, {
    topicId: null,
    topicTitle: "",
    blocks: [{ type: "text", content: "Respuesta autorizada" }]
  });
});

test("fallback o error de red conserva fallback determinista", async () => {
  const common = {
    question: "consulta",
    deterministicResponse: deterministicMiss(),
    profile: { userId: "usr_1", country: "Argentina" },
    globalObject: { NU_IRIS_AI_ESCALATION_ENABLED: true }
  };

  const fallback = await tryIrisAiBotEscalationV1({
    ...common,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { ok: false, status: "fallback", reason: "no_authorized_context" };
      }
    })
  });
  assert.equal(fallback, null);

  const failed = await tryIrisAiBotEscalationV1({
    ...common,
    fetchImpl: async () => {
      throw new Error("network private detail");
    }
  });
  assert.equal(failed, null);
});

test("toBotResponse no expone metadata interna", () => {
  assert.deepEqual(
    toBotResponseV1({
      ok: true,
      status: "ok",
      classification: "direct_retrieval",
      answer: " texto ",
      citations: [{ documentKey: "doc_1" }],
      provider: "groq",
      usage: { total: 1 }
    }),
    {
      topicId: null,
      topicTitle: "",
      blocks: [{ type: "text", content: "texto" }]
    }
  );
});
