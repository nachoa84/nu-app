const GUIDE_PROGRESS_KEY = "nuappGuideProgressV1";
let guideActiveStepId = null;

function readGuideProgress() {
  try {
    const stored = JSON.parse(localStorage.getItem(GUIDE_PROGRESS_KEY) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch (_) {
    return {};
  }
}

function writeGuideProgress(progress) {
  localStorage.setItem(GUIDE_PROGRESS_KEY, JSON.stringify(progress));
  updateGuideHomeSummary();
}

function guideProgressSummary() {
  const progress = readGuideProgress();
  const completed = GUIDE_STEPS.filter(step => progress[step.id] === true).length;
  const percent = Math.round((completed / GUIDE_STEPS.length) * 100);
  return { progress, completed, percent };
}

function updateGuideHomeSummary() {
  const { completed, percent } = guideProgressSummary();
  const total = GUIDE_STEPS.length;
  const isComplete = completed === total;
  const section = document.getElementById("homeGuideSection");
  const kicker = document.getElementById("homeGuideKicker");
  const description = document.getElementById("homeGuideDescription");
  const progressText = document.getElementById("homeGuideProgress");
  const progressFill = document.getElementById("homeGuideProgressFill");
  const percentText = document.getElementById("homeGuidePercent");
  const buttonLabel = document.getElementById("homeGuideButtonLabel");

  if (section) section.classList.toggle("is-complete", isComplete);
  if (kicker) kicker.textContent = isComplete ? "Guía completada" : "Empezá por acá";
  if (description) {
    description.textContent = isComplete
      ? "Volvé a consultar cualquier etapa cuando necesites repasar un recurso."
      : "Tus primeros pasos para comenzar con claridad y acompañamiento.";
  }
  if (progressText) progressText.textContent = `${completed} de ${total} etapas`;
  if (progressFill) progressFill.style.width = `${percent}%`;
  if (percentText) percentText.textContent = `${percent}%`;
  if (buttonLabel) {
    buttonLabel.textContent = completed === 0
      ? "Comenzar"
      : isComplete
        ? "Ver guía"
        : "Continuar";
  }
}

function guideResourceIcon(type) {
  if (type === "video") return ICONS.play;
  if (type === "meeting") return ICONS.calendar;
  if (type === "platform") return ICONS.folder;
  if (type === "tool") return ICONS.bot;
  return ICONS.arrow;
}

function guideStepStatusMarkup(done) {
  return done
    ? `<span class="guide-step-status is-done" aria-label="Completado">${ICONS.checkCircleFilled}</span>`
    : `<span class="guide-step-status" aria-hidden="true"><span></span></span>`;
}

function renderGuideOverview() {
  guideActiveStepId = null;
  const root = document.getElementById("guideRoot");
  const headerTitle = document.getElementById("guideHeaderTitle");
  const headerKicker = document.getElementById("guideHeaderKicker");
  const resetButton = document.getElementById("guideResetBtn");
  if (!root) return;

  const { progress, completed, percent } = guideProgressSummary();
  if (headerTitle) headerTitle.textContent = "Guía de inicio";
  if (headerKicker) headerKicker.textContent = "Primeros pasos";
  if (resetButton) resetButton.hidden = completed === 0;

  const nextStep = GUIDE_STEPS.find(step => progress[step.id] !== true) || GUIDE_STEPS[0];

  root.innerHTML = `
    <section class="guide-hero-card">
      <div class="guide-hero-brand" aria-hidden="true">
        <img src="assets/guide/logo-nu-comunidad-transparent.png" alt="" />
      </div>
      <div class="guide-hero-copy">
        <span>Tu recorrido inicial</span>
        <strong>${completed === GUIDE_STEPS.length ? "Guía completada" : "Avanzá a tu ritmo"}</strong>
        <p>${completed === 0
          ? "Todo lo necesario para empezar con claridad, confianza y acompañamiento."
          : completed === GUIDE_STEPS.length
            ? "Podés volver a cualquier etapa cuando necesites repasar un material."
            : `Tu próximo paso es ${nextStep.shortTitle}.`}
        </p>
      </div>
      <div class="guide-hero-progress-row">
        <div class="guide-hero-progress" aria-hidden="true"><span style="width:${percent}%"></span></div>
        <b>${percent}%</b>
      </div>
      <span class="guide-hero-count">${completed} de ${GUIDE_STEPS.length} etapas completadas</span>
      <button class="guide-primary-button" type="button" data-guide-open="${nextStep.id}">
        <span>${completed === GUIDE_STEPS.length ? "Repasar la guía" : completed === 0 ? "Empezar ahora" : "Continuar"}</span>
        ${ICONS.arrow}
      </button>
    </section>

    <section class="guide-section-block" aria-labelledby="guide-steps-title">
      <div class="guide-section-heading">
        <div>
          <span>Recorrido</span>
          <h2 id="guide-steps-title">Tus primeros pasos</h2>
        </div>
        <strong>${completed}/${GUIDE_STEPS.length}</strong>
      </div>

      <div class="guide-step-list">
        ${GUIDE_STEPS.map(step => {
          const done = progress[step.id] === true;
          return `
            <button class="guide-step-card${done ? " is-done" : ""}" type="button" data-guide-open="${step.id}">
              <span class="guide-step-number">${String(step.order).padStart(2, "0")}</span>
              <span class="guide-step-copy">
                <small>${step.kicker}</small>
                <strong>${step.title}</strong>
                <span>${step.summary}</span>
              </span>
              ${guideStepStatusMarkup(done)}
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;

  root.querySelectorAll("[data-guide-open]").forEach(button => {
    button.onclick = () => renderGuideDetail(button.dataset.guideOpen);
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderGuideDetail(stepId) {
  const step = GUIDE_STEPS.find(item => item.id === stepId);
  const root = document.getElementById("guideRoot");
  const headerTitle = document.getElementById("guideHeaderTitle");
  const headerKicker = document.getElementById("guideHeaderKicker");
  const resetButton = document.getElementById("guideResetBtn");
  if (!step || !root) return;

  guideActiveStepId = step.id;
  const progress = readGuideProgress();
  const done = progress[step.id] === true;
  const currentIndex = GUIDE_STEPS.findIndex(item => item.id === step.id);
  const nextStep = GUIDE_STEPS[currentIndex + 1] || null;

  if (headerTitle) headerTitle.textContent = step.title;
  if (headerKicker) headerKicker.textContent = step.kicker;
  if (resetButton) resetButton.hidden = true;

  root.innerHTML = `
    <article class="guide-detail">
      <div class="guide-detail-intro">
        <span class="guide-detail-number">${String(step.order).padStart(2, "0")}</span>
        <div>
          <small>${step.kicker}</small>
          <h2>${step.title}</h2>
          <p>${step.summary}</p>
        </div>
      </div>

      ${step.highlight ? `<blockquote class="guide-highlight">${step.highlight}</blockquote>` : ""}

      ${step.paragraphs?.length ? `
        <section class="guide-content-card">
          <h3>Lo importante</h3>
          <div class="guide-paragraphs">
            ${step.paragraphs.map(paragraph => `<p>${paragraph}</p>`).join("")}
          </div>
        </section>
      ` : ""}

      ${step.bullets?.length ? `
        <section class="guide-content-card">
          <h3>Tené presente</h3>
          <ul class="guide-check-list">
            ${step.bullets.map(item => `<li><span>${ICONS.check}</span><p>${item}</p></li>`).join("")}
          </ul>
        </section>
      ` : ""}

      ${step.schedules?.length ? `
        <section class="guide-content-card">
          <h3>Horarios</h3>
          <div class="guide-schedule-list">
            ${step.schedules.map(schedule => `
              <article class="guide-schedule-card">
                <strong>${schedule.title}</strong>
                <ul>${schedule.times.map(time => `<li>${time}</li>`).join("")}</ul>
              </article>
            `).join("")}
          </div>
          ${step.note ? `<p class="guide-note">${step.note}</p>` : ""}
        </section>
      ` : ""}

      ${step.gallery?.length ? `
        <section class="guide-content-card guide-gallery-card">
          <h3>Momentos de la comunidad</h3>
          <div class="guide-gallery" aria-label="Fotos de la comunidad">
            ${step.gallery.map((src, index) => `<img src="${src}" alt="Momento de la comunidad ${index + 1}" loading="lazy" />`).join("")}
          </div>
        </section>
      ` : ""}

      ${step.resources?.length ? `
        <section class="guide-content-card">
          <h3>Recursos</h3>
          <div class="guide-resource-list">
            ${step.resources.map(resource => `
              <a class="guide-resource-row" href="${resource.url}" target="_blank" rel="noopener noreferrer">
                <span class="guide-resource-icon">${guideResourceIcon(resource.type)}</span>
                <span>${resource.title}</span>
                <span class="guide-resource-arrow">${ICONS.arrow}</span>
              </a>
            `).join("")}
          </div>
        </section>
      ` : ""}

      <section class="guide-complete-card${done ? " is-done" : ""}">
        <div class="guide-complete-copy">
          <span>${done ? ICONS.checkCircleFilled : ICONS.check}</span>
          <div>
            <strong>${done ? "Etapa completada" : "¿Terminaste esta etapa?"}</strong>
            <p>${done ? "Tu avance quedó guardado en este dispositivo." : "Marcala para actualizar tu progreso en la guía."}</p>
          </div>
        </div>
        <button id="guideCompleteBtn" type="button">${done ? "Marcar como pendiente" : "Marcar como completada"}</button>
      </section>

      <div class="guide-detail-footer">
        <button id="guideIndexBtn" class="guide-secondary-button" type="button">Ver todas las etapas</button>
        ${nextStep ? (done
          ? `<button id="guideNextBtn" class="guide-primary-button" type="button"><span>Siguiente: ${nextStep.shortTitle}</span>${ICONS.arrow}</button>`
          : `<button id="guideNextBtn" class="guide-primary-button" type="button" disabled aria-disabled="true"><span>Marcá como completada para continuar</span>${ICONS.arrow}</button>`
        ) : ""}
      </div>
    </article>
  `;

  const completeButton = document.getElementById("guideCompleteBtn");
  if (completeButton) {
    completeButton.onclick = () => {
      const latest = readGuideProgress();
      latest[step.id] = !done;
      writeGuideProgress(latest);
      toast(!done ? "Etapa completada" : "Etapa marcada como pendiente", {
        type: !done ? "success" : "info"
      });
      renderGuideDetail(step.id);
    };
  }

  const indexButton = document.getElementById("guideIndexBtn");
  if (indexButton) indexButton.onclick = renderGuideOverview;

  const nextButton = document.getElementById("guideNextBtn");
  if (nextButton && nextStep && done) {
    nextButton.onclick = () => renderGuideDetail(nextStep.id);
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

function openGuideView() {
  renderGuideOverview();
  activateMainView("guia");
}

function resetGuideProgress() {
  showActionSheet({
    title: "¿Reiniciar la guía?",
    message: "Se eliminará el progreso de las 9 etapas en este dispositivo.",
    actionLabel: "Reiniciar progreso",
    onConfirm: () => {
      localStorage.removeItem(GUIDE_PROGRESS_KEY);
      updateGuideHomeSummary();
      renderGuideOverview();
      toast("Progreso reiniciado", { type: "success" });
    }
  });
}

function setupGuideView() {
  const openButton = document.getElementById("openGuideBtn");
  const openIcon = document.querySelector(".home-guide-open-icon");
  const backButton = document.getElementById("guideBackBtn");
  const resetButton = document.getElementById("guideResetBtn");

  if (openIcon) openIcon.innerHTML = ICONS.arrow;
  if (openButton) openButton.onclick = openGuideView;

  if (backButton) {
    backButton.innerHTML = ICONS.back;
    backButton.onclick = () => {
      if (guideActiveStepId) {
        renderGuideOverview();
        return;
      }
      activateMainView("hoy");
    };
  }

  if (resetButton) {
    resetButton.innerHTML = ICONS.trash;
    resetButton.onclick = resetGuideProgress;
  }

  updateGuideHomeSummary();
  renderGuideOverview();
}

setupGuideView();
