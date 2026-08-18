"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  COMMIT_CONFIRMATION_V1,
  IrisImportCliErrorV1,
  assertDevelopmentCommitV1,
  parseIrisImportArgumentsV1,
  parseMetadataJsonV1,
  runIrisDocumentImportCliV1
} = require("../iris-document-import-cli-v1");

function commitEnvironmentV1(overrides = {}) {
  return {
    IRIS_IMPORT_ENABLED: "true",
    IRIS_IMPORT_ENVIRONMENT: "development",
    IRIS_IMPORT_ACTOR_KEY_ID: "nuapp-iris-admin-v1",
    NODE_ENV: "development",
    ...overrides
  };
}

function commitArgumentsV1() {
  return [
    "--pdf",
    "/tmp/document.pdf",
    "--metadata",
    "/tmp/document.json",
    "--commit",
    `--confirm=${COMMIT_CONFIRMATION_V1}`
  ];
}

test("interpreta dry-run como modo predeterminado", () => {
  assert.deepEqual(
    parseIrisImportArgumentsV1([
      "--pdf",
      "/tmp/document.pdf",
      "--metadata",
      "/tmp/document.json"
    ]),
    {
      pdfPath: "/tmp/document.pdf",
      metadataPath: "/tmp/document.json",
      commit: false,
      confirmation: null
    }
  );
});

test("rechaza argumentos ambiguos o no permitidos", () => {
  for (const argv of [
    [],
    ["--pdf", "a.pdf"],
    ["--pdf", "a.txt", "--metadata", "a.json"],
    ["--pdf", "a.pdf", "--metadata", "a.txt"],
    ["--pdf", "a.pdf", "--pdf", "b.pdf", "--metadata", "a.json"],
    ["--pdf", "a.pdf", "--metadata", "a.json", "--otro"],
    [
      "--pdf",
      "a.pdf",
      "--metadata",
      "a.json",
      `--confirm=${COMMIT_CONFIRMATION_V1}`
    ]
  ]) {
    assert.throws(
      () => parseIrisImportArgumentsV1(argv),
      IrisImportCliErrorV1
    );
  }
});

test("bloquea persistencia salvo en desarrollo confirmado", () => {
  const options = parseIrisImportArgumentsV1(
    commitArgumentsV1()
  );

  assert.doesNotThrow(() =>
    assertDevelopmentCommitV1(
      options,
      commitEnvironmentV1()
    )
  );

  for (const env of [
    {},
    commitEnvironmentV1({
      IRIS_IMPORT_ENABLED: "false"
    }),
    commitEnvironmentV1({
      IRIS_IMPORT_ENVIRONMENT: "production"
    }),
    commitEnvironmentV1({
      NODE_ENV: "production"
    }),
    commitEnvironmentV1({
      REPLIT_DEPLOYMENT: "1"
    }),
    commitEnvironmentV1({
      IRIS_IMPORT_ACTOR_KEY_ID: ""
    })
  ]) {
    assert.throws(
      () => assertDevelopmentCommitV1(options, env),
      IrisImportCliErrorV1
    );
  }

  assert.throws(
    () => assertDevelopmentCommitV1(
      {
        ...options,
        confirmation: "CONFIRMACIÓN_INCORRECTA"
      },
      commitEnvironmentV1()
    ),
    IrisImportCliErrorV1
  );
});

test("acepta únicamente un objeto JSON de metadatos", () => {
  assert.deepEqual(
    parseMetadataJsonV1(
      Buffer.from('{"country":"US"}')
    ),
    { country: "US" }
  );

  for (const value of [
    Buffer.from("{"),
    Buffer.from("null"),
    Buffer.from("[]")
  ]) {
    assert.throws(
      () => parseMetadataJsonV1(value),
      IrisImportCliErrorV1
    );
  }
});

test("commit autorizado usa runtime inyectado y salida mínima", async () => {
  let closed = false;
  const outputs = [];
  const summary = await runIrisDocumentImportCliV1({
    argv: commitArgumentsV1(),
    env: commitEnvironmentV1(),
    async readFile(filePath) {
      if (filePath.endsWith(".pdf")) {
        return Buffer.from("%PDF-1.7\nprivado");
      }
      return Buffer.from('{"title":"Privado"}');
    },
    writeOutput: value => outputs.push(value),
    async createCommitRuntime() {
      return {
        runtime: {
          async ingestPdf(request) {
            assert.equal(
              request.actorKeyId,
              "nuapp-iris-admin-v1"
            );
            return {
              documentKey: "no-mostrar",
              documentFamilyKey: "no-mostrar",
              status: "pending",
              isActive: false,
              chunkCount: 3
            };
          }
        },
        async close() {
          closed = true;
        }
      };
    }
  });

  assert.deepEqual(summary, {
    mode: "commit",
    fileBytes: 16,
    chunkCount: 3,
    status: "pending",
    isActive: false,
    persisted: true
  });
  assert.equal(closed, true);
  assert.equal(outputs.length, 1);
  assert.ok(!outputs[0].includes("Privado"));
  assert.ok(!outputs[0].includes("no-mostrar"));
  assert.ok(!outputs[0].includes("actor"));
  assert.ok(!outputs[0].includes("hash"));
  assert.ok(!outputs[0].includes("object"));
});

test("cierra el runtime persistente aunque la ingesta falle", async () => {
  let closed = false;
  let outputCalled = false;

  await assert.rejects(
    runIrisDocumentImportCliV1({
      argv: commitArgumentsV1(),
      env: commitEnvironmentV1(),
      async readFile(filePath) {
        return filePath.endsWith(".pdf")
          ? Buffer.from("%PDF-1.7\nprivado")
          : Buffer.from("{}");
      },
      writeOutput() {
        outputCalled = true;
      },
      async createCommitRuntime() {
        return {
          runtime: {
            async ingestPdf() {
              throw new Error("detalle privado");
            }
          },
          async close() {
            closed = true;
          }
        };
      }
    }),
    /detalle privado/
  );

  assert.equal(closed, true);
  assert.equal(outputCalled, false);
});
