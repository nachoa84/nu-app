/* Notifications redesign v2 · visual interaction only.
   Keeps existing push/time handlers intact and reshapes the current DOM. */
(() => {
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

    // Picker inside the same Horario card, as in the approved reference.
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupNotificationRedesignV2, { once: true });
  } else {
    setupNotificationRedesignV2();
  }
})();
