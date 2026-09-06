(() => {
  const PROFILE_KEY = "routineUserProfile";

  function emit(name, detail) {
    window.dispatchEvent(
      new CustomEvent(name, { detail })
    );
  }

  function getProfile() {
    try {
      return JSON.parse(
        localStorage.getItem(PROFILE_KEY) || "null"
      );
    } catch (e) {
      return null;
    }
  }

  function saveProfile(profile) {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify(profile)
    );
  }

  function createUserId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    return (
      "usr_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2)
    );
  }

  function ensureUserId(profile = getProfile()) {
    if (!profile) return null;

    if (!profile.userId) {
      profile.userId = createUserId();
      saveProfile(profile);
    }

    return profile;
  }

  function getLocalRoutineState() {
    try {
      return JSON.parse(
        localStorage.getItem("routineState") ||
        JSON.stringify({
          currentDay: 1,
          openedDays: {},
          nextUnlockAt: null
        })
      );
    } catch (e) {
      return {
        currentDay: 1,
        openedDays: {},
        nextUnlockAt: null
      };
    }
  }

  function getCompletedDays() {
    const days = [];

    for (let day = 1; day <= 30; day++) {
      if (
        localStorage.getItem(
          `day${day}Complete`
        ) === "1"
      ) {
        days.push(day);
      }
    }

    return days;
  }

  function getCompletedAtByDay() {
    const completedAtByDay = {};

    for (let day = 1; day <= 30; day++) {
      const value =
        Number(
          localStorage.getItem(
            `day${day}CompletedAt`
          )
        );

      if (Number.isFinite(value) && value > 0) {
        completedAtByDay[day] = value;
      }
    }

    return completedAtByDay;
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const payload = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      const message =
        payload.error ||
        `Error HTTP ${response.status}`;

      throw new Error(message);
    }

    return payload;
  }

  function syncProfileFromState(state) {
    if (
      !state?.profile ||
      !state?.userId
    ) {
      return;
    }

    const current =
      getProfile() || {};

    const synced = {
      ...current,
      userId:
        state.userId,
      name:
        state.profile.name,
      country:
        state.profile.country,
      timezone:
        state.profile.timezone,
      notificationTime:
        state.profile.notificationTime,
      startedAt:
        current.startedAt ||
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString()
    };

    saveProfile(synced);

    emit(
      "routine-profile-synced",
      synced
    );
  }

  function publishState(state) {
    if (!state) return;

    syncProfileFromState(state);

    emit(
      "backend-state-updated",
      state
    );
  }

  async function bootstrapFromLocal() {
    let profile = getProfile();

    if (!profile) {
      return null;
    }

    profile = ensureUserId(profile);

    const payload = await request(
      "/api/bootstrap",
      {
        method: "POST",
        body: JSON.stringify({
          profile,
          localState:
            getLocalRoutineState(),
          completedDays:
            getCompletedDays(),
          completedAtByDay:
            getCompletedAtByDay()
        })
      }
    );

    publishState(payload.state);
    await bootstrapProductRoutinesV98().catch(error => {
      console.warn("Las rutinas de producto continúan en modo local.", error);
      return null;
    });

    emit(
      "backend-status",
      {
        connected: true
      }
    );

    return payload.state;
  }

  async function getState() {
    const profile =
      ensureUserId();

    if (!profile?.userId) {
      return null;
    }

    const payload = await request(
      `/api/state/${encodeURIComponent(
        profile.userId
      )}`
    );

    publishState(payload.state);

    return payload.state;
  }

  async function openDay(day) {
    const profile =
      ensureUserId();

    if (!profile?.userId) {
      return null;
    }

    const payload = await request(
      "/api/routine/open",
      {
        method: "POST",
        body: JSON.stringify({
          userId: profile.userId,
          day
        })
      }
    );

    publishState(payload.state);

    return payload.state;
  }

  async function completeDay(day) {
    const profile =
      ensureUserId();

    if (!profile?.userId) {
      return null;
    }

    const payload = await request(
      "/api/routine/complete",
      {
        method: "POST",
        body: JSON.stringify({
          userId: profile.userId,
          day
        })
      }
    );

    publishState(payload.state);

    return payload.state;
  }

  async function updateProfile(profile) {
    profile =
      ensureUserId(profile);

    if (!profile?.userId) {
      return null;
    }

    const payload = await request(
      `/api/profile/${encodeURIComponent(
        profile.userId
      )}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: profile.name,
          country: profile.country,
          timezone: profile.timezone,
          notificationTime:
            profile.notificationTime
        })
      }
    );

    publishState(payload.state);

    await getProductRoutineStatesV136()
      .catch(error => {
        console.warn(
          "No se pudo refrescar el horario de las rutinas de producto.",
          error
        );
        return null;
      });

    return payload.state;
  }

  async function demoAdvance() {
    const profile =
      ensureUserId();

    if (!profile?.userId) {
      return null;
    }

    const payload = await request(
      "/api/routine/demo-advance",
      {
        method: "POST",
        body: JSON.stringify({
          userId: profile.userId
        })
      }
    );

    publishState(payload.state);

    return payload.state;
  }

  async function health() {
    return request("/api/health");
  }



  // NU APP · SINCRONIZACIÓN MULTIRUTINA V98
  const PRODUCT_ROUTINE_IDS_V98 = ["lumispa-10", "wellspa-10", "galvanicspa-10"];

  function getLocalProductRoutinesV98() {
    const routines = {};
    PRODUCT_ROUTINE_IDS_V98.forEach(routineId => {
      let local = { currentDay: 1, openedDays: {} };
      try {
        local = JSON.parse(localStorage.getItem(`routineState:${routineId}`) || "null") || local;
      } catch (error) { void error; }
      const completedDays = [];
      const completedAtByDay = {};
      for (let day = 1; day <= 10; day++) {
        if (localStorage.getItem(`day:${routineId}:${day}:complete`) === "1") {
          completedDays.push(day);
        }

        const completedAt =
          Number(
            localStorage.getItem(
              `day:${routineId}:${day}:completedAt`
            )
          );

        if (Number.isFinite(completedAt) && completedAt > 0) {
          completedAtByDay[day] = completedAt;
        }
      }
      routines[routineId] = {
        currentDay: Math.max(1, Math.min(10, Number(local.currentDay || 1))),
        openedDays: local.openedDays || {},
        completedDays,
        completedAtByDay
      };
    });
    return routines;
  }

  function publishProductRoutineStatesV98(state) {
    if (state) emit("product-routines-state-updated", state);
  }

  async function bootstrapProductRoutinesV98() {
    const profile = ensureUserId();
    if (!profile?.userId) return null;
    const payload = await request("/api/product-routines/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        userId: profile.userId,
        routines: getLocalProductRoutinesV98()
      })
    });
    publishProductRoutineStatesV98(payload.state);
    return payload.state;
  }

  async function getProductRoutineStatesV136() {
    const profile = ensureUserId();
    if (!profile?.userId) return null;

    const payload = await request(
      `/api/product-routines/state/${encodeURIComponent(profile.userId)}`
    );

    publishProductRoutineStatesV98(payload.state);
    return payload.state;
  }

  async function openProductRoutineDay(routineId, day) {
    const profile = ensureUserId();
    if (!profile?.userId) return null;
    const payload = await request("/api/product-routines/open", {
      method: "POST",
      body: JSON.stringify({ userId: profile.userId, routineId, day })
    });
    publishProductRoutineStatesV98(payload.state);
    return payload.state;
  }

  async function completeProductRoutineDay(routineId, day) {
    const profile = ensureUserId();
    if (!profile?.userId) return null;
    const payload = await request("/api/product-routines/complete", {
      method: "POST",
      body: JSON.stringify({ userId: profile.userId, routineId, day })
    });
    publishProductRoutineStatesV98(payload.state);
    return payload.state;
  }


  // NU APP · SINCRONIZACIÓN ACTIVA DE ESTADO V169
  // PostgreSQL sigue siendo la única autoridad para avanzar días.
  // El cliente solo vuelve a consultar el estado oficial en momentos
  // naturales de uso y exactamente cuando vence un nextUnlockAt confirmado.
  // No hay polling ni cálculo local de currentDay.
  const ACTIVE_SYNC_PASSIVE_MIN_MS = 4000;
  const ACTIVE_SYNC_INITIAL_GRACE_MS = 3000;
  const ACTIVE_SYNC_UNLOCK_GRACE_MS = 750;

  let activeSyncPromise = null;
  let activeSyncLastStartedAt = 0;
  let activeSyncReadyAt = 0;
  let canonicalNextUnlockAt = null;
  let productNextUnlockAt = null;
  let unlockRefreshTimer = null;
  let unlockRefreshTarget = null;
  let lastDueUnlockAttempt = null;

  function parseUnlockTimestamp(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }

    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : null;
  }

  function hasStoredProfileWithId() {
    const profile = getProfile();
    return Boolean(profile?.userId);
  }

  function hasLocalProductRoutineState() {
    return PRODUCT_ROUTINE_IDS_V98.some(
      routineId =>
        Boolean(
          localStorage.getItem(
            `routineState:${routineId}`
          )
        )
    );
  }

  function isDocumentVisible() {
    return (
      typeof document === "undefined" ||
      document.visibilityState !== "hidden"
    );
  }

  function clearUnlockRefreshTimer() {
    if (unlockRefreshTimer !== null) {
      clearTimeout(unlockRefreshTimer);
      unlockRefreshTimer = null;
    }
    unlockRefreshTarget = null;
  }

  function nextKnownUnlockAt() {
    const candidates = [
      canonicalNextUnlockAt,
      productNextUnlockAt
    ].filter(value =>
      Number.isFinite(value) && value > 0
    );

    return candidates.length
      ? Math.min(...candidates)
      : null;
  }

  function scheduleKnownUnlockRefresh() {
    clearUnlockRefreshTimer();

    const target = nextKnownUnlockAt();
    if (!target) {
      lastDueUnlockAttempt = null;
      return;
    }

    if (
      lastDueUnlockAttempt !== null &&
      lastDueUnlockAttempt !== target
    ) {
      lastDueUnlockAttempt = null;
    }

    const now = Date.now();
    if (
      target <= now &&
      lastDueUnlockAttempt === target
    ) {
      return;
    }

    const delay = Math.max(
      target - now + ACTIVE_SYNC_UNLOCK_GRACE_MS,
      0
    );

    unlockRefreshTarget = target;
    unlockRefreshTimer = setTimeout(() => {
      unlockRefreshTimer = null;
      unlockRefreshTarget = null;
      lastDueUnlockAttempt = target;

      if (
        !isDocumentVisible() ||
        (typeof navigator !== "undefined" && navigator.onLine === false)
      ) {
        return;
      }

      refreshActiveState(
        "unlock-due",
        { force: true }
      ).catch(error => {
        console.warn(
          "No se pudo refrescar el estado al vencer el desbloqueo.",
          error
        );
      });
    }, delay);
  }

  function rememberCanonicalUnlock(state) {
    canonicalNextUnlockAt =
      parseUnlockTimestamp(
        state?.nextUnlockAt
      );

    scheduleKnownUnlockRefresh();
  }

  function rememberProductUnlocks(state) {
    const routines =
      state?.routines || {};

    const candidates =
      PRODUCT_ROUTINE_IDS_V98
        .map(routineId =>
          parseUnlockTimestamp(
            routines[routineId]?.nextUnlockAt
          )
        )
        .filter(value =>
          Number.isFinite(value) && value > 0
        );

    productNextUnlockAt =
      candidates.length
        ? Math.min(...candidates)
        : null;

    scheduleKnownUnlockRefresh();
  }

  async function refreshActiveState(
    reason = "active",
    { force = false } = {}
  ) {
    if (!hasStoredProfileWithId()) {
      return null;
    }

    if (
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    ) {
      return null;
    }

    if (activeSyncPromise) {
      return activeSyncPromise;
    }

    const now = Date.now();
    if (
      !force &&
      now - activeSyncLastStartedAt <
        ACTIVE_SYNC_PASSIVE_MIN_MS
    ) {
      return null;
    }

    activeSyncLastStartedAt = now;

    activeSyncPromise = (async () => {
      const canonicalState =
        await getState();

      let productState = null;
      if (hasLocalProductRoutineState()) {
        try {
          productState =
            await getProductRoutineStatesV136();
        } catch (error) {
          console.warn(
            "No se pudo refrescar el estado activo de las rutinas de producto.",
            error
          );
        }
      }

      emit(
        "backend-status",
        {
          connected: true,
          reason
        }
      );

      return {
        canonicalState,
        productState,
        reason
      };
    })();

    try {
      return await activeSyncPromise;
    } catch (error) {
      emit(
        "backend-status",
        {
          connected: false,
          reason,
          error: error.message
        }
      );
      throw error;
    } finally {
      activeSyncPromise = null;
    }
  }

  function requestPassiveActiveSync(reason) {
    if (
      !activeSyncReadyAt ||
      !isDocumentVisible()
    ) {
      return;
    }

    if (
      Date.now() - activeSyncReadyAt <
      ACTIVE_SYNC_INITIAL_GRACE_MS
    ) {
      return;
    }

    refreshActiveState(reason)
      .catch(error => {
        console.warn(
          "No se pudo reconciliar el estado activo de la rutina.",
          error
        );
      });
  }

  function markActiveSyncReady() {
    if (!activeSyncReadyAt) {
      activeSyncReadyAt = Date.now();
    }
  }

  window.addEventListener(
    "backend-state-updated",
    event => {
      rememberCanonicalUnlock(
        event.detail
      );
    }
  );

  window.addEventListener(
    "product-routines-state-updated",
    event => {
      rememberProductUnlocks(
        event.detail
      );
    }
  );

  if (
    typeof document !== "undefined" &&
    document.readyState !== "loading"
  ) {
    markActiveSyncReady();
  } else {
    window.addEventListener(
      "DOMContentLoaded",
      markActiveSyncReady
    );
  }

  if (typeof document !== "undefined") {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "visible") {
          requestPassiveActiveSync(
            "visibilitychange"
          );
        }
      }
    );
  }

  window.addEventListener(
    "pageshow",
    () => {
      requestPassiveActiveSync(
        "pageshow"
      );
    }
  );

  window.addEventListener(
    "focus",
    () => {
      requestPassiveActiveSync(
        "focus"
      );
    }
  );

  window.addEventListener(
    "online",
    () => {
      if (!isDocumentVisible()) return;

      refreshActiveState(
        "online",
        { force: true }
      ).catch(error => {
        console.warn(
          "No se pudo reconciliar el estado después de recuperar conexión.",
          error
        );
      });
    }
  );


  window.BackendAPI = {
    bootstrapFromLocal,
    getState,
    openDay,
    completeDay,
    bootstrapProductRoutinesV98,
    getProductRoutineStatesV136,
    openProductRoutineDay,
    completeProductRoutineDay,
    updateProfile,
    demoAdvance,
    health,
    refreshActiveState,
    ensureUserId,
    getProfile
  };


  window.addEventListener(
    "routine-profile-updated",
    event => {
      const profile =
        event.detail ||
        getProfile();

      if (!profile) return;

      updateProfile(profile)
        .catch(error => {
          console.warn(
            "No se pudo sincronizar el perfil con el backend.",
            error
          );
        });
    }
  );

  window.addEventListener(
    "DOMContentLoaded",
    () => {
      if (!getProfile()) return;

      bootstrapFromLocal()
        .catch(error => {
          console.warn(
            "Backend no disponible. La PWA continúa en modo local.",
            error
          );

          emit(
            "backend-status",
            {
              connected: false,
              error: error.message
            }
          );
        });
    }
  );
})();
