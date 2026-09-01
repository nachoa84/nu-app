// Nu App · Routine Q&A modal v1
// Exact source-pair presentation for the four approved routine FAQ blocks.

(() => {
  "use strict";

  const STYLE_ID = "nu-routine-qa-modal-v1";
  const MODAL_ID = "routineQaModal";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = "routine-qa-modal-v1.css?v=20260901-qa-v1";
    document.head.appendChild(link);
  }

  function activeRoutineId() {
    try {
      if (typeof getActiveRoutineId === "function") return getActiveRoutineId();
    } catch (_) {}
    return "collagen-30";
  }

  function activeDayNumber() {
    try {
      return Number(selectedDay || 0);
    } catch (_) {
      return 0;
    }
  }

  function qaSourceForActiveDay() {
    const routineId = activeRoutineId();
    const day = activeDayNumber();

    if (routineId === "collagen-30" && day === 8) {
      const sourceDay = typeof days !== "undefined" ? (days[8] || days["8"]) : null;
      const blocks = Array.isArray(sourceDay?.blocks) ? sourceDay.blocks : [];
      return {
        routineId,
        day,
        routineTitle: "Collagen+",
        blocks: blocks.slice(1, 5)
      };
    }

    if (day !== 5) return null;

    const titles = {
      "wellspa-10": "WellSpa iO",
      "galvanicspa-10": "Galvanic Spa",
      "lumispa-10": "LumiSpa"
    };
    if (!titles[routineId]) return null;

    let sourceDay = null;
    try {
      sourceDay = PRODUCT_ROUTINE_DAYS?.[routineId]?.days?.[5]
        || PRODUCT_ROUTINE_DAYS?.[routineId]?.days?.["5"];
    } catch (_) {}

    const qaBlock = sourceDay?.blocks?.find(block =>
      block?.type === "text" && /q\s*&\s*a\s*-?\s*preguntas\s+frecuentes/i.test(String(block.content || ""))
    );

    if (!qaBlock) return null;
    return {
      routineId,
      day,
      routineTitle: titles[routineId],
      blocks: [qaBlock]
    };
  }

  function stripDecorations(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[*_`~]+/g, "")
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\u20E3]/gu, "")
      .replace(/^[\s•·▪▫◦‣⁃→➜➤✔✓✅☑️🍊]+/u, "")
      .replace(/^[\s\-–—]+/, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function cleanQuestion(value) {
    let text = stripDecorations(value)
      .replace(/^q\s*&\s*a\s*-?\s*preguntas\s+frecuentes\s*/i, "")
      .trim();
    if (!text) return "";

    if (/^engorda$/i.test(text)) text = "Engorda?";
    text = text.replace(/\bespecifico\b/gi, "específico");
    if (!text.startsWith("¿")) text = `¿${text}`;
    if (!text.endsWith("?")) text = `${text}?`;
    return text;
  }

  function cleanAnswer(value) {
    let text = String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[*_`~]+/g, "")
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\u20E3]/gu, "")
      .replace(/^[\s\-–—]+/gm, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    text = text
      .replace(/\bSI!/g, "¡Sí!")
      .replace(/\bNO!/g, "¡No!")
      .replace(/^Si,\b/g, "Sí,")
      .replace(/^Si\b(?=\s|,|\.)/g, "Sí")
      .replace(/\bNuSkin\b/g, "Nu Skin")
      .replace(/\besta dado\b/gi, "está dado");

    if (text && !/[.!?…)]$/.test(text)) text += ".";
    return text;
  }

  function splitQuestionLine(rawLine) {
    let line = stripDecorations(rawLine);
    if (!line || /^q\s*&\s*a\b/i.test(line) || /^preguntas\s+frecuentes$/i.test(line)) return null;

    if (/^engorda$/i.test(line)) {
      return { question: "¿Engorda?", remainder: "" };
    }

    const hasQuestion = line.includes("?");
    const looksImportedQuestion = /^(?:es|tiene|hay|pueden)\b/i.test(line) && hasQuestion;
    if (!line.startsWith("¿") && !looksImportedQuestion) return null;

    let end = -1;
    if (line.startsWith("¿")) {
      const openings = (line.match(/¿/g) || []).length;
      if (openings > 1) end = line.lastIndexOf("?");
      else end = line.indexOf("?");
    } else {
      end = line.indexOf("?");
    }
    if (end < 0) return null;

    const question = cleanQuestion(line.slice(0, end + 1));
    const remainder = line.slice(end + 1).replace(/^[\s\-–—:]+/, "").trim();
    return { question, remainder };
  }

  function parseQaBlock(block) {
    const raw = String(block?.content || "").replace(/\r\n?/g, "\n");
    const lines = raw.split("\n");
    const pairs = [];
    let current = null;
    let pendingBreak = false;

    const flush = () => {
      if (!current?.question) return;
      current.answer = cleanAnswer(current.answer);
      if (current.answer) pairs.push(current);
      current = null;
      pendingBreak = false;
    };

    lines.forEach(rawLine => {
      const compact = stripDecorations(rawLine);
      if (!compact) {
        if (current?.answer) pendingBreak = true;
        return;
      }
      if (/^q\s*&\s*a\s*-?\s*preguntas\s+frecuentes$/i.test(compact)) return;

      const split = splitQuestionLine(rawLine);
      if (split) {
        flush();
        current = { question: split.question, answer: split.remainder || "", links: [] };
        pendingBreak = false;
        return;
      }

      if (!current) return;
      const answerLine = String(rawLine)
        .replace(/[*_`~]+/g, "")
        .replace(/^[\s•·▪▫◦‣⁃→➜➤✔✓✅☑️🍊\-–—]+/u, "")
        .trim();
      if (!answerLine) return;
      current.answer += `${current.answer ? (pendingBreak ? "\n\n" : " ") : ""}${answerLine}`;
      pendingBreak = false;
    });

    flush();
    if (pairs.length && Array.isArray(block?.links) && block.links.length) {
      pairs[pairs.length - 1].links = block.links.map(link => ({
        label: String(link.label || link.url || "Abrir recurso"),
        url: String(link.url || "")
      })).filter(link => link.url);
    }
    return pairs;
  }

  function currentQaData() {
    const source = qaSourceForActiveDay();
    if (!source?.blocks?.length) return null;
    const pairs = source.blocks.flatMap(parseQaBlock);
    if (!pairs.length) return null;
    return { ...source, pairs };
  }

  function keyText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9ñ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pairNeedle(value, fromEnd = false) {
    const words = keyText(value).split(" ").filter(Boolean);
    const chosen = fromEnd ? words.slice(-6) : words.slice(0, 6);
    return chosen.join(" ");
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "routine-qa-modal";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <button class="routine-qa-backdrop" type="button" aria-label="Cerrar preguntas frecuentes"></button>
      <section class="routine-qa-dialog" role="dialog" aria-modal="true" aria-labelledby="routineQaTitle">
        <header class="routine-qa-header">
          <div class="routine-qa-heading"><span id="routineQaContext">Rutina</span><h2 id="routineQaTitle">Preguntas frecuentes</h2></div>
          <button class="routine-qa-close" type="button" aria-label="Cerrar">×</button>
        </header>
        <div class="routine-qa-viewport"><div class="routine-qa-track"></div></div>
        <div class="routine-qa-controls">
          <button class="routine-qa-arrow routine-qa-prev" type="button" aria-label="Pregunta anterior">‹</button>
          <div class="routine-qa-dots-wrap"><span class="routine-qa-counter">1 de 1</span><div class="routine-qa-dots" aria-label="Preguntas"></div></div>
          <button class="routine-qa-arrow routine-qa-next" type="button" aria-label="Pregunta siguiente">›</button>
        </div>
      </section>
    `;
    document.body.appendChild(modal);

    const close = () => closeModal();
    modal.querySelector(".routine-qa-backdrop")?.addEventListener("click", close);
    modal.querySelector(".routine-qa-close")?.addEventListener("click", close);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !modal.hidden) closeModal();
    });
    return modal;
  }

  let activePairs = [];
  let activeIndex = 0;
  let lastFocus = null;

  function renderModalIndex(index) {
    const modal = ensureModal();
    activeIndex = Math.max(0, Math.min(activePairs.length - 1, index));
    const track = modal.querySelector(".routine-qa-track");
    const dots = Array.from(modal.querySelectorAll(".routine-qa-dot"));
    const counter = modal.querySelector(".routine-qa-counter");
    const prev = modal.querySelector(".routine-qa-prev");
    const next = modal.querySelector(".routine-qa-next");

    if (track) track.style.transform = `translateX(-${activeIndex * 100}%)`;
    dots.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === activeIndex));
    if (counter) counter.textContent = `${activeIndex + 1} de ${activePairs.length}`;
    if (prev) prev.disabled = activeIndex <= 0;
    if (next) next.disabled = activeIndex >= activePairs.length - 1;

    const currentSlide = modal.querySelectorAll(".routine-qa-slide")[activeIndex];
    currentSlide?.querySelector(".routine-qa-answer-wrap")?.scrollTo({ top: 0, behavior: "auto" });
  }

  function openModal(data, opener) {
    const modal = ensureModal();
    activePairs = data.pairs;
    activeIndex = 0;
    lastFocus = opener || document.activeElement;

    const context = modal.querySelector("#routineQaContext");
    const track = modal.querySelector(".routine-qa-track");
    const dots = modal.querySelector(".routine-qa-dots");
    const prev = modal.querySelector(".routine-qa-prev");
    const next = modal.querySelector(".routine-qa-next");

    if (context) context.textContent = `${data.routineTitle} · Día ${data.day}`;
    if (track) {
      track.innerHTML = "";
      data.pairs.forEach((pair, index) => {
        const slide = document.createElement("article");
        slide.className = "routine-qa-slide";
        slide.setAttribute("aria-label", `Pregunta ${index + 1} de ${data.pairs.length}`);

        const number = document.createElement("span");
        number.className = "routine-qa-slide-number";
        number.textContent = `Pregunta ${index + 1}`;

        const question = document.createElement("h3");
        question.className = "routine-qa-question";
        question.textContent = pair.question;

        const answerWrap = document.createElement("div");
        answerWrap.className = "routine-qa-answer-wrap";
        const answer = document.createElement("p");
        answer.className = "routine-qa-answer";
        answer.textContent = pair.answer;
        answerWrap.appendChild(answer);

        if (pair.links?.length) {
          const links = document.createElement("div");
          links.className = "routine-qa-links";
          pair.links.forEach(link => {
            const anchor = document.createElement("a");
            anchor.className = "routine-qa-link";
            anchor.href = link.url;
            anchor.target = "_blank";
            anchor.rel = "noopener";
            anchor.textContent = link.label;
            links.appendChild(anchor);
          });
          answerWrap.appendChild(links);
        }

        slide.append(number, question, answerWrap);
        track.appendChild(slide);
      });
    }

    if (dots) {
      dots.innerHTML = "";
      data.pairs.forEach((_, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "routine-qa-dot";
        dot.setAttribute("aria-label", `Ir a pregunta ${index + 1}`);
        dot.addEventListener("click", () => renderModalIndex(index));
        dots.appendChild(dot);
      });
    }

    if (prev) prev.onclick = () => renderModalIndex(activeIndex - 1);
    if (next) next.onclick = () => renderModalIndex(activeIndex + 1);

    const viewport = modal.querySelector(".routine-qa-viewport");
    if (viewport && !viewport.dataset.swipeReady) {
      viewport.dataset.swipeReady = "true";
      let startX = null;
      viewport.addEventListener("pointerdown", event => { startX = event.clientX; });
      viewport.addEventListener("pointerup", event => {
        if (startX == null) return;
        const delta = event.clientX - startX;
        startX = null;
        if (Math.abs(delta) < 45) return;
        renderModalIndex(delta < 0 ? activeIndex + 1 : activeIndex - 1);
      });
      viewport.addEventListener("pointercancel", () => { startX = null; });
    }

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("routine-qa-open");
    renderModalIndex(0);
    requestAnimationFrame(() => modal.querySelector(".routine-qa-close")?.focus());
  }

  function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("routine-qa-open");
    activePairs = [];
    activeIndex = 0;
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    lastFocus = null;
  }

  function prepareQaCarousel() {
    ensureStyles();
    const data = currentQaData();
    if (!data) return;

    const carousel = document.querySelector("#view-hoy .routine-content-carousel");
    if (!carousel) return;
    const key = `${data.routineId}:${data.day}:${data.pairs.length}`;
    if (carousel.dataset.qaModalPrepared === key) return;

    const track = carousel.querySelector(".routine-content-track");
    const dots = carousel.querySelector(".routine-content-dots");
    const slides = track ? Array.from(track.querySelectorAll(".routine-content-slide")) : [];
    if (!track || !slides.length || !dots) return;

    const firstNeedle = pairNeedle(data.pairs[0].question);
    const lastNeedle = pairNeedle(data.pairs[data.pairs.length - 1].answer, true);
    let firstIndex = slides.findIndex(slide => keyText(slide.textContent).includes(firstNeedle));
    let lastIndex = -1;
    for (let index = slides.length - 1; index >= 0; index -= 1) {
      if (keyText(slides[index].textContent).includes(lastNeedle)) {
        lastIndex = index;
        break;
      }
    }

    if (firstIndex < 0) {
      const fallbackNeedle = pairNeedle(data.pairs[0].answer);
      firstIndex = slides.findIndex(slide => keyText(slide.textContent).includes(fallbackNeedle));
    }
    if (lastIndex < firstIndex) {
      const lastQuestionNeedle = pairNeedle(data.pairs[data.pairs.length - 1].question);
      for (let index = slides.length - 1; index >= firstIndex; index -= 1) {
        if (keyText(slides[index].textContent).includes(lastQuestionNeedle)) {
          lastIndex = index;
          break;
        }
      }
    }
    if (firstIndex < 0 || lastIndex < firstIndex) return;

    const dotButtons = Array.from(dots.querySelectorAll(".routine-content-dot"));
    const firstSlide = slides[firstIndex];
    const firstCard = firstSlide.querySelector(".routine-content-card");
    if (!firstCard) return;

    firstCard.classList.remove("is-qa", "is-standard-copy", "is-short-copy", "is-long-copy");
    firstCard.classList.add("is-qa-launch");
    firstCard.innerHTML = "";

    const copy = document.createElement("div");
    copy.className = "routine-qa-launch-copy";
    const kicker = document.createElement("span");
    kicker.className = "routine-qa-launch-kicker";
    kicker.textContent = "Preguntas frecuentes";
    const title = document.createElement("h3");
    title.textContent = `Q&A · ${data.pairs.length} preguntas`;
    const description = document.createElement("p");
    description.textContent = "Revisá una pregunta y su respuesta por vez.";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "routine-qa-launch-button";
    button.textContent = "Ver preguntas";
    button.addEventListener("click", () => openModal(data, button));
    copy.append(kicker, title, description, button);
    firstCard.appendChild(copy);

    for (let index = lastIndex; index > firstIndex; index -= 1) {
      slides[index]?.remove();
      dotButtons[index]?.remove();
    }

    const controls = carousel.querySelector(".routine-content-controls");
    if (controls && controls.contains(dots)) controls.replaceWith(dots);
    carousel.dataset.controlsReady = "false";
    carousel.dataset.qaModalPrepared = key;

    requestAnimationFrame(() => {
      if (typeof ensureRoutineCarouselControls === "function") ensureRoutineCarouselControls();
    });
  }

  const root = document.getElementById("view-hoy") || document.body;
  const observer = new MutationObserver(() => requestAnimationFrame(prepareQaCarousel));
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

  document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(prepareQaCarousel), { once: true });
  requestAnimationFrame(prepareQaCarousel);
})();
