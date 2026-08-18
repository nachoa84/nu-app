#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const {
  Client: ObjectStorageClient
} = require("@replit/object-storage");
const { Pool } = require("pg");
const {
  IrisImportCliErrorV1,
  runIrisDocumentImportCliV1
} = require("./iris-document-import-cli-v1");
const {
  createIrisIngestionRuntimeV1
} = require("./iris-ingestion-runtime-v1");
const {
  databasePoolOptionsV113
} = require("./runtime-config-v113");

async function createPersistentRuntimeV1() {
  const poolOptions = databasePoolOptionsV113(
    process.env.DATABASE_URL,
    process.env
  );

  if (!poolOptions) {
    throw new IrisImportCliErrorV1(
      "La base de desarrollo no está configurada."
    );
  }

  const pool = new Pool(poolOptions);
  const storageClient = new ObjectStorageClient();

  return {
    runtime: createIrisIngestionRuntimeV1({
      pool,
      storageClient
    }),
    async close() {
      await pool.end();
    }
  };
}

runIrisDocumentImportCliV1({
  argv: process.argv.slice(2),
  env: process.env,
  readFile: fs.readFile,
  writeOutput: value => process.stdout.write(
    `${value}\n`
  ),
  createCommitRuntime: createPersistentRuntimeV1
}).catch(error => {
  const category = error instanceof IrisImportCliErrorV1
    ? "validation"
    : "operational";

  process.stderr.write(
    `iris_import_failed=${category}\n`
  );
  process.exitCode = 1;
});
