/* NU APP · Integración de completado compartido V171.
 * Usa RoutineCompletionCoreV171 y publica estados solo después de validar
 * identidad, sesión y monotonía. No calcula currentDay ni nextUnlockAt.
 */
(() => {
  "use strict";

  const Core = window.RoutineCompletionCoreV171;
  if (!Core || typeof Core.createController !== "function") {
    console.warn("V171 no pudo iniciar: falta RoutineCompletionCoreV171.");
    return;
  }

  const PRODUCT_IDS = new Set(["lumispa-10", "wellspa-10", "galvanicspa-10"]);
  const latestCollagenByUser = new Map();
  const latestProductsByUser = new Map();

  let sessionUserId = "";
  let sessionEpoch = 0;

  function profileUserId() {
    try {
      const profile = JSON.parse(localStorage.getItem("routineUserProfile") || "null");
      return String(profile?.userId || "");
    } catch (_) {
      return "";
    }
  }

  function observeSession() {
    const userId = profileUserId();
    if (userId !== sessionUserId) {
      sessionUserId = userId;
      sessionEpoch += 1;
    }
    return Object.freeze({ userId, epoch: sessionEpoch });
  }

  sessionUserId = profileUserId();

  ["routine-profile-updated", "routine-profile-synced"].forEach(name => {
    window.addEventListener(name, observeSession);
  });

  function numberSet(values) {
    return new Set(
      (Array.isArray(values) ? values : [])
        .map(Number)
        .filter(Number.isInteger)
    );
  }

  function isSuperset(nextValues, previousValues) {
    const next = numberSet(nextValues);
    for (const value of numberSet(previousValues)) {
      if (!next.has(value)) return false;
    }
    return true;
  }

  function collagenMonotonic(previous, next) {
    if (!previous) return true;
    if (!next || String(previous.userId || "") !== String(next.userId || "")) return false;

    const previousCycle = Number(previous.cycle || 1);
    const nextCycle = Number(next.cycle || 1);
    if (!Number.isInteger(nextCycle) || nextCycle < previousCycle) return false;
    if (nextCycle > previousCycle) return true;

    const previousDay = Number(previous.currentDay || 1);
    const nextDay = Number(next.currentDay || 1);
    if (!Number.isInteger(nextDay) || nextDay < previousDay) return false;
    return isSuperset(next.completedDays, previous.completedDays);
  }

  function productRoutineMonotonic(previous, next) {
    if (!previous) return true;
    if (!next) return false;
    if (previous.initialized === true && next.initialized !== true) return false;
    if (previous.initialized !== true) return true;

    const previousDay = Number(previous.currentDay || 1);
    const nextDay = Number(next.currentDay || 1);
    if (!Number.isInteger(nextDay) || nextDay < previousDay) return false;
    return isSuperset(next.completedDays, previous.completedDays);
  }

  function rememberCollagen(state) {
    const userId = String(state?.userId || "");
    if (!userId) return false;
    const previous = latestCollagenByUser.get(userId) || null;
    if (!collagenMonotonic(previous, state)) return false;
    latestCollagenByUser.set(userId, state);
    return true;
  }

  function mergeProductState(state) {
    const userId = String(state?.userId || "");
    if (!userId || !state?.routines || typeof state.routines !== "object") return null;

    const previous = latestProductsByUser.get(userId) || { userId, routines: {} };
    const merged = { ...state, userId, routines: { ...(previous.routines || {}) } };

    Object.entries(state.routines).forEach(([routineId, candidate]) => {
      const old = previous.routines?.[routineId] || null;
      if (productRoutineMonotonic(old, candidate)) merged.routines[routineId] = candidate;
    });

    latestProductsByUser.set(userId, merged);
    return merged;
  }

  // Observa estados publicados por otros flujos (bootstrap, apertura, sync activo)
  // sin permitir que una respuesta regresiva reemplace la referencia V171.
  window.addEventListener("backend-state-updated", event => {
    rememberCollagen(event.detail);
  });

  window.addEventListener("product-routines-state-updated", event => {
    mergeProductState(event.detail);
  });

  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      cache: "no-store",
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

  async function completeRaw(identity) {
    if (identity.routineId === "collagen-30") {
      const payload = await request("/api/routine/complete", {
        method: "POST",
        body: JSON.stringify({ userId: identity.userId, day: identity.day })
      });
      return payload.state || null;
    }

    const payload = await request("/api/product-routines/complete", {
      method: "POST",
      body: JSON.stringify({
        userId: identity.userId,
        routineId: identity.routineId,
        day: identity.day
      })
    });
    return payload.state || null;
  }

  async function readRaw(identity) {
    if (identity.routineId === "collagen-30") {
      const payload = await request(
        `/api/state/${encodeURIComponent(identity.userId)}`
      );
      return payload.state || null;
    }

    const payload = await request(
      `/api/product-routines/state/${encodeURIComponent(identity.userId)}`
    );
    return payload.state || null;
  }

  function acceptCollagen(state, identity) {
    if (String(state?.userId || "") !== identity.userId) return null;
    const previous = latestCollagenByUser.get(identity.userId) || null;
    if (!collagenMonotonic(previous, state)) return null;
    latestCollagenByUser.set(identity.userId, state);
    window.dispatchEvent(new CustomEvent("backend-state-updated", { detail: state }));
    return state;
  }

  function acceptProducts(state, identity) {
    if (String(state?.userId || "") !== identity.userId) return null;
    const candidate = state?.routines?.[identity.routineId];
    if (!candidate) return null;

    const previousGrouped = latestProductsByUser.get(identity.userId) || null;
    const previousTarget = previousGrouped?.routines?.[identity.routineId] || null;
    if (!productRoutineMonotonic(previousTarget, candidate)) return null;

    const merged = mergeProductState(state);
    if (!merged) return null;
    const acceptedTarget = merged.routines?.[identity.routineId];
    if (!productRoutineMonotonic(previousTarget, acceptedTarget)) return null;

    window.dispatchEvent(
      new CustomEvent("product-routines-state-updated", { detail: merged })
    );
    return merged;
  }

  const controller = Core.createController({
    getSession: observeSession,
    transport: {
      complete: completeRaw,
      read: readRaw,
      accept(state, identity) {
        return identity.routineId === "collagen-30"
          ? acceptCollagen(state, identity)
          : acceptProducts(state, identity);
      }
    },
    onChange(detail) {
      window.dispatchEvent(
        new CustomEvent("routine-completion-status-v171", { detail })
      );
    }
  });

  function buildInput(day, routineId = getActiveRoutineId()) {
    const profile = getRoutineProfile();
    const state = getRoutineState();
    const safeRoutineId = String(routineId || "");
    const product = PRODUCT_IDS.has(safeRoutineId);
    const canonical = product
      ? latestProductsByUser.get(String(profile?.userId || ""))?.routines?.[safeRoutineId]
      : latestCollagenByUser.get(String(profile?.userId || ""));

    return {
      userId: String(profile?.userId || ""),
      routineId: safeRoutineId,
      day: Number(day),
      cycle: product ? 1 : Number(canonical?.cycle || state?.cycle || 1),
      currentDay: Number(canonical?.currentDay || state?.currentDay || 1)
    };
  }

  function complete(day, routineId = getActiveRoutineId()) {
    return controller.complete(buildInput(day, routineId));
  }

  function status(day, routineId = getActiveRoutineId()) {
    try {
      return controller.status(buildInput(day, routineId));
    } catch (_) {
      return Object.freeze({ phase: "idle" });
    }
  }

  window.RoutineCompletionV171 = Object.freeze({
    complete,
    status,
    observeSession
  });
})();