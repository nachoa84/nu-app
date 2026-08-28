(() => {
  const YOUTUBE_URL = "https://www.youtube.com/@TuvidaenFoco";
  const MODAL_ID = "focoLiveModal";

  function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("foco-live-open");
  }

  function showModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("foco-live-open");
  }

  function removeEventQuery() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("focoEvent")) return;
      url.searchParams.delete("focoEvent");
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
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
      <section class="foco-live-dialog" role="dialog" aria-modal="true" aria-labelledby="focoLiveTitle">
        <button class="foco-live-close" type="button" aria-label="Cerrar aviso">×</button>
        <span class="foco-live-eyebrow">Aviso de evento</span>
        <div class="foco-live-image-card">
          <img src="assets/custom/foco-logo.jpg" alt="Foco en vivo" />
        </div>
        <div class="foco-live-copy">
          <h2 id="focoLiveTitle">Foco en vivo</h2>
          <p>Todos los martes · 19:00 Argentina</p>
        </div>
        <a class="foco-live-join" href="${YOUTUBE_URL}" target="_blank" rel="noopener noreferrer">Ver en vivo</a>
        <button class="foco-live-dismiss" type="button">Ahora no</button>
      </section>
    `;

    document.body.appendChild(modal);
    modal.querySelector(".foco-live-backdrop")?.addEventListener("click", closeModal);
    modal.querySelector(".foco-live-close")?.addEventListener("click", closeModal);
    modal.querySelector(".foco-live-dismiss")?.addEventListener("click", closeModal);
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

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeModal();
    });
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
