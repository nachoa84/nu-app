"use strict";

const {
  assertIrisAiProviderV1,
  createNoopIrisAiProviderV1
} = require("./iris-ai-provider-v1");
const {
  createEphemeralFragmentRefsV1
} = require("./iris-ai-policy-engine-v1");
const {
  prepareIrisRetrievalQueriesV1
} = require("./iris-retrieval-query-prep-v1");
const {
  DEFAULT_OPERATION_TIMEOUT_MS_V1,
  MAX_PROVIDER_ANSWER_CHARS_V1,
  MAX_PROVIDER_CITATIONS_V1,
  containsPromptInjectionV1,
  sanitizeRetrievedContentV1,
  validateStrictProviderResultV1,
  withTimeoutV1
} = require("./iris-ai-hardening-v1");

const MAX_QUESTION_LENGTH_V1 = 500;
const MAX_FRAGMENTS_V1 = 5;
const MAX_FRAGMENT_CHARS_V1 = 2000;
const MAX_CONTEXT_CHARS_V1 = 6000;
const FALLBACK_ANSWER_V1 = "No tengo información autorizada suficiente para responder eso.";

class IrisAiOrchestratorErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiOrchestratorErrorV1";
  }
}

function deterministicFallbackV1(reason) {
  return { status: "fallback", reason, answer: FALLBACK_ANSWER_V1, citations: [] };
}

function normalizeQuestionV1(value) {
  if (typeof value !== "string") throw new IrisAiOrchestratorErrorV1("question debe ser una cadena.");
  const question = value.trim();
  if (!question) throw new IrisAiOrchestratorErrorV1("question no puede estar vacía.");
  if (question.length > MAX_QUESTION_LENGTH_V1) throw new IrisAiOrchestratorErrorV1(`question no puede superar ${MAX_QUESTION_LENGTH_V1} caracteres.`);
  return question;
}

function minimalFragmentV1(fragment) {
  return {
    documentKey: fragment.documentKey,
    versionLabel: fragment.versionLabel ?? null,
    chunkIndex: Number(fragment.chunkIndex),
    title: fragment.title ?? null,
    content: sanitizeRetrievedContentV1(fragment.content).slice(0, MAX_FRAGMENT_CHARS_V1)
  };
}

function buildMinimalContextV1(fragments) {
  const output = [];
  let totalChars = 0;
  for (const fragment of fragments.slice(0, MAX_FRAGMENTS_V1)) {
    const safe = minimalFragmentV1(fragment);
    const remaining = MAX_CONTEXT_CHARS_V1 - totalChars;
    if (remaining <= 0) break;
    if (safe.content.length > remaining) safe.content = safe.content.slice(0, remaining);
    totalChars += safe.content.length;
    output.push(safe);
  }
  return output;
}

function citationKeyV1(value) {
  return `${value.documentKey}:${value.versionLabel ?? ""}:${Number(value.chunkIndex)}`;
}

function validateProviderResultV1(result, context) {
  return validateStrictProviderResultV1(result, context, citationKeyV1);
}

function validateEphemeralProviderResultV1(result, providerFragments, internalMap) {
  if (!result || result.status !== "ok" || typeof result.answer !== "string") return null;
  const answer = result.answer.trim();
  if (!answer || answer.length > MAX_PROVIDER_ANSWER_CHARS_V1) return null;
  if (!Array.isArray(result.citations) || result.citations.length === 0 || result.citations.length > MAX_PROVIDER_CITATIONS_V1) return null;
  const allowedRefs = new Set(providerFragments.map(fragment => fragment.ref));
  const seen = new Set();
  const citations = [];
  for (const citation of result.citations) {
    if (!citation || typeof citation !== "object") return null;
    if (Object.keys(citation).some(key => key !== "ref")) return null;
    const ref = String(citation.ref || "");
    if (!allowedRefs.has(ref) || seen.has(ref)) return null;
    const internal = internalMap.get(ref);
    if (!internal) return null;
    seen.add(ref);
    citations.push({ documentKey: internal.documentKey, versionLabel: internal.versionLabel ?? null, chunkIndex: Number(internal.chunkIndex) });
  }
  return { status: "ok", answer, citations };
}

function conservativeRetrievalAssessmentV1(context) {
  return {
    authorized: Array.isArray(context) && context.length > 0,
    fragmentCount: Array.isArray(context) ? context.length : 0,
    scopeMatch: true,
    termCoverage: "medium",
    directAnswer: false,
    hasContradiction: false
  };
}

function assertPolicyRuntimeV1(policyRuntime) {
  if (!policyRuntime) return null;
  for (const method of ["beginQuestion", "decideLocal", "authorizeProviderCall", "completeProviderCall", "recordResponse"]) {
    if (typeof policyRuntime[method] !== "function") throw new IrisAiOrchestratorErrorV1(`policyRuntime.${method} requerido.`);
  }
  return policyRuntime;
}

function assertLocalResponseEngineV1(localResponseEngine, runtime) {
  if (!localResponseEngine) return null;
  if (!runtime) throw new IrisAiOrchestratorErrorV1("localResponseEngine requiere policyRuntime.");
  for (const method of ["resolveBeforeRetrieval", "resolveAfterRetrieval"]) {
    if (typeof localResponseEngine[method] !== "function") throw new IrisAiOrchestratorErrorV1(`localResponseEngine.${method} requerido.`);
  }
  return localResponseEngine;
}

function localOkV1(candidate) {
  return {
    status: "ok",
    classification: candidate.classification,
    answer: candidate.answer,
    citations: candidate.citations
  };
}

function normalizeResolvedScopeV1(scope, input) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return null;

  const country = String(scope.country || "").trim().toUpperCase();
  const category = String(scope.category || "").trim();
  const productSlug = String(scope.productSlug || "").trim();
  const inputCountry = String(input.country || "").trim().toUpperCase();

  if (!country || country !== inputCountry || !category || !productSlug) {
    return null;
  }

  if (input.category != null && String(input.category) !== category) {
    return null;
  }

  if (input.productSlug != null && String(input.productSlug) !== productSlug) {
    return null;
  }

  return Object.freeze({ country, category, productSlug });
}

function createIrisAiOrchestratorV1({
  retrieveDocumentChunks,
  provider = createNoopIrisAiProviderV1(),
  env = process.env,
  prepareRetrievalQueries = prepareIrisRetrievalQueriesV1,
  timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS_V1,
  policyRuntime = null,
  localResponseEngine = null,
  resolveRetrievalScope = null
} = {}) {
  if (typeof retrieveDocumentChunks !== "function") throw new IrisAiOrchestratorErrorV1("Se requiere retrieveDocumentChunks.");
  if (typeof prepareRetrievalQueries !== "function") throw new IrisAiOrchestratorErrorV1("Se requiere prepareRetrievalQueries.");
  if (resolveRetrievalScope != null && typeof resolveRetrievalScope !== "function") {
    throw new IrisAiOrchestratorErrorV1("resolveRetrievalScope inválido.");
  }
  assertIrisAiProviderV1(provider);
  const runtime = assertPolicyRuntimeV1(policyRuntime);
  const localEngine = assertLocalResponseEngineV1(localResponseEngine, runtime);

  async function answerQuestion({ question, language, country, category = null, productSlug = null, userScope = null, deviceScope = null, now = new Date() } = {}) {
    const normalizedQuestion = normalizeQuestionV1(question);
    let runtimeStarted = false;
    let totalQuestionsInPeriod = 0;

    async function fallback(reason) {
      if (runtimeStarted) await runtime.recordResponse("insufficient");
      return deterministicFallbackV1(reason);
    }

    if (env?.IRIS_AI_ENABLED !== "true") return deterministicFallbackV1("ai_disabled");
    if (containsPromptInjectionV1(normalizedQuestion)) return deterministicFallbackV1("unsafe_input");

    if (runtime) {
      let start;
      try {
        start = await runtime.beginQuestion({ userScope, deviceScope, now });
      } catch {
        return deterministicFallbackV1("policy_runtime_error");
      }
      if (!start?.allowed) return deterministicFallbackV1(start?.reason || "policy_runtime_blocked");
      runtimeStarted = true;
      totalQuestionsInPeriod = start.totalQuestionsInPeriod;
    }

    const localInput = { question: normalizedQuestion, language, country, category, productSlug, now };
    if (localEngine) {
      try {
        const local = await withTimeoutV1(
          () => localEngine.resolveBeforeRetrieval(localInput),
          { timeoutMs }
        );
        const decision = runtime.decideLocal({ deterministicMatch: local.deterministic, verifiedCacheMatch: local.verifiedCache });
        if (decision.decision === "deterministic" && local.deterministic) {
          await runtime.recordResponse("deterministic");
          return localOkV1(local.deterministic);
        }
        if (decision.decision === "verified_cache" && local.verifiedCache) {
          await runtime.recordResponse("verified_cache");
          return localOkV1(local.verifiedCache);
        }
      } catch (error) {
        return fallback(error?.code === "IRIS_TIMEOUT" ? "local_response_timeout" : "local_response_error");
      }
    }

    let retrievalInput = localInput;
    if (resolveRetrievalScope) {
      let resolvedScope;
      try {
        resolvedScope = await withTimeoutV1(
          () => resolveRetrievalScope(localInput),
          { timeoutMs }
        );
      } catch (error) {
        return fallback(error?.code === "IRIS_TIMEOUT" ? "scope_resolution_timeout" : "scope_resolution_error");
      }

      const scope = normalizeResolvedScopeV1(resolvedScope, localInput);
      if (!scope) return fallback("scope_unresolved");

      retrievalInput = {
        ...localInput,
        country: scope.country,
        category: scope.category,
        productSlug: scope.productSlug
      };
    }

    let fragments = [];
    try {
      const queries = prepareRetrievalQueries({
        question: normalizedQuestion,
        productSlug: retrievalInput.productSlug
      });
      for (const query of queries) {
        const candidateFragments = await withTimeoutV1(
          () => retrieveDocumentChunks({
            query,
            language: retrievalInput.language,
            country: retrievalInput.country,
            category: retrievalInput.category,
            productSlug: retrievalInput.productSlug,
            limit: MAX_FRAGMENTS_V1
          }),
          { timeoutMs }
        );
        if (Array.isArray(candidateFragments) && candidateFragments.length > 0) {
          fragments = candidateFragments;
          break;
        }
      }
    } catch (error) {
      return fallback(error?.code === "IRIS_TIMEOUT" ? "retrieval_timeout" : "retrieval_error");
    }

    if (!Array.isArray(fragments) || fragments.length === 0) return fallback("no_authorized_context");
    const context = buildMinimalContextV1(fragments);
    if (context.length === 0 || context.every(item => !item.content)) return fallback("no_authorized_context");

    let retrievalAssessment = conservativeRetrievalAssessmentV1(context);
    if (localEngine) {
      try {
        const local = await withTimeoutV1(
          () => localEngine.resolveAfterRetrieval({ ...retrievalInput, context }),
          { timeoutMs }
        );
        retrievalAssessment = local.retrieval;
        const decision = runtime.decideLocal({ retrieval: retrievalAssessment });
        if (decision.decision === "direct_retrieval" && local.directRetrieval) {
          await runtime.recordResponse("direct_retrieval");
          return localOkV1(local.directRetrieval);
        }
      } catch (error) {
        return fallback(error?.code === "IRIS_TIMEOUT" ? "local_response_timeout" : "local_response_error");
      }
    }

    let reservationId = null;
    let providerFragments = context;
    let internalMap = null;

    if (runtime) {
      if (!provider.name || provider.name !== runtime.providerName) return fallback("provider_mismatch");
      let authorization;
      try {
        authorization = await runtime.authorizeProviderCall({ retrieval: retrievalAssessment, totalQuestionsInPeriod, now });
      } catch {
        return fallback("policy_runtime_error");
      }
      if (!authorization?.allowed || !authorization.reservationId) return fallback(authorization?.reason || "provider_blocked");
      reservationId = authorization.reservationId;
      const ephemeral = createEphemeralFragmentRefsV1(context);
      providerFragments = ephemeral.providerFragments;
      internalMap = ephemeral.internalMap;
    }

    let providerResult;
    let providerStarted = false;
    let providerOutcome = "ok";
    try {
      providerStarted = true;
      providerResult = await withTimeoutV1(signal => provider.generate({ question: normalizedQuestion, fragments: providerFragments, signal }), { timeoutMs });
    } catch (error) {
      providerOutcome = error?.status === 429 || error?.code === 429 || error?.code === "429" ? "429" : "error";
      if (runtime && reservationId) {
        try {
          await runtime.completeProviderCall({ reservationId, started: providerStarted, outcome: providerOutcome });
        } catch {
          return fallback("policy_runtime_error");
        }
      }
      return fallback(error?.code === "IRIS_TIMEOUT" ? "provider_timeout" : "provider_error");
    }

    if (runtime && reservationId) {
      try {
        await runtime.completeProviderCall({ reservationId, started: providerStarted, outcome: providerOutcome });
      } catch {
        return fallback("policy_runtime_error");
      }
    }

    const validated = runtime ? validateEphemeralProviderResultV1(providerResult, providerFragments, internalMap) : validateProviderResultV1(providerResult, context);
    if (!validated) return fallback("provider_unusable");
    if (runtimeStarted) await runtime.recordResponse("provider_assisted");
    return {
      ...validated,
      classification: "provider_assisted"
    };
  }

  return { answerQuestion };
}

module.exports = {
  FALLBACK_ANSWER_V1,
  MAX_CONTEXT_CHARS_V1,
  MAX_FRAGMENT_CHARS_V1,
  MAX_FRAGMENTS_V1,
  MAX_QUESTION_LENGTH_V1,
  IrisAiOrchestratorErrorV1,
  buildMinimalContextV1,
  conservativeRetrievalAssessmentV1,
  createIrisAiOrchestratorV1,
  deterministicFallbackV1,
  localOkV1,
  validateEphemeralProviderResultV1,
  validateProviderResultV1
};
