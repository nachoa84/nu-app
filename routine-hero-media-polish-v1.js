// Nu App · Routine hero media polish v1
// Shared visual normalization for product images used in routine day heroes.

(() => {
  "use strict";

  const SAMPLE_SIZE = 64;
  const TARGET_OCCUPANCY = 0.7;
  const MAX_SCALE = 1.42;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cornerBackground(data, size) {
    const points = [
      [1, 1], [size - 2, 1], [1, size - 2], [size - 2, size - 2],
      [Math.floor(size / 2), 1], [Math.floor(size / 2), size - 2]
    ];
    const sum = [0, 0, 0, 0];
    points.forEach(([x, y]) => {
      const offset = (y * size + x) * 4;
      sum[0] += data[offset];
      sum[1] += data[offset + 1];
      sum[2] += data[offset + 2];
      sum[3] += data[offset + 3];
    });
    return sum.map(value => value / points.length);
  }

  function analyzeImage(img) {
    if (!img.naturalWidth || !img.naturalHeight) return null;

    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    try {
      ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const pixels = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
      const bg = cornerBackground(pixels, SAMPLE_SIZE);
      const lightOpaqueBackground =
        bg[3] > 245 && bg[0] > 232 && bg[1] > 232 && bg[2] > 232;

      let minX = SAMPLE_SIZE;
      let minY = SAMPLE_SIZE;
      let maxX = -1;
      let maxY = -1;
      let foregroundCount = 0;

      for (let y = 0; y < SAMPLE_SIZE; y += 1) {
        for (let x = 0; x < SAMPLE_SIZE; x += 1) {
          const offset = (y * SAMPLE_SIZE + x) * 4;
          const r = pixels[offset];
          const g = pixels[offset + 1];
          const b = pixels[offset + 2];
          const a = pixels[offset + 3];

          let foreground;
          if (lightOpaqueBackground) {
            const distance = Math.sqrt(
              ((r - bg[0]) ** 2) +
              ((g - bg[1]) ** 2) +
              ((b - bg[2]) ** 2)
            );
            foreground = a > 24 && distance > 25;
          } else {
            foreground = a > 28;
          }

          if (!foreground) continue;
          foregroundCount += 1;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      if (foregroundCount < 10 || maxX < minX || maxY < minY) {
        return { lightOpaqueBackground, scale: 1 };
      }

      const widthRatio = (maxX - minX + 1) / SAMPLE_SIZE;
      const heightRatio = (maxY - minY + 1) / SAMPLE_SIZE;
      const occupancy = Math.max(widthRatio, heightRatio);
      const scale = occupancy > 0
        ? clamp(TARGET_OCCUPANCY / occupancy, 1, MAX_SCALE)
        : 1;

      return { lightOpaqueBackground, scale };
    } catch (_) {
      return null;
    }
  }

  function polishImage(img) {
    const srcKey = String(img.currentSrc || img.src || "");
    if (!srcKey || img.dataset.heroPolishSrc === srcKey) return;

    const apply = () => {
      const result = analyzeImage(img);
      if (!result) return;

      img.dataset.heroPolishSrc = srcKey;
      img.classList.toggle("has-light-opaque-bg", result.lightOpaqueBackground);
      img.style.setProperty("--routine-hero-product-scale", result.scale.toFixed(3));
    };

    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener("load", apply, { once: true });
  }

  function polishRoutineHeroMedia() {
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
