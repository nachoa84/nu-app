/* NU APP · Integración de confirmación compartida V171.
 * Un único controlador para Collagen+, LumiSpa, WellSpa y Galvanic Spa.
 * Los POST/GET de completado se hacen sin publicar primero: el estado solo
 * se emite después de validar cuenta, rutina, día, ciclo y sesión.
 */
(() => {
  "use strict";

  const core = window.RoutineCompletionCoreV171;
  if (!core || typeof core.createController !== "function") {
    console.warn("RoutineCompletionCoreV171 no está disponible.");
    return;
  }

  const PRODUCT_IDS = new Set(["lumispa-10", "wellspa-10", "galvanicspa-10"]);
  const rawMeta = new WeakMap();
  const acceptedProducts = new Map();
  let acceptedCollagen = null;
  let sessionEpoch = 0;
  let lastSessionUserId = readProfileUserId();

  function clone(value) {
    if (!value || typeof value !== "object") return value;
    return JSON.parse(JSON.stringify(value));
  }

  function readProfileUserId() {
    try {
      const profile = JSON.parse(localStorage.getItem("routineUserProfile") || "null");
      return String(profile?.userId || "");
    } catch (_) {
      return "";
    }
  }

  function syncSession() {
    const userId = readProfileUserId();
    if (userId !== lastSessionUserId) {
      lastSessionUserId = userId;
      sessionEpoch += 1;
      acceptedCollagen = null;
      acceptedProducts.clear();
    }
    return Object.freeze({ userId, epoch: sessionEpoch });
  }

  function noteProfileEvent() {
    syncSession();
  }

  window.addEventListener("routine-profile-updated", noteProfileEvent);
  window.addEventListener("routine-profile-synced", noteProfileEvent);

  async function requestJson(path, options = {}) {
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
    return payload;
  }

  function markRaw(state, identity, source) {
    if (state && typeof state === "object") {
      rawMeta.set(state, Object.freeze({
        userId: identity.userId,
        routineId: identity.routineId,
        day: identity.day,
        cycle: identity.cycle,
        epoch: identity.epoch,
        source
      }));
    }
    return state;
  }

  function completedSet(state) {
    return new Set((state?.completedDays || []).map(Number));
  }

  function isSubset(previous, next) {
    const nextSet = completedSet(next);
    return [...completedSet(previous)].every(day => nextSet.has(day));
  }

  function collagenNonRegressive(previous, next) {
    if (!previous) return true;
    const previousCycle = Number(previous.cycle || 1);
    const nextCycle = Number(next?.cycle || 1);
    if (nextCycle > previousCycle) return true;
    if (nextCycle < previousCycle) return false;
    if (Number(next?.currentDay || 0) < Number(previous.currentDay || 0)) return false;
    return isSubset(previous, next);
  }

  function productNonRegressive(previous, next) {
    if (!previous) return true;
    if (Number(next?.currentDay || 0) < Number(previous.currentDay || 0)) return false;
    return isSubset(previous, next);
  }

  function seedCanonicalState(event) {
    const state = event?.detail;
    const session = syncSession();
    if (!state || !session.userId || String(state.userId || "") !== session.userId) return;
    if (collagenNonRegressive(acceptedCollagen, state)) acceptedCollagen = clone(state);
  }

  function seedProductStates(event) {
    const state = event?.detail;
    const session = syncSession();
    if (!state || !session.userId || String(state.userId || "") !== session.userId) return;
    Object.entries(state.routines || {}).forEach(([routineId, routine]) => {
      if (!PRODUCT_IDS.has(routineId) || routine?.initialized !== true) return;
      const previous = acceptedProducts.get(routineId);
      if (productNonRegressive(previous, routine)) acceptedProducts.set(routineId, clone(routine));
    });
  }

  // Se carga antes de routine-sync.js: también observa estados canónicos normales
  // para poder impedir que una confirmación posterior retroceda lo ya aceptado.
  window.addEventListener("backend-state-updated", seedCanonicalState);
  window.addEventListener("product-routines-state-updated", seedProductStates);

  function acceptCollagen(state, identity) {
    const session = syncSession();
    const meta = rawMeta.get(state);
    if (!meta || session.userId !== identity.userId || session.epoch !== identity.epoch) return null;
    if (meta.userId !== identity.userId || meta.routineId !== "collagen-30" || meta.cycle !== identity.cycle) return null;
    if (!collagenNonRegressive(acceptedCollagen, state)) return null;
    acceptedCollagen = clone(state);
    window.dispatchEvent(new CustomEvent("backend-state-updated", { detail: state }));
    return state;
  }

  function acceptProducts(state, identity) {
    const session = syncSession();
    const meta = rawMeta.get(state);
    if (!meta || session.userId !== identity.userId || session.epoch !== identity.epoch) return null;
    if (meta.userId !== identity.userId || meta.routineId !== identity.routineId) return null;

    const candidate = state?.routines?.[identity.routineId];
    if (!candidate || candidate.initialized !== true) return null;
    const previous = acceptedProducts.get(identity.routineId);
    if (!productNonRegressive(previous, candidate)) return null;

    // Si el servidor devuelve las tres rutinas, no permitimos que una respuesta
    // parcial/antigua haga retroceder otra que ya aceptamos en esta sesión.
    const safeState = clone(state);
    safeState.routines = safeState.routines || {};
    for (const routineId of PRODUCT_IDS) {
      const known = acceptedProducts.get(routineId);
      const incoming = safeState.routines[routineId];
      if (known && (!incoming || !productNonRegressive(known, incoming))) {
        safeState.routines[routineId] = clone(known);
      }
    }

    Object.entries(safeState.routines).forEach(([routineId, routine]) => {
      if (PRODUCT_IDS.has(routineId) && routine?.initialized === true) {
        acceptedProducts.set(routineId, clone(routine));
      }
    });

    window.dispatchEvent(new CustomEvent("product-routines-state-updated", { detail: safeState }));
    return safeState;
  }

  const controller = core.createController({
    getSession: syncSession,
    transport: {
      async complete(identity) {
        if (identity.routineId === "collagen-30") {
          const payload = await requestJson("/api/routine/complete", {
            method: "POST",
            body: JSON.stringify({ userId: identity.userId, day: identity.day })
          });
          return markRaw(payload.state, identity, "complete");
        }
        const payload = await requestJson("/api/product-routines/complete", {
          method: "POST",
          body: JSON.stringify({
            userId: identity.userId,
            routineId: identity.routineId,
            day: identity.day
          })
        });
        return markRaw(payload.state, identity, "complete");
      },

      async read(identity) {
        if (identity.routineId === "collagen-30") {
          const payload = await requestJson(`/api/state/${encodeURIComponent(identity.userId)}`);
          return markRaw(payload.state, identity, "read");
        }
        const payload = await requestJson(
          `/api/product-routines/state/${encodeURIComponent(identity.userId)}`
        );
        return markRaw(payload.state, identity, "read");
      },

      accept(state, identity) {
        return identity.routineId === "collagen-30"
          ? acceptCollagen(state, identity)
          : acceptProducts(state, identity);
      }
    },
    onChange(detail) {
      window.dispatchEvent(new CustomEvent("routine-completion-state-v171", { detail }));
    }
  });

  function buildInput(routineId, day) {
    const session = syncSession();
    if (!session.userId) throw new core.CompletionError("INVALID_CONTEXT");
    if (typeof getActiveRoutineId !== "function" || getActiveRoutineId() !== routineId) {
      throw new core.CompletionError("INVALID_CONTEXT");
    }
    if (typeof getRoutineState !== "function") {
      throw new core.CompletionError("INVALID_CONTEXT");
    }
    const state = getRoutineState();
    return {
      userId: session.userId,
      routineId,
      day: Number(day),
      currentDay: Number(state.currentDay || 1),
      cycle: routineId === "collagen-30" ? Number(state.cycle || 1) : 1
    };
  }

  function complete(routineId, day) {
    let input;
    try { input = buildInput(String(routineId || ""), Number(day)); }
    catch (error) { return Promise.reject(error); }
    return controller.complete(input);
  }

  function status(routineId, day) {
    try { return controller.status(buildInput(String(routineId || ""), Number(day))); }
    catch (_) { return Object.freeze({ phase: "idle" }); }
  }

  window.RoutineCompletionV171 = Object.freeze({ complete, status, syncSession });
})();
