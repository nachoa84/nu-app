// Rutina 30 Días · Media preview module
// Extraído de app.js sin cambiar comportamiento.
// Mantiene el estado interno del visor y expone las mismas funciones globales
// para que app.js, favorites.js y bot.js sigan usándolas como antes.

let previewState = { items: [], index: 0, day: 1 };
let activePreviewVideo = null;

// Cada render invalida callbacks de imágenes anteriores.
// No bloquea la navegación: solo evita que una carga vieja toque la UI actual.
let previewRenderToken = 0;

// Mantiene en memoria únicamente los vecinos inmediatos del slide actual.
// Los videos no se precargan: solo su poster.
const previewNeighborCache = new Map();

function normalizePreviewItem(item) {
  return {
    src: item.src,
    label: item.label || "Material",
    mediaType: item.mediaType || "image",
    poster: item.poster || null,
    favorite: item.favorite !== false,
    shareable: item.shareable !== false,
    url: item.url || null
  };
}

function disposePreviewVideoElement(video) {
  if (!video) return;

  video.dataset.previewDisposed = "1";

  try {
    video.pause();
  } catch (_) {}

  try {
    video.removeAttribute("src");
    video.load();
  } catch (_) {}

  if (video.isConnected) {
    video.remove();
  }

  if (activePreviewVideo === video) {
    activePreviewVideo = null;
  }
}

function destroyActivePreviewVideo() {
  const stage = document.getElementById("previewStage");
  const video = activePreviewVideo || stage?.querySelector("video.preview-video-media");

  if (video) {
    disposePreviewVideoElement(video);
  }

  const shell = stage?.querySelector(".preview-video-shell");
  if (shell) {
    shell.classList.remove("is-starting", "is-playing", "is-error");

    const playButton = shell.querySelector(".preview-video-play");
    if (playButton) {
      playButton.hidden = false;
      playButton.disabled = false;
      playButton.classList.remove("is-starting");
    }
  }
}

function closeMediaPreview(direction = "right") {
  const modal = document.getElementById("mediaPreview");
  const shell = document.getElementById("mediaPreviewShell");
  if (!modal || modal.hidden) return;

  // Cortamos reproducción/red inmediatamente al cerrar el visor.
  destroyActivePreviewVideo();

  // Invalida callbacks de carga de la story que se está cerrando.
  previewRenderToken += 1;
  previewNeighborCache.clear();

  if (shell && !prefersReducedMotion()) {
    shell.style.transition = "transform 0.22s cubic-bezier(.4,0,.2,1), opacity .18s ease";
    shell.style.opacity = "0.86";
    shell.style.transform = direction === "down" ? "translateY(100%)" : "translateX(100%)";
  }

  modal.classList.add("is-closing");

  setTimeout(() => {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("is-closing");
    document.body.classList.remove("preview-open");
    document.getElementById("previewStage").innerHTML = "";
    if (shell) {
      shell.style.transition = "";
      shell.style.transform = "";
      shell.style.opacity = "";
    }
  }, shell && !prefersReducedMotion() ? 205 : 0);
}

function renderMediaPreview({ enterFrom = null, favoritePulse = false } = {}) {
  const modal = document.getElementById("mediaPreview");
  if (!modal || !previewState.items.length) return;

  const renderToken = ++previewRenderToken;
  const item = previewState.items[previewState.index];
  const stage = document.getElementById("previewStage");
  const counter = document.getElementById("previewCounter");
  const segments = document.getElementById("previewSegments");
  const title = document.getElementById("previewTitle");
  const type = document.getElementById("previewType");
  const saveTop = document.getElementById("previewTopSaveBtn");
  const save = document.getElementById("previewSaveBtn");
  const share = document.getElementById("previewShareBtn");
  const prev = document.getElementById("previewPrevBtn");
  const next = document.getElementById("previewNextBtn");

  counter.textContent = `${previewState.index + 1} de ${previewState.items.length}`;

  if (segments) {
    segments.innerHTML = previewState.items
      .map((_, segmentIndex) => {
        const stateClass = segmentIndex < previewState.index
          ? " is-past"
          : segmentIndex === previewState.index
            ? " is-current"
            : "";
        return `<span class="preview-segment${stateClass}"></span>`;
      })
      .join("");
  }

  title.textContent = item.label;
  type.textContent = item.mediaType === "video" ? "Video" : "Imagen";

  // Destruir completamente cualquier reproductor de la story anterior.
  destroyActivePreviewVideo();

  stage.classList.remove(
    "preview-enter-left",
    "preview-enter-right"
  );
  stage.style.transition = "";
  stage.style.transform = "";
  stage.style.opacity = "";
  stage.innerHTML = "";
  stage.classList.add("is-loading");

  const finishPreviewLoad = () => {
    if (renderToken !== previewRenderToken) return;
    stage.classList.remove("is-loading");
  };

  const failPreviewLoad = () => {
    if (renderToken !== previewRenderToken) return;

    stage.classList.remove("is-loading");
    stage.innerHTML = `
      <div class="preview-load-error">
        <strong>No se pudo cargar este archivo</strong>
        <span>Revisá tu conexión e intentá nuevamente.</span>
      </div>
    `;
  };

  if (item.mediaType === "video") {
    // V35.15 · Arquitectura on-demand:
    // antes del tap NO existe ningún <video> en el DOM.
    const shell = document.createElement("div");
    shell.className = "preview-video-shell";

    if (item.poster) {
      const posterImage = document.createElement("img");
      posterImage.className = "preview-video-poster";
      posterImage.alt = "";
      posterImage.draggable = false;
      posterImage.setAttribute("draggable", "false");
      posterImage.decoding = "async";
      posterImage.src = item.poster;

      posterImage.addEventListener("error", () => {
        if (renderToken !== previewRenderToken) return;

        // El Play sigue disponible aunque el poster falle.
        posterImage.hidden = true;
        shell.classList.add("is-error");
      }, { once: true });

      shell.appendChild(posterImage);
    } else {
      shell.classList.add("is-error");
    }

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "preview-video-play";
    playButton.setAttribute("aria-label", "Reproducir video");
    playButton.hidden = false;
    playButton.disabled = false;
    playButton.innerHTML = `
      <span class="preview-video-play-triangle" aria-hidden="true"></span>
    `;

    const playLayer = document.createElement("div");
    playLayer.className = "preview-video-play-layer";
    playLayer.appendChild(playButton);

    shell.appendChild(playLayer);
    stage.appendChild(shell);

    // La UI inicial ya está lista aunque el WebP todavía esté decodificando.
    finishPreviewLoad();

    playButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      if (playButton.disabled || activePreviewVideo) return;

      playButton.disabled = true;
      playButton.classList.add("is-starting");
      shell.classList.remove("is-error");
      shell.classList.add("is-starting");

      // IMPORTANTE: crear, insertar y llamar play() dentro del mismo gesto.
      // No hay await/fetch antes de play().
      const video = document.createElement("video");
      video.className = "preview-video-media";
      video.controls = false;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.preload = "none";
      video.draggable = false;
      video.setAttribute("draggable", "false");
      video.src = item.src;

      activePreviewVideo = video;
      shell.insertBefore(video, shell.firstChild);

      let failureHandled = false;

      const restoreReadyState = () => {
        shell.classList.remove("is-starting", "is-playing");
        playButton.hidden = false;
        playButton.disabled = false;
        playButton.classList.remove("is-starting");
      };

      const handleRealFailure = error => {
        if (failureHandled) return;

        // Si el visor/story ya destruyó este video, es una cancelación normal.
        if (video.dataset.previewDisposed === "1" || !video.isConnected) return;

        // AbortError al cambiar/cerrar story NO es un error para el usuario.
        if (error?.name === "AbortError") {
          disposePreviewVideoElement(video);
          restoreReadyState();
          return;
        }

        failureHandled = true;
        disposePreviewVideoElement(video);
        shell.classList.add("is-error");
        restoreReadyState();

        console.warn("No se pudo iniciar el video:", error);
        toast("No se pudo reproducir el video.", {
          type: "error",
          duration: 3200
        });
      };

      video.addEventListener("playing", () => {
        if (video.dataset.previewDisposed === "1") return;

        shell.classList.remove("is-starting", "is-error");
        shell.classList.add("is-playing");
        playButton.hidden = true;
        playButton.disabled = false;
        playButton.classList.remove("is-starting");

        // Los controles nativos aparecen recién con reproducción real.
        video.controls = true;
      });

      video.addEventListener("ended", () => {
        if (video.dataset.previewDisposed === "1") return;

        disposePreviewVideoElement(video);
        restoreReadyState();
      });

      video.addEventListener("error", () => {
        if (video.dataset.previewDisposed === "1") return;
        handleRealFailure(video.error || new Error("Error cargando el video"));
      }, { once: true });

      let playPromise;
      try {
        playPromise = video.play();
      } catch (error) {
        handleRealFailure(error);
        return;
      }

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(handleRealFailure);
      }
    });
  } else {
    const media = document.createElement("img");
    media.draggable = false;
    media.setAttribute("draggable", "false");
    media.alt = item.label;
    media.addEventListener("load", finishPreviewLoad, { once: true });
    media.addEventListener("error", failPreviewLoad, { once: true });
    media.src = item.src;
    stage.appendChild(media);

    if (media.complete && media.naturalWidth > 0) {
      finishPreviewLoad();
    }
  }

  if (enterFrom && !prefersReducedMotion()) {
    // Reinicia una entrada muy corta incluso con taps consecutivos.
    void stage.offsetWidth;
    stage.classList.add(
      enterFrom === "left"
        ? "preview-enter-left"
        : "preview-enter-right"
    );
  }

  warmPreviewNeighbors();

  const saved = isFavorite(item.src, previewState.day);
  saveTop.hidden = true;
  saveTop.setAttribute("aria-hidden", "true");
  save.dataset.favoriteSrc = item.src;
  save.dataset.favoriteDay = String(previewState.day);
  save.classList.toggle("is-saved", saved);

  save.innerHTML = `${saved ? ICONS.bookmarkFilled : ICONS.bookmark}<span>${saved ? "Guardado" : "Guardar"}</span>`;
  save.className = `preview-save-action${saved ? " is-saved" : ""}`;

  const toggleFavorite = () => {
    saveFavorite(
      item.src,
      item.label,
      item.mediaType,
      previewState.day,
      item.url
    );
    const nowSaved = isFavorite(item.src, previewState.day);
    renderMediaPreview({ favoritePulse: true });
    animateFavoriteTargets(item.src, previewState.day, nowSaved);
  };

  saveTop.onclick = null;
  save.onclick = toggleFavorite;

  if (favoritePulse && !prefersReducedMotion()) {
    save.classList.add("favorite-pop");
    setTimeout(() => {
      save.classList.remove("favorite-pop");
    }, 360);
  }

  share.hidden = !item.shareable;
  share.innerHTML = `${ICONS.share}<span>Compartir</span>`;
  share.onclick = () => shareAsset(item.src, item.label, item.mediaType, share);

  prev.innerHTML = ICONS.back;
  next.innerHTML = ICONS.arrow;
  prev.disabled = previewState.index === 0;
  next.disabled = previewState.index === previewState.items.length - 1;

  modal.hidden = false;
  modal.classList.remove("is-closing");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("preview-open");
}

function previewWarmSource(item) {
  if (!item) return null;
  return item.mediaType === "video" ? item.poster : item.src;
}

function warmPreviewNeighbors() {
  const indexes = [
    previewState.index - 1,
    previewState.index + 1
  ];

  const wantedSources = new Set();

  indexes.forEach(index => {
    if (
      index < 0 ||
      index >= previewState.items.length
    ) {
      return;
    }

    const source =
      previewWarmSource(
        previewState.items[index]
      );

    if (!source) return;

    wantedSources.add(source);

    if (
      previewNeighborCache.has(source)
    ) {
      return;
    }

    const image = new Image();
    image.decoding = "async";
    image.src = source;

    previewNeighborCache.set(
      source,
      image
    );
  });

  // Solo retenemos los vecinos del slide actual.
  for (
    const source of
    previewNeighborCache.keys()
  ) {
    if (!wantedSources.has(source)) {
      previewNeighborCache.delete(source);
    }
  }
}

function navigateMediaPreview(
  delta,
  { animate = true } = {}
) {
  const direction =
    delta > 0 ? 1 : -1;

  const nextIndex =
    previewState.index + direction;

  if (
    nextIndex < 0 ||
    nextIndex >= previewState.items.length
  ) {
    return;
  }

  // Navegación optimista:
  // el índice y el contador cambian en el mismo gesto.
  previewState.index = nextIndex;

  // Si había un video activo, se corta antes de pintar la nueva story.
  destroyActivePreviewVideo();

  renderMediaPreview({
    enterFrom:
      animate && !prefersReducedMotion()
        ? direction > 0
          ? "right"
          : "left"
        : null
  });

  if (navigator.vibrate) {
    navigator.vibrate(5);
  }
}

function openMediaPreview(items, index = 0, day = selectedDay) {
  const normalized = items
    .filter(item => item && item.src && item.mediaType !== "link")
    .map(normalizePreviewItem);

  if (!normalized.length) return;

  // Cada apertura invalida callbacks de una sesión anterior.
  previewRenderToken += 1;
  previewNeighborCache.clear();

  previewState = {
    items: normalized,
    index: Math.min(Math.max(index, 0), normalized.length - 1),
    day: Number(day) || selectedDay
  };

  renderMediaPreview();
}

function setupMediaPreview() {
  const modal = document.getElementById("mediaPreview");
  if (!modal) return;

  const shell = document.getElementById("mediaPreviewShell");
  const stage = document.getElementById("previewStage");
  const dragHandles = [
    document.querySelector(".media-preview-grabber"),
    document.querySelector(".media-preview-header")
  ].filter(Boolean);

  if (shell && dragHandles.length) {
    let startY = 0;
    let currentY = 0;
    let dragging = false;

    const onStart = e => {
      dragging = true;
      startY = (e.touches ? e.touches[0].clientY : e.clientY);
      shell.style.transition = "none";
    };

    const onMove = e => {
      if (!dragging) return;
      const y = (e.touches ? e.touches[0].clientY : e.clientY);
      currentY = Math.max(0, y - startY);
      shell.style.transform = `translateY(${currentY}px)`;
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      shell.style.transition = "transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)";

      if (currentY > 110) {
        closeMediaPreview("down");
      } else {
        shell.style.transform = "translateY(0)";
      }
      currentY = 0;
    };

    dragHandles.forEach(handle => {
      handle.addEventListener("touchstart", onStart, { passive: true });
      handle.addEventListener("touchmove", onMove, { passive: true });
      handle.addEventListener("touchend", onEnd);
    });
  }

  if (stage) {
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let deltaY = 0;
    let horizontal = false;

    stage.addEventListener("touchstart", event => {
      if (modal.hidden || event.touches.length !== 1) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      deltaX = 0;
      deltaY = 0;
      horizontal = false;
      stage.style.transition = "none";
    }, { passive: true });

    stage.addEventListener("touchmove", event => {
      if (modal.hidden || event.touches.length !== 1) return;
      const touch = event.touches[0];
      deltaX = touch.clientX - startX;
      deltaY = touch.clientY - startY;

      if (!horizontal && Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
        horizontal = true;
      }

      if (!horizontal) return;
      event.preventDefault();

      const atStart = previewState.index === 0 && deltaX > 0;
      const atEnd = previewState.index === previewState.items.length - 1 && deltaX < 0;
      const resistance = atStart || atEnd ? 0.28 : 1;
      stage.style.transform = `translateX(${deltaX * resistance}px)`;
      stage.style.opacity = String(Math.max(.62, 1 - Math.abs(deltaX) / 700));
    }, { passive: false });

    stage.addEventListener("touchend", () => {
      if (!horizontal) {
        stage.style.transition = "";
        stage.style.transform = "";
        stage.style.opacity = "";
        return;
      }

      const threshold = Math.min(72, window.innerWidth * .17);
      if (Math.abs(deltaX) >= threshold) {
        const delta = deltaX < 0 ? 1 : -1;
        const targetIndex = previewState.index + delta;
        if (targetIndex >= 0 && targetIndex < previewState.items.length) {
          navigateMediaPreview(delta, { animate: true });
          return;
        }
      }

      stage.style.transition = "transform .18s cubic-bezier(.22,.8,.24,1), opacity .18s ease";
      stage.style.transform = "translateX(0)";
      stage.style.opacity = "1";
      setTimeout(() => {
        stage.style.transition = "";
      }, 190);
    }, { passive: true });
  }

  document.getElementById("previewCloseBtn").innerHTML = ICONS.close;
  document.getElementById("previewCloseBtn").onclick = () => closeMediaPreview("right");

  const prevButton = document.getElementById("previewPrevBtn");
  const nextButton = document.getElementById("previewNextBtn");

  const bindPreviewNav = (button, delta) => {
    if (!button) return;

    button.onclick = null;

    button.addEventListener("pointerdown", event => {
      if (
        event.pointerType === "mouse" &&
        event.button !== 0
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (button.disabled) return;

      // En móvil no dependemos del click sintetizado:
      // navegamos en el mismo contacto del dedo.
      navigateMediaPreview(delta);
    });

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      // Click sin puntero = teclado/accesibilidad.
      // Touch/mouse ya fueron atendidos en pointerdown.
      if (
        event.detail === 0 &&
        !button.disabled
      ) {
        navigateMediaPreview(delta);
      }
    });
  };

  bindPreviewNav(prevButton, -1);
  bindPreviewNav(nextButton, 1);

  modal.addEventListener("click", event => {
    if (event.target === modal) closeMediaPreview("right");
  });

  document.addEventListener("keydown", event => {
    if (modal.hidden) return;
    if (event.key === "Escape") closeMediaPreview("right");
    if (event.key === "ArrowLeft") navigateMediaPreview(-1);
    if (event.key === "ArrowRight") navigateMediaPreview(1);
  });
}

// Inicializar solo después de que app.js haya definido sus dependencias globales.
setupMediaPreview();
