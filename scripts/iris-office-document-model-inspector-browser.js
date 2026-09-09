/*
 * Iris Office Virtual Document Model Inspector v0
 *
 * Objetivo:
 * - inspeccionar el modelo Angular ya cargado detrás de la pantalla Documents;
 * - recuperar metadatos de tarjetas/documentos sin crear requests nuevos;
 * - NO leer cookies, storage, credenciales, headers de autorización ni formularios.
 *
 * Uso:
 *   irisOfficeDocumentModelInspect()
 */
(() => {
  "use strict";

  const VERSION = "iris-office-document-model-inspector-v0";
  const MAX_DEPTH = 4;
  const MAX_ARRAY = 5000;
  const MAX_STRING = 4000;
  const SENSITIVE_KEY_RE = /^(ticket|token|access[_-]?token|auth|authorization|session|sessionid|sid|password|passwd|secret|credential|api[_-]?key)$/i;
  const DOCUMENT_HINT_RE = /(document|doc|file|pdf|title|name|market|language|category|url|href|path|download|asset|content|id)/i;

  function normalize(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/[\t\r ]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function sanitizeUrl(raw) {
    if (!raw || typeof raw !== "string") return raw;
    try {
      const u = new URL(raw, window.location.href);
      u.username = "";
      u.password = "";
      for (const key of [...u.searchParams.keys()]) {
        if (SENSITIVE_KEY_RE.test(key)) u.searchParams.set(key, "[REDACTED]");
      }
      return u.href;
    } catch {
      return raw.length > MAX_STRING ? raw.slice(0, MAX_STRING) : raw;
    }
  }

  function safeClone(value, depth = 0, seen = new WeakSet()) {
    if (value == null || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "string") {
      const trimmed = value.length > MAX_STRING ? value.slice(0, MAX_STRING) + "…" : value;
      return /^(https?:)?\/\//i.test(trimmed) ? sanitizeUrl(trimmed) : trimmed;
    }
    if (typeof value === "function" || typeof value === "symbol") return undefined;
    if (depth >= MAX_DEPTH) return "[MAX_DEPTH]";
    if (typeof value !== "object") return String(value);
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);

    if (Array.isArray(value)) {
      return value.slice(0, MAX_ARRAY).map(v => safeClone(v, depth + 1, seen)).filter(v => v !== undefined);
    }

    const out = {};
    for (const key of Object.keys(value).slice(0, 300)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      let child;
      try { child = value[key]; } catch { continue; }
      const cloned = safeClone(child, depth + 1, seen);
      if (cloned !== undefined) out[key] = cloned;
    }
    return out;
  }

  function domPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 9) {
      let part = node.tagName.toLowerCase();
      if (node.id) { part += `#${node.id}`; parts.unshift(part); break; }
      const classes = [...node.classList].slice(0, 3);
      if (classes.length) part += "." + classes.join(".");
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter(x => x.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }

  function getAngular() {
    return window.angular && typeof window.angular.element === "function" ? window.angular : null;
  }

  function scopeFor(el, angular) {
    try {
      const wrapped = angular.element(el);
      return wrapped.scope?.() || wrapped.isolateScope?.() || null;
    } catch {
      return null;
    }
  }

  function candidateKeys(scope) {
    if (!scope || typeof scope !== "object") return [];
    return Object.keys(scope)
      .filter(k => !k.startsWith("$") && DOCUMENT_HINT_RE.test(k))
      .slice(0, 100);
  }

  function inspectCard(el, angular) {
    const scope = scopeFor(el, angular);
    const attrs = {};
    for (const attr of [...el.attributes]) {
      if (/^(ng-|data-|href|src|title|aria-)/i.test(attr.name)) {
        attrs[attr.name] = normalize(attr.value);
      }
    }

    const keys = candidateKeys(scope);
    const values = {};
    for (const key of keys) {
      try { values[key] = safeClone(scope[key]); } catch {}
    }

    // También inspecciona algunas variables locales típicas aunque el nombre no incluya 'document'.
    for (const key of ["item", "doc", "document", "popularDocument", "result", "resource"]) {
      if (scope && Object.prototype.hasOwnProperty.call(scope, key) && !(key in values)) {
        try { values[key] = safeClone(scope[key]); } catch {}
      }
    }

    return {
      text: normalize(el.innerText || el.textContent),
      path: domPath(el),
      attrs,
      scopeId: scope?.$id ?? null,
      scopeKeys: keys,
      values
    };
  }

  function collectRootCandidates(angular) {
    const root = document.querySelector(".office-documents") || document.body;
    const scope = scopeFor(root, angular);
    if (!scope) return { scopeFound: false, values: {} };

    const values = {};
    let cursor = scope;
    let levels = 0;
    while (cursor && levels < 6) {
      for (const key of Object.keys(cursor)) {
        if (key.startsWith("$") || SENSITIVE_KEY_RE.test(key)) continue;
        if (!DOCUMENT_HINT_RE.test(key)) continue;
        if (Object.prototype.hasOwnProperty.call(values, key)) continue;
        try { values[key] = safeClone(cursor[key]); } catch {}
      }
      cursor = cursor.$parent;
      levels += 1;
    }
    return { scopeFound: true, scopeId: scope.$id ?? null, values };
  }

  function downloadJson(payload) {
    const fileName = `iris-office-document-model-ar-es-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return fileName;
  }

  function inspect() {
    const angular = getAngular();
    const selectors = [
      ".popular-document",
      ".popular-document-container > div",
      ".category .heading",
      ".office-documents [ng-click]",
      ".office-documents [data-ng-click]"
    ].join(",");

    const elements = [...new Set([...document.querySelectorAll(selectors)])];
    const cards = angular ? elements.map(el => inspectCard(el, angular)) : [];
    const rootCandidates = angular ? collectRootCandidates(angular) : { scopeFound: false, values: {} };

    const payload = {
      schemaVersion: VERSION,
      capturedAt: new Date().toISOString(),
      sourceType: "office_virtual",
      market: "AR",
      language: "es",
      page: {
        url: sanitizeUrl(window.location.href),
        title: document.title || null,
        hash: window.location.hash || null
      },
      angularDetected: Boolean(angular),
      cardCount: cards.length,
      cards,
      rootCandidates,
      privacy: {
        cookiesRead: false,
        localStorageRead: false,
        sessionStorageRead: false,
        formValuesRead: false,
        credentialsRead: false,
        authHeadersRead: false,
        requestsCreated: false,
        sensitiveKeysRedacted: true
      }
    };

    const fileName = downloadJson(payload);
    console.log("[Iris] Modelo de Documents inspeccionado:", fileName, "Tarjetas:", cards.length, "Angular:", Boolean(angular));
    return payload;
  }

  window.irisOfficeDocumentModelInspect = inspect;
  window.irisOfficeDocumentModelInspectorVersion = VERSION;

  console.log(`[Iris] ${VERSION} cargado.`);
  console.log("[Iris] En Documents ejecutá irisOfficeDocumentModelInspect().");
})();
