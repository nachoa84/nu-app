"use strict";

const {
  OPERATIONS_V1,
  requiredSafeKeyV1
} = require("./iris-document-review-store-v1");

const TRANSITION_CONFIRMATION_V1 =
  "IRIS_V1_TRANSITION_DEVELOPMENT";

class IrisDocumentReviewCliErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisDocumentReviewCliErrorV1";
  }
}

function optionValueV1(value, label) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.includes("\u0000")
  ) {
    throw new IrisDocumentReviewCliErrorV1(
      `Falta un valor válido para ${label}.`
    );
  }
  return value.trim();
}

function parseReviewArgumentsV1(argv = []) {
  if (!Array.isArray(argv)) {
    throw new IrisDocumentReviewCliErrorV1(
      "Los argumentos no son válidos."
    );
  }

  const options = {
    documentKey: null,
    operation: null,
    commit: false,
    confirmation: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--document-key") {
      if (options.documentKey !== null) {
        throw new IrisDocumentReviewCliErrorV1(
          "--document-key no puede repetirse."
        );
      }
      options.documentKey = optionValueV1(
        argv[index + 1],
        "--document-key"
      );
      index += 1;
      continue;
    }
    if (argument === "--operation") {
      if (options.operation !== null) {
        throw new IrisDocumentReviewCliErrorV1(
          "--operation no puede repetirse."
        );
      }
      options.operation = optionValueV1(
        argv[index + 1],
        "--operation"
      );
      index += 1;
      continue;
    }
    if (argument === "--commit") {
      if (options.commit) {
        throw new IrisDocumentReviewCliErrorV1(
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
        throw new IrisDocumentReviewCliErrorV1(
          "--confirm no puede repetirse."
        );
      }
      options.confirmation = optionValueV1(
        argument.slice("--confirm=".length),
        "--confirm"
      );
      continue;
    }
    throw new IrisDocumentReviewCliErrorV1(
      "Se recibió un argumento no permitido."
    );
  }

  if (!options.documentKey || !options.operation) {
    throw new IrisDocumentReviewCliErrorV1(
      "Se requieren --document-key y --operation."
    );
  }

  try {
    options.documentKey = requiredSafeKeyV1(
      options.documentKey,
      "documentKey"
    );
  } catch {
    throw new IrisDocumentReviewCliErrorV1(
      "--document-key no tiene un formato seguro."
    );
  }

  if (!OPERATIONS_V1.includes(options.operation)) {
    throw new IrisDocumentReviewCliErrorV1(
      "--operation no está permitida."
    );
  }

  if (!options.commit && options.confirmation) {
    throw new IrisDocumentReviewCliErrorV1(
      "--confirm solo puede usarse con --commit."
    );
  }

  return options;
}

function assertDevelopmentTransitionV1(options, env = {}) {
  if (!options.commit) {
    return;
  }

  if (
    options.confirmation !== TRANSITION_CONFIRMATION_V1 ||
    env.IRIS_REVIEW_ENABLED !== "true" ||
    env.IRIS_REVIEW_ENVIRONMENT !== "development" ||
    env.NODE_ENV === "production" ||
    Boolean(env.REPLIT_DEPLOYMENT) ||
    typeof env.IRIS_REVIEW_ACTOR_KEY_ID !== "string" ||
    !env.IRIS_REVIEW_ACTOR_KEY_ID.trim()
  ) {
    throw new IrisDocumentReviewCliErrorV1(
      "La transición de desarrollo no está autorizada."
    );
  }
}

function safeReviewSummaryV1({
  mode,
  operation,
  state
}) {
  return Object.freeze({
    mode,
    operation,
    authorizationStatus: state.authorizationStatus,
    isActive: state.isActive === true,
    retired: state.retired === true,
    persisted: mode === "commit"
  });
}

function formatReviewSummaryV1(summary) {
  return [
    `mode=${summary.mode}`,
    `operation=${summary.operation}`,
    `authorization_status=${summary.authorizationStatus}`,
    `is_active=${summary.isActive}`,
    `retired=${summary.retired}`,
    `persisted=${summary.persisted}`
  ].join("\n");
}

async function runIrisDocumentReviewCliV1({
  argv,
  env = {},
  createRuntime,
  writeOutput = () => {}
} = {}) {
  if (
    typeof createRuntime !== "function" ||
    typeof writeOutput !== "function"
  ) {
    throw new IrisDocumentReviewCliErrorV1(
      "Las dependencias del comando no son válidas."
    );
  }

  const options = parseReviewArgumentsV1(argv);
  assertDevelopmentTransitionV1(options, env);

  const created = await createRuntime();
  if (
    !created ||
    typeof created.readDocumentState !== "function" ||
    typeof created.transitionDocument !== "function" ||
    typeof created.close !== "function"
  ) {
    throw new IrisDocumentReviewCliErrorV1(
      "El runtime de revisión no es válido."
    );
  }

  try {
    const state = options.commit
      ? await created.transitionDocument({
          documentKey: options.documentKey,
          operation: options.operation,
          actorKeyId: env.IRIS_REVIEW_ACTOR_KEY_ID.trim()
        })
      : await created.readDocumentState({
          documentKey: options.documentKey
        });

    if (!state) {
      throw new IrisDocumentReviewCliErrorV1(
        "El documento no está disponible."
      );
    }

    const summary = safeReviewSummaryV1({
      mode: options.commit ? "commit" : "dry-run",
      operation: options.operation,
      state
    });
    writeOutput(formatReviewSummaryV1(summary));
    return summary;
  } finally {
    await created.close();
  }
}

module.exports = {
  TRANSITION_CONFIRMATION_V1,
  IrisDocumentReviewCliErrorV1,
  assertDevelopmentTransitionV1,
  formatReviewSummaryV1,
  parseReviewArgumentsV1,
  runIrisDocumentReviewCliV1,
  safeReviewSummaryV1
};
