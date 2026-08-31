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
      if (animate) {
        setTimeout(() => card.classList.remove("just-completed"), 620);
      }
    };

    if (done) {
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

    btn.onclick = () => {
      setDayComplete(selectedDay, true);
      if (navigator.vibrate) navigator.vibrate(12);
      renderDoneState({ animate: true });
      renderDays();

      if (window.BackendAPI && isBackendManagedRoutine()) {
        window.BackendAPI
          .completeDay(selectedDay)
          .catch(error => {
            console.warn(
              "No se pudo sincronizar el completado con el backend.",
              error
            );
          });
      }
    };

    card.append(btn, helper);
    return card;
  }
}

function createCompactMediaItem(block, order, mediaBlocks) {
  // NU APP · MATERIALES MULTIRUTINA V92D
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
    // Ver comentario en favorites.js / swapVideoForCapturedFrame (ui-core.js):
    // sin poster, esta miniatura recortada quedaría como un <video> real,
    // y en Android Chrome ese <video> puede ignorar el overflow:hidden del
    // contenedor y asomar por fuera del recuadro redondeado. Se reemplaza
    // por una <img> con el primer frame capturado a canvas.
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

function stripDecorativeSymbols(value) {
  return String(value || "")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .replace(/^[\s•·▪▫◦‣⁃→➜➤✔✓✅☑️]+/u, "")
    .replace(/([!?¡¿])\1{1,}/gu, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanLeadingSymbols(value) {
  return stripDecorativeSymbols(value);
}

function firstMeaningfulLine(content) {
  const line = String(content || "")
    .split(/\n+/)
    .map(value => cleanLeadingSymbols(value))
    .find(Boolean) || "Tu acción de hoy";

  return line.length > 68 ? `${line.slice(0, 65)}…` : line;
}

function isImportedCollagenContentDay() {
  return getActiveRoutineId() === "collagen-30" && Number(selectedDay) >= 8;
}

function importedTextParts(content, { stripStepNumber = false } = {}) {
  const normalized = String(content || "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const firstIndex = lines.findIndex(line => cleanLeadingSymbols(line));

  if (firstIndex === -1) {
    return {
      heading: "Tu acción de hoy",
      body: ""
    };
  }

  let heading = cleanLeadingSymbols(lines[firstIndex]);

  // Elimina hashtags sueltos al inicio: #Texto o # Texto.
  heading = heading
    .replace(/^#+\s*/u, "")
    .trim();

  if (stripStepNumber) {
    // Elimina numeraciones importadas como:
    // 2️⃣ Texto, 2. Texto, 2) Texto, Paso 2: Texto.
    heading = heading
      .replace(/^\s*\d+\ufe0f?\u20e3\s*/u, "")
      .replace(
        /^\s*(?:paso\s*)?#?\d+\s*(?:[.)\-:–—]\s*|\s+)/iu,
        ""
      )
      .trim();
  }

  // Conserva todo lo que viene después de la primera línea.
  // No elimina el primer párrafo completo.
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

function createImportedObjectiveCard(block) {
  const {
    heading,
    body: detailText
  } = importedTextParts(block.content);

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
    summary.innerHTML = `
      <span class="details-label">Ver detalles</span>
      <span class="details-arrow">${ICONS.down}</span>
    `;

    const body = document.createElement("div");
    body.className = "native-details-body";

    appendFormattedContent(body, detailText);
    addLinks(body, block.links);

    details.addEventListener("toggle", () => {
      const label = summary.querySelector(".details-label");

      if (label) {
        label.textContent = details.open
          ? "Ocultar detalles"
          : "Ver detalles";
      }
    });

    details.append(summary, body);
    details.open = true;
    setupAnimatedDetails(details);
    setupFiveLineExpansion(card, body);
    card.appendChild(details);
  }

  return card;
}

function createImportedActionStep(block, index) {
  const {
    heading,
    body: detailText
  } = importedTextParts(
    block.content,
    { stripStepNumber: true }
  );

  const hasDetails =
    Boolean(detailText) ||
    Boolean(block.links?.length);

  if (!hasDetails) {
    const row = document.createElement("div");
    row.className = "action-step action-step-static";

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
  details.className = "action-step";

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
  details.open = true;
  setupAnimatedDetails(details);
  setupFiveLineExpansion(details, body);

  return details;
}

function appendFormattedContent(container, content, options = {}) {
  const { dropFirstParagraph = false } = options;
  let paragraphs = String(content || "")
    .split(/\n\s*\n/)
    .map(value => value.trim())
    .filter(Boolean);

  if (dropFirstParagraph) {
    paragraphs = paragraphs.slice(1);
  }

  paragraphs.forEach(paragraph => {
    const lines = paragraph
      .split(/\n+/)
      .map(value => value.trim())
      .filter(Boolean);

    lines.forEach(line => {
      const normalizedLine = stripDecorativeSymbols(line);
      if (!normalizedLine) return;

      const isLabel = normalizedLine.length < 34 && /^[A-ZÁÉÍÓÚÜÑ0-9\s:]+$/u.test(normalizedLine);
      const element = document.createElement(isLabel ? "div" : "p");
      element.className = isLabel ? "native-detail-label" : "native-detail-paragraph";
      element.textContent = normalizedLine;
      container.appendChild(element);
    });
  });
}

function createObjectiveCard(block) {
  const { heading, body: detailText } = importedTextParts(block.content);
  const card = document.createElement("section");
  card.className = "objective-card";

  const header = document.createElement("div");
  header.className = "objective-card-header";
  const title = document.createElement("h3");
  title.textContent = heading;
  header.appendChild(title);
  card.appendChild(header);

  if ((detailText || block.links?.length) && !block.hideObjectiveDetailsV97a) {
    const details = document.createElement("details");
    details.className = "native-details";

    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="details-label">Ver detalles</span><span class="details-arrow">${ICONS.down}</span>`;

    const body = document.createElement("div");
    body.className = "native-details-body";
    appendFormattedContent(body, detailText);
    addLinks(body, block.links);

    details.addEventListener("toggle", () => {
      const label = summary.querySelector(".details-label");
      if (label) label.textContent = details.open ? "Ocultar detalles" : "Ver detalles";
    });

    details.append(summary, body);
    details.open = true;
    setupAnimatedDetails(details);
    setupFiveLineExpansion(card, body);
    card.appendChild(details);
  }

  return card;
}

function createActionStep(block, index) {
  if (isImportedCollagenContentDay()) {
    return createImportedActionStep(block, index);
  }

  const paragraphs = String(block.content || "")
    .split(/\n\s*\n/)
    .map(value => value.trim())
    .filter(Boolean);
  const hasDetails = paragraphs.length > 1 || Boolean(block.links?.length);

  if (!hasDetails) {
    const row = document.createElement("div");
    row.className = "action-step action-step-static";
    row.innerHTML = `
      <div class="action-step-static-row">
        <span class="action-step-number">${index}</span>
        <span class="action-step-title">${firstMeaningfulLine(block.content)}</span>
      </div>
    `;
    return row;
  }

  const details = document.createElement("details");
  details.className = "action-step";

  const summary = document.createElement("summary");
  summary.innerHTML = `
    <span class="action-step-number">${index}</span>
    <span class="action-step-title">${firstMeaningfulLine(block.content)}</span>
    <span class="action-step-arrow">${ICONS.down}</span>
  `;

  const body = document.createElement("div");
  body.className = "action-step-body";
  appendFormattedContent(body, block.content, { dropFirstParagraph: true });
  addLinks(body, block.links);

  details.append(summary, body);
  details.open = true;
  setupAnimatedDetails(details);
  setupFiveLineExpansion(details, body);
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
      const activeSlide = track.children[index];
      if (activeSlide) {
        track.style.height = `${activeSlide.offsetHeight}px`;
      }
      dots.querySelectorAll(".routine-content-dot").forEach((dot, dotIndex) => {
        dot.classList.toggle("is-active", dotIndex === index);
        dot.setAttribute("aria-current", dotIndex === index ? "true" : "false");
      });
    };
    track.addEventListener("scroll", setActiveDot, { passive: true });
    window.addEventListener("resize", setActiveDot, { passive: true });
    requestAnimationFrame(() => requestAnimationFrame(setActiveDot));

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
