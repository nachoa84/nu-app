/*
 * Iris Office Virtual Deep Collector v0
 *
 * Objetivo:
 * - capturar la mayor cantidad de información visible posible de la pantalla actual;
 * - descubrir documentos y recursos potencialmente descargables;
 * - registrar procedencia, tipo, tamaño estimado y origen;
 * - NO leer cookies, localStorage, sessionStorage, valores de formularios,
 *   contraseñas, encabezados de autenticación ni tokens.
 *
 * Uso:
 *   irisOfficeDeepCapture()
 *   irisOfficeDocumentManifest()
 *
 * La descarga masiva NO se ejecuta automáticamente. Primero se genera un
 * manifiesto para revisar volumen/tamaños y decidir qué bajar.
 */
(() => {
  "use strict";

  const VERSION = "iris-office-deep-collector-v0";
  const DOCUMENT_EXTENSIONS = [
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".csv", ".txt", ".rtf", ".zip", ".jpg", ".jpeg", ".png", ".webp"
  ];

  function normalizeSpace(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\t\r ]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function safeUrl(raw, base = window.location.href) {
    if (!raw) return null;
    try {
      const u = new URL(raw, base);
      u.username = "";
      u.password = "";
      return u.href;
    } catch {
      return null;
    }
  }

  function isVisible(el, win = window) {
    if (!(el instanceof Element)) return false;
    try {
      const style = win.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch {
      return true;
    }
  }

  function domPath(el) {
    if (!(el instanceof Element)) return null;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 10) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        part += `#${node.id}`;
        parts.unshift(part);
        break;
      }
      const classes = [...node.classList].slice(0, 3);
      if (classes.length) part += "." + classes.join(".");
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(x => x.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }

  function unique(items, keyFn) {
    const seen = new Set();
    return items.filter(item => {
      const key = keyFn(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function classifyTag(el) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "p") return "paragraph";
    if (tag === "li") return "list-item";
    if (tag === "table") return "table";
    if (tag === "button") return "button";
    if (tag === "label") return "label";
    if (tag === "section") return "section";
    if (tag === "article") return "article";
    if (tag === "main") return "main";
    return "text-block";
  }

  function captureDocument(doc, context) {
    const win = doc.defaultView || window;
    const bodyText = normalizeSpace(doc.body?.innerText || "");

    const textSelectors = [
      "main", "article", "section", "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "li", "table", "button", "label", "[role='main']", "[role='article']",
      "[role='heading']", "[role='button']", "[role='tab']", "[role='menuitem']",
      "div", "span"
    ].join(",");

    const blocks = [...doc.querySelectorAll(textSelectors)]
      .filter(el => isVisible(el, win))
      .map(el => {
        const text = normalizeSpace(el.innerText || el.textContent || el.getAttribute("aria-label"));
        return {
          type: classifyTag(el),
          tag: el.tagName.toLowerCase(),
          text,
          path: domPath(el),
          role: el.getAttribute("role") || null,
          ariaLabel: normalizeSpace(el.getAttribute("aria-label")) || null,
          context
        };
      })
      .filter(item => item.text && item.text.length >= 2 && item.text.length <= 25000);

    const links = [...doc.querySelectorAll("a[href]")]
      .filter(el => isVisible(el, win))
      .map(a => ({
        text: normalizeSpace(a.innerText || a.textContent || a.getAttribute("aria-label")),
        href: safeUrl(a.getAttribute("href"), doc.location?.href || window.location.href),
        path: domPath(a),
        context
      }))
      .filter(x => x.href);

    const interactive = [...doc.querySelectorAll("button,[role='button'],[role='link'],[data-href],[data-url],[data-src],[data-download],[onclick]")]
      .filter(el => isVisible(el, win))
      .map(el => ({
        text: normalizeSpace(el.innerText || el.textContent || el.getAttribute("aria-label")),
        tag: el.tagName.toLowerCase(),
        path: domPath(el),
        href: safeUrl(el.getAttribute("href"), doc.location?.href || window.location.href),
        dataHref: safeUrl(el.getAttribute("data-href"), doc.location?.href || window.location.href),
        dataUrl: safeUrl(el.getAttribute("data-url"), doc.location?.href || window.location.href),
        dataSrc: safeUrl(el.getAttribute("data-src"), doc.location?.href || window.location.href),
        dataDownload: normalizeSpace(el.getAttribute("data-download")) || null,
        context
      }))
      .filter(x => x.text || x.href || x.dataHref || x.dataUrl || x.dataSrc || x.dataDownload);

    return {
      context,
      url: safeUrl(doc.location?.href || window.location.href),
      title: normalizeSpace(doc.title),
      bodyText,
      blocks: unique(blocks, x => `${x.context}|${x.path}|${x.text}`),
      links: unique(links, x => `${x.context}|${x.href}|${x.text}`),
      interactive: unique(interactive, x => `${x.context}|${x.path}|${x.text}|${x.href || x.dataHref || x.dataUrl || x.dataSrc || ""}`)
    };
  }

  function collectFrames(doc = document, prefix = "top") {
    const frames = [];
    const captures = [];
    [...doc.querySelectorAll("iframe,frame")].forEach((frame, index) => {
      const src = safeUrl(frame.getAttribute("src"), doc.location?.href || window.location.href);
      const meta = {
        index,
        context: `${prefix}.frame${index}`,
        src,
        title: normalizeSpace(frame.getAttribute("title")),
        accessible: false,
        reason: null
      };
      try {
        const childDoc = frame.contentDocument;
        if (childDoc?.documentElement) {
          meta.accessible = true;
          captures.push(captureDocument(childDoc, meta.context));
          const nested = collectFrames(childDoc, meta.context);
          frames.push(...nested.frames);
          captures.push(...nested.captures);
        } else {
          meta.reason = "no-content-document";
        }
      } catch {
        meta.reason = "cross-origin-or-browser-restricted";
      }
      frames.push(meta);
    });
    return { frames, captures };
  }

  function collectOpenShadowRoots(root = document, context = "top") {
    const captures = [];
    const visit = node => {
      const elements = node.querySelectorAll ? [...node.querySelectorAll("*")] : [];
      for (const el of elements) {
        if (el.shadowRoot) {
          const text = normalizeSpace(el.shadowRoot.textContent || "");
          captures.push({
            context: `${context}.shadow`,
            hostPath: domPath(el),
            hostTag: el.tagName.toLowerCase(),
            text
          });
          visit(el.shadowRoot);
        }
      }
    };
    visit(root);
    return captures.filter(x => x.text);
  }

  function resourceUrls() {
    try {
      return unique(
        performance.getEntriesByType("resource")
          .map(entry => safeUrl(entry.name))
          .filter(Boolean)
          .map(url => ({ url, initiatorType: null })),
        x => x.url
      );
    } catch {
      return [];
    }
  }

  function looksLikeDocument(url, text = "") {
    const lowerUrl = String(url || "").toLowerCase().split("#")[0].split("?")[0];
    const lowerText = String(text || "").toLowerCase();
    return DOCUMENT_EXTENSIONS.some(ext => lowerUrl.endsWith(ext)) ||
      /\b(pdf|documento|document|archivo|download|descargar|manual|acuerdo|plan de compensaci[oó]n|pol[ií]tica|procedimiento|formulario|factura|lista de precios)\b/.test(lowerText);
  }

  function collectDocumentCandidates(captures, resources) {
    const candidates = [];

    for (const cap of captures) {
      for (const link of cap.links) {
        if (looksLikeDocument(link.href, link.text)) {
          candidates.push({ source: "link", text: link.text, url: link.href, path: link.path, context: link.context });
        }
      }
      for (const item of cap.interactive) {
        const urls = [item.href, item.dataHref, item.dataUrl, item.dataSrc].filter(Boolean);
        for (const url of urls) {
          if (looksLikeDocument(url, item.text || item.dataDownload)) {
            candidates.push({ source: "interactive", text: item.text || item.dataDownload || "", url, path: item.path, context: item.context });
          }
        }
        if (!urls.length && looksLikeDocument("", item.text || item.dataDownload)) {
          candidates.push({ source: "interactive-no-url", text: item.text || item.dataDownload || "", url: null, path: item.path, context: item.context });
        }
      }
    }

    for (const res of resources) {
      if (looksLikeDocument(res.url, "")) {
        candidates.push({ source: "performance-resource", text: "", url: res.url, path: null, context: "top" });
      }
    }

    return unique(candidates, x => `${x.url || "NOURL"}|${x.text}|${x.path || ""}`);
  }

  function sensitiveTextFlags(text) {
    const value = String(text || "");
    return {
      mayContainEmail: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value),
      mayContainPhone: /(?:\+?\d[\d .()-]{7,}\d)/.test(value),
      mayContainAccountLikeData: /\b(?:account|cuenta|member id|afiliado|brand affiliate|bonuses earned|total available balance)\b/i.test(value)
    };
  }

  function meta() {
    return {
      schemaVersion: VERSION,
      capturedAt: new Date().toISOString(),
      sourceType: "office_virtual",
      market: "AR",
      language: "es",
      page: {
        url: safeUrl(window.location.href),
        title: normalizeSpace(document.title),
        pathname: window.location.pathname,
        hash: window.location.hash || null
      }
    };
  }

  function buildPayload() {
    const top = captureDocument(document, "top");
    const frameData = collectFrames();
    const captures = [top, ...frameData.captures];
    const resources = resourceUrls();
    const bodyText = captures.map(x => x.bodyText).join("\n\n");

    return {
      ...meta(),
      captures,
      frames: frameData.frames,
      openShadowRoots: collectOpenShadowRoots(),
      resources,
      documentCandidates: collectDocumentCandidates(captures, resources),
      contentFlags: sensitiveTextFlags(bodyText),
      privacy: {
        cookiesRead: false,
        localStorageRead: false,
        sessionStorageRead: false,
        formValuesRead: false,
        credentialsRead: false,
        authHeadersRead: false,
        tokensRead: false
      }
    };
  }

  function downloadJson(payload, prefix) {
    const slug = (document.title || "office-page")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "office-page";
    const fileName = `${prefix}-${slug}-${Date.now()}.json`;
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

  function deepCapture() {
    const payload = buildPayload();
    const fileName = downloadJson(payload, "iris-office-deep");
    console.log("[Iris] Captura profunda creada:", fileName);
    console.log("[Iris] Capturas:", payload.captures.length, "Frames:", payload.frames.length, "Documentos candidatos:", payload.documentCandidates.length);
    return payload;
  }

  function documentManifest() {
    const payload = buildPayload();
    const manifest = {
      schemaVersion: "iris-office-document-manifest-v0",
      capturedAt: payload.capturedAt,
      page: payload.page,
      candidates: payload.documentCandidates,
      frames: payload.frames,
      resourceCount: payload.resources.length,
      privacy: payload.privacy
    };
    const fileName = downloadJson(manifest, "iris-office-documents-manifest");
    console.log("[Iris] Manifiesto de documentos creado:", fileName, "Candidatos:", manifest.candidates.length);
    return manifest;
  }

  window.irisOfficeDeepCapture = deepCapture;
  window.irisOfficeDocumentManifest = documentManifest;
  window.irisOfficeDeepCollectorVersion = VERSION;

  console.log(`[Iris] ${VERSION} cargado.`);
  console.log("[Iris] Ejecutá irisOfficeDeepCapture() para captura máxima de la pantalla actual.");
  console.log("[Iris] Ejecutá irisOfficeDocumentManifest() para inventariar documentos/recursos detectables.");
})();
