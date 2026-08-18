"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  TRANSITION_CONFIRMATION_V1,
  IrisDocumentReviewCliErrorV1,
  assertDevelopmentTransitionV1,
  parseReviewArgumentsV1,
  runIrisDocumentReviewCliV1
} = require("../iris-document-review-cli-v1");

function argsV1(extra = []) {
  return [
    "--document-key",
    "doc_document-id",
    "--operation",
    "review",
    ...extra
  ];
}

function envV1(overrides = {}) {
  return {
    IRIS_REVIEW_ENABLED: "true",
    IRIS_REVIEW_ENVIRONMENT: "development",
    IRIS_REVIEW_ACTOR_KEY_ID: "nuapp-iris-admin-v1",
    NODE_ENV: "development",
    ...overrides
  };
}

function runtimeV1(overrides = {}) {
  let closed = false;
  let readCalls = 0;
  let transitionCalls = 0;
  const runtime = {
    async readDocumentState() {
      readCalls += 1;
      return {
        authorizationStatus: "pending",
        isActive: false,
        retired: false
      };
    },
    async transitionDocument() {
      transitionCalls += 1;
      return {
        authorizationStatus: "approved",
        isActive: false,
        retired: false
      };
    },
    async close() {
      closed = true;
    },
    ...overrides
  };
  return {
    runtime,
    state: {
      get closed() { return closed; },
      get readCalls() { return readCalls; },
      get transitionCalls() { return transitionCalls; }
    }
  };
}

test("interpreta dry-run como modo predeterminado", () => {
  assert.deepEqual(parseReviewArgumentsV1(argsV1()), {
    documentKey: "doc_document-id",
    operation: "review",
    commit: false,
    confirmation: null
  });
});

test("rechaza argumentos ambiguos, inseguros o desconocidos", () => {
  for (const argv of [
    [],
    ["--document-key", "doc_x"],
    argsV1(["--otro"]),
    argsV1(["--document-key", "doc_y"]),
    argsV1(["--operation", "delete"]),
    ["--document-key", "../escape", "--operation", "review"],
    argsV1([`--confirm=${TRANSITION_CONFIRMATION_V1}`])
  ]) {
    assert.throws(
      () => parseReviewArgumentsV1(argv),
      IrisDocumentReviewCliErrorV1
    );
  }
});

test("bloquea commit salvo en desarrollo confirmado", () => {
  const options = parseReviewArgumentsV1(argsV1([
    "--commit",
    `--confirm=${TRANSITION_CONFIRMATION_V1}`
  ]));
  assert.doesNotThrow(() =>
    assertDevelopmentTransitionV1(options, envV1())
  );

  for (const env of [
    {},
    envV1({ IRIS_REVIEW_ENABLED: "false" }),
    envV1({ IRIS_REVIEW_ENVIRONMENT: "production" }),
    envV1({ IRIS_REVIEW_ACTOR_KEY_ID: "" }),
    envV1({ NODE_ENV: "production" }),
    envV1({ REPLIT_DEPLOYMENT: "1" })
  ]) {
    assert.throws(
      () => assertDevelopmentTransitionV1(options, env),
      IrisDocumentReviewCliErrorV1
    );
  }
});

test("dry-run consulta estado sin ejecutar transición", async () => {
  const h = runtimeV1();
  const outputs = [];
  const summary = await runIrisDocumentReviewCliV1({
    argv: argsV1(),
    env: { NODE_ENV: "production", REPLIT_DEPLOYMENT: "1" },
    createRuntime: async () => h.runtime,
    writeOutput: value => outputs.push(value)
  });

  assert.deepEqual(summary, {
    mode: "dry-run",
    operation: "review",
    authorizationStatus: "pending",
    isActive: false,
    retired: false,
    persisted: false
  });
  assert.equal(h.state.readCalls, 1);
  assert.equal(h.state.transitionCalls, 0);
  assert.equal(h.state.closed, true);
  assert.equal(outputs.length, 1);
  assert.ok(!outputs[0].includes("doc_document-id"));
});

test("commit autorizado usa actor efímero y salida mínima", async () => {
  let request;
  const h = runtimeV1({
    async transitionDocument(value) {
      request = value;
      return {
        authorizationStatus: "approved",
        isActive: false,
        retired: false
      };
    }
  });
  const outputs = [];
  const summary = await runIrisDocumentReviewCliV1({
    argv: argsV1([
      "--commit",
      `--confirm=${TRANSITION_CONFIRMATION_V1}`
    ]),
    env: envV1(),
    createRuntime: async () => h.runtime,
    writeOutput: value => outputs.push(value)
  });

  assert.equal(summary.persisted, true);
  assert.deepEqual(request, {
    documentKey: "doc_document-id",
    operation: "review",
    actorKeyId: "nuapp-iris-admin-v1"
  });
  assert.ok(!outputs[0].includes("doc_document-id"));
  assert.ok(!outputs[0].includes("nuapp-iris-admin-v1"));
});

test("cierra runtime ante documento ausente o fallo operativo", async () => {
  for (const method of [
    async () => null,
    async () => { throw new Error("detalle privado"); }
  ]) {
    const h = runtimeV1({ readDocumentState: method });
    await assert.rejects(
      runIrisDocumentReviewCliV1({
        argv: argsV1(),
        createRuntime: async () => h.runtime
      })
    );
    assert.equal(h.state.closed, true);
  }
});

test("no crea runtime cuando la autorización de commit falla", async () => {
  let created = false;
  await assert.rejects(
    runIrisDocumentReviewCliV1({
      argv: argsV1([
        "--commit",
        `--confirm=${TRANSITION_CONFIRMATION_V1}`
      ]),
      env: {},
      createRuntime: async () => {
        created = true;
      }
    }),
    IrisDocumentReviewCliErrorV1
  );
  assert.equal(created, false);
});
