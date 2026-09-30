"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NuRoutineProgressSyncV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  const OUTBOX_KEY = "nuapp:routine-progress-outbox:v1";
  const RETRY_DELAYS = [2000, 5000, 15000, 30000];
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
      completedAtKey
    ) {
      const safeDay = Number(day);
      const completedAt =
        Number(storage.getItem(completedAtKey));

      if (
        storage.getItem(completeKey) !== "1" ||
        !Number.isInteger(safeDay) ||
        safeDay < 1 ||
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
      `day${collagenDay}CompletedAt`
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
        `day:${routineId}:${day}:completedAt`
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
    let timer = null;
    let retryIndex = 0;
    let retryAt = null;
    let exhausted = false;
    let reconcileRequested = false;

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
      if (timer !== null) clearTimer(timer);
      timer = null;
      retryAt = null;
    }

    function scheduleRetry() {
      clearScheduledRetry();
      if (exhausted || !isOnline() || !isVisible()) return;
      if (!pendingForCurrentUser().length && !reconcileRequested) return;

      if (retryIndex >= RETRY_DELAYS.length) {
        exhausted = true;
        return;
      }

      const delay = RETRY_DELAYS[retryIndex++];
      retryAt = now() + delay;
      timer = setTimer(() => {
        timer = null;
        retryAt = null;
        flush("retry").catch(warn);
      }, delay);
    }

    async function flush(reason = "active") {
      if (running) return running;

      const userId = currentUserId();
      if (!userId || !isOnline() || !isVisible()) return null;

      const operations = pendingForCurrentUser();
      if (!operations.length && !reconcileRequested) {
        clearScheduledRetry();
        retryIndex = 0;
        exhausted = false;
        return null;
      }

      clearScheduledRetry();

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

          acknowledge(response.ackedIds);
          reconcileRequested = false;

          if (response.canonicalState) {
            publishCanonical(response.canonicalState);
          }
          if (response.productState) {
            publishProducts(response.productState);
          }

          if (pendingForCurrentUser().length || reconcileRequested) {
            scheduleRetry();
          } else {
            retryIndex = 0;
            exhausted = false;
          }

          return response;
        })
        .catch(error => {
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
      exhausted = false;
      retryIndex = 0;
      retryAt = null;
      clearScheduledRetry();
      return flush(reason);
    }

    async function reconcile(reason = "reconcile") {
      reconcileRequested = true;
      exhausted = false;
      retryIndex = 0;
      retryAt = null;
      clearScheduledRetry();
      return flush(reason);
    }

    function suspend() {
      clearScheduledRetry();
    }

    function inspect() {
      return {
        running: Boolean(running),
        retryAt,
        retryIndex,
        exhausted,
        reconcileRequested,
        pending: pendingForCurrentUser().length
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
      inspect
    };
  }

  return {
    OUTBOX_KEY,
    collectLegacyCurrentCompletionsV1,
    createRoutineProgressSyncV1
  };
});
