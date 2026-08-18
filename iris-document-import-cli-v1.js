"use strict";

const path = require("node:path");
const {
  createIrisIngestionRuntimeV1
} = require("./iris-ingestion-runtime-v1");

const COMMIT_CONFIRMATION_V1 =
  "IRIS_V1_PERSIST_DEVELOPMENT";

class IrisImportCliErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisImportCliErrorV1";
  }
}

function requiredOptionValueV1(value, label) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.includes("\u0000")
  ) {
    throw new IrisImportCliErrorV1(
      `Falta un valor válido para ${label}.`
    );
  }

  return value.trim();
}

function parseIrisImportArgumentsV1(argv = []) {
  if (!Array.isArray(argv)) {
    throw new IrisImportCliErrorV1(
      "Los argumentos no son válidos."
    );
  }

  const options = {
    pdfPath: null,
    metadataPath: null,
    commit: false,
    confirmation: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--pdf") {
      if (options.pdfPath !== null) {
        throw new IrisImportCliErrorV1(
          "--pdf no puede repetirse."
        );
      }
      options.pdfPath = requiredOptionValueV1(
        argv[index + 1],
        "--pdf"
      );
      index += 1;
      continue;
    }

    if (argument === "--metadata") {
      if (options.metadataPath !== null) {
        throw new IrisImportCliErrorV1(
          "--metadata no puede repetirse."
        );
      }
      options.metadataPath = requiredOptionValueV1(
        argv[index + 1],
        "--metadata"
      );
      index += 1;
      continue;
    }

    if (argument === "--commit") {
      if (options.commit) {
        throw new IrisImportCliErrorV1(
          "--commit no puede repetirse."
        );
      }
      options.commit = true;
      continue;
    }

    if (
      typeof argument === "string" &&
      argument.startsWith("--confirm=")
    ) {
      if (options.confirmation !== null) {
        throw new IrisImportCliErrorV1(
          "--confirm no puede repetirse."
        );
      }
      options.confirmation = requiredOptionValueV1(
        argument.slice("--confirm=".length),
        "--confirm"
      );
      continue;
    }

    throw new IrisImportCliErrorV1(
      "Se recibió un argumento no permitido."
    );
  }

  if (!options.pdfPath || !options.metadataPath) {
    throw new IrisImportCliErrorV1(
      "Se requieren --pdf y --metadata."
    );
  }

  if (
    path.extname(options.pdfPath).toLowerCase() !== ".pdf" ||
    path.extname(options.metadataPath).toLowerCase() !== ".json"
  ) {
    throw new IrisImportCliErrorV1(
      "Se requiere un archivo .pdf y metadatos .json."
    );
  }

  if (!options.commit && options.confirmation) {
    throw new IrisImportCliErrorV1(
      "--confirm solo puede usarse con --commit."
    );
  }

  return options;
}

function assertDevelopmentCommitV1(options, env = {}) {
  if (!options.commit) {
    return;
  }

  if (
    options.confirmation !== COMMIT_CONFIRMATION_V1 ||
    env.IRIS_IMPORT_ENABLED !== "true" ||
    env.IRIS_IMPORT_ENVIRONMENT !== "development" ||
    env.NODE_ENV === "production" ||
    Boolean(env.REPLIT_DEPLOYMENT) ||
    typeof env.IRIS_IMPORT_ACTOR_KEY_ID !== "string" ||
    !env.IRIS_IMPORT_ACTOR_KEY_ID.trim()
  ) {
    throw new IrisImportCliErrorV1(
      "La persistencia de desarrollo no está autorizada."
    );
  }
}

function parseMetadataJsonV1(bytes) {
  let metadata;

  try {
    metadata = JSON.parse(
      Buffer.from(bytes).toString("utf8")
    );
  } catch {
    throw new IrisImportCliErrorV1(
      "El archivo de metadatos no contiene JSON válido."
    );
  }

  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    throw new IrisImportCliErrorV1(
      "Los metadatos deben ser un objeto JSON."
    );
  }

  return metadata;
}

function createDryRunPoolV1() {
  const client = {
    async query(text) {
      if (/INSERT INTO iris_documents/.test(text)) {
        return { rows: [{ id: 1 }] };
      }
      return { rows: [] };
    },
    release() {}
  };

  return {
    async query() {
      return { rows: [] };
    },
    async connect() {
      return client;
    }
  };
}

function createDryRunStorageClientV1() {
  return {
    async uploadFromBytes() {
      return { ok: true, value: null };
    },
    async delete() {
      return { ok: true, value: null };
    }
  };
}

function safeSummaryV1({
  mode,
  fileBytes,
  result
}) {
  return Object.freeze({
    mode,
    fileBytes,
    chunkCount: result.chunkCount,
    status: result.status,
    isActive: result.isActive,
    persisted: mode === "commit"
  });
}

function formatSummaryV1(summary) {
  return [
    `mode=${summary.mode}`,
    `file_bytes=${summary.fileBytes}`,
    `chunk_count=${summary.chunkCount}`,
    `status=${summary.status}`,
    `is_active=${summary.isActive}`,
    `persisted=${summary.persisted}`
  ].join("\n");
}

async function runIrisDocumentImportCliV1({
  argv,
  env = {},
  readFile,
  writeOutput = () => {},
  createCommitRuntime
} = {}) {
  if (
    typeof readFile !== "function" ||
    typeof writeOutput !== "function"
  ) {
    throw new IrisImportCliErrorV1(
      "Las dependencias del comando no son válidas."
    );
  }

  const options = parseIrisImportArgumentsV1(argv);
  assertDevelopmentCommitV1(options, env);

  let pdfBytes;
  let metadataBytes;
  try {
    [pdfBytes, metadataBytes] = await Promise.all([
      readFile(options.pdfPath),
      readFile(options.metadataPath)
    ]);
  } catch {
    throw new IrisImportCliErrorV1(
      "No se pudieron leer los archivos de importación."
    );
  }

  if (!Buffer.isBuffer(pdfBytes)) {
    pdfBytes = Buffer.from(pdfBytes);
  }
  const metadata = parseMetadataJsonV1(metadataBytes);

  let runtime;
  let closeRuntime = async () => {};

  if (options.commit) {
    if (typeof createCommitRuntime !== "function") {
      throw new IrisImportCliErrorV1(
        "El runtime persistente no está disponible."
      );
    }

    const created = await createCommitRuntime();
    if (
      !created ||
      !created.runtime ||
      typeof created.runtime.ingestPdf !== "function" ||
      typeof created.close !== "function"
    ) {
      throw new IrisImportCliErrorV1(
        "El runtime persistente no es válido."
      );
    }

    runtime = created.runtime;
    closeRuntime = created.close;
  } else {
    runtime = createIrisIngestionRuntimeV1({
      pool: createDryRunPoolV1(),
      storageClient: createDryRunStorageClientV1(),
      randomUUID: () => "dry-run-id"
    });
  }

  try {
    const result = await runtime.ingestPdf({
      file: {
        bytes: pdfBytes,
        mimeType: "application/pdf"
      },
      metadata,
      actorKeyId: options.commit
        ? env.IRIS_IMPORT_ACTOR_KEY_ID.trim()
        : "iris-dry-run-v1"
    });
    const summary = safeSummaryV1({
      mode: options.commit ? "commit" : "dry-run",
      fileBytes: pdfBytes.length,
      result
    });

    writeOutput(formatSummaryV1(summary));
    return summary;
  } finally {
    await closeRuntime();
  }
}

module.exports = {
  COMMIT_CONFIRMATION_V1,
  IrisImportCliErrorV1,
  assertDevelopmentCommitV1,
  formatSummaryV1,
  parseIrisImportArgumentsV1,
  parseMetadataJsonV1,
  runIrisDocumentImportCliV1,
  safeSummaryV1
};
