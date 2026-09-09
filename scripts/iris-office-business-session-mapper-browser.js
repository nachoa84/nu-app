/*
 * Iris Office Virtual Business Session Mapper v0
 *
 * Objetivo:
 * - mapear pantallas de negocio/procedimientos mientras la usuaria navega manualmente;
 * - capturar solo el contenido central de la vista actual, evitando menú lateral/cabecera;
 * - acumular múltiples pantallas en memoria y exportarlas juntas al final;
 * - NO crear requests, NO leer cookies/storage/tokens/credenciales/valores de formularios.
 *
 * Uso:
 *   irisOfficeBusinessMapperStart()
 *   // navegar manualmente por Resources y otras pantallas útiles
 *   irisOfficeBusinessMapperStatus()
 *   irisOfficeBusinessMapperExport()
 */
(() => {
  "use strict";

  const VERSION = "iris-office-business-session-mapper-v0";
  const SENSITIVE_QUERY_KEYS = /^(ticket|token|access[_-]?token|auth|authorization|session|sessionid|sid|password|passwd|secret|credential|api[_-]?key|code)$/i;
  const state = {
    started: false,
    startedAt: null,
    captures: [],
    observer: null,
    hashHandler: null,
    timer: null,
    lastSignature: null
  };

  function normalize(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/[\t\r ]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function sanitizeUrl(raw, base = window.location.href) {
    if (!raw) return null;
    try {
      const u = new URL(raw, base);
      u.username = "";
      u.password = "";
      for (const key of [...u.searchParams.keys()]) {
        if (SENSITIVE_QUERY_KEYS.test(key)) u.searchParams.set(key, "[REDACTED]");
      }
      return u.href;
    } catch {
      return null;
    }
  }

  function visible(el) {
    if (!(el instanceof Element)) return false;
    try {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch {
      return true;
    }
  }

  function mainRoot() {
    return document.querySelector("ui-view.ngView") ||
      document.querySelector("ui-view") ||
      document.querySelector("[role='main']") ||
      document.querySelector("main") ||
      document.querySelector("#generalContent") ||
      document.querySelector("#content") ||
      null;
  }

  function classify(text, url) {
    const t = `${text}\n${url}`.toLowerCase();
    const kinds = [];
    if (/c[oó]mo|paso|procedimiento|inscrip|convert|factura|recibir comisiones|reportar|pedido|cambio|reembolso/.test(t)) kinds.push("procedure");
    if (/plan de compensaci[oó]n|bono|comisi[oó]n|afiliado de marca|brand affiliate|negocio/.test(t)) kinds.push("business");
    if (/contact|apoyo|soporte|correo|tel[eé]fono|horario/.test(t)) kinds.push("support");
    if (/biblioteca|material|document|lista de precios|recurso|tutorial/.test(t)) kinds.push("resource");
    if (/naveg|men[uú]|office|resources|documents|my site|sign-up invitation/.test(t)) kinds.push("navigation");
    return kinds.length ? [...new Set(kinds)] : ["unclassified"];
  }

  function dedupe(items, keyFn) {
    const seen = new Set();
    return items.filter(item => {
      const key = keyFn(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function captureCurrent(reason = "manual-or-route-change") {
    const root = mainRoot();
    if (!root || !visible(root)) return null;

    const bodyText = normalize(root.innerText || root.textContent || "");
    if (!bodyText || bodyText.length < 2) return null;

    const pageUrl = sanitizeUrl(window.location.href);
    const signature = `${window.location.hash}|${bodyText}`;
    if (signature === state.lastSignature) return null;

    const headings = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']")]
      .filter(visible)
      .map(el => normalize(el.innerText || el.textContent || el.getAttribute("aria-label")))
      .filter(Boolean);

    const paragraphs = [...root.querySelectorAll("p,li")]
      .filter(visible)
      .map(el => normalize(el.innerText || el.textContent))
      .filter(Boolean);

    const links = [...root.querySelectorAll("a[href]")]
      .filter(visible)
      .map(a => ({
        text: normalize(a.innerText || a.textContent || a.getAttribute("aria-label")),
        href: sanitizeUrl(a.getAttribute("href"), window.location.href)
      }))
      .filter(x => x.href);

    const buttons = [...root.querySelectorAll("button,[role='button']")]
      .filter(visible)
      .map(el => normalize(el.innerText || el.textContent || el.getAttribute("aria-label")))
      .filter(Boolean);

    const capture = {
      capturedAt: new Date().toISOString(),
      reason,
      page: {
        url: pageUrl,
        title: document.title || null,
        hash: window.location.hash || null
      },
      classification: classify(bodyText, pageUrl || ""),
      content: {
        bodyText,
        headings: dedupe(headings, x => x),
        paragraphs: dedupe(paragraphs, x => x),
        links: dedupe(links, x => `${x.href}|${x.text}`),
        buttons: dedupe(buttons, x => x)
      },
      privacyFlags: {
        mayContainEmail: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(bodyText),
        mayContainPhone: /(?:\+?\d[\d .()-]{7,}\d)/.test(bodyText),
        mayContainPersonalAccountData: /\b(?:mi cuenta|my account|downline|comisiones ganadas|available balance|saldo disponible|orders?|pedidos?|sales organization)\b/i.test(bodyText)
      }
    };

    state.captures.push(capture);
    state.lastSignature = signature;
    console.log("[Iris] Pantalla mapeada:", capture.page.hash, capture.classification, bodyText.length, "chars");
    return capture;
  }

  function scheduleCapture(reason) {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => captureCurrent(reason), 1200);
  }

  function start() {
    if (state.started) return status();
    state.started = true;
    state.startedAt = new Date().toISOString();

    state.hashHandler = () => scheduleCapture("hashchange");
    window.addEventListener("hashchange", state.hashHandler);

    const target = mainRoot() || document.body;
    state.observer = new MutationObserver(() => scheduleCapture("content-change"));
    state.observer.observe(target, { childList: true, subtree: true, characterData: true });

    captureCurrent("start");
    console.log("[Iris] Mapeador de negocio activo. Navegá manualmente por las pantallas útiles; al final ejecutá irisOfficeBusinessMapperExport().");
    return status();
  }

  function stop() {
    if (state.hashHandler) window.removeEventListener("hashchange", state.hashHandler);
    state.hashHandler = null;
    if (state.observer) state.observer.disconnect();
    state.observer = null;
    clearTimeout(state.timer);
    state.timer = null;
    state.started = false;
    console.log("[Iris] Mapeador detenido. Las capturas siguen en memoria hasta recargar la pestaña.");
    return status();
  }

  function clear() {
    state.captures = [];
    state.lastSignature = null;
    console.log("[Iris] Capturas limpiadas.");
    return status();
  }

  function status() {
    return {
      version: VERSION,
      started: state.started,
      startedAt: state.startedAt,
      captureCount: state.captures.length,
      pages: state.captures.map(c => ({
        capturedAt: c.capturedAt,
        hash: c.page.hash,
        title: c.page.title,
        classification: c.classification,
        chars: c.content.bodyText.length,
        privacyFlags: c.privacyFlags
      }))
    };
  }

  function exportJson() {
    const payload = {
      schemaVersion: VERSION,
      exportedAt: new Date().toISOString(),
      sourceType: "office_virtual",
      market: "AR",
      language: "es",
      approvalScope: "discovery-only",
      productionApproved: false,
      captures: state.captures,
      privacy: {
        cookiesRead: false,
        localStorageRead: false,
        sessionStorageRead: false,
        formValuesRead: false,
        credentialsRead: false,
        authHeadersRead: false,
        tokensRead: false,
        requestsCreated: false,
        onlyCentralViewTargeted: true
      }
    };

    const fileName = `iris-office-business-map-ar-es-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    console.log("[Iris] Mapa exportado:", fileName, "Pantallas:", payload.captures.length);
    return payload;
  }

  window.irisOfficeBusinessMapperStart = start;
  window.irisOfficeBusinessMapperStop = stop;
  window.irisOfficeBusinessMapperClear = clear;
  window.irisOfficeBusinessMapperStatus = status;
  window.irisOfficeBusinessMapperCaptureNow = () => captureCurrent("manual");
  window.irisOfficeBusinessMapperExport = exportJson;
  window.irisOfficeBusinessMapperVersion = VERSION;

  console.log(`[Iris] ${VERSION} cargado.`);
  console.log("[Iris] Ejecutá irisOfficeBusinessMapperStart(), navegá por las pantallas de negocio y al final irisOfficeBusinessMapperExport().");
})();
