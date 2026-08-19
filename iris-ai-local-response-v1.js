"use strict";

const MAX_LOCAL_ANSWER_CHARS_V1 = 2000;
const MAX_LOCAL_CITATIONS_V1 = 5;

class IrisAiLocalResponseErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisAiLocalResponseErrorV1";
  }
}

function safeAnswerV1(value) {
  if (typeof value !== "string") return null;
  const answer = value.trim();
  if (!answer || answer.length > MAX_LOCAL_ANSWER_CHARS_V1) return null;
  return answer;
}

function safeCitationsV1(citations = []) {
  if (!Array.isArray(citations) || citations.length > MAX_LOCAL_CITATIONS_V1) return null;
  const output = [];
  const seen = new Set();
  for (const citation of citations) {
    if (!citation || typeof citation !== "object") return null;
    const allowedKeys = ["documentKey", "versionLabel", "chunkIndex"];
    if (Object.keys(citation).some(key => !allowedKeys.includes(key))) return null;
    const documentKey = String(citation.documentKey || "").trim();
    const chunkIndex = Number(citation.chunkIndex);
    if (!documentKey || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0) return null;
    const versionLabel = citation.versionLabel == null ? null : String(citation.versionLabel);
    const key = `${documentKey}:${versionLabel ?? ""}:${chunkIndex}`;
    if (seen.has(key)) return null;
    seen.add(key);
    output.push({ documentKey, versionLabel, chunkIndex });
  }
  return output;
}

function validateCandidateV1(candidate, classification, {
  requireValid = false,
  requireSourceVerified = false
} = {}) {
  if (!candidate || typeof candidate !== "object") return null;
  if (candidate.usable !== true) return null;
  if (requireValid && candidate.valid !== true) return null;
  if (requireSourceVerified && candidate.sourceVerified !== true) return null;
  const answer = safeAnswerV1(candidate.answer);
  const citations = safeCitationsV1(candidate.citations || []);
  if (!answer || !citations) return null;
  return Object.freeze({
    classification,
    answer,
    citations,
    usable: true,
    valid: requireValid ? true : candidate.valid === true,
    sourceVerified: requireSourceVerified ? true : candidate.sourceVerified === true
  });
}

function defaultRetrievalAssessmentV1(context) {
  return {
    authorized: Array.isArray(context) && context.length > 0,
    fragmentCount: Array.isArray(context) ? context.length : 0,
    scopeMatch: false,
    termCoverage: "low",
    directAnswer: false,
    hasContradiction: false
  };
}

function extractDirectRetrievalV1(context, assessment) {
  if (!Array.isArray(context) || context.length !== 1) return null;
  if (!assessment || assessment.directAnswer !== true || assessment.scopeMatch !== true || assessment.termCoverage !== "high" || assessment.hasContradiction === true) {
    return null;
  }
  const fragment = context[0];
  const answer = safeAnswerV1(fragment?.content);
  if (!answer) return null;
  const citations = safeCitationsV1([{
    documentKey: fragment.documentKey,
    versionLabel: fragment.versionLabel ?? null,
    chunkIndex: Number(fragment.chunkIndex)
  }]);
  if (!citations) return null;
  return Object.freeze({ classification: "direct_retrieval", answer, citations, usable: true });
}

function createIrisAiLocalResponseEngineV1({
  deterministicResolver = null,
  verifiedCacheResolver = null,
  retrievalAssessor = defaultRetrievalAssessmentV1
} = {}) {
  for (const [label, fn] of [["deterministicResolver", deterministicResolver], ["verifiedCacheResolver", verifiedCacheResolver]]) {
    if (fn != null && typeof fn !== "function") {
      throw new IrisAiLocalResponseErrorV1(`${label} inválido.`);
    }
  }
  if (typeof retrievalAssessor !== "function") {
    throw new IrisAiLocalResponseErrorV1("retrievalAssessor inválido.");
  }

  async function resolveBeforeRetrieval(input) {
    const deterministicRaw = deterministicResolver ? await deterministicResolver(input) : null;
    const deterministic = validateCandidateV1(deterministicRaw, "deterministic");
    if (deterministic) return Object.freeze({ deterministic, verifiedCache: null });

    const cacheRaw = verifiedCacheResolver ? await verifiedCacheResolver(input) : null;
    const verifiedCache = validateCandidateV1(cacheRaw, "verified_cache", {
      requireValid: true,
      requireSourceVerified: true
    });
    return Object.freeze({ deterministic: null, verifiedCache });
  }

  async function resolveAfterRetrieval(input = {}) {
    const assessment = await retrievalAssessor(input.context || [], input);
    const retrieval = Object.freeze({
      authorized: assessment?.authorized === true,
      fragmentCount: Number(assessment?.fragmentCount) || 0,
      scopeMatch: assessment?.scopeMatch === true,
      termCoverage: ["low", "medium", "high"].includes(assessment?.termCoverage) ? assessment.termCoverage : "low",
      directAnswer: assessment?.directAnswer === true,
      hasContradiction: assessment?.hasContradiction === true
    });
    const directRetrieval = extractDirectRetrievalV1(input.context || [], retrieval);
    return Object.freeze({ retrieval, directRetrieval });
  }

  return Object.freeze({ resolveBeforeRetrieval, resolveAfterRetrieval });
}

module.exports = {
  MAX_LOCAL_ANSWER_CHARS_V1,
  MAX_LOCAL_CITATIONS_V1,
  IrisAiLocalResponseErrorV1,
  createIrisAiLocalResponseEngineV1,
  defaultRetrievalAssessmentV1,
  extractDirectRetrievalV1,
  validateCandidateV1
};
