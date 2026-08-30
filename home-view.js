// Home screen DOM references and rendering live in this module.
const startDayBtn = document.getElementById("startDayBtn");
const openRoutineBtn = document.getElementById("openRoutineBtn");
const homeRoutineDay = document.getElementById("homeRoutineDay");
const homeRoutinePercent = document.getElementById("homeRoutinePercent");
const homeRoutineProgressFill = document.getElementById("homeRoutineProgressFill");
const homeRoutineContinueLabel = document.getElementById("homeRoutineContinueLabel");
const homeRoutineContinueIcon = document.querySelector(".home-routine-continue-icon");
const homeRoutineImage = document.getElementById("homeRoutineImage");

function renderHomeRoutineSummary(dayNumber, dayData) {
  const safeDayNumber = Number(dayNumber || 1);
  const progressValue = Math.min(
    100,
    Math.round((safeDayNumber / TOTAL_PROGRAM_DAYS) * 100)
  );

  if (homeRoutineDay) {
    homeRoutineDay.textContent = `Día ${safeDayNumber} de ${TOTAL_PROGRAM_DAYS}`;
  }

  if (homeRoutinePercent) {
    homeRoutinePercent.textContent = `${progressValue}%`;
  }

  if (homeRoutineProgressFill) {
    homeRoutineProgressFill.style.width = `${progressValue}%`;
  }

  if (homeRoutineContinueLabel) {
    homeRoutineContinueLabel.textContent = `Continuar Día ${safeDayNumber}`;
  }

  if (homeRoutineContinueIcon) {
    homeRoutineContinueIcon.innerHTML = ICONS.arrow;
  }

  if (homeRoutineImage) {
    const activeRoutine = getActiveRoutineConfig();
    const homeV3Assets = {
      "collagen-30": "assets/nu-collagen-cutout-v3.png",
      "lumispa-10": "assets/nu-lumispa-cutout-v3.png",
      "galvanicspa-10": "assets/nu-galvanic-cutout-v3.png",
      "wellspa-10": "assets/nu-wellspa-cutout-v3.png"
    };
    homeRoutineImage.src = homeV3Assets[activeRoutine.id] || activeRoutine.cover;
    homeRoutineImage.alt = activeRoutine.title;
  }
}

function setupHomeView() {
  const profile = getRoutineProfile();
  const name = profile?.name || profile?.firstName || "";
  const greeting = document.getElementById("homeGreeting");

  if (greeting) {
    const nameNode = greeting.querySelector(".home-greeting-name");
    if (nameNode) {
      nameNode.textContent = name;
    } else {
      greeting.textContent = name ? `Hola, ${name}` : "Hola";
    }
  }

  const bell = document.getElementById("homeBellBtn");
  if (!bell) return;

  bell.innerHTML = ICONS.bell;

  const state = getRoutineState();
  const lastSeenDay = Number(
    localStorage.getItem("notificationLastSeenDay") || "0"
  );

  bell.classList.toggle(
    "has-badge",
    state.currentDay > lastSeenDay
  );

  bell.onclick = openNotificationSettings;
}
