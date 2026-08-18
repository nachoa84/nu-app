"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationPath = path.join(
  __dirname,
  "..",
  "migration-iris-document-retrieval-v1.sql"
);

const sql = fs.readFileSync(migrationPath, "utf8");
const executableSql = sql
  .split("\n")
  .filter(line => !line.trimStart().startsWith("--"))
  .join("\n");

test("la migración V1 está envuelta en una transacción", () => {
  assert.match(executableSql, /^\s*BEGIN\s*;/i);
  assert.match(executableSql, /COMMIT\s*;\s*$/i);
});

test("la migración V1 no contiene operaciones destructivas", () => {
  assert.doesNotMatch(executableSql, /\bDROP\b/i);
  assert.doesNotMatch(executableSql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(executableSql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(executableSql, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(executableSql, /\bCREATE\s+EXTENSION\b/i);
});

test("crea únicamente las cuatro tablas nuevas esperadas", () => {
  const matches = [
    ...executableSql.matchAll(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/gi
    )
  ].map(match => match[1].toLowerCase());

  assert.deepEqual(matches, [
    "iris_documents",
    "iris_document_chunks",
    "iris_search_aliases",
    "iris_document_audit"
  ]);
});

test("todas las claves foráneas permanecen dentro del dominio Iris", () => {
  const references = [
    ...executableSql.matchAll(/REFERENCES\s+([a-z0-9_]+)/gi)
  ].map(match => match[1].toLowerCase());

  assert.ok(references.length > 0);
  assert.ok(
    references.every(tableName => tableName.startsWith("iris_"))
  );
});

test("los documentos comienzan pendientes e inactivos", () => {
  assert.match(
    executableSql,
    /authorization_status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'pending'/i
  );
  assert.match(
    executableSql,
    /is_active\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i
  );
  assert.match(
    executableSql,
    /authorization_status\s*=\s*'approved'/i
  );
});

test("impide más de una versión activa por alcance", () => {
  assert.match(
    executableSql,
    /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_iris_documents_one_active_version/i
  );
  assert.match(
    executableSql,
    /WHERE\s+is_active\s*=\s*TRUE\s+AND\s+retired_at\s+IS\s+NULL/i
  );
});

test("la búsqueda usa un vector generado y un índice GIN", () => {
  assert.match(
    executableSql,
    /search_vector\s+TSVECTOR\s+GENERATED\s+ALWAYS\s+AS/i
  );
  assert.match(
    executableSql,
    /to_tsvector\('simple'::regconfig,\s*search_text_normalized\)/i
  );
  assert.match(
    executableSql,
    /USING\s+GIN\s*\(search_vector\)/i
  );
});

test("los fragmentos respetan el límite máximo de 2000 caracteres", () => {
  assert.match(
    executableSql,
    /CHAR_LENGTH\(content\)\s+BETWEEN\s+1\s+AND\s+2000/i
  );
});

test("los originales V1 se limitan inicialmente a PDF", () => {
  assert.match(
    executableSql,
    /mime_type\s*=\s*'application\/pdf'/i
  );
});

test("la auditoría usa acciones allowlisted", () => {
  for (const action of [
    "document_created",
    "document_reviewed",
    "document_activated",
    "document_rejected",
    "document_retired",
    "document_replaced"
  ]) {
    assert.match(executableSql, new RegExp(`'${action}'`));
  }
});
