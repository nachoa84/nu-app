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

  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      // V110: la sesión viaja en una cookie HttpOnly emitida por el backend.
      credentials: "same-origin",
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

      const error = new Error(message);
      error.status = response.status;

      if (response.status === 401) {
        authState = {
          authenticated: false,
          userId: null,
          email: null
        };

        emit("auth-required", {
          reason: "unauthenticated"
        });
      }

      throw error;
    }

    return payload;
  }

  // NU APP · ACCESO POR CORREO Y CÓDIGO TEMPORAL V110
  // El navegador ya no elige su userId: lo entrega la sesión validada.
  let authState = {
    authenticated: false,
    userId: null,
    email: null
  };

  function getAuthState() {
    return { ...authState };
  }

  function setAuthState(next) {
    authState = {
      authenticated: Boolean(next?.authenticated),
      userId: next?.userId || null,
      email: next?.email || null
    };

    emit("auth-state-changed", getAuthState());

    return getAuthState();
  }

  function getLegacyUserId() {
    return getProfile()?.userId || null;
  }

  async function fetchSession() {
    const payload = await request("/api/auth/session");

    return setAuthState(payload);
  }

  async function requestLoginCode(email) {
    return request("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  }

  async function verifyLoginCode(email, code) {
    const payload = await request("/api/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({ email, code })
    });

    setAuthState({
      authenticated: true,
      userId: payload.userId,
      email: payload.email
    });

    return payload;
  }

  async function logout() {
    const payload = await request("/api/auth/logout", {
      method: "POST"
    });

    setAuthState({ authenticated: false });

    return payload;
  }

  // Transición V110: reclamar una sola vez la cuenta local anterior.
  async function linkLegacyAccount(
    legacyUserId = getLegacyUserId()
  ) {
    if (!legacyUserId) {
      throw new Error("No hay una cuenta anterior en este dispositivo.");
    }

    const payload = await request("/api/auth/link-legacy-account", {
      method: "POST",
      body: JSON.stringify({ legacyUserId })
    });

    setAuthState({
      authenticated: true,
      userId: payload.userId,
      email: authState.email
    });

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
    const profile = getProfile();

    if (!profile) {
      return null;
    }

    if (!authState.authenticated) {
      await fetchSession();
    }

    if (!authState.authenticated) {
      emit("auth-required", { reason: "bootstrap" });
      return null;
    }

    const payload = await request(
      "/api/bootstrap",
      {
        method: "POST",
        body: JSON.stringify({
          profile,
          localState:
            getLocalRoutineState(),
          completedDays:
            getCompletedDays()
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
    const payload = await request(
      "/api/state"
    );

    publishState(payload.state);

    return payload.state;
  }

  async function openDay(day) {
    const payload = await request(
      "/api/routine/open",
      {
        method: "POST",
        body: JSON.stringify({
          day
        })
      }
    );

    publishState(payload.state);

    return payload.state;
  }

  async function completeDay(day) {
    const payload = await request(
      "/api/routine/complete",
      {
        method: "POST",
        body: JSON.stringify({
          day
        })
      }
    );

    publishState(payload.state);

    return payload.state;
  }

  async function updateProfile(profile) {
    if (!profile) {
      return null;
    }

    const payload = await request(
      "/api/profile",
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

    return payload.state;
  }

  async function demoAdvance() {
    const payload = await request(
      "/api/routine/demo-advance",
      {
        method: "POST",
        body: JSON.stringify({})
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
      for (let day = 1; day <= 10; day++) {
        if (localStorage.getItem(`day:${routineId}:${day}:complete`) === "1") completedDays.push(day);
      }
      routines[routineId] = {
        currentDay: Math.max(1, Math.min(10, Number(local.currentDay || 1))),
        openedDays: local.openedDays || {},
        completedDays
      };
    });
    return routines;
  }

  function publishProductRoutineStatesV98(state) {
    if (state) emit("product-routines-state-updated", state);
  }

  async function bootstrapProductRoutinesV98() {
    const payload = await request("/api/product-routines/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        routines: getLocalProductRoutinesV98()
      })
    });
    publishProductRoutineStatesV98(payload.state);
    return payload.state;
  }

  async function openProductRoutineDay(routineId, day) {
    const payload = await request("/api/product-routines/open", {
      method: "POST",
      body: JSON.stringify({ routineId, day })
    });
    publishProductRoutineStatesV98(payload.state);
    return payload.state;
  }

  async function completeProductRoutineDay(routineId, day) {
    const payload = await request("/api/product-routines/complete", {
      method: "POST",
      body: JSON.stringify({ routineId, day })
    });
    publishProductRoutineStatesV98(payload.state);
    return payload.state;
  }

  window.BackendAPI = {
    bootstrapFromLocal,
    getState,
    openDay,
    completeDay,
    bootstrapProductRoutinesV98,
    openProductRoutineDay,
    completeProductRoutineDay,
    updateProfile,
    demoAdvance,
    health,
    ensureUserId,
    getProfile,
    getAuthState,
    fetchSession,
    requestLoginCode,
    verifyLoginCode,
    logout,
    linkLegacyAccount,
    getLegacyUserId
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
      fetchSession()
        .then(state => {
          if (!state.authenticated) {
            emit("auth-required", { reason: "startup" });
            return null;
          }

          if (!getProfile()) return null;

          return bootstrapFromLocal();
        })
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
