"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GROQ_CHAT_COMPLETIONS_URL_V1,
  IrisAiGroqProviderErrorV1,
  buildGroqRequestBodyV1,
  createGroqIrisAiProviderV1,
  parseGroqCompletionV1,
  sanitizeProviderFragmentsV1
} = require("../iris-ai-groq-provider-v1");

function fragments() {
  return [{
    ref: "frag_1",
    title: "Collagen Plus",
    versionLabel: "v1",
    content: "Contenido autorizado."
  }];
}

function okPayload(overrides = {}) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          answer: "Respuesta autorizada.",
          citations: [{ ref: "frag_1" }]
        })
      }
    }],
    usage: {
      prompt_tokens: 120,
      completion_tokens: 30,
      total_tokens: 150
    },
    ...overrides
  };
}

test("Groq adapter requires explicit key, model and fetch implementation", () => {
  assert.throws(
    () => createGroqIrisAiProviderV1({ model: "openai/gpt-oss-20b", fetchImpl: async () => null }),
    IrisAiGroqProviderErrorV1
  );
  assert.throws(
    () => createGroqIrisAiProviderV1({ apiKey: "test-key-not-secret", fetchImpl: async () => null }),
    IrisAiGroqProviderErrorV1
  );
  assert.throws(
    () => createGroqIrisAiProviderV1({ apiKey: "test-key-not-secret", model: "openai/gpt-oss-20b", fetchImpl: null }),
    IrisAiGroqProviderErrorV1
  );
});

test("request body uses configured model and strict structured output", () => {
  const body = buildGroqRequestBodyV1({
    question: "¿Qué dice la fuente?",
    fragments: fragments(),
    model: "openai/gpt-oss-20b",
    maxOutputTokens: 400
  });

  assert.equal(body.model, "openai/gpt-oss-20b");
  assert.equal(body.stream, false);
  assert.equal(body.citation_options, "disabled");
  assert.equal(body.max_completion_tokens, 400);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  const serialized = JSON.stringify(body);
  assert.ok(serialized.includes("frag_1"));
  assert.ok(!serialized.includes("documentKey"));
  assert.ok(!serialized.includes("objectKey"));
  assert.ok(!serialized.includes("contentSha256"));
});

test("adapter rejects internal metadata before any HTTP call", async () => {
  let fetchCalls = 0;
  const provider = createGroqIrisAiProviderV1({
    apiKey: "test-key-not-secret",
    model: "openai/gpt-oss-20b",
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("should not run");
    }
  });

  await assert.rejects(
    provider.generate({
      question: "colágeno",
      fragments: [{ ...fragments()[0], documentKey: "doc_internal" }]
    }),
    error => error instanceof IrisAiGroqProviderErrorV1 && error.code === "IRIS_GROQ_INPUT"
  );
  assert.equal(fetchCalls, 0);
});

test("adapter sends only official endpoint payload and parses answer citations and usage", async () => {
  let request;
  const signal = new AbortController().signal;
  const provider = createGroqIrisAiProviderV1({
    apiKey: "test-key-not-secret",
    model: "openai/gpt-oss-20b",
    maxOutputTokens: 500,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() { return okPayload(); }
      };
    }
  });

  const result = await provider.generate({
    question: "¿Qué dice la fuente?",
    fragments: fragments(),
    signal
  });

  assert.equal(request.url, GROQ_CHAT_COMPLETIONS_URL_V1);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.signal, signal);
  assert.equal(request.options.headers.Authorization, "Bearer test-key-not-secret");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "openai/gpt-oss-20b");
  assert.deepEqual(result, {
    status: "ok",
    answer: "Respuesta autorizada.",
    citations: [{ ref: "frag_1" }],
    usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 }
  });
});

test("429 is surfaced with stable code without exposing provider body", async () => {
  const provider = createGroqIrisAiProviderV1({
    apiKey: "test-key-not-secret",
    model: "openai/gpt-oss-20b",
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      async json() { return { error: "provider-secret-detail" }; }
    })
  });

  await assert.rejects(
    provider.generate({ question: "colágeno", fragments: fragments() }),
    error => {
      assert.equal(error.status, 429);
      assert.equal(error.code, 429);
      assert.ok(!String(error.message).includes("provider-secret-detail"));
      return true;
    }
  );
});

test("non-429 HTTP and network errors are sanitized", async () => {
  const httpProvider = createGroqIrisAiProviderV1({
    apiKey: "test-key-not-secret",
    model: "openai/gpt-oss-20b",
    fetchImpl: async () => ({ ok: false, status: 500 })
  });
  await assert.rejects(
    httpProvider.generate({ question: "colágeno", fragments: fragments() }),
    error => error.code === "IRIS_GROQ_HTTP" && !String(error.message).includes("500 body")
  );

  const networkProvider = createGroqIrisAiProviderV1({
    apiKey: "test-key-not-secret",
    model: "openai/gpt-oss-20b",
    fetchImpl: async () => { throw new Error("dns secret detail"); }
  });
  await assert.rejects(
    networkProvider.generate({ question: "colágeno", fragments: fragments() }),
    error => error.code === "IRIS_GROQ_NETWORK" && !String(error.message).includes("dns secret detail")
  );
});

test("AbortError is preserved for orchestrator timeout handling", async () => {
  const provider = createGroqIrisAiProviderV1({
    apiKey: "test-key-not-secret",
    model: "openai/gpt-oss-20b",
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
  });

  await assert.rejects(
    provider.generate({ question: "colágeno", fragments: fragments() }),
    error => error.name === "AbortError"
  );
});

test("structured response rejects extra fields duplicate refs and invalid JSON", () => {
  assert.throws(
    () => parseGroqCompletionV1({
      choices: [{ message: { content: JSON.stringify({ answer: "x", citations: [{ ref: "frag_1" }], extra: true }) } }]
    }),
    IrisAiGroqProviderErrorV1
  );

  assert.throws(
    () => parseGroqCompletionV1({
      choices: [{ message: { content: JSON.stringify({ answer: "x", citations: [{ ref: "frag_1" }, { ref: "frag_1" }] }) } }]
    }),
    IrisAiGroqProviderErrorV1
  );

  assert.throws(
    () => parseGroqCompletionV1({ choices: [{ message: { content: "not-json" } }] }),
    IrisAiGroqProviderErrorV1
  );
});

test("fragment sanitizer enforces count, unique refs and bounded context", () => {
  assert.throws(() => sanitizeProviderFragmentsV1([]), IrisAiGroqProviderErrorV1);
  assert.throws(
    () => sanitizeProviderFragmentsV1([fragments()[0], fragments()[0]]),
    IrisAiGroqProviderErrorV1
  );
  assert.throws(
    () => sanitizeProviderFragmentsV1([{ ...fragments()[0], content: "x".repeat(2001) }]),
    IrisAiGroqProviderErrorV1
  );
});
