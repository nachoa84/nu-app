"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NuRoutineProgressSyncV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  const OUTBOX_KEY = "nuapp:routine-progress-outbox:v1";
  const RETRY_DELAYS = [2000, 5000, 15000, 30000];
  const PASSIVE_MIN_MS = 4000;
  const DUE_GRACE_MS = 750;
  const ROUTINE_IDS = new Set([
    "collagen-30",
    "lumispa-10",
    "wellspa-10",
    "galvanicspa-10"
  ]);

  function safeParse(raw) {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function normalizeOperation(input) {
    if (!input || typeof input !== "object") return null;

    const userId = String(input.userId || "").trim();
    const routineId = String(input.routineId || "").trim();
    const day = Number(input.day);
    const completedAt = Number(input.completedAt);
    const id = String(input.id || "").trim();

    if (!userId || !id || !ROUTINE_IDS.has(routineId)) return null;
    if (!Number.isInteger(day) || day < 1 || day > (routineId === "collagen-30" ? 30 : 10)) {
      return null;
    }
    if (!Number.isFinite(completedAt) || completedAt <= 0) return null;

    return {
      id,
      userId,
      routineId,
      day,
      completedAt
    };
  }

  function collectLegacyCurrentCompletionsV1(
    storage,
    userId
  ) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId || !storage?.getItem) return [];

    const operations = [];

    function readState(key) {
      try {
        return JSON.parse(storage.getItem(key) || "null");
      } catch (_) {
        return null;
      }
    }

    function maybeCollect(
      routineId,
      day,
      completeKey,
      completedAtKey,
      maxDay
    ) {
      const safeDay = Number(day);
      const completedAt =
        Number(storage.getItem(completedAtKey));

      if (
        storage.getItem(completeKey) !== "1" ||
        !Number.isInteger(safeDay) ||
        safeDay < 1 ||
        safeDay > Number(maxDay) ||
        !Number.isFinite(completedAt) ||
        completedAt <= 0
      ) {
        return;
      }

      operations.push({
        userId: safeUserId,
        routineId,
        day: safeDay,
        completedAt
      });
    }

    const collagen =
      readState("routineState");
    const collagenDay =
      Number(collagen?.currentDay || 1);

    maybeCollect(
      "collagen-30",
      collagenDay,
      `day${collagenDay}Complete`,
      `day${collagenDay}CompletedAt`,
      30
    );

    for (const routineId of [
      "lumispa-10",
      "wellspa-10",
      "galvanicspa-10"
    ]) {
      const state =
        readState(`routineState:${routineId}`);

      if (!state) continue;

      const day =
        Number(state.currentDay || 1);

      maybeCollect(
        routineId,
        day,
        `day:${routineId}:${day}:complete`,
        `day:${routineId}:${day}:completedAt`,
        10
      );
    }

    return operations;
  }

  function createRoutineProgressSyncV1(adapter = {}) {
    const storage = adapter.storage;
    if (!storage?.getItem || !storage?.setItem) {
      throw new Error("storage es obligatorio.");
    }

    const now = adapter.now || Date.now;
    const setTimer = adapter.setTimeout || setTimeout;
    const clearTimer = adapter.clearTimeout || clearTimeout;
    const getUserId = adapter.getUserId || (() => null);
    const isOnline = adapter.isOnline || (() => true);
    const isVisible = adapter.isVisible || (() => true);
    const transport = adapter.transport;
    const publishCanonical = adapter.publishCanonical || (() => {});
    const publishProducts = adapter.publishProducts || (() => {});
    const warn = adapter.warn || (() => {});

    if (typeof transport !== "function") {
      throw new Error("transport es obligatorio.");
    }

    let running = null;
    let retryTimer = null;
    let retryIndex = 0;
    let retryAt = null;
    let dueTimer = null;
    let dueTimerAt = null;
    let exhausted = false;
    let reconcileRequested = false;
    let identity = null;
    let knownUnlocks = new Map();
    let lastFreshAt = -Infinity;
    let lastTransportAt = -Infinity;

    function readOutbox() {
      return safeParse(storage.getItem(OUTBOX_KEY))
        .map(normalizeOperation)
        .filter(Boolean);
    }

    function writeOutbox(operations) {
      storage.setItem(
        OUTBOX_KEY,
        JSON.stringify(
          operations
            .map(normalizeOperation)
            .filter(Boolean)
        )
      );
    }

    function currentUserId() {
      const value = getUserId();
      return value === null || value === undefined || value === ""
        ? null
        : String(value);
    }

    function timestamp(value) {
      if (value === null || value === undefined || value === "") return null;
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
      const parsed = Date.parse(String(value));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    function clearDueTimer() {
      if (dueTimer !== null) clearTimer(dueTimer);
      dueTimer = null;
      dueTimerAt = null;
    }

    function ensureIdentity() {
      const next = currentUserId();
      if (next === identity) return next;

      identity = next;
      knownUnlocks = new Map();
      reconcileRequested = false;
      exhausted = false;
      retryIndex = 0;
      retryAt = null;
      lastFreshAt = -Infinity;
      lastTransportAt = -Infinity;
      clearScheduledRetry();
      clearDueTimer();

      return identity;
    }

    function dueAt() {
      const values = [...knownUnlocks.values()]
        .filter(value => value !== null);
      if (!values.length) return null;
      return Math.min(...values);
    }

    function isDue() {
      const target = dueAt();
      return target !== null && target <= now();
    }

    function scheduleDue() {
      clearDueTimer();
      ensureIdentity();
      if (
        !identity ||
        !isOnline() ||
        !isVisible() ||
        exhausted
      ) {
        return;
      }

      const target = dueAt();
      if (target === null) return;

      if (target <= now()) {
        dueTimerAt = now();
        dueTimer = setTimer(() => {
          dueTimer = null;
          dueTimerAt = null;
          reconcile("unlock-due").catch(warn);
        }, 0);
        return;
      }

      dueTimerAt = target + DUE_GRACE_MS;
      dueTimer = setTimer(() => {
        dueTimer = null;
        dueTimerAt = null;
        reconcile("unlock-due").catch(warn);
      }, Math.max(0, dueTimerAt - now()));
    }

    function rememberOne(routineId, state) {
      if (!state || state.initialized === false) return;

      const previous =
        knownUnlocks.get(routineId) ?? null;
      const next =
        timestamp(state.nextUnlockAt);

      knownUnlocks.set(
        routineId,
        next
      );

      if (
        next !== previous &&
        next !== null
      ) {
        exhausted = false;
        retryIndex = 0;
        retryAt = null;
      }

      if (!running) {
        scheduleDue();
      }
    }

    function rememberCanonical(state) {
      const userId = ensureIdentity();
      if (
        !userId ||
        !state ||
        String(state.userId || "") !== userId
      ) {
        return false;
      }

      rememberOne("collagen-30", state);
      lastFreshAt = now();
      return true;
    }

    function rememberProducts(state) {
      const userId = ensureIdentity();
      if (
        !userId ||
        !state ||
        (state.userId && String(state.userId) !== userId)
      ) {
        return false;
      }

      for (const routineId of [
        "lumispa-10",
        "wellspa-10",
        "galvanicspa-10"
      ]) {
        if (state.routines?.[routineId]) {
          rememberOne(
            routineId,
            state.routines[routineId]
          );
        }
      }

      return true;
    }

    function inspectOutbox() {
      return readOutbox();
    }

    function pendingForCurrentUser() {
      const userId = currentUserId();
      if (!userId) return [];
      return readOutbox().filter(operation => operation.userId === userId);
    }

    function recordCompletion({
      routineId,
      day,
      completedAt = now()
    }) {
      const userId = currentUserId();
      if (!userId) {
        throw new Error("No hay identidad activa para registrar progreso.");
      }

      const safeRoutineId = String(routineId || "").trim();
      const safeDay = Number(day);
      const safeCompletedAt = Number(completedAt);

      if (!ROUTINE_IDS.has(safeRoutineId)) {
        throw new Error("Rutina no válida.");
      }
      const maxDay = safeRoutineId === "collagen-30" ? 30 : 10;
      if (!Number.isInteger(safeDay) || safeDay < 1 || safeDay > maxDay) {
        throw new Error("Día no válido.");
      }
      if (!Number.isFinite(safeCompletedAt) || safeCompletedAt <= 0) {
        throw new Error("completedAt inválido.");
      }

      const outbox = readOutbox();
      const existing = outbox.find(operation =>
        operation.userId === userId &&
        operation.routineId === safeRoutineId &&
        operation.day === safeDay
      );

      if (existing) return existing;

      const operation = {
        id: [
          userId,
          safeRoutineId,
          safeDay,
          Math.trunc(safeCompletedAt)
        ].join(":"),
        userId,
        routineId: safeRoutineId,
        day: safeDay,
        completedAt: safeCompletedAt
      };

      outbox.push(operation);
      writeOutbox(outbox);

      exhausted = false;
      retryIndex = 0;
      retryAt = null;

      return operation;
    }

    function acknowledge(ids) {
      const acknowledged = new Set(
        Array.isArray(ids) ? ids.map(String) : []
      );
      if (!acknowledged.size) return;

      writeOutbox(
        readOutbox().filter(operation => !acknowledged.has(operation.id))
      );
    }

    function isCompletionPending(routineId, day) {
      const userId = currentUserId();
      if (!userId) return false;
      const safeRoutineId = String(routineId || "");
      const safeDay = Number(day);
      return readOutbox().some(operation =>
        operation.userId === userId &&
        operation.routineId === safeRoutineId &&
        operation.day === safeDay
      );
    }

    function clearScheduledRetry() {
      if (retryTimer !== null) clearTimer(retryTimer);
      retryTimer = null;
      retryAt = null;
    }

    function scheduleRetry() {
      clearScheduledRetry();
      if (exhausted || !isOnline() || !isVisible()) return;
      if (
        !pendingForCurrentUser().length &&
        !reconcileRequested &&
        !isDue()
      ) {
        return;
      }

      if (retryIndex >= RETRY_DELAYS.length) {
        exhausted = true;
        return;
      }

      const delay = RETRY_DELAYS[retryIndex++];
      retryAt = now() + delay;
      retryTimer = setTimer(() => {
        retryTimer = null;
        retryAt = null;
        flush("retry").catch(warn);
      }, delay);
    }

    async function flush(reason = "active") {
      ensureIdentity();
      if (running) return running;

      const userId = identity;
      if (!userId || !isOnline() || !isVisible()) return null;

      const operations = pendingForCurrentUser();
      if (
        !operations.length &&
        !reconcileRequested &&
        !isDue()
      ) {
        clearScheduledRetry();
        retryIndex = 0;
        exhausted = false;
        scheduleDue();
        return null;
      }

      const requestReconcile =
        reconcileRequested || isDue();
      reconcileRequested = false;
      clearScheduledRetry();
      lastTransportAt = now();

      running = Promise.resolve()
        .then(() => transport({
          userId,
          reason,
          operations
        }))
        .then(response => {
          if (!response || typeof response !== "object") {
            throw new Error("Respuesta inválida de sincronización de progreso.");
          }

          if (
            currentUserId() !== userId
          ) {
            return {
              stale: true,
              reason
            };
          }

          acknowledge(response.ackedIds);

          if (response.canonicalState) {
            rememberCanonical(response.canonicalState);
            publishCanonical(response.canonicalState);
          }
          if (response.productState) {
            rememberProducts(response.productState);
            publishProducts(response.productState);
          }

          if (
            pendingForCurrentUser().length ||
            reconcileRequested ||
            isDue()
          ) {
            scheduleRetry();
          } else {
            retryIndex = 0;
            exhausted = false;
            scheduleDue();
          }

          return response;
        })
        .catch(error => {
          if (currentUserId() !== userId) {
            return {
              stale: true,
              error,
              reason
            };
          }

          if (requestReconcile) {
            reconcileRequested = true;
          }
          scheduleRetry();
          warn(error);
          return { error, reason };
        })
        .finally(() => {
          running = null;
        });

      return running;
    }

    async function onResume(reason = "resume") {
      ensureIdentity();
      exhausted = false;
      retryIndex = 0;
      retryAt = null;
      clearScheduledRetry();

      if (!identity || !isOnline() || !isVisible()) {
        clearDueTimer();
        return null;
      }

      if (pendingForCurrentUser().length) {
        return flush(reason);
      }

      if (isDue() || reason === "online") {
        return reconcile(
          isDue() ? "unlock-due" : reason
        );
      }

      if (
        now() - lastFreshAt >= PASSIVE_MIN_MS &&
        now() - lastTransportAt >= PASSIVE_MIN_MS
      ) {
        return reconcile(reason);
      }

      scheduleDue();
      return null;
    }

    async function reconcile(reason = "reconcile") {
      ensureIdentity();
      reconcileRequested = true;
      exhausted = false;
      retryIndex = 0;
      retryAt = null;
      clearScheduledRetry();
      return flush(reason);
    }

    function suspend() {
      clearScheduledRetry();
      clearDueTimer();
    }

    function inspect() {
      ensureIdentity();
      return {
        identity,
        running: Boolean(running),
        retryAt,
        retryIndex,
        exhausted,
        reconcileRequested,
        pending: pendingForCurrentUser().length,
        dueAt: dueAt(),
        dueTimerAt,
        lastFreshAt,
        lastTransportAt
      };
    }

    return {
      recordCompletion,
      pendingForCurrentUser,
      inspectOutbox,
      isCompletionPending,
      flush,
      onResume,
      reconcile,
      suspend,
      rememberCanonical,
      rememberProducts,
      inspect
    };
  }

  return {
    OUTBOX_KEY,
    collectLegacyCurrentCompletionsV1,
    createRoutineProgressSyncV1
  };
});
