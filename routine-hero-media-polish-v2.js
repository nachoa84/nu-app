// Nu App · Routine hero media polish v2
// Shared product-image cleanup for routine day heroes.

(() => {
  "use strict";

  const MAX_PROCESS_SIDE = 512;
  const TARGET_OCCUPANCY = 0.76;
  const MAX_SCALE = 1.55;
  const STYLE_ID = "nu-routine-hero-media-polish-v2";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #view-hoy.day-open .native-day-hero-media img {
        transform: scale(var(--routine-hero-product-scale, 1));
        transform-origin: center;
        transition: transform 180ms ease;
      }

      @media (prefers-reduced-motion: reduce) {
        #view-hoy.day-open .native-day-hero-media img {
          transition: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function colorDistance(r, g, b, bg) {
    return Math.sqrt(
      ((r - bg[0]) ** 2) +
      ((g - bg[1]) ** 2) +
      ((b - bg[2]) ** 2)
    );
  }

  function sampleCornerBackground(data, width, height) {
    const insetX = Math.max(1, Math.floor(width * 0.02));
    const insetY = Math.max(1, Math.floor(height * 0.02));
    const points = [
      [insetX, insetY],
      [width - 1 - insetX, insetY],
      [insetX, height - 1 - insetY],
      [width - 1 - insetX, height - 1 - insetY],
      [Math.floor(width / 2), insetY],
      [Math.floor(width / 2), height - 1 - insetY]
    ];

    const sum = [0, 0, 0, 0];
    points.forEach(([x, y]) => {
      const offset = (y * width + x) * 4;
      sum[0] += data[offset];
      sum[1] += data[offset + 1];
      sum[2] += data[offset + 2];
      sum[3] += data[offset + 3];
    });

    return sum.map(value => value / points.length);
  }

  function isLightNeutralBackground(bg) {
    const [r, g, b, a] = bg;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luminance = (r + g + b) / 3;
    return a > 235 && luminance > 210 && (max - min) < 28;
  }

  function buildWorkingCanvas(img) {
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    if (!naturalWidth || !naturalHeight) return null;

    const scale = Math.min(1, MAX_PROCESS_SIDE / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { canvas, ctx, width, height };
  }

  function removeEdgeConnectedBackground(imageData, width, height, bg) {
    const data = imageData.data;
    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const threshold = 58;
    const eligible = index => {
      const offset = index * 4;
      const a = data[offset + 3];
      if (a < 18) return true;
      return colorDistance(data[offset], data[offset + 1], data[offset + 2], bg) <= threshold;
    };

    const push = index => {
      if (index < 0 || index >= total || visited[index] || !eligible(index)) return;
      visited[index] = 1;
      queue[tail++] = index;
    };

    for (let x = 0; x < width; x += 1) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y += 1) {
      push(y * width);
      push(y * width + width - 1);
    }

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) push(index - 1);
      if (x + 1 < width) push(index + 1);
      if (y > 0) push(index - width);
      if (y + 1 < height) push(index + width);
    }

    let removed = 0;
    for (let index = 0; index < total; index += 1) {
      if (!visited[index]) continue;
      data[index * 4 + 3] = 0;
      removed += 1;
    }

    return removed / total;
  }

  function foregroundBounds(data, width, height) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha <= 24) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) return null;
    return { minX, minY, maxX, maxY };
  }

  function occupancyScale(bounds, width, height) {
    if (!bounds) return 1;
    const widthRatio = (bounds.maxX - bounds.minX + 1) / width;
    const heightRatio = (bounds.maxY - bounds.minY + 1) / height;
    const occupancy = Math.max(widthRatio, heightRatio);
    if (!occupancy) return 1;
    return clamp(TARGET_OCCUPANCY / occupancy, 1, MAX_SCALE);
  }

  function processImage(img, sourceKey) {
    const work = buildWorkingCanvas(img);
    if (!work) return;

    try {
      const { canvas, ctx, width, height } = work;
      const imageData = ctx.getImageData(0, 0, width, height);
      const bg = sampleCornerBackground(imageData.data, width, height);
      const hasLightBackground = isLightNeutralBackground(bg);

      let removedRatio = 0;
      if (hasLightBackground) {
        removedRatio = removeEdgeConnectedBackground(imageData, width, height, bg);
        if (removedRatio > 0.05) {
          ctx.putImageData(imageData, 0, 0);
        }
      }

      const finalPixels = removedRatio > 0.05
        ? imageData.data
        : ctx.getImageData(0, 0, width, height).data;
      const bounds = foregroundBounds(finalPixels, width, height);
      const scale = occupancyScale(bounds, width, height);

      img.dataset.heroPolishSource = sourceKey;
      img.dataset.heroPolished = "true";
      img.style.setProperty("--routine-hero-product-scale", scale.toFixed(3));

      if (removedRatio > 0.05) {
        img.src = canvas.toDataURL("image/png");
      }
    } catch (_) {
      img.dataset.heroPolishSource = sourceKey;
      img.dataset.heroPolished = "true";
    }
  }

  function polishImage(img) {
    if (img.dataset.heroPolished === "true") return;

    const sourceKey = String(img.currentSrc || img.src || "");
    if (!sourceKey || sourceKey.startsWith("data:")) return;

    const apply = () => processImage(img, sourceKey);
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener("load", apply, { once: true });
  }

  function polishRoutineHeroMedia() {
    ensureStyles();
    document
      .querySelectorAll("#view-hoy.day-open .native-day-hero-media img")
      .forEach(polishImage);
  }

  let queued = false;
  function queuePolish() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      polishRoutineHeroMedia();
    });
  }

  const root = document.getElementById("view-hoy") || document.body;
  const observer = new MutationObserver(queuePolish);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "src"]
  });

  document.addEventListener("DOMContentLoaded", queuePolish, { once: true });
  queuePolish();
})();
