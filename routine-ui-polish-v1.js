// Nu App · Routine UI polish v1
// Presentation-only compatibility for routine cards and materials.

(() => {
  "use strict";

  if (
    typeof normalizeRoutineText !== "function" ||
    typeof createBalancedTextCard !== "function" ||
    typeof renderStructuredDayDetail !== "function"
  ) {
    return;
  }

  const baseNormalizeRoutineText = normalizeRoutineText;
  normalizeRoutineText = function routineUiNormalize(value) {
    return baseNormalizeRoutineText(value)
      .replace(/#30d[ií]ascollagen\+?/gi, "Collagen+")
      .replace(/#wellspa(?:io)?10/gi, "WellSpa iO")
      .replace(/#galvanicspa10/gi, "Galvanic Spa")
      .replace(/#10lumispa(?:io)?/gi, "LumiSpa iO")
      .replace(/#10diasdelumispa(?:io)?/gi, "LumiSpa iO")
      .replace(/#dia\s*(\d+)/gi, "Día $1")
      .replace(/\ba traves\b/gi, "a través")
      .replace(/\bwellnes\s*&\s*skincare\b/gi, "wellness & skincare")
      .replace(/\bperdida de brillo\b/gi, "pérdida de brillo")
      .replace(/\bAhora si\b/g, "Ahora sí")
      .replace(/\bSi, no tiene\b/g, "Sí, no tiene")
      .replace(/\bSi, de 2 años\b/g, "Sí, de 2 años")
      .replace(/\btu lo comercializas\b/gi, "tú lo comercializas")
      .replace(/\bpor esta nuevo comienzo\b/gi, "por este nuevo comienzo")
      .replace(/\bQué te parece\?/g, "¿Qué te parece?")
      .replace(/\bVas a aprovechar esta oferta\?/g, "¿Vas a aprovechar esta oferta?")
      .replace(/\bComo quieres abonarlo\?/g, "¿Cómo quieres abonarlo?")
      .replace(/\bCHALLENGE\b/g, "Challenge")
      .replace(/\bIMPORTANTE\b/g, "Importante")
      .replace(/\bCOMENZAMOS\?/g, "¿Comenzamos?")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ *\n */g, "\n")
      .trim();
  };

  function compactRoutineParagraphBreaks(value, preserveQa = false) {
    const text = normalizeRoutineText(value);
    if (!text) return "";

    if (preserveQa) {
      return text
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\n\s*[-–—]\s*/g, "\n")
        .trim();
    }

    return text
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.replace(/\n+/g, " ").replace(/[ \t]{2,}/g, " ").trim())
      .filter(Boolean)
      .join("\n\n")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
  }

  const baseCreateBalancedTextCard = createBalancedTextCard;
  createBalancedTextCard = function routineUiCreateCard(block, options = {}) {
    const qa = typeof isQuestionAnswerContent === "function"
      ? isQuestionAnswerContent(block?.content || "")
      : false;
    return baseCreateBalancedTextCard({
      ...block,
      content: compactRoutineParagraphBreaks(block?.content || "", qa)
    }, options);
  };

  function ensureRoutineCarouselControls() {
    const carousel = document.querySelector("#view-hoy.day-open .routine-content-carousel");
    if (!carousel || carousel.dataset.controlsReady === "true") return;

    const track = carousel.querySelector(".routine-content-track");
    const dots = carousel.querySelector(".routine-content-dots");
    const slides = Array.from(carousel.querySelectorAll(".routine-content-slide"));
    const dotButtons = dots ? Array.from(dots.querySelectorAll(".routine-content-dot")) : [];
    if (!track || !dots || slides.length <= 1 || !dotButtons.length) return;

    carousel.dataset.controlsReady = "true";
    const nav = document.createElement("div");
    nav.className = "routine-content-controls";

    const previous = document.createElement("button");
    previous.type = "button";
    previous.className = "routine-content-arrow routine-content-prev";
    previous.setAttribute("aria-label", "Contenido anterior");
    previous.textContent = "‹";

    const next = document.createElement("button");
    next.type = "button";
    next.className = "routine-content-arrow routine-content-next";
    next.setAttribute("aria-label", "Contenido siguiente");
    next.textContent = "›";

    dots.before(nav);
    nav.append(previous, dots, next);

    const activeIndex = () => {
      const current = dotButtons.findIndex(dot => dot.classList.contains("is-active"));
      if (current >= 0) return current;
      return Math.max(0, Math.min(
        slides.length - 1,
        Math.round(track.scrollLeft / Math.max(track.clientWidth, 1))
      ));
    };

    const updateButtons = () => {
      const index = activeIndex();
      previous.disabled = index <= 0;
      next.disabled = index >= slides.length - 1;
    };

    previous.addEventListener("click", () => {
      dotButtons[Math.max(0, activeIndex() - 1)]?.click();
      requestAnimationFrame(updateButtons);
    });
    next.addEventListener("click", () => {
      dotButtons[Math.min(slides.length - 1, activeIndex() + 1)]?.click();
      requestAnimationFrame(updateButtons);
    });
    track.addEventListener("scroll", updateButtons, { passive: true });
    dotButtons.forEach(dot => dot.addEventListener("click", () => requestAnimationFrame(updateButtons)));
    requestAnimationFrame(updateButtons);
  }

  function polishRoutineMaterials() {
    const dayView = document.querySelector("#view-hoy.day-open");
    if (!dayView) return;

    dayView.querySelectorAll(".materials-section .section-count").forEach(node => node.remove());
    dayView.querySelectorAll(".materials-section .resource-order").forEach(node => node.remove());
    dayView.querySelectorAll(".materials-section .resource-copy strong").forEach(node => {
      node.textContent = String(node.textContent || "")
        .replace(/^Historia\s+\d+\s+de\s+\d+$/i, "Material")
        .replace(/^Material\s+\d+\s+de\s+\d+$/i, "Material");
    });
  }

  function isRoutinePreviewMode() {
    const params = new URLSearchParams(window.location.search);
    return params.get("preview") === "1" || params.get("routinePreview") === "1";
  }

  document.addEventListener("click", event => {
    if (!isRoutinePreviewMode()) return;
    const progressAction = event.target.closest(".complete-day-btn, .app-checkin-btn");
    if (!progressAction) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (typeof toast === "function") {
      toast("Vista previa: el progreso no se modifica.", { type: "info" });
    }
  }, true);

  const baseRenderStructuredDayDetail = renderStructuredDayDetail;
  renderStructuredDayDetail = function routineUiRenderDay() {
    const result = baseRenderStructuredDayDetail.apply(this, arguments);
    requestAnimationFrame(() => {
      ensureRoutineCarouselControls();
      polishRoutineMaterials();
    });
    return result;
  };
})();
