const chat = document.getElementById("chat");
const chatWrap = document.getElementById("chatWrap");
const progressText = document.getElementById("progressText");
const dailyNativeHeader = document.getElementById("dailyNativeHeader");
const dailyNativeDayLabel = document.getElementById("dailyNativeDayLabel");
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
