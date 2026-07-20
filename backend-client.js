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
            getCompletedDays()
        })
      }
    );

    publishState(payload.state);

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

  window.BackendAPI = {
    bootstrapFromLocal,
    getState,
    openDay,
    completeDay,
    updateProfile,
    demoAdvance,
    health,
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
