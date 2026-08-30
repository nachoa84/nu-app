// Home screen DOM references and rendering live in this module.
const startDayBtn = document.getElementById("startDayBtn");
const openRoutineBtn = document.getElementById("openRoutineBtn");
const homeRoutineDay = document.getElementById("homeRoutineDay");
const homeRoutinePercent = document.getElementById("homeRoutinePercent");
const homeRoutineProgressFill = document.getElementById("homeRoutineProgressFill");
const homeRoutineContinueLabel = document.getElementById("homeRoutineContinueLabel");
const homeRoutineContinueIcon = document.querySelector(".home-routine-continue-icon");
const homeRoutineImage = document.getElementById("homeRoutineImage");
const homeGuideProgress = document.getElementById("homeGuideProgress");
const homeGuideCompletedCount = document.getElementById("homeGuideCompletedCount");

function syncHomeGuideCompletedCount() {
  if (!homeGuideProgress || !homeGuideCompletedCount) return;

  const completed = Number.parseInt(homeGuideProgress.textContent || "0", 10);
  homeGuideCompletedCount.textContent = Number.isFinite(completed)
    ? String(Math.min(9, Math.max(0, completed)))
    : "0";
}

function setupHomeGuideProgressSync() {
  if (!homeGuideProgress || homeGuideProgress.dataset.stageSyncReady === "true") return;

  homeGuideProgress.dataset.stageSyncReady = "true";
  syncHomeGuideCompletedCount();

  new MutationObserver(syncHomeGuideCompletedCount).observe(homeGuideProgress, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

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
    homeRoutineImage.src = getActiveRoutineConfig().cover;
  }
}

function ensureHomeNewsSection() {
  if (document.getElementById("homeNewsSection")) return;

  const routinesSection = document.querySelector("#view-hoy .home-routines-section");
  if (!routinesSection) return;

  const section = document.createElement("section");
  section.id = "homeNewsSection";
  section.className = "home-news-section";
  section.setAttribute("aria-labelledby", "homeNewsTitle");
  section.innerHTML = `
    <h2 id="homeNewsTitle">Novedades</h2>
    <article class="home-news-item">
      <span class="home-news-dot" aria-hidden="true"></span>
      <div class="home-news-copy">
        <strong>Nueva historia de Collagen+</strong>
        <span>Contenido reciente</span>
      </div>
    </article>
  `;

  routinesSection.insertAdjacentElement("afterend", section);
}

function setupHomeView() {
  const profile = getRoutineProfile();
  const name = profile?.name || profile?.firstName || "";
  const greeting = document.getElementById("homeGreeting");

  if (greeting) {
    greeting.textContent = name ? `Hola, ${name}` : "Hola";
  }

  setupHomeGuideProgressSync();
  ensureHomeNewsSection();

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
