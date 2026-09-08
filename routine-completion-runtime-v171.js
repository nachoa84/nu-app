// NU APP · Runtime de confirmación compartida V171
(() => {
  "use strict";

  const core = window.RoutineCompletionCoreV171;
  if (!core || typeof core.createController !== "function") {
    console.warn("RoutineCompletionCoreV171 no está disponible.");
    return;
  }

  const PRODUCT_IDS = new Set(["lumispa-10", "wellspa-10", "galvanicspa-10"]);
  let sessionUserId = null;
  let sessionEpoch = 0;
  const accepted = new Map();

  function currentUserId() {
    try {
      return String(JSON.parse(localStorage.getItem("routineUserProfile") || "null")?.userId || "");
    } catch (_) {
      return "";
    }
  }

  function observeSession() {
    const userId = currentUserId();
    if (sessionUserId === null) sessionUserId = userId;
    else if (userId !== sessionUserId) {
      sessionUserId = userId;
      sessionEpoch += 1;
    }
    return { userId, epoch: sessionEpoch };
  }

  function bumpSessionIfNeeded(event) {
    const next = String(event?.detail?.userId || currentUserId() || "");
    if (sessionUserId === null) sessionUserId = next;
    else if (next !== sessionUserId) {
      sessionUserId = next;
      sessionEpoch += 1;
    }
  }

  window.addEventListener("routine-profile-updated", bumpSessionIfNeeded);

  async function rawRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Error HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload?.state || null;
  }

  function routineSlice(state, routineId) {
    return routineId === "collagen-30" ? state : state?.routines?.[routineId];
  }

  function normalizedCompletedDays(routine) {
    return new Set(
      Array.isArray(routine?.completedDays)
        ? routine.completedDays.map(Number).filter(Number.isInteger)
        : []
    );
  }

  function freshnessKey(identity) {
    return `${identity.userId}|${identity.routineId}`;
  }

  function isNonRegressive(candidate, identity) {
    const previous = accepted.get(freshnessKey(identity));
    if (!previous) return true;

    if (identity.routineId === "collagen-30") {
      const nextCycle = Number(candidate?.cycle || 0);
      if (nextCycle < previous.cycle) return false;
      if (nextCycle > previous.cycle) return true;
    }

    const routine = routineSlice(candidate, identity.routineId);
    if (!routine) return false;
    const currentDay = Number(routine.currentDay || 0);
    if (currentDay < previous.currentDay) return false;

    const completed = normalizedCompletedDays(routine);
    for (const day of previous.completedDays) {
      if (!completed.has(day)) return false;
    }
    return true;
  }

  function rememberAccepted(candidate, identity) {
    const routine = routineSlice(candidate, identity.routineId);
    accepted.set(freshnessKey(identity), {
      cycle: identity.routineId === "collagen-30" ? Number(candidate.cycle || 1) : 1,
      currentDay: Number(routine?.currentDay || identity.currentDay),
      completedDays: normalizedCompletedDays(routine)
    });
  }

  function publishCanonical(candidate, identity) {
    const session = observeSession();
    if (!candidate || session.userId !== identity.userId || session.epoch !== identity.epoch) return null;
    if (String(candidate.userId || "") !== identity.userId) return null;
    if (!isNonRegressive(candidate, identity)) return null;

    rememberAccepted(candidate, identity);
    const eventName = identity.routineId === "collagen-30"
      ? "backend-state-updated"
      : "product-routines-state-updated";
    window.dispatchEvent(new CustomEvent(eventName, { detail: candidate }));
    return candidate;
  }

  async function submitCompletion(identity) {
    if (identity.routineId === "collagen-30") {
      return rawRequest("/api/routine/complete", {
        method: "POST",
        body: JSON.stringify({ userId: identity.userId, day: identity.day })
      });
    }
    return rawRequest("/api/product-routines/complete", {
      method: "POST",
      body: JSON.stringify({
        userId: identity.userId,
        routineId: identity.routineId,
        day: identity.day
      })
    });
  }

  async function readCanonical(identity) {
    if (identity.routineId === "collagen-30") {
      return rawRequest(`/api/state/${encodeURIComponent(identity.userId)}`);
    }
    return rawRequest(`/api/product-routines/state/${encodeURIComponent(identity.userId)}`);
  }

  const controller = core.createController({
    getSession: observeSession,
    transport: {
      complete: submitCompletion,
      read: readCanonical,
      accept: publishCanonical
    },
    onChange(event) {
      window.dispatchEvent(new CustomEvent("routine-completion-v171-state", { detail: event }));
    }
  });

  function buildInput(routineId, day) {
    const profile = typeof getRoutineProfile === "function" ? getRoutineProfile() : null;
    const userId = String(profile?.userId || "");
    const state = typeof getRoutineState === "function" ? getRoutineState() : null;
    const currentDay = Number(state?.currentDay || 0);
    const cycle = routineId === "collagen-30"
      ? Math.max(1, Number(state?.cycle || 1))
      : 1;
    return {
      userId,
      routineId,
      day: Number(day),
      cycle,
      currentDay
    };
  }

  function complete(routineId = getActiveRoutineId(), day = Number(selectedDay)) {
    const id = String(routineId || "");
    if (id !== "collagen-30" && !PRODUCT_IDS.has(id)) {
      return Promise.reject(new Error("Rutina no válida."));
    }
    return controller.complete(buildInput(id, day));
  }

  function status(routineId = getActiveRoutineId(), day = Number(selectedDay)) {
    try {
      return controller.status(buildInput(String(routineId || ""), Number(day)));
    } catch (_) {
      return { phase: "idle" };
    }
  }

  // Persistencia local y sincronización de red quedan separadas.
  if (typeof saveRoutineState === "function") {
    saveRoutineState = function saveRoutineStateV171(state) {
      localStorage.setItem(getRoutineStateStorageKey(), JSON.stringify(state));
    };
  }

  if (typeof setDayComplete === "function") {
    setDayComplete = function setDayCompleteV171(day, completeValue = true) {
      const safeDay = Number(day);
      const key = getDayCompleteStorageKey(safeDay);
      if (completeValue) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
      rememberDayCompletionTimestamp(safeDay, completeValue);

      if (!isBackendManagedRoutine() && !completeValue) {
        const routineId = getActiveRoutineId();
        const state = getRoutineState();
        state.pendingNextDay = null;
        state.nextUnlockAt = null;
        localStorage.setItem(`routineState:${routineId}`, JSON.stringify(state));
      }
      if (typeof renderRoutineCardsV92a === "function") renderRoutineCardsV92a();
    };
  }

  function renderPending(button) {
    if (!button) return;
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-busy", "true");
    const label = button.querySelector("span:last-child");
    if (label) label.textContent = "Guardando...";
    else button.textContent = "Guardando...";
  }

  function renderFailure(button) {
    if (!button || !button.isConnected) return;
    button.disabled = false;
    button.removeAttribute("aria-disabled");
    button.removeAttribute("aria-busy");
    const label = button.querySelector("span:last-child");
    if (label) label.textContent = "Volver a intentar";
    else button.textContent = "Volver a intentar";
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.(".complete-day-btn, .app-checkin-btn");
    if (!button) return;
    if (typeof isPreviewMode !== "undefined" && isPreviewMode) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const routineId = String(getActiveRoutineId() || "");
    const state = getRoutineState();
    const day = button.classList.contains("app-checkin-btn")
      ? Number(state.currentDay)
      : Number(selectedDay);

    if (isDayComplete(day)) return;
    if (navigator.vibrate) navigator.vibrate(10);
    renderPending(button);

    complete(routineId, day).then(() => {
      if (navigator.vibrate) navigator.vibrate(12);
      if (typeof renderDays === "function") renderDays();
      if (Number(selectedDay) === day && typeof renderStructuredDayDetail === "function") {
        renderStructuredDayDetail();
      }
    }).catch(error => {
      console.warn("No se pudo confirmar el completado de la rutina.", error);
      renderFailure(button);
      if (typeof toast === "function") {
        toast("No pudimos confirmar el registro. Revisá tu conexión y volvé a intentar.", {
          type: "error",
          duration: 4200
        });
      }
    });
  }, true);

  window.RoutineCompletionV171 = Object.freeze({ complete, status, observeSession });
})();
