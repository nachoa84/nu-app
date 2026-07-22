(() => {
  const CARD_ID =
    "pushNotificationCard";


  function isAppleMobileDevice() {
    const ua =
      navigator.userAgent || "";

    const classicIOS =
      /iPhone|iPad|iPod/i
        .test(ua);

    const iPadDesktopMode =
      navigator.platform ===
        "MacIntel" &&
      navigator.maxTouchPoints >
        1;

    return (
      classicIOS ||
      iPadDesktopMode
    );
  }

  function isStandaloneWebApp() {
    return Boolean(
      window.matchMedia?.(
        "(display-mode: standalone)"
      )?.matches ||
      window.navigator
        .standalone === true
    );
  }

  function isPushSupported() {
    return (
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }

  function getProfile() {
    try {
      return JSON.parse(
        localStorage.getItem(
          "routineUserProfile"
        ) || "null"
      );
    } catch (e) {
      return null;
    }
  }

  function urlBase64ToUint8Array(
    base64String
  ) {
    const padding =
      "=".repeat(
        (4 -
          (
            base64String.length %
            4
          )) %
          4
      );

    const base64 =
      (
        base64String +
        padding
      )
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const rawData =
      window.atob(base64);

    return Uint8Array.from(
      [...rawData].map(
        char =>
          char.charCodeAt(0)
      )
    );
  }

  async function api(
    path,
    options = {}
  ) {
    const response =
      await fetch(
        path,
        {
          ...options,
          headers: {
            "Content-Type":
              "application/json",
            ...(options.headers || {})
          }
        }
      );

    const payload =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload.error ||
        `Error HTTP ${response.status}`
      );
    }

    return payload;
  }

  async function getRegistration() {
    if (
      !("serviceWorker" in navigator)
    ) {
      throw new Error(
        "Este navegador no admite Service Workers."
      );
    }

    return navigator
      .serviceWorker
      .ready;
  }

  async function getSubscription() {
    const registration =
      await getRegistration();

    return registration
      .pushManager
      .getSubscription();
  }


  async function ensureBackendReady() {
    if (
      window.BackendAPI
        ?.bootstrapFromLocal
    ) {
      await window.BackendAPI
        .bootstrapFromLocal();
    }

    return (
      window.BackendAPI
        ?.ensureUserId?.() ||
      getProfile()
    );
  }

  async function subscribe() {
    if (
      isAppleMobileDevice() &&
      !isStandaloneWebApp()
    ) {
      throw new Error(
        "En iPhone o iPad, primero agregá la PWA a la pantalla de inicio y abrila desde su ícono."
      );
    }

    const profile =
      await ensureBackendReady();

    if (!profile?.userId) {
      throw new Error(
        "Primero necesitás completar tu perfil."
      );
    }

    if (
      !("PushManager" in window)
    ) {
      throw new Error(
        "Este dispositivo o navegador no admite notificaciones push."
      );
    }

    const permission =
      await Notification
        .requestPermission();

    if (
      permission !== "granted"
    ) {
      throw new Error(
        "No se otorgó permiso para notificaciones."
      );
    }

    const keyData =
      await api(
        "/api/push/public-key"
      );

    const registration =
      await getRegistration();

    let subscription =
      await registration
        .pushManager
        .getSubscription();

    if (!subscription) {
      subscription =
        await registration
          .pushManager
          .subscribe({
            userVisibleOnly: true,
            applicationServerKey:
              urlBase64ToUint8Array(
                keyData.publicKey
              )
          });
    }

    await api(
      "/api/push/subscribe",
      {
        method: "POST",
        body: JSON.stringify({
          userId:
            profile.userId,
          subscription:
            subscription.toJSON()
        })
      }
    );

    await render();
  }

  async function unsubscribe() {
    const profile =
      window.BackendAPI
        ?.ensureUserId?.() ||
      getProfile();

    const subscription =
      await getSubscription();

    if (!subscription) {
      await render();
      return;
    }

    await api(
      "/api/push/unsubscribe",
      {
        method: "POST",
        body: JSON.stringify({
          userId:
            profile?.userId,
          endpoint:
            subscription.endpoint
        })
      }
    );

    await subscription
      .unsubscribe();

    await render();
  }

  async function sendTest() {
    const profile =
      await ensureBackendReady();

    if (!profile?.userId) {
      throw new Error(
        "No encontramos tu usuario."
      );
    }

    await api(
      "/api/push/test",
      {
        method: "POST",
        body: JSON.stringify({
          userId:
            profile.userId
        })
      }
    );
  }

  function setMessage(
    card,
    message,
    isError = false
  ) {
    const el =
      card.querySelector(
        "[data-push-message]"
      );

    if (!el) return;

    el.textContent =
      message || "";

    el.style.color =
      isError
        ? "#b42318"
        : "";
  }


  async function syncExistingSubscriptionToBackend() {
    try {
      const profile =
        await ensureBackendReady();

      if (!profile?.userId) {
        return;
      }

      if (
        Notification.permission !==
        "granted"
      ) {
        return;
      }

      const subscription =
        await getSubscription();

      if (!subscription) {
        return;
      }

      await api(
        "/api/push/subscribe",
        {
          method: "POST",
          body: JSON.stringify({
            userId:
              profile.userId,
            subscription:
              subscription.toJSON()
          })
        }
      );
    } catch (error) {
      console.warn(
        "No se pudo resincronizar la suscripción push.",
        error
      );
    }
  }

  async function render() {
    const container =
      document.querySelector(
        "#view-rutina .section-head"
      );

    if (!container) return;

    let card =
      document.getElementById(
        CARD_ID
      );

    if (!card) {
      card =
        document.createElement(
          "div"
        );

      card.id = CARD_ID;
      card.className =
        "profile-summary";

      container.appendChild(
        card
      );
    }

    const appleMobile =
      isAppleMobileDevice();

    const standalone =
      isStandaloneWebApp();

    const supported =
      isPushSupported();

    // iPhone/iPad: Web Push requiere abrir la experiencia
    // como web app desde la pantalla de inicio.
    if (
      appleMobile &&
      !standalone
    ) {
      card.innerHTML = `
        <div class="profile-summary-top">
          <div>
            <strong>
              📱 Activá notificaciones en iPhone
            </strong>

            <span>
              Para recibir avisos, primero agregá Rutina 30 Días a tu pantalla de inicio.
            </span>

            <div
              style="
                margin-top:10px;
                padding:12px 14px;
                border-radius:12px;
                background:#f7f5ff;
                line-height:1.5;
                font-size:13px;
              "
            >
              <strong style="display:block;margin-bottom:6px;">
                Cómo hacerlo:
              </strong>
              <div>1. Tocá el botón Compartir del navegador.</div>
              <div>2. Elegí “Agregar a pantalla de inicio”.</div>
              <div>3. Abrí Rutina 30 Días desde el nuevo ícono.</div>
              <div>4. Volvé a esta sección y tocá “Activar”.</div>
            </div>

            <span
              style="
                display:block;
                margin-top:8px;
              "
            >
              En iPhone/iPad, el permiso de notificaciones se solicita desde la web app instalada.
            </span>

            <span data-push-message></span>
          </div>
        </div>
      `;

      return;
    }

    if (!supported) {
      card.innerHTML = `
        <div class="profile-summary-top">
          <div>
            <strong>
              🔕 Notificaciones no disponibles
            </strong>
            <span>
              ${
                appleMobile
                  ? "Este iPhone o iPad no ofrece Web Push en esta configuración. Verificá que el sistema esté actualizado y que abras la PWA desde la pantalla de inicio."
                  : "Este navegador no admite Web Push."
              }
            </span>
          </div>
        </div>
      `;

      return;
    }

    let subscription = null;

    try {
      subscription =
        await getSubscription();
    } catch (e) {
      // El service worker puede estar terminando de iniciar.
    }

    const permission =
      Notification.permission;

    const active =
      Boolean(subscription) &&
      permission === "granted";

    card.innerHTML = `
      <div class="profile-summary-top">
        <div>
          <strong>
            ${
              active
                ? "🔔 Notificaciones activadas"
                : "🔔 Activá tus notificaciones"
            }
          </strong>
          <span>
            ${
              active
                ? "Este dispositivo ya está suscripto."
                : permission === "denied"
                  ? (
                      appleMobile
                        ? "Las notificaciones están bloqueadas. Podés volver a habilitarlas desde Ajustes del iPhone."
                        : "Las notificaciones están bloqueadas en el navegador."
                    )
                  : "Recibí un aviso cuando tu próximo día esté disponible."
            }
          </span>
          <span data-push-message></span>
        </div>

        <div
          style="
            display:flex;
            gap:8px;
            flex-wrap:wrap;
          "
        >
          ${
            active
              ? `
                <button
                  class="primary"
                  id="pushTestBtn"
                  type="button"
                >
                  Enviar prueba
                </button>

                <button
                  class="secondary"
                  id="pushDisableBtn"
                  type="button"
                >
                  Desactivar
                </button>
              `
              : `
                <button
                  class="primary"
                  id="pushEnableBtn"
                  type="button"
                  ${
                    permission ===
                    "denied"
                      ? "disabled"
                      : ""
                  }
                >
                  Activar
                </button>
              `
          }
        </div>
      </div>
    `;

    const enableBtn =
      document.getElementById(
        "pushEnableBtn"
      );

    if (enableBtn) {
      enableBtn.onclick =
        async () => {
          enableBtn.disabled =
            true;

          setMessage(
            card,
            "Activando..."
          );

          try {
            await subscribe();

            setMessage(
              card,
              "Listo. Este teléfono quedó registrado."
            );
          } catch (error) {
            console.error(error);

            setMessage(
              card,
              error.message,
              true
            );

            enableBtn.disabled =
              false;
          }
        };
    }

    const disableBtn =
      document.getElementById(
        "pushDisableBtn"
      );

    if (disableBtn) {
      disableBtn.onclick =
        async () => {
          try {
            await unsubscribe();
          } catch (error) {
            console.error(error);

            setMessage(
              card,
              error.message,
              true
            );
          }
        };
    }

    const testBtn =
      document.getElementById(
        "pushTestBtn"
      );

    if (testBtn) {
      testBtn.onclick =
        async () => {
          testBtn.disabled =
            true;

          setMessage(
            card,
            "Enviando notificación de prueba..."
          );

          try {
            await sendTest();

            setMessage(
              card,
              "Prueba enviada."
            );
          } catch (error) {
            console.error(error);

            setMessage(
              card,
              error.message,
              true
            );
          } finally {
            testBtn.disabled =
              false;
          }
        };
    }
  }

  window.addEventListener(
    "DOMContentLoaded",
    () => {
      setTimeout(
        async () => {
          await syncExistingSubscriptionToBackend();
          await render();
        },
        500
      );
    }
  );

  window.addEventListener(
    "routine-profile-updated",
    () => {
      setTimeout(
        async () => {
          await syncExistingSubscriptionToBackend();
          await render();
        },
        100
      );
    }
  );

  window.addEventListener(
    "pageshow",
    () => {
      setTimeout(
        render,
        100
      );
    }
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        setTimeout(
          render,
          100
        );
      }
    }
  );

  window.PushClient = {
    render,
    subscribe,
    unsubscribe,
    sendTest,
    syncExistingSubscriptionToBackend
  };
})();
