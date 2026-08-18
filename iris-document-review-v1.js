#!/usr/bin/env node
"use strict";

const { Pool } = require("pg");
const {
  IrisDocumentReviewCliErrorV1,
  runIrisDocumentReviewCliV1
} = require("./iris-document-review-cli-v1");
const {
  createIrisDocumentReviewStoreV1
} = require("./iris-document-review-store-v1");
const {
  databasePoolOptionsV113
} = require("./runtime-config-v113");

async function createReviewRuntimeV1() {
  const poolOptions = databasePoolOptionsV113(
    process.env.DATABASE_URL,
    process.env
  );
  if (!poolOptions) {
    throw new IrisDocumentReviewCliErrorV1(
      "La base de desarrollo no está configurada."
    );
  }

  const pool = new Pool(poolOptions);
  const store = createIrisDocumentReviewStoreV1({ pool });

  return {
    async readDocumentState({ documentKey }) {
      const result = await pool.query(
        `SELECT
           authorization_status,
           is_active,
           retired_at
         FROM iris_documents
         WHERE document_key = $1
         LIMIT 1`,
        [documentKey]
      );
      const row = result.rows[0];
      return row ? {
        authorizationStatus: row.authorization_status,
        isActive: row.is_active === true,
        retired: row.retired_at !== null
      } : null;
    },
    transitionDocument: store.transitionDocument,
    async close() {
      await pool.end();
    }
  };
}

runIrisDocumentReviewCliV1({
  argv: process.argv.slice(2),
  env: process.env,
  createRuntime: createReviewRuntimeV1,
  writeOutput: value => process.stdout.write(`${value}\n`)
}).catch(error => {
  const category = error instanceof IrisDocumentReviewCliErrorV1
    ? "validation"
    : "operational";
  process.stderr.write(
    `iris_document_review_failed=${category}\n`
  );
  process.exitCode = 1;
});
