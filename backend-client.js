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


  // NU APP · SINCRONIZACIÓN ACTIVA DE ESTADO V172
  // PostgreSQL sigue siendo la única autoridad para avanzar días.
  // Un único coordinador reconcilia Collagen y rutinas de producto sin polling.
  function hasLocalProductRoutineStateV172() {
    return PRODUCT_ROUTINE_IDS_V98.some(
      routineId =>
        Boolean(
          localStorage.getItem(
            `routineState:${routineId}`
          )
        )
    );
  }

  function currentUserIdV172() {
    return getProfile()?.userId || null;
  }

  function isDocumentVisibleV172() {
    return (
      typeof document === "undefined" ||
      document.visibilityState !== "hidden"
    );
  }

  function retryAfterMsV172(response) {
    const value = response.headers?.get?.("Retry-After");
    if (!value) return 0;

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    const at = Date.parse(value);
    return Number.isFinite(at)
      ? Math.max(0, at - Date.now())
      : 0;
  }

  async function requestActiveStateV172(
    path,
    { signal } = {}
  ) {
    const response = await fetch(path, {
      method: "GET",
      cache: "no-store",
      signal,
      headers: {
        "Content-Type": "application/json"
      }
    });

    const payload = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        payload.error ||
        `Error HTTP ${response.status}`
      );
      error.status = response.status;
      error.retryAfterMs =
        retryAfterMsV172(response);
      throw error;
    }

    return payload.state;
  }

  async function fetchCanonicalStateV172(
    userId,
    options
  ) {
    return requestActiveStateV172(
      `/api/state/${encodeURIComponent(userId)}`,
      options
    );
  }

  async function fetchProductStatesV172(
    userId,
    options
  ) {
    if (!hasLocalProductRoutineStateV172()) {
      return {
        userId,
        routines: {}
      };
    }

    const state = await requestActiveStateV172(
      `/api/product-routines/state/${encodeURIComponent(userId)}`,
      options
    );

    return state && !state.userId
      ? { ...state, userId }
      : state;
  }

  const activeSyncFactoryV172 =
    window.NuRoutineActiveSyncV172
      ?.createRoutineActiveSyncV172;

  const activeSyncControllerV172 =
    typeof activeSyncFactoryV172 === "function"
      ? activeSyncFactoryV172({
          getIdentity:
            currentUserIdV172,
          isVisible:
            isDocumentVisibleV172,
          isOnline: () =>
            typeof navigator === "undefined" ||
            navigator.onLine !== false,
          fetchCanonical:
            fetchCanonicalStateV172,
          fetchProducts:
            fetchProductStatesV172,
          publishCanonical: state => {
            publishState(state);
            return state;
          },
          publishProducts: state => {
            if (hasLocalProductRoutineStateV172()) {
              publishProductRoutineStatesV98(state);
            }
            return state;
          },
          onStatus: status => {
            emit(
              "backend-status",
              status
            );
          },
          warn: error => {
            console.warn(
              "No se pudo reconciliar el estado activo de la rutina.",
              error
            );
          }
        })
      : null;

  if (!activeSyncControllerV172) {
    console.warn(
      "El coordinador de sincronización V172 no está disponible."
    );
  }

  function refreshActiveState(
    reason = "active",
    { force = false } = {}
  ) {
    if (!activeSyncControllerV172) {
      return Promise.resolve(null);
    }

    return activeSyncControllerV172.request(
      reason,
      { force }
    );
  }

  function startActiveSyncV172() {
    // bootstrapFromLocal ya obtiene el estado inicial. Evitamos GET duplicados.
    activeSyncControllerV172?.start({
      initial: false,
      deferInitialPassive: false
    });
  }

  window.addEventListener(
    "backend-state-updated",
    event => {
      activeSyncControllerV172
        ?.rememberCanonical(event.detail);
    }
  );

  window.addEventListener(
    "product-routines-state-updated",
    event => {
      activeSyncControllerV172
        ?.rememberProducts(event.detail);
    }
  );

  if (
    typeof document !== "undefined" &&
    document.readyState !== "loading"
  ) {
    startActiveSyncV172();
  } else {
    window.addEventListener(
      "DOMContentLoaded",
      startActiveSyncV172
    );
  }

  if (typeof document !== "undefined") {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "visible") {
          activeSyncControllerV172
            ?.onResume("visibilitychange");
        } else {
          activeSyncControllerV172
            ?.suspend();
        }
      }
    );
  }

  window.addEventListener(
    "pageshow",
    () => {
      activeSyncControllerV172
        ?.onResume("pageshow");
    }
  );

  window.addEventListener(
    "focus",
    () => {
      activeSyncControllerV172
        ?.onResume("focus");
    }
  );

  window.addEventListener(
    "online",
    () => {
      activeSyncControllerV172
        ?.onResume("online");
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
