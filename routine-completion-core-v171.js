/* NU APP · Shared routine completion core V171.
 * No DOM, localStorage, fetch, or database access. The transport must return
 * raw canonical states and must not publish them before accept().
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RoutineCompletionCoreV171 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ROUTINES = Object.freeze({
    "collagen-30": 30,
    "lumispa-10": 10,
    "wellspa-10": 10,
    "galvanicspa-10": 10
  });

  class CompletionError extends Error {
    constructor(code, cause) {
      super(code);
      this.name = "CompletionError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function validInteger(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
  }

  function normalizeIdentity(input, session) {
    if (!input || !session || typeof session !== "object") {
      throw new CompletionError("INVALID_CONTEXT");
    }
    const userId = String(input.userId || "");
    const routineId = String(input.routineId || "");
    const maxDays = ROUTINES[routineId];
    const cycle = Number(input.cycle);
    const day = Number(input.day);
    const currentDay = Number(input.currentDay);
    if (!userId || userId !== String(session.userId || "") ||
        !Number.isSafeInteger(session.epoch) || session.epoch < 0 ||
        !maxDays || !validInteger(cycle, 1, Number.MAX_SAFE_INTEGER) ||
        (routineId !== "collagen-30" && cycle !== 1) ||
        !validInteger(currentDay, 1, maxDays) ||
        !validInteger(day, 1, currentDay)) {
      throw new CompletionError("INVALID_CONTEXT");
    }
    return Object.freeze({ userId, routineId, cycle, day, currentDay,
      epoch: session.epoch });
  }

  function isConfirmed(state, identity) {
    if (!state || String(state.userId || "") !== identity.userId) return false;
    const product = identity.routineId !== "collagen-30";
    const routine = product ? state.routines?.[identity.routineId] : state;
    if (!routine || (product && routine.initialized !== true)) return false;
    if (!product && Number(state.cycle) !== identity.cycle) return false;
    if (product && routine.cycle !== undefined && Number(routine.cycle) !== 1) return false;
    if (!validInteger(Number(routine.currentDay), identity.day,
      ROUTINES[identity.routineId])) return false;
    return Array.isArray(routine.completedDays) &&
      routine.completedDays.some(value => Number(value) === identity.day);
  }

  function createController({ getSession, transport, onChange = () => {} }) {
    if (typeof getSession !== "function" || !transport ||
        typeof transport.complete !== "function" ||
        typeof transport.read !== "function" ||
        typeof transport.accept !== "function" ||
        typeof onChange !== "function") {
      throw new TypeError("A session, raw transport and synchronous publisher are required.");
    }
    const pending = new Map();
    const failed = new Map();
    const keyOf = identity => JSON.stringify([
      identity.userId, identity.epoch, identity.routineId, identity.cycle, identity.day
    ]);
    const sameSession = identity => {
      const current = getSession();
      return Boolean(current && String(current.userId || "") === identity.userId &&
        current.epoch === identity.epoch);
    };
    const checkSession = identity => {
      if (!sameSession(identity)) throw new CompletionError("SESSION_CHANGED");
    };
    const notify = (identity, phase, errorCode = null) => {
      if (!sameSession(identity)) return;
      try { onChange(Object.freeze({ identity, phase, errorCode })); }
      catch (_) { /* UI listeners must not change persistence results. */ }
    };

    function status(input) {
      const identity = normalizeIdentity(input, getSession());
      const key = keyOf(identity);
      if (pending.has(key)) return Object.freeze({ phase: "pending" });
      if (failed.has(key)) return Object.freeze({ phase: "failed", errorCode: failed.get(key) });
      return Object.freeze({ phase: "idle" });
    }

    function complete(input) {
      let identity;
      try { identity = normalizeIdentity(input, getSession()); }
      catch (error) { return Promise.reject(error); }
      const key = keyOf(identity);
      if (pending.has(key)) return pending.get(key);
      failed.delete(key);

      // Queue the work so the pending entry exists before any transport call.
      const task = Promise.resolve().then(async () => {
        checkSession(identity);
        let state = null;
        let originalError = null;
        let reconciled = false;
        try { state = await transport.complete(identity); }
        catch (error) { originalError = error; }
        checkSession(identity);

        // accept() must be synchronous and must reject stale states atomically.
        function accept(candidate) {
          if (!isConfirmed(candidate, identity)) return null;
          checkSession(identity);
          const accepted = transport.accept(candidate, identity);
          if (accepted && typeof accepted.then === "function") {
            throw new CompletionError("ASYNC_PUBLISHER");
          }
          checkSession(identity);
          return isConfirmed(accepted, identity) ? accepted : null;
        }

        let accepted = accept(state);
        if (!accepted) {
          // A failed response can follow a COMMIT. Read once, never POST again.
          reconciled = true;
          try { state = await transport.read(identity); }
          catch (error) { if (!originalError) originalError = error; state = null; }
          checkSession(identity);
          accepted = accept(state);
        }
        if (!accepted) {
          throw new CompletionError("UNCONFIRMED", originalError);
        }
        return Object.freeze({ identity, state: accepted, reconciled });
      }).then(result => {
        failed.delete(key);
        notify(identity, "confirmed");
        return result;
      }, error => {
        const code = error instanceof CompletionError ? error.code : "UNCONFIRMED";
        if (sameSession(identity)) {
          failed.set(key, code);
          notify(identity, "failed", code);
        }
        throw error;
      }).finally(() => {
        if (pending.get(key) === task) pending.delete(key);
      });

      pending.set(key, task);
      notify(identity, "pending");
      return task;
    }

    return Object.freeze({ complete, status });
  }

  return Object.freeze({ ROUTINES, CompletionError, normalizeIdentity,
    isConfirmed, createController });
});
