// Nu App · Routine UI polish v1
// DOM polish for routine cards, carousel controls, materials and safe preview.

(() => {
  "use strict";

  function ensureRoutineLayoutStyles() {
    const id = "nu-routine-layout-final-v1";
    if (document.getElementById(id)) return;

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "routine-layout-final-v1.css?v=20260901-layout-v4";
    document.head.appendChild(link);
  }

  function ensureRoutineQaModule() {
    const id = "nu-routine-qa-modal-script-v2";
    if (document.getElementById(id)) return;

    const script = document.createElement("script");
    script.id = id;
    script.src = "routine-qa-modal-v2.js?v=20260901-qa-v4";
    script.defer = true;
    document.head.appendChild(script);
  }

  function ensureRoutineHeroMediaModule() {
    const id = "nu-routine-hero-media-polish-script-v2";
    if (document.getElementById(id)) return;

    const script = document.createElement("script");
    script.id = id;
    script.src = "routine-hero-media-polish-v2.js?v=20260901-hero-v3";
    script.defer = true;
    document.head.appendChild(script);
  }

  function installRoutineTextPolish() {
    if (
      typeof normalizeRoutineText !== "function" ||
      typeof createBalancedTextCard !== "function"
    ) {
      return false;
    }

    if (window.__nuRoutineTextPolishInstalled) return true;
    window.__nuRoutineTextPolishInstalled = true;

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
        .replace(/\ba\s+demás\b/gi, "Además")
        .replace(/\binstragram\b/gi, "Instagram")
        .replace(/\bwhatapp\b/gi, "WhatsApp")
        .replace(/\bpracticas\b/gi, "prácticas")
        .replace(/\bAqui esta\b/gi, "Aquí está")
        .replace(/\bAqui estan\b/gi, "Aquí están")
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

    const baseCreateBalancedTextCard = createBalancedTextCard;
    createBalancedTextCard = function routineUiCreateCard(block, options = {}) {
      const qa = typeof isQuestionAnswerContent === "function"
        ? isQuestionAnswerContent(block?.content || "")
        : false;
      const text = normalizeRoutineText(block?.content || "");
      const content = qa
        ? text.replace(/\n{3,}/g, "\n\n").replace(/\n\s*[-–—]\s*/g, "\n").trim()
        : text
            .split(/\n\s*\n/)
            .map(paragraph => paragraph.replace(/\n+/g, " ").replace(/[ \t]{2,}/g, " ").trim())
            .filter(Boolean)
            .join("\n\n")
            .replace(/\s+([,.;:!?])/g, "$1")
            .trim();

      const card = baseCreateBalancedTextCard({ ...block, content }, options);
      const hasLinks = Array.isArray(block?.links) && block.links.length > 0;
      const visualLines = typeof estimateRoutineVisualLines === "function"
        ? estimateRoutineVisualLines(content, qa)
        : Math.ceil(content.length / 38);

      const isShort = !qa && !hasLinks && visualLines <= 5.4;
      const isLong = !qa && (hasLinks || visualLines >= 6.2);

      card?.classList.toggle("is-short-copy", isShort);
      card?.classList.toggle("is-long-copy", isLong);
      return card;
    };

    return true;
  }

  function ensureRoutineCarouselControls() {
    document
      .querySelectorAll("#view-hoy .routine-content-carousel")
      .forEach(carousel => {
        const track = carousel.querySelector(".routine-content-track");
        const dots = carousel.querySelector(".routine-content-dots");
        const slides = Array.from(carousel.querySelectorAll(".routine-content-slide"));
        const dotButtons = dots ? Array.from(dots.querySelectorAll(".routine-content-dot")) : [];

        if (!track || !dots || slides.length <= 1 || dotButtons.length !== slides.length) return;

        const existingControls = carousel.querySelector(".routine-content-controls");
        const existingArrows = carousel.querySelectorAll(".routine-content-arrow");

        if (existingControls && existingArrows.length === 2) {
          carousel.dataset.controlsReady = "true";
          return;
        }

        if (existingControls && existingControls.contains(dots)) {
          existingControls.replaceWith(dots);
        }
        carousel.dataset.controlsReady = "false";

        const controls = document.createElement("div");
        controls.className = "routine-content-controls";

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

        dots.replaceWith(controls);
        controls.append(previous, dots, next);
        carousel.dataset.controlsReady = "true";

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
        dotButtons.forEach(dot => {
          dot.addEventListener("click", () => requestAnimationFrame(updateButtons));
        });

        requestAnimationFrame(updateButtons);
      });
  }

  function polishRoutineMaterials() {
    const dayView = document.querySelector("#view-hoy");
    if (!dayView) return;

    dayView.querySelectorAll(".materials-section .section-count").forEach(node => node.remove());
    dayView.querySelectorAll(".materials-section .resource-order").forEach(node => node.remove());

    dayView.querySelectorAll(".materials-section .resource-copy strong").forEach(node => {
      node.textContent = String(node.textContent || "")
        .replace(/^Historia\s+\d+\s+de\s+\d+$/i, "Material")
        .replace(/^Material\s+\d+\s+de\s+\d+$/i, "Material");
    });
  }

  function applyRoutineUiPolish() {
    ensureRoutineLayoutStyles();
    ensureRoutineQaModule();
    ensureRoutineHeroMediaModule();
    installRoutineTextPolish();
    ensureRoutineCarouselControls();
    polishRoutineMaterials();
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

  const routineUiRoot = document.getElementById("view-hoy") || document.body;
  const routineUiObserver = new MutationObserver(() => {
    requestAnimationFrame(applyRoutineUiPolish);
  });

  routineUiObserver.observe(routineUiRoot, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  document.addEventListener("DOMContentLoaded", () => {
    requestAnimationFrame(applyRoutineUiPolish);
  }, { once: true });

  requestAnimationFrame(applyRoutineUiPolish);
})();
