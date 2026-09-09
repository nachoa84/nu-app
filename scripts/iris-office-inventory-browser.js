/*
 * Iris Office Inventory Browser Capture v1
 *
 * Uso:
 * 1) Iniciar sesión manualmente en Nu Skin / Oficina Virtual.
 * 2) Abrir la pantalla que se quiera inventariar.
 * 3) Abrir DevTools > Console.
 * 4) Pegar este archivo completo una sola vez en esa página.
 * 5) Ejecutar: irisOfficeCapture()
 *
 * El script NO lee cookies, localStorage, sessionStorage, contraseñas,
 * valores de inputs ni tokens de autenticación.
 *
 * Captura información visible y estructural de la pantalla actual:
 * - URL, título, encabezados y navegación
 * - enlaces y documentos
 * - texto visible profundo por bloques semánticos
 * - listas, tablas y controles visibles sin leer valores de formularios
 * - shadow DOM abierto
 * - iframes del mismo origen cuando el navegador permite leerlos
 *
 * No navega automáticamente ni hace clics.
 */

(() => {
  "use strict";

  const VERSION = "iris-office-inventory-v1";
  const MAX_BODY_TEXT = 120000;
  const MAX_BLOCKS = 2500;
  const MAX_BLOCK_TEXT = 5000;
  const MAX_LINKS = 1500;
  const MAX_TABLES = 100;

  function normalizeSpace(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\t\r ]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
  }

  function normalizeInline(value) {
    return normalizeSpace(value).replace(/\n+/g, " ").trim();
  }

  function isSensitiveFormElement(element) {
    if (!(element instanceof Element)) return false;
    return /^(INPUT|TEXTAREA|SELECT|OPTION)$/i.test(element.tagName);
  }

  function isVisible(element, win = window) {
    if (!(element instanceof Element)) return false;
    if (isSensitiveFormElement(element)) return false;

    try {
      const style = win.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      ) return false;
    } catch {
      return true;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function elementVisibleThroughAncestors(element, win = window) {
    let current = element;
    let depth = 0;
    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 30) {
      if (!isVisible(current, win)) return false;
      current = current.parentElement;
      depth += 1;
    }
    return true;
  }

  function uniqueBy(items, keyFn) {
    const seen = new Set();
    const output = [];
    for (const item of items) {
      const key = keyFn(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      output.push(item);
    }
    return output;
  }

  function safeUrl(rawHref, baseUrl = window.location.href) {
    if (!rawHref) return null;
    try {
      const url = new URL(rawHref, baseUrl);
      url.username = "";
      url.password = "";
      return url.href;
    } catch {
      return null;
    }
  }

  function cssToken(value) {
    return String(value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .slice(0, 80);
  }

  function elementPath(element, rootDocument = document) {
    if (!(element instanceof Element)) return null;
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current !== rootDocument.documentElement && depth < 10) {
      let part = current.tagName.toLowerCase();
      const id = cssToken(current.id);
      if (id) {
        part += `#${id}`;
        parts.unshift(part);
        break;
      }

      const classes = [...current.classList]
        .map(cssToken)
        .filter(Boolean)
        .slice(0, 2);
      if (classes.length) part += `.${classes.join(".")}`;

      const parent = current.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(child => child.tagName === current.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }

      parts.unshift(part);
      current = parent;
      depth += 1;
    }

    return parts.join(" > ");
  }

  function collectRoots(doc) {
    const roots = [{ root: doc, kind: "document", hostPath: null }];
    const seenShadowRoots = new Set();

    function scan(root) {
      const elements = root.querySelectorAll ? [...root.querySelectorAll("*")] : [];
      for (const element of elements) {
        if (element.shadowRoot && !seenShadowRoots.has(element.shadowRoot)) {
          seenShadowRoots.add(element.shadowRoot);
          roots.push({
            root: element.shadowRoot,
            kind: "shadow-root",
            hostPath: elementPath(element, doc)
          });
          scan(element.shadowRoot);
        }
      }
    }

    scan(doc);
    return roots;
  }

  function captureHeadingsFromRoot(root, doc, win) {
    if (!root.querySelectorAll) return [];
    return [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter(element => elementVisibleThroughAncestors(element, win))
      .map(element => ({
        level: element.tagName.toLowerCase(),
        text: normalizeInline(element.innerText || element.textContent),
        path: elementPath(element, doc)
      }))
      .filter(item => item.text);
  }

  function captureNavigationFromRoot(root, doc, win, baseUrl) {
    if (!root.querySelectorAll) return [];
    const selectors = [
      "nav a",
      "nav button",
      "[role='navigation'] a",
      "[role='navigation'] button",
      "[role='menuitem']",
      "aside a",
      "aside button"
    ].join(",");

    return [...root.querySelectorAll(selectors)]
      .filter(element => elementVisibleThroughAncestors(element, win))
      .map(element => ({
        text: normalizeInline(element.innerText || element.textContent),
        href: element.tagName === "A" ? safeUrl(element.getAttribute("href"), baseUrl) : null,
        role: element.getAttribute("role") || null,
        ariaLabel: normalizeInline(element.getAttribute("aria-label")) || null,
        path: elementPath(element, doc)
      }))
      .filter(item => item.text || item.ariaLabel);
  }

  function captureLinksFromRoot(root, doc, win, baseUrl, origin) {
    if (!root.querySelectorAll) return [];
    return [...root.querySelectorAll("a[href]")]
      .filter(anchor => elementVisibleThroughAncestors(anchor, win))
      .map(anchor => {
        const href = safeUrl(anchor.getAttribute("href"), baseUrl);
        const text = normalizeInline(
          anchor.innerText || anchor.textContent || anchor.getAttribute("aria-label")
        );
        const lower = (href || "").toLowerCase();
        let external = false;
        if (href) {
          try { external = new URL(href).origin !== origin; } catch { external = false; }
        }
        return {
          text,
          href,
          likelyDocument:
            /\.(pdf|docx?|xlsx?|pptx?)(?:$|[?#])/i.test(lower) ||
            /document|download|resource|material/i.test(lower),
          external,
          path: elementPath(anchor, doc)
        };
      })
      .filter(item => item.text || item.href);
  }

  function semanticBlockType(element) {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role");
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "p") return "paragraph";
    if (tag === "li") return "list-item";
    if (tag === "dt") return "term";
    if (tag === "dd") return "definition";
    if (tag === "blockquote") return "quote";
    if (tag === "caption") return "table-caption";
    if (tag === "th") return "table-header";
    if (tag === "td") return "table-cell";
    if (tag === "button" || role === "button") return "button";
    if (tag === "label") return "label";
    if (tag === "summary") return "summary";
    if (tag === "article") return "article";
    if (tag === "section") return "section";
    if (tag === "main" || role === "main") return "main";
    return "text-block";
  }

  function hasMeaningfulSemanticChild(element) {
    const selector = "h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,caption,th,td,button,label,summary,article,section,main,[role='main'],[role='button']";
    return [...element.children].some(child => child.matches?.(selector));
  }

  function captureDeepBlocksFromRoot(root, doc, win) {
    if (!root.querySelectorAll) return [];

    const selectors = [
      "h1","h2","h3","h4","h5","h6",
      "p","li","dt","dd","blockquote","caption","th","td",
      "button","label","summary","article","section","main",
      "[role='main']","[role='button']",
      "div","span"
    ].join(",");

    const output = [];
    for (const element of root.querySelectorAll(selectors)) {
      if (output.length >= MAX_BLOCKS) break;
      if (!elementVisibleThroughAncestors(element, win)) continue;
      if (isSensitiveFormElement(element)) continue;
      if (/^(SCRIPT|STYLE|NOSCRIPT|SVG|PATH|INPUT|TEXTAREA|SELECT|OPTION)$/i.test(element.tagName)) continue;

      const tag = element.tagName.toLowerCase();
      if ((tag === "div" || tag === "span") && hasMeaningfulSemanticChild(element)) continue;

      let text = "";
      try {
        text = normalizeSpace(element.innerText || element.textContent);
      } catch {
        text = normalizeSpace(element.textContent);
      }
      if (!text || text.length < 2) continue;
      if (text.length > MAX_BLOCK_TEXT) text = text.slice(0, MAX_BLOCK_TEXT);

      output.push({
        type: semanticBlockType(element),
        tag,
        text,
        path: elementPath(element, doc),
        role: element.getAttribute("role") || null,
        ariaLabel: normalizeInline(element.getAttribute("aria-label")) || null
      });
    }

    return uniqueBy(output, item => `${item.type}|${item.path || ""}|${item.text}`);
  }

  function captureTablesFromRoot(root, doc, win) {
    if (!root.querySelectorAll) return [];
    const tables = [];

    for (const table of root.querySelectorAll("table")) {
      if (tables.length >= MAX_TABLES) break;
      if (!elementVisibleThroughAncestors(table, win)) continue;

      const rows = [];
      for (const row of table.querySelectorAll("tr")) {
        if (!elementVisibleThroughAncestors(row, win)) continue;
        const cells = [...row.querySelectorAll(":scope > th, :scope > td")]
          .filter(cell => elementVisibleThroughAncestors(cell, win))
          .map(cell => normalizeInline(cell.innerText || cell.textContent))
          .filter(Boolean);
        if (cells.length) rows.push(cells);
      }

      if (rows.length) {
        tables.push({
          path: elementPath(table, doc),
          caption: normalizeInline(table.querySelector("caption")?.innerText || "") || null,
          rows: rows.slice(0, 500)
        });
      }
    }

    return tables;
  }

  function captureListsFromRoot(root, doc, win) {
    if (!root.querySelectorAll) return [];
    const lists = [];

    for (const list of root.querySelectorAll("ul,ol")) {
      if (!elementVisibleThroughAncestors(list, win)) continue;
      const items = [...list.querySelectorAll(":scope > li")]
        .filter(item => elementVisibleThroughAncestors(item, win))
        .map(item => normalizeInline(item.innerText || item.textContent))
        .filter(Boolean);
      if (!items.length) continue;
      lists.push({
        type: list.tagName.toLowerCase() === "ol" ? "ordered" : "unordered",
        path: elementPath(list, doc),
        items: items.slice(0, 300)
      });
      if (lists.length >= 300) break;
    }

    return lists;
  }

  function captureBodyText(doc) {
    const body = doc.body;
    if (!body) return null;

    const clone = body.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,svg,input,textarea,select,option").forEach(node => node.remove());

    let text = normalizeSpace(clone.innerText || clone.textContent);
    if (!text) return null;
    if (text.length > MAX_BODY_TEXT) text = text.slice(0, MAX_BODY_TEXT);
    return text;
  }

  function captureDocumentContext(doc, win, contextMeta) {
    const baseUrl = contextMeta.url || win.location?.href || window.location.href;
    const origin = (() => {
      try { return new URL(baseUrl).origin; } catch { return window.location.origin; }
    })();

    const roots = collectRoots(doc);
    const headings = [];
    const navigation = [];
    const links = [];
    const blocks = [];
    const tables = [];
    const lists = [];
    const shadowRoots = [];

    for (const entry of roots) {
      if (entry.kind === "shadow-root") {
        shadowRoots.push({ hostPath: entry.hostPath });
      }
      headings.push(...captureHeadingsFromRoot(entry.root, doc, win));
      navigation.push(...captureNavigationFromRoot(entry.root, doc, win, baseUrl));
      links.push(...captureLinksFromRoot(entry.root, doc, win, baseUrl, origin));
      blocks.push(...captureDeepBlocksFromRoot(entry.root, doc, win));
      tables.push(...captureTablesFromRoot(entry.root, doc, win));
      lists.push(...captureListsFromRoot(entry.root, doc, win));
    }

    return {
      ...contextMeta,
      bodyText: captureBodyText(doc),
      headings: uniqueBy(headings, item => `${item.level}|${item.path || ""}|${item.text}`),
      navigation: uniqueBy(navigation, item => `${item.text}|${item.href || ""}|${item.path || ""}`),
      links: uniqueBy(links, item => `${item.text}|${item.href || ""}|${item.path || ""}`).slice(0, MAX_LINKS),
      blocks: uniqueBy(blocks, item => `${item.type}|${item.path || ""}|${item.text}`).slice(0, MAX_BLOCKS),
      tables: tables.slice(0, MAX_TABLES),
      lists: lists.slice(0, 300),
      shadowRoots
    };
  }

  function captureFrames() {
    const results = [];
    const frames = [...document.querySelectorAll("iframe,frame")];

    frames.forEach((frame, index) => {
      const src = safeUrl(frame.getAttribute("src"));
      const item = {
        index,
        src,
        title: normalizeInline(frame.getAttribute("title")) || null,
        path: elementPath(frame, document),
        accessible: false,
        reason: null,
        content: null
      };

      try {
        const frameDoc = frame.contentDocument;
        const frameWin = frame.contentWindow;
        if (!frameDoc || !frameWin) {
          item.reason = "content-document-unavailable";
        } else {
          item.accessible = true;
          item.content = captureDocumentContext(frameDoc, frameWin, {
            contextType: "iframe",
            frameIndex: index,
            url: safeUrl(frameWin.location.href || src)
          });
        }
      } catch {
        item.reason = "cross-origin-or-browser-restricted";
      }

      results.push(item);
    });

    return results;
  }

  function captureMeta() {
    const title = normalizeInline(document.title);
    const lang = document.documentElement.getAttribute("lang") || null;
    const canonical = document.querySelector("link[rel='canonical']")?.getAttribute("href") || null;

    return {
      schemaVersion: VERSION,
      capturedAt: new Date().toISOString(),
      sourceType: "office_virtual",
      market: "AR",
      language: "es",
      page: {
        url: safeUrl(window.location.href),
        origin: window.location.origin,
        pathname: window.location.pathname,
        hash: window.location.hash || null,
        title,
        documentLanguage: lang,
        canonicalUrl: safeUrl(canonical)
      }
    };
  }

  function downloadJson(payload) {
    const slug = (payload.page.title || "office-page")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "office-page";

    const fileName = `iris-office-${slug}-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return fileName;
  }

  function capture() {
    const main = captureDocumentContext(document, window, {
      contextType: "top-document",
      url: safeUrl(window.location.href)
    });

    const payload = {
      ...captureMeta(),
      capture: main,
      frames: captureFrames(),
      privacy: {
        cookiesRead: false,
        localStorageRead: false,
        sessionStorageRead: false,
        formValuesRead: false,
        credentialsRead: false,
        tokensRead: false
      }
    };

    const fileName = downloadJson(payload);
    console.log("[Iris] Captura profunda creada:", fileName);
    console.log("[Iris] Bloques:", payload.capture.blocks.length, "Links:", payload.capture.links.length, "Frames:", payload.frames.length);
    console.log(payload);
    return payload;
  }

  window.irisOfficeCapture = capture;
  window.irisOfficeInventoryVersion = VERSION;

  console.log(`[Iris] ${VERSION} cargado. Ejecutá irisOfficeCapture() para capturar contenido visible profundo de la pantalla actual.`);
})();
