"use strict";

const IRIS_STORAGE_PREFIX_V1 = "iris/documents/v1/";
const PDF_MIME_TYPE_V1 = "application/pdf";
const MAX_OBJECT_KEY_LENGTH_V1 = 1024;
const MAX_PDF_BYTES_V1 = 15 * 1024 * 1024;

class IrisStorageAdapterErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisStorageAdapterErrorV1";
  }
}

class IrisStorageAdapterOperationalErrorV1 extends Error {
  constructor(operation) {
    super("No se pudo completar la operación de almacenamiento.");
    this.name = "IrisStorageAdapterOperationalErrorV1";
    this.code = operation === "delete"
      ? "IRIS_STORAGE_DELETE_FAILED"
      : "IRIS_STORAGE_UPLOAD_FAILED";
  }
}

function validateIrisObjectKeyV1(key) {
  if (
    typeof key !== "string" ||
    !key.startsWith(IRIS_STORAGE_PREFIX_V1) ||
    key.length > MAX_OBJECT_KEY_LENGTH_V1
  ) {
    throw new IrisStorageAdapterErrorV1(
      "La clave de almacenamiento Iris no es válida."
    );
  }

  if (
    key.includes("\\") ||
    key.includes("//") ||
    /[\u0000-\u001f\u007f]/u.test(key)
  ) {
    throw new IrisStorageAdapterErrorV1(
      "La clave de almacenamiento Iris no es segura."
    );
  }

  const segments = key.split("/");
  if (
    segments.length !== 7 ||
    segments[0] !== "iris" ||
    segments[1] !== "documents" ||
    segments[2] !== "v1" ||
    !/^[a-z0-9][a-z0-9_-]{0,199}$/.test(segments[3]) ||
    !/^doc_[a-zA-Z0-9-]{1,100}$/.test(segments[4]) ||
    !/^[a-f0-9]{64}$/.test(segments[5]) ||
    segments[6] !== "original.pdf"
  ) {
    throw new IrisStorageAdapterErrorV1(
      "La clave de almacenamiento Iris no es segura."
    );
  }

  return key;
}

function assertSuccessfulResultV1(result, operation) {
  if (!result || result.ok !== true) {
    throw new IrisStorageAdapterOperationalErrorV1(operation);
  }
}

function createIrisReplitStorageAdapterV1({ client } = {}) {
  if (
    !client ||
    typeof client.uploadFromBytes !== "function" ||
    typeof client.delete !== "function"
  ) {
    throw new IrisStorageAdapterErrorV1(
      "Se requiere un cliente de Replit App Storage válido."
    );
  }

  async function putObject({
    key,
    bytes,
    contentType
  } = {}) {
    const normalizedKey = validateIrisObjectKeyV1(key);

    if (
      !Buffer.isBuffer(bytes) ||
      bytes.length === 0 ||
      bytes.length > MAX_PDF_BYTES_V1
    ) {
      throw new IrisStorageAdapterErrorV1(
        "El contenido PDF no tiene un tamaño válido."
      );
    }

    if (
      bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
    ) {
      throw new IrisStorageAdapterErrorV1(
        "El contenido no tiene una firma PDF válida."
      );
    }

    if (contentType !== PDF_MIME_TYPE_V1) {
      throw new IrisStorageAdapterErrorV1(
        "El adaptador Iris solo admite application/pdf."
      );
    }

    let result;
    try {
      result = await client.uploadFromBytes(
        normalizedKey,
        bytes
      );
    } catch {
      throw new IrisStorageAdapterOperationalErrorV1(
        "upload"
      );
    }

    assertSuccessfulResultV1(result, "upload");
  }

  async function deleteObject({ key } = {}) {
    const normalizedKey = validateIrisObjectKeyV1(key);

    let result;
    try {
      result = await client.delete(normalizedKey);
    } catch {
      throw new IrisStorageAdapterOperationalErrorV1(
        "delete"
      );
    }

    assertSuccessfulResultV1(result, "delete");
  }

  return {
    putObject,
    deleteObject
  };
}

module.exports = {
  IRIS_STORAGE_PREFIX_V1,
  MAX_OBJECT_KEY_LENGTH_V1,
  MAX_PDF_BYTES_V1,
  PDF_MIME_TYPE_V1,
  IrisStorageAdapterErrorV1,
  IrisStorageAdapterOperationalErrorV1,
  createIrisReplitStorageAdapterV1,
  validateIrisObjectKeyV1
};
