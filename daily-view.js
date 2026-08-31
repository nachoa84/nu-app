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
  item.append(preview, main, disclosure);
  updateFavoriteButtons();
  return item;
}

function normalizeRoutineText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function naturalRoutineParagraphs(value) {
  return normalizeRoutineText(value)
    .split(/\n\s*\n/)
    .map(paragraph =>
      paragraph
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/[*_`~]+/g, "")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trim()
    )
    .filter(paragraph => paragraph && !/^-{2,}$/.test(paragraph));
}

function cleanLeadingSymbols(value) {
  return String(value || "")
    .replace(/^[\s✅☑️✔️✨🔥🚀🙌🏻🧡💛]+/u, "")
    .trim();
}

function firstMeaningfulLine(content) {
  const line = normalizeRoutineText(content)
    .split(/\n+/)
    .map(value => cleanLeadingSymbols(value))
    .find(Boolean) || "Tu acción de hoy";

  return line.length > 68 ? `${line.slice(0, 65)}…` : line;
}

function isImportedCollagenContentDay() {
  return getActiveRoutineId() === "collagen-30" && Number(selectedDay) >= 8;
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
    setupAnimatedDetails(details);
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
  setupAnimatedDetails(details);

  return details;
}

function appendFormattedContent(container, content, options = {}) {
  const { dropFirstParagraph = false } = options;
  let paragraphs = naturalRoutineParagraphs(content);

  if (dropFirstParagraph) {
    paragraphs = paragraphs.slice(1);
  }

  paragraphs.forEach(paragraph => {
    if (/^(✅|☑️|✔️)/u.test(paragraph)) {
      const check = document.createElement("div");
      check.className = "native-check-item";
      check.innerHTML = `
        <span class="native-check-icon" aria-hidden="true">${ICONS.checkCircleFilled}</span>
        <span>${paragraph.replace(/^(✅|☑️|✔️)\s*/u, "")}</span>
      `;
      container.appendChild(check);
      return;
    }

    const isLabel =
      paragraph.length < 34 &&
      /^[A-ZÁÉÍÓÚÜÑ0-9\s:]+$/u.test(paragraph);
    const element = document.createElement(isLabel ? "div" : "p");
    element.className = isLabel
      ? "native-detail-label"
      : "native-detail-paragraph";
    element.textContent = paragraph;
    container.appendChild(element);
  });
}

function isQuestionAnswerContent(value) {
  const text = normalizeRoutineText(value).toLowerCase();
  if (!text) return false;

  const explicitQa =
    /\bq\s*&\s*a\b|preguntas?\s+frecuentes|preguntas?\s+y\s+respuestas?|pregunta\s*[:\-]|respuesta\s*[:\-]/i.test(text);
  const questionCount = (text.match(/[¿?]/g) || []).length;
  const answerSignals = (
    text.match(
      /\b(?:sí|si|no|porque|puede|puedes|debe|debes|recomendamos|respuesta)\b/gi
    ) || []
  ).length;

  return (
    explicitQa ||
    questionCount >= 3 ||
    (questionCount >= 2 && answerSignals >= 2)
  );
}

function estimateRoutineVisualLines(value, qa = false) {
  const text = naturalRoutineParagraphs(value).join("\n\n");
  if (!text) return 0;

  const charsPerLine = qa ? 45 : 40;
  return text
    .split(/\n\s*\n/)
    .reduce(
      (sum, paragraph) =>
        sum + Math.max(1, Math.ceil(paragraph.length / charsPerLine)) + 0.35,
      0
    );
}

function splitRoutineVisualUnit(value, qa, lineBudget) {
  const text = naturalRoutineParagraphs(value).join(" ");
  if (!text) return [];
  if (estimateRoutineVisualLines(text, qa) <= lineBudget) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  const units = [];
  let current = "";

  words.forEach(word => {
    const candidate = current ? `${current} ${word}` : word;
    if (
      current &&
      estimateRoutineVisualLines(candidate, qa) > lineBudget
    ) {
      units.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });

  if (current) units.push(current);
  return units;
}

function routineTextUnits(value, qa) {
  const paragraphs = naturalRoutineParagraphs(value);
  if (!paragraphs.length) return [];

  if (qa) {
    const units = [];
    for (let index = 0; index < paragraphs.length; index += 1) {
      const paragraph = paragraphs[index];
      if (
        paragraph.includes("?") &&
        paragraphs[index + 1] &&
        !paragraphs[index + 1].includes("?")
      ) {
        units.push(`${paragraph}\n\n${paragraphs[index + 1]}`);
        index += 1;
      } else {
        units.push(paragraph);
      }
    }
    return units.flatMap(unit =>
      splitRoutineVisualUnit(unit, true, 5.2)
    );
  }

  return paragraphs.flatMap(paragraph => {
    const sentences = paragraph
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡0-9])/u)
      .map(sentence => sentence.trim())
      .filter(Boolean);

    return (sentences.length ? sentences : [paragraph]).flatMap(sentence =>
      splitRoutineVisualUnit(sentence, false, 4.8)
    );
  });
}

function balanceRoutineTextPool(pool, qa) {
  if (!pool.length) return [];

  const targetLines = qa ? 10.2 : 8.2;
  const units = [];

  pool.forEach(block => {
    routineTextUnits(block.content, qa).forEach(content => {
      units.push({
        content,
        cost: estimateRoutineVisualLines(content, qa),
        block
      });
    });
  });

  if (!units.length) return [];

  const totalCost = units.reduce((sum, unit) => sum + unit.cost, 0);
  const groupCount = Math.max(1, Math.ceil(totalCost / targetLines));
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
    const groupsLeft = groupCount - groups.length;
    const remainingCost = totalCost - consumedCost;
    const dynamicTarget = remainingCost / Math.max(groupsLeft, 1);
    const candidateCost = currentCost + unit.cost;
    const canStillCut = groups.length < groupCount - 1;
    const unitsLeft = units.length - index;
    const groupsNeeded = groupCount - groups.length;

    if (
      current.length &&
      canStillCut &&
      unitsLeft >= groupsNeeded
    ) {
      const beforeDifference = Math.abs(dynamicTarget - currentCost);
      const afterDifference = Math.abs(dynamicTarget - candidateCost);
      if (
        beforeDifference <= afterDifference &&
        currentCost >= dynamicTarget * 0.58
      ) {
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
    output.push(...balanceRoutineTextPool(pool, Boolean(poolQa)));
    pool = [];
    poolQa = null;
  };

  blocks.forEach(block => {
    const normalized = normalizeRoutineText(block.content);
    if (!normalized) return;

    if (block.links?.length) {
      flushPool();
      const qa = isQuestionAnswerContent(normalized);
      const linkedCards = balanceRoutineTextPool(
        [{ ...block, content: normalized, links: [] }],
        qa
      );
      linkedCards.forEach((linkedCard, index) => {
        output.push({
          ...linkedCard,
          links: index === linkedCards.length - 1 ? block.links : []
        });
      });
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

function isMaterialTransitionBlock(block) {
  if (!block || block.type !== "text" || block.links?.length) return false;

  const text = naturalRoutineParagraphs(block.content).join(" ");
  if (!text || text.length > 180) return false;

  return (
    /^(?:ahora\s+s[ií][,:\s-]*)?(?:el\s+)?contenido(?:\s*\.{2,})?$/i.test(
      text
    ) ||
    /(?:material(?:es)?|contenido).{0,80}(?:hoy|publicar|mercadeo|redes|stories|estados)|(?:publica|publicar|subas?).{0,80}(?:redes|estados|stories|contenido|material)/i.test(
      text
    )
  );
}

function createRoutineContentCard(block) {
  const card = document.createElement("section");
  card.className = "routine-content-card";

  const qa = isQuestionAnswerContent(block.content);
  card.classList.toggle("is-qa", qa);

  const body = document.createElement("div");
  body.className = "routine-content-card-body";
  appendFormattedContent(body, block.content);
  addLinks(body, block.links);
  card.appendChild(body);

  return card;
}

function createRoutineContentCarousel(textBlocks) {
  const carousel = document.createElement("section");
  carousel.className = "routine-content-carousel";
  carousel.setAttribute("aria-label", "Contenido de la rutina");

  const heading = document.createElement("h3");
  heading.className = "routine-content-heading";
  heading.textContent = "Contenido del día";

  const track = document.createElement("div");
  track.className = "routine-content-track";
  track.tabIndex = 0;
  track.setAttribute("aria-label", "Cards de contenido");

  textBlocks.forEach((block, index) => {
    const slide = document.createElement("article");
    slide.className = "routine-content-slide";
    slide.dataset.slideIndex = String(index);
    slide.setAttribute(
      "aria-label",
      `Contenido ${index + 1} de ${textBlocks.length}`
    );
    slide.appendChild(createRoutineContentCard(block));
    track.appendChild(slide);
  });

  const navigation = document.createElement("div");
  navigation.className = "routine-content-navigation";

  const previous = document.createElement("button");
  previous.type = "button";
  previous.className = "routine-content-arrow routine-content-previous";
  previous.setAttribute("aria-label", "Ver contenido anterior");
  previous.innerHTML = ICONS.back;

  const dots = document.createElement("div");
  dots.className = "routine-content-dots";
  dots.setAttribute("aria-label", "Navegación del contenido");

  const next = document.createElement("button");
  next.type = "button";
  next.className = "routine-content-arrow routine-content-next";
  next.setAttribute("aria-label", "Ver contenido siguiente");
  next.innerHTML = ICONS.arrow;

  const dotButtons = textBlocks.map((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "routine-content-dot";
    dot.setAttribute("aria-label", `Ver contenido ${index + 1}`);
    dots.appendChild(dot);
    return dot;
  });

  let activeIndex = 0;

  const renderNavigationState = index => {
    activeIndex = Math.max(0, Math.min(textBlocks.length - 1, index));
    dotButtons.forEach((dot, dotIndex) => {
      const active = dotIndex === activeIndex;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
    previous.disabled = activeIndex === 0;
    next.disabled = activeIndex === textBlocks.length - 1;
  };

  const goTo = index => {
    const target = Math.max(0, Math.min(textBlocks.length - 1, index));
    track.scrollTo({
      left: track.clientWidth * target,
      behavior: prefersReducedMotion() ? "auto" : "smooth"
    });
    renderNavigationState(target);
  };

  dotButtons.forEach((dot, index) => {
    dot.addEventListener("click", () => goTo(index));
  });
  previous.addEventListener("click", () => goTo(activeIndex - 1));
  next.addEventListener("click", () => goTo(activeIndex + 1));

  track.addEventListener(
    "scroll",
    () => {
      const index = Math.round(
        track.scrollLeft / Math.max(track.clientWidth, 1)
      );
      renderNavigationState(index);
    },
    { passive: true }
  );
  track.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(activeIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(activeIndex + 1);
    }
  });

  navigation.append(previous, dots, next);
  carousel.append(heading, track, navigation);
  renderNavigationState(0);
  return carousel;
}

function createObjectiveCard(block) {
  if (isImportedCollagenContentDay()) {
    return createImportedObjectiveCard(block);
  }

  const card = document.createElement("section");
  card.className = "objective-card";

  const header = document.createElement("div");
  header.className = "objective-card-header";
  header.innerHTML = `
    <div>
      <span>Objetivo</span>
      <h3>${getRoutineDayObjectiveV92a(selectedDay, DAY_OBJECTIVES[selectedDay] || firstMeaningfulLine(block.content))}</h3>
    </div>
  `;

  card.appendChild(header);

  const fullText = String(block.content || "").trim();
  if (fullText && !block.hideObjectiveDetailsV97a) {
    const details = document.createElement("details");
    details.className = "native-details";

    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="details-label">Ver detalles</span><span class="details-arrow">${ICONS.down}</span>`;

    const body = document.createElement("div");
    body.className = "native-details-body";
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
  setupAnimatedDetails(details);
  return details;
}

function renderStructuredDayDetail() {
  const blocks = currentBlocks();
  const rawTextBlocks = blocks.filter(block => block.type === "text");
  const materialIntroBlocks = rawTextBlocks.filter(
    isMaterialTransitionBlock
  );
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
        <p>Tu acción de hoy</p>
      </div>
      <div class="native-day-hero-media" aria-hidden="true">
        <img src="${getRoutineHeroV92a()}" alt="" />
      </div>
    </div>
    <div class="native-day-progress-row">
      <div class="native-day-progress" aria-label="Progreso: ${selectedDay} de ${TOTAL_PROGRAM_DAYS}">
        <span style="width:${Math.min(100, Math.round((selectedDay / TOTAL_PROGRAM_DAYS) * 100))}%"></span>
      </div>
      <small>${selectedDay} de ${TOTAL_PROGRAM_DAYS}</small>
    </div>
  `;
  chat.appendChild(intro);

  if (textBlocks.length) {
    chat.appendChild(createRoutineContentCarousel(textBlocks));
  }

  if (mediaBlocks.length) {
    const materials = document.createElement("section");
    materials.className = "native-section materials-section";
    materials.innerHTML = `
      <div class="native-section-heading">
        <div>
          <h3>Materiales para hoy</h3>
        </div>
      </div>
    `;

    if (materialIntroBlocks.length) {
      const intro = document.createElement("p");
      intro.className = "materials-intro";
      intro.textContent = materialIntroBlocks
        .flatMap(block => naturalRoutineParagraphs(block.content))
        .join(" ");
      materials
        .querySelector(".native-section-heading > div")
        .appendChild(intro);
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
