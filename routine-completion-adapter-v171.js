/* NU APP · Completion adapter V171.
 * Connects the isolated core to real Nu App state, fetch and UI events.
 */
(() => {
  "use strict";

  const core = window.RoutineCompletionCoreV171;
  if (!core) {
    console.warn("RoutineCompletionCoreV171 no está disponible.");
    return;
  }

  const PRODUCT_IDS = ["lumispa-10", "wellspa-10", "galvanicspa-10"];
  const PROFILE_KEY = "routineUserProfile";
  let lastProfileRaw = null;
  let sessionEpoch = 0;

  function readProfileRaw() {
    return localStorage.getItem(PROFILE_KEY) || "";
  }

  function getProfile() {
    try {
      return JSON.parse(readProfileRaw() || "null");
    } catch (_) {
      return null;
    }
  }

  function getSession() {
    const raw = readProfileRaw();
    if (lastProfileRaw === null) {
      lastProfileRaw = raw;
    } else if (raw !== lastProfileRaw) {
      lastProfileRaw = raw;
      sessionEpoch += 1;
    }

    return {
      userId: String(getProfile()?.userId || ""),
      epoch: sessionEpoch
    };
  }

  async function request(path, options = {}) {
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
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function currentIdentity({ routineId = getActiveRoutineId(), day } = {}) {
    const profile = getProfile();
    const safeRoutineId = String(routineId || getActiveRoutineId());
    const state = getRoutineState();
    const localCycle = Number(state.cycle || 0);
    const gateCycle =
      Number(window.NuRoutineStateGateV171?.currentCycle?.(profile?.userId) || 0);
    const cycle = safeRoutineId === "collagen-30"
      ? Math.max(1, localCycle, gateCycle)
      : 1;

    return {
      userId: String(profile?.userId || ""),
      routineId: safeRoutineId,
      day: Number(day),
      cycle,
      currentDay: Number(state.currentDay || 1)
    };
  }

  async function completeRaw(identity) {
    if (identity.routineId === "collagen-30") {
      const payload = await request("/api/routine/complete", {
        method: "POST",
        body: JSON.stringify({
          userId: identity.userId,
          day: identity.day
        })
      });

      return payload.state;
    }

    const payload = await request("/api/product-routines/complete", {
      method: "POST",
      body: JSON.stringify({
        userId: identity.userId,
        routineId: identity.routineId,
        day: identity.day
      })
    });

    return payload.state;
  }

  async function readRaw(identity) {
    if (identity.routineId === "collagen-30") {
      const payload = await request(`/api/state/${encodeURIComponent(identity.userId)}`);
      return payload.state;
    }

    const payload = await request(`/api/product-routines/state/${encodeURIComponent(identity.userId)}`);
    return payload.state;
  }

  function acceptRaw(state, identity) {
    let accepted = null;

    if (identity.routineId === "collagen-30") {
      accepted = window.NuRoutineStateGateV171?.acceptCollagenState
        ? window.NuRoutineStateGateV171.acceptCollagenState(state)
        : state;

      if (!accepted) return null;

      window.dispatchEvent(
        new CustomEvent("backend-state-updated", {
          detail: accepted
        })
      );

      return accepted;
    }

    accepted = window.NuRoutineStateGateV171?.acceptProductState
      ? window.NuRoutineStateGateV171.acceptProductState(state)
      : state;

    if (!accepted) return null;

    window.dispatchEvent(
      new CustomEvent("product-routines-state-updated", {
        detail: accepted
      })
    );

    return accepted;
  }

  const controller = core.createController({
    getSession,
    transport: {
      complete: completeRaw,
      read: readRaw,
      accept: acceptRaw
    },
    onChange(event) {
      window.dispatchEvent(
        new CustomEvent("routine-completion-status-v171", {
          detail: event
        })
      );
    }
  });

  function completeDay(options = {}) {
    return controller.complete(currentIdentity(options));
  }

  function statusForCurrent(options = {}) {
    return controller.status(currentIdentity(options));
  }

  function isPending(options = {}) {
    return statusForCurrent(options).phase === "pending";
  }

  function isFailed(options = {}) {
    return statusForCurrent(options).phase === "failed";
  }

  window.RoutineCompletionV171 = Object.freeze({
    completeDay,
    statusForCurrent,
    isPending,
    isFailed,
    productIds: PRODUCT_IDS.slice()
  });
})();
