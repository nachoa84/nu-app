(() => {
  "use strict";

  // NU APP · CAPACITACIÓN DE VENTAS V102
  const COMMAND = "capacitacion ventas";
  const TOPIC_ID = "capacitacion-ventas";
  const TOPIC = {
    id: TOPIC_ID,
    title: "Capacitación de ventas",
    command: COMMAND,
    commands: ["capacitación de ventas", "ventas ok"],
    aliases: ["capa y venta", "capacitacion de venta", "mini capacitaciones de venta"],
    phrases: ["quiero ver la capacitación de ventas", "abrir capacitación de ventas"],
    keywords: ["ventas", "capacitación", "vender", "sistema de ventas"],
    blocks: [
      {
        type: "text",
        content: "Para que estés 100% list@ para romperla vendiendo, reunimos estas nueve mini capacitaciones. Entre todas duran aproximadamente una hora. Te sugerimos tomar nota de los consejos y luego ponerlos en práctica."
      },
      { type: "link", title: "1. Intro", description: "Video", resourceKind: "video", url: "https://youtu.be/uj5UBOWUjFM" },
      { type: "link", title: "2. Vender es servir", description: "Video", resourceKind: "video", url: "https://youtu.be/TIJ-lhHf3Lg" },
      { type: "link", title: "3. Una memotécnica", description: "Video", resourceKind: "video", url: "https://youtu.be/QgAkapP8ooY" },
      { type: "link", title: "4. Qué", description: "Video", resourceKind: "video", url: "https://youtu.be/cGETbZh67S8" },
      { type: "link", title: "5. A quién", description: "Video", resourceKind: "video", url: "https://youtu.be/5kfs0RNl0Os" },
      { type: "link", title: "6. Cómo", description: "Video", resourceKind: "video", url: "https://youtu.be/WVzw-N2AfFg" },
      { type: "link", title: "7. Pareto y set de trabajo", description: "Video", resourceKind: "video", url: "https://youtu.be/G_h8a7gVz1A" },
      { type: "link", title: "8. Técnicas para crear tu sistema", description: "Video", resourceKind: "video", url: "https://youtu.be/nQTFfm8bWcs" },
      { type: "link", title: "9. Plus", description: "Video", resourceKind: "video", url: "https://youtu.be/D_NznGhQ6O8" }
    ]
  };

  function installBotTopic() {
    const current = Array.isArray(window.BotContent) ? window.BotContent : [];
    const withoutPrevious = current.filter(topic => topic?.id !== TOPIC_ID);
    window.BotContent = [...withoutPrevious, TOPIC];
  }

  function connectCollagenDayFive() {
    if (typeof COLLAGEN_ROUTINE_DAYS === "undefined") return;
    const dayFive = COLLAGEN_ROUTINE_DAYS?.[5];
    const action = dayFive?.blocks?.find(block =>
      block?.type === "action" &&
      /capacitaci[oó]n\s+ventas/iu.test(String(block.label || ""))
    );
    if (!action) return;
    action.label = "Capacitación de ventas";
    action.botCommand = COMMAND;
    action.pending = false;
  }

  let trainingLaunchLocked = false;

  function lastBotMessageIsSalesTraining() {
    if (typeof loadBotConversation !== "function") return false;
    const messages = loadBotConversation();
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.role === "bot" && lastMessage?.topicId === TOPIC_ID;
  }

  function focusExistingSalesTraining() {
    if (typeof renderBotConversation === "function") {
      renderBotConversation({ scroll: true });
    }
    if (typeof scrollBotToEnd === "function") {
      window.setTimeout(() => scrollBotToEnd("smooth"), 40);
    }
  }

  function openRoutineTrainingInBot(block = {}) {
    const command = String(block.botCommand || COMMAND).trim();
    document.querySelector('.nav-btn[data-view="bot"]')?.click();

    // Evita dos ejecuciones provocadas por un doble toque mientras abre el Bot.
    if (trainingLaunchLocked) return;

    // Si la capacitación ya es la última respuesta, solo vuelve a mostrarla.
    if (lastBotMessageIsSalesTraining()) {
      focusExistingSalesTraining();
      if (navigator.vibrate) navigator.vibrate(8);
      return;
    }

    trainingLaunchLocked = true;
    window.setTimeout(() => {
      if (typeof botAsk === "function") {
        botAsk(command);
      } else {
        const input = document.getElementById("botInput");
        if (input) {
          input.value = command;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          if (typeof submitBotInput === "function") submitBotInput();
        }
      }
      window.setTimeout(() => { trainingLaunchLocked = false; }, 650);
    }, 90);

    if (navigator.vibrate) navigator.vibrate(8);
  }

  installBotTopic();
  connectCollagenDayFive();
  window.openRoutineTrainingInBot = openRoutineTrainingInBot;
})();
