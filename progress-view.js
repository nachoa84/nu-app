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

  const currentComplete =
    isDayComplete(state.currentDay);

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
    const weekHasAvailableDay =
      isPreviewMode ||
      week.start <= state.currentDay;

    const card = document.createElement("section");
    card.className =
      `app-week-card ${
        weekHasAvailableDay
          ? "app-week-open"
          : "app-week-locked-card"
      }`;

    const head = document.createElement("div");
    head.className =
      `app-week-open-head${
        weekHasAvailableDay
          ? ""
          : " app-week-locked-head"
      }`;

    head.innerHTML = `
      <div>
        <strong>Semana ${week.number}</strong>
        <span>Días ${week.start}–${week.end}</span>
      </div>
      ${
        weekHasAvailableDay
          ? ""
          : `<span class="app-week-lock" aria-label="Bloqueada">${ICONS.lock}</span>`
      }
    `;

    const weekDays = document.createElement("div");
    weekDays.className =
      `app-week-days${
        weekHasAvailableDay
          ? ""
          : " app-week-days-locked"
      }`;

    for (let day = week.start; day <= week.end; day++) {
      const hasContent = Boolean(days[day]);
      const available =
        hasContent &&
        (
          isPreviewMode ||
          day <= state.currentDay
        );
      const complete = isDayComplete(day);
      const current = day === state.currentDay;

      const dayButton = document.createElement("button");
      dayButton.type = "button";
      dayButton.className = "app-day-dot";
      dayButton.textContent = String(day);
      dayButton.setAttribute("aria-label", `Día ${day}`);

      if (complete) {
        dayButton.classList.add("is-complete");
      }

      if (current) {
        dayButton.classList.add("is-current");
      }

      if (!available) {
        dayButton.classList.add("is-future", "is-locked");
        dayButton.disabled = true;
        dayButton.setAttribute(
          "aria-label",
          hasContent
            ? `Día ${day} bloqueado`
            : `Día ${day} sin contenido`
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

  grid.append(
    progressCard,
    todayCard,
    ...weekCards
  );

  ensureDemoControls();
}

// =========================================================
// Rutinas · pulido final de lectura y navegación
// Se ejecuta después de daily-view.js y antes de app.js.
// =========================================================

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
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

const createBalancedTextCardBase = createBalancedTextCard;
createBalancedTextCard = function patchedBalancedTextCard(block, options = {}) {
  const qa = isQuestionAnswerContent(block?.content || "");
  const normalizedBlock = {
    ...block,
    content: compactRoutineParagraphBreaks(block?.content || "", qa)
  };

  return createBalancedTextCardBase(normalizedBlock, options);
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
    const index = Math.max(0, activeIndex() - 1);
    dotButtons[index]?.click();
    requestAnimationFrame(updateButtons);
  });

  next.addEventListener("click", () => {
    const index = Math.min(slides.length - 1, activeIndex() + 1);
    dotButtons[index]?.click();
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

const renderStructuredDayDetailBase = renderStructuredDayDetail;
renderStructuredDayDetail = function patchedRenderStructuredDayDetail() {
  const result = renderStructuredDayDetailBase.apply(this, arguments);
  requestAnimationFrame(() => {
    ensureRoutineCarouselControls();
    polishRoutineMaterials();
  });
  return result;
};
