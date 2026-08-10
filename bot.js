const BOT_THREAD_KEY = "routineBotThreadV35";
const BOT_SAVED_KEY = "routineBotSavedResponsesV35";
const BOT_GREETING = "Hola 👋 Preguntame algo o buscá el recurso que necesitás.";

function normalizeBotText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createBotMessage(role, payload) {
  if (role === "user") {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      text: String(payload || "")
    };
  }

  if (typeof payload === "string") {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      text: payload
    };
  }

  const blocks =
    Array.isArray(payload?.blocks)
      ? payload.blocks
      : [];

  const firstText =
    blocks.find(block => block?.type === "text")
      ?.content || "";

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text: firstText,
    topicId: payload?.topicId || null,
    topicTitle: payload?.topicTitle || "",
    blocks
  };
}

function loadBotConversation() {
  try {
    const saved = JSON.parse(localStorage.getItem(BOT_THREAD_KEY) || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (error) {}

  return [{ id: "greeting", role: "bot", text: BOT_GREETING }];
}

function saveBotConversation(messages) {
  localStorage.setItem(BOT_THREAD_KEY, JSON.stringify(messages));
}

function botFavoriteIdentityBlock(block) {
  if (!block) return null;

  return {
    type: String(block.type || ""),
    mediaType: String(block.mediaType || ""),
    resourceKind: String(block.resourceKind || ""),
    src: String(block.src || "").trim(),
    url: String(block.url || "").trim(),
    title: normalizeBotText(block.title || ""),
    description: normalizeBotText(block.description || ""),
    content: normalizeBotText(block.content || ""),
    country: normalizeBotText(block.country || ""),
    countries: Array.isArray(block.countries)
      ? block.countries.map(value => normalizeBotText(value)).filter(Boolean).sort()
      : [],
    market: normalizeBotText(block.market || ""),
    sections: Array.isArray(block.sections)
      ? block.sections.map(section => ({
          title: normalizeBotText(section?.title || ""),
          body: normalizeBotText(section?.body || "")
        }))
      : []
  };
}

function botFavoriteKey(message) {
  // NU APP · CARPETAS FAVORITAS DEL BOT V94
  const topicId = normalizeBotText(message?.topicId || "");
  if (topicId) return `bot-topic:${topicId}`;

  const blocks = Array.isArray(message?.blocks)
    ? message.blocks.map(botFavoriteIdentityBlock).filter(Boolean)
    : [];

  return JSON.stringify({
    topicId,
    text: normalizeBotText(botMessagePlainText(message)),
    blocks
  });
}

function isValidSavedBotResponse(item) {
  if (!item || typeof item !== "object") return false;

  const hasText = Boolean(String(item.text || "").trim());
  const hasBlocks = Array.isArray(item.blocks) && item.blocks.some(Boolean);
  return hasText || hasBlocks;
}

function isBotResponseSaveable(message) {
  if (!message || typeof message !== "object") return false;

  const blocks = Array.isArray(message.blocks) ? message.blocks.filter(Boolean) : [];
  const hasResource = blocks.some(block => ["document", "link", "media"].includes(block?.type));
  const hasTopic = Boolean(message.topicId);
  const plainText = normalizeBotText(botMessagePlainText(message));

  const isNoResult =
    plainText.includes("no encontre todavia contenido cargado") ||
    plainText.includes("no encontre contenido cargado") ||
    plainText.includes("no hay contenido para guardar") ||
    plainText.includes("no se pudo cargar") ||
    plainText.includes("ocurrio un error");

  if (isNoResult) return false;
  return hasResource || hasTopic || Boolean(plainText);
}

function canonicalSavedBotResponse(item) {
  if (!isValidSavedBotResponse(item)) return null;

  const blocks = Array.isArray(item.blocks) ? item.blocks.filter(Boolean) : [];
  const normalized = {
    id: String(item.id || `saved-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    topicId: item.topicId || null,
    topicTitle: item.topicTitle || "",
    text: String(item.text || botMessagePlainText({ blocks }) || ""),
    blocks,
    savedAt: Number(item.savedAt || Date.now())
  };

  if (!isBotResponseSaveable(normalized)) return null;

  normalized.favoriteKey = botFavoriteKey(normalized);
  return normalized;
}

function normalizeSavedBotResponses(saved) {
  const byKey = new Map();

  (Array.isArray(saved) ? saved : []).forEach(item => {
    const normalized = canonicalSavedBotResponse(item);
    if (!normalized) return;

    const existing = byKey.get(normalized.favoriteKey);
    if (!existing || normalized.savedAt >= existing.savedAt) {
      byKey.set(normalized.favoriteKey, normalized);
    }
  });

  return [...byKey.values()];
}

function persistSavedBotResponses(items) {
  const normalized = normalizeSavedBotResponses(items);
  localStorage.setItem(BOT_SAVED_KEY, JSON.stringify(normalized));
  return normalized;
}

function getSavedBotResponses() {
  try {
    const raw = JSON.parse(localStorage.getItem(BOT_SAVED_KEY) || "[]");
    const normalized = normalizeSavedBotResponses(raw);

    // Autolimpieza: migra formatos viejos, elimina registros inválidos y
    // conserva una sola copia de cada respuesta/recurso guardado.
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      localStorage.setItem(BOT_SAVED_KEY, JSON.stringify(normalized));
    }

    return normalized;
  } catch (error) {
    console.warn("No se pudieron leer los guardados del Bot.", error);
    return [];
  }
}

function isBotResponseSaved(message) {
  const favoriteKey = botFavoriteKey(message);
  return getSavedBotResponses().some(item => item.favoriteKey === favoriteKey);
}

function botMessagePlainText(message) {
  if (!message) return "";

  const chunks = [];

  if (!message.blocks?.length && message.text) {
    chunks.push(message.text);
  }

  (message.blocks || []).forEach(block => {
    if (!block) return;

    if (block.type === "text" && block.content) {
      chunks.push(block.content);
      return;
    }

    if (block.type === "document") {
      if (block.title) chunks.push(block.title);

      (block.sections || []).forEach(section => {
        const title = section?.title ? `${section.title}\n` : "";
        const body = section?.body || "";
        if (title || body) chunks.push(`${title}${body}`.trim());
      });

      return;
    }

    if (block.type === "link") {
      const title = block.title || "Enlace";
      const url = block.url || "";
      chunks.push(`${title}${url ? `\n${url}` : ""}`);
      return;
    }

    if (block.type === "media" && block.title) {
      chunks.push(block.title);
    }
  });

  return chunks.filter(Boolean).join("\n\n");
}

function toggleBotResponseSaved(message) {
  if (!isBotResponseSaveable(message)) {
    toast("Esta respuesta no contiene un recurso para guardar.", { type: "info" });
    return;
  }

  const saved = getSavedBotResponses();
  const favoriteKey = botFavoriteKey(message);
  const alreadySaved = saved.some(item => item.favoriteKey === favoriteKey);

  try {
    if (alreadySaved) {
      const next = saved.filter(item => item.favoriteKey !== favoriteKey);
      persistSavedBotResponses(next);
      toast("Respuesta quitada de guardados.", { type: "info" });
    } else {
      const draft = canonicalSavedBotResponse({
        id: message.id,
        topicId: message.topicId || null,
        topicTitle: message.topicTitle || "",
        text: botMessagePlainText(message),
        blocks: message.blocks || [],
        savedAt: Date.now()
      });

      if (!draft) {
        toast("No hay contenido para guardar.", { type: "info" });
        return;
      }

      const next = persistSavedBotResponses([...saved, draft]);
      const persisted = next.some(item => item.favoriteKey === favoriteKey);

      if (!persisted) {
        throw new Error("El guardado no quedó persistido.");
      }

      toast("Respuesta guardada.", { type: "success" });
      if (navigator.vibrate) navigator.vibrate(10);
    }
  } catch (error) {
    console.warn("No se pudo actualizar el guardado del Bot.", error);
    toast("No se pudo guardar. Probá nuevamente.", { type: "info" });
  }

  renderBotConversation({ scroll: true });
}

async function copyBotResponse(text, button) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }

    if (button) {
      const original = button.innerHTML;
      button.classList.add("is-copied");
      button.innerHTML = `${ICONS.check}<span>Copiado</span>`;
      clearTimeout(button._copyResetTimer);
      button._copyResetTimer = setTimeout(() => {
        button.classList.remove("is-copied");
        button.innerHTML = original;
      }, 1400);
    } else {
      toast("Respuesta copiada.", { type: "success" });
    }

    if (navigator.vibrate) navigator.vibrate(8);
  } catch (error) {
    toast("No se pudo copiar la respuesta.", { type: "error" });
  }
}

function scrollBotToEnd(behavior = "smooth") {
  const thread = document.getElementById("botThread");
  if (!thread) return;

  const commit = currentBehavior => {
    thread.scrollTo({ top: thread.scrollHeight, behavior: currentBehavior });
  };

  requestAnimationFrame(() => {
    commit(behavior);
    // Las tarjetas del Bot pueden cambiar de alto al montar recursos.
    // Un segundo ajuste evita quedar "cortado" antes de la última respuesta.
    window.setTimeout(() => commit("auto"), 90);
  });
}

function botResourceRoutineDay(block) {
  const match = String(block?.src || "").match(/(?:^|\/)D(\d{2})_/i);
  if (!match) return null;

  const day = Number(match[1]);
  return days[day] ? day : null;
}

function botResourceKindLabel(block) {
  if (block.type === "document") return "Documento";
  if (block.type === "media") {
    return block.mediaType === "video" ? "Video" : "Imagen";
  }
  if (block.resourceKind === "video") return "Video";
  return "Enlace";
}

function openBotDocument(documentBlock) {
  document.querySelector(".bot-document-layer")?.remove();

  const layer = document.createElement("div");
  layer.className = "bot-document-layer";

  // V35.10.3: posición forzada desde JS para que la guía quede realmente
  // arriba dentro del viewport, incluso si el navegador conserva CSS anterior.
  layer.style.alignItems = "flex-start";
  layer.style.justifyContent = "center";
  layer.style.paddingTop = "max(52px, 7dvh)";
  layer.style.paddingLeft = "14px";
  layer.style.paddingRight = "14px";
  layer.style.paddingBottom = "18px";
  layer.style.boxSizing = "border-box";

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "bot-document-backdrop";
  backdrop.setAttribute("aria-label", "Cerrar documento");

  const sheet = document.createElement("section");
  sheet.className = "bot-document-sheet";
  sheet.style.borderRadius = "26px";
  sheet.style.maxHeight = "min(78dvh, 680px)";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", documentBlock.title || "Documento");

  const grabber = document.createElement("div");
  grabber.className = "bot-document-grabber";
  grabber.setAttribute("aria-hidden", "true");

  const header = document.createElement("header");
  header.className = "bot-document-header";

  const heading = document.createElement("div");

  const kicker = document.createElement("small");
  kicker.textContent = documentBlock.kicker || "DOCUMENTO";

  const title = document.createElement("h2");
  title.textContent = documentBlock.title || "Guía";

  heading.append(kicker, title);

  if (documentBlock.description) {
    const description = document.createElement("p");
    description.textContent = documentBlock.description;
    heading.appendChild(description);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "bot-document-close";
  close.setAttribute("aria-label", "Cerrar");
  close.innerHTML = ICONS.close;

  header.append(heading, close);

  const body = document.createElement("div");
  body.className = "bot-document-body";

  (documentBlock.sections || []).forEach(section => {
    const sectionEl = document.createElement("article");
    sectionEl.className = "bot-document-section";

    if (section.title) {
      const h3 = document.createElement("h3");
      h3.textContent = section.title;
      sectionEl.appendChild(h3);
    }

    if (section.body) {
      const p = document.createElement("p");
      p.textContent = section.body;
      sectionEl.appendChild(p);
    }

    body.appendChild(sectionEl);
  });

  if (Array.isArray(documentBlock.actions) && documentBlock.actions.length) {
    const actions = document.createElement("div");
    actions.className = "bot-document-actions";

    documentBlock.actions.forEach(action => {
      if (!action?.url) return;

      const link = document.createElement("a");
      link.className = "bot-document-action";
      link.href = action.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const copy = document.createElement("span");

      const actionTitle = document.createElement("strong");
      actionTitle.textContent = action.title || "Abrir recurso";
      copy.appendChild(actionTitle);

      if (action.description) {
        const actionDescription = document.createElement("small");
        actionDescription.textContent = action.description;
        copy.appendChild(actionDescription);
      }

      const arrow = document.createElement("span");
      arrow.className = "bot-document-action-arrow";
      arrow.innerHTML = ICONS.arrow;

      link.append(copy, arrow);
      actions.appendChild(link);
    });

    body.appendChild(actions);
  }

  if (Array.isArray(documentBlock.items) && documentBlock.items.length) {
    const gallery = document.createElement("button");
    gallery.type = "button";
    gallery.className = "bot-document-gallery";

    const preview = document.createElement("span");
    preview.className = "bot-document-gallery-preview";

    documentBlock.items.slice(0, 3).forEach(item => {
      const image = document.createElement("img");
      image.src = item.src;
      image.alt = item.label || "";
      image.loading = "lazy";
      preview.appendChild(image);
    });

    const galleryCopy = document.createElement("span");
    galleryCopy.className = "bot-document-gallery-copy";

    const galleryKind = document.createElement("small");
    galleryKind.textContent = documentBlock.galleryKicker || "GALERÍA";

    const galleryTitle = document.createElement("strong");
    galleryTitle.textContent =
      documentBlock.galleryTitle || "Ver imágenes";

    galleryCopy.append(galleryKind, galleryTitle);

    const arrow = document.createElement("span");
    arrow.className = "bot-document-action-arrow";
    arrow.innerHTML = ICONS.arrow;

    gallery.append(preview, galleryCopy, arrow);

    gallery.onclick = () => {
      const media = documentBlock.items.map(item => ({
        src: item.src,
        label: item.label || "Cuestionario",
        mediaType: item.mediaType || "image",
        poster: item.poster || null,
        shareable: item.shareable !== false,
        favorite: false
      }));

      cleanup();
      openMediaPreview(media, 0, selectedDay);
    };

    body.appendChild(gallery);
  }

  sheet.append(grabber, header, body);
  layer.append(backdrop, sheet);
  document.body.appendChild(layer);
  document.body.classList.add("bot-document-open");

  const cleanup = () => {
    document.body.classList.remove("bot-document-open");
    layer.remove();
    document.removeEventListener("keydown", onKeyDown);
  };

  const onKeyDown = event => {
    if (event.key === "Escape") cleanup();
  };

  backdrop.onclick = cleanup;
  close.onclick = cleanup;
  document.addEventListener("keydown", onKeyDown);

  requestAnimationFrame(() => {
    close.focus({ preventScroll: true });
  });
}

function createBotResourceCard(block) {
  if (!block) return null;

  if (block.type === "link") {
    const card = document.createElement("a");
    card.className = "bot-resource-card bot-resource-link";
    card.href = block.url || "#";
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const icon = document.createElement("span");
    icon.className = "bot-resource-icon";
    icon.innerHTML =
      block.resourceKind === "video"
        ? ICONS.play
        : ICONS.arrow;

    const copy = document.createElement("span");
    copy.className = "bot-resource-copy";

    const kind = document.createElement("small");
    kind.textContent = botResourceKindLabel(block);

    const title = document.createElement("strong");
    title.textContent = block.title || "Abrir recurso";

    copy.append(kind, title);

    if (block.description) {
      const description = document.createElement("span");
      description.textContent = block.description;
      copy.appendChild(description);
    }

    const arrow = document.createElement("span");
    arrow.className = "bot-resource-arrow";
    arrow.innerHTML = ICONS.arrow;

    card.append(icon, copy, arrow);
    return card;
  }

  if (block.type === "document") {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "bot-resource-card bot-resource-document";

    const icon = document.createElement("span");
    icon.className = "bot-resource-icon";
    icon.innerHTML = ICONS.folder;

    const copy = document.createElement("span");
    copy.className = "bot-resource-copy";

    const kind = document.createElement("small");
    kind.textContent = block.kicker || "Documento";

    const title = document.createElement("strong");
    title.textContent = block.title || "Abrir guía";

    copy.append(kind, title);

    if (block.description) {
      const description = document.createElement("span");
      description.textContent = block.description;
      copy.appendChild(description);
    }

    const arrow = document.createElement("span");
    arrow.className = "bot-resource-arrow";
    arrow.innerHTML = ICONS.arrow;

    card.append(icon, copy, arrow);
    card.onclick = () => openBotDocument(block);

    return card;
  }

  if (block.type === "media") {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "bot-resource-card bot-resource-media";

    const thumb = document.createElement("span");
    thumb.className = "bot-resource-thumb bot-resource-icon";

    if (block.mediaType === "video") {
      const video = document.createElement("video");
      video.src = block.src;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      thumb.appendChild(video);

      const play = document.createElement("span");
      play.className = "bot-resource-play";
      play.innerHTML = ICONS.play;
      thumb.appendChild(play);
    } else {
      const image = document.createElement("img");
      image.src = block.src;
      image.alt = "";
      image.loading = "lazy";
      thumb.appendChild(image);
    }

    const copy = document.createElement("span");
    copy.className = "bot-resource-copy";

    const kind = document.createElement("small");
    kind.textContent = botResourceKindLabel(block);

    const title = document.createElement("strong");
    title.textContent = block.title || "Abrir material";

    copy.append(kind, title);

    if (block.description) {
      const description = document.createElement("span");
      description.textContent = block.description;
      copy.appendChild(description);
    }

    const arrow = document.createElement("span");
    arrow.className = "bot-resource-arrow";
    arrow.innerHTML = ICONS.arrow;

    card.append(thumb, copy, arrow);

    card.onclick = () => {
      const sourceDay = botResourceRoutineDay(block);

      openMediaPreview(
        [
          {
            src: block.src,
            label: block.title || "Material",
            mediaType: block.mediaType,
            poster: block.poster || null,
            shareable: block.shareable !== false,
            // Favoritos sigue organizado por días de rutina. Un recurso del Bot
            // solo puede guardarse ahí si conocemos su día de origen real.
            favorite: block.favorite !== false && Boolean(sourceDay)
          }
        ],
        0,
        sourceDay || selectedDay
      );
    };

    return card;
  }

  return null;
}

function appendBotResponseContent(wrap, message) {
  const blocks =
    Array.isArray(message.blocks)
      ? message.blocks
      : [];

  if (!blocks.length) {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${message.role}`;
    bubble.textContent = message.text || "";
    wrap.appendChild(bubble);
    return;
  }

  const stack = document.createElement("div");
  stack.className = "bot-response-stack";

  blocks.forEach(block => {
    if (!block) return;

    if (block.type === "text") {
      const bubble = document.createElement("div");
      bubble.className = "bubble bot";
      bubble.textContent = block.content || "";
      stack.appendChild(bubble);
      return;
    }

    const card = createBotResourceCard(block);
    if (card) stack.appendChild(card);
  });

  wrap.appendChild(stack);
}

function renderBotConversation({ scroll = false } = {}) {
  const thread = document.getElementById("botThread");
  const card = document.querySelector(".bot-card");
  if (!thread || !card) return;

  const messages = loadBotConversation();
  const started = messages.some(message => message.role === "user");

  thread.innerHTML = "";

  messages.forEach(message => {
    if (message.id === "greeting" && started) return;

    if (message.id === "greeting" && !started) {
      const welcome = document.createElement("section");
      welcome.className = "bot-native-welcome";
      welcome.setAttribute("aria-label", "Ayuda del asistente");

      const mark = document.createElement("span");
      mark.className = "bot-native-welcome-mark";
      mark.innerHTML = ICONS.bot;

      const title = document.createElement("h2");
      title.textContent = "Preguntame lo que necesites";

      const text = document.createElement("p");
      text.textContent = "Podés escribir un comando como “loi”, “tramites” o “box colageno”, o preguntarme con tus palabras.";

      welcome.append(mark, title, text);
      thread.appendChild(welcome);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = `bot-message bot-message-${message.role}`;

    if (message.role === "bot") {
      appendBotResponseContent(wrap, message);
    } else {
      const bubble = document.createElement("div");
      bubble.className = "bubble user";
      bubble.textContent = message.text || "";
      wrap.appendChild(bubble);
    }

    if (message.role === "bot" && message.id !== "greeting") {
      const actions = document.createElement("div");
      actions.className = "bot-message-actions";

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "bot-message-action";
      copy.innerHTML = `${ICONS.copy}<span>Copiar</span>`;
      copy.onclick = () =>
        copyBotResponse(
          botMessagePlainText(message),
          copy
        );

      actions.appendChild(copy);

      if (isBotResponseSaveable(message)) {
        const saved = isBotResponseSaved(message);
        const save = document.createElement("button");
        save.type = "button";
        save.className = `bot-message-action${saved ? " is-saved" : ""}`;
        save.innerHTML = `${saved ? ICONS.bookmarkFilled : ICONS.bookmark}<span>${saved ? "Guardado" : "Guardar"}</span>`;
        save.onclick = () => toggleBotResponseSaved(message);
        actions.appendChild(save);
      }

      wrap.appendChild(actions);
    }

    thread.appendChild(wrap);
  });

  card.classList.toggle("has-conversation", started);

  if (scroll) scrollBotToEnd("smooth");
}

function resetBotConversation() {
  localStorage.removeItem(BOT_THREAD_KEY);
  renderBotConversation({ scroll: false });
  document.getElementById("botInput")?.focus({ preventScroll: true });
}

const BOT_COUNTRY_ALIASES = {
  "Argentina": ["argentina", "arg"],
  "México": ["mexico", "mex"],
  "España": ["espana", "esp"],
  "Chile": ["chile", "chi"],
  "Colombia": ["colombia", "col"],
  "Perú": ["peru", "per"],
  "Estados Unidos": [
    "estados unidos",
    "eeuu",
    "e e u u",
    "usa",
    "estados unidos de america"
  ],
  "Canadá": ["canada", "can"],
  "Uruguay": ["uruguay", "uru"],
  "Paraguay": ["paraguay", "par"],
  "Bolivia": ["bolivia", "bol"],
  "Ecuador": ["ecuador", "ecu"],
  "Costa Rica": ["costa rica"],
  "Panamá": ["panama", "pan"],
  "República Dominicana": [
    "republica dominicana",
    "dominicana",
    "rep dominicana",
    "rd"
  ]
};

const BOT_SEARCH_STOP_WORDS = new Set([
  "a",
  "al",
  "algo",
  "como",
  "con",
  "cual",
  "cuales",
  "de",
  "del",
  "donde",
  "el",
  "en",
  "es",
  "esta",
  "este",
  "la",
  "las",
  "lo",
  "los",
  "me",
  "mi",
  "mis",
  "necesito",
  "para",
  "por",
  "que",
  "quiero",
  "se",
  "un",
  "una",
  "ver"
]);

function escapeBotRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBotCountryAliases(country) {
  if (!country) return [];

  return [country, ...(BOT_COUNTRY_ALIASES[country] || [])]
    .map(normalizeBotText)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function canonicalBotCountry(value) {
  const normalized = normalizeBotText(value);
  if (!normalized) return null;

  for (const country of Object.keys(BOT_COUNTRY_ALIASES)) {
    if (getBotCountryAliases(country).includes(normalized)) {
      return country;
    }
  }

  return null;
}

function detectBotCountry(query) {
  const normalized = normalizeBotText(query);
  if (!normalized) return null;

  const candidates = Object.keys(BOT_COUNTRY_ALIASES)
    .flatMap(country =>
      getBotCountryAliases(country).map(alias => ({ country, alias }))
    )
    .sort((a, b) => b.alias.length - a.alias.length);

  for (const candidate of candidates) {
    const pattern = new RegExp(
      `(^|\\s)${escapeBotRegExp(candidate.alias)}(?=\\s|$)`
    );

    if (pattern.test(normalized)) {
      return candidate.country;
    }
  }

  return null;
}

function removeBotCountryFromQuery(query, country) {
  let normalized = normalizeBotText(query);
  if (!country || !normalized) return normalized;

  getBotCountryAliases(country).forEach(alias => {
    const pattern = new RegExp(
      `(^|\\s)${escapeBotRegExp(alias)}(?=\\s|$)`,
      "g"
    );
    normalized = normalized.replace(pattern, " ");
  });

  return normalized.replace(/\s+/g, " ").trim();
}

function getBotProfileCountry() {
  const profile = getRoutineProfile();
  return canonicalBotCountry(profile?.country) || profile?.country || null;
}

function botItemCountries(item) {
  if (!item) return [];

  const values = [
    item.country,
    item.market,
    ...(Array.isArray(item.countries) ? item.countries : []),
    ...(Array.isArray(item.markets) ? item.markets : [])
  ];

  return [...new Set(
    values
      .map(value => canonicalBotCountry(value) || String(value || "").trim())
      .filter(Boolean)
  )];
}

function botItemMatchesCountry(item, country) {
  if (!country) return false;
  return botItemCountries(item).some(value =>
    normalizeBotText(value) === normalizeBotText(country)
  );
}

function botBlockSearchText(block) {
  if (!block) return "";

  const chunks = [
    block.type,
    block.mediaType,
    block.resourceKind,
    block.title,
    block.description,
    block.content,
    block.actionLabel,
    ...botItemCountries(block)
  ];

  if (block.type === "document") {
    chunks.push("documento", "guia", "archivo");
  }

  if (block.type === "link") {
    chunks.push("enlace", "link");
  }

  if (block.type === "media") {
    chunks.push(block.mediaType === "video" ? "video" : "imagen");
  }

  if (block.resourceKind === "video") {
    chunks.push("video");
  }

  (block.sections || []).forEach(section => {
    chunks.push(section?.title, section?.body);
  });

  return normalizeBotText(chunks.filter(Boolean).join(" "));
}

function botTopicIntentTerms(topic) {
  return [
    topic?.command,
    ...(Array.isArray(topic?.commands) ? topic.commands : []),
    ...(Array.isArray(topic?.aliases) ? topic.aliases : []),
    ...(Array.isArray(topic?.phrases) ? topic.phrases : [])
  ]
    .map(normalizeBotText)
    .filter(Boolean);
}

function findExactBotTopic(library, query) {
  const normalized = normalizeBotText(query);
  if (!normalized) return null;

  return (Array.isArray(library) ? library : []).find(topic =>
    botTopicIntentTerms(topic).includes(normalized)
  ) || null;
}

function botTopicSearchText(topic) {
  const chunks = [
    topic?.title,
    ...(topic?.keywords || []),
    ...botTopicIntentTerms(topic),
    ...botItemCountries(topic)
  ];

  (topic?.blocks || []).forEach(block => {
    chunks.push(botBlockSearchText(block));
  });

  return normalizeBotText(chunks.filter(Boolean).join(" "));
}

function getBotSearchTerms(query) {
  return normalizeBotText(query)
    .split(" ")
    .map(term => term.trim())
    .filter(term => term.length > 1 && !BOT_SEARCH_STOP_WORDS.has(term));
}

function botTextHasTerm(text, term) {
  if (!text || !term) return false;
  if (text.includes(term)) return true;

  // Permite pequeñas variaciones naturales: presentacion/presentaciones,
  // comision/comisiones, asesorar/asesoria, etc.
  if (term.length >= 5) {
    const prefix = term.slice(0, Math.min(6, term.length));
    return text.includes(prefix);
  }

  return false;
}

function filterBotBlocksForCountry(blocks, explicitCountry, profileCountry) {
  const source = Array.isArray(blocks) ? blocks : [];

  if (explicitCountry) {
    const matching = source.filter(block => botItemMatchesCountry(block, explicitCountry));
    const generic = source.filter(block => botItemCountries(block).length === 0);

    // Si existen recursos etiquetados para el mercado pedido, mostramos
    // esos recursos + contexto general, y ocultamos únicamente otros mercados.
    if (matching.length) {
      return source.filter(block =>
        botItemCountries(block).length === 0 ||
        botItemMatchesCountry(block, explicitCountry)
      );
    }

    // Mientras un tema todavía no tenga versiones por país cargadas,
    // conservamos su contenido general en vez de dejar la consulta vacía.
    return generic.length ? generic : source;
  }

  if (!profileCountry) return source;

  // Sin país escrito por la persona nunca filtramos. Solo subimos primero
  // los recursos de su mercado y mantenemos todos los demás disponibles.
  const generic = source.filter(block => botItemCountries(block).length === 0);
  const preferred = source.filter(block => botItemMatchesCountry(block, profileCountry));
  const others = source.filter(block =>
    botItemCountries(block).length > 0 &&
    !botItemMatchesCountry(block, profileCountry)
  );

  return [...generic, ...preferred, ...others];
}

function scoreBotTopic(topic, queryContext) {
  const {
    normalizedQuery,
    contentQuery,
    terms,
    explicitCountry,
    profileCountry
  } = queryContext;

  const title = normalizeBotText(topic?.title);
  const keywords = [
    ...(topic?.keywords || []),
    ...botTopicIntentTerms(topic)
  ].map(normalizeBotText).filter(Boolean);
  const searchable = botTopicSearchText(topic);
  const topicCountries = botItemCountries(topic);
  const matchingBlocks = (topic?.blocks || []).filter(block =>
    explicitCountry && botItemMatchesCountry(block, explicitCountry)
  );

  const hasExplicitMarketMatch =
    Boolean(explicitCountry) &&
    (botItemMatchesCountry(topic, explicitCountry) || matchingBlocks.length > 0);

  const hasAnyMarketMetadata =
    topicCountries.length > 0 ||
    (topic?.blocks || []).some(block => botItemCountries(block).length > 0);

  if (
    explicitCountry &&
    hasAnyMarketMetadata &&
    !hasExplicitMarketMatch &&
    topicCountries.length > 0
  ) {
    return null;
  }

  let score = 0;
  let matchedTerms = 0;

  if (contentQuery && title === contentQuery) score += 420;
  if (contentQuery && title.includes(contentQuery)) score += 180;

  keywords.forEach(keyword => {
    if (!contentQuery) return;
    if (keyword === contentQuery) score += 380;
    else if (keyword.includes(contentQuery) || contentQuery.includes(keyword)) score += 155;
  });

  if (contentQuery && searchable.includes(contentQuery)) {
    score += 90;
  }

  terms.forEach(term => {
    if (botTextHasTerm(searchable, term)) {
      matchedTerms += 1;
      score += 34;
    }

    if (botTextHasTerm(title, term)) score += 22;
    if (keywords.some(keyword => botTextHasTerm(keyword, term))) score += 20;
  });

  if (!terms.length && explicitCountry && !hasExplicitMarketMatch) {
    return null;
  }

  if (terms.length) {
    const requiredMatches = terms.length === 1
      ? 1
      : Math.ceil(terms.length * 0.6);

    if (matchedTerms < requiredMatches) {
      return null;
    }

    score += Math.round((matchedTerms / terms.length) * 80);
  } else if (!explicitCountry && normalizedQuery) {
    return null;
  }

  if (explicitCountry) {
    if (hasExplicitMarketMatch) score += 520;
    else if (!hasAnyMarketMetadata) score += 8;
  } else if (profileCountry) {
    if (
      botItemMatchesCountry(topic, profileCountry) ||
      (topic?.blocks || []).some(block => botItemMatchesCountry(block, profileCountry))
    ) {
      score += 45;
    }
  }

  return {
    topic,
    score,
    matchedTerms,
    hasExplicitMarketMatch
  };
}

function searchBotLibrary(query) {
  const normalizedQuery = normalizeBotText(query);
  const explicitCountry = detectBotCountry(normalizedQuery);
  const profileCountry = getBotProfileCountry();
  const contentQuery = removeBotCountryFromQuery(normalizedQuery, explicitCountry);
  const terms = getBotSearchTerms(contentQuery);
  const library = Array.isArray(window.BotContent) ? window.BotContent : [];

  const queryContext = {
    normalizedQuery,
    contentQuery,
    terms,
    explicitCountry,
    profileCountry
  };

  // Prioridad absoluta al comando/alias/frase exacta. El normalizador elimina
  // signos como el punto inicial, por eso ".loi" y "loi" llegan al mismo lugar.
  const exactTopic = findExactBotTopic(library, normalizedQuery);
  if (exactTopic) {
    return {
      ...queryContext,
      results: [{
        topic: exactTopic,
        score: 10000,
        matchedTerms: terms.length,
        hasExplicitMarketMatch: Boolean(
          explicitCountry &&
          botItemMatchesCountry(exactTopic, explicitCountry)
        )
      }]
    };
  }

  const results = library
    .map(topic => scoreBotTopic(topic, queryContext))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return {
    ...queryContext,
    results
  };
}

function resolveBotAnswer(q) {
  const search = searchBotLibrary(q);
  const winner = search.results[0]?.topic || null;

  if (!winner) {
    const marketText = search.explicitCountry
      ? ` para ${search.explicitCountry}`
      : "";

    return {
      topicId: null,
      topicTitle: "",
      blocks: [
        {
          type: "text",
          content:
            `No encontré todavía contenido cargado${marketText} que coincida con esa búsqueda. Probá con otras palabras o buscá otro recurso.`
        }
      ]
    };
  }

  return {
    topicId: winner.id,
    topicTitle: winner.title || "",
    blocks: filterBotBlocksForCountry(
      winner.blocks || [],
      search.explicitCountry,
      search.profileCountry
    )
  };
}

function showBotTyping() {
  const thread = document.getElementById("botThread");
  if (!thread || document.getElementById("botTyping")) return;

  const typing = document.createElement("div");
  typing.id = "botTyping";
  typing.className = "bot-message bot-message-bot bot-typing-wrap";
  typing.innerHTML = `<div class="bubble bot bot-typing" aria-label="Escribiendo"><i></i><i></i><i></i></div>`;
  thread.appendChild(typing);
  scrollBotToEnd("smooth");
}

function botAsk(q) {
  const question = String(q || "").trim();
  if (!question) return;

  const messages = loadBotConversation();

  // NU APP · REPETICIÓN CONSECUTIVA V105
  // Bloquea solamente el mismo pedido dos veces seguidas. Si hubo otro pedido
  // en el medio, el comando vuelve a responder con normalidad.
  const lastUserMessage = [...messages]
    .reverse()
    .find(message => message?.role === "user");
  if (
    lastUserMessage &&
    normalizeBotText(lastUserMessage.text) === normalizeBotText(question)
  ) {
    if (typeof toast === "function") {
      toast("Ese recurso ya es el último de la conversación.", {
        type: "info",
        duration: 2400
      });
    }
    return;
  }

  messages.push(createBotMessage("user", question));
  saveBotConversation(messages);
  renderBotConversation({ scroll: true });
  showBotTyping();

  const response = resolveBotAnswer(question);

  setTimeout(() => {
    const nextMessages = loadBotConversation();
    nextMessages.push(createBotMessage("bot", response));
    saveBotConversation(nextMessages);
    renderBotConversation({ scroll: true });
  }, 420);
}

function syncBotSendState() {
  const input = document.getElementById("botInput");
  const send = document.querySelector(".bot-send");
  if (!input || !send) return;

  const ready = Boolean(input.value.trim());
  send.disabled = !ready;
  send.setAttribute("aria-disabled", String(!ready));
}

function submitBotInput() {
  const input = document.getElementById("botInput");
  const q = input?.value.trim();
  if (!q) return;

  input.value = "";
  syncBotSendState();
  botAsk(q);
}

document
  .querySelector(".bot-send")
  ?.addEventListener("click", submitBotInput);

const botInput = document.getElementById("botInput");

botInput?.addEventListener("input", syncBotSendState);
syncBotSendState();

botInput?.addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
  e.preventDefault();
  submitBotInput();
});

function updateBotKeyboardState() {
  if (!botInput) return;

  const viewport = window.visualViewport;
  const focused = document.activeElement === botInput;
  const viewportHeight = viewport?.height || window.innerHeight;
  const keyboardOpen = focused && (window.innerHeight - viewportHeight > 140);

  document.body.classList.toggle("keyboard-open", keyboardOpen);
  document.documentElement.style.setProperty("--bot-visual-height", `${Math.round(viewportHeight)}px`);

  if (keyboardOpen) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      scrollBotToEnd("auto");
    });
  }
}

botInput?.addEventListener("focus", () => {
  setTimeout(() => {
    updateBotKeyboardState();
    scrollBotToEnd("auto");
  }, 120);
});

botInput?.addEventListener("blur", () => {
  setTimeout(updateBotKeyboardState, 80);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    updateBotKeyboardState();
    if (document.activeElement === botInput) {
      setTimeout(() => scrollBotToEnd("auto"), 40);
    }
  });
  window.visualViewport.addEventListener("scroll", updateBotKeyboardState);
}

window.addEventListener("resize", updateBotKeyboardState);
