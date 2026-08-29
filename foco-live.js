(() => {
  const YOUTUBE_URL = "https://www.youtube.com/@TuvidaenFoco";
  const MODAL_ID = "focoLiveModal";
  let previousFocus = null;
  let appWasInert = false;

  function focusableElements(modal) {
    return [...modal.querySelectorAll(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )].filter(element => !element.hidden);
  }

  function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("foco-live-open");
    const app = document.getElementById("app");
    if (app) app.inert = appWasInert;
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }

  function showModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    previousFocus = document.activeElement;
    const app = document.getElementById("app");
    appWasInert = Boolean(app?.inert);
    if (app) app.inert = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("foco-live-open");
    window.requestAnimationFrame(() => {
      modal.querySelector(".foco-live-close")?.focus();
    });
  }

  function removeEventQuery() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("focoEvent")) return;
      url.searchParams.delete("focoEvent");
      window.history.replaceState(
        {},
        document.title,
        url.pathname + url.search + url.hash
      );
    } catch (_) {}
  }

  function buildModal() {
    if (document.getElementById(MODAL_ID)) return;

    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "foco-live-modal";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <button class="foco-live-backdrop" type="button" aria-label="Cerrar aviso de Foco"></button>
      <section class="foco-live-dialog" role="dialog" aria-modal="true" aria-label="Foco en vivo">
        <button class="foco-live-close" type="button" aria-label="Cerrar aviso">×</button>
        <div class="foco-live-image-card">
          <img src="assets/custom/foco-live-card.png" alt="Foco en vivo" />
        </div>
        <a class="foco-live-join" href="${YOUTUBE_URL}" target="_blank" rel="noopener noreferrer">Ver en vivo</a>
      </section>
    `;

    document.body.appendChild(modal);
    modal.querySelector(".foco-live-backdrop")?.addEventListener("click", closeModal);
    modal.querySelector(".foco-live-close")?.addEventListener("click", closeModal);
    modal.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(modal);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function handlePushMessage(event) {
    if (event.data?.type !== "NU_FOCO_EVENT") return;
    if (event.data.payload?.focoKind !== "live") return;
    showModal();
  }

  function init() {
    buildModal();
    navigator.serviceWorker?.addEventListener("message", handlePushMessage);

    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("focoEvent") === "live") {
        showModal();
        removeEventQuery();
      }
    } catch (_) {}

  }

  window.FocoLive = {
    show: showModal,
    close: closeModal
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();