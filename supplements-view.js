// Reuse native routine cards, media previews, favorites and product progress.
const SUPPLEMENT_GENERAL_ACTIONS = [
  ["Capacitate", "Conocé las características y los beneficios de cada suplemento para compartirlo con confianza."],
  ["Organizá tu tiempo", "Agendá un bloque de trabajo diario de 30 a 50 minutos para darle orden, prioridad y foco a tu negocio."],
  ["Armá tu lista", "Reuní al menos 100 contactos: profesionales de la salud y el bienestar, personas interesadas en nutrición, hábitos y autocuidado, emprendedores y potenciales aliados."],
  ["Descargá Stela", "Desde Stela, vinculada a tu oficina virtual, creá enlaces para clientes, miembros y afiliados de marca y consultá tus ventas y las de tu equipo."],
  ["Conversá y compartí", "Contactá al menos a 10 personas nuevas por día con entusiasmo. Publicá contenido en tus redes y estados de WhatsApp y revisá los tutoriales del producto."],
  ["Prepará tu energía", "Escuchá música, mové el cuerpo y prepará tu espacio de trabajo. Recordá que cada acción cuenta para alcanzar tus objetivos."]
];
function renderSupplements() {
  const root = document.getElementById("supplementsRoot");
  if (!root) return;
  root.replaceChildren();
  const general = document.createElement("section");
  general.className = "supplement-general";
  const entry = document.createElement("button");
  entry.type = "button";
  entry.className = "supplement-general-card";
  entry.innerHTML = '<span class="supplement-general-card-title">Acciones generales</span><span class="supplement-general-card-copy">Seis pasos para preparar tu negocio, organizar tu tiempo y compartir los suplementos.</span><span class="supplement-general-card-action">Explorar <span aria-hidden="true">›</span></span>';
  entry.onclick = () => activateMainView("suplementos-acciones");
  general.appendChild(entry);
  const products = document.createElement("section");
  products.className = "supplement-products";
  products.innerHTML = '<h2>Elegí tu suplemento</h2>';
  const cards = document.createElement("div");
  cards.className = "home-routines supplement-routines";
  Object.values(ROUTINE_CATALOG).filter(config => config.category === "supplements").forEach(config => {
    const card = createFixedRoutineCardV92b(config);
    const cover = config.cover;
    const image = card.querySelector(".home-routine-cover img");
    if (image && cover) image.src = cover;
    if (config.id === "colageno-10") {
      card.querySelector(".home-routine-heading h2").textContent = "Colágeno · 10 días";
    }
    const state = getRoutineCardStateV92b(config);
    let completed = 0;
    for (let day = 1; day <= config.totalDays; day++) {
      if (localStorage.getItem(window.NuProductStorage.completeKey(config.id, day)) === "1") completed++;
    }
    const percent = Math.round(completed / config.totalDays * 100);
    card.querySelector(".home-routine-day").textContent = `${completed} de ${config.totalDays} días completados`;
    card.querySelector(".home-routine-percent").textContent = `${percent}%`;
    card.querySelector(".home-routine-progress span").style.width = `${percent}%`;
    card.querySelector(".home-routine-continue span").textContent = completed === config.totalDays
      ? "Ver programa completado" : `Ver día ${Math.min(Number(state.currentDay || 1), config.totalDays)}`;
    cards.appendChild(card);
  });
  products.appendChild(cards);
  root.append(general, products);
  document.getElementById("supplementsBackBtn").onclick = () => activateMainView("hoy");
}

function renderSupplementActions() {
  const root = document.getElementById("supplementActionsRoot");
  if (!root) return;
  root.replaceChildren();
  const general = document.createElement("section");
  general.className = "supplement-actions";
  general.innerHTML = '<p class="supplement-actions-intro">La suplementación puede complementar un estilo de vida saludable. Conocer los productos y sus beneficios te ayuda a compartirlos con confianza y a desarrollar tu negocio.</p>';
  const list = document.createElement("ol");
  SUPPLEMENT_GENERAL_ACTIONS.forEach(([title, copy], index) => {
    const item = document.createElement("li");
    const heading = document.createElement("h3");
    heading.textContent = title;
    const body = document.createElement("p");
    body.textContent = copy;
    item.append(heading, body);
    if (index === 0) {
      const link = document.createElement("a");
      link.href = "https://drive.google.com/drive/folders/1iYUx1uup4qj84fKgSuCvbRlEBJdqc1HO";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Ver información de los suplementos";
      item.appendChild(link);
    }
    list.appendChild(item);
  });
  general.appendChild(list);
  root.appendChild(general);
  document.getElementById("supplementActionsBackBtn").onclick = () => activateMainView("suplementos");
}

// The home placeholder becomes the entrance to the section, without moving existing programs.
const createPharmanexCover = createUpcomingPharmanexCardV123;
createUpcomingPharmanexCardV123 = function createSupplementsEntry() {
  const card = createPharmanexCover();
  card.removeAttribute("aria-disabled");
  card.classList.remove("home-routine-card-placeholder");
  card.querySelector(".home-routine-day").remove();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "home-routine-continue";
  button.textContent = "Comenzar rutina";
  button.onclick = () => activateMainView("suplementos");
  card.querySelector(".home-routine-placeholder-label").replaceWith(button);
  return card;
};

function createSupplementCompletion() {
  const routineId = getActiveRoutineId();
  const day = Number(selectedDay);
  const totalDays = getActiveRoutineConfig().totalDays;
  const userId = getRoutineProfile()?.userId;
  const card = document.createElement("div");
  card.className = "complete-card supplement-completion";
  card.setAttribute("aria-live", "polite");
  const showDone = () => {
    card.classList.add("done");
    card.innerHTML = `<div class="complete-done-copy"><h3><span class="complete-done-inline-check" aria-hidden="true">${ICONS.check}</span><span>${day === totalDays ? "Programa completado" : "Día completado"}</span></h3><p>Tu avance quedó registrado.</p></div>`;
  };
  if (isDayComplete(day)) { showDone(); return card; }
  if (isPreviewMode && day > Number(getRoutineState().currentDay || 1)) {
    card.className = "supplement-preview-card";
    card.innerHTML = '<h3>Vista previa del día</h3><p>Podés recorrer estos materiales. El avance se habilita cuando llegue este día de la rutina.</p>';
    return card;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary complete-day-btn";
  button.textContent = "Marcar como hecho";
  const feedback = document.createElement("span");
  feedback.className = "supplement-completion-feedback";
  feedback.setAttribute("role", "status");
  button.onclick = async () => {
    button.disabled = true;
    feedback.textContent = "Guardando…";
    try {
      if (!window.BackendAPI || !userId) throw new Error("No se pudo guardar. Revisá tu conexión e intentá de nuevo.");
      const state = await window.BackendAPI.completeProductRoutineDay(routineId, day);
      if (state?.userId !== userId || !state.routines?.[routineId]?.completedDays?.includes(day)) {
        throw new Error("No se pudo confirmar el avance. Intentá de nuevo.");
      }
      // The API publishes canonical per-product state before returning. No optimistic writes.
      if (getRoutineProfile()?.userId !== userId) return;
      if (card.isConnected) showDone();
      renderSupplements();
      if (getActiveRoutineId() === routineId) renderDays();
    } catch (error) {
      feedback.textContent = error.message === "Rutina no válida."
        ? "El servidor todavía no reconoce este suplemento. Reiniciá Nu App y volvé a intentar."
        : error.message || "No se pudo guardar. Intentá de nuevo.";
      button.disabled = false;
    }
  };
  const action = document.createElement("div");
  action.className = "supplement-completion-action";
  action.append(button, feedback);
  card.appendChild(action);
  return card;
}

window.addEventListener("product-routines-state-updated", () => {
  if (document.body.dataset.activeView === "suplementos") renderSupplements();
});
