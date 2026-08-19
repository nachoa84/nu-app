"use strict";

const MAX_PROVIDER_ANSWER_CHARS_V1 = 2000;
const MAX_PROVIDER_CITATIONS_V1 = 5;
const DEFAULT_OPERATION_TIMEOUT_MS_V1 = 5000;

const PROMPT_INJECTION_PATTERNS_V1 = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /ignora\s+(todas\s+)?las\s+instrucciones\s+anteriores/i,
  /system\s+prompt/i,
  /prompt\s+del\s+sistema/i,
  /developer\s+message/i,
  /mensaje\s+del\s+desarrollador/i,
  /reveal\s+(your\s+)?secrets?/i,
  /revela\s+(tus\s+)?secretos?/i
];

function containsPromptInjectionV1(value) {
  const text = String(value || "");
  return PROMPT_INJECTION_PATTERNS_V1.some(pattern => pattern.test(text));
}

function sanitizeRetrievedContentV1(value) {
  return String(value || "")
    .split(/\r?\n/)
    .filter(line => !containsPromptInjectionV1(line))
    .join("\n")
    .trim();
}

function withTimeoutV1(operation, {
  timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS_V1,
  controller = new AbortController()
} = {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error("iris_operation_timeout");
      error.code = "IRIS_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([
    Promise.resolve().then(() => operation(controller.signal)),
    timeout
  ]).finally(() => clearTimeout(timer));
}

function validateStrictProviderResultV1(result, context, citationKey) {
  if (!result || result.status !== "ok") return null;
  if (typeof result.answer !== "string") return null;

  const answer = result.answer.trim();
  if (!answer || answer.length > MAX_PROVIDER_ANSWER_CHARS_V1) return null;

  if (!Array.isArray(result.citations) || result.citations.length === 0) return null;
  if (result.citations.length > MAX_PROVIDER_CITATIONS_V1) return null;

  const allowed = new Set(context.map(citationKey));
  const seen = new Set();
  const citations = [];

  for (const citation of result.citations) {
    if (!citation) return null;
    const key = citationKey(citation);
    if (!allowed.has(key) || seen.has(key)) return null;
    seen.add(key);
    citations.push({
      documentKey: citation.documentKey,
      versionLabel: citation.versionLabel ?? null,
      chunkIndex: Number(citation.chunkIndex)
    });
  }

  return { status: "ok", answer, citations };
}

module.exports = {
  DEFAULT_OPERATION_TIMEOUT_MS_V1,
  MAX_PROVIDER_ANSWER_CHARS_V1,
  MAX_PROVIDER_CITATIONS_V1,
  containsPromptInjectionV1,
  sanitizeRetrievedContentV1,
  validateStrictProviderResultV1,
  withTimeoutV1
};
