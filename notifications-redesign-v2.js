/* Notifications redesign v2 · visual interaction only.
   Keeps existing push/time handlers intact and reshapes the current DOM. */
(() => {
  function setupIrisComposerV2() {
    const form = document.getElementById("botForm");
    const shortcuts = document.getElementById("botShortcutsBtn");
    const send = form?.querySelector(".bot-send");

    if (!form || !shortcuts || !send) return;
    if (shortcuts.classList.contains("bot-composer-shortcuts")) return;

    shortcuts.classList.add("bot-composer-shortcuts");
    shortcuts.setAttribute("aria-label", "Abrir accesos rápidos");
    form.insertBefore(shortcuts, send);
  }

  function normalizeDynamicLabels() {
    const guide = document.getElementById("view-guia");
    const detail = guide?.querySelector(".guide-detail");
    const kicker = document.getElementById("guideHeaderKicker");

    if (detail && kicker && /^Paso\s+\d+/i.test(kicker.textContent || "")) {
      kicker.textContent = "Guía de inicio";
    }

    guide?.querySelectorAll(".guide-complete-card.is-done .guide-complete-copy strong")
      .forEach(label => {
        if ((label.textContent || "").trim() !== "Hecho") {
          label.textContent = "Hecho";
        }
      });

    const toastNode = document.getElementById("toast");
    if (toastNode && (toastNode.textContent || "").trim() === "Etapa completada") {
      toastNode.textContent = "Hecho";
    }
  }

  function setupDynamicLabelObserver() {
    normalizeDynamicLabels();
    const observer = new MutationObserver(() => normalizeDynamicLabels());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function setupNotificationRedesignV2() {
    const modal = document.getElementById("notificationSettings");
    const list = modal?.querySelector(".notification-settings-list");
    const rows = list ? Array.from(list.querySelectorAll(".notification-settings-row")) : [];
    const reminderRow = rows[0];
    const timeRow = rows[1];
    const editor = document.getElementById("notificationTimeEditor");
    const legacyChange = document.getElementById("notificationChangeTimeBtn");
    const cancel = document.getElementById("notificationTimeCancelBtn");
    const save = document.getElementById("notificationTimeSaveBtn");

    if (!modal || !reminderRow || !timeRow || !editor) return;
    if (modal.dataset.redesignV2Ready === "true") return;
    modal.dataset.redesignV2Ready = "true";

    reminderRow.classList.add("notification-pref-card", "notification-reminder-card");
    timeRow.classList.add("notification-pref-card", "notification-time-card");
    timeRow.setAttribute("role", "button");
    timeRow.setAttribute("tabindex", "0");
    timeRow.setAttribute("aria-label", "Cambiar horario de notificaciones");
    timeRow.setAttribute("aria-expanded", "false");

    timeRow.appendChild(editor);
    legacyChange?.classList.add("notification-change-time-legacy");

    const syncOpenState = () => {
      const isOpen = !editor.hasAttribute("hidden");
      timeRow.classList.toggle("is-time-open", isOpen);
      timeRow.setAttribute("aria-expanded", isOpen ? "true" : "false");
    };

    const openOrTogglePicker = () => {
      if (editor.hasAttribute("hidden")) {
        legacyChange?.click();
      } else {
        editor.setAttribute("hidden", "");
      }
      requestAnimationFrame(syncOpenState);
    };

    timeRow.addEventListener("click", event => {
      if (event.target.closest("#notificationTimeEditor")) return;
      openOrTogglePicker();
    });

    timeRow.addEventListener("keydown", event => {
      if (event.target.closest("#notificationTimeEditor")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openOrTogglePicker();
    });

    cancel?.addEventListener("click", () => requestAnimationFrame(syncOpenState));
    save?.addEventListener("click", () => window.setTimeout(syncOpenState, 0));

    const observer = new MutationObserver(syncOpenState);
    observer.observe(editor, { attributes: true, attributeFilter: ["hidden"] });
    syncOpenState();
  }

  const setupAll = () => {
    setupIrisComposerV2();
    setupDynamicLabelObserver();
    setupNotificationRedesignV2();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupAll, { once: true });
  } else {
    setupAll();
  }
})();
