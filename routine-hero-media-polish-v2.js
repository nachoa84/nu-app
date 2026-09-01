// Nu App · Routine hero theme sync v2
// Keeps the final shared banner theme aligned with the active routine.

(() => {
  "use strict";

  const FINAL_LAYOUT_VERSION = "20260901-layout-v6";
  const COMPLETION_STYLE_VERSION = "20260901-completion-v1";

  function syncLayoutVersion() {
    const link = document.getElementById("nu-routine-layout-final-v1");
    if (!link) return;

    const nextHref = `routine-layout-final-v1.css?v=${FINAL_LAYOUT_VERSION}`;
    const currentHref = String(link.getAttribute("href") || "");
    if (currentHref !== nextHref) link.setAttribute("href", nextHref);
  }

  function ensureCompletionStyles() {
    const id = "nu-routine-completion-final-v1";
    let link = document.getElementById(id);

    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }

    const nextHref = `routine-completion-final-v1.css?v=${COMPLETION_STYLE_VERSION}`;
    if (String(link.getAttribute("href") || "") !== nextHref) {
      link.setAttribute("href", nextHref);
    }
  }

  function cleanCompletedState() {
    document
      .querySelectorAll("#view-hoy .complete-card.done .complete-done-copy p")
      .forEach(node => node.remove());
  }

  function syncRoutineTheme() {
    const view = document.getElementById("view-hoy");
    if (!view) return;

    let routineId = "collagen-30";
    try {
      if (typeof getActiveRoutineId === "function") {
        routineId = getActiveRoutineId() || routineId;
      }
    } catch (_) {}

    view.dataset.routineId = routineId;
    syncLayoutVersion();
    ensureCompletionStyles();
    cleanCompletedState();
  }

  let queued = false;
  function queueSync() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncRoutineTheme();
    });
  }

  const root = document.getElementById("view-hoy") || document.body;
  const observer = new MutationObserver(queueSync);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  document.addEventListener("DOMContentLoaded", queueSync, { once: true });
  window.addEventListener("pageshow", queueSync);
  queueSync();
})();
