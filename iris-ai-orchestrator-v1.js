"use strict";

const {
  assertIrisAiProviderV1,
  createNoopIrisAiProviderV1
} = require("./iris-ai-provider-v1");
const {
  prepareIrisRetrievalQueriesV1
} = require("./iris-retrieval-query-prep-v1");

const MAX_QUESTION_LENGTH_V1 = 500;
const MAX_FRAGMENTS_V1 = 5;
const MAX_FRAGMENT_CHARS_V1 = 2000;
const MAX_CONTEXT_CHARS_V1 = 6000;
const FALLBACK_ANSWER_V1 =
  "No tengo información autorizada suficiente para responder eso.";

class IrisAiOrchestratorErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiOrchestratorErrorV1";
  }
}

function deterministicFallbackV1(reason) {
  return {
    status: "fallback",
    reason,
    answer: FALLBACK_ANSWER_V1,
    citations: []
  };
}

function normalizeQuestionV1(value) {
  if (typeof value !== "string") {
    throw new IrisAiOrchestratorErrorV1(
      "question debe ser una cadena."
    );
  }

  const question = value.trim();
  if (!question) {
    throw new IrisAiOrchestratorErrorV1(
      "question no puede estar vacía."
    );
  }

  if (question.length > MAX_QUESTION_LENGTH_V1) {
    throw new IrisAiOrchestratorErrorV1(
      `question no puede superar ${MAX_QUESTION_LENGTH_V1} caracteres.`
    );
  }

  return question;
}

function minimalFragmentV1(fragment) {
  return {
    documentKey: fragment.documentKey,
    versionLabel: fragment.versionLabel ?? null,
    chunkIndex: Number(fragment.chunkIndex),
    title: fragment.title ?? null,
    content: String(fragment.content || "").slice(0, MAX_FRAGMENT_CHARS_V1)
  };
}

function buildMinimalContextV1(fragments) {
  const output = [];
  let totalChars = 0;

  for (const fragment of fragments.slice(0, MAX_FRAGMENTS_V1)) {
    const safe = minimalFragmentV1(fragment);
    const remaining = MAX_CONTEXT_CHARS_V1 - totalChars;
    if (remaining <= 0) break;

    if (safe.content.length > remaining) {
      safe.content = safe.content.slice(0, remaining);
    }

    totalChars += safe.content.length;
    output.push(safe);
  }

  return output;
}

function citationKeyV1(value) {
  return `${value.documentKey}:${value.versionLabel ?? ""}:${Number(value.chunkIndex)}`;
}

function validateProviderResultV1(result, context) {
  if (!result || result.status !== "ok") {
    return null;
  }

  if (typeof result.answer !== "string" || !result.answer.trim()) {
    return null;
  }

  if (!Array.isArray(result.citations) || result.citations.length === 0) {
    return null;
  }

  const allowed = new Set(context.map(citationKeyV1));
  const citations = result.citations.filter(citation =>
    citation && allowed.has(citationKeyV1(citation))
  );

  if (citations.length !== result.citations.length) {
    return null;
  }

  return {
    status: "ok",
    answer: result.answer.trim(),
    citations
  };
}

function createIrisAiOrchestratorV1({
  retrieveDocumentChunks,
  provider = createNoopIrisAiProviderV1(),
  env = process.env,
  prepareRetrievalQueries = prepareIrisRetrievalQueriesV1
} = {}) {
  if (typeof retrieveDocumentChunks !== "function") {
    throw new IrisAiOrchestratorErrorV1(
      "Se requiere retrieveDocumentChunks."
    );
  }

  if (typeof prepareRetrievalQueries !== "function") {
    throw new IrisAiOrchestratorErrorV1(
      "Se requiere prepareRetrievalQueries."
    );
  }

  assertIrisAiProviderV1(provider);

  async function answerQuestion({
    question,
    language,
    country,
    category = null,
    productSlug = null
  } = {}) {
    const normalizedQuestion = normalizeQuestionV1(question);

    if (env?.IRIS_AI_ENABLED !== "true") {
      return deterministicFallbackV1("ai_disabled");
    }

    let fragments = [];
    try {
      const queries = prepareRetrievalQueries({
        question: normalizedQuestion,
        productSlug
      });

      for (const query of queries) {
        const candidateFragments = await retrieveDocumentChunks({
          query,
          language,
          country,
          category,
          productSlug,
          limit: MAX_FRAGMENTS_V1
        });

        if (Array.isArray(candidateFragments) && candidateFragments.length > 0) {
          fragments = candidateFragments;
          break;
        }
      }
    } catch {
      return deterministicFallbackV1("retrieval_error");
    }

    if (!Array.isArray(fragments) || fragments.length === 0) {
      return deterministicFallbackV1("no_authorized_context");
    }

    const context = buildMinimalContextV1(fragments);
    if (context.length === 0 || context.every(item => !item.content)) {
      return deterministicFallbackV1("no_authorized_context");
    }

    let providerResult;
    try {
      providerResult = await provider.generate({
        question: normalizedQuestion,
        fragments: context
      });
    } catch {
      return deterministicFallbackV1("provider_error");
    }

    return validateProviderResultV1(providerResult, context) ||
      deterministicFallbackV1("provider_unusable");
  }

  return {
    answerQuestion
  };
}

module.exports = {
  FALLBACK_ANSWER_V1,
  MAX_CONTEXT_CHARS_V1,
  MAX_FRAGMENT_CHARS_V1,
  MAX_FRAGMENTS_V1,
  MAX_QUESTION_LENGTH_V1,
  IrisAiOrchestratorErrorV1,
  buildMinimalContextV1,
  createIrisAiOrchestratorV1,
  deterministicFallbackV1,
  validateProviderResultV1
};
