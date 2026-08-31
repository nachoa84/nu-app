// Rutina 30 Días · Vista de progreso/calendario
// Extraído de app.js sin reescribir la lógica.
// Se carga antes de app.js; sus dependencias se resuelven al ejecutarse renderDays().

function renderDays() {
  advanceRoutineIfEligible();

  const grid = document.getElementById("daysGrid");
  const state = getRoutineState();

  if (!grid) return;

  const routineHeaderKicker = document.getElementById("routineHeaderKicker");
  if (routineHeaderKicker) {
    routineHeaderKicker.textContent = getActiveRoutineConfig().title;
  }

  grid.innerHTML = "";
  grid.className = "app-routine";

  const progressValue = Math.min(
    100,
    Math.round((state.currentDay / TOTAL_PROGRAM_DAYS) * 100)
  );

  const currentComplete = isDayComplete(state.currentDay);

  const progressCard = document.createElement("section");
  progressCard.className = "app-progress-card";
  progressCard.innerHTML = `
    <div class="app-progress-row">
      <div>
        <span class="app-label">TU PROGRESO</span>
        <strong>Día ${state.currentDay} de ${TOTAL_PROGRAM_DAYS}</strong>
      </div>
      <span class="app-progress-percent">${progressValue}%</span>
    </div>
    <div class="app-progress-track" aria-label="Progreso ${progressValue}%">
      <span class="app-progress-fill" style="width:${progressValue}%"></span>
    </div>
  `;

  const progressFill = progressCard.querySelector(".app-progress-fill");
  if (progressFill && !prefersReducedMotion()) {
    progressFill.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      progressFill.style.width = `${progressValue}%`;
    }));
  }

  const todayCard = document.createElement("section");
  todayCard.className = "app-today-card";
  todayCard.innerHTML = `
    <button type="button" class="app-today-main" aria-label="Continuar día ${state.currentDay}">
      <span class="app-today-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5V7Z"/></svg>
      </span>
      <span class="app-today-copy">
        <strong>Continuar día ${state.currentDay}</strong>
        <small>Tu acción del día</small>
      </span>
      <span class="app-today-arrow" aria-hidden="true">${ICONS.arrow}</span>
    </button>
    <div class="app-checkin-area">
      <button type="button" class="app-checkin-btn${currentComplete ? " is-done" : ""}" ${currentComplete ? "disabled" : ""}>
        <span class="app-checkin-icon" aria-hidden="true">${currentComplete ? ICONS.checkCircleFilled : ICONS.check}</span>
        <span>${currentComplete ? "Hecho hoy" : "Hoy lo hice"}</span>
      </button>
    </div>
  `;

  todayCard.querySelector(".app-today-main").onclick = () => {
    selectDay(state.currentDay, true);
  };

  const checkinBtn = todayCard.querySelector(".app-checkin-btn");
  if (!currentComplete) {
    checkinBtn.onclick = () => {
      if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
      setDayComplete(state.currentDay, true);
      renderDays();

      if (window.BackendAPI && isBackendManagedRoutine()) {
        window.BackendAPI
          .completeDay(state.currentDay)
          .catch(error => {
            console.warn(
              "No se pudo sincronizar el completado con el backend.",
              error
            );
          });
      }
    };
  }

  const weeks = [];
  for (let start = 1, number = 1; start <= TOTAL_PROGRAM_DAYS; start += 7, number += 1) {
    weeks.push({ number, start, end: Math.min(start + 6, TOTAL_PROGRAM_DAYS) });
  }

  const weekCards = weeks.map(week => {
    const weekHasAvailableDay = isPreviewMode || week.start <= state.currentDay;

    const card = document.createElement("section");
    card.className =
      `app-week-card ${weekHasAvailableDay ? "app-week-open" : "app-week-locked-card"}`;

    const head = document.createElement("div");
    head.className =
      `app-week-open-head${weekHasAvailableDay ? "" : " app-week-locked-head"}`;

    head.innerHTML = `
      <div>
        <strong>Semana ${week.number}</strong>
        <span>Días ${week.start}–${week.end}</span>
      </div>
      ${weekHasAvailableDay ? "" : `<span class="app-week-lock" aria-label="Bloqueada">${ICONS.lock}</span>`}
    `;

    const weekDays = document.createElement("div");
    weekDays.className =
      `app-week-days${weekHasAvailableDay ? "" : " app-week-days-locked"}`;

    for (let day = week.start; day <= week.end; day++) {
      const hasContent = Boolean(days[day]);
      const available = hasContent && (isPreviewMode || day <= state.currentDay);
      const complete = isDayComplete(day);
      const current = day === state.currentDay;

      const dayButton = document.createElement("button");
      dayButton.type = "button";
      dayButton.className = "app-day-dot";
      dayButton.textContent = String(day);
      dayButton.setAttribute("aria-label", `Día ${day}`);

      if (complete) dayButton.classList.add("is-complete");
      if (current) dayButton.classList.add("is-current");

      if (!available) {
        dayButton.classList.add("is-future", "is-locked");
        dayButton.disabled = true;
        dayButton.setAttribute(
          "aria-label",
          hasContent ? `Día ${day} bloqueado` : `Día ${day} sin contenido`
        );
      } else {
        dayButton.onclick = () => {
          selectDay(day, true);
          renderDays();
        };
      }

      weekDays.appendChild(dayButton);
    }

    card.append(head, weekDays);
    return card;
  });

  grid.append(progressCard, todayCard, ...weekCards);
  ensureDemoControls();
}

// =========================================================
// Rutinas · normalización global de lectura
// Capa de compatibilidad cargada después de daily-view.js.
// =========================================================

const normalizeRoutineTextBaseV2 = normalizeRoutineText;
normalizeRoutineText = function normalizeRoutineTextV2(value) {
  return normalizeRoutineTextBaseV2(value)
    .replace(/#30d[ií]ascollagen\+?/gi, "Collagen+")
    .replace(/#wellspa(?:io)?10/gi, "WellSpa iO")
    .replace(/#galvanicspa10/gi, "Galvanic Spa")
    .replace(/#10lumispa(?:io)?/gi, "LumiSpa iO")
    .replace(/\bpersonailzada\b/gi, "personalizada")
    .replace(/\btestimonos\b/gi, "testimonios")
    .replace(/\bcon las cambios\b/gi, "con los cambios")
    .replace(/\ba traves\b/gi, "a través")
    .replace(/\bruning\b/gi, "running")
    .replace(/\besta interesado\b/gi, "está interesado")
    .replace(/\bcomo generar\b/gi, "Cómo generar")
    .replace(/\bcomo te gustaría\b/gi, "Cómo te gustaría")
    .replace(/\s{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
};

function routineQuestionParagraphs(value) {
  return normalizeRoutineText(value)
    .split(/\n\s*\n|\n(?=¿)/)
    .map(item => item.trim())
    .filter(Boolean);
}

isQuestionAnswerContent = function isQuestionAnswerContentV2(value) {
  const text = normalizeRoutineText(value);
  if (!text) return false;

  if (/\bq\s*&\s*a\b|preguntas?\s+frecuentes|preguntas?\s+y\s+respuestas?|pregunta\s*[:\-]|respuesta\s*[:\-]/i.test(text)) {
    return true;
  }

  const paragraphs = routineQuestionParagraphs(text);
  let pairs = 0;

  for (let index = 0; index < paragraphs.length - 1; index += 1) {
    const question = paragraphs[index];
    const answer = paragraphs[index + 1];
    const cleanQuestion = question.replace(/^[-•\s]+/, "").trim();
    const cleanAnswer = answer.replace(/^[-•\s]+/, "").trim();

    if (
      /[?]$/.test(cleanQuestion) &&
      !/[?]$/.test(cleanAnswer) &&
      cleanAnswer.length >= 18
    ) {
      pairs += 1;
      index += 1;
    }
  }

  return pairs >= 2;
};

function compactRoutineParagraphBreaks(value, preserveQa = false) {
  const text = normalizeRoutineText(value);
  if (!text) return "";

  if (preserveQa) {
    return text
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\n\s*[-–—]\s*/g, "\n")
      .trim();
  }

  return text
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function humanRoutineLinkLabel(label, url, index = 0, total = 1) {
  const rawLabel = String(label || "").trim();
  const href = String(url || "").trim();
  const combined = `${rawLabel} ${href}`.toLowerCase();

  if (/play\.google\.com/.test(combined)) return "Google Play";
  if (/apps\.apple\.com|app\s*store/.test(combined)) return "App Store";
  if (/youtu\.be|youtube\.com/.test(combined)) {
    return total > 1 ? `Tutorial ${index + 1}` : "Ver tutorial";
  }
  if (/drive\.google\.com/.test(combined)) return "Abrir carpeta";
  if (/canva\.com/.test(combined)) return "Abrir diseño";
  if (/e-lactancia/.test(combined)) return "Consultar e-lactancia";
  if (/\.pdf(?:$|\?)/.test(href.toLowerCase())) return "Abrir documento";
  if (!rawLabel || /^https?:\/\//i.test(rawLabel)) return "Abrir recurso";

  return rawLabel.replace(/^\[|\]$/g, "").trim();
}

function extractRoutineInlineLinks(content, links = []) {
  let text = String(content || "");
  const outputLinks = Array.isArray(links) ? links.map(link => ({ ...link })) : [];

  text = text.replace(/\[([^\]]+)\]\s*(https?:\/\/[^\s<>]+)/gi, (_, label, url) => {
    outputLinks.push({ label: label.trim(), url: url.trim() });
    return " ";
  });

  text = text.replace(/<<inline-button-anchor:[^>]+>>/gi, " ");
  text = text.replace(/\bLinks? de descarga\b\s*:?[\s\n]*/gi, " ");

  const deduped = [];
  const seen = new Set();
  outputLinks.forEach(link => {
    const url = String(link?.url || "").trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    deduped.push({ ...link, url });
  });

  return {
    content: text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim(),
    links: deduped
  };
}

const addLinksBaseV2 = addLinks;
addLinks = function addLinksV2(container, links) {
  if (!links || !links.length) return;
  const normalizedLinks = links.map((link, index) => ({
    ...link,
    label: humanRoutineLinkLabel(link.label, link.url, index, links.length)
  }));
  addLinksBaseV2(container, normalizedLinks);
};

const createBalancedTextCardBaseV2 = createBalancedTextCard;
createBalancedTextCard = function createBalancedTextCardV2(block, options = {}) {
  const extracted = extractRoutineInlineLinks(block?.content || "", block?.links || []);
  const qa = isQuestionAnswerContent(extracted.content);
  const normalizedBlock = {
    ...block,
    content: compactRoutineParagraphBreaks(extracted.content, qa),
    links: extracted.links
  };

  return createBalancedTextCardBaseV2(normalizedBlock, options);
};

function routineCharsPerLine(qa = false) {
  const track = document.querySelector("#view-hoy.day-open .routine-content-track");
  const width = Math.max(280, Math.min(560, track?.clientWidth || window.innerWidth || 360));

  if (qa) {
    if (width >= 500) return 58;
    if (width >= 420) return 50;
    if (width >= 360) return 43;
    return 38;
  }

  if (width >= 500) return 54;
  if (width >= 420) return 46;
  if (width >= 360) return 38;
  return 34;
}

estimateRoutineVisualLines = function estimateRoutineVisualLinesV2(value, qa = false) {
  const text = normalizeRoutineText(value);
  if (!text) return 0;
  const charsPerLine = routineCharsPerLine(qa);
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);

  return paragraphs.reduce((sum, paragraph) => {
    const explicitLines = paragraph.split(/\n+/).filter(Boolean);
    const paragraphLines = explicitLines.reduce(
      (lineSum, line) => lineSum + Math.max(1, Math.ceil(line.length / charsPerLine)),
      0
    );
    return sum + paragraphLines + 0.35;
  }, 0);
};

function balanceRoutinePoolToTarget(pool, qa, targetLines) {
  if (!pool.length) return [];

  const units = [];
  pool.forEach(block => {
    textUnitsForBalance(block.content, qa).forEach(content => {
      units.push({ content, cost: estimateRoutineVisualLines(content, qa), block });
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
      if (beforeDiff <= afterDiff && currentCost >= dynamicTarget * 0.55) {
        flush();
      }
    }

    current.push(unit);
    currentCost += unit.cost;
  });

  flush();
  return groups;
}

splitRoutineTextBlocks = function splitRoutineTextBlocksV2(blocks) {
  const output = [];
  let pool = [];
  let poolQa = null;

  const flushPool = () => {
    if (!pool.length) return;
    output.push(...balanceRoutinePoolToTarget(pool, poolQa, poolQa ? 8.4 : 6.4));
    pool = [];
    poolQa = null;
  };

  blocks.forEach(rawBlock => {
    const extracted = extractRoutineInlineLinks(rawBlock?.content || "", rawBlock?.links || []);
    const content = normalizeRoutineText(extracted.content);
    if (!content && !extracted.links.length) return;

    const qa = isQuestionAnswerContent(content);
    const block = { ...rawBlock, content, links: extracted.links };

    if (block.links.length) {
      flushPool();

      const baseBlock = { ...block, links: [] };
      const linkPenalty = Math.min(2.6, block.links.length * 1.05);
      const target = qa ? Math.max(5.6, 8.2 - linkPenalty) : Math.max(3.8, 6.2 - linkPenalty);
      const parts = balanceRoutinePoolToTarget([baseBlock], qa, target);

      if (!parts.length) {
        output.push(block);
      } else {
        parts[parts.length - 1].links = block.links;
        output.push(...parts);
      }
      return;
    }

    if (pool.length && poolQa !== qa) flushPool();
    if (!pool.length) poolQa = qa;
    pool.push(block);
  });

  flushPool();
  return output;
};

function ensureRoutineCarouselControls() {
  const carousel = document.querySelector("#view-hoy.day-open .routine-content-carousel");
  if (!carousel || carousel.dataset.controlsReady === "true") return;

  const track = carousel.querySelector(".routine-content-track");
  const dots = carousel.querySelector(".routine-content-dots");
  const slides = Array.from(carousel.querySelectorAll(".routine-content-slide"));
  const dotButtons = dots ? Array.from(dots.querySelectorAll(".routine-content-dot")) : [];

  if (!track || !dots || slides.length <= 1 || !dotButtons.length) return;

  carousel.dataset.controlsReady = "true";

  const nav = document.createElement("div");
  nav.className = "routine-content-controls";

  const previous = document.createElement("button");
  previous.type = "button";
  previous.className = "routine-content-arrow routine-content-prev";
  previous.setAttribute("aria-label", "Contenido anterior");
  previous.textContent = "‹";

  const next = document.createElement("button");
  next.type = "button";
  next.className = "routine-content-arrow routine-content-next";
  next.setAttribute("aria-label", "Contenido siguiente");
  next.textContent = "›";

  dots.before(nav);
  nav.append(previous, dots, next);

  const activeIndex = () => {
    const current = dotButtons.findIndex(dot => dot.classList.contains("is-active"));
    if (current >= 0) return current;
    return Math.max(0, Math.min(
      slides.length - 1,
      Math.round(track.scrollLeft / Math.max(track.clientWidth, 1))
    ));
  };

  const updateButtons = () => {
    const index = activeIndex();
    previous.disabled = index <= 0;
    next.disabled = index >= slides.length - 1;
  };

  previous.addEventListener("click", () => {
    dotButtons[Math.max(0, activeIndex() - 1)]?.click();
    requestAnimationFrame(updateButtons);
  });

  next.addEventListener("click", () => {
    dotButtons[Math.min(slides.length - 1, activeIndex() + 1)]?.click();
    requestAnimationFrame(updateButtons);
  });

  track.addEventListener("scroll", updateButtons, { passive: true });
  dotButtons.forEach(dot => dot.addEventListener("click", () => requestAnimationFrame(updateButtons)));
  requestAnimationFrame(updateButtons);
}

function polishRoutineMaterials() {
  const dayView = document.querySelector("#view-hoy.day-open");
  if (!dayView) return;

  dayView.querySelectorAll(".materials-section .section-count").forEach(node => node.remove());
  dayView.querySelectorAll(".materials-section .resource-order").forEach(node => node.remove());

  dayView.querySelectorAll(".materials-section .resource-copy strong").forEach(node => {
    node.textContent = String(node.textContent || "")
      .replace(/^Historia\s+\d+\s+de\s+\d+$/i, "Material")
      .replace(/^Material\s+\d+\s+de\s+\d+$/i, "Material");
  });
}

const renderStructuredDayDetailBaseV2 = renderStructuredDayDetail;
renderStructuredDayDetail = function renderStructuredDayDetailV2() {
  const result = renderStructuredDayDetailBaseV2.apply(this, arguments);
  requestAnimationFrame(() => {
    ensureRoutineCarouselControls();
    polishRoutineMaterials();
  });
  return result;
};
