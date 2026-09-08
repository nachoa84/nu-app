// Vista del día actual
// Extraído de app.js sin reescribir la lógica.
// Este archivo se carga antes de app.js; sus funciones se ejecutan
// después de que app.js inicializa el estado y las referencias del DOM.

const DAY_OBJECTIVES = {
  1: "Conocé Collagen+ y prepará tu primer contenido.",
  2: "Descargá Stela y conocé las herramientas clave.",
  3: "Creá tu lista de contactos potenciales.",
  4: "Organizá tu agenda y sostené acciones simples.",
  5: "Mejorá tu contenido y tu conversación de venta.",
  6: "Aprendé a asesorar mejor a cada cliente.",
  7: "Cerrá tu primera semana con más ritmo y confianza."
};

function currentBlocks() {
  return days[selectedDay].blocks;
}

function addLinks(container, links) {
  if (!links || !links.length) return;

  const wrap = document.createElement("div");
  wrap.className = "resource-links";

  links.forEach(link => {
    const row = document.createElement("div");
    row.className = "resource-link-row";

    const a = document.createElement("a");
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = link.label;
    a.className = "resource-link-main";

    const favoriteKey = `link:${link.url}`;
    const saved = isFavorite(favoriteKey, selectedDay);

    const save = document.createElement("button");
    save.type = "button";
    save.className = `resource-link-save${saved ? " is-saved" : ""}`;
    save.dataset.favoriteSrc = favoriteKey;
    save.dataset.favoriteDay = String(selectedDay);
    save.setAttribute(
      "aria-label",
      saved ? "Quitar enlace de favoritos" : "Guardar enlace en favoritos"
    );
    save.innerHTML = saved ? ICONS.bookmarkFilled : ICONS.bookmark;

    save.onclick = () =>
      saveFavorite(
        favoriteKey,
        link.label,
        "link",
        selectedDay,
        link.url
      );

    row.append(a, save);
    wrap.appendChild(row);
  });

  container.appendChild(wrap);
}

// NU APP · CONFIRMACIÓN DE PROGRESO COLLAGEN V170
// No confirma ni repite el POST sin verificar el estado oficial.
const collagenCompletionPendingV170 = new Map();
const collagenCompletionFailedV170 = new Set();

function isCollagenCompletionPendingV170(day) {
  const userId = String(getRoutineProfile()?.userId || "");
  return collagenCompletionPendingV170.has(`${userId}:${Number(day)}`);
}

function isCollagenDayConfirmedV170(state, day, userId) {
  return Boolean(
    state &&
    String(state.userId || "") === String(userId) &&
    Array.isArray(state.completedDays) &&
    state.completedDays.some(value => Number(value) === Number(day))
  );
}

function confirmCollagenDayV170(day) {
  const safeDay = Number(day);
  const userId = String(getRoutineProfile()?.userId || "");
  if (!userId || !Number.isInteger(safeDay) || safeDay < 1 || safeDay > 30) {
    return Promise.reject(new Error("No se pudo identificar el día o la cuenta."));
  }

  const key = `${userId}:${safeDay}`;
  if (collagenCompletionPendingV170.has(key)) {
    return collagenCompletionPendingV170.get(key);
  }

  const task = (async () => {
    const api = window.BackendAPI;
    let state = null;
    let originalError = null;

    try {
      if (!api || typeof api.completeDay !== "function") {
        throw new Error("Backend no disponible.");
      }
      state = await api.completeDay(safeDay);
    } catch (error) {
      originalError = error;
    }

    if (String(getRoutineProfile()?.userId || "") !== userId) {
      throw new Error("La cuenta cambió durante el registro.");
    }

    // Un error puede ocurrir después del COMMIT. Consultar una vez
    // permite recuperar el día sin repetir automáticamente el POST.
    if (!isCollagenDayConfirmedV170(state, safeDay, userId)) {
      try {
        if (!api || typeof api.getState !== "function") {
          throw new Error("No se pudo consultar el estado oficial.");
        }
        state = await api.getState();
      } catch (error) {
        console.warn("No se pudo verificar el completado de Collagen.", error);
      }
    }

    if (String(getRoutineProfile()?.userId || "") !== userId) {
      throw new Error("La cuenta cambió durante el registro.");
    }
    if (!isCollagenDayConfirmedV170(state, safeDay, userId)) {
      throw originalError || new Error("El servidor no confirmó el día completado.");
    }
    return state;
  })().finally(() => {
    collagenCompletionPendingV170.delete(key);
  });

  collagenCompletionPendingV170.set(key, task);
  return task;
}

function createBlock(block) {
  if (block.type === "action") {
    const card = document.createElement("section");
    card.className = "training-card";

    const heading = document.createElement("div");
    heading.className = "training-card-heading";
    heading.innerHTML = `<span>Capacitación</span><strong>${block.label}</strong>`;

    const btn = document.createElement("button");
    btn.className = "training-card-open";
    btn.type = "button";
    btn.innerHTML = `<span>Abrir capacitación</span><span aria-hidden="true">${ICONS.arrow}</span>`;

    if (block.botCommand) {
      btn.onclick = () => {
        if (typeof window.openRoutineTrainingInBot === "function") {
          window.openRoutineTrainingInBot(block);
          return;
        }
        toast("No se pudo abrir la capacitación.", { type: "info" });
      };
    } else if (block.url) {
      btn.onclick = () => window.open(block.url, "_blank", "noopener");
    } else {
      btn.onclick = () =>
        toast("Esta capacitación todavía está pendiente de cargar.");
    }

    card.append(heading, btn);
    return card;
  }

  if (block.type === "complete") {
    const card = document.createElement("div");
    card.className = "complete-card";

    const day = Number(selectedDay);
    const routineId = getActiveRoutineId();
    const userId = String(getRoutineProfile()?.userId || "");
    const backendManaged = isBackendManagedRoutine();
    const completionKey = `${userId}:${day}`;
    const done = isDayComplete(day);

    const renderDoneState = ({ animate = false } = {}) => {
      card.classList.add("done");
      card.classList.toggle("just-completed", animate && !prefersReducedMotion());
      card.removeAttribute("aria-busy");
      card.innerHTML = `
        <div class="complete-done-copy">
          <h3><span class="complete-done-inline-check" aria-hidden="true">${ICONS.check}</span><span>Hecho hoy</span></h3>
          <p>Registrado.</p>
        </div>
      `;
      if (animate) {
        setTimeout(() => card.classList.remove("just-completed"), 620);
      }
    };

    if (done) {
      if (backendManaged) collagenCompletionFailedV170.delete(completionKey);
      renderDoneState();
      return card;
    }

    card.innerHTML = `
      <h3>¿Lo hiciste?</h3>
      <p>Registrá tu avance.</p>
    `;

    const btn = document.createElement("button");
    btn.className = "primary complete-day-btn";
    btn.innerHTML = `<span class="complete-action-check" aria-hidden="true">${ICONS.check}</span><span>Hoy lo hice</span>`;

    const helper = document.createElement("small");
    helper.className = "complete-helper";
    helper.textContent = "Solo registra tu avance";

    const renderPendingState = () => {
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      card.setAttribute("aria-busy", "true");
      btn.textContent = "Guardando...";
      helper.removeAttribute("role");
      helper.textContent = "Estamos confirmando tu avance.";
    };

    const renderRetryState = () => {
      btn.disabled = false;
      btn.removeAttribute("aria-disabled");
      card.removeAttribute("aria-busy");
      btn.innerHTML = `<span class="complete-action-check" aria-hidden="true">${ICONS.check}</span><span>Volver a intentar</span>`;
      helper.setAttribute("role", "alert");
      helper.textContent = "No pudimos confirmar el registro. Revisá tu conexión y volvé a intentarlo.";
    };

    btn.onclick = async () => {
      // Las rutinas de producto mantienen su flujo existente.
      if (!backendManaged) {
        setDayComplete(day, true);
        if (navigator.vibrate) navigator.vibrate(12);
        renderDoneState({ animate: true });
        renderDays();
        return;
      }

      if (isCollagenCompletionPendingV170(day)) return;
      collagenCompletionFailedV170.delete(completionKey);
      renderPendingState();
      renderDays();

      const stillHere = () =>
        getActiveRoutineId() === routineId &&
        String(getRoutineProfile()?.userId || "") === userId;
      const refreshDetached = () => {
        if (Number(selectedDay) === day && !card.isConnected) {
          renderStructuredDayDetail();
        }
      };

      try {
        await confirmCollagenDayV170(day);
        collagenCompletionFailedV170.delete(completionKey);
        if (!stillHere()) return;
        if (Number(selectedDay) !== day || !card.isConnected) {
          refreshDetached();
          return;
        }
        // La marca local solo se escribe tras la confirmación oficial.
        setDayComplete(day, true);
        if (navigator.vibrate) navigator.vibrate(12);
        renderDoneState({ animate: true });
        renderDays();
      } catch (error) {
        console.warn("No se pudo confirmar el completado de Collagen.", error);
        if (!stillHere()) return;
        collagenCompletionFailedV170.add(completionKey);
        if (Number(selectedDay) !== day || !card.isConnected) {
          refreshDetached();
          return;
        }
        renderRetryState();
        renderDays();
      }
    };

    card.append(btn, helper);
    if (backendManaged && isCollagenCompletionPendingV170(day)) {
      renderPendingState();
    } else if (backendManaged && collagenCompletionFailedV170.has(completionKey)) {
      renderRetryState();
    }
    return card;
  }
}

function createCompactMediaItem(block, order, mediaBlocks) {
  const materialTitle = getActiveRoutineId() === "collagen-30"
    ? block.label
    : `Historia ${order} de ${mediaBlocks.length}`;
  const item = document.createElement("article");
  item.className = `resource-row resource-row-${block.mediaType}`;
  item.tabIndex = 0;
  item.setAttribute("role", "button");
  item.setAttribute("aria-label", `Abrir ${materialTitle}`);

  const openPreview = () => openMediaPreview(mediaBlocks, order - 1, selectedDay);

  const orderBadge = document.createElement("span");
  orderBadge.className = "resource-order";
  orderBadge.textContent = String(order);

  const preview = document.createElement("div");
  preview.className = "resource-thumb";
  preview.setAttribute("aria-hidden", "true");

  const videoPoster = block.mediaType === "video"
    ? resolveRoutineVideoPoster(block.src, block.poster)
    : null;
  const usePosterImage = block.mediaType === "video" && Boolean(videoPoster);
  const media = block.mediaType === "video" && !usePosterImage
    ? document.createElement("video")
    : document.createElement("img");

  media.draggable = false;
  media.setAttribute("draggable", "false");
  preview.classList.add("is-loading");
  const thumbReady = () => preview.classList.remove("is-loading");
  const thumbFailed = () => {
    preview.classList.remove("is-loading");
    preview.classList.add("is-error");
  };

  if (block.mediaType === "video" && !usePosterImage) {
    media.preload = "metadata";
    media.muted = true;
    media.playsInline = true;
    media.setAttribute("playsinline", "");
    media.setAttribute("webkit-playsinline", "");
    media.addEventListener("loadedmetadata", thumbReady, { once: true });
    swapVideoForCapturedFrame(media, preview);
    media.src = block.src;
  } else {
    media.alt = "";
    media.loading = "lazy";
    media.decoding = "async";
    media.addEventListener("load", thumbReady, { once: true });
    media.src = usePosterImage ? videoPoster : block.src;
  }

  media.addEventListener("error", thumbFailed, { once: true });
  preview.appendChild(media);

  if (block.mediaType === "video") {
    const play = document.createElement("span");
    play.className = "resource-play-badge";
    play.innerHTML = ICONS.play;
    preview.appendChild(play);
  }

  const main = document.createElement("div");
  main.className = "resource-main";

  const copy = document.createElement("div");
  copy.className = "resource-copy";
  copy.innerHTML = `
    <strong>${materialTitle}</strong>
    <span>${block.mediaType === "video" ? "Video" : "Imagen"}</span>
  `;

  const disclosure = document.createElement("span");
  disclosure.className = "resource-disclosure";
  disclosure.setAttribute("aria-hidden", "true");
  disclosure.innerHTML = ICONS.arrow;

  const actions = document.createElement("div");
  actions.className = "resource-row-actions";

  if (block.favorite) {
    const save = document.createElement("button");
    save.type = "button";
    save.className = "resource-action-btn";
    save.dataset.favoriteSrc = block.src;
    save.dataset.favoriteDay = String(selectedDay);
    save.onclick = event => {
      event.stopPropagation();
      saveFavorite(
        block.src,
        block.label,
        block.mediaType,
        selectedDay
      );
    };
    actions.appendChild(save);
  }

  if (block.shareable) {
    const share = document.createElement("button");
    share.type = "button";
    share.className = "resource-action-btn";
    share.innerHTML = `${ICONS.share}<span>Compartir</span>`;
    share.onclick = event => {
      event.stopPropagation();
      shareAsset(block.src, block.label, block.mediaType, share);
    };
    actions.appendChild(share);
  }

  item.addEventListener("click", event => {
    if (event.target.closest(".resource-action-btn")) return;
    openPreview();
  });
  item.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && !event.target.closest(".resource-action-btn")) {
      event.preventDefault();
      openPreview();
    }
  });

  setupNativePressState(item, ".resource-action-btn");
  main.append(copy, actions);
  item.append(orderBadge, preview, main, disclosure);
  updateFavoriteButtons();
  return item;
}

function restoreRoutineNames(value) {
  return String(value || "")
    .replace(/collagen\+/gi, "Collagen+")
    .replace(/wellspa\s*io/gi, "WellSpa iO")
    .replace(/wellspa/gi, "WellSpa")
    .replace(/galvanic\s+spa/gi, "Galvanic Spa")
    .replace(/lumispa/gi, "LumiSpa")
    .replace(/nu\s+skin/gi, "Nu Skin")
    .replace(/instagram/gi, "Instagram")
    .replace(/facebook/gi, "Facebook")
    .replace(/whatsapp/gi, "WhatsApp")
    .replace(/\bstela\b/gi, "Stela")
    .replace(/\bq\s*&\s*a\b/gi, "Q&A");
}

function sentenceCaseImportedLine(value) {
  let line = String(value || "").trim();
  if (!line) return "";
  if (/https?:\/\//i.test(line)) return restoreRoutineNames(line);

  const letters = line.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  const allCaps = letters.length >= 5 && letters === letters.toUpperCase();

  if (allCaps && !/^Q&A$/i.test(line)) {
    const lowered = line.toLocaleLowerCase("es");
    line = lowered.charAt(0).toLocaleUpperCase("es") + lowered.slice(1);
  }

  return restoreRoutineNames(line);
}

function normalizeRoutineText(value) {
  const cleaned = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\d\uFE0F?\u20E3/gu, "")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\u20E3]/gu, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\bpreguntes\b/gi, "preguntas")
    .replace(/\binstragram\b/gi, "Instagram")
    .replace(/\bwhatapp\b/gi, "WhatsApp")
    .replace(/\bwhatsapp\b/gi, "WhatsApp")
    .replace(/\ba\s+demás\b/gi, "Además")
    .replace(/\btíps\b/gi, "tips")
    .replace(/\baquí\s+esta\b/gi, "Aquí está")
    .replace(/\baqui\s+esta\b/gi, "Aquí está")
    .replace(/\bpracticas\b/gi, "prácticas")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned
    .split("\n")
    .map(sentenceCaseImportedLine)
    .join("\n")
    .trim();
}

function stripDecorativeSymbols(value) {
  return normalizeRoutineText(value)
    .replace(/^[\s•·▪▫◦‣⁃→➜➤✔✓✅☑️]+/u, "")
    .replace(/^(?:paso\s*)?\d+\s*[.)\-:–—]\s*/iu, "")
    .replace(/([!?¡¿])\1{1,}/gu, "$1")
    .trim();
}

function cleanLeadingSymbols(value) {
  return stripDecorativeSymbols(value);
}

function firstMeaningfulLine(content) {
  const line = normalizeRoutineText(content)
    .split(/\n+/)
    .map(value => cleanLeadingSymbols(value))
    .find(Boolean) || "Tu acción de hoy";

  return line.length > 76 ? `${line.slice(0, 73)}…` : line;
}

function isQuestionAnswerContent(value) {
  const text = normalizeRoutineText(value).toLowerCase();
  if (!text) return false;

  const explicitQa = /\bq\s*&\s*a\b|preguntas?\s+frecuentes|preguntas?\s+y\s+respuestas?|pregunta\s*[:\-]|respuesta\s*[:\-]/i.test(text);
  const questionCount = (text.match(/[¿?]/g) || []).length;
  const answerSignals = (text.match(/\b(?:sí|si|no|porque|puede|puedes|debe|debes|recomendamos|respuesta)\b/gi) || []).length;

  return explicitQa || questionCount >= 3 || (questionCount >= 2 && answerSignals >= 2);
}

function importedTextParts(content, { stripStepNumber = false } = {}) {
  const normalized = normalizeRoutineText(content);
  const lines = normalized.split("\n");
  const firstIndex = lines.findIndex(line => cleanLeadingSymbols(line));

  if (firstIndex === -1) {
    return {
      heading: "Tu acción de hoy",
      body: ""
    };
  }

  let heading = cleanLeadingSymbols(lines[firstIndex]);
  heading = heading.replace(/^#+\s*/u, "").trim();

  if (stripStepNumber) {
    heading = heading
      .replace(/^\s*(?:paso\s*)?#?\d+\s*(?:[.)\-:–—]\s*|\s+)/iu, "")
      .trim();
  }

  const body = lines
    .slice(firstIndex + 1)
    .join("\n")
    .trim();

  return {
    heading: heading || "Tu acción de hoy",
    body
  };
}

function setupFiveLineExpansion(card, body) {
  if (!card || !body || body.dataset.fiveLineReady === "true") return;
  body.dataset.fiveLineReady = "true";
  body.classList.add("five-line-body");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "daily-card-expand";
  toggle.hidden = true;
  toggle.setAttribute("aria-label", "Mostrar más");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<span aria-hidden="true">+</span>';

  let expanded = false;
  const setExpanded = value => {
    expanded = value;
    body.classList.toggle("is-collapsed", !expanded);
    body.classList.toggle("is-expanded", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", expanded ? "Mostrar menos" : "Mostrar más");
    toggle.querySelector("span").textContent = expanded ? "−" : "+";
  };

  toggle.addEventListener("click", () => setExpanded(!expanded));
  card.classList.add("has-five-line-content");
  card.appendChild(toggle);

  const evaluate = () => {
    if (!body.isConnected) {
      requestAnimationFrame(evaluate);
      return;
    }
    setExpanded(false);
    requestAnimationFrame(() => {
      if (body.scrollHeight > body.clientHeight + 2) {
        toggle.hidden = false;
        card.classList.add("is-expandable");
      } else {
        toggle.hidden = true;
        card.classList.remove("is-expandable");
        body.classList.remove("is-collapsed");
      }
    });
  };

  requestAnimationFrame(evaluate);
  window.addEventListener("resize", evaluate, { passive: true });
}

function appendFormattedContent(container, content, options = {}) {
  const { dropFirstParagraph = false } = options;
  let paragraphs = normalizeRoutineText(content)
    .split(/\n\s*\n/)
    .map(value => value.trim())
    .filter(Boolean);

  if (dropFirstParagraph) {
    paragraphs = paragraphs.slice(1);
  }

  paragraphs.forEach(paragraph => {
    const lines = paragraph
      .split(/\n+/)
      .map(value => stripDecorativeSymbols(value))
      .filter(Boolean);

    lines.forEach(line => {
      const element = document.createElement("p");
      element.className = "native-detail-paragraph";
      element.textContent = line;
      container.appendChild(element);
    });
  });
}

function estimateRoutineVisualLines(value, qa = false) {
  const text = normalizeRoutineText(value);
  if (!text) return 0;
  const charsPerLine = qa ? 43 : 38;
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  return paragraphs.reduce((sum, paragraph) => {
    const explicitLines = paragraph.split(/\n+/).filter(Boolean);
    const paragraphLines = explicitLines.reduce(
      (lineSum, line) => lineSum + Math.max(1, Math.ceil(line.length / charsPerLine)),
      0
    );
    return sum + paragraphLines + 0.35;
  }, 0);
}

function applyRoutineCardDensity(card, block) {
  const text = normalizeRoutineText(block?.content || "");
  const qa = isQuestionAnswerContent(text);
  card.classList.toggle("is-qa", qa);
  card.classList.toggle("is-standard-copy", !qa);
  card.classList.remove("is-compact-copy");
}

function createBalancedTextCard(block, { stripStepNumber = false } = {}) {
  const { heading, body } = importedTextParts(block.content, { stripStepNumber });
  const card = document.createElement("section");
  card.className = "objective-card routine-flat-card";

  const copy = document.createElement("div");
  copy.className = "routine-flat-copy";

  if (heading) {
    const first = document.createElement("p");
    first.className = "routine-card-heading";
    first.textContent = heading;
    copy.appendChild(first);
  }

  if (body) {
    appendFormattedContent(copy, body);
  }

  addLinks(copy, block.links);
  card.appendChild(copy);
  applyRoutineCardDensity(card, block);
  return card;
}

function createObjectiveCard(block) {
  return createBalancedTextCard(block);
}

function createImportedObjectiveCard(block) {
  return createBalancedTextCard(block);
}

function createImportedActionStep(block) {
  return createBalancedTextCard(block, { stripStepNumber: true });
}

function createActionStep(block) {
  return createImportedActionStep(block);
}

function isMaterialTransitionBlock(block) {
  if (!block || block.type !== "text" || block.links?.length) return false;
  const text = stripDecorativeSymbols(block.content).replace(/\s+/g, " ").trim();
  if (!text || text.length > 180) return false;
  return /(?:aquí|aqui|a continuación|ahora)\s+(?:está|esta|el|la|los|las|te dejo|te dejamos|comparto|encontrarás|encontraras)|material(?:es)?\s+(?:de|para)|public(?:a|ar)\s+(?:en|el|este)|contenido\s+(?:para|de)\s+(?:publicar|mercadeo)/i.test(text);
}

function splitVisualUnit(value, qa, lineBudget) {
  const text = normalizeRoutineText(value);
  if (!text) return [];
  if (estimateRoutineVisualLines(text, qa) <= lineBudget) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  const result = [];
  let current = "";

  words.forEach(word => {
    const candidate = current ? `${current} ${word}` : word;
    if (current && estimateRoutineVisualLines(candidate, qa) > lineBudget) {
      result.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });

  if (current) result.push(current);
  return result;
}

function textUnitsForBalance(value, qa) {
  const text = normalizeRoutineText(value);
  if (!text) return [];

  if (qa) {
    const lines = text.split(/\n+/).map(item => item.trim()).filter(Boolean);
    const units = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.includes("?") && lines[index + 1] && !lines[index + 1].includes("?")) {
        units.push(`${line}\n${lines[index + 1]}`);
        index += 1;
      } else {
        units.push(line);
      }
    }
    return units.flatMap(unit => splitVisualUnit(unit, true, 4.7));
  }

  const paragraphs = text.split(/\n\s*\n/).map(item => item.trim()).filter(Boolean);
  const units = [];

  paragraphs.forEach(paragraph => {
    const sentences = paragraph
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡0-9])/u)
      .map(item => item.trim())
      .filter(Boolean);

    const source = sentences.length ? sentences : [paragraph];
    source.forEach(sentence => {
      units.push(...splitVisualUnit(sentence, false, 4.2));
    });
  });

  return units;
}

function balanceRoutinePool(pool, qa) {
  if (!pool.length) return [];

  const targetLines = qa ? 8.8 : 6.8;
  const units = [];

  pool.forEach(block => {
    textUnitsForBalance(block.content, qa).forEach(content => {
      units.push({
        content,
        cost: estimateRoutineVisualLines(content, qa),
        block
      });
    });
  });

  if (!units.length) return [];

  const totalCost = units.reduce((sum, unit) => sum + unit.cost, 0);
  const partCount = Math.max(1, Math.ceil(totalCost / targetLines));
  const groups = [];
  let current = [];
  let currentCost = 0;
  let consumedCost = 0;

  const flush = () => {
    if (!current.length) return;
    const first = current[0].block;
    groups.push({
      ...first,
      content: current.map(unit => unit.content).join("\n\n")
    });
    consumedCost += currentCost;
    current = [];
    currentCost = 0;
  };

  units.forEach((unit, index) => {
    const groupsLeft = partCount - groups.length;
    const remainingCost = totalCost - consumedCost;
    const dynamicTarget = remainingCost / Math.max(groupsLeft, 1);
    const candidateCost = currentCost + unit.cost;
    const canStillCut = groups.length < partCount - 1;
    const unitsLeft = units.length - index;
    const groupsNeeded = partCount - groups.length;

    if (current.length && canStillCut && unitsLeft >= groupsNeeded) {
      const beforeDiff = Math.abs(dynamicTarget - currentCost);
      const afterDiff = Math.abs(dynamicTarget - candidateCost);
      if (beforeDiff <= afterDiff && currentCost >= dynamicTarget * 0.58) {
        flush();
      }
    }

    current.push(unit);
    currentCost += unit.cost;
  });

  flush();
  return groups;
}

function splitRoutineTextBlocks(blocks) {
  const output = [];
  let pool = [];
  let poolQa = null;

  const flushPool = () => {
    if (!pool.length) return;
    output.push(...balanceRoutinePool(pool, Boolean(poolQa)));
    pool = [];
    poolQa = null;
  };

  blocks.forEach(block => {
    const normalized = normalizeRoutineText(block.content);
    if (!normalized) return;

    if (block.links?.length) {
      flushPool();
      output.push({ ...block, content: normalized });
      return;
    }

    const qa = isQuestionAnswerContent(normalized);
    if (pool.length && qa !== poolQa) flushPool();
    if (!pool.length) poolQa = qa;
    pool.push({ ...block, content: normalized });
  });

  flushPool();
  return output;
}

function renderStructuredDayDetail() {
  const blocks = currentBlocks();
  const rawTextBlocks = blocks.filter(block => block.type === "text");
  const materialIntroBlocks = rawTextBlocks.filter(isMaterialTransitionBlock);
  const textBlocks = splitRoutineTextBlocks(
    rawTextBlocks.filter(block => !isMaterialTransitionBlock(block))
  );
  const mediaBlocks = blocks.filter(block => block.type === "media");
  const actionBlocks = blocks.filter(block => block.type === "action");
  const completeBlock = blocks.find(block => block.type === "complete");

  chat.innerHTML = "";
  chat.className = "daily-detail continuous-day-detail native-day-content";
  chatWrap.classList.remove("hidden");

  const intro = document.createElement("section");
  intro.className = "native-day-intro";
  intro.innerHTML = `
    <div class="native-day-hero">
      <div class="native-day-hero-copy">
        <h2>Día ${selectedDay}</h2>
        <p>TU ACCIÓN DE HOY</p>
      </div>
      <div class="native-day-hero-media" aria-hidden="true">
        <img src="${getRoutineHeroV92a()}" alt="" />
      </div>
      <div class="native-day-progress-row">
        <div class="native-day-progress" aria-label="Progreso: ${selectedDay} de ${TOTAL_PROGRAM_DAYS}">
          <span style="width:${Math.min(100, Math.round((selectedDay / TOTAL_PROGRAM_DAYS) * 100))}%"></span>
        </div>
        <small>${selectedDay} de ${TOTAL_PROGRAM_DAYS}</small>
      </div>
    </div>
  `;
  chat.appendChild(intro);

  if (textBlocks.length) {
    const carousel = document.createElement("section");
    carousel.className = "routine-content-carousel";
    carousel.setAttribute("aria-label", "Contenido de la rutina");

    const heading = document.createElement("h3");
    heading.className = "routine-content-heading";
    heading.textContent = "Contenido del día";

    const track = document.createElement("div");
    track.className = "routine-content-track";

    textBlocks.forEach((block, index) => {
      const slide = document.createElement("article");
      slide.className = "routine-content-slide";
      slide.dataset.slideIndex = String(index);
      const card = index === 0
        ? createObjectiveCard(block)
        : createActionStep(block, index);
      card.classList.add("routine-content-card");
      applyRoutineCardDensity(card, block);
      slide.appendChild(card);
      track.appendChild(slide);
    });

    const dots = document.createElement("div");
    dots.className = "routine-content-dots";
    dots.setAttribute("aria-label", "Navegación del contenido");
    textBlocks.forEach((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "routine-content-dot";
      dot.setAttribute("aria-label", `Ver contenido ${index + 1}`);
      dot.addEventListener("click", () => {
        track.scrollTo({ left: track.clientWidth * index, behavior: "smooth" });
      });
      dots.appendChild(dot);
    });

    const setActiveDot = () => {
      const index = Math.max(0, Math.min(
        textBlocks.length - 1,
        Math.round(track.scrollLeft / Math.max(track.clientWidth, 1))
      ));
      dots.querySelectorAll(".routine-content-dot").forEach((dot, dotIndex) => {
        dot.classList.toggle("is-active", dotIndex === index);
        dot.setAttribute("aria-current", dotIndex === index ? "true" : "false");
      });
    };

    track.addEventListener("scroll", setActiveDot, { passive: true });
    requestAnimationFrame(setActiveDot);

    carousel.append(heading, track, dots);
    chat.appendChild(carousel);
  }

  if (mediaBlocks.length) {
    const materials = document.createElement("section");
    materials.className = "native-section materials-section";
    materials.innerHTML = `
      <div class="native-section-heading">
        <div>
          <h3>Materiales para hoy</h3>
        </div>
        <small class="section-count">${mediaBlocks.length}</small>
      </div>
    `;

    if (materialIntroBlocks.length) {
      const introText = document.createElement("p");
      introText.className = "materials-intro";
      introText.textContent = materialIntroBlocks
        .map(block => stripDecorativeSymbols(block.content))
        .join(" ");
      materials.querySelector(".native-section-heading > div").appendChild(introText);
    }

    const list = document.createElement("div");
    list.className = "resource-sequence";
    mediaBlocks.forEach((block, index) => {
      list.appendChild(createCompactMediaItem(block, index + 1, mediaBlocks));
    });
    materials.appendChild(list);
    chat.appendChild(materials);
  }

  actionBlocks.forEach(block => chat.appendChild(createBlock(block)));

  if (completeBlock) {
    chat.appendChild(createBlock(completeBlock));
  }

  const progressButton = document.createElement("button");
  progressButton.type = "button";
  progressButton.className = "native-day-progress-button";
  progressButton.innerHTML = `<span>${ICONS.calendar}</span><strong>Ver progreso de ${TOTAL_PROGRAM_DAYS} días</strong><span aria-hidden="true">${ICONS.arrow}</span>`;
  progressButton.onclick = () => activateMainView("rutina");
  chat.appendChild(progressButton);

  revealIndex = blocks.length;
  updateProgress();
  updateFavoriteButtons();
}

function scrollToTodayContent({ markOpened = true } = {}) {
  if (markOpened) {
    markCurrentDayOpened();
  }

  if (!chat.children.length) {
    renderStructuredDayDetail();
  }

  const target =
    chat.querySelector(".objective-card") ||
    chat.querySelector(".native-section") ||
    chatWrap;

  target?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function setupContinuousDayOpenTracking() {
  if (!("IntersectionObserver" in window) || !chatWrap) return;

  let opened = false;

  const observer = new IntersectionObserver(
    entries => {
      const entry = entries[0];
      if (!entry?.isIntersecting || opened) return;

      opened = true;
      markCurrentDayOpened();
      observer.disconnect();
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -12% 0px"
    }
  );

  observer.observe(chatWrap);
}

function updateProgress() {
  const blocks = currentBlocks();
  progressText.textContent =
    `${Math.min(revealIndex, blocks.length)}/${blocks.length} bloques`;
}

function renderSelectedDayHeader() {
  const day = days[selectedDay];

  renderHomeRoutineSummary(selectedDay, day);

  if (dailyNativeDayLabel) {
    dailyNativeDayLabel.textContent = `Día ${selectedDay} de ${TOTAL_PROGRAM_DAYS}`;
  }

  if (dailyNativeRoutineTitle) {
    dailyNativeRoutineTitle.textContent = getActiveRoutineConfig().title;
  }

  if (chatTitle) chatTitle.textContent = day.title;

  localStorage.setItem(
    "selectedDay",
    String(selectedDay)
  );
}

function openNativeDayView({ markOpened = true } = {}) {
  const homeView = document.getElementById("view-hoy");
  homeView?.classList.add("day-open");
  if (dailyNativeHeader) dailyNativeHeader.hidden = false;

  if (markOpened) {
    markCurrentDayOpened();
  }

  if (!chat.children.length) {
    renderStructuredDayDetail();
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  requestAnimationFrame(() => {
    if (!prefersReducedMotion() && chatWrap?.animate) {
      chatWrap.animate(
        [
          { opacity: .74, transform: "translate3d(14px, 2px, 0)" },
          { opacity: 1, transform: "translate3d(0, 0, 0)" }
        ],
        { duration: 220, easing: "cubic-bezier(.22,.8,.24,1)" }
      );
    }
  });
}

function closeNativeDayView() {
  const homeView = document.getElementById("view-hoy");
  homeView?.classList.remove("day-open");
  if (dailyNativeHeader) dailyNativeHeader.hidden = true;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function startProgressive() {
  openNativeDayView({ markOpened: true });
}

function selectDay(day, showImmediately = false) {
  if (!days[day]) return;

  if (!isPreviewMode) {
    const state = getRoutineState();

    if (day > state.currentDay) {
      toast("Este día todavía no está disponible.");
      return;
    }
  }

  selectedDay = day;
  renderSelectedDayHeader();

  document
    .querySelector('[data-view="hoy"]')
    .click();

  chat.innerHTML = "";
  chat.className = "daily-detail continuous-day-detail";
  revealIndex = 0;
  renderStructuredDayDetail();

  if (showImmediately) {
    setTimeout(() => {
      openNativeDayView({ markOpened: true });
    }, 70);
  }
}
