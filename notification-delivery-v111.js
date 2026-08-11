// NU APP · ENTREGA CONFIABLE DE NOTIFICACIONES V111
// Funciones puras compartidas por el scheduler y sus pruebas.

const crypto = require("crypto");

const RETRYABLE_STATUS_CODES_V111 = new Set([0, 408, 425, 429]);
const CONFIGURATION_STATUS_CODES_V111 = new Set([401, 403]);

function sourceReferencesV111(batch = {}) {
  return [
    ...(batch.collagen || []).map(row => ({
      sourceTable: "notification_jobs",
      sourceId: Number(row.id)
    })),
    ...(batch.products || []).map(row => ({
      sourceTable: "routine_notification_jobs",
      sourceId: Number(row.id)
    }))
  ].sort((left, right) =>
    left.sourceTable.localeCompare(right.sourceTable) ||
    left.sourceId - right.sourceId
  );
}

function logicalDeliveryKeyV111(batch = {}) {
  const source = sourceReferencesV111(batch)
    .map(row => `${row.sourceTable}:${row.sourceId}`)
    .join("|");

  if (!source) {
    throw new Error("V111 requiere al menos un trabajo fuente.");
  }

  return crypto
    .createHash("sha256")
    .update(`${String(batch.userId || "")}|${source}`, "utf8")
    .digest("hex");
}

function endpointHashV111(endpoint) {
  return crypto
    .createHash("sha256")
    .update(String(endpoint || ""), "utf8")
    .digest("hex");
}

function attachDeliveryIdentityV111(payload, logicalKey) {
  const notificationId = `routine_${logicalKey}`;

  return {
    ...payload,
    notificationId,
    tag: notificationId
  };
}

function classifyPushErrorV111(error = {}) {
  const statusCode = Number(error.statusCode || error.status || 0);

  if (statusCode === 404 || statusCode === 410) {
    return { kind: "expired", statusCode };
  }

  if (CONFIGURATION_STATUS_CODES_V111.has(statusCode)) {
    return { kind: "configuration", statusCode };
  }

  if (
    RETRYABLE_STATUS_CODES_V111.has(statusCode) ||
    statusCode >= 500
  ) {
    return { kind: "retryable", statusCode };
  }

  return { kind: "permanent", statusCode };
}

function retryDelayMsV111(attempts, baseMs) {
  const exponent = Math.max(Number(attempts || 1) - 1, 0);
  return Math.min(Number(baseMs) * (2 ** exponent), 24 * 60 * 60 * 1000);
}

function summarizeDeliveryRowsV111(rows = []) {
  const summary = {
    total: rows.length,
    pending: 0,
    processing: 0,
    retryable: 0,
    sent: 0,
    permanent: 0
  };

  for (const row of rows) {
    if (Object.hasOwn(summary, row.status)) summary[row.status] += 1;
  }

  summary.open = summary.pending + summary.processing + summary.retryable;
  return summary;
}

module.exports = {
  attachDeliveryIdentityV111,
  classifyPushErrorV111,
  endpointHashV111,
  logicalDeliveryKeyV111,
  retryDelayMsV111,
  sourceReferencesV111,
  summarizeDeliveryRowsV111
};
