(() => {
  const PROFILE_KEY = "routineUserProfile";

  const countries = [
    "Argentina",
    "España",
    "México",
    "Chile",
    "Colombia",
    "Perú",
    "Estados Unidos",
    "Otro"
  ];

  const params = new URLSearchParams(window.location.search);
  const previewMode = params.get("preview") === "1";

  function getProfile() {
    try {
      return JSON.parse(
        localStorage.getItem(PROFILE_KEY) || "null"
      );
    } catch (e) {
      return null;
    }
  }

  function saveProfile(profile) {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify(profile)
    );
  }

  function detectedTimezone() {
    try {
      return (
        Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone || "Zona horaria local"
      );
    } catch (e) {
      return "Zona horaria local";
    }
  }

  function resetRoutineForNewUser() {
    localStorage.setItem(
      "routineState",
      JSON.stringify({
        currentDay: 1,
        openedDays: {},
        nextUnlockAt: null
      })
    );

    localStorage.setItem(
      "selectedDay",
      "1"
    );

    for (let day = 1; day <= 7; day++) {
      localStorage.removeItem(
        `day${day}Complete`
      );
    }
  }

  function handleNewUserTestParam() {
    if (params.get("newuser") !== "1") {
      return;
    }

    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem("routineState");
    localStorage.removeItem("selectedDay");

    for (let day = 1; day <= 7; day++) {
      localStorage.removeItem(
        `day${day}Complete`
      );
    }

    params.delete("newuser");

    const query = params.toString();

    history.replaceState(
      {},
      "",
      window.location.pathname +
        (query ? `?${query}` : "")
    );
  }

  function removeOverlay() {
    document
      .getElementById("onboardingOverlay")
      ?.remove();
  }

  function countryOptions(selected) {
    return countries
      .map(country => {
        const isSelected =
          country === selected
            ? " selected"
            : "";

        return (
          `<option value="${country}"${isSelected}>` +
          `${country}</option>`
        );
      })
      .join("");
  }

  function openOnboarding({
    mode = "create"
  } = {}) {
    removeOverlay();

    const existing = getProfile();
    const isEdit = mode === "edit";
    const timezone =
      existing?.timezone ||
      detectedTimezone();

    const overlay =
      document.createElement("div");

    overlay.id = "onboardingOverlay";
    overlay.className =
      "onboarding-overlay";

    overlay.innerHTML = `
      <div class="onboarding-panel">
        <div class="onboarding-badge">
          ${isEdit ? "MI PERFIL" : "BIENVENID@"}
        </div>

        <h2>
          ${
            isEdit
              ? "Actualizá tus datos"
              : "Empezá tu Challenge #30DíasCollagen+"
          }
        </h2>

        <p class="onboarding-intro">
          ${
            isEdit
              ? "Estos datos nos ayudan a personalizar tu experiencia."
              : "Vamos a preparar tu rutina. Te llevará menos de un minuto."
          }
        </p>

        <form id="onboardingForm" class="onboarding-form">
          <div class="onboarding-field">
            <label for="onboardingName">¿Cómo te llamás?</label>
            <input
              id="onboardingName"
              name="name"
              type="text"
              autocomplete="given-name"
              placeholder="Tu nombre"
              value="${existing?.name || ""}"
              required
            />
          </div>

          <div class="onboarding-field">
            <label for="onboardingCountry">País</label>
            <select
              id="onboardingCountry"
              name="country"
              required
            >
              <option value="">Seleccioná tu país</option>
              ${countryOptions(existing?.country || "")}
            </select>
          </div>

          <div class="onboarding-field">
            <label>Zona horaria detectada</label>
            <div class="onboarding-timezone">
              ${timezone}
            </div>
            <div class="onboarding-help">
              La usamos para habilitar tu siguiente día en el horario correcto
              y, más adelante, enviar la notificación a tu hora local.
            </div>
          </div>

          <div class="onboarding-field">
            <label for="onboardingTime">
              ¿A qué hora preferís recibir tu acción?
            </label>
            <input
              id="onboardingTime"
              name="notificationTime"
              type="time"
              value="${existing?.notificationTime || "09:00"}"
              required
            />
            <div class="onboarding-help">
              Esta hora define cuándo se habilita tu siguiente día.
              Las notificaciones push se activarán en el siguiente paso.
            </div>
          </div>

          <div class="onboarding-actions">
            ${
              isEdit
                ? '<button type="button" class="secondary" id="cancelOnboarding">Cancelar</button>'
                : ""
            }

            <button type="submit" class="primary">
              ${
                isEdit
                  ? "Guardar cambios"
                  : "INICIAR CHALLENGE"
              }
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const form =
      document.getElementById(
        "onboardingForm"
      );

    form.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const formData =
          new FormData(form);

        const name =
          String(
            formData.get("name") || ""
          ).trim();

        const country =
          String(
            formData.get("country") || ""
          ).trim();

        const notificationTime =
          String(
            formData.get(
              "notificationTime"
            ) || "09:00"
          );

        if (!name || !country) {
          return;
        }

        const firstProfile =
          !getProfile();

        const profile = {
          name,
          country,
          timezone,
          notificationTime,
          startedAt:
            existing?.startedAt ||
            new Date().toISOString(),
          updatedAt:
            new Date().toISOString()
        };

        saveProfile(profile);

        window.dispatchEvent(
          new CustomEvent(
            "routine-profile-updated",
            {
              detail: profile
            }
          )
        );

        if (firstProfile) {
          resetRoutineForNewUser();
        }

        if (
          !firstProfile &&
          window.BackendAPI
        ) {
          window.BackendAPI
            .updateProfile(profile)
            .catch(error => {
              console.warn(
                "No se pudo actualizar el perfil en el backend.",
                error
              );
            });
        }

        removeOverlay();
        renderProfileUI();

        if (firstProfile) {
          window.location.reload();
        }
      }
    );

    document
      .getElementById(
        "cancelOnboarding"
      )
      ?.addEventListener(
        "click",
        removeOverlay
      );
  }

  function renderGreeting(profile) {
    const hero =
      document.querySelector(
        "#view-hoy .hero-card"
      );

    if (!hero) return;

    let greeting =
      document.getElementById(
        "profileGreeting"
      );

    if (!greeting) {
      greeting =
        document.createElement("div");

      greeting.id =
        "profileGreeting";

      greeting.className =
        "profile-greeting";

      hero.insertBefore(
        greeting,
        hero.firstChild
      );
    }

    greeting.textContent =
      `Hola, ${profile.name} 👋`;
  }

  function renderProfileSummary(profile) {
    const sectionHead =
      document.querySelector(
        "#view-rutina .section-head"
      );

    if (!sectionHead) return;

    let summary =
      document.getElementById(
        "profileSummary"
      );

    if (!summary) {
      summary =
        document.createElement("div");

      summary.id =
        "profileSummary";

      summary.className =
        "profile-summary";

      sectionHead.appendChild(
        summary
      );
    }

    summary.innerHTML = `
      <div class="profile-summary-top">
        <div>
          <strong>${profile.name}</strong>
          <span>
            ${profile.country}
            · ${profile.timezone}
          </span>
          <span>
            Hora preferida: ${profile.notificationTime}
          </span>
        </div>

        <button
          class="secondary"
          id="editProfileBtn"
          type="button"
        >
          Editar perfil
        </button>
      </div>
    `;

    document
      .getElementById(
        "editProfileBtn"
      )
      .addEventListener(
        "click",
        () => openOnboarding({
          mode: "edit"
        })
      );
  }

  function renderProfileUI() {
    const profile =
      getProfile();

    if (!profile) return;

    renderGreeting(profile);
    renderProfileSummary(profile);
  }

  function init() {
    handleNewUserTestParam();

    const profile =
      getProfile();

    if (profile) {
      renderProfileUI();
      return;
    }

    if (previewMode) {
      return;
    }

    openOnboarding({
      mode: "create"
    });
  }

  window.RoutineOnboarding = {
    getProfile,
    open: openOnboarding
  };

  init();
})();
