// Rutina 30 Días · Sincronización y coordinación de rutina
// Paso 11K: estado recibido del backend, apertura del día, demo y cambios de perfil.
// La persistencia local permanece en routine-state.js.

function applyBackendRoutineState(serverState) {
  if (!serverState) return;

  const localState =
    getRoutineState();

  const openedDays = {};

  Object.entries(
    serverState.openedDays || {}
  ).forEach(([day, timestamp]) => {
    openedDays[day] =
      Number(timestamp);
  });

  localState.currentDay =
    Number(
      serverState.currentDay ||
      localState.currentDay ||
      1
    );

  localState.openedDays =
    openedDays;

  localState.nextUnlockAt =
    serverState.nextUnlockAt
      ? Number(
          serverState.nextUnlockAt
        )
      : null;

  localState.scheduleProfileSignature =
    scheduleProfileSignature();

  saveRoutineState(localState);

  // PostgreSQL es la fuente de verdad del progreso.
  // La persistencia local de completados vive en routine-state.js.
  replaceCompletedDays(
    serverState.completedDays || [],
    TOTAL_PROGRAM_DAYS
  );

  if (!isPreviewMode) {
    selectedDay =
      localState.currentDay;

    localStorage.setItem(
      "selectedDay",
      String(selectedDay)
    );
  }

  renderSelectedDayHeader();
  renderDays();
  renderFavorites();
}

window.addEventListener(
  "backend-state-updated",
  event => {
    applyBackendRoutineState(
      event.detail
    );
  }
);

function markCurrentDayOpened() {
  if (isPreviewMode) return;

  const state = getRoutineState();

  if (Number(selectedDay) !== Number(state.currentDay)) {
    return;
  }

  if (!state.openedDays[state.currentDay]) {
    state.openedDays[state.currentDay] = Date.now();

    if (state.currentDay < 7) {
      state.nextUnlockAt =
        nextUnlockTimestampFromProfile(
          state.openedDays[state.currentDay]
        );

      state.scheduleProfileSignature =
        scheduleProfileSignature();
    } else {
      state.nextUnlockAt = null;
      state.scheduleProfileSignature = null;
    }

    saveRoutineState(state);
    renderDays();

    if (window.BackendAPI) {
      window.BackendAPI
        .openDay(state.currentDay)
        .catch(error => {
          console.warn(
            "No se pudo sincronizar la apertura con el backend.",
            error
          );
        });
    }
  }
}

async function simulateNextDay() {
  if (!isDemoMode) return;

  if (window.BackendAPI) {
    try {
      const serverState =
        await window.BackendAPI
          .demoAdvance();

      if (serverState) {
        applyBackendRoutineState(
          serverState
        );

        chatWrap.classList.add(
          "hidden"
        );

        chat.innerHTML = "";
        revealIndex = 0;
        updateProgress();

        toast(
          `Día ${serverState.currentDay} desbloqueado para prueba.`
        );

        return;
      }
    } catch (error) {
      console.warn(
        "Demo backend no disponible. Se usa el modo local.",
        error
      );
    }
  }

  const state = getRoutineState();

  if (!state.openedDays[state.currentDay]) {
    toast(
      `Primero abrí el Día ${state.currentDay}.`
    );
    return;
  }

  if (state.currentDay >= 7) {
    toast(
      "Ya estás en el último día de la prueba."
    );
    return;
  }

  state.nextUnlockAt =
    Date.now() - 1000;

  saveRoutineState(state);

  const advanced =
    advanceRoutineIfEligible();

  if (advanced) {
    renderSelectedDayHeader();
    renderDays();

    chatWrap.classList.add(
      "hidden"
    );

    chat.innerHTML = "";
    revealIndex = 0;
    updateProgress();

    toast(
      `Día ${getRoutineState().currentDay} desbloqueado para prueba.`
    );
  }
}

function ensureDemoControls() {
  if (!isDemoMode) return;

  if (document.getElementById("demoAdvanceBtn")) {
    return;
  }

  const pageHeader =
    document.querySelector("#view-rutina .app-page-header");

  if (!pageHeader) return;

  const btn = document.createElement("button");

  btn.id = "demoAdvanceBtn";
  btn.className = "secondary demo-advance-btn";
  btn.type = "button";
  btn.textContent = "Simular día";
  btn.setAttribute("aria-label", "Simular el desbloqueo del próximo día");
  btn.onclick = simulateNextDay;

  pageHeader.appendChild(btn);
}

window.addEventListener(
  "routine-profile-updated",
  () => {
    rescheduleNextUnlockFromProfile(true);

    const advanced =
      advanceRoutineIfEligible();

    if (advanced) {
      selectedDay =
        getRoutineState().currentDay;

      renderSelectedDayHeader();

      chat.innerHTML = "";
      revealIndex = 0;
      renderStructuredDayDetail();
    }

    renderDays();

    const notificationPanel = document.getElementById("notificationSettings");
    if (notificationPanel && !notificationPanel.hidden) {
      renderNotificationSettings();
    }
  }
);
