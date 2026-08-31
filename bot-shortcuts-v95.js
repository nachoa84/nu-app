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
      commands: [
        "como usar boost",
        "como usar lumi spa",
        "como usar facial spa",
        "como usar well spa",
        "como usar face wash 180",
        "box colageno",
        "como asesorar lumi spa",
        "estrategia colageno europa"
      ]
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
      commands: ["comunidad ok"]
    },
    {
      id: "herramientas",
      title: "Herramientas",
      description: "Aplicaciones y funciones de la plataforma.",
      tone: "cyan",
      icon: "tools",
      commands: ["stela", "vera", "navegar pagina", "info center"]
    }
  ];

  const ICONS_V95 = {
    sparkle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path style="fill:#4285F4" d="M12 3l1.15 3.1L16 7.25l-2.85 1.15L12 11.5l-1.15-3.1L8 7.25l2.85-1.15L12 3Z"/><path style="fill:#FBBC05" d="M6.5 11l1.65 4.35L12.5 17l-4.35 1.65L6.5 23l-1.65-4.35L.5 17l4.35-1.65L6.5 11Z"/><path style="fill:#EA4335" d="M17.5 10l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1 1.1-2.9Z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`,
    arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`,
    briefcase: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>`,
    products: `<img src="assets/custom/nuskin-logo-icon.svg" alt="" aria-hidden="true" />`,
    boost: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M 11.26 3.00 L 10.89 3.32 L 10.80 4.17 L 10.52 4.46 L 10.34 5.08 L 10.48 6.14 L 11.10 8.06 L 11.18 9.14 L 10.14 14.28 L 10.00 16.93 L 10.25 18.58 L 10.63 19.77 L 11.28 20.69 L 11.95 21.00 L 12.11 21.00 L 12.72 20.75 L 13.18 20.24 L 13.58 19.32 L 13.81 18.20 L 13.91 14.72 L 13.23 8.64 L 13.30 7.91 L 13.84 7.46 L 14.01 6.53 L 13.79 5.55 L 13.12 4.29 L 12.27 3.38 L 11.51 3.00 Z"/></svg>`,
    collagen: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M 8.62 4.62 L 4.63 4.93 L 3.41 5.23 L 3.09 5.54 L 3.07 7.93 L 3.44 8.19 L 3.11 8.47 L 3.02 8.82 L 3.04 17.94 L 3.52 18.68 L 4.55 19.07 L 6.81 19.29 L 11.03 19.38 L 13.01 19.38 L 17.13 19.29 L 19.41 19.07 L 20.35 18.79 L 20.83 18.31 L 21.00 17.83 L 21.00 8.76 L 20.56 8.19 L 20.93 7.93 L 20.91 5.49 L 20.15 5.08 L 18.21 4.80 L 9.01 4.62 Z"/></svg>`,
    facewash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M 14.96 3.00 L 8.94 3.04 L 9.55 8.75 L 10.25 20.59 L 10.61 20.86 L 11.51 21.00 L 12.41 21.00 L 13.54 20.81 L 13.88 20.54 L 14.39 10.21 L 15.03 3.00 Z"/></svg>`,
    facialspa: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M 12.25 3.00 L 11.40 3.10 L 10.82 3.50 L 10.32 4.40 L 9.64 4.91 L 9.22 5.71 L 8.62 7.69 L 7.61 12.40 L 7.34 15.11 L 7.36 17.84 L 7.91 21.00 L 15.94 21.00 L 16.09 19.77 L 16.46 18.64 L 16.66 14.51 L 16.41 11.50 L 15.84 8.26 L 14.86 4.93 L 14.23 4.50 L 13.91 3.75 L 13.33 3.10 L 12.40 3.00 Z"/></svg>`,
    lumispa: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M 14.73 3.00 L 13.37 3.51 L 11.41 4.73 L 8.53 6.98 L 7.07 8.48 L 8.32 10.72 L 11.49 10.85 L 11.45 12.50 L 10.84 17.36 L 10.92 18.97 L 11.34 21.00 L 14.45 21.00 L 14.22 16.28 L 14.50 12.01 L 14.41 9.49 L 15.07 8.22 L 16.93 6.62 L 16.46 5.52 L 14.86 3.00 Z"/></svg>`,
    wellspa: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M 13.90 7.47 L 12.10 7.63 L 10.05 8.09 L 8.02 8.89 L 6.96 9.59 L 6.40 10.27 L 6.28 11.02 L 7.17 12.58 L 7.12 13.25 L 6.31 13.78 L 3.72 14.33 L 3.32 14.55 L 3.03 14.97 L 3.11 15.83 L 3.90 16.20 L 4.13 16.53 L 19.88 16.53 L 20.14 15.99 L 20.90 15.59 L 20.89 14.61 L 20.34 14.17 L 18.22 13.37 L 17.71 12.90 L 17.55 12.46 L 17.69 11.80 L 18.62 10.38 L 18.71 9.51 L 18.51 8.87 L 17.80 8.19 L 17.07 7.84 L 16.03 7.58 L 14.40 7.47 Z"/></svg>`,
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

  function buildCommandIndex() {
    const catalog = [
      ...(Array.isArray(window.BotCommandCatalog) ? window.BotCommandCatalog : []),
      ...(Array.isArray(window.BotContent) ? window.BotContent : [])
    ].map(item => ({
      ...item,
      label: item.label || item.title || item.command
    }));
    const byCommand = new Map();
    catalog.forEach(item => {
      [item.command, ...(Array.isArray(item.commands) ? item.commands : [])]
        .filter(Boolean)
        .forEach(command => byCommand.set(normalizedCommand(command), item));
    });
    return byCommand;
  }

  function commandCatalog() {
    const byCommand = buildCommandIndex();
    return QUICK_ACCESS_CATEGORIES.map(category => ({
      ...category,
      items: category.commands.map(command => byCommand.get(command)).filter(Boolean)
    })).filter(category => category.items.length);
  }

  const TRAMITES_COUNTRY_COMMANDS = [
    "tramites argentina",
    "tramites espana",
    "tramites italia",
    "tramites mexico",
    "tramites peru"
  ];

  function resolveCommandItems(commands) {
    const byCommand = buildCommandIndex();
    return commands.map(command => byCommand.get(normalizedCommand(command))).filter(Boolean);
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
    if (!item?.command) return;
    const command = item.command;
    closeBotQuickAccess();
    window.requestAnimationFrame(() => {
      if (typeof botAsk === "function") {
        botAsk(command);
        return;
      }
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

  const PRODUCT_COMMAND_ICONS_V123 = {
    "como usar boost": "boost",
    "como usar lumi spa": "lumispa",
    "como usar facial spa": "facialspa",
    "como usar well spa": "wellspa",
    "como usar face wash 180": "facewash",
    "box colageno": "collagen",
    "como asesorar lumi spa": "lumispa",
    "estrategia colageno europa": "collagen"
  };

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
      const productIcon = category.id === "productos-asesoramiento"
        ? PRODUCT_COMMAND_ICONS_V123[item.command]
        : null;
      const icon = iconNode(productIcon || category.icon, "bot-quick-access-row-icon");
      const copy = document.createElement("span");
      copy.className = "bot-quick-access-row-copy";
      const strong = document.createElement("strong");
      strong.textContent = item.label || item.command;
      copy.appendChild(strong);
      button.append(icon, copy, iconNode("arrow", "bot-quick-access-row-arrow"));
      const isTramitesEntry = category.id === "tramites-informacion" && item.command === "tramites";
      button.onclick = isTramitesEntry
        ? () => renderTramitesCountryList(sheet, category, categories, item)
        : () => chooseBotCommand(item);
      list.appendChild(button);
    });
  }

  function tramitesCountryLabel(item) {
    const label = item.label || item.title || item.command;
    return String(label).replace(/^Trámites\s*·\s*/i, "");
  }

  function renderTramitesCountryList(sheet, category, categories, parentItem) {
    activeCategory = category.id;
    const title = sheet.querySelector(".bot-quick-access-title");
    const subtitle = sheet.querySelector(".bot-quick-access-subtitle");
    const back = sheet.querySelector(".bot-quick-access-back");
    const list = sheet.querySelector(".bot-quick-access-list");
    title.textContent = parentItem.label || parentItem.title || "Trámites";
    subtitle.textContent = "Elegí un país";
    back.hidden = false;
    back.onclick = () => renderCommandList(sheet, category, categories);
    list.className = "bot-quick-access-list is-commands";
    list.innerHTML = "";

    resolveCommandItems(TRAMITES_COUNTRY_COMMANDS).forEach(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `bot-quick-access-row is-command tone-${category.tone}`;
      const icon = iconNode(category.icon, "bot-quick-access-row-icon");
      const copy = document.createElement("span");
      copy.className = "bot-quick-access-row-copy";
      const strong = document.createElement("strong");
      strong.textContent = tramitesCountryLabel(item);
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

  function setupIrisHeaderPolish() {
    const header = document.querySelector("#view-bot .bot-page-header");
    if (!header) return;

    const title = header.querySelector("h1");
    if (title && title.dataset.irisTitlePolish !== "1") {
      title.dataset.irisTitlePolish = "1";
      title.innerHTML = `Iris <span class="bot-title-note">· Tu Asistente</span>`;
    }

    if (!document.getElementById("irisHeaderPolishV131")) {
      const style = document.createElement("style");
      style.id = "irisHeaderPolishV131";
      style.textContent = `
        #view-bot .bot-page-header > div:first-child {
          display: grid;
          gap: 8px;
          min-width: 0;
        }

        #view-bot .bot-page-header h1 {
          margin: 0;
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 6px;
          line-height: 1.05;
        }

        #view-bot .bot-title-note {
          color: #6f7b8c;
          font-size: .62em;
          font-weight: 650;
          letter-spacing: -.02em;
        }

        #view-bot .bot-status {
          margin-top: 2px;
        }

        #view-bot .bot-header-actions {
          gap: 8px;
        }

        #view-bot .bot-header-actions .icon-button {
          width: 44px;
          height: 44px;
          min-width: 44px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 1px solid rgba(120, 134, 159, .18);
          border-radius: 14px;
          background: #fff;
          color: #4b5565;
          box-shadow: 0 8px 18px rgba(15, 23, 42, .06);
          transition: transform .16s ease, box-shadow .16s ease, background-color .16s ease, border-color .16s ease;
        }

        #view-bot .bot-header-actions .icon-button:active {
          transform: scale(.97);
          box-shadow: 0 4px 10px rgba(15, 23, 42, .08);
        }

        #view-bot .bot-header-actions .icon-button svg {
          width: 20px;
          height: 20px;
        }

        #view-bot #botShortcutsBtn {
          background: linear-gradient(180deg, #fff 0%, #faf7ff 100%);
          border-color: rgba(142, 92, 255, .18);
        }

        #view-bot #botClearBtn {
          background: #fff;
        }

        @media (max-width: 380px) {
          #view-bot .bot-header-actions { gap: 6px; }
          #view-bot .bot-header-actions .icon-button {
            width: 42px;
            height: 42px;
            min-width: 42px;
          }
          #view-bot .bot-title-note { font-size: .56em; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  function setupBotQuickAccess() {
    const button = document.getElementById("botShortcutsBtn");
    if (!button || button.dataset.quickAccessReady === "1") return;
    button.dataset.quickAccessReady = "1";
    button.innerHTML = ICONS_V95.grid;
    button.onclick = openBotQuickAccess;
  }

  setupIrisHeaderPolish();
  setupBotQuickAccess();
  window.openBotQuickAccess = openBotQuickAccess;
  window.closeBotQuickAccess = closeBotQuickAccess;
})();
