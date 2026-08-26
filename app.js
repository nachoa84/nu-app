const chat = document.getElementById("chat");
const chatWrap = document.getElementById("chatWrap");
const progressText = document.getElementById("progressText");
const dailyNativeHeader = document.getElementById("dailyNativeHeader");
const dailyNativeDayLabel = document.getElementById("dailyNativeDayLabel");
const dailyNativeRoutineTitle = document.getElementById("dailyNativeRoutineTitle");
const chatTitle = document.querySelector(".chat-header strong");

const params = new URLSearchParams(window.location.search);
const isPreviewMode = params.get("preview") === "1";
const isDemoMode = params.get("demo") === "1";

const initialRoutineState = getRoutineState();
let selectedDay = isPreviewMode
  ? Number(localStorage.getItem("selectedDay") || initialRoutineState.currentDay || "1")
  : Number(initialRoutineState.currentDay || "1");
if (!days[selectedDay]) selectedDay = 1;

let revealIndex = 0;

// Shared icons and UI helpers live in ui-core.js.


// Backend sync, day-open coordination and demo controls live in routine-sync.js.

if (!isPreviewMode) {
  // El estado local solo refleja el último estado confirmado.
  // PostgreSQL/backend es la única autoridad para desbloquear días.
  const routineState = getRoutineState();

  selectedDay = routineState.currentDay;

  localStorage.setItem(
    "selectedDay",
    String(selectedDay)
  );
}


// Shared UI, navigation and visual helpers live in ui-core.js.

let deferredPrompt;

const installBtn =
  document.getElementById("installBtn");

window.addEventListener(
  "beforeinstallprompt",
  e => {
    e.preventDefault();

    deferredPrompt = e;
    window.__nuDeferredInstallPrompt = e;
    window.dispatchEvent(new Event("nu-install-ready"));

    installBtn?.classList.remove("hidden");
  }
);

if (installBtn) installBtn.onclick = async () => {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();

  await deferredPrompt.userChoice;

  deferredPrompt = null;

  installBtn?.classList.add("hidden");
};

// NU APP · ACTUALIZACIÓN AUTOMÁTICA CONTROLADA V128
const APP_VERSION_V128 = "128-controlled-auto-update";
localStorage.setItem("nuapp:active-version", APP_VERSION_V128);
const APP_UPDATE_RELOAD_KEY_V128 = "nuapp:update-reload-v128";
const APP_UPDATED_NOTICE_KEY_V128 = "nuapp:updated-notice-v128";

function botDraftIsActiveV128() {
  const input = document.getElementById("botInput");
  return Boolean(input && String(input.value || "").trim());
}

function reloadForAppUpdateV128() {
  if (sessionStorage.getItem(APP_UPDATE_RELOAD_KEY_V128) === "1") return;
  sessionStorage.setItem(APP_UPDATE_RELOAD_KEY_V128, "1");
  sessionStorage.setItem(APP_UPDATED_NOTICE_KEY_V128, "1");
  window.location.reload();
}

function activateWaitingWorkerV128(registration) {
  if (!registration?.waiting) return false;
  registration.waiting.postMessage({ type: "NUAPP_SKIP_WAITING_V128" });
  return true;
}

async function registerAppServiceWorker() {
  const registration = await navigator.serviceWorker.register(
    "./service-worker.js",
    { updateViaCache: "none" }
  );

  let updating = false;

  const handleReadyUpdate = () => {
    if (!registration.waiting || updating) return;
    updating = true;

    if (botDraftIsActiveV128() && typeof toast === "function") {
      toast("Hay una actualización lista.", {
        type: "info",
        actionLabel: "Actualizar",
        duration: 10000,
        onAction: () => activateWaitingWorkerV128(registration)
      });
      updating = false;
      return;
    }

    activateWaitingWorkerV128(registration);
  };

  if (registration.waiting && navigator.serviceWorker.controller) {
    handleReadyUpdate();
  }

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (
        worker.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        handleReadyUpdate();
      }
    });
  });

  let checking = false;
  const checkForUpdate = async () => {
    if (checking) return;
    checking = true;
    try {
      await registration.update();
      handleReadyUpdate();
    } catch (error) {
      console.warn("No se pudo comprobar la actualización:", error);
    } finally {
      checking = false;
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });

  window.addEventListener("pageshow", checkForUpdate);
  setTimeout(checkForUpdate, 1500);

  return registration;
}

navigator.serviceWorker?.addEventListener("controllerchange", () => {
  reloadForAppUpdateV128();
});

window.addEventListener("pageshow", () => {
  if (sessionStorage.getItem(APP_UPDATED_NOTICE_KEY_V128) !== "1") return;
  sessionStorage.removeItem(APP_UPDATED_NOTICE_KEY_V128);
  sessionStorage.removeItem(APP_UPDATE_RELOAD_KEY_V128);
  setTimeout(() => {
    if (typeof toast === "function") {
      toast("Nu App se actualizó", { type: "success", duration: 2600 });
    }
  }, 500);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    registerAppServiceWorker().catch(error => {
      console.warn(
        "No se pudo registrar el Service Worker:",
        error
      );
    });
  });
}


// Routine profile synchronization lives in routine-sync.js.


// Zoom guards live in ui-core.js.
setupZoomGuards();
setupNotificationSettings();
setupInterfaceChrome();
setupNativeInteractionGuards();
renderBotConversation();
setupScrollCollapse();
migrateOldDay1FavoritePaths();

if (!isPreviewMode) {
  selectedDay = getRoutineState().currentDay;
}

renderSelectedDayHeader();
renderStructuredDayDetail();
setupContinuousDayOpenTracking();
renderDays();
renderFavorites();
ensureDemoControls();

// NU APP · HERO GALVANIC SPA V4
// Mantiene la misma estructura de las otras rutinas y muestra el dispositivo completo.
if (typeof ROUTINE_CATALOG !== "undefined" && ROUTINE_CATALOG["galvanicspa-10"]) {
  ROUTINE_CATALOG["galvanicspa-10"].hero = "assets/custom/routine-galvanicspa-hero-v4.png";
}

if (!document.getElementById("galvanicSpaHeroV4Style")) {
  const galvanicHeroStyle = document.createElement("style");
  galvanicHeroStyle.id = "galvanicSpaHeroV4Style";
  galvanicHeroStyle.textContent = `
    .native-day-hero-media img[src*="routine-galvanicspa-hero-v4.png"] {
      width: 100%;
      height: 100%;
      padding: 0;
      object-fit: contain;
      object-position: center;
      background: transparent;
      transform: none;
      -webkit-mask-image: none;
      mask-image: none;
    }
  `;
  document.head.appendChild(galvanicHeroStyle);
}

setupMultiRoutineV92();
