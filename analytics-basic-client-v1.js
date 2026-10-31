(() => {
  const PROFILE_KEY = "routineUserProfile";
  const GUIDE_PROGRESS_KEY = "nuappGuideProgressV1";
  const INSTALL_KEY = "nuappPwaInstalledV1";
  let syncTimer = null;

  function readJson(key, fallback = null) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function getProfile() {
    const profile = readJson(PROFILE_KEY, null);
    return profile && typeof profile === "object" ? profile : null;
  }

  function isStandalone() {
    return Boolean(
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone === true
    );
  }

  function markInstalled() {
    if (!localStorage.getItem(INSTALL_KEY)) {
      localStorage.setItem(INSTALL_KEY, new Date().toISOString());
    }
  }

  function guideSnapshot() {
    const progress = readJson(GUIDE_PROGRESS_KEY, {});
    const completed = progress && typeof progress === "object"
      ? Object.values(progress).filter(value => value === true).length
      : 0;

    let total = 9;
    try {
      if (typeof GUIDE_STEPS !== "undefined" && Array.isArray(GUIDE_STEPS)) {
        total = GUIDE_STEPS.length;
      }
    } catch (_) {}

    return {
      completed,
      total: Math.max(1, Number(total || 9))
    };
  }

  async function syncNow() {
    const profile = getProfile();
    if (!profile?.userId) return;

    if (isStandalone()) markInstalled();

    const guide = guideSnapshot();

    try {
      await fetch("/api/analytics/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: profile.userId,
          installed: Boolean(localStorage.getItem(INSTALL_KEY)),
          guideStarted: guide.completed > 0,
          guideCompletedSteps: guide.completed,
          guideTotalSteps: guide.total
        }),
        keepalive: true
      });
    } catch (_) {
      // Analytics nunca debe impedir que la app siga funcionando.
    }
  }

  function scheduleSync(delay = 80) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, delay);
  }

  window.addEventListener("appinstalled", () => {
    markInstalled();
    scheduleSync(0);
  });

  window.addEventListener("routine-profile-synced", () => {
    scheduleSync();
  });

  window.addEventListener("routine-profile-updated", () => {
    scheduleSync();
  });

  document.addEventListener("click", event => {
    const target = event.target?.closest?.("#guideCompleteBtn");
    if (target) scheduleSync(150);
  }, true);

  window.addEventListener("DOMContentLoaded", () => {
    if (isStandalone()) markInstalled();
    scheduleSync(250);
  });
})();
