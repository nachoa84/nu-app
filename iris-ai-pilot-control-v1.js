"use strict";

const crypto = require("node:crypto");

const HASH_PATTERN_V1 = /^[a-f0-9]{64}$/;
const MAX_PERCENT_V1 = 100;
const BUCKETS_V1 = 10000;

function enabledFlagV1(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function emergencyStopV1(value) {
  return String(value == null ? "true" : value)
    .trim()
    .toLowerCase() !== "false";
}

function parsePercentV1(value) {
  const raw = String(value == null ? "0" : value).trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_PERCENT_V1) {
    return null;
  }
  return parsed;
}

function parseHashedAllowlistV1(value) {
  if (value == null || String(value).trim() === "") return new Set();
  const entries = String(value)
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);

  if (entries.some(item => !HASH_PATTERN_V1.test(item))) return null;
  return new Set(entries);
}

function sha256HexV1(value, hashImpl = crypto.createHash) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return hashImpl("sha256").update(normalized, "utf8").digest("hex");
}

function stableBucketV1(hash) {
  if (!HASH_PATTERN_V1.test(String(hash || ""))) return null;
  return Number.parseInt(hash.slice(0, 8), 16) % BUCKETS_V1;
}

function createIrisAiPilotControlV1({
  env = process.env,
  hashImpl = crypto.createHash
} = {}) {
  const enabled = enabledFlagV1(env?.IRIS_AI_PILOT_ENABLED);
  const emergencyStop = emergencyStopV1(env?.IRIS_AI_PILOT_EMERGENCY_STOP);
  const percent = parsePercentV1(env?.IRIS_AI_PILOT_PERCENT);
  const allowlist = parseHashedAllowlistV1(env?.IRIS_AI_PILOT_ALLOWLIST_SHA256);
  const configValid = percent != null && allowlist != null;

  function isEligible(userId) {
    if (!enabled) return false;
    if (emergencyStop) return false;
    if (!configValid) return false;

    const userHash = sha256HexV1(userId, hashImpl);
    if (!userHash) return false;
    if (allowlist.has(userHash)) return true;

    const bucket = stableBucketV1(userHash);
    if (bucket == null) return false;
    return bucket < percent * 100;
  }

  return Object.freeze({
    status: Object.freeze({
      enabled,
      emergencyStop,
      configValid,
      percent,
      allowlistCount: allowlist?.size ?? 0
    }),
    isEligible
  });
}

module.exports = {
  BUCKETS_V1,
  HASH_PATTERN_V1,
  MAX_PERCENT_V1,
  createIrisAiPilotControlV1,
  emergencyStopV1,
  enabledFlagV1,
  parseHashedAllowlistV1,
  parsePercentV1,
  sha256HexV1,
  stableBucketV1
};
