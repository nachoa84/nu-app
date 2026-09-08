/* NU APP · Safe canonical state gate V171.
 * Synchronous guard for backend publications. It rejects states from another
 * account and same-cycle regressions before UI listeners mutate localStorage.
 */
(() => {
  "use strict";

  const PRODUCT_IDS = ["lumispa-10", "wellspa-10", "galvanicspa-10"];
  const collagenByUserCycle = new Map();
  const highestCycleByUser = new Map();
  const productByUserRoutine = new Map();

  function profileUserId() {
    try {
      return String(JSON.parse(localStorage.getItem("routineUserProfile") || "null")?.userId || "");
    } catch (_) {
      return "";
    }
  }

  function numbers(values) {
    return new Set(
      (Array.isArray(values) ? values : [])
        .map(Number)
        .filter(Number.isFinite)
    );
  }

  function isSuperset(next, previous) {
    for (const value of previous) {
      if (!next.has(value)) return false;
    }
    return true;
  }

  function snapshotRoutine(routine) {
    return {
      currentDay: Number(routine?.currentDay || 1),
      completedDays: numbers(routine?.completedDays || [])
    };
  }

  function acceptCollagenState(state) {
    if (!state) return null;

    const userId = String(state.userId || "");
    const activeUserId = profileUserId();

    if (!userId || (activeUserId && userId !== activeUserId)) return null;

    const cycle = Number(state.cycle || 1);
    if (!Number.isInteger(cycle) || cycle < 1) return null;

    const highestCycle = Number(highestCycleByUser.get(userId) || 0);
    if (highestCycle && cycle < highestCycle) return null;
    if (cycle > highestCycle) highestCycleByUser.set(userId, cycle);

    const key = `${userId}:${cycle}`;
    const next = snapshotRoutine(state);
    const previous = collagenByUserCycle.get(key);

    if (previous) {
      if (next.currentDay < previous.currentDay) return null;
      if (!isSuperset(next.completedDays, previous.completedDays)) return null;
    }

    collagenByUserCycle.set(key, next);
    return state;
  }

  function acceptProductRoutineState(userId, routineId, routine) {
    if (!PRODUCT_IDS.includes(routineId)) return null;
    if (routine?.initialized !== true) return null;

    const key = `${userId}:${routineId}`;
    const next = snapshotRoutine(routine);
    const previous = productByUserRoutine.get(key);

    if (previous) {
      if (next.currentDay < previous.currentDay) return null;
      if (!isSuperset(next.completedDays, previous.completedDays)) return null;
    }

    productByUserRoutine.set(key, next);
    return routine;
  }

  function acceptProductState(state) {
    if (!state?.routines) return null;

    const userId = String(state.userId || "");
    const activeUserId = profileUserId();

    if (!userId || (activeUserId && userId !== activeUserId)) return null;

    const acceptedRoutines = {};

    Object.entries(state.routines || {}).forEach(([routineId, routine]) => {
      const accepted = acceptProductRoutineState(userId, routineId, routine);
      if (accepted) acceptedRoutines[routineId] = accepted;
    });

    if (!Object.keys(acceptedRoutines).length) return null;

    return {
      ...state,
      routines: acceptedRoutines
    };
  }

  function currentCycle(userId = profileUserId()) {
    return Number(highestCycleByUser.get(String(userId || "")) || 1);
  }

  window.NuRoutineStateGateV171 = Object.freeze({
    acceptCollagenState,
    acceptProductState,
    currentCycle
  });
})();
