// Vista del día actual
// Render canónico compartido por todas las rutinas.

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

function normalizeRoutineText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<<inline-button-anchor:[^>]*>>/gi, "")
    .replace(/\uFFFD/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLeadingSymbols(value) {
  return normalizeRoutineText(value)
    .replace(/^#+\s*/u, "")
    .replace(/^[\s✅☑️✔️✨🔥🚀🙌🏻🙌🏼🧡💛🍊📌🖱️❗]+/u, "")
    .trim();
}

function firstMeaningfulLine(content) {
  const line = normalizeRoutineText(content)
    .split(/\n+/)
    .map(value => cleanLeadingSymbols(value))
    .find(Boolean) || "Tu acción de hoy";

  return line.length > 78 ? `${line.slice(0, 75).trim()}…` : line;
}

function usesImportedRoutineCopy() {
  return getActiveRoutineId() !== "collagen-30" || Number(selectedDay) >= 8;
}

function isQuestionAnswerContent(content) {
  const text = normalizeRoutineText(content);
  const lower = text.toLowerCase();
  const questionCount = (text.match(/¿/g) || []).length + (text.match(/\?/g) || []).length;

  return /\bq\s*&\s*a\b|preguntas frecuentes|preguntas y respuestas|faq/.test(lower) || questionCount >= 4;
}

function importedTextParts(content, { stripStepNumber = false } = {}) {
  const normalized = normalizeRoutineText(content);
  const lines = normalized.split("\n");
  const firstIndex = lines.findIndex(line => cleanLeadingSymbols(line));

  if (firstIndex === -1) {
    return { heading: "Tu acción de hoy", body: "" };
  }

  let heading = cleanLeadingSymbols(lines[firstIndex])
    .replace(/^#+\s*/u, "")
    .trim();

  if (stripStepNumber) {
    heading = heading
      .replace(/^\s*\d+\ufe0f?\u20e3\s*/u, "")
      .replace(/^\s*(?:paso\s*)?#?\d+\s*(?:[.)\-:–—]\s*|\s+)/iu, "")
      .trim();
  }

  return {
    heading: heading || "Tu acción de hoy",
    body: lines.slice(firstIndex + 1).join("\n").trim()
  };
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
    a.textContent = normalizeRoutineText(link.label);
    a.className = "resource-link-main";

    const favoriteKey = `link:${link.url}`;
    const saved = isFavorite(favoriteKey, selectedDay);
    const save = document.createElement("button");
    save.type = "button";
    save.className = `resource-link-save${saved ? " is-saved" : ""}`;
    save.dataset.favoriteSrc = favoriteKey;
    save.dataset.favoriteDay = String(selectedDay);
    save.setAttribute("aria-label", saved ? "Quitar enlace de favoritos" : "Guardar enlace en favoritos");
    save.innerHTML = saved ? ICONS.bookmarkFilled : ICONS.bookmark;
    save.onclick = () => saveFavorite(favoriteKey, link.label, "link", selectedDay, link.url);

    row.append(a, save);
    wrap.appendChild(row);
  });

  container.appendChild(wrap);
}

function createBlock(block) {
  if (block.type === "action") {
    const card = document.createElement("section");
    card.className = "training-card";

    const heading = document.createElement("div");
    heading.className = "training-card-heading";
    const kicker = document.createElement("span");
    kicker.textContent = "Capacitación";
    const title = document.createElement("strong");
    title.textContent = normalizeRoutineText(block.label);
    heading.append(kicker, title);

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
      btn.onclick = () => toast("Esta capacitación todavía está pendiente de cargar.");
    }

    card.append(heading, btn);
    return card;
  }

  if (block.type === "complete") {
    const card = document.createElement("div");
    card.className = "complete-card";
    const done = isDayComplete(selectedDay);

    const renderDoneState = ({ animate = false } = {}) => {
      card.classList.add("done");
      card.classList.toggle("just-completed", animate && !prefersReducedMotion());
      card.innerHTML = `
        <div class="complete-done-copy">
          <h3><span class="complete-done-inline-check" aria-hidden="true">${ICONS.check}</span><span>Hecho hoy</span></h3>
          <p>Registrado.</p>
        </div>
      `;
      if (animate) setTimeout(() => card.classList.remove("just-completed"), 620);
    };

    if (done) {
      renderDoneState();
      return card;
    }

    card.innerHTML = `<h3>¿Lo hiciste?</h3><p>Registrá tu avance.</p>`;

    const btn = document.createElement("button");
    btn.className = "primary complete-day-btn";
    btn.innerHTML = `<span class="complete-action-check" aria-hidden="true">${ICONS.check}</span><span>Hoy lo hice</span>`;

    const helper = document.createElement("small");
    helper.className = "complete-helper";
    helper.textContent = "Solo registra tu avance";

    btn.onclick = () => {
      setDayComplete(selectedDay, true);
      if (navigator.vibrate) navigator.vibrate(12);
      renderDoneState({ animate: true });
      renderDays();

      if (window.BackendAPI && isBackendManagedRoutine()) {
        window.BackendAPI.completeDay(selectedDay).catch(error => {
          console.warn("No se pudo sincronizar el completado con el backend.", error);
        });
      }
    };

    card.append(btn, helper);
    return card;
  }
}

function createCompactMediaItem(block, order, mediaBlocks) {
  const materialTitle = getActiveRoutineId() === "collagen-30"
    ? normalizeRoutineText(block.label)
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

  const videoPoster = block.mediaType === "video" ? resolveRoutineVideoPoster(block.src, block.poster) : null;
  const usePosterImage = block.mediaType === "video" && Boolean(videoPoster);
  const media = block.mediaType === "video" && !usePosterImage ? document.createElement("video") : document.createElement("img");
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
  const strong = document.createElement("strong");
  strong.textContent = materialTitle;
  const type = document.createElement("span");
  type.textContent = block.mediaType === "video" ? "Video" : "Imagen";
  copy.append(strong, type);

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
      saveFavorite(block.src, block.label, block.mediaType, selectedDay);
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
    if (!event.target.closest(".resource-action-btn")) openPreview();
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

function appendFormattedContent(container, content, options = {}) {
  const { dropFirstParagraph = false } = options;
  let paragraphs = normalizeRoutineText(content)
    .split(/\n\s*\n/)
    .map(value => value.trim())
    .filter(value => value && !/^[-–—]{2,}$/.test(value));

  if (dropFirstParagraph) paragraphs = paragraphs.slice(1);

  paragraphs.forEach(paragraph => {
    paragraph
      .split(/\n+/)
      .map(value => normalizeRoutineText(value))
      .filter(value => value && !/^[-–—]{2,}$/.test(value))
      .forEach(line => {
        if (/^(✅|☑️|✔️)/u.test(line)) {
          const check = document.createElement("div");
          check.className = "native-check-item";
          const icon = document.createElement("span");
          icon.className = "native-check-icon";
          icon.setAttribute("aria-hidden", "true");
          icon.innerHTML = ICONS.checkCircleFilled;
          const text = document.createElement("span");
          text.textContent = line.replace(/^(✅|☑️|✔️)\s*/u, "");
          check.append(icon, text);
          container.appendChild(check);
          return;
        }

        const isLabel = line.length < 34 && /^[A-ZÁÉÍÓÚÜÑ0-9\s:]+$/u.test(line);
        const element = document.createElement(isLabel ? "div" : "p");
        element.className = isLabel ? "native-detail-label" : "native-detail-paragraph";
        element.textContent = line;
        container.appendChild(element);
      });
  });
}

function createImportedObjectiveCard(block) {
  const { heading, body: detailText } = importedTextParts(block.content);
  const card = document.createElement("section");
  card.className = "objective-card";

  const header = document.createElement("div");
  header.className = "objective-card-header";
  const copy = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.textContent = "Objetivo";
  const title = document.createElement("h3");
  title.textContent = heading;
  copy.append(eyebrow, title);
  header.appendChild(copy);
  card.appendChild(header);

  if (detailText || block.links?.length) {
    const details = document.createElement("details");
    details.className = "native-details";
    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="details-label">Ver detalles</span><span class="details-arrow">${ICONS.down}</span>`;
    const body = document.createElement("div");
    body.className = "native-details-body";
    if (isQuestionAnswerContent(block.content)) body.classList.add("is-qa-copy");
    appendFormattedContent(body, detailText);
    addLinks(body, block.links);

    details.addEventListener("toggle", () => {
      const label = summary.querySelector(".details-label");
      if (label) label.textContent = details.open ? "Ocultar detalles" : "Ver detalles";
    });

    details.append(summary, body);
    setupAnimatedDetails(details);
    card.appendChild(details);
  }

  return card;
}

function createImportedActionStep(block, index) {
  const { heading, body: detailText } = importedTextParts(block.content, { stripStepNumber: true });
  const hasDetails = Boolean(detailText) || Boolean(block.links?.length);
  const isQa = isQuestionAnswerContent(block.content);

  if (!hasDetails) {
    const row = document.createElement("div");
    row.className = `action-step action-step-static${isQa ? " is-qa" : ""}`;
    const inner = document.createElement("div");
    inner.className = "action-step-static-row";
    const number = document.createElement("span");
    number.className = "action-step-number";
    number.textContent = String(index);
    const title = document.createElement("span");
    title.className = "action-step-title";
    title.textContent = heading;
    inner.append(number, title);
    row.appendChild(inner);
    return row;
  }

  const details = document.createElement("details");
  details.className = `action-step${isQa ? " is-qa" : ""}`;
  const summary = document.createElement("summary");
  const number = document.createElement("span");
  number.className = "action-step-number";
  number.textContent = String(index);
  const title = document.createElement("span");
  title.className = "action-step-title";
  title.textContent = heading;
  const arrow = document.createElement("span");
  arrow.className = "action-step-arrow";
  arrow.innerHTML = ICONS.down;
  summary.append(number, title, arrow);

  const body = document.createElement("div");
  body.className = "action-step-body";
  appendFormattedContent(body, detailText);
  addLinks(body, block.links);
  details.append(summary, body);
  setupAnimatedDetails(details);
  return details;
}

function createObjectiveCard(block) {
  if (usesImportedRoutineCopy()) return createImportedObjectiveCard(block);

  const card = document.createElement("section");
  card.className = "objective-card";
  const header = document.createElement("div");
  header.className = "objective-card-header";
  const wrapper = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.textContent = "Objetivo";
  const title = document.createElement("h3");
  title.textContent = getRoutineDayObjectiveV92a(selectedDay, DAY_OBJECTIVES[selectedDay] || firstMeaningfulLine(block.content));
  wrapper.append(eyebrow, title);
  header.appendChild(wrapper);
  card.appendChild(header);

  const fullText = normalizeRoutineText(block.content);
  if (fullText && !block.hideObjectiveDetailsV97a) {
    const details = document.createElement("details");
    details.className = "native-details";
    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="details-label">Ver detalles</span><span class="details-arrow">${ICONS.down}</span>`;
    const body = document.createElement("div");
    body.className = "native-details-body";
    if (isQuestionAnswerContent(fullText)) body.classList.add("is-qa-copy");
    appendFormattedContent(body, fullText, { dropFirstParagraph: true });
    addLinks(body, block.links);
    details.addEventListener("toggle", () => {
      summary.querySelector(".details-label").textContent = details.open ? "Ocultar detalles" : "Ver detalles";
    });
    details.append(summary, body);
    setupAnimatedDetails(details);
    card.appendChild(details);
  }

  return card;
}

function createActionStep(block, index) {
  if (usesImportedRoutineCopy()) return createImportedActionStep(block, index);

  const normalized = normalizeRoutineText(block.content);
  const paragraphs = normalized.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
  const hasDetails = paragraphs.length > 1 || Boolean(block.links?.length);
  const isQa = isQuestionAnswerContent(normalized);

  if (!hasDetails) {
    const row = document.createElement("div");
    row.className = `action-step action-step-static${isQa ? " is-qa" : ""}`;
    row.innerHTML = `<div class="action-step-static-row"><span class="action-step-number">${index}</span><span class="action-step-title"></span></div>`;
    row.querySelector(".action-step-title").textContent = firstMeaningfulLine(normalized);
    return row;
  }

  const details = document.createElement("details");
  details.className = `action-step${isQa ? " is-qa" : ""}`;
  const summary = document.createElement("summary");
  summary.innerHTML = `<span class="action-step-number">${index}</span><span class="action-step-title"></span><span class="action-step-arrow">${ICONS.down}</span>`;
  summary.querySelector(".action-step-title").textContent = firstMeaningfulLine(normalized);
  const body = document.createElement("div");
  body.className = "action-step-body";
  appendFormattedContent(body, normalized, { dropFirstParagraph: true });
  addLinks(body, block.links);
  details.append(summary, body);
  setupAnimatedDetails(details);
  return details;
}

function renderStructuredDayDetail() {
  const blocks = currentBlocks();
  const textBlocks = blocks.filter(block => block.type === "text");
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
      <div class="native-day-hero-copy"><h2>Día ${selectedDay}</h2><p>Tu acción de hoy</p></div>
      <div class="native-day-hero-media" aria-hidden="true"><img src="${getRoutineHeroV92a()}" alt="" /></div>
    </div>
    <div class="native-day-progress-row">
      <div class="native-day-progress" aria-label="Progreso: ${selectedDay} de ${TOTAL_PROGRAM_DAYS}"><span style="width:${Math.min(100, Math.round((selectedDay / TOTAL_PROGRAM_DAYS) * 100))}%"></span></div>
      <small>${selectedDay} de ${TOTAL_PROGRAM_DAYS}</small>
    </div>`;
  chat.appendChild(intro);

  if (textBlocks.length) {
    const planGroup = document.createElement("section");
    planGroup.className = "day-plan-group";
    const objective = createObjectiveCard(textBlocks[0]);
    objective.classList.add("day-plan-objective");
    planGroup.appendChild(objective);

    if (textBlocks.length > 1) {
      const steps = document.createElement("section");
      steps.className = "native-section steps-section day-plan-steps";
      steps.innerHTML = `<div class="native-section-heading"><div><h3>Pasos de hoy</h3></div><small class="section-count">${textBlocks.length - 1}</small></div>`;
      const list = document.createElement("div");
      list.className = "action-step-list";
      textBlocks.slice(1).forEach((block, index) => list.appendChild(createActionStep(block, index + 1)));
      steps.appendChild(list);
      planGroup.appendChild(steps);
    }
    chat.appendChild(planGroup);
  }

  if (mediaBlocks.length) {
    const materials = document.createElement("section");
    materials.className = "native-section materials-section";
    materials.innerHTML = `<div class="native-section-heading"><div><h3>Materiales para hoy</h3></div><small class="section-count">${mediaBlocks.length}</small></div>`;
    const list = document.createElement("div");
    list.className = "resource-sequence";
    mediaBlocks.forEach((block, index) => list.appendChild(createCompactMediaItem(block, index + 1, mediaBlocks)));
    materials.appendChild(list);
    chat.appendChild(materials);
  }

  actionBlocks.forEach(block => chat.appendChild(createBlock(block)));
  if (completeBlock) chat.appendChild(createBlock(completeBlock));

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
  if (markOpened) markCurrentDayOpened();
  if (!chat.children.length) renderStructuredDayDetail();
  const target = chat.querySelector(".objective-card") || chat.querySelector(".native-section") || chatWrap;
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setupContinuousDayOpenTracking() {
  if (!("IntersectionObserver" in window) || !chatWrap) return;
  let opened = false;
  const observer = new IntersectionObserver(entries => {
    const entry = entries[0];
    if (!entry?.isIntersecting || opened) return;
    opened = true;
    markCurrentDayOpened();
    observer.disconnect();
  }, { threshold: 0.18, rootMargin: "0px 0px -12% 0px" });
  observer.observe(chatWrap);
}

function updateProgress() {
  const blocks = currentBlocks();
  progressText.textContent = `${Math.min(revealIndex, blocks.length)}/${blocks.length} bloques`;
}

function renderSelectedDayHeader() {
  const day = days[selectedDay];
  renderHomeRoutineSummary(selectedDay, day);
  if (dailyNativeDayLabel) dailyNativeDayLabel.textContent = `Día ${selectedDay} de ${TOTAL_PROGRAM_DAYS}`;
  if (dailyNativeRoutineTitle) dailyNativeRoutineTitle.textContent = getActiveRoutineConfig().title;
  if (chatTitle) chatTitle.textContent = day.title;
  localStorage.setItem("selectedDay", String(selectedDay));
}

function openNativeDayView({ markOpened = true } = {}) {
  const homeView = document.getElementById("view-hoy");
  homeView?.classList.add("day-open");
  if (dailyNativeHeader) dailyNativeHeader.hidden = false;
  if (markOpened) markCurrentDayOpened();
  if (!chat.children.length) renderStructuredDayDetail();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });

  requestAnimationFrame(() => {
    if (!prefersReducedMotion() && chatWrap?.animate) {
      chatWrap.animate([
        { opacity: .74, transform: "translate3d(14px, 2px, 0)" },
        { opacity: 1, transform: "translate3d(0, 0, 0)" }
      ], { duration: 220, easing: "cubic-bezier(.22,.8,.24,1)" });
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
  document.querySelector('[data-view="hoy"]').click();
  chat.innerHTML = "";
  chat.className = "daily-detail continuous-day-detail";
  revealIndex = 0;
  renderStructuredDayDetail();

  if (showImmediately) {
    setTimeout(() => openNativeDayView({ markOpened: true }), 70);
  }
}
