(() => {
  const PROFILE_KEY = "routineUserProfile";

  const COUNTRIES = [
    "Argentina",
    "México",
    "España",
    "Chile",
    "Colombia",
    "Perú",
    "Estados Unidos",
    "Canadá",
    "Uruguay",
    "Paraguay",
    "Bolivia",
    "Ecuador",
    "Costa Rica",
    "Panamá",
    "República Dominicana",
    "Otro"
  ];

  const OBJECTIVES = [
    {
      id: "ventas",
      title: "Generar más ventas",
      text: "Quiero mover más producto y mejorar mis resultados."
    },
    {
      id: "clientes",
      title: "Conseguir nuevos clientes",
      text: "Quiero ampliar mi cartera y crear nuevas conversaciones."
    },
    {
      id: "constancia",
      title: "Ser más constante en redes",
      text: "Quiero publicar con más orden y sostener el ritmo."
    },
    {
      id: "crecimiento",
      title: "Hacer crecer mi negocio",
      text: "Quiero construir una rutina que me ayude a avanzar."
    }
  ];

  const params = new URLSearchParams(window.location.search);
  const previewMode = params.get("preview") === "1";
  const forceOnboarding =
    params.get("newuser") === "1" ||
    params.get("onboarding") === "1";

  function getProfile() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  function detectedTimezone() {
    try {
      return (
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "Zona horaria local"
      );
    } catch (error) {
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

    localStorage.setItem("selectedDay", "1");

    for (let day = 1; day <= 30; day++) {
      localStorage.removeItem(`day${day}Complete`);
    }
  }

  function handleNewUserTestParam() {
    if (params.get("newuser") !== "1") return;

    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem("routineState");
    localStorage.removeItem("selectedDay");

    for (let day = 1; day <= 30; day++) {
      localStorage.removeItem(`day${day}Complete`);
    }

    params.delete("newuser");
    const query = params.toString();

    history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : "")
    );
  }

  function removeOverlay() {
    document.getElementById("onboardingOverlay")?.remove();
    document.body.classList.remove("onboarding-open");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function icon(name) {
    const icons = {
      back: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 18-6-6 6-6"></path>
        </svg>
      `,
      chevron: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 18 6-6-6-6"></path>
        </svg>
      `,
      check: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 12 4 4L19 6"></path>
        </svg>
      `,
      clock: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8"></circle>
          <path d="M12 7v5l3 2"></path>
        </svg>
      `,
      globe: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8"></circle>
          <path d="M4 12h16M12 4c2 2.2 3 4.9 3 8s-1 5.8-3 8c-2-2.2-3-4.9-3-8s1-5.8 3-8Z"></path>
        </svg>
      `,
      user: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3"></circle>
          <path d="M5.5 19c.8-3.3 3-5 6.5-5s5.7 1.7 6.5 5"></path>
        </svg>
      `
    };

    return icons[name] || "";
  }

  function getObjectiveLabel(id) {
    return OBJECTIVES.find(item => item.id === id)?.title || "";
  }

  function parseTime(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
    if (!match) return { hour: 9, minute: 0 };

    const hour = Math.max(0, Math.min(23, Number(match[1])));
    const minuteRaw = Number(match[2]);
    const minuteChoices = [0, 15, 30, 45];
    const minute = minuteChoices.reduce((best, current) =>
      Math.abs(current - minuteRaw) < Math.abs(best - minuteRaw)
        ? current
        : best
    , 0);

    return { hour, minute };
  }

  function formatTime(hour, minute) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function validBirthDate(day, month, year) {
    const d = Number(day);
    const m = Number(month);
    const y = Number(year);

    if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) {
      return false;
    }

    if (y < 1900 || y > new Date().getFullYear()) return false;
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;

    const date = new Date(y, m - 1, d);

    return (
      date.getFullYear() === y &&
      date.getMonth() === m - 1 &&
      date.getDate() === d &&
      date <= new Date()
    );
  }

  function openOnboarding({ mode = "create" } = {}) {
    removeOverlay();

    const existing = getProfile();
    const isEdit = mode === "edit";
    const initialTime = parseTime(existing?.notificationTime || "09:00");

    // IMPORTANT:
    // birthDay/month/year live ONLY in this closure while onboarding is open.
    // They are never written to localStorage, sessionStorage, IndexedDB,
    // profile payloads or backend events.
    const state = {
      step: 1,
      name: existing?.name || "",
      country: existing?.country || "",
      birthDay: "",
      birthMonth: "",
      birthYear: "",
      objective: existing?.objective || "",
      timezone: existing?.timezone || detectedTimezone(),
      hour: initialTime.hour,
      minute: initialTime.minute
    };

    const overlay = document.createElement("div");
    overlay.id = "onboardingOverlay";
    overlay.className = "onboarding-overlay";
    document.body.classList.add("onboarding-open");
    document.body.appendChild(overlay);

    function stepIndicator() {
      return `
        <div class="onboarding-progress" aria-label="Paso ${state.step} de 2">
          <div class="onboarding-progress-head">
            <span>${state.step} de 2</span>
            <strong>${state.step === 1 ? "Presentación" : "Objetivo"}</strong>
          </div>
          <div class="onboarding-progress-track">
            <span style="width:${state.step === 1 ? "50%" : "100%"}"></span>
          </div>
          <div class="onboarding-progress-labels" aria-hidden="true">
            <span class="${state.step >= 1 ? "is-active" : ""}">Presentación</span>
            <span class="${state.step >= 2 ? "is-active" : ""}">Objetivo</span>
          </div>
        </div>
      `;
    }

    function render() {
      overlay.innerHTML = `
        <div class="onboarding-panel">
          <header class="onboarding-topbar">
            ${
              state.step === 2
                ? `<button class="onboarding-back" id="onboardingBackBtn" type="button" aria-label="Volver">${icon("back")}</button>`
                : `<div class="onboarding-back-spacer"></div>`
            }
            <span class="onboarding-brand">Rutina 30 Días</span>
            <div class="onboarding-back-spacer"></div>
          </header>

          <div class="onboarding-body">
            ${stepIndicator()}
            <div class="onboarding-step-content onboarding-enter-${state.step === 1 ? "left" : "right"}">
              ${state.step === 1 ? renderPresentationStep() : renderObjectiveStep()}
            </div>
          </div>
        </div>
      `;

      bindStepEvents();
    }

    function renderPresentationStep() {
      return `
        <section class="onboarding-step">
          <div class="onboarding-heading">
            <span class="onboarding-eyebrow">EMPECEMOS</span>
            <h1>${isEdit ? "Actualizá tu perfil" : "¡Hola! 👋"}</h1>
            <p>
              ${
                isEdit
                  ? "Actualizá los datos que usamos para personalizar tu rutina."
                  : "Contanos un poquito sobre vos para personalizar tu experiencia durante estos 30 días."
              }
            </p>
          </div>

          <div class="onboarding-fields">
            <label class="onboarding-input-card" for="onboardingName">
              <span class="onboarding-field-icon">${icon("user")}</span>
              <span class="onboarding-input-copy">
                <small>Tu nombre</small>
                <input
                  id="onboardingName"
                  type="text"
                  autocomplete="given-name"
                  placeholder="¿Cómo te llamás?"
                  value="${escapeHtml(state.name)}"
                  enterkeyhint="next"
                  required
                />
              </span>
            </label>

            <button
              id="onboardingCountryBtn"
              class="onboarding-input-card onboarding-select-card"
              type="button"
            >
              <span class="onboarding-field-icon">${icon("globe")}</span>
              <span class="onboarding-input-copy">
                <small>País</small>
                <strong class="${state.country ? "" : "is-placeholder"}">
                  ${escapeHtml(state.country || "Seleccioná tu país")}
                </strong>
              </span>
              <span class="onboarding-field-chevron">${icon("chevron")}</span>
            </button>

            ${
              isEdit
                ? ""
                : `
                  <div class="onboarding-birth-block">
                    <div class="onboarding-birth-head">
                      <div>
                        <small>Fecha de nacimiento</small>
                        <strong>DD / MM / AAAA</strong>
                      </div>
                    </div>

                    <div class="onboarding-birth-inputs">
                      <input
                        id="birthDay"
                        class="birth-part birth-day"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        maxlength="2"
                        placeholder="DD"
                        value="${escapeHtml(state.birthDay)}"
                        aria-label="Día de nacimiento"
                      />
                      <span>/</span>
                      <input
                        id="birthMonth"
                        class="birth-part birth-month"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        maxlength="2"
                        placeholder="MM"
                        value="${escapeHtml(state.birthMonth)}"
                        aria-label="Mes de nacimiento"
                      />
                      <span>/</span>
                      <input
                        id="birthYear"
                        class="birth-part birth-year"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        maxlength="4"
                        placeholder="AAAA"
                        value="${escapeHtml(state.birthYear)}"
                        aria-label="Año de nacimiento"
                      />
                    </div>
                  </div>
                `
            }
          </div>

          <div id="presentationError" class="onboarding-error" role="alert" hidden></div>

          <div class="onboarding-bottom-action">
            <button id="presentationContinueBtn" class="onboarding-primary" type="button">
              Continuar
              <span>${icon("chevron")}</span>
            </button>
          </div>
        </section>
      `;
    }

    function renderObjectiveStep() {
      const time = formatTime(state.hour, state.minute);

      return `
        <section class="onboarding-step">
          <div class="onboarding-heading">
            <span class="onboarding-eyebrow">TU META</span>
            <h1>¿Qué querés lograr en estos 30 días?</h1>
            <p>Elegí el objetivo que mejor represente lo que querés trabajar primero.</p>
          </div>

          <div class="objective-options" role="radiogroup" aria-label="Objetivo principal">
            ${OBJECTIVES.map(item => `
              <button
                class="objective-option${state.objective === item.id ? " is-selected" : ""}"
                type="button"
                data-objective="${item.id}"
                role="radio"
                aria-checked="${state.objective === item.id ? "true" : "false"}"
              >
                <span class="objective-radio">
                  ${state.objective === item.id ? icon("check") : ""}
                </span>
                <span class="objective-copy">
                  <strong>${item.title}</strong>
                  <small>${item.text}</small>
                </span>
              </button>
            `).join("")}
          </div>

          <div class="onboarding-time-section">
            <div class="onboarding-time-heading">
              <span class="onboarding-eyebrow">TU HORARIO</span>
              <h2>¿A qué hora querés recibir tu acción del día?</h2>
            </div>

            <button id="onboardingTimeBtn" class="onboarding-time-card" type="button">
              <span class="time-card-icon">${icon("clock")}</span>
              <span class="time-card-copy">
                <strong>${time}</strong>
                <small>Todos los días · ${escapeHtml(state.timezone)}</small>
              </span>
              <span class="time-card-chevron">${icon("chevron")}</span>
            </button>

            <p class="onboarding-time-help">
              Podrás cambiar este horario más adelante.
            </p>
          </div>

          <div id="objectiveError" class="onboarding-error" role="alert" hidden></div>

          <div class="onboarding-bottom-action">
            <button id="finishOnboardingBtn" class="onboarding-primary" type="button">
              ${isEdit ? "Guardar cambios" : "Empezar mi rutina"}
              <span>${icon("chevron")}</span>
            </button>
          </div>
        </section>
      `;
    }

    function setError(id, message) {
      const el = document.getElementById(id);
      if (!el) return;

      el.textContent = message;
      el.hidden = !message;

      if (message) {
        el.animate(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-4px)" },
            { transform: "translateX(4px)" },
            { transform: "translateX(0)" }
          ],
          { duration: 220, easing: "ease-out" }
        );
      }
    }

    function collectPresentationValues() {
      state.name = String(
        document.getElementById("onboardingName")?.value || ""
      ).trim();

      if (!isEdit) {
        state.birthDay = String(
          document.getElementById("birthDay")?.value || ""
        ).replace(/\D/g, "").slice(0, 2);

        state.birthMonth = String(
          document.getElementById("birthMonth")?.value || ""
        ).replace(/\D/g, "").slice(0, 2);

        state.birthYear = String(
          document.getElementById("birthYear")?.value || ""
        ).replace(/\D/g, "").slice(0, 4);
      }
    }

    function validatePresentation() {
      collectPresentationValues();

      if (!state.name) {
        setError("presentationError", "Ingresá tu nombre para continuar.");
        document.getElementById("onboardingName")?.focus();
        return false;
      }

      if (!state.country) {
        setError("presentationError", "Seleccioná tu país para continuar.");
        return false;
      }

      if (
        !isEdit &&
        !validBirthDate(
          state.birthDay,
          state.birthMonth,
          state.birthYear
        )
      ) {
        setError(
          "presentationError",
          "Ingresá una fecha de nacimiento válida."
        );
        document.getElementById("birthDay")?.focus();
        return false;
      }

      setError("presentationError", "");
      return true;
    }

    function moveToStep(step) {
      const panel = overlay.querySelector(".onboarding-panel");
      const direction = step > state.step ? 1 : -1;

      if (
        panel &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        panel.animate(
          [
            { opacity: 1, transform: "translateX(0)" },
            {
              opacity: 0.55,
              transform: `translateX(${direction * -12}px)`
            }
          ],
          { duration: 115, easing: "ease-in", fill: "forwards" }
        ).finished.finally(() => {
          state.step = step;
          render();
        });
        return;
      }

      state.step = step;
      render();
    }

    function openCountrySheet() {
      const sheet = document.createElement("div");
      sheet.className = "onboarding-sheet-layer";
      sheet.innerHTML = `
        <button class="onboarding-sheet-backdrop" type="button" aria-label="Cerrar"></button>
        <section class="onboarding-sheet country-sheet" role="dialog" aria-modal="true" aria-label="Seleccionar país">
          <div class="sheet-grabber"></div>
          <div class="sheet-header">
            <div>
              <span class="onboarding-eyebrow">UBICACIÓN</span>
              <h2>Seleccioná tu país</h2>
            </div>
            <button class="sheet-close" type="button" aria-label="Cerrar">×</button>
          </div>
          <div class="country-list">
            ${COUNTRIES.map(country => `
              <button
                type="button"
                class="country-option${state.country === country ? " is-selected" : ""}"
                data-country="${escapeHtml(country)}"
              >
                <span>${escapeHtml(country)}</span>
                <span class="country-check">${state.country === country ? icon("check") : ""}</span>
              </button>
            `).join("")}
          </div>
        </section>
      `;

      overlay.appendChild(sheet);

      requestAnimationFrame(() => {
        sheet.classList.add("is-open");
      });

      const close = () => {
        sheet.classList.remove("is-open");
        setTimeout(() => sheet.remove(), 220);
      };

      sheet.querySelector(".onboarding-sheet-backdrop")?.addEventListener("click", close);
      sheet.querySelector(".sheet-close")?.addEventListener("click", close);

      sheet.querySelectorAll("[data-country]").forEach(button => {
        button.addEventListener("click", () => {
          state.country = button.dataset.country || "";
          close();
          setTimeout(render, 120);
        });
      });
    }

    function openTimeSheet() {
      const originalHour = state.hour;
      const originalMinute = state.minute;

      let draftHour = state.hour;
      let draftMinute = state.minute;

      const hours = Array.from({ length: 24 }, (_, i) => i);
      const minutes = [0, 15, 30, 45];

      const sheet = document.createElement("div");
      sheet.className = "onboarding-sheet-layer";
      sheet.innerHTML = `
        <button class="onboarding-sheet-backdrop" type="button" aria-label="Cerrar"></button>
        <section class="onboarding-sheet time-sheet" role="dialog" aria-modal="true" aria-label="Elegir horario">
          <div class="sheet-grabber"></div>
          <div class="sheet-header time-sheet-header">
            <div>
              <span class="onboarding-eyebrow">HORARIO DIARIO</span>
              <h2>Elegí tu horario</h2>
            </div>
          </div>

          <div class="time-wheel-wrap">
            <div class="time-wheel-highlight" aria-hidden="true"></div>

            <div class="time-wheel-column">
              <div id="hourWheel" class="time-wheel" aria-label="Hora">
                ${hours.map(value => `
                  <button
                    type="button"
                    class="time-wheel-item"
                    data-value="${value}"
                    tabindex="-1"
                  >
                    ${String(value).padStart(2, "0")}
                  </button>
                `).join("")}
              </div>
              <span class="time-wheel-label">hora</span>
            </div>

            <div class="time-wheel-separator" aria-hidden="true">:</div>

            <div class="time-wheel-column">
              <div id="minuteWheel" class="time-wheel" aria-label="Minutos">
                ${minutes.map(value => `
                  <button
                    type="button"
                    class="time-wheel-item"
                    data-value="${value}"
                    tabindex="-1"
                  >
                    ${String(value).padStart(2, "0")}
                  </button>
                `).join("")}
              </div>
              <span class="time-wheel-label">min</span>
            </div>
          </div>

          <p class="time-sheet-note">
            Tu siguiente acción se habilitará a esta hora según
            <strong>${escapeHtml(state.timezone)}</strong>.
          </p>

          <button id="confirmTimeBtn" class="onboarding-primary sheet-confirm" type="button">
            Confirmar ${formatTime(draftHour, draftMinute)}
          </button>
        </section>
      `;

      overlay.appendChild(sheet);

      const hourWheel = sheet.querySelector("#hourWheel");
      const minuteWheel = sheet.querySelector("#minuteWheel");
      const confirm = sheet.querySelector("#confirmTimeBtn");
      const rowHeight = 56;

      function updateWheelClasses(wheel, selected) {
        wheel?.querySelectorAll(".time-wheel-item").forEach(item => {
          item.classList.toggle(
            "is-selected",
            Number(item.dataset.value) === selected
          );
        });
      }

      function updateConfirm() {
        if (confirm) {
          confirm.textContent = `Confirmar ${formatTime(draftHour, draftMinute)}`;
        }
      }

      function bindWheel(wheel, values, onChange) {
        if (!wheel) return;

        let timer = null;

        wheel.addEventListener(
          "scroll",
          () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
              const index = Math.max(
                0,
                Math.min(
                  values.length - 1,
                  Math.round(wheel.scrollTop / rowHeight)
                )
              );

              const value = values[index];
              wheel.scrollTo({
                top: index * rowHeight,
                behavior: "smooth"
              });
              onChange(value);
            }, 55);
          },
          { passive: true }
        );

        wheel.querySelectorAll(".time-wheel-item").forEach((item, index) => {
          item.addEventListener("click", () => {
            wheel.scrollTo({
              top: index * rowHeight,
              behavior: "smooth"
            });
            onChange(values[index]);
          });
        });
      }

      function close({ restore = false } = {}) {
        if (restore) {
          state.hour = originalHour;
          state.minute = originalMinute;
        }

        sheet.classList.remove("is-open");
        setTimeout(() => sheet.remove(), 220);
      }

      bindWheel(hourWheel, hours, value => {
        draftHour = value;
        updateWheelClasses(hourWheel, draftHour);
        updateConfirm();
      });

      bindWheel(minuteWheel, minutes, value => {
        draftMinute = value;
        updateWheelClasses(minuteWheel, draftMinute);
        updateConfirm();
      });

      sheet.querySelector(".onboarding-sheet-backdrop")?.addEventListener(
        "click",
        () => close({ restore: true })
      );

      confirm?.addEventListener("click", () => {
        state.hour = draftHour;
        state.minute = draftMinute;
        close();
        setTimeout(render, 120);
      });

      requestAnimationFrame(() => {
        sheet.classList.add("is-open");

        hourWheel.scrollTop = hours.indexOf(draftHour) * rowHeight;
        minuteWheel.scrollTop = minutes.indexOf(draftMinute) * rowHeight;

        updateWheelClasses(hourWheel, draftHour);
        updateWheelClasses(minuteWheel, draftMinute);
      });
    }

    function bindBirthInputs() {
      if (isEdit) return;

      const day = document.getElementById("birthDay");
      const month = document.getElementById("birthMonth");
      const year = document.getElementById("birthYear");

      const clean = input => {
        input.value = input.value.replace(/\D/g, "").slice(0, input.maxLength);
      };

      day?.addEventListener("input", () => {
        clean(day);
        state.birthDay = day.value;
        if (day.value.length === 2) month?.focus();
      });

      month?.addEventListener("input", () => {
        clean(month);
        state.birthMonth = month.value;
        if (month.value.length === 2) year?.focus();
      });

      year?.addEventListener("input", () => {
        clean(year);
        state.birthYear = year.value;
      });

      month?.addEventListener("keydown", event => {
        if (event.key === "Backspace" && !month.value) day?.focus();
      });

      year?.addEventListener("keydown", event => {
        if (event.key === "Backspace" && !year.value) month?.focus();
      });
    }

    function showPreparing() {
      overlay.innerHTML = `
        <div class="onboarding-preparing">
          <div class="preparing-mark">
            ${icon("check")}
          </div>
          <h2>${isEdit ? "Cambios guardados" : "Preparando tu rutina…"}</h2>
          <p>
            ${
              isEdit
                ? "Tu perfil quedó actualizado."
                : `Todo listo, ${escapeHtml(state.name)}.`
            }
          </p>
        </div>
      `;
    }

    function finish() {
      if (!state.objective) {
        setError(
          "objectiveError",
          "Elegí un objetivo para personalizar tu experiencia."
        );
        return;
      }

      const firstProfile = !getProfile();

      const profile = {
        ...(existing?.userId ? { userId: existing.userId } : {}),
        name: state.name,
        country: state.country,
        objective: state.objective,
        timezone: state.timezone,
        notificationTime: formatTime(state.hour, state.minute),
        startedAt: existing?.startedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Intentionally NO birth date here.
      // The birth date never leaves the in-memory state above.
      saveProfile(profile);

      window.dispatchEvent(
        new CustomEvent("routine-profile-updated", {
          detail: profile
        })
      );

      if (firstProfile) {
        resetRoutineForNewUser();
      }

      showPreparing();

      setTimeout(() => {
        if (firstProfile) {
          window.location.reload();
          return;
        }

        removeOverlay();
        renderProfileUI();
      }, 760);
    }

    function bindStepEvents() {
      document.getElementById("onboardingBackBtn")?.addEventListener(
        "click",
        () => moveToStep(1)
      );

      if (state.step === 1) {
        document.getElementById("onboardingCountryBtn")?.addEventListener(
          "click",
          openCountrySheet
        );

        document.getElementById("presentationContinueBtn")?.addEventListener(
          "click",
          () => {
            if (validatePresentation()) moveToStep(2);
          }
        );

        document.getElementById("onboardingName")?.addEventListener(
          "input",
          event => {
            state.name = event.target.value;
          }
        );

        document.getElementById("onboardingName")?.addEventListener(
          "keydown",
          event => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (validatePresentation()) moveToStep(2);
            }
          }
        );

        bindBirthInputs();
        return;
      }

      document.querySelectorAll("[data-objective]").forEach(button => {
        button.addEventListener("click", () => {
          state.objective = button.dataset.objective || "";
          document.querySelectorAll("[data-objective]").forEach(item => {
            const selected = item.dataset.objective === state.objective;
            item.classList.toggle("is-selected", selected);
            item.setAttribute("aria-checked", selected ? "true" : "false");

            const radio = item.querySelector(".objective-radio");
            if (radio) {
              radio.innerHTML = selected ? icon("check") : "";
            }
          });

          setError("objectiveError", "");
        });
      });

      document.getElementById("onboardingTimeBtn")?.addEventListener(
        "click",
        openTimeSheet
      );

      document.getElementById("finishOnboardingBtn")?.addEventListener(
        "click",
        finish
      );
    }

    render();
  }

  function renderGreeting(profile) {
    const greeting = document.getElementById("homeGreeting");
    if (greeting && profile?.name) {
      greeting.textContent = `Hola, ${profile.name}`;
    }
  }

  function renderProfileSummary(profile) {
    const sectionHead = document.querySelector("#view-rutina .section-head");
    if (!sectionHead) return;

    let summary = document.getElementById("profileSummary");

    if (!summary) {
      summary = document.createElement("div");
      summary.id = "profileSummary";
      summary.className = "profile-summary";
      sectionHead.appendChild(summary);
    }

    summary.innerHTML = `
      <div class="profile-summary-top">
        <div>
          <strong>${escapeHtml(profile.name)}</strong>
          <span>${escapeHtml(profile.country)} · ${escapeHtml(profile.timezone)}</span>
          ${
            profile.objective
              ? `<span>Objetivo: ${escapeHtml(getObjectiveLabel(profile.objective))}</span>`
              : ""
          }
          <span>Hora preferida: ${escapeHtml(profile.notificationTime)}</span>
        </div>
        <button class="secondary" id="editProfileBtn" type="button">
          Editar perfil
        </button>
      </div>
    `;

    document.getElementById("editProfileBtn")?.addEventListener(
      "click",
      () => openOnboarding({ mode: "edit" })
    );
  }

  function renderProfileUI() {
    const profile = getProfile();
    if (!profile) return;

    renderGreeting(profile);
    renderProfileSummary(profile);
  }

  window.addEventListener("routine-profile-synced", event => {
    const profile = event.detail || getProfile();
    if (!profile) return;

    renderGreeting(profile);
    renderProfileSummary(profile);
  });

  function init() {
    handleNewUserTestParam();

    const profile = getProfile();

    if (profile) {
      renderProfileUI();
      return;
    }

    if (previewMode && !forceOnboarding) {
      return;
    }

    openOnboarding({ mode: "create" });
  }

  window.RoutineOnboarding = {
    getProfile,
    open: openOnboarding
  };

  init();
})();
