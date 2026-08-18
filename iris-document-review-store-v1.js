"use strict";

const OPERATIONS_V1 = Object.freeze([
  "review",
  "approve",
  "activate",
  "reject",
  "retire"
]);

const SAFE_KEY_PATTERN_V1 =
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/;

class IrisDocumentTransitionErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisDocumentTransitionErrorV1";
  }
}

class IrisDocumentTransitionOperationalErrorV1 extends Error {
  constructor() {
    super("No se pudo completar la transición documental.");
    this.name = "IrisDocumentTransitionOperationalErrorV1";
  }
}

function requiredSafeKeyV1(value, label) {
  if (typeof value !== "string") {
    throw new IrisDocumentTransitionErrorV1(
      `${label} debe ser una cadena.`
    );
  }

  const normalized = value.trim();
  if (!SAFE_KEY_PATTERN_V1.test(normalized)) {
    throw new IrisDocumentTransitionErrorV1(
      `${label} no tiene un formato seguro.`
    );
  }

  return normalized;
}

function normalizeOperationV1(value) {
  if (
    typeof value !== "string" ||
    !OPERATIONS_V1.includes(value)
  ) {
    throw new IrisDocumentTransitionErrorV1(
      "operation no está permitida."
    );
  }

  return value;
}

function normalizeNowV1(value) {
  const now = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(now.getTime())) {
    throw new IrisDocumentTransitionErrorV1(
      "now debe representar una fecha válida."
    );
  }
  return now;
}

function safeTransitionLogV1(error, operation) {
  return {
    operation,
    errorCode:
      typeof error?.code === "string" ? error.code : "",
    constraint:
      typeof error?.constraint === "string"
        ? error.constraint
        : "",
    retryable: Boolean(
      error?.code === "40001" ||
      error?.code === "40P01" ||
      error?.code === "08006"
    )
  };
}

function emitSafeTransitionLogV1(logError, error, operation) {
  try {
    logError(safeTransitionLogV1(error, operation));
  } catch {
    // El registrador no debe reemplazar el resultado del store.
  }
}

function assertTransitionAllowedV1(document, operation) {
  const status = document.authorization_status;
  const active = document.is_active === true;
  const retired = document.retired_at !== null;

  if (retired) {
    throw new IrisDocumentTransitionErrorV1(
      "El documento ya fue retirado."
    );
  }

  const allowed = {
    review: status === "pending" && !active,
    approve: status === "pending" && !active,
    activate:
      status === "approved" &&
      !active &&
      typeof document.authorization_reference === "string" &&
      Boolean(document.authorization_reference.trim()),
    reject: status === "pending" && !active,
    retire: status === "approved"
  };

  if (!allowed[operation]) {
    throw new IrisDocumentTransitionErrorV1(
      "La transición no es válida para el estado actual."
    );
  }
}

function transitionDefinitionV1(operation) {
  const definitions = {
    review: {
      action: "document_reviewed",
      details: { decision: "reviewed" },
      decision: "reviewed",
      update: null
    },
    approve: {
      action: "document_reviewed",
      details: { decision: "approved" },
      decision: "approved",
      update:
        `UPDATE iris_documents
         SET authorization_status = 'approved',
             updated_at = $2
         WHERE id = $1`
    },
    activate: {
      action: "document_activated",
      details: {},
      decision: null,
      update:
        `UPDATE iris_documents
         SET is_active = TRUE,
             updated_at = $2
         WHERE id = $1`
    },
    reject: {
      action: "document_rejected",
      details: {},
      decision: null,
      update:
        `UPDATE iris_documents
         SET authorization_status = 'rejected',
             is_active = FALSE,
             updated_at = $2
         WHERE id = $1`
    },
    retire: {
      action: "document_retired",
      details: {},
      decision: null,
      update:
        `UPDATE iris_documents
         SET is_active = FALSE,
             retired_at = $2,
             updated_at = $2
         WHERE id = $1`
    }
  };

  return definitions[operation];
}

function resultForTransitionV1(document, operation) {
  const result = {
    authorizationStatus: document.authorization_status,
    isActive: document.is_active === true,
    retired: document.retired_at !== null
  };

  if (operation === "approve") {
    result.authorizationStatus = "approved";
  } else if (operation === "activate") {
    result.isActive = true;
  } else if (operation === "reject") {
    result.authorizationStatus = "rejected";
    result.isActive = false;
  } else if (operation === "retire") {
    result.isActive = false;
    result.retired = true;
  }

  return Object.freeze(result);
}

function createIrisDocumentReviewStoreV1({
  pool,
  logError = () => {}
} = {}) {
  if (!pool || typeof pool.connect !== "function") {
    throw new IrisDocumentTransitionErrorV1(
      "Se requiere un pool PostgreSQL válido."
    );
  }
  if (typeof logError !== "function") {
    throw new IrisDocumentTransitionErrorV1(
      "logError debe ser una función."
    );
  }

  async function transitionDocument({
    documentKey,
    operation,
    actorKeyId,
    now
  } = {}) {
    const normalizedDocumentKey = requiredSafeKeyV1(
      documentKey,
      "documentKey"
    );
    const normalizedOperation = normalizeOperationV1(operation);
    const normalizedActorKeyId = requiredSafeKeyV1(
      actorKeyId,
      "actorKeyId"
    );
    const normalizedNow = normalizeNowV1(now);

    let client;
    let committed = false;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const selected = await client.query(
        `SELECT
           id,
           document_family_key,
           authorization_status,
           authorization_reference,
           language,
           country,
           is_active,
           retired_at
         FROM iris_documents
         WHERE document_key = $1
         FOR UPDATE`,
        [normalizedDocumentKey]
      );

      const document = selected.rows[0];
      if (!document) {
        throw new IrisDocumentTransitionErrorV1(
          "El documento no está disponible."
        );
      }

      assertTransitionAllowedV1(document, normalizedOperation);
      const definition = transitionDefinitionV1(normalizedOperation);

      if (definition.decision) {
        const repeated = await client.query(
          `SELECT 1
           FROM iris_document_audit
           WHERE document_id = $1
             AND action = 'document_reviewed'
             AND details ->> 'decision' = $2
           LIMIT 1`,
          [document.id, definition.decision]
        );
        if (repeated.rows.length > 0) {
          throw new IrisDocumentTransitionErrorV1(
            "La transición ya fue registrada."
          );
        }
      }

      if (normalizedOperation === "activate") {
        const scopeKey = [
          document.document_family_key,
          document.language,
          document.country
        ].join("\u001f");

        await client.query(
          `SELECT pg_advisory_xact_lock(
             hashtextextended($1, 0)
           )`,
          [scopeKey]
        );

        const active = await client.query(
          `SELECT 1
           FROM iris_documents
           WHERE document_family_key = $1
             AND language = $2
             AND country = $3
             AND is_active = TRUE
             AND retired_at IS NULL
             AND id <> $4
           LIMIT 1
           FOR UPDATE`,
          [
            document.document_family_key,
            document.language,
            document.country,
            document.id
          ]
        );
        if (active.rows.length > 0) {
          throw new IrisDocumentTransitionErrorV1(
            "Ya existe una versión activa para este alcance."
          );
        }
      }

      if (definition.update) {
        await client.query(
          definition.update,
          [document.id, normalizedNow]
        );
      }

      await client.query(
        `INSERT INTO iris_document_audit (
           document_id,
           actor_key_id,
           action,
           details,
           client_ip
         )
         VALUES ($1, $2, $3, $4::jsonb, NULL)`,
        [
          document.id,
          normalizedActorKeyId,
          definition.action,
          JSON.stringify(definition.details)
        ]
      );

      await client.query("COMMIT");
      committed = true;
      return resultForTransitionV1(
        document,
        normalizedOperation
      );
    } catch (error) {
      if (client && !committed) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // La liberación de la conexión contiene el fallo.
        }
      }

      if (error instanceof IrisDocumentTransitionErrorV1) {
        throw error;
      }

      emitSafeTransitionLogV1(
        logError,
        error,
        "transition_iris_document_v1"
      );
      throw new IrisDocumentTransitionOperationalErrorV1();
    } finally {
      if (client) {
        try {
          client.release();
        } catch (error) {
          emitSafeTransitionLogV1(
            logError,
            error,
            "release_database_client_v1"
          );
        }
      }
    }
  }

  return Object.freeze({ transitionDocument });
}

module.exports = {
  OPERATIONS_V1,
  IrisDocumentTransitionErrorV1,
  IrisDocumentTransitionOperationalErrorV1,
  assertTransitionAllowedV1,
  createIrisDocumentReviewStoreV1,
  normalizeOperationV1,
  requiredSafeKeyV1,
  resultForTransitionV1,
  safeTransitionLogV1
};
