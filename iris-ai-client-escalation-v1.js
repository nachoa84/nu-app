"use strict";

(function irisAiClientEscalationModuleV1(root) {
  const COUNTRY_CODES_V1 = Object.freeze({
    "argentina": "AR",
    "mexico": "MX",
    "españa": "ES",
    "espana": "ES",
    "chile": "CL",
    "colombia": "CO",
    "perú": "PE",
    "peru": "PE",
    "estados unidos": "US",
    "canadá": "CA",
    "canada": "CA",
    "uruguay": "UY",
    "paraguay": "PY",
    "bolivia": "BO",
    "ecuador": "EC",
    "costa rica": "CR",
    "panamá": "PA",
    "panama": "PA",
    "república dominicana": "DO",
    "republica dominicana": "DO"
  });

  function normalizeCountryKeyV1(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  function countryCodeV1(value) {
    const raw = String(value || "").trim();
    if (/^[A-Z]{2}$/.test(raw)) return raw;
    return COUNTRY_CODES_V1[normalizeCountryKeyV1(raw)] || null;
  }

  function isClientEnabledV1(globalObject = root) {
    return globalObject?.NU_IRIS_AI_ESCALATION_ENABLED === true;
  }

  function isDeterministicMissV1(response) {
    if (!response || typeof response !== "object") return false;
    if (response.topicId != null) return false;
    const blocks = Array.isArray(response.blocks) ? response.blocks : [];
    if (blocks.length !== 1 || blocks[0]?.type !== "text") return false;

    const text = String(blocks[0]?.content || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    return text.includes("no encontre todavia contenido cargado");
  }

  function toBotResponseV1(payload) {
    if (
      !payload ||
      payload.ok !== true ||
      payload.status !== "ok" ||
      typeof payload.answer !== "string" ||
      !payload.answer.trim()
    ) {
      return null;
    }

    return {
      topicId: null,
      topicTitle: "",
      blocks: [{
        type: "text",
        content: payload.answer.trim()
      }]
    };
  }

  async function tryIrisAiBotEscalationV1({
    question,
    deterministicResponse,
    profile,
    fetchImpl = root?.fetch?.bind(root),
    globalObject = root
  } = {}) {
    if (!isClientEnabledV1(globalObject)) return null;
    if (!isDeterministicMissV1(deterministicResponse)) return null;
    if (typeof fetchImpl !== "function") return null;

    const userId = String(profile?.userId || "").trim();
    const country = countryCodeV1(profile?.country);
    const normalizedQuestion = String(question || "").trim();

    if (!userId || !country || !normalizedQuestion) return null;

    try {
      const response = await fetchImpl("/api/iris-ai/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: normalizedQuestion,
          userId,
          country,
          language: "es"
        })
      });

      if (!response?.ok) return null;
      const payload = await response.json().catch(() => null);
      return toBotResponseV1(payload);
    } catch (_) {
      return null;
    }
  }

  const api = Object.freeze({
    COUNTRY_CODES_V1,
    countryCodeV1,
    isClientEnabledV1,
    isDeterministicMissV1,
    normalizeCountryKeyV1,
    toBotResponseV1,
    tryIrisAiBotEscalationV1
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root && typeof root === "object") {
    root.IrisAiClientEscalationV1 = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
