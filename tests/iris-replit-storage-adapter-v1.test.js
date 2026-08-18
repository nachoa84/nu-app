"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  IRIS_STORAGE_PREFIX_V1,
  IrisStorageAdapterErrorV1,
  IrisStorageAdapterOperationalErrorV1,
  createIrisReplitStorageAdapterV1,
  validateIrisObjectKeyV1
} = require("../iris-replit-storage-adapter-v1");

const VALID_KEY_V1 = [
  "iris",
  "documents",
  "v1",
  "family_123",
  "doc_456",
  "a".repeat(64),
  "original.pdf"
].join("/");

function harnessV1(overrides = {}) {
  const calls = [];
  const client = {
    async uploadFromBytes(key, bytes) {
      calls.push({ operation: "upload", key, bytes });
      return { ok: true, value: null };
    },
    async delete(key) {
      calls.push({ operation: "delete", key });
      return { ok: true, value: null };
    },
    ...overrides
  };

  return {
    calls,
    client,
    adapter: createIrisReplitStorageAdapterV1({ client })
  };
}

test("requiere un cliente Replit App Storage válido", () => {
  for (const client of [
    null,
    {},
    { uploadFromBytes() {} },
    { delete() {} }
  ]) {
    assert.throws(
      () => createIrisReplitStorageAdapterV1({ client }),
      IrisStorageAdapterErrorV1
    );
  }
});

test("solo permite claves dentro del prefijo privado Iris", () => {
  assert.equal(
    validateIrisObjectKeyV1(VALID_KEY_V1),
    VALID_KEY_V1
  );
  assert.equal(
    VALID_KEY_V1.startsWith(IRIS_STORAGE_PREFIX_V1),
    true
  );

  for (const key of [
    "bot/active/original.pdf",
    "routines/active/original.pdf",
    "iris/documents/v1/../bot/active/original.pdf",
    "iris/documents/v1/family//doc/hash/original.pdf",
    "iris/documents/v1/family\\doc/hash/original.pdf",
    "iris/documents/v1/family/doc/hash/not-original.pdf",
    `iris/documents/v1/family/doc/${"a".repeat(1100)}/original.pdf`
  ]) {
    assert.throws(
      () => validateIrisObjectKeyV1(key),
      IrisStorageAdapterErrorV1
    );
  }
});

test("sube exactamente los bytes PDF a la clave validada", async () => {
  const h = harnessV1();
  const bytes = Buffer.from("%PDF-1.7\ncontenido");

  await h.adapter.putObject({
    key: VALID_KEY_V1,
    bytes,
    contentType: "application/pdf"
  });

  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].operation, "upload");
  assert.equal(h.calls[0].key, VALID_KEY_V1);
  assert.equal(h.calls[0].bytes, bytes);
});

test("rechaza contenido vacío, no binario o de otro tipo", async () => {
  const h = harnessV1();

  for (const input of [
    {
      key: VALID_KEY_V1,
      bytes: "",
      contentType: "application/pdf"
    },
    {
      key: VALID_KEY_V1,
      bytes: Buffer.alloc(0),
      contentType: "application/pdf"
    },
    {
      key: VALID_KEY_V1,
      bytes: Buffer.from("%PDF-"),
      contentType: "text/plain"
    }
  ]) {
    await assert.rejects(
      h.adapter.putObject(input),
      IrisStorageAdapterErrorV1
    );
  }

  assert.equal(h.calls.length, 0);
});

test("elimina únicamente la clave exacta validada", async () => {
  const h = harnessV1();

  await h.adapter.deleteObject({ key: VALID_KEY_V1 });

  assert.deepEqual(h.calls, [{
    operation: "delete",
    key: VALID_KEY_V1
  }]);

  await assert.rejects(
    h.adapter.deleteObject({
      key: "bot/active/documento.pdf"
    }),
    IrisStorageAdapterErrorV1
  );
  assert.equal(h.calls.length, 1);
});

test("sanea excepciones del SDK durante la subida", async () => {
  const h = harnessV1({
    async uploadFromBytes() {
      throw new Error("bucket y credencial privados");
    }
  });

  await assert.rejects(
    h.adapter.putObject({
      key: VALID_KEY_V1,
      bytes: Buffer.from("%PDF-"),
      contentType: "application/pdf"
    }),
    error => {
      assert.ok(
        error instanceof IrisStorageAdapterOperationalErrorV1
      );
      assert.equal(
        error.code,
        "IRIS_STORAGE_UPLOAD_FAILED"
      );
      assert.ok(!error.message.includes("bucket"));
      assert.ok(!Object.hasOwn(error, "cause"));
      return true;
    }
  );
});

test("sanea excepciones del SDK durante la eliminación", async () => {
  const h = harnessV1({
    async delete() {
      throw new Error("objeto privado");
    }
  });

  await assert.rejects(
    h.adapter.deleteObject({ key: VALID_KEY_V1 }),
    error => {
      assert.ok(
        error instanceof IrisStorageAdapterOperationalErrorV1
      );
      assert.equal(
        error.code,
        "IRIS_STORAGE_DELETE_FAILED"
      );
      assert.ok(!error.message.includes("objeto"));
      return true;
    }
  );
});

test("trata resultados fallidos del SDK como errores saneados", async () => {
  for (const operation of ["upload", "delete"]) {
    const h = harnessV1({
      async uploadFromBytes() {
        return {
          ok: false,
          error: new Error("detalle privado")
        };
      },
      async delete() {
        return {
          ok: false,
          error: new Error("detalle privado")
        };
      }
    });

    const promise = operation === "upload"
      ? h.adapter.putObject({
          key: VALID_KEY_V1,
          bytes: Buffer.from("%PDF-"),
          contentType: "application/pdf"
        })
      : h.adapter.deleteObject({ key: VALID_KEY_V1 });

    await assert.rejects(
      promise,
      IrisStorageAdapterOperationalErrorV1
    );
  }
});

test("no lista, descarga ni vuelve públicos los objetos", () => {
  const h = harnessV1();

  assert.deepEqual(
    Object.keys(h.adapter).sort(),
    ["deleteObject", "putObject"]
  );
  assert.equal(
    typeof h.adapter.listObjects,
    "undefined"
  );
  assert.equal(
    typeof h.adapter.getPublicUrl,
    "undefined"
  );
});
