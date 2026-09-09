/*
 * Iris Office Inventory Browser Capture v0
 *
 * Uso:
 * 1) Iniciar sesión manualmente en Nu Skin / Oficina Virtual.
 * 2) Abrir la pantalla que se quiera inventariar.
 * 3) Abrir DevTools > Console.
 * 4) Pegar este archivo completo una sola vez en esa página.
 * 5) Ejecutar: irisOfficeCapture()
 *
 * El script NO lee cookies, localStorage, sessionStorage, contraseñas,
 * valores de inputs ni tokens de autenticación. Solo captura estructura
 * visible de la página: URL, título, encabezados, navegación y enlaces.
 */

(() => {
  "use strict";

  const VERSION = "iris-office-inventory-v0";

  function normalizeSpace(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
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

  function safeUrl(rawHref) {
    if (!rawHref) return null;
    try {
      const url = new URL(rawHref, window.location.href);
      url.username = "";
      url.password = "";
      url.hash = url.hash || "";
      return url.href;
    } catch {
      return null;
    }
  }

  function captureHeadings() {
    return [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter(isVisible)
      .map(element => ({
        level: element.tagName.toLowerCase(),
        text: normalizeSpace(element.innerText)
      }))
      .filter(item => item.text);
  }

  function captureNavigation() {
    const selectors = [
      "nav a",
      "nav button",
      "[role='navigation'] a",
      "[role='navigation'] button",
      "[role='menuitem']",
      "aside a",
      "aside button"
    ].join(",");

    const items = [...document.querySelectorAll(selectors)]
      .filter(isVisible)
      .map(element => ({
        text: normalizeSpace(element.innerText || element.textContent),
        href: element.tagName === "A" ? safeUrl(element.getAttribute("href")) : null,
        role: element.getAttribute("role") || null,
        ariaLabel: normalizeSpace(element.getAttribute("aria-label")) || null
      }))
      .filter(item => item.text || item.ariaLabel);

    return uniqueBy(items, item => `${item.text}|${item.href || ""}|${item.ariaLabel || ""}`);
  }

  function captureLinks() {
    const links = [...document.querySelectorAll("a[href]")]
      .filter(isVisible)
      .map(anchor => {
        const href = safeUrl(anchor.getAttribute("href"));
        const text = normalizeSpace(anchor.innerText || anchor.textContent || anchor.getAttribute("aria-label"));
        const lower = (href || "").toLowerCase();
        return {
          text,
          href,
          likelyDocument: /\.pdf(?:$|[?#])/.test(lower) || /document|download|resource/.test(lower),
          external: href ? new URL(href).origin !== window.location.origin : false
        };
      })
      .filter(item => item.text || item.href);

    return uniqueBy(links, item => `${item.text}|${item.href || ""}`);
  }

  function captureVisibleSections() {
    const candidates = [...document.querySelectorAll("main,section,article,[role='main']")]
      .filter(isVisible)
      .map((element, index) => {
        const heading = element.querySelector("h1,h2,h3,h4,h5,h6");
        const headingText = heading && isVisible(heading) ? normalizeSpace(heading.innerText) : null;
        const text = normalizeSpace(element.innerText);
        return {
          index,
          heading: headingText,
          textPreview: text ? text.slice(0, 500) : null
        };
      })
      .filter(item => item.heading || item.textPreview);

    return candidates.slice(0, 20);
  }

  function captureMeta() {
    const title = normalizeSpace(document.title);
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
    const payload = {
      ...captureMeta(),
      headings: captureHeadings(),
      navigation: captureNavigation(),
      links: captureLinks(),
      sections: captureVisibleSections(),
      privacy: {
        cookiesRead: false,
        localStorageRead: false,
        sessionStorageRead: false,
        formValuesRead: false,
        credentialsRead: false
      }
    };

    const fileName = downloadJson(payload);
    console.log("[Iris] Captura creada:", fileName);
    console.log(payload);
    return payload;
  }

  window.irisOfficeCapture = capture;
  window.irisOfficeInventoryVersion = VERSION;

  console.log(`[Iris] ${VERSION} cargado. Ejecutá irisOfficeCapture() en cada pantalla que quieras inventariar.`);
})();
