function createBlock(block) {
  if (block.type === "complete") {
    const card = document.createElement("div");
    card.className = "complete-card";

    const done = isDayComplete(selectedDay);

    const renderDoneState = ({ animate = false } = {}) => {
      card.classList.add("done");
      card.classList.toggle("just-completed", animate && !prefersReducedMotion());
      card.innerHTML = `
        <div class="complete-done-copy">
          <h3><span class="complete-done-inline-check" aria-hidden="true">${ICONS.check}</span><span>Hecho hoy</span></h3>
          <p>Registrado.</p>
        </div>
      `;
      if (animate) {
        setTimeout(() => card.classList.remove("just-completed"), 620);
      }
    };

    if (done) {
      renderDoneState();
      return card;
    }

    card.innerHTML = `
      <h3>¿Lo hiciste?</h3>
      <p>Registrá tu avance.</p>
    `;

    const btn = document.createElement("button");
    btn.className = "primary complete-day-btn";
    btn.innerHTML = `<span class="complete-action-check" aria-hidden="true">${ICONS.check}</span><span>Hoy lo hice</span>`;

    const helper = document.createElement("small");
    helper.className = "complete-helper";
    helper.textContent = "Solo registra tu avance";

    btn.onclick = () => {
      setDayComplete(selectedDay, true);
      if (navigator.vibrate) navigator.vibrate(12);
      renderDoneState({ animate: true });
      renderDays();

      if (window.BackendAPI && isBackendManagedRoutine()) {
        window.BackendAPI
          .completeDay(selectedDay)
          .catch(error => {
            console.warn(
              "No se pudo sincronizar el completado con el backend.",
              error
            );
          });
      }
    };

    card.append(btn, helper);
    return card;
  }
}
