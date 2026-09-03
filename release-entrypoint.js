"use strict";

const path = require("node:path");

const INTERNAL_ROOT_FILES = new Set([
  "/server.js",
  "/release-entrypoint.js",
  "/package.json",
  "/package-lock.json",
  "/schema.sql",
  "/file-tree.txt",
  "/notification-delivery-v111.js",
  "/runtime-config-v113.js",
  "/http-cache-v114.js",
  "/shared-rate-limit-v115.js",
  "/qstash-notification-server-v1.js",
  "/analytics-basic-server-v1.js"
]);

const INTERNAL_DIRECTORIES = new Set([
  "tests",
  "scripts",
  "docs",
  "node_modules",
  "attached_assets",
  ".github",
  ".agents"
]);

const INTERNAL_EXTENSIONS = new Set([
  ".md",
  ".sql",
  ".txt",
  ".log",
  ".bak",
  ".backup",
  ".py",
  ".sh",
  ".tgz",
  ".zip",
  ".csv"
]);

function normalizedRequestPath(value) {
  return String(value || "")
    .split("?")[0]
    .replace(/\\/g, "/")
    .toLowerCase();
}

function isInternalServerModule(normalizedPath) {
  if (!normalizedPath.startsWith("/")) return false;
  if (normalizedPath.includes("/", 1)) return false;

  const basename = normalizedPath.slice(1);

  if (
    basename.startsWith("pilot-") ||
    basename.startsWith("iris-document-")
  ) {
    return true;
  }

  if (
    basename.startsWith("iris-ai-") &&
    basename !== "iris-ai-client-escalation-v1.js"
  ) {
    return true;
  }

  return false;
}

function isBlockedReleasePublicPath(requestPath) {
  const normalizedPath = normalizedRequestPath(requestPath);
  const segments = normalizedPath.split("/").filter(Boolean);
  const extension = path.posix.extname(normalizedPath);

  if (INTERNAL_ROOT_FILES.has(normalizedPath)) return true;
  if (INTERNAL_EXTENSIONS.has(extension)) return true;
  if (segments.some(segment => INTERNAL_DIRECTORIES.has(segment))) return true;
  if (isInternalServerModule(normalizedPath)) return true;

  return false;
}

function installStaticReleaseGuard(expressModule) {
  if (!expressModule || typeof expressModule.static !== "function") {
    throw new Error("Express static no disponible para release guard.");
  }

  if (expressModule.static.__nuReleaseGuardInstalled === true) {
    return;
  }

  const originalStatic = expressModule.static;

  function guardedStatic(...args) {
    const staticMiddleware = originalStatic(...args);

    return function releaseGuardedStatic(req, res, next) {
      if (isBlockedReleasePublicPath(req?.path || req?.url || "")) {
        return res.status(404).end();
      }

      return staticMiddleware(req, res, next);
    };
  }

  guardedStatic.__nuReleaseGuardInstalled = true;
  guardedStatic.__nuOriginalStatic = originalStatic;
  expressModule.static = guardedStatic;
}

function trueFlag(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function isPublishedEnvironment(env = process.env) {
  return (
    String(env.REPLIT_DEPLOYMENT || "").trim() === "1" ||
    String(env.NODE_ENV || "").trim().toLowerCase() === "production"
  );
}

function assertSafeProductionEnvironment(env = process.env) {
  if (!isPublishedEnvironment(env)) {
    return;
  }

  if (!String(env.DATABASE_URL || "").trim()) {
    throw new Error("Production requiere DATABASE_URL.");
  }

  const forbiddenTrueFlags = [
    "ENABLE_ADMIN_TEST_ROUTES",
    "ENABLE_DEMO_ROUTES",
    "IRIS_AI_CONTROLLED_EXECUTION",
    "PILOT_ENABLED",
    "PILOT_ADMIN_ROUTES_ENABLED",
    "IRIS_AI_PILOT_ENABLED"
  ];

  const enabledUnsafe = forbiddenTrueFlags.filter(name => trueFlag(env[name]));
  if (enabledUnsafe.length) {
    throw new Error(
      `Configuración insegura para Production: ${enabledUnsafe.join(", ")}`
    );
  }

  if (
    String(env.IRIS_AI_TEST_ENVIRONMENT || "").trim().toLowerCase() ===
    "development"
  ) {
    throw new Error("IRIS_AI_TEST_ENVIRONMENT=development no está permitido en Production.");
  }
}

async function waitForHealthyBackend({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30000,
  intervalMs = 1500
} = {}) {
  if (!isPublishedEnvironment(env)) {
    return true;
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch no disponible para verificar /api/health.");
  }

  const port = Number(env.PORT || 3000);
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/api/health`, {
        cache: "no-store"
      });

      if (response && response.ok) {
        return true;
      }

      lastError = new Error(`Health check HTTP ${response?.status || "unknown"}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Backend no saludable en Production: ${String(lastError?.message || "health check falló")}`
  );
}

async function boot() {
  assertSafeProductionEnvironment(process.env);

  const express = require("express");
  installStaticReleaseGuard(express);

  require("./server");

  if (isPublishedEnvironment(process.env)) {
    try {
      await waitForHealthyBackend();
      console.log("Production health gate: OK");
    } catch (error) {
      console.error("Production health gate: FAILED", error.message);
      process.exitCode = 1;
      setTimeout(() => process.exit(1), 50).unref();
    }
  }
}

if (require.main === module) {
  boot().catch(error => {
    console.error("No se pudo iniciar Nu App:", error.message);
    process.exit(1);
  });
}

module.exports = {
  assertSafeProductionEnvironment,
  installStaticReleaseGuard,
  isBlockedReleasePublicPath,
  isPublishedEnvironment,
  normalizedRequestPath,
  trueFlag,
  waitForHealthyBackend
};
