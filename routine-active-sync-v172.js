"use strict";

// V172: one reconciliation coordinator. No DOM or network side effects on import.
// The adapter owns authentication, HTTP and publication of authoritative snapshots.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NuRoutineActiveSyncV172 = api;
})(typeof window !== "undefined" ? window : null, function () {
  const PRODUCT_IDS = ["lumispa-10", "wellspa-10", "galvanicspa-10"];
  const RETRY_DELAYS = [2000, 5000, 15000, 30000];
  const PASSIVE_MIN_MS = 4000;
  const INITIAL_GRACE_MS = 3000;
  const DUE_GRACE_MS = 750;
  const REQUEST_TIMEOUT_MS = 15000;

  function timestamp(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function createRoutineActiveSyncV172(adapter) {
    const now = adapter.now || Date.now;
    const setTimer = adapter.setTimeout || setTimeout;
    const clearTimer = adapter.clearTimeout || clearTimeout;
    const visible = adapter.isVisible || (() => true);
    const online = adapter.isOnline || (() => true);
    const report = adapter.onStatus || (() => {});
    const warn = adapter.warn || (() => {});
    const jitter = adapter.jitter || (() => 0);
    let identity = null;
    let epoch = 0;
    let readyAt = null;
    let started = false;
    let running = null;
    let timer = null;
    let timerAt = null;
    let lastStartedAt = -Infinity;
    let pending = false;
    let pendingReason = "active";
    let forced = false;
    let followUp = false;
    let retryIndex = 0;
    let retryAt = null;
    let exhausted = false;
    let known = new Map();
    const aborters = new Set();
    const requestTimeoutMs = adapter.requestTimeoutMs || REQUEST_TIMEOUT_MS;

    function fetchWithDeadline(fetcher, requestIdentity) {
      const controller = new AbortController();
      aborters.add(controller);
      let deadline = null;
      let removeAbort = null;
      const aborted = new Promise((_, reject) => {
        const rejectAbort = () => {
          const error = new Error("Reconciliación interrumpida.");
          error.name = "AbortError";
          reject(error);
        };
        controller.signal.addEventListener("abort", rejectAbort, { once: true });
        removeAbort = () => controller.signal.removeEventListener("abort", rejectAbort);
      });
      const timeout = new Promise((_, reject) => {
        deadline = setTimer(() => {
          const error = new Error("Tiempo de espera de reconciliación agotado.");
          error.name = "TimeoutError";
          controller.abort();
          reject(error);
        }, requestTimeoutMs);
      });
      // A late HTTP response never publishes directly; only execute() can publish.
      return Promise.race([
        Promise.resolve().then(() => fetcher(requestIdentity, { signal: controller.signal })),
        timeout, aborted
      ]).finally(() => {
        if (deadline !== null) clearTimer(deadline);
        if (removeAbort) removeAbort();
        aborters.delete(controller);
      });
    }

    function cancelTimer() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      timerAt = null;
    }
    function currentIdentity() {
      const value = adapter.getIdentity();
      return value === null || value === undefined || value === "" ? null : String(value);
    }
    function resetIdentity() {
      const next = currentIdentity();
      if (next === identity) return;
      for (const controller of aborters) controller.abort();
      identity = next;
      epoch += 1;
      known = new Map();
      retryIndex = 0;
      retryAt = null;
      exhausted = false;
      pending = Boolean(next);
      forced = true;
      followUp = false;
      lastStartedAt = -Infinity;
      cancelTimer();
    }
    function dueAt() {
      const values = [...known.values()].filter(value => value !== null);
      if (!values.length) return null;
      return Math.min(...values);
    }
    function isDue() {
      const target = dueAt();
      return target !== null && target <= now();
    }
    function scheduleAt(at) {
      if (timerAt !== null && timerAt <= at) return;
      cancelTimer();
      timerAt = at;
      timer = setTimer(() => {
        timer = null;
        timerAt = null;
        pump();
      }, Math.max(0, at - now()));
    }
    function schedule() {
      cancelTimer();
      if (!started || !identity || !visible() || !online()) return;
      if (running) return;
      if (exhausted) return;
      const time = now();
      if (pending || isDue()) {
        const grace = readyAt === null ? time : readyAt + INITIAL_GRACE_MS;
        const minimum = forced ? time : Math.max(time, grace, lastStartedAt + PASSIVE_MIN_MS);
        scheduleAt(Math.max(minimum, retryAt || 0));
        return;
      }
      const target = dueAt();
      if (target !== null) scheduleAt(Math.max(time, target + DUE_GRACE_MS));
    }
    function rememberOne(id, state) {
      if (!state || state.initialized === false) return;
      const old = known.get(id);
      const next = timestamp(state.nextUnlockAt);
      known.set(id, next);
      if (next !== old && next !== null && next <= now()) {
        pending = true;
        pendingReason = "unlock-due";
        // A genuinely new due time starts a new, bounded recovery episode.
        exhausted = false;
        retryIndex = 0;
        retryAt = null;
      }
      schedule();
    }
    function rememberCanonical(state) {
      resetIdentity();
      if (!identity || !state || String(state.userId || "") !== identity) return;
      rememberOne("collagen-30", state);
    }
    function rememberProducts(state) {
      resetIdentity();
      if (!identity || !state || (state.userId && String(state.userId) !== identity)) return;
      for (const id of PRODUCT_IDS) {
        if (state.routines?.[id]) rememberOne(id, state.routines[id]);
      }
    }
    function transient(error) {
      const status = Number(error?.status || error?.statusCode || 0);
      return !status || status === 408 || status === 425 || status === 429 || status >= 500;
    }
    function deferRetry(error, unresolved) {
      if (!unresolved && !error) {
        retryIndex = 0;
        retryAt = null;
        exhausted = false;
        pending = false;
        return;
      }
      pending = true;
      if (error && !transient(error)) {
        exhausted = true;
        retryAt = null;
        report({ connected: false, reason: pendingReason, needsAttention: true, error: error.message });
        return;
      }
      if (retryIndex >= RETRY_DELAYS.length) {
        exhausted = true;
        retryAt = null;
        report({ connected: !error, reason: pendingReason, needsAttention: true, error: error?.message });
        return;
      }
      const delay = RETRY_DELAYS[retryIndex++];
      const retryAfterMs = Number(error?.retryAfterMs || 0);
      retryAt = now() + Math.max(delay + Math.max(0, Number(jitter(delay)) || 0), retryAfterMs);
    }
    async function execute(reason) {
      const requestIdentity = identity;
      const requestEpoch = epoch;
      const isCurrent = () => requestEpoch === epoch && currentIdentity() === requestIdentity;
      let canonical = null;
      let products = null;
      const errors = [];
      // A failure in Collagen must not prevent product reconciliation.
      const results = await Promise.allSettled([
        fetchWithDeadline(adapter.fetchCanonical, requestIdentity),
        fetchWithDeadline(adapter.fetchProducts, requestIdentity)
      ]);
      if (!isCurrent()) return { stale: true };
      if (results[0].status === "fulfilled") {
        canonical = results[0].value;
        if (canonical && String(canonical.userId || "") === requestIdentity) {
          const accepted = adapter.publishCanonical(canonical);
          if (accepted !== false && accepted !== null) rememberCanonical(
            accepted && typeof accepted === "object" ? accepted : canonical
          );
        } else errors.push(new Error("Identidad inválida en el estado de Collagen."));
      } else errors.push(results[0].reason);
      if (results[1].status === "fulfilled") {
        products = results[1].value;
        if (products && (!products.userId || String(products.userId) === requestIdentity)) {
          const accepted = adapter.publishProducts(products);
          if (accepted !== false && accepted !== null) rememberProducts(
            accepted && typeof accepted === "object" ? accepted : products
          );
        } else errors.push(new Error("Identidad inválida en el estado de productos."));
      } else errors.push(results[1].reason);
      const error = errors[0] || null;
      report({ connected: !error, reason, partial: errors.length === 1, error: error?.message });
      if (error) warn(error);
      return { canonicalState: canonical, productState: products, error, reason };
    }
    function pump() {
      resetIdentity();
      if (!started || !identity || !visible() || !online() || running || exhausted) return;
      const time = now();
      if (!pending && !isDue()) {
        schedule();
        return;
      }
      const grace = readyAt === null ? time : readyAt + INITIAL_GRACE_MS;
      const earliest = forced ? time : Math.max(time, grace, lastStartedAt + PASSIVE_MIN_MS);
      const permitted = Math.max(earliest, retryAt || 0);
      if (permitted > time) {
        scheduleAt(permitted);
        return;
      }
      cancelTimer();
      const reason = pendingReason;
      pending = false;
      forced = false;
      lastStartedAt = time;
      const requestEpoch = epoch;
      running = execute(reason).then(result => {
        if (requestEpoch !== epoch || result.stale) return result;
        deferRetry(result.error, isDue());
        if (followUp) {
          followUp = false;
          pending = true;
        }
        return result;
      }).catch(error => {
        if (requestEpoch === epoch) deferRetry(error, true);
        warn(error);
        return { error, reason };
      }).finally(() => {
        running = null;
        if (requestEpoch === epoch) schedule();
        else if (identity) schedule();
      });
    }
    function request(reason = "active", options = {}) {
      resetIdentity();
      if (!identity) return Promise.resolve(null);
      pending = true;
      pendingReason = reason;
      if (options.force) {
        forced = true;
        exhausted = false;
        retryIndex = 0;
        retryAt = null;
      }
      if (running) {
        // Only a genuine new demand requires a subsequent pass.
        if (options.force || reason === "unlock-due" || reason === "completion-uncertain") followUp = true;
        return running;
      }
      pump();
      return running || Promise.resolve(null);
    }
    function start() {
      if (started) return;
      started = true;
      readyAt = now();
      resetIdentity();
      if (identity) request("initial", { force: true });
    }
    function onResume(reason = "active") {
      resetIdentity();
      if (!identity) return;
      if (!visible() || !online()) { cancelTimer(); return; }
      // A new foreground/network episode is recoverable after exhausted retries.
      request(reason, { force: exhausted || isDue() });
    }
    function suspend() { cancelTimer(); }
    function invalidate() {
      for (const controller of aborters) controller.abort();
      identity = null;
      epoch += 1;
      known.clear();
      cancelTimer();
      resetIdentity();
      if (started && identity) request("identity-changed", { force: true });
    }
    function inspect() {
      return { identity, pending, running: Boolean(running), exhausted, retryIndex, retryAt, dueAt: dueAt(), timerAt };
    }
    return { start, request, onResume, suspend, invalidate, rememberCanonical, rememberProducts, inspect };
  }
  return { createRoutineActiveSyncV172, timestamp, PRODUCT_IDS, RETRY_DELAYS, REQUEST_TIMEOUT_MS };
});
