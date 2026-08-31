// Nu App · Routine content quality overrides v2
// Keeps daily-view.js focused while tightening imported copy, Q&A detection,
// responsive card balancing and inline-link handling across all routines.

(() => {
  "use strict";

  if (
    typeof normalizeRoutineText !== "function" ||
    typeof isQuestionAnswerContent !== "function" ||
    typeof estimateRoutineVisualLines !== "function" ||
    typeof balanceRoutinePool !== "function"
  ) {
    return;
  }

  const baseNormalizeRoutineText = normalizeRoutineText;
  const baseCreateBalancedTextCard = typeof createBalancedTextCard === "function"
    ? createBalancedTextCard
    : null;

  function normalizeVerifiedRoutineDefects(value) {
    return String(value || "")
      .replace(/<<inline-button-anchor:[^>]+>>/gi, "")
      .replace(/#30d[ií]ascollagen\+?/gi, "Collagen+")
      .replace(/#wellspa(?:io)?10/gi, "WellSpa iO")
      .replace(/#galvanicspa10/gi, "Galvanic Spa")
      .replace(/#10diasdelumispa(?:io)?/gi, "LumiSpa iO")
      .replace(/#10lumispa(?:io)?/gi, "LumiSpa iO")
      .replace(/#dia\s*(\d+)/gi, "Día $1")
      .replace(/\btestimonos\b/gi, "testimonios")
      .replace(/\bcon\s+las\s+cambios\b/gi, "con los cambios")
      .replace(/\bpersonailzada\b/gi, "personalizada")
      .replace(/\bruning\b/gi, "running")
      .replace(/\ba\s+traves\b/gi, "a través")
      .replace(/\blV\b/g, "IV")
      .replace(/\bestas\s+interesado\?/gi, "¿Estás interesado?")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  normalizeRoutineText = function routineQualityNormalize(value) {
    return normalizeVerifiedRoutineDefects(baseNormalizeRoutineText(value));
  };

  function cleanQaLine(value) {
    return String(value || "")
      .replace(/^[\s•·▪▫◦‣⁃→➜➤✔✓✅☑️\-–—]+/u, "")
      .trim();
  }

  function isQuestionLine(value) {
    const line = cleanQaLine(value);
    return Boolean(line) && /[?]/.test(line);
  }

  function isLikelyDirectAnswer(value) {
    const line = cleanQaLine(value).toLocaleLowerCase("es");
    if (!line || isQuestionLine(line) || line.length < 3) return false;

    return /^(?:sí\b|si\b|no\b|depende\b|desde\b|cuando\b|por\b|porque\b|puede\b|puedes\b|se\b|el\b|la\b|los\b|las\b|beauty\b|nu\s*skin\b|wellspa\b|galvanic\b|lumispa\b|recomendamos\b|aproximadamente\b|hasta\b|entre\b)/i.test(line);
  }

  isQuestionAnswerContent = function routineQualityIsQa(value) {
    const text = normalizeRoutineText(value);
    if (!text) return false;

    const explicitQa = /\bq\s*&\s*a\b|preguntas?\s+frecuentes|preguntas?\s+y\s+respuestas?|(?:^|\n)\s*pregunta\s*[:\-]|(?:^|\n)\s*respuesta\s*[:\-]/i.test(text);
    if (explicitQa) return true;

    const lines = text
      .split(/\n+/)
      .map(cleanQaLine)
      .filter(Boolean);

    let pairCount = 0;
    let firstPairIndex = Number.POSITIVE_INFINITY;

    for (let index = 0; index < lines.length - 1; index += 1) {
      if (!isQuestionLine(lines[index])) continue;
      if (!isLikelyDirectAnswer(lines[index + 1])) continue;
      pairCount += 1;
      firstPairIndex = Math.min(firstPairIndex, index);
    }

    return pairCount >= 2 || (pairCount === 1 && firstPairIndex <= 1);
  };

  function routineCharsPerLine(qa = false) {
    const viewportWidth = Math.max(
      320,
      Number(window.innerWidth || document.documentElement?.clientWidth || 390)
    );
    const visualWidth = Math.min(480, viewportWidth);

    if (visualWidth <= 360) return qa ? 39 : 34;
    if (visualWidth <= 430) return qa ? 43 : 38;
    return qa ? 49 : 44;
  }

  estimateRoutineVisualLines = function routineQualityVisualLines(value, qa = false) {
    const text = normalizeRoutineText(value);
    if (!text) return 0;

    const charsPerLine = routineCharsPerLine(qa);
    const paragraphs = text.split(/\n\s*\n/).filter(Boolean);

    return paragraphs.reduce((sum, paragraph) => {
      const explicitLines = paragraph.split(/\n+/).filter(Boolean);
      const lineCost = explicitLines.reduce((lineSum, line) => {
        return lineSum + Math.max(1, Math.ceil(line.length / charsPerLine));
      }, 0);
      return sum + lineCost + 0.4;
    }, 0);
  };

  function targetRoutineLines(qa = false) {
    return qa ? 8.2 : 6.3;
  }

  if (typeof textUnitsForBalance === "function") {
    balanceRoutinePool = function routineQualityBalancePool(pool, qa) {
      if (!pool.length) return [];

      const targetLines = targetRoutineLines(qa);
      const units = [];

      pool.forEach(block => {
        textUnitsForBalance(block.content, qa).forEach(content => {
          units.push({
            content,
            cost: estimateRoutineVisualLines(content, qa),
            block
          });
        });
      });

      if (!units.length) return [];

      const totalCost = units.reduce((sum, unit) => sum + unit.cost, 0);
      const partCount = Math.max(1, Math.ceil(totalCost / targetLines));
      const groups = [];
      let current = [];
      let currentCost = 0;
      let consumedCost = 0;

      const flush = () => {
        if (!current.length) return;
        const first = current[0].block;
        groups.push({
          ...first,
          content: current.map(unit => unit.content).join("\n\n")
        });
        consumedCost += currentCost;
        current = [];
        currentCost = 0;
      };

      units.forEach((unit, index) => {
        const groupsLeft = partCount - groups.length;
        const remainingCost = totalCost - consumedCost;
        const dynamicTarget = remainingCost / Math.max(groupsLeft, 1);
        const candidateCost = currentCost + unit.cost;
        const canStillCut = groups.length < partCount - 1;
        const unitsLeft = units.length - index;
        const groupsNeeded = partCount - groups.length;

        if (current.length && canStillCut && unitsLeft >= groupsNeeded) {
          const beforeDiff = Math.abs(dynamicTarget - currentCost);
          const afterDiff = Math.abs(dynamicTarget - candidateCost);
          if (beforeDiff <= afterDiff && currentCost >= dynamicTarget * 0.55) {
            flush();
          }
        }

        current.push(unit);
        currentCost += unit.cost;
      });

      flush();
      return groups;
    };
  }

  function labelForRoutineUrl(label, url) {
    const rawLabel = String(label || "").trim();
    const rawUrl = String(url || "").trim();
    const source = `${rawLabel} ${rawUrl}`.toLowerCase();

    if (/play\.google\.com/.test(source)) return "Google Play";
    if (/apps\.apple\.com|itunes\.apple\.com/.test(source)) return "App Store";
    if (/youtu\.be|youtube\.com/.test(source)) return "Ver tutorial";
    if (/drive\.google\.com/.test(source)) return "Google Drive";
    if (/canva\.com/.test(source)) return "Canva";
    if (/e-lactancia\.org/.test(source)) return "e-lactancia";
    if (/smugmug\.com/.test(source)) return "Galería";
    if (/\.pdf(?:$|[?#])/i.test(rawUrl)) return "Abrir documento";

    if (rawLabel && !/^https?:\/\//i.test(rawLabel)) return rawLabel;

    try {
      return new URL(rawUrl).hostname.replace(/^www\./, "");
    } catch (_) {
      return rawLabel || "Abrir recurso";
    }
  }

  function dedupeAndLabelLinks(links) {
    const seen = new Set();
    const normalized = [];

    (links || []).forEach(link => {
      const url = String(link?.url || "").trim();
      if (!url || seen.has(url)) return;
      seen.add(url);
      normalized.push({
        ...link,
        url,
        label: labelForRoutineUrl(link?.label, url)
      });
    });

    const counts = new Map();
    normalized.forEach(link => counts.set(link.label, (counts.get(link.label) || 0) + 1));
    const indexes = new Map();

    return normalized.map(link => {
      if ((counts.get(link.label) || 0) <= 1) return link;
      const next = (indexes.get(link.label) || 0) + 1;
      indexes.set(link.label, next);
      return { ...link, label: `${link.label} ${next}` };
    });
  }

  function extractInlineRoutineLinks(value) {
    let content = String(value || "");
    const links = [];

    content = content.replace(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
      (_, url, label) => {
        links.push({ label: String(label || "").replace(/<[^>]+>/g, "").trim(), url });
        return "";
      }
    );

    content = content.replace(
      /\[([^\]]+)\]\s*\((https?:\/\/[^)\s]+)\)/gi,
      (_, label, url) => {
        links.push({ label, url });
        return "";
      }
    );

    content = content.replace(
      /\[([^\]]+)\]\s*(https?:\/\/[^\s<]+)/gi,
      (_, label, url) => {
        links.push({ label, url });
        return "";
      }
    );

    content = content.replace(
      /(^|\n)\s*(https?:\/\/[^\s<]+)\s*(?=\n|$)/gi,
      (match, prefix, url) => {
        links.push({ label: "", url });
        return prefix || "";
      }
    );

    content = content
      .replace(/<<inline-button-anchor:[^>]+>>/gi, "")
      .replace(/(^|\n)\s*links?\s+de\s+descarga\s*:?\s*(?=\n|$)/gi, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return { content, links };
  }

  function enrichRoutineTextBlock(block) {
    const extracted = extractInlineRoutineLinks(block?.content || "");
    return {
      ...block,
      content: normalizeRoutineText(extracted.content),
      links: dedupeAndLabelLinks([...(block?.links || []), ...extracted.links])
    };
  }

  function linkCardHeading(links) {
    const sources = (links || []).map(link => String(link.url || "").toLowerCase());
    if (sources.some(url => /play\.google\.com|apps\.apple\.com|itunes\.apple\.com/.test(url))) {
      return "Links de descarga";
    }
    if (sources.some(url => /youtu\.be|youtube\.com/.test(url))) return "Tutoriales";
    return "Recursos";
  }

  function splitLinkedRoutineBlock(block, qa) {
    const withoutLinks = { ...block, links: [] };
    let groups = balanceRoutinePool([withoutLinks], qa);
    if (!groups.length) groups = [withoutLinks];

    const last = groups[groups.length - 1];
    const linkCost = block.links.length * 1.55;
    const target = targetRoutineLines(qa);
    const lastCost = estimateRoutineVisualLines(last.content, qa);

    if (lastCost + linkCost <= target * 1.08) {
      groups[groups.length - 1] = { ...last, links: block.links };
      return groups;
    }

    return [
      ...groups,
      {
        ...block,
        content: linkCardHeading(block.links),
        links: block.links
      }
    ];
  }

  splitRoutineTextBlocks = function routineQualitySplitBlocks(blocks) {
    const output = [];
    let pool = [];
    let poolQa = null;

    const flushPool = () => {
      if (!pool.length) return;
      output.push(...balanceRoutinePool(pool, Boolean(poolQa)));
      pool = [];
      poolQa = null;
    };

    (blocks || []).forEach(sourceBlock => {
      const block = enrichRoutineTextBlock(sourceBlock);
      if (!block.content && !block.links.length) return;

      const qa = isQuestionAnswerContent(block.content);

      if (block.links.length) {
        flushPool();
        output.push(...splitLinkedRoutineBlock(block, qa));
        return;
      }

      if (pool.length && qa !== poolQa) flushPool();
      if (!pool.length) poolQa = qa;
      pool.push(block);
    });

    flushPool();
    return output;
  };

  if (baseCreateBalancedTextCard) {
    createBalancedTextCard = function routineQualityCreateCard(block, options = {}) {
      return baseCreateBalancedTextCard(enrichRoutineTextBlock(block), options);
    };
  }
})();
