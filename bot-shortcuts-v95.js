(() => {
  "use strict";

  // NU APP · ACCESOS RÁPIDOS DEL BOT V95
  const QUICK_ACCESS_CATEGORIES = [
    {
      id: "inicio-negocio",
      title: "Inicio y negocio",
      description: "Primeros pasos para desarrollar el negocio.",
      tone: "violet",
      icon: "briefcase",
      commands: ["loi", "primera venta", "crear nuevo id", "crear una oferta"]
    },
    {
      id: "productos-asesoramiento",
      title: "Productos y asesoramiento",
      description: "Uso, materiales y apoyo para asesorar.",
      tone: "blue",
      icon: "products",
      commands: ["como usar", "box colageno", "como asesorar lumi spa", "estrategia colageno europa"]
    },
    {
      id: "tramites-informacion",
      title: "Trámites e información",
      description: "Gestiones, documentación e información por mercado.",
      tone: "orange",
      icon: "document",
      commands: ["tramites", "info argentina"]
    },
    {
      id: "comunidad-llamadas",
      title: "Comunidad y llamadas",
      description: "Encuentros, comunidad y acompañamiento.",
      tone: "pink",
      icon: "people",
      commands: ["comunidad ok", "llamada"]
    },
    {
      id: "herramientas",
      title: "Herramientas",
      description: "Aplicaciones y funciones de la plataforma.",
      tone: "cyan",
      icon: "tools",
      commands: ["stela", "vera", "navegar pagina"]
    }
  ];

  const ICONS_V95 = {
    sparkle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.15 3.1L16 7.25l-2.85 1.15L12 11.5l-1.15-3.1L8 7.25l2.85-1.15L12 3ZM6.5 11l1.65 4.35L12.5 17l-4.35 1.65L6.5 23l-1.65-4.35L.5 17l4.35-1.65L6.5 11Zm11-1 1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1 1.1-2.9Z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`,
    arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`,
    briefcase: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>`,
    products: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10l2 5-7 11L5 9l2-5Z"/><path d="M5 9h14M9 4l3 5 3-5"/></svg>`,
    document: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>`,
    people: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8V20"/></svg>`,
    tools: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5a4 4 0 0 0-5-5L12 4 9 7 6.5 4.5a4 4 0 0 0 5 5L4 17a2.1 2.1 0 1 0 3 3l7.5-7.5a4 4 0 0 0 5-5L17 10l-3-3 2.5-2.5Z"/></svg>`
  };

  let activeLayer = null;
  let activeCategory = null;
  let keydownHandler = null;

  function normalizedCommand(value) {
    return String(value || "").trim().toLowerCase();
  }

  function commandCatalog() {
    const catalog = Array.isArray(window.BotCommandCatalog) ? window.BotCommandCatalog : [];
    const byCommand = new Map(catalog.map(item => [normalizedCommand(item.command), item]));
    return QUICK_ACCESS_CATEGORIES.map(category => ({
      ...category,
      items: category.commands.map(command => byCommand.get(command)).filter(Boolean)
    })).filter(category => category.items.length);
  }

  function closeBotQuickAccess() {
    if (!activeLayer) return;
    const layer = activeLayer;
    activeLayer = null;
    activeCategory = null;
    document.body.classList.remove("bot-quick-access-open");
    if (keydownHandler) document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
    layer.classList.add("is-closing");
    window.setTimeout(() => layer.remove(), 180);
  }

  function chooseBotCommand(item) {
    // NU APP · RESPUESTA DIRECTA V95A
    if (!item?.command) return;
    const command = item.command;
    closeBotQuickAccess();
    window.requestAnimationFrame(() => {
      if (typeof botAsk === "function") {
        botAsk(command);
        return;
      }

      // Respaldo defensivo: usa el envío normal si botAsk no estuviera disponible.
      const input = document.getElementById("botInput");
      if (!input) return;
      input.value = command;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof submitBotInput === "function") submitBotInput();
    });
    if (navigator.vibrate) navigator.vibrate(8);
  }

  function iconNode(name, className) {
    const node = document.createElement("span");
    node.className = className;
    node.innerHTML = ICONS_V95[name] || ICONS_V95.sparkle;
    return node;
  }

  function renderCategoryList(sheet, categories) {
    activeCategory = null;
    const title = sheet.querySelector(".bot-quick-access-title");
    const subtitle = sheet.querySelector(".bot-quick-access-subtitle");
    const back = sheet.querySelector(".bot-quick-access-back");
    const list = sheet.querySelector(".bot-quick-access-list");
    title.textContent = "Accesos rápidos";
    subtitle.textContent = "Elegí una categoría";
    back.hidden = true;
    list.className = "bot-quick-access-list is-categories";
    list.innerHTML = "";

    categories.forEach(category => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `bot-quick-access-row is-category tone-${category.tone}`;
      const icon = iconNode(category.icon, "bot-quick-access-row-icon");
      const copy = document.createElement("span");
      copy.className = "bot-quick-access-row-copy";
      const strong = document.createElement("strong");
      strong.textContent = category.title;
      const small = document.createElement("small");
      small.textContent = category.description;
      copy.append(strong, small);
      button.append(icon, copy, iconNode("arrow", "bot-quick-access-row-arrow"));
      button.onclick = () => renderCommandList(sheet, category, categories);
      list.appendChild(button);
    });
  }

  function renderCommandList(sheet, category, categories) {
    activeCategory = category.id;
    const title = sheet.querySelector(".bot-quick-access-title");
    const subtitle = sheet.querySelector(".bot-quick-access-subtitle");
    const back = sheet.querySelector(".bot-quick-access-back");
    const list = sheet.querySelector(".bot-quick-access-list");
    title.textContent = category.title;
    subtitle.textContent = "Elegí una opción";
    back.hidden = false;
    back.onclick = () => renderCategoryList(sheet, categories);
    list.className = "bot-quick-access-list is-commands";
    list.innerHTML = "";

    category.items.forEach(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `bot-quick-access-row is-command tone-${category.tone}`;
      const icon = iconNode(category.icon, "bot-quick-access-row-icon");
      const copy = document.createElement("span");
      copy.className = "bot-quick-access-row-copy";
      const strong = document.createElement("strong");
      strong.textContent = item.label || item.command;
      // NU APP · ETIQUETAS LIMPIAS V95B
      copy.appendChild(strong);
      button.append(icon, copy, iconNode("arrow", "bot-quick-access-row-arrow"));
      button.onclick = () => chooseBotCommand(item);
      list.appendChild(button);
    });
  }

  function openBotQuickAccess() {
    closeBotQuickAccess();
    if (typeof closeActionSheet === "function") closeActionSheet();
    const categories = commandCatalog();
    if (!categories.length) {
      if (typeof toast === "function") toast("No hay accesos disponibles.", { type: "info" });
      return;
    }

    const layer = document.createElement("div");
    layer.className = "bot-quick-access-layer";
    layer.innerHTML = `
      <button type="button" class="bot-quick-access-backdrop" aria-label="Cerrar accesos rápidos"></button>
      <section class="bot-quick-access-sheet" role="dialog" aria-modal="true" aria-labelledby="botQuickAccessTitle">
        <button type="button" class="bot-quick-access-handle" aria-label="Deslizar para cerrar"><span></span></button>
        <header class="bot-quick-access-header">
          <button type="button" class="bot-quick-access-back" aria-label="Volver" hidden>${ICONS_V95.back}</button>
          <div>
            <h2 id="botQuickAccessTitle" class="bot-quick-access-title">Accesos rápidos</h2>
            <p class="bot-quick-access-subtitle">Elegí una categoría</p>
          </div>
          <button type="button" class="bot-quick-access-close" aria-label="Cerrar">${ICONS_V95.close}</button>
        </header>
        <div class="bot-quick-access-list"></div>
      </section>`;

    const sheet = layer.querySelector(".bot-quick-access-sheet");
    const handle = layer.querySelector(".bot-quick-access-handle");
    layer.querySelector(".bot-quick-access-backdrop").onclick = closeBotQuickAccess;
    layer.querySelector(".bot-quick-access-close").onclick = closeBotQuickAccess;

    let startY = 0;
    let currentY = 0;
    handle.addEventListener("pointerdown", event => {
      startY = event.clientY;
      currentY = startY;
      handle.setPointerCapture?.(event.pointerId);
      sheet.classList.add("is-dragging");
    });
    handle.addEventListener("pointermove", event => {
      if (!startY) return;
      currentY = Math.max(startY, event.clientY);
      sheet.style.transform = `translateY(${currentY - startY}px)`;
    });
    const finishDrag = () => {
      if (!startY) return;
      const distance = currentY - startY;
      startY = 0;
      currentY = 0;
      sheet.classList.remove("is-dragging");
      sheet.style.transform = "";
      if (distance > 64) closeBotQuickAccess();
    };
    handle.addEventListener("pointerup", finishDrag);
    handle.addEventListener("pointercancel", finishDrag);

    activeLayer = layer;
    document.body.appendChild(layer);
    document.body.classList.add("bot-quick-access-open");
    renderCategoryList(sheet, categories);
    keydownHandler = event => {
      if (event.key === "Escape") closeBotQuickAccess();
    };
    document.addEventListener("keydown", keydownHandler);
    window.requestAnimationFrame(() => layer.classList.add("is-visible"));
  }

  function setupBotQuickAccess() {
    const button = document.getElementById("botShortcutsBtn");
    if (!button || button.dataset.quickAccessReady === "1") return;
    button.dataset.quickAccessReady = "1";
    button.innerHTML = ICONS_V95.sparkle;
    button.onclick = openBotQuickAccess;
  }

  setupBotQuickAccess();
  window.openBotQuickAccess = openBotQuickAccess;
  window.closeBotQuickAccess = closeBotQuickAccess;
})();
