// NU APP · ACCESO POR CORREO Y CÓDIGO TEMPORAL V110
// Capa mínima de acceso: no cambia el diseño de la app, sólo aparece
// cuando el backend informa que no hay sesión válida.
(() => {
  const OVERLAY_ID = "authOverlayV110";

  let overlay = null;
  let pendingEmail = "";

  function api() {
    return window.BackendAPI || null;
  }

  function setMessage(text, isError = false) {
    if (!overlay) return;

    const el = overlay.querySelector("[data-auth-message]");
    if (!el) return;

    el.textContent = text || "";
    el.dataset.authError = isError ? "1" : "0";
  }

  function showStep(step) {
    if (!overlay) return;

    overlay
      .querySelectorAll("[data-auth-step]")
      .forEach(node => {
        node.hidden = node.dataset.authStep !== step;
      });
  }

  function buildOverlay() {
    const node = document.createElement("div");
    node.id = OVERLAY_ID;
    node.className = "auth-overlay";
    node.hidden = true;
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
    node.setAttribute("aria-label", "Acceso a Nu App");

    node.innerHTML = `
      <div class="auth-card">
        <h2 class="auth-title">Ingresá con tu correo</h2>
        <p class="auth-subtitle">
          Te enviamos un código temporal para entrar. No necesitás contraseña.
        </p>

        <form data-auth-step="email" class="auth-form">
          <label class="auth-label" for="authEmailInput">Correo</label>
          <input
            id="authEmailInput"
            class="auth-input"
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            required
          />
          <button class="auth-button" type="submit">Enviarme el código</button>
        </form>

        <form data-auth-step="code" class="auth-form" hidden>
          <label class="auth-label" for="authCodeInput">Código recibido</label>
          <input
            id="authCodeInput"
            class="auth-input"
            type="text"
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]*"
            maxlength="6"
            required
          />
          <button class="auth-button" type="submit">Entrar</button>
          <button class="auth-link" type="button" data-auth-back>
            Usar otro correo
          </button>
        </form>

        <div data-auth-step="legacy" class="auth-form" hidden>
          <p class="auth-subtitle">
            Encontramos una cuenta anterior guardada en este dispositivo.
            Podés vincularla a tu correo una sola vez.
          </p>
          <button class="auth-button" type="button" data-auth-link-legacy>
            Vincular mi cuenta anterior
          </button>
          <button class="auth-link" type="button" data-auth-skip-legacy>
            Empezar de cero
          </button>
        </div>

        <p class="auth-message" data-auth-message></p>
      </div>
    `;

    node
      .querySelector('[data-auth-step="email"]')
      .addEventListener("submit", onSubmitEmail);

    node
      .querySelector('[data-auth-step="code"]')
      .addEventListener("submit", onSubmitCode);

    node
      .querySelector("[data-auth-back]")
      .addEventListener("click", () => {
        setMessage("");
        showStep("email");
      });

    node
      .querySelector("[data-auth-link-legacy]")
      .addEventListener("click", onLinkLegacy);

    node
      .querySelector("[data-auth-skip-legacy]")
      .addEventListener("click", () => close());

    document.body.appendChild(node);

    return node;
  }

  function ensureOverlay() {
    if (!overlay || !document.body.contains(overlay)) {
      overlay = buildOverlay();
    }

    return overlay;
  }

  function open(step = "email") {
    ensureOverlay();
    overlay.hidden = false;
    document.body.dataset.authGate = "1";
    showStep(step);
  }

  function close() {
    if (!overlay) return;

    overlay.hidden = true;
    delete document.body.dataset.authGate;
    setMessage("");
  }

  async function onSubmitEmail(event) {
    event.preventDefault();

    const input = overlay.querySelector("#authEmailInput");
    const email = String(input.value || "").trim();

    if (!email) return;

    setMessage("Enviando código…");

    try {
      await api().requestLoginCode(email);
      pendingEmail = email;
      setMessage("Revisá tu correo e ingresá el código.");
      showStep("code");
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function onSubmitCode(event) {
    event.preventDefault();

    const input = overlay.querySelector("#authCodeInput");
    const code = String(input.value || "").trim();

    if (!code) return;

    setMessage("Verificando…");

    try {
      await api().verifyLoginCode(pendingEmail, code);
      input.value = "";

      const legacyUserId = api().getLegacyUserId?.();

      if (legacyUserId) {
        setMessage("");
        showStep("legacy");
        return;
      }

      close();
      await reloadAppState();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function onLinkLegacy() {
    setMessage("Vinculando tu cuenta anterior…");

    try {
      await api().linkLegacyAccount();
      close();
      await reloadAppState();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function reloadAppState() {
    try {
      await api().bootstrapFromLocal();
    } catch (error) {
      console.warn("No se pudo recargar el estado tras iniciar sesión.", error);
    }

    window.dispatchEvent(new CustomEvent("auth-session-ready"));
  }

  window.addEventListener("auth-required", () => {
    if (!api()) return;
    open("email");
  });

  window.addEventListener("auth-state-changed", event => {
    if (event.detail?.authenticated) close();
  });

  window.AuthView = { open, close };
})();
