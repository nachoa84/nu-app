"use strict";

const IRIS_STORAGE_PREFIX_V1 = "iris/documents/v1/";
const PDF_MIME_TYPE_V1 = "application/pdf";
const MAX_OBJECT_KEY_LENGTH_V1 = 1024;

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
    segments.some(segment =>
      !segment ||
      segment === "." ||
      segment === ".." ||
      !/^[a-zA-Z0-9._-]+$/.test(segment)
    ) ||
    segments.at(-1) !== "original.pdf"
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

    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new IrisStorageAdapterErrorV1(
        "El contenido del objeto debe ser un Buffer no vacío."
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
  PDF_MIME_TYPE_V1,
  IrisStorageAdapterErrorV1,
  IrisStorageAdapterOperationalErrorV1,
  createIrisReplitStorageAdapterV1,
  validateIrisObjectKeyV1
};
