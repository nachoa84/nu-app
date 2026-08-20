"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createIrisAiUserRouteV1,
  hashScopeV1,
  normalizeRequestV1,
  sanitizeResultV1
} = require("../iris-ai-user-route-v1");

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

test("ruta apagada responde 404 sin tocar orchestrator", async () => {
  let calls = 0;
  const route = createIrisAiUserRouteV1({
    env: { IRIS_AI_USER_ROUTE_ENABLED: "false" },
    runtime: {
      status: { enabled: true },
      orchestrator: {
        async answerQuestion() {
          calls += 1;
        }
      }
    }
  });
  const res = responseRecorder();
  await route({ body: {}, ip: "127.0.0.1" }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(calls, 0);
});

test("ruta abierta sigue fail-closed si runtime está apagado", async () => {
  const route = createIrisAiUserRouteV1({
    env: { IRIS_AI_USER_ROUTE_ENABLED: "true" },
    runtime: { status: { enabled: false }, orchestrator: null }
  });
  const res = responseRecorder();
  await route({ body: {}, ip: "127.0.0.1" }, res);
  assert.equal(res.statusCode, 503);
});

test("normaliza solo contrato mínimo y rechaza campos extra", () => {
  assert.deepEqual(
    normalizeRequestV1({
      question: "  collagen plus  ",
      userId: "usr_123",
      country: "us",
      language: "es"
    }),
    {
      question: "collagen plus",
      userId: "usr_123",
      country: "US",
      language: "es"
    }
  );

  assert.throws(
    () => normalizeRequestV1({
      question: "collagen plus",
      userId: "usr_123",
      country: "US",
      secret: "no"
    }),
    /campos no permitidos/
  );
});

test("hashScope no conserva userId ni IP en claro", () => {
  const user = hashScopeV1("iris_user", "usr_example_123");
  const device = hashScopeV1("iris_device", "203.0.113.9");
  assert.match(user, /^iris_user:[0-9a-f]{32}$/);
  assert.match(device, /^iris_device:[0-9a-f]{32}$/);
  assert.equal(user.includes("usr_example_123"), false);
  assert.equal(device.includes("203.0.113.9"), false);
});

test("ruta pasa solo entrada mínima con scopes hash al orchestrator", async () => {
  let received = null;
  const route = createIrisAiUserRouteV1({
    env: { IRIS_AI_USER_ROUTE_ENABLED: "true" },
    runtime: {
      status: { enabled: true },
      orchestrator: {
        async answerQuestion(input) {
          received = input;
          return {
            status: "ok",
            classification: "direct_retrieval",
            answer: "Respuesta autorizada",
            citations: [{
              documentKey: "doc_1",
              versionLabel: "v1",
              chunkIndex: 0
            }]
          };
        }
      }
    }
  });
  const res = responseRecorder();
  await route({
    ip: "203.0.113.9",
    body: {
      question: "collagen plus",
      userId: "usr_123",
      country: "US",
      language: "es"
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(received.question, "collagen plus");
  assert.equal(received.country, "US");
  assert.equal(received.language, "es");
  assert.match(received.userScope, /^iris_user:[0-9a-f]{32}$/);
  assert.match(received.deviceScope, /^iris_device:[0-9a-f]{32}$/);
  assert.equal(Object.hasOwn(received, "userId"), false);
  assert.equal(Object.hasOwn(received, "ip"), false);
  assert.ok(received.now instanceof Date);
});

test("fallback del runtime se mantiene fallback y no fabrica respuesta", async () => {
  const route = createIrisAiUserRouteV1({
    env: { IRIS_AI_USER_ROUTE_ENABLED: "true" },
    runtime: {
      status: { enabled: true },
      orchestrator: {
        async answerQuestion() {
          return { status: "fallback", reason: "no_authorized_context" };
        }
      }
    }
  });
  const res = responseRecorder();
  await route({
    ip: "127.0.0.1",
    body: {
      question: "consulta sin respuesta",
      userId: "usr_123",
      country: "AR"
    }
  }, res);
  assert.deepEqual(res.payload, {
    ok: false,
    status: "fallback",
    reason: "no_authorized_context"
  });
});

test("errores internos se sanitizan", async () => {
  const logs = [];
  const route = createIrisAiUserRouteV1({
    env: { IRIS_AI_USER_ROUTE_ENABLED: "true" },
    logError: entry => logs.push(entry),
    runtime: {
      status: { enabled: true },
      orchestrator: {
        async answerQuestion() {
          throw new Error("DATABASE_URL=private-value");
        }
      }
    }
  });
  const res = responseRecorder();
  await route({
    ip: "127.0.0.1",
    body: {
      question: "consulta válida",
      userId: "usr_123",
      country: "AR"
    }
  }, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.payload, {
    ok: false,
    error: "Iris no disponible."
  });
  assert.deepEqual(logs, [{
    operation: "iris_ai_user_route_v1",
    errorName: "Error"
  }]);
});

test("sanitizeResult expone solo respuesta y citas permitidas", () => {
  assert.deepEqual(
    sanitizeResultV1({
      status: "ok",
      classification: "direct_retrieval",
      answer: " texto ",
      citations: [{
        documentKey: "doc_1",
        versionLabel: "v1",
        chunkIndex: 2,
        internalId: 999
      }],
      usage: { inputTokens: 100 },
      providerPayload: "private"
    }),
    {
      ok: true,
      status: "ok",
      classification: "direct_retrieval",
      answer: "texto",
      citations: [{
        documentKey: "doc_1",
        versionLabel: "v1",
        chunkIndex: 2
      }]
    }
  );
});
