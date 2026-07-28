// Rutina 30 Días · UI core
// Iconos, avisos, navegación y utilidades visuales compartidas.
// Extraído de app.js sin cambiar la lógica de estado o desbloqueo.

const ICONS = {
  home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`,
  homeFilled: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="icon-fill" d="M2.6 10.9 12 3.2l9.4 7.7a1.4 1.4 0 0 1 .5 1.1v7.3a2 2 0 0 1-2 2h-5.6v-6.2H9.7v6.2H4.1a2 2 0 0 1-2-2V12a1.4 1.4 0 0 1 .5-1.1Z"/><path class="icon-cut" d="M9.7 21.3v-6.2h4.6v6.2"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>`,
  calendarFilled: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="icon-fill" x="2.7" y="4.8" width="18.6" height="16.5" rx="3"/><path class="icon-cut" d="M7.7 3v4M16.3 3v4M3.7 9.5h16.6M7.5 13h.01M12 13h.01M16.5 13h.01M7.5 17h.01M12 17h.01"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0L12 5.9l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.5l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>`,
  heartFilled: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="icon-fill" d="M12 21.6 3.9 14A6.2 6.2 0 0 1 12 4.7 6.2 6.2 0 0 1 20.1 14L12 21.6Z"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4z"/></svg>`,
  bookmarkFilled: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="icon-fill" d="M7.8 2h8.4A1.8 1.8 0 0 1 18 3.8v18.1l-6-4-6 4V3.8A1.8 1.8 0 0 1 7.8 2Z"/></svg>`,
  bot: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="3"/><path d="M9 11h.01M15 11h.01M9 15h6M12 2v4"/></svg>`,
  botFilled: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="icon-fill" x="3" y="5" width="18" height="14" rx="4"/><path class="icon-cut" d="M9 10.8h.01M15 10.8h.01M9 15h6M12 1.8V5"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>`,
  checkCircleFilled: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="icon-fill" cx="12" cy="12" r="10"/><path class="icon-cut" d="m7.5 12.2 3 3 6-6.4"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`,
  down: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`,
  back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  share: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.3 10.8 7.4-4.5M8.3 13.2l7.4 4.5"/></svg>`,
  send: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-8-8 18-2-8-8-2Z"/><path d="m11 13 5-5"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7m2 0-.8 12.2A2 2 0 0 1 14.2 21H9.8a2 2 0 0 1-2-1.8L7 7"/><path d="M10 11v6M14 11v6"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5V7Z"/></svg>`,
  image: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m5 18 5-5 3.5 3.5 2.5-2.5 3 4"/></svg>`
};

function ensureToastHost() {
  let host = document.getElementById("appToastHost");
  if (host) return host;

  host = document.createElement("div");
  host.id = "appToastHost";
  host.className = "toast-host";
  host.setAttribute("aria-live", "polite");
  host.setAttribute("aria-atomic", "false");
  document.body.appendChild(host);
  return host;
}

let activeToastElement = null;
let activeToastTimer = null;

function dismissActiveToast({ immediate = false } = {}) {
  if (activeToastTimer) {
    clearTimeout(activeToastTimer);
    activeToastTimer = null;
  }

  const current = activeToastElement;
  activeToastElement = null;

  if (!current) return;

  if (immediate) {
    current.remove();
    return;
  }

  current.classList.add("is-leaving");
  setTimeout(() => current.remove(), 170);
}

function toast(text, {
  type = "info",
  actionLabel = "",
  onAction = null,
  duration = 2400
} = {}) {
  const host = ensureToastHost();

  // Siempre hay un solo aviso visible. El nuevo reemplaza al anterior.
  dismissActiveToast({ immediate: true });

  const el = document.createElement("div");
  el.className = `toast toast-${type}`;

  const symbol = type === "success" ? "✓" : type === "error" ? "!" : "i";
  el.innerHTML = `
    <span class="toast-status" aria-hidden="true">${symbol}</span>
    <span class="toast-text"></span>
  `;
  el.querySelector(".toast-text").textContent = text;

  const dismiss = () => {
    if (activeToastElement !== el) return;
    dismissActiveToast();
  };

  if (actionLabel && typeof onAction === "function") {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "toast-action";
    action.textContent = actionLabel;
    action.onclick = () => {
      if (activeToastElement !== el) return;
      dismissActiveToast({ immediate: true });
      onAction();
    };
    el.appendChild(action);
  }

  host.replaceChildren(el);
  activeToastElement = el;
  requestAnimationFrame(() => el.classList.add("is-visible"));
  activeToastTimer = setTimeout(dismiss, duration);
  return el;
}


function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function setupAnimatedDetails(details) {
  if (!details || details.dataset.nativeAnimated === "1") return;
  const summary = details.querySelector(":scope > summary");
  const body = details.querySelector(":scope > .native-details-body, :scope > .action-step-body");
  if (!summary || !body) return;

  details.dataset.nativeAnimated = "1";

  summary.addEventListener("click", event => {
    if (prefersReducedMotion() || !body.animate) return;
    event.preventDefault();
    if (details.dataset.animating === "1") return;

    details.dataset.animating = "1";
    body.style.overflow = "hidden";

    if (details.open) {
      const startHeight = Math.max(body.getBoundingClientRect().height, body.scrollHeight);
      const animation = body.animate(
        [
          { height: `${startHeight}px`, opacity: 1, transform: "translateY(0)" },
          { height: "0px", opacity: 0, transform: "translateY(-5px)" }
        ],
        { duration: 180, easing: "cubic-bezier(.4,0,.2,1)" }
      );
      animation.onfinish = () => {
        details.open = false;
        body.style.height = "";
        body.style.opacity = "";
        body.style.transform = "";
        body.style.overflow = "";
        delete details.dataset.animating;
      };
      animation.oncancel = animation.onfinish;
      return;
    }

    details.open = true;
    const endHeight = body.scrollHeight;
    const animation = body.animate(
      [
        { height: "0px", opacity: 0, transform: "translateY(-5px)" },
        { height: `${endHeight}px`, opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 220, easing: "cubic-bezier(.22,.8,.24,1)" }
    );
    animation.onfinish = () => {
      body.style.height = "";
      body.style.opacity = "";
      body.style.transform = "";
      body.style.overflow = "";
      delete details.dataset.animating;
    };
    animation.oncancel = animation.onfinish;
  });
}

function setupNativePressState(element, ignoreSelector = "button, a, input, textarea, select") {
  if (!element || element.dataset.nativePress === "1") return;
  element.dataset.nativePress = "1";

  const release = () => element.classList.remove("is-native-pressed");
  element.addEventListener("pointerdown", event => {
    if (event.target.closest(ignoreSelector)) return;
    element.classList.add("is-native-pressed");
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(type => {
    element.addEventListener(type, release);
  });
}

function setupNativeInteractionGuards() {
  const selector = ".resource-row, .favorite-content-row, .favorite-folder-card, .media-preview";

  document.addEventListener("contextmenu", event => {
    if (event.target.closest(selector)) event.preventDefault();
  });

  document.addEventListener("selectstart", event => {
    if (event.target.closest(selector)) event.preventDefault();
  });

  document.addEventListener("dragstart", event => {
    if (event.target.closest(selector)) event.preventDefault();
  });
}

function setButtonBusy(button, busy, label = "Preparando") {
  if (!button) return;

  if (busy) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add("is-busy");
    button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${label}</span>`;
    return;
  }

  button.disabled = false;
  button.classList.remove("is-busy");
  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

async function shareAsset(src, label, mediaType, triggerButton = null) {
  setButtonBusy(triggerButton, true, "Preparando");

  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();
    const ext = mediaType === "video" ? "mp4" : "jpg";

    const sourceName = decodeURIComponent(
      String(src)
        .split("/")
        .pop()
        .split("?")[0]
    );

    const fileName =
      sourceName && sourceName.includes(".")
        ? sourceName
        : `rutina30-material.${ext}`;

    const file = new File(
      [blob],
      fileName,
      { type: blob.type || (mediaType === "video" ? "video/mp4" : "image/jpeg") }
    );

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        // Compartimos únicamente el archivo. No enviamos title ni text,
        // para que "Historia X de X" no aparezca como leyenda.
        await navigator.share({ files: [file] });
        toast("Compartir completado", { type: "success" });
        return;
      } catch (error) {
        // Cancelar el menú de compartir no debe descargar ni abrir el archivo.
        if (error?.name === "AbortError") return;
        console.warn("El menú nativo de compartir falló. Se usa alternativa.", error);
      }
    }
  } catch (error) {
    console.warn("No se pudo preparar el archivo para compartir:", error);
  } finally {
    setButtonBusy(triggerButton, false);
  }

  try {
    const a = document.createElement("a");
    a.href = src;
    a.download = "";
    a.target = "_blank";
    a.rel = "noopener";
    a.click();

    toast("Se abrió el archivo para compartir o guardar", { type: "info", duration: 3200 });
  } catch (error) {
    toast("No se pudo abrir el archivo", { type: "error" });
  }
}

const MAIN_VIEW_ORDER = ["hoy", "favoritos", "bot"];
const mainViewScrollPositions = new Map();
let activeNativePressElement = null;

function currentMainViewName() {
  const active = document.querySelector(".view.active");
  return active?.id?.replace(/^view-/, "") || document.body.dataset.activeView || "hoy";
}

function nativeViewDirection(fromView, toView) {
  const fromNav = fromView === "rutina" ? "hoy" : fromView;
  const toNav = toView === "rutina" ? "hoy" : toView;
  const fromIndex = MAIN_VIEW_ORDER.indexOf(fromNav);
  const toIndex = MAIN_VIEW_ORDER.indexOf(toNav);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return 0;
  return toIndex > fromIndex ? 1 : -1;
}

function animateNativeViewEnter(target, direction = 0) {
  if (!target || prefersReducedMotion() || !target.animate) return;

  const distance = direction === 0 ? 0 : 16 * direction;
  target.getAnimations?.().forEach(animation => {
    if (animation.id === "native-view-enter") animation.cancel();
  });

  const animation = target.animate(
    [
      { opacity: .72, transform: `translate3d(${distance}px, 3px, 0)` },
      { opacity: 1, transform: "translate3d(0, 0, 0)" }
    ],
    {
      duration: 210,
      easing: "cubic-bezier(.22,.8,.24,1)",
      fill: "both"
    }
  );
  animation.id = "native-view-enter";
  document.body.classList.add("native-view-switching");
  const cleanup = () => {
    document.body.classList.remove("native-view-switching");
    target.style.opacity = "";
    target.style.transform = "";
  };
  animation.onfinish = cleanup;
  animation.oncancel = cleanup;
}

function animateNativeNavSelection(button) {
  if (!button || prefersReducedMotion()) return;
  button.classList.remove("nav-just-activated");
  void button.offsetWidth;
  button.classList.add("nav-just-activated");
  window.setTimeout(() => button.classList.remove("nav-just-activated"), 280);
}

function releaseNativePressFeedback() {
  if (!activeNativePressElement) return;
  activeNativePressElement.classList.remove("native-press-active");
  activeNativePressElement = null;
}

function setupGlobalNativePressFeedback() {
  const selector = [
    "button:not(:disabled)",
    ".resource-row",
    ".favorite-day-tile",
    ".favorite-content-row",
    ".favorite-folder-card",
    ".bot-resource-card",
    ".native-day-progress-button",
    ".training-card-open"
  ].join(",");

  document.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target.closest?.(selector);
    if (!target) return;
    releaseNativePressFeedback();
    activeNativePressElement = target;
    target.classList.add("native-press-active");
  }, { passive: true });

  ["pointerup", "pointercancel"].forEach(type => {
    document.addEventListener(type, releaseNativePressFeedback, { passive: true });
  });
  window.addEventListener("blur", releaseNativePressFeedback);
  window.addEventListener("scroll", releaseNativePressFeedback, { passive: true });
}

function activateMainView(view, { vibrate = false } = {}) {
  const target = document.getElementById(`view-${view}`);
  if (!target) return;

  const previousView = currentMainViewName();
  const previousTarget = document.getElementById(`view-${previousView}`);
  const changingView = previousView !== view;
  const direction = nativeViewDirection(previousView, view);
  const navView = view === "rutina" ? "hoy" : view;
  const activeNav = document.querySelector(`.nav-btn[data-view="${navView}"]`);
  const navWasActive = activeNav?.classList.contains("active") === true;

  if (changingView && previousTarget) {
    mainViewScrollPositions.set(previousView, window.scrollY || 0);
  }

  if (vibrate && activeNav && !navWasActive && navigator.vibrate) {
    navigator.vibrate(8);
  }

  closeMediaPreview();
  document.body.dataset.activeView = view;

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === navView);
  });
  updateNavigationVisuals();
  if (!navWasActive && activeNav) animateNativeNavSelection(activeNav);

  document.querySelectorAll(".view").forEach(section => {
    section.classList.toggle("active", section === target);
  });

  const restoreTop = mainViewScrollPositions.get(view) || 0;
  window.scrollTo({ top: restoreTop, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = restoreTop;
  document.body.scrollTop = restoreTop;

  if (changingView) animateNativeViewEnter(target, direction);

  if (view === "rutina") renderDays();
  if (view === "favoritos") renderFavorites();

  if (view === "bot") {
    const thread = document.getElementById("botThread");
    if (thread) thread.scrollTop = thread.scrollHeight;
  }
}

const NAV_LABELS = {
  hoy: "Inicio",
  rutina: "Rutina",
  favoritos: "Favoritos",
  bot: "Bot"
};

const NAV_ICONS = {
  hoy: [ICONS.home, ICONS.homeFilled],
  rutina: [ICONS.calendar, ICONS.calendarFilled],
  favoritos: [ICONS.bookmark, ICONS.bookmarkFilled],
  bot: [ICONS.bot, ICONS.botFilled]
};

function updateNavigationVisuals() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    const view = btn.dataset.view;
    const active = btn.classList.contains("active");
    const pair = NAV_ICONS[view] || ["", ""];
    btn.innerHTML = `
      <span class="nav-icon">${pair[active ? 1 : 0]}</span>
      <span>${NAV_LABELS[view] || ""}</span>
    `;
  });
}

function setupMainNavigation() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => {
      if (
        btn.dataset.view === "hoy" &&
        document.getElementById("view-hoy")?.classList.contains("day-open")
      ) {
        closeNativeDayView();
      }

      activateMainView(btn.dataset.view, { vibrate: true });
    };
  });

  const startDayButton = document.getElementById("startDayBtn");
  const restartButton = document.getElementById("restartBtn");
  const openRoutineButton = document.getElementById("openRoutineBtn");
  const routineBackButton = document.getElementById("routineBackBtn");
  const dayBackButton = document.getElementById("dailyNativeBackBtn");
  const dayProgressButton = document.getElementById("dailyNativeProgressBtn");

  if (startDayButton) startDayButton.onclick = startProgressive;
  if (restartButton) restartButton.onclick = startProgressive;
  if (openRoutineButton) openRoutineButton.onclick = () => activateMainView("rutina");
  if (routineBackButton) {
    routineBackButton.innerHTML = ICONS.back;
    routineBackButton.onclick = () => activateMainView("hoy");
  }
  if (dayBackButton) {
    dayBackButton.innerHTML = ICONS.back;
    dayBackButton.onclick = closeNativeDayView;
  }
  if (dayProgressButton) {
    dayProgressButton.innerHTML = ICONS.calendar;
    dayProgressButton.onclick = () => activateMainView("rutina");
  }
}

function setupScrollCollapse() {
  let ticking = false;

  const update = () => {
    ticking = false;
    document.body.classList.toggle("is-scrolled", window.scrollY > 24);
  };

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );
}

function closeActionSheet() {
  const sheet = document.getElementById("appActionSheet");
  if (sheet) sheet.remove();
}

function showActionSheet({
  title,
  message = "",
  actionLabel = "Confirmar",
  onConfirm
}) {
  closeActionSheet();

  const sheet = document.createElement("div");
  sheet.id = "appActionSheet";
  sheet.className = "app-action-sheet";
  sheet.innerHTML = `
    <div class="app-action-sheet-inner" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="app-action-sheet-panel">
        <div class="app-action-sheet-copy">
          <strong>${title}</strong>
          ${message ? `<span>${message}</span>` : ""}
        </div>
        <button type="button" class="app-action-sheet-action">${actionLabel}</button>
      </div>
      <button type="button" class="app-action-sheet-cancel">Cancelar</button>
    </div>
  `;

  const action = sheet.querySelector(".app-action-sheet-action");
  const cancel = sheet.querySelector(".app-action-sheet-cancel");

  action.onclick = () => {
    closeActionSheet();
    if (navigator.vibrate) navigator.vibrate(12);
    onConfirm?.();
  };

  cancel.onclick = closeActionSheet;

  sheet.addEventListener("click", event => {
    if (event.target === sheet) closeActionSheet();
  });

  document.body.appendChild(sheet);
}

function ensureNetworkBanner() {
  let banner = document.getElementById("networkBanner");
  if (banner) return banner;

  banner = document.createElement("div");
  banner.id = "networkBanner";
  banner.className = "network-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = `<span class="network-banner-dot" aria-hidden="true"></span><span>Sin conexión · El contenido ya cargado sigue disponible.</span>`;
  document.body.appendChild(banner);
  return banner;
}

let networkWasOffline = !navigator.onLine;

function updateNetworkStatus({ announce = false } = {}) {
  const offline = !navigator.onLine;
  const banner = ensureNetworkBanner();
  document.body.classList.toggle("is-offline", offline);
  banner.classList.toggle("is-visible", offline);

  const status = document.querySelector(".bot-status");
  if (status) {
    status.innerHTML = `<i aria-hidden="true"></i>${offline ? "Sin conexión" : "En línea"}`;
  }

  if (announce) {
    if (offline) {
      toast("Estás sin conexión", { type: "info", duration: 3000 });
    } else if (networkWasOffline) {
      toast("Volviste a estar en línea", { type: "success" });
    }
  }

  networkWasOffline = offline;
}

window.addEventListener("offline", () => updateNetworkStatus({ announce: true }));
window.addEventListener("online", () => updateNetworkStatus({ announce: true }));

// Notification settings and push helpers live in notifications.js.

function setupInterfaceChrome() {
  setupHomeView();
  setupMainNavigation();
  updateNavigationVisuals();
  updateNetworkStatus();

  const search = document.getElementById("favoritesSearchBtn");
  if (search) {
    search.innerHTML = ICONS.search;
    search.onclick = openFavoritesSearch;
  }

  const botSend = document.querySelector(".bot-send");
  if (botSend) botSend.innerHTML = ICONS.send;

  const botClear = document.getElementById("botClearBtn");
  if (botClear) {
    botClear.innerHTML = ICONS.trash;
    botClear.onclick = () => {
      showActionSheet({
        title: "¿Limpiar conversación?",
        message: "Se eliminarán los mensajes de esta conversación en este dispositivo.",
        actionLabel: "Limpiar conversación",
        onConfirm: () => {
          resetBotConversation();
          toast("Conversación limpiada", { type: "success" });
        }
      });
    };
  }

  const activeNav = document.querySelector(".nav-btn.active");
  if (activeNav) {
    document.body.dataset.activeView = activeNav.dataset.view || "hoy";
  }

  updateNavigationVisuals();
}

function setupZoomGuards() {
  const preventGesture = event => {
    event.preventDefault();
  };

  // Safari/iOS expone estos eventos para los gestos de pellizco.
  ["gesturestart", "gesturechange", "gestureend"].forEach(type => {
    document.addEventListener(type, preventGesture, { passive: false });
  });

  // Respaldo para navegadores móviles que representan el pellizco
  // como un movimiento con dos o más contactos.
  document.addEventListener(
    "touchmove",
    event => {
      if (event.touches && event.touches.length > 1) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
}

window.addEventListener("DOMContentLoaded", setupGlobalNativePressFeedback, { once: true });
