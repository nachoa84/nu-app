/*
 * Iris Office Virtual Document Catalog v0
 *
 * Objetivo:
 * - consultar el mismo índice de documentos que usa Office Virtual;
 * - recuperar la mayor cantidad posible de metadatos para AR/shared en español;
 * - paginar resultados sin depender de hacer clic documento por documento;
 * - redactar claves sensibles si aparecieran en la respuesta;
 * - NO leer cookies, localStorage, sessionStorage ni valores de formularios.
 *
 * Uso:
 *   irisOfficeDocumentCatalog()
 */
(() => {
  "use strict";

  const VERSION = "iris-office-document-catalog-v0";
  const ENDPOINT = "https://api.cloud.nuskin.com/solr/v1/document/select";
  const PAGE_SIZE = 500;
  const MAX_DOCS = 10000;
  const QUERY = "market:(AR shared) AND language:es";

  const SENSITIVE_KEY_RE = /(token|ticket|auth|authorization|session|cookie|password|passwd|secret|credential|api[-_]?key)/i;

  function redactValue(value) {
    if (Array.isArray(value)) return value.map(redactValue);
    if (value && typeof value === "object") {
      const out = {};
      for (const [key, val] of Object.entries(value)) {
        out[key] = SENSITIVE_KEY_RE.test(key) ? "[REDACTED]" : redactValue(val);
      }
      return out;
    }
    if (typeof value === "string") {
      return value
        .replace(/([?&](?:ticket|token|auth|authorization|session|key|api_key|apikey)=)[^&#]*/gi, "$1[REDACTED]")
        .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[REDACTED]");
    }
    return value;
  }

  function downloadJson(payload, prefix) {
    const fileName = `${prefix}-${Date.now()}.json`;
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

  function buildUrl(start, rows) {
    const u = new URL(ENDPOINT);
    u.searchParams.set("q", QUERY);
    u.searchParams.set("wt", "json");
    u.searchParams.set("start", String(start));
    u.searchParams.set("rows", String(rows));
    u.searchParams.set("sort", "id asc");
    return u.href;
  }

  async function fetchPage(start, rows) {
    const url = buildUrl(start, rows);
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) {
      throw new Error(`Solr respondió HTTP ${response.status} en start=${start}`);
    }
    return response.json();
  }

  async function collectCatalog() {
    const collected = [];
    let start = 0;
    let numFound = null;
    let responseHeader = null;

    while (start < MAX_DOCS) {
      const page = await fetchPage(start, PAGE_SIZE);
      const response = page?.response;
      if (!response || !Array.isArray(response.docs)) {
        throw new Error("La respuesta no contiene response.docs; puede haber cambiado el API.");
      }

      if (numFound == null) numFound = Number(response.numFound || 0);
      if (responseHeader == null) responseHeader = redactValue(page.responseHeader || null);

      collected.push(...response.docs.map(redactValue));
      console.log(`[Iris] Documentos recibidos: ${collected.length}/${numFound}`);

      if (!response.docs.length || collected.length >= numFound) break;
      start += response.docs.length;
    }

    const payload = {
      schemaVersion: VERSION,
      capturedAt: new Date().toISOString(),
      sourceType: "office_virtual_document_index",
      marketScope: ["AR", "shared"],
      language: "es",
      query: QUERY,
      endpoint: ENDPOINT,
      numFound,
      collectedCount: collected.length,
      truncated: numFound > collected.length,
      responseHeader,
      documents: collected,
      privacy: {
        cookiesRead: false,
        localStorageRead: false,
        sessionStorageRead: false,
        formValuesRead: false,
        credentialsRead: false,
        sensitiveKeysRedacted: true,
        requestCredentialsMode: "omit"
      }
    };

    const fileName = downloadJson(payload, "iris-office-document-catalog-ar-es");
    console.log("[Iris] Catálogo de documentos creado:", fileName);
    console.log("[Iris] Total recuperado:", payload.collectedCount, "de", payload.numFound);
    return payload;
  }

  window.irisOfficeDocumentCatalog = collectCatalog;
  window.irisOfficeDocumentCatalogVersion = VERSION;

  console.log(`[Iris] ${VERSION} cargado.`);
  console.log("[Iris] Ejecutá irisOfficeDocumentCatalog() para recuperar el catálogo AR/shared en español.");
})();
