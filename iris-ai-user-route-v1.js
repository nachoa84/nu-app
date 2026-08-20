"use strict";

const crypto = require("node:crypto");

const MAX_USER_ID_CHARS_V1 = 128;
const MAX_QUESTION_CHARS_V1 = 500;
const USER_ID_PATTERN_V1 = /^[A-Za-z0-9_-]+$/;
const COUNTRY_PATTERN_V1 = /^(GLOBAL|[A-Z]{2})$/;
const LANGUAGE_PATTERN_V1 = /^[a-z]{2}(-[A-Z]{2})?$/;

class IrisAiUserRouteErrorV1 extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "IrisAiUserRouteErrorV1";
    this.status = status;
  }
}

function enabledFlagV1(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function normalizeRequestV1(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new IrisAiUserRouteErrorV1("Solicitud inválida.");
  }

  const allowedKeys = new Set([
    "question",
    "userId",
    "country",
    "language"
  ]);

  if (Object.keys(body).some(key => !allowedKeys.has(key))) {
    throw new IrisAiUserRouteErrorV1("Solicitud contiene campos no permitidos.");
  }

  const question = String(body.question || "").trim();
  const userId = String(body.userId || "").trim();
  const country = String(body.country || "").trim().toUpperCase();
  const language = String(body.language || "es").trim();

  if (!question || question.length > MAX_QUESTION_CHARS_V1) {
    throw new IrisAiUserRouteErrorV1("Pregunta inválida.");
  }

  if (
    !userId ||
    userId.length > MAX_USER_ID_CHARS_V1 ||
    !USER_ID_PATTERN_V1.test(userId)
  ) {
    throw new IrisAiUserRouteErrorV1("Identidad local inválida.");
  }

  if (!COUNTRY_PATTERN_V1.test(country)) {
    throw new IrisAiUserRouteErrorV1("País inválido.");
  }

  if (!LANGUAGE_PATTERN_V1.test(language)) {
    throw new IrisAiUserRouteErrorV1("Idioma inválido.");
  }

  return Object.freeze({ question, userId, country, language });
}

function hashScopeV1(prefix, value, hashImpl = crypto.createHash) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new IrisAiUserRouteErrorV1("Scope inválido.");
  }

  const digest = hashImpl("sha256")
    .update(normalized, "utf8")
    .digest("hex");

  return `${prefix}:${digest.slice(0, 32)}`;
}

function sanitizeResultV1(result) {
  if (!result || typeof result !== "object") {
    return Object.freeze({
      ok: false,
      status: "fallback",
      reason: "runtime_unavailable"
    });
  }

  if (result.status !== "ok") {
    return Object.freeze({
      ok: false,
      status: "fallback",
      reason: String(result.reason || "insufficient")
    });
  }

  const classification = String(result.classification || "");
  const answer = typeof result.answer === "string"
    ? result.answer.trim()
    : "";
  const citations = Array.isArray(result.citations)
    ? result.citations.map(citation => ({
        documentKey: String(citation?.documentKey || ""),
        versionLabel: citation?.versionLabel == null
          ? null
          : String(citation.versionLabel),
        chunkIndex: Number(citation?.chunkIndex)
      }))
    : [];

  if (!answer || !classification) {
    return Object.freeze({
      ok: false,
      status: "fallback",
      reason: "invalid_runtime_result"
    });
  }

  return Object.freeze({
    ok: true,
    status: "ok",
    classification,
    answer,
    citations
  });
}

function createIrisAiUserRouteV1({
  runtime,
  env = process.env,
  logError = () => {},
  hashImpl = crypto.createHash
} = {}) {
  if (typeof logError !== "function") {
    throw new TypeError("logError debe ser una función.");
  }

  const routeEnabled = enabledFlagV1(env?.IRIS_AI_USER_ROUTE_ENABLED);

  return async function irisAiUserRouteV1(req, res) {
    if (!routeEnabled) {
      return res.status(404).json({
        ok: false,
        error: "Ruta no disponible."
      });
    }

    if (
      runtime?.status?.enabled !== true ||
      !runtime.orchestrator ||
      typeof runtime.orchestrator.answerQuestion !== "function"
    ) {
      return res.status(503).json({
        ok: false,
        error: "Iris no disponible."
      });
    }

    let input;
    try {
      input = normalizeRequestV1(req?.body || {});
    } catch (error) {
      const status = Number(error?.status) || 400;
      return res.status(status).json({
        ok: false,
        error: "Solicitud inválida."
      });
    }

    try {
      const result = await runtime.orchestrator.answerQuestion({
        question: input.question,
        language: input.language,
        country: input.country,
        userScope: hashScopeV1("iris_user", input.userId, hashImpl),
        deviceScope: hashScopeV1(
          "iris_device",
          String(req?.ip || "unknown"),
          hashImpl
        ),
        now: new Date()
      });

      return res.status(200).json(sanitizeResultV1(result));
    } catch (error) {
      logError({
        operation: "iris_ai_user_route_v1",
        errorName: String(error?.name || "Error")
      });

      return res.status(503).json({
        ok: false,
        error: "Iris no disponible."
      });
    }
  };
}

module.exports = {
  COUNTRY_PATTERN_V1,
  IrisAiUserRouteErrorV1,
  LANGUAGE_PATTERN_V1,
  MAX_QUESTION_CHARS_V1,
  MAX_USER_ID_CHARS_V1,
  USER_ID_PATTERN_V1,
  createIrisAiUserRouteV1,
  enabledFlagV1,
  hashScopeV1,
  normalizeRequestV1,
  sanitizeResultV1
};
