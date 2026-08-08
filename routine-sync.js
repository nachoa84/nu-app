// Rutina 30 Días · Sincronización y coordinación de rutina
// Paso 11K: estado recibido del backend, apertura del día, demo y cambios de perfil.
// La persistencia local permanece en routine-state.js.
// currentDay y nextUnlockAt solo se modifican con estado confirmado por backend.

let pendingOpenDay = null;

function applyBackendRoutineState(serverState) {
  if (!serverState || !isBackendManagedRoutine()) return;

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
  if (isPreviewMode || !isBackendManagedRoutine()) return;

  const state = getRoutineState();
  const currentDay =
    Number(state.currentDay);

  if (
    Number(selectedDay) !== currentDay ||
    state.openedDays[currentDay] ||
    pendingOpenDay === currentDay
  ) {
    return;
  }

  if (!window.BackendAPI) {
    console.warn(
      "Backend no disponible: la apertura no se persiste hasta recuperar conexión."
    );
    return;
  }

  // No calculamos ni persistimos nextUnlockAt en el cliente.
  // /api/routine/open registra la apertura y devuelve el estado oficial.
  pendingOpenDay = currentDay;

  window.BackendAPI
    .openDay(currentDay)
    .catch(error => {
      console.warn(
        "No se pudo registrar la apertura con el backend.",
        error
      );
    })
    .finally(() => {
      if (pendingOpenDay === currentDay) {
        pendingOpenDay = null;
      }
    });
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
        "Demo backend no disponible.",
        error
      );

      toast(
        "No se pudo simular el próximo día sin conexión al backend."
      );

      return;
    }
  }

  toast(
    "No se pudo simular el próximo día sin conexión al backend."
  );
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
    // backend-client.js sincroniza el perfil y publica luego
    // backend-state-updated con currentDay/nextUnlockAt oficiales.
    renderDays();

    const notificationPanel = document.getElementById("notificationSettings");
    if (notificationPanel && !notificationPanel.hidden) {
      renderNotificationSettings();
    }
  }
);
