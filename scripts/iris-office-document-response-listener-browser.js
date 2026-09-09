/*
 * Iris Office Virtual Document Response Listener v0
 *
 * Objetivo:
 * - observar las respuestas de catálogo de documentos que la propia Oficina Virtual
 *   solicita mientras el usuario navega normalmente;
 * - NO realizar llamadas nuevas a la API;
 * - NO leer cookies, localStorage, sessionStorage, credenciales, headers de
 *   autorización ni valores de formularios;
 * - NO guardar URLs con parámetros sensibles.
 *
 * Uso:
 *   1) pegar este script una vez en la consola;
 *   2) ejecutar irisOfficeDocumentListenerStart();
 *   3) navegar fuera de Documents y volver a Documents;
 *   4) ejecutar irisOfficeDocumentListenerStatus();
 *   5) ejecutar irisOfficeDocumentListenerExport();
 */
(() => {
  "use strict";

  const VERSION = "iris-office-document-response-listener-v0";
  const TARGET_RE = /https:\/\/api\.cloud\.nuskin\.com\/solr\/v1\/document\/select/i;
  const SENSITIVE_KEYS = /^(ticket|token|access[_-]?token|auth|authorization|session|sessionid|sid|key|api[_-]?key|code|credential)$/i;

  const state = {
    started: false,
    startedAt: null,
    captures: [],
    originalFetch: null,
    originalXhrOpen: null,
    originalXhrSend: null
  };

  function sanitizeUrl(raw) {
    if (!raw) return null;
    try {
      const url = new URL(raw, window.location.href);
      url.username = "";
      url.password = "";
      for (const key of [...url.searchParams.keys()]) {
        if (SENSITIVE_KEYS.test(key)) url.searchParams.set(key, "[REDACTED]");
      }
      return url.href;
    } catch {
      return null;
    }
  }

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function summarizePayload(payload) {
    const response = payload && typeof payload === "object" ? payload.response : null;
    const docs = Array.isArray(response?.docs) ? response.docs : [];
    return {
      numFound: Number.isFinite(response?.numFound) ? response.numFound : null,
      start: Number.isFinite(response?.start) ? response.start : null,
      docCount: docs.length,
      topLevelKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 50) : []
    };
  }

  function addCapture({ transport, url, status, payload }) {
    if (!payload || typeof payload !== "object") return;
    const record = {
      capturedAt: new Date().toISOString(),
      transport,
      url: sanitizeUrl(url),
      status: Number.isFinite(status) ? status : null,
      summary: summarizePayload(payload),
      payload
    };

    const signature = JSON.stringify({
      url: record.url,
      numFound: record.summary.numFound,
      start: record.summary.start,
      docCount: record.summary.docCount
    });

    if (!state.captures.some(x => x.signature === signature)) {
      state.captures.push({ ...record, signature });
      console.log("[Iris] Respuesta de catálogo capturada:", record.summary);
    }
  }

  function patchFetch() {
    if (typeof window.fetch !== "function" || state.originalFetch) return;
    state.originalFetch = window.fetch;

    window.fetch = async function irisWrappedFetch(input, init) {
      const response = await state.originalFetch.apply(this, arguments);
      try {
        const requestUrl = typeof input === "string" ? input : input?.url;
        const finalUrl = response?.url || requestUrl || "";
        if (TARGET_RE.test(finalUrl)) {
          const clone = response.clone();
          const text = await clone.text();
          const payload = safeJsonParse(text);
          addCapture({ transport: "fetch", url: finalUrl, status: response.status, payload });
        }
      } catch (error) {
        console.warn("[Iris] No se pudo observar una respuesta fetch:", error?.message || error);
      }
      return response;
    };
  }

  function patchXhr() {
    if (state.originalXhrOpen || state.originalXhrSend) return;

    state.originalXhrOpen = XMLHttpRequest.prototype.open;
    state.originalXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function irisWrappedOpen(method, url) {
      this.__irisObservedUrl = typeof url === "string" ? url : String(url || "");
      return state.originalXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function irisWrappedSend() {
      const xhr = this;
      const observedUrl = xhr.__irisObservedUrl || "";
      if (TARGET_RE.test(observedUrl)) {
        xhr.addEventListener("load", function irisCatalogLoadListener() {
          try {
            const finalUrl = xhr.responseURL || observedUrl;
            let payload = null;
            if (xhr.responseType === "json") {
              payload = xhr.response;
            } else if (!xhr.responseType || xhr.responseType === "text") {
              payload = safeJsonParse(xhr.responseText);
            }
            addCapture({ transport: "xhr", url: finalUrl, status: xhr.status, payload });
          } catch (error) {
            console.warn("[Iris] No se pudo observar una respuesta XHR:", error?.message || error);
          }
        }, { once: true });
      }
      return state.originalXhrSend.apply(this, arguments);
    };
  }

  function restore() {
    if (state.originalFetch) {
      window.fetch = state.originalFetch;
      state.originalFetch = null;
    }
    if (state.originalXhrOpen) {
      XMLHttpRequest.prototype.open = state.originalXhrOpen;
      state.originalXhrOpen = null;
    }
    if (state.originalXhrSend) {
      XMLHttpRequest.prototype.send = state.originalXhrSend;
      state.originalXhrSend = null;
    }
    state.started = false;
  }

  function start() {
    if (state.started) {
      console.log("[Iris] El listener ya está activo.");
      return status();
    }
    patchFetch();
    patchXhr();
    state.started = true;
    state.startedAt = new Date().toISOString();
    console.log("[Iris] Listener activo. Ahora navegá fuera de Documents y volvé a Documents para que la app repita sus consultas.");
    return status();
  }

  function stop() {
    restore();
    console.log("[Iris] Listener detenido. Las capturas permanecen en memoria hasta recargar la página.");
    return status();
  }

  function clear() {
    state.captures = [];
    console.log("[Iris] Capturas limpiadas.");
    return status();
  }

  function status() {
    return {
      version: VERSION,
      started: state.started,
      startedAt: state.startedAt,
      captureCount: state.captures.length,
      captures: state.captures.map(({ signature, payload, ...record }) => ({
        ...record,
        payloadStored: Boolean(payload)
      }))
    };
  }

  function downloadJson(payload, prefix) {
    const fileName = `${prefix}-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    return fileName;
  }

  function exportCaptures() {
    const payload = {
      schemaVersion: VERSION,
      exportedAt: new Date().toISOString(),
      sourceType: "office_virtual",
      market: "AR",
      language: "es",
      page: {
        url: sanitizeUrl(window.location.href),
        title: document.title || null
      },
      captures: state.captures.map(({ signature, ...record }) => record),
      privacy: {
        cookiesRead: false,
        localStorageRead: false,
        sessionStorageRead: false,
        formValuesRead: false,
        credentialsRead: false,
        authHeadersRead: false,
        requestsCreatedByListener: false,
        sensitiveUrlParametersRedacted: true
      }
    };

    const fileName = downloadJson(payload, "iris-office-document-responses-ar-es");
    console.log("[Iris] Export creado:", fileName, "Capturas:", payload.captures.length);
    return payload;
  }

  window.irisOfficeDocumentListenerStart = start;
  window.irisOfficeDocumentListenerStop = stop;
  window.irisOfficeDocumentListenerStatus = status;
  window.irisOfficeDocumentListenerClear = clear;
  window.irisOfficeDocumentListenerExport = exportCaptures;
  window.irisOfficeDocumentListenerVersion = VERSION;

  console.log(`[Iris] ${VERSION} cargado.`);
  console.log("[Iris] Ejecutá irisOfficeDocumentListenerStart(), navegá fuera de Documents y volvé, luego revisá irisOfficeDocumentListenerStatus().");
})();
