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


/* ===== Collagen+ iPhone media compatibility ===== */
(function () {
  if (window.__collagenIosMediaCompatibility) return;
  window.__collagenIosMediaCompatibility = true;

  function normalizeSrc(value) {
    return String(value || "").split("#")[0].split("?")[0];
  }

  function isCollagenMedia(src) {
    return /assets\/collagen\//i.test(String(src || ""));
  }

  function posterForVideoSrc(src) {
    const normalized = normalizeSrc(src);
    return normalized.replace(/\.(mp4|mov|m4v|webm)$/i, ".poster.jpg");
  }

  function getVideoSource(video) {
    return (
      video.currentSrc ||
      video.getAttribute("src") ||
      video.querySelector("source")?.getAttribute("src") ||
      ""
    );
  }

  function isFavoritesContext(element) {
    let node = element;
    while (node && node !== document.documentElement) {
      const id = String(node.id || "").toLowerCase();
      const cls = String(node.className || "").toLowerCase();

      if (
        id.includes("favorite") ||
        id.includes("favorito") ||
        cls.includes("favorite") ||
        cls.includes("favorito")
      ) {
        return true;
      }

      node = node.parentElement;
    }
    return false;
  }

  function styleFavoritesMedia(element) {
    if (!isFavoritesContext(element)) return;

    Object.assign(element.style, {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    });

    const parent = element.parentElement;
    if (parent) {
      parent.style.overflow = "hidden";
      parent.style.background = "#F3F4F6";
    }
  }

  function applyToNode(node) {
    if (!(node instanceof HTMLElement)) return;

    if (node.tagName === "VIDEO") {
      const src = getVideoSource(node);

      if (isCollagenMedia(src)) {
        if (!node.getAttribute("poster")) {
          node.setAttribute("poster", posterForVideoSrc(src));
        }

        node.setAttribute("playsinline", "");
        node.playsInline = true;

        if (!node.preload || node.preload === "auto") {
          node.preload = "metadata";
        }
      }

      styleFavoritesMedia(node);
    }

    if (node.tagName === "IMG") {
      styleFavoritesMedia(node);
    }
  }

  function sweep(root) {
    if (root instanceof HTMLElement && /^(VIDEO|IMG)$/i.test(root.tagName)) {
      applyToNode(root);
    }

    const scope =
      root && root.querySelectorAll
        ? root
        : document;

    scope.querySelectorAll("video, img").forEach(applyToNode);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => sweep(document), { once: true });
  } else {
    sweep(document);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          sweep(node);
        }
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
/* ===== /Collagen+ iPhone media compatibility ===== */


