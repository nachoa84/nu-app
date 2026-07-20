
(() => {
  const MAX_DAYS = 30;
  const PILOT_DAYS = 7;

  const $ = (sel, root = document) =>
    root.querySelector(sel);

  const $$ = (sel, root = document) =>
    [...root.querySelectorAll(sel)];

  function getSelectedDay() {
    const value =
      Number(
        localStorage.getItem(
          "selectedDay"
        ) || "1"
      );

    return Number.isFinite(value)
      ? Math.max(
          1,
          Math.min(MAX_DAYS, value)
        )
      : 1;
  }

  function getBackendCurrentDay() {
    try {
      const profile =
        JSON.parse(
          localStorage.getItem(
            "routineBackendState"
          ) || "null"
        );

      return Number(
        profile?.currentDay
      ) || null;
    } catch (error) {
      return null;
    }
  }

  function getCurrentDay() {
    return (
      getBackendCurrentDay() ||
      getSelectedDay()
    );
  }

  function isComplete(day) {
    return (
      localStorage.getItem(
        `day${day}Complete`
      ) === "1"
    );
  }

  function originalDayCards() {
    return $$("#daysGrid .day-card");
  }

  function openOriginalDay(day) {
    const card =
      originalDayCards()[day - 1];

    if (
      card &&
      !card.classList
        .contains("locked")
    ) {
      card.click();
      return true;
    }

    return false;
  }

  function installBell() {
    const topbar = $(".topbar");
    if (!topbar) return;

    let bell = $(".v14-bell");

    if (!bell) {
      bell =
        document.createElement(
          "button"
        );

      bell.className = "v14-bell";
      bell.type = "button";
      bell.setAttribute(
        "aria-label",
        "Notificaciones"
      );
      bell.textContent = "♧";
      bell.innerHTML = `
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M10 21h4"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
      `;

      bell.onclick = () => {
        const routineButton =
          $('.nav-btn[data-view="rutina"]');

        routineButton?.click();

        setTimeout(() => {
          const target =
            $(
              ".push-settings-card," +
              ".notification-card," +
              "[data-push-card]"
            );

          target?.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        }, 180);
      };

      topbar.appendChild(bell);
    }
  }

  function updateNavLabels() {
    const home =
      $('.nav-btn[data-view="hoy"] span');

    const routine =
      $('.nav-btn[data-view="rutina"] span');

    const favorites =
      $('.nav-btn[data-view="favoritos"] span');

    const bot =
      $('.nav-btn[data-view="bot"] span');

    if (home) home.textContent = "Inicio";
    if (routine) {
      routine.textContent = "Rutina";
    }
    if (favorites) {
      favorites.textContent = "Guardado";
    }
    if (bot) bot.textContent = "Bot";

    const favTitle =
      $("#view-favoritos .section-head h2");

    if (favTitle) {
      favTitle.textContent =
        "Material guardado";
    }
  }

  function buildRoutineUI() {
    const view =
      $("#view-rutina");

    const grid =
      $("#daysGrid");

    if (!view || !grid) return;

    let wrap =
      $(".v14-routine-wrap", view);

    if (!wrap) {
      wrap =
        document.createElement(
          "div"
        );

      wrap.className =
        "v14-routine-wrap";

      grid.before(wrap);
    }

    const currentDay =
      Math.min(
        PILOT_DAYS,
        getCurrentDay()
      );

    const completeCount =
      Array.from(
        { length: PILOT_DAYS },
        (_, index) =>
          index + 1
      ).filter(isComplete).length;

    const progress =
      Math.round(
        (
          Math.max(
            completeCount,
            currentDay - 1
          ) /
          MAX_DAYS
        ) *
          100
      );

    wrap.innerHTML = "";

    const progressCard =
      document.createElement(
        "div"
      );

    progressCard.className =
      "v14-progress-card";

    progressCard.innerHTML = `
      <div class="v14-progress-top">
        <div class="v14-progress-title">
          Día ${currentDay} de 30
        </div>
        <div class="v14-progress-value">
          ${progress}%
        </div>
      </div>

      <div class="v14-progress-track">
        <div
          class="v14-progress-fill"
          style="width:${progress}%"
        ></div>
      </div>

      <div class="v14-current-action">
        <div>
          <strong>
            Continuar día ${currentDay}
          </strong>
          <span>
            Acción del día
          </span>
        </div>

        <button
          type="button"
          data-v14-open-current
          aria-label="Continuar día"
        >
          ›
        </button>
      </div>
    `;

    progressCard
      .querySelector(
        "[data-v14-open-current]"
      )
      ?.addEventListener(
        "click",
        () => {
          openOriginalDay(
            currentDay
          );
        }
      );

    wrap.appendChild(
      progressCard
    );

    const weeks =
      [
        [1, 7],
        [8, 14],
        [15, 21],
        [22, 30]
      ];

    const weeksWrap =
      document.createElement(
        "div"
      );

    weeksWrap.className =
      "v14-weeks";

    weeks.forEach(
      ([start, end], index) => {
        const week =
          document.createElement(
            "div"
          );

        week.className =
          "v14-week";

        const days =
          [];

        for (
          let day = start;
          day <= end;
          day++
        ) {
          const available =
            day <= PILOT_DAYS;

          const complete =
            isComplete(day);

          const current =
            day === currentDay;

          let className =
            "v14-day";

          if (!available) {
            className +=
              " locked";
          } else if (complete) {
            className +=
              " complete";
          } else {
            className +=
              " available";
          }

          if (current) {
            className +=
              " current";
          }

          days.push(`
            <button
              class="${className}"
              type="button"
              data-v14-day="${day}"
              ${
                available
                  ? ""
                  : "disabled"
              }
            >
              ${day}
            </button>
          `);
        }

        week.innerHTML = `
          <div class="v14-week-head">
            <strong>
              ${
                index ===
                weeks.length - 1
                  ? "Semana 4+"
                  : `Semana ${index + 1}`
              }
            </strong>

            <span>
              Días ${start}–${end}
            </span>
          </div>

          <div class="v14-days-row">
            ${days.join("")}
          </div>
        `;

        week
          .querySelectorAll(
            "[data-v14-day]"
          )
          .forEach(button => {
            button.addEventListener(
              "click",
              () => {
                const day =
                  Number(
                    button.dataset
                      .v14Day
                  );

                openOriginalDay(day);
              }
            );
          });

        weeksWrap.appendChild(
          week
        );
      }
    );

    wrap.appendChild(
      weeksWrap
    );
  }

  function buildFavoriteFilters() {
    const view =
      $("#view-favoritos");

    const list =
      $("#favoritesList");

    if (!view || !list) return;

    let filters =
      $(".v14-filterbar", view);

    if (!filters) {
      filters =
        document.createElement(
          "div"
        );

      filters.className =
        "v14-filterbar";

      filters.innerHTML = `
        <button
          type="button"
          class="v14-filter active"
          data-v14-filter="all"
        >
          Todo
        </button>

        <button
          type="button"
          class="v14-filter"
          data-v14-filter="image"
        >
          Imágenes
        </button>

        <button
          type="button"
          class="v14-filter"
          data-v14-filter="video"
        >
          Videos
        </button>
      `;

      list.before(filters);

      filters
        .querySelectorAll(
          "[data-v14-filter]"
        )
        .forEach(button => {
          button.addEventListener(
            "click",
            () => {
              filters
                .querySelectorAll(
                  ".v14-filter"
                )
                .forEach(item =>
                  item.classList
                    .toggle(
                      "active",
                      item === button
                    )
                );

              filterFavorites(
                button.dataset
                  .v14Filter
              );
            }
          );
        });
    }
  }

  function filterFavorites(type) {
    $$(".favorite-item")
      .forEach(item => {
        const hasVideo =
          Boolean(
            item.querySelector(
              "video"
            )
          );

        const itemType =
          hasVideo
            ? "video"
            : "image";

        item.style.display =
          type === "all" ||
          type === itemType
            ? ""
            : "none";
      });
  }

  function updateBotTopics() {
    const intro =
      $("#view-bot .section-head p");

    if (intro) {
      intro.textContent =
        "Accedé rápido a herramientas de negocio, ventas, productos y primeros pasos.";
    }

    const bubble =
      $("#botThread .bubble.bot");

    if (bubble) {
      bubble.innerHTML =
        'Hola 👋 Podés consultarme por <b>comisiones</b>, <b>presentaciones</b>, <b>primeros pasos</b>, <b>ventas</b> o <b>productos</b>.';
    }

    const buttons =
      $$(".quick-commands button");

    const labels = [
      "Comisiones",
      "Presentaciones",
      "Primeros pasos",
      "Productos"
    ];

    buttons.forEach(
      (button, index) => {
        if (labels[index]) {
          button.textContent =
            labels[index];
        }
      }
    );
  }

  function redesignOnboarding() {
    const overlay =
      $("#onboardingOverlay");

    if (!overlay) return;

    const title =
      $(".onboarding-panel h2");

    const intro =
      $(".onboarding-intro");

    if (
      title &&
      title.textContent
        .includes("Challenge")
    ) {
      title.textContent =
        "Rutina 30 Días";
    }

    if (
      intro &&
      !intro.textContent
        .includes("Actualizá")
    ) {
      intro.textContent =
        "Comenzá en menos de 1 minuto";
    }

    const timezoneText =
      [...overlay
        .querySelectorAll(
          ".onboarding-field label"
        )]
        .find(label =>
          label.textContent
            .toLowerCase()
            .includes(
              "zona horaria"
            )
        );

    timezoneText
      ?.closest(
        ".onboarding-field"
      )
      ?.classList.add(
        "v14-hidden-timezone"
      );

    const nameLabel =
      overlay.querySelector(
        'label[for="onboardingName"]'
      );

    if (nameLabel) {
      nameLabel.textContent =
        "Tu nombre";
    }

    const countryLabel =
      overlay.querySelector(
        'label[for="onboardingCountry"]'
      );

    if (countryLabel) {
      countryLabel.textContent =
        "País o región";
    }

    const timeLabel =
      overlay.querySelector(
        'label[for="onboardingTime"]'
      );

    if (timeLabel) {
      timeLabel.textContent =
        "Hora preferida para recibir recordatorios";
    }

    const primary =
      $(".onboarding-actions .primary");

    if (
      primary &&
      primary.textContent
        .toLowerCase()
        .includes("challenge")
    ) {
      primary.textContent =
        "Comenzar";
    }
  }

  function observeOnboarding() {
    const observer =
      new MutationObserver(
        () => redesignOnboarding()
      );

    observer.observe(
      document.body,
      {
        childList:true,
        subtree:true
      }
    );

    redesignOnboarding();
  }

  function refresh() {
    installBell();
    updateNavLabels();
    buildRoutineUI();
    buildFavoriteFilters();
    updateBotTopics();
    redesignOnboarding();
  }

  function attachNavRefresh() {
    $$(".nav-btn")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            setTimeout(
              refresh,
              80
            );
          }
        );
      });
  }

  function observeDynamicAreas() {
    const targets = [
      $("#daysGrid"),
      $("#favoritesList")
    ].filter(Boolean);

    targets.forEach(target => {
      new MutationObserver(
        () => {
          if (
            target.id ===
            "daysGrid"
          ) {
            buildRoutineUI();
          }

          if (
            target.id ===
            "favoritesList"
          ) {
            buildFavoriteFilters();
          }
        }
      ).observe(
        target,
        {
          childList:true,
          subtree:true
        }
      );
    });
  }

  window.addEventListener(
    "routine-profile-synced",
    () => {
      setTimeout(
        refresh,
        60
      );
    }
  );

  window.addEventListener(
    "routine-profile-updated",
    () => {
      setTimeout(
        refresh,
        60
      );
    }
  );

  window.addEventListener(
    "DOMContentLoaded",
    () => {
      refresh();
      attachNavRefresh();
      observeDynamicAreas();
      observeOnboarding();

      setTimeout(
        refresh,
        500
      );
    }
  );
})();
