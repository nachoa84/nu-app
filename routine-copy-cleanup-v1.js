// Nu App · Routine legacy copy cleanup v1
// Removes ManyChat-era challenge/hashtag wrappers while preserving useful routine content.

(() => {
  "use strict";

  if (window.__nuRoutineLegacyCopyCleaned) return;
  window.__nuRoutineLegacyCopyCleaned = true;

  const PRODUCT_LABELS = [
    [/#?WELLSPAIO10/gi, "WellSpa iO"],
    [/#?GALVANICSPA10/gi, "Galvanic Spa"],
    [/#?10D[IÍ]ASDELUMISPA(?:IO)?/gi, "LumiSpa iO"],
    [/#?10D[IÍ]ASLUMISPA(?:IO)?/gi, "LumiSpa iO"],
    [/#?10LUMISPA(?:IO)?/gi, "LumiSpa iO"],
    [/#?30D[IÍ]ASCOLLAGEN\+?/gi, "Collagen+"]
  ];

  const LEGACY_INTRO_PATTERNS = [
    /te has suscrito satisfactoriamente/i,
    /list@ para desafiarte e iniciar el challenge/i
  ];

  function isLegacyIntroBlock(block) {
    if (!block || block.type !== "text") return false;
    const text = String(block.content || "");
    return LEGACY_INTRO_PATTERNS.some(pattern => pattern.test(text));
  }

  function removeLegacyLeadLines(value) {
    let text = String(value || "").replace(/\r\n/g, "\n");

    // Old bot greetings duplicated the day already shown by the app header/banner.
    text = text
      .replace(/^\s*\*?(?:Buenos d[ií]as|Buen d[ií]a|D[ií]a)\s*#?\d+\s*(?:del\s*)?(?:(?:Challenge|Reto)\s*)?(?:#?(?:WELLSPAIO10|GALVANICSPA10|10D[IÍ]ASDELUMISPA(?:IO)?|10D[IÍ]ASLUMISPA(?:IO)?|10LUMISPA(?:IO)?|30D[IÍ]ASCOLLAGEN\+?))?\*?\s*\n+/i, "")
      .replace(/^\s*#?(?:WELLSPAIO10|GALVANICSPA10|10D[IÍ]ASDELUMISPA(?:IO)?|10D[IÍ]ASLUMISPA(?:IO)?|10LUMISPA(?:IO)?|30D[IÍ]ASCOLLAGEN\+?)\s*\n+/i, "")
      .replace(/^\s*\*?COMENZAMOS[!?¡!🚀\s]*\*?\s*\n+/i, "")
      .replace(/^\s*\*?Bienvenid@[^\n]*(?:CHALLENGE|Challenge)[^\n]*\*?\s*\n+/i, "");

    return text;
  }

  function cleanLegacyCopy(value) {
    let text = removeLegacyLeadLines(value);

    // Phrases where simply deleting “Challenge” would leave bad grammar.
    text = text
      .replace(/Primera semana de Challenge cumplida!?/gi, "¡Primera semana cumplida!")
      .replace(/hasta finalizar el Challenge/gi, "hasta finalizar la rutina")
      .replace(/a mitad del Challenge/gi, "a mitad de la rutina")
      .replace(/mitad del Challenge/gi, "mitad de la rutina")
      .replace(/en la última semana del Challenge/gi, "en la última semana de la rutina")
      .replace(/última semana del Challenge/gi, "última semana de la rutina")
      .replace(/los últimos días del Challenge/gi, "los últimos días de la rutina")
      .replace(/últimos días del Challenge/gi, "últimos días de la rutina")
      .replace(/al final del Challenge\s*30D[ií]asCollagen\+?/gi, "al final de la rutina de Collagen+")
      .replace(/final del Challenge\s*30D[ií]asCollagen\+?/gi, "final de la rutina de Collagen+")
      .replace(/este\s+_?Challenge\s+#?(?:WELLSPAIO10|GALVANICSPA10)_?/gi, "esta rutina")
      .replace(/este\s+Challenge\s+de\s+Lumi\s*Spa/gi, "esta rutina de LumiSpa")
      .replace(/este\s+Challenge/gi, "esta rutina")
      .replace(/a este challenge/gi, "a esta rutina")
      .replace(/de este challenge/gi, "de esta rutina")
      .replace(/del Challenge/gi, "de la rutina")
      .replace(/el Challenge/gi, "la rutina")
      .replace(/Challenge/gi, "rutina");

    // Replace campaign hashtags with clean product names.
    PRODUCT_LABELS.forEach(([pattern, label]) => {
      text = text.replace(pattern, label);
    });

    // Remove remaining bot-style day markers without touching useful numeric content.
    text = text
      .replace(/#D[IÍ]A\s*(\d+)/gi, "Día $1")
      .replace(/^\s*#(\d{1,2})\s*\n+/gm, "")
      .replace(/Hoy hace una semana que iniciaste con el reto\s+(?:WellSpa iO|Galvanic Spa|LumiSpa iO)/gi, "Hoy hace una semana que iniciaste esta rutina")
      .replace(/Y aqu[ií] se termina el\s+(?:WellSpa iO|Galvanic Spa|LumiSpa iO)[!*\s]*/gi, "Y aquí termina esta rutina.")
      .replace(/Y aqu[ií] se termina\s+(?:WellSpa iO|Galvanic Spa|LumiSpa iO)[!*\s]*/gi, "Y aquí termina esta rutina.")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return text;
  }

  function cleanDay(day) {
    if (!day || typeof day !== "object") return;

    if (typeof day.title === "string") {
      day.title = cleanLegacyCopy(day.title);
    }

    if (!Array.isArray(day.blocks)) return;

    day.blocks = day.blocks
      .filter(block => !isLegacyIntroBlock(block))
      .map(block => {
        if (!block || block.type !== "text" || typeof block.content !== "string") return block;
        return { ...block, content: cleanLegacyCopy(block.content) };
      })
      .filter(block => block?.type !== "text" || String(block.content || "").trim());
  }

  function cleanAllRoutineData() {
    try {
      if (typeof days === "object" && days) {
        Object.values(days).forEach(cleanDay);
      }
    } catch (_) {}

    try {
      if (typeof PRODUCT_ROUTINE_DAYS === "object" && PRODUCT_ROUTINE_DAYS) {
        Object.values(PRODUCT_ROUTINE_DAYS).forEach(routine => {
          Object.values(routine?.days || {}).forEach(cleanDay);
        });
      }
    } catch (_) {}
  }

  function refreshOpenRoutine() {
    const view = document.getElementById("view-hoy");
    if (!view?.classList.contains("day-open")) return;

    requestAnimationFrame(() => {
      try {
        if (typeof renderStructuredDayDetail === "function") renderStructuredDayDetail();
        if (typeof renderSelectedDayHeader === "function") renderSelectedDayHeader();
      } catch (_) {}
    });
  }

  cleanAllRoutineData();
  refreshOpenRoutine();
})();
