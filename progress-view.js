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
