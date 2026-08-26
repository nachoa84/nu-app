// Rutina 30 Días · Favoritos
// v36-step11c: extraído de app.js sin cambios funcionales.

let savedFilter = "all";
let favoriteOpenDay = null;
let favoriteOpenRoutine = null;
let favoriteOpenBot = null;
let favoriteSearchOpen = false;
let favoriteSearchQuery = "";

const FAVORITE_SOURCE_ROUTINE = "routine";
let CURRENT_ROUTINE_ID = getActiveRoutineId();
let CURRENT_ROUTINE_TITLE = getActiveRoutineConfig().title;

function migrateOldDay1FavoritePaths() {
  const favs = JSON.parse(localStorage.getItem("favorites") || "[]");

  const pathMap = {
    "assets/01_a_partir_de_los_25.jpg": "assets/D01_05_IMAGEN.jpg",
    "assets/02_la_mejor_forma_de_revertirlo.jpg": "assets/D01_06_IMAGEN.jpg",
    "assets/03_si_queres_resultados.jpg": "assets/D01_07_IMAGEN.jpg",
    "assets/04_video.mp4": "assets/D01_08_VIDEO.mp4"
  };

  let changed = false;

  favs.forEach(f => {
    if (pathMap[f.src]) {
      f.src = pathMap[f.src];
      f.day = 1;
      changed = true;
    }
  });

  if (changed) {
    localStorage.setItem("favorites", JSON.stringify(favs));
  }
}

function inferFavoriteDay(favorite) {
  if (favorite.day) return Number(favorite.day);

  const match = String(favorite.src || "").match(/D(\d{2})_/i);
  if (match) return Number(match[1]);

  return 1;
}

function inferFavoriteRoutineOrder(favorite, day = favorite?.day) {
  const routineDay = Number(day) || inferFavoriteDay(favorite || {});
  const blocks = days[routineDay]?.blocks || [];
  let position = 0;

  for (const block of blocks) {
    if (block?.type === "media" && block.favorite !== false) {
      if (block.src === favorite?.src) return position;
      position += 1;
      continue;
    }

    if (block?.type === "text" && Array.isArray(block.links)) {
      for (const link of block.links) {
        const key = `link:${link.url}`;
        if (favorite?.src === key || favorite?.url === link.url) return position;
        position += 1;
      }
    }
  }

  const storyMatch = String(favorite?.label || "").match(/Historia\s+(\d+)\s+de/i);
  if (storyMatch) return 500 + Number(storyMatch[1]);

  return 10000;
}

function makeRoutineFavoriteResourceId(favorite) {
  const day = Number(favorite?.day) || inferFavoriteDay(favorite || {});
  const routineId = favorite?.routineId || CURRENT_ROUTINE_ID;
  const rawResource =
    favorite?.src ||
    favorite?.url ||
    favorite?.label ||
    "resource";

  return `routine:${routineId}:day:${String(day).padStart(2, "0")}:${rawResource}`;
}

function normalizeRoutineFavorite(favorite) {
  const next = { ...(favorite || {}) };
  let changed = false;

  const normalizedDay = Number(next.day) || inferFavoriteDay(next);
  if (Number(next.day) !== normalizedDay) {
    next.day = normalizedDay;
    changed = true;
  }

  if (!next.source) {
    next.source = FAVORITE_SOURCE_ROUTINE;
    changed = true;
  }

  if (!next.routineId) {
    next.routineId = CURRENT_ROUTINE_ID;
    changed = true;
  }

  if (!next.routineTitle) {
    next.routineTitle = CURRENT_ROUTINE_TITLE;
    changed = true;
  }

  const inferredOrder = inferFavoriteRoutineOrder(next, normalizedDay);
  if (!Number.isFinite(Number(next.order))) {
    next.order = inferredOrder;
    changed = true;
  }

  if (!next.resourceId) {
    next.resourceId = makeRoutineFavoriteResourceId(next);
    changed = true;
  }

  return { favorite: next, changed };
}

function getFavorites() {
  const raw = JSON.parse(localStorage.getItem("favorites") || "[]");
  let changed = false;

  const normalized = raw.map(item => {
    const result = normalizeRoutineFavorite(item);
    if (result.changed) changed = true;
    return result.favorite;
  });

  if (changed) {
    localStorage.setItem("favorites", JSON.stringify(normalized));
  }

  return normalized;
}

function getRoutineFavorites(routineId = CURRENT_ROUTINE_ID) {
  return getFavorites().filter(favorite =>
    favorite.source === FAVORITE_SOURCE_ROUTINE &&
    favorite.routineId === routineId
  );
}

function favoriteRoutineOrder(favorite, day = favorite?.day) {
  const liveOrder = inferFavoriteRoutineOrder(favorite, day);

  // Para la rutina actual, el contenido real manda siempre.
  // Así el orden no depende nunca de cuándo se guardó el favorito.
  if (
    favorite?.source === FAVORITE_SOURCE_ROUTINE &&
    favorite?.routineId === CURRENT_ROUTINE_ID &&
    liveOrder < 10000
  ) {
    return liveOrder;
  }

  const storedOrder = Number(favorite?.order);
  if (Number.isFinite(storedOrder)) return storedOrder;

  return liveOrder;
}

function sortFavoritesForDay(items, day) {
  return [...items].sort((a, b) => {
    const byRoutine = favoriteRoutineOrder(a, day) - favoriteRoutineOrder(b, day);
    if (byRoutine) return byRoutine;

    const bySavedAt = Number(a.savedAt || 0) - Number(b.savedAt || 0);
    if (bySavedAt) return bySavedAt;

    return String(a.label || a.src || "").localeCompare(
      String(b.label || b.src || ""),
      "es",
      { numeric: true, sensitivity: "base" }
    );
  });
}

function isFavorite(src, day = selectedDay) {
  return getRoutineFavorites().some(
    favorite =>
      favorite.src === src &&
      Number(favorite.day) === Number(day)
  );
}

function updateFavoriteButtons() {
  document.querySelectorAll("[data-favorite-src]").forEach(btn => {
    const src = btn.dataset.favoriteSrc;
    const day = Number(btn.dataset.favoriteDay);
    const saved = isFavorite(src, day);

    btn.classList.toggle("is-saved", saved);
    btn.setAttribute(
      "aria-label",
      saved ? "Quitar de favoritos" : "Guardar en favoritos"
    );

    const bookmarkIcon = saved ? ICONS.bookmarkFilled : ICONS.bookmark;

    if (btn.classList.contains("resource-action-btn")) {
      btn.innerHTML = `${bookmarkIcon}<span>${saved ? "Guardado" : "Guardar"}</span>`;
    } else if (btn.classList.contains("preview-save-action")) {
      btn.innerHTML = `${bookmarkIcon}<span>${saved ? "Guardado" : "Guardar"}</span>`;
    } else {
      btn.innerHTML = bookmarkIcon;
    }
  });
}

function refreshFavoriteUI() {
  renderFavorites();
  updateFavoriteButtons();

  if (!chatWrap.classList.contains("hidden")) {
    const currentScroll = window.scrollY;
    const showingAll = revealIndex >= currentBlocks().length;

    if (showingAll) {
      scrollToTodayContent({ markOpened: true });
      window.scrollTo(0, currentScroll);
    }
  }
}

function animateFavoriteTargets(src, day, saved = true) {
  requestAnimationFrame(() => {
    document.querySelectorAll("[data-favorite-src]").forEach(button => {
      if (
        button.dataset.favoriteSrc !== src ||
        Number(button.dataset.favoriteDay) !== Number(day)
      ) return;

      const animationClass = saved ? "favorite-pop" : "favorite-unpop";
      button.classList.remove("favorite-pop", "favorite-unpop");
      void button.offsetWidth;
      button.classList.add(animationClass);
      setTimeout(() => button.classList.remove(animationClass), 360);
    });
  });
}

function saveFavorite(
  src,
  label,
  mediaType,
  day = selectedDay,
  url = null,
  routineId = CURRENT_ROUTINE_ID,
  routineTitle = ROUTINE_CATALOG[routineId]?.title || CURRENT_ROUTINE_TITLE
) {
  if (navigator.vibrate) navigator.vibrate(10);
  const favs = getFavorites();
  const normalizedDay = Number(day);

  const idx = favs.findIndex(
    favorite =>
      favorite.source === FAVORITE_SOURCE_ROUTINE &&
      favorite.routineId === routineId &&
      favorite.src === src &&
      Number(favorite.day) === normalizedDay
  );

  if (idx >= 0) {
    const removed = favs.splice(idx, 1)[0];
    localStorage.setItem("favorites", JSON.stringify(favs));
    refreshFavoriteUI();
    animateFavoriteTargets(src, day, false);

    toast("Eliminado de favoritos", {
      type: "info",
      actionLabel: "Deshacer",
      duration: 4200,
      onAction: () => {
        const current = getFavorites();
        const exists = current.some(
          item =>
            item.resourceId === removed.resourceId ||
            (
              item.source === removed.source &&
              item.routineId === removed.routineId &&
              item.src === removed.src &&
              Number(item.day) === Number(removed.day)
            )
        );

        if (!exists) current.push(removed);
        localStorage.setItem("favorites", JSON.stringify(current));
        refreshFavoriteUI();
        toast("Restaurado en favoritos", { type: "success" });
      }
    });
    return;
  }

  const draft = {
    source: FAVORITE_SOURCE_ROUTINE,
    routineId,
    routineTitle,
    src,
    label,
    mediaType,
    day: normalizedDay,
    savedAt: Date.now(),
    ...(url ? { url } : {})
  };

  draft.order = inferFavoriteRoutineOrder(draft, normalizedDay);
  draft.resourceId = makeRoutineFavoriteResourceId(draft);

  favs.push(draft);

  localStorage.setItem("favorites", JSON.stringify(favs));
  refreshFavoriteUI();
  animateFavoriteTargets(src, day, true);
  toast("Guardado en favoritos", { type: "success" });
}

function renderFavoriteFilterBar(list) {
  let filterBar = document.getElementById("savedFilterBar");

  if (!filterBar) {
    filterBar = document.createElement("div");
    filterBar.id = "savedFilterBar";
    filterBar.className = "saved-filter-bar";

    [
      ["all", "Todos"],
      ["image", "Imágenes"],
      ["video", "Videos"],
      ["link", "Enlaces"]
    ].forEach(([value, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "saved-filter-btn";
      btn.dataset.savedFilter = value;
      btn.textContent = label;
      btn.onclick = () => {
        savedFilter = value;
        renderFavorites();
      };
      filterBar.appendChild(btn);
    });

    list.before(filterBar);
  }

  filterBar.querySelectorAll(".saved-filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.savedFilter === savedFilter);
  });

  return filterBar;
}

function normalizeFavoriteSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function favoriteMatchesSearch(favorite, query) {
  const needle = normalizeFavoriteSearch(query);
  if (!needle) return true;

  const day = Number(favorite.day) || 1;
  const typeLabel =
    favorite.mediaType === "video" ? "video videos" :
    favorite.mediaType === "link" ? "enlace enlaces link links" :
    "imagen imagenes foto fotos";

  const haystack = normalizeFavoriteSearch(
    `${favorite.routineTitle || ""} ${favorite.label || ""} ${typeLabel} dia ${day} día ${day} ${favorite.src || ""}`
  );

  return haystack.includes(needle);
}

function ensureFavoritesSearchPanel() {
  let panel = document.getElementById("favoritesSearchPanel");
  if (panel) return panel;

  const view = document.getElementById("view-favoritos");
  const header = view?.querySelector(".app-page-header");
  if (!view || !header) return null;

  panel = document.createElement("div");
  panel.id = "favoritesSearchPanel";
  panel.className = "favorites-search-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <button type="button" class="favorites-search-back" aria-label="Cerrar búsqueda">
      ${ICONS.back}
    </button>
    <label class="favorites-search-field">
      ${ICONS.search}
      <input id="favoritesSearchInput" type="search" placeholder="Buscar en favoritos" autocomplete="off" />
      <button type="button" class="favorites-search-clear" aria-label="Borrar búsqueda" hidden>×</button>
    </label>
  `;

  header.after(panel);

  const back = panel.querySelector(".favorites-search-back");
  const input = panel.querySelector("#favoritesSearchInput");
  const clear = panel.querySelector(".favorites-search-clear");

  back.onclick = closeFavoritesSearch;

  clear.onclick = () => {
    favoriteSearchQuery = "";
    input.value = "";
    clear.hidden = true;
    renderFavorites();
    input.focus({ preventScroll: true });
  };

  input.addEventListener("input", () => {
    favoriteSearchQuery = input.value;
    clear.hidden = !favoriteSearchQuery;
    renderFavorites();
  });

  return panel;
}

function openFavoritesSearch() {
  favoriteSearchOpen = true;
  favoriteOpenDay = null;
  favoriteOpenRoutine = null;
  favoriteOpenBot = null;

  const view = document.getElementById("view-favoritos");
  const panel = ensureFavoritesSearchPanel();
  if (!view || !panel) return;

  view.classList.add("favorites-searching");
  panel.hidden = false;

  const input = panel.querySelector("#favoritesSearchInput");
  const clear = panel.querySelector(".favorites-search-clear");
  input.value = favoriteSearchQuery;
  clear.hidden = !favoriteSearchQuery;

  renderFavorites();

  requestAnimationFrame(() => {
    input.focus({ preventScroll: true });
  });
}

function closeFavoritesSearch() {
  favoriteSearchOpen = false;
  favoriteSearchQuery = "";

  const view = document.getElementById("view-favoritos");
  const panel = document.getElementById("favoritesSearchPanel");
  const input = panel?.querySelector("#favoritesSearchInput");

  if (input) input.value = "";
  if (panel) panel.hidden = true;
  view?.classList.remove("favorites-searching");

  renderFavorites();
}

function preferredFavoriteFolderPreview(items) {
  const list = Array.isArray(items) ? items : [];

  return (
    list.find(item => item.mediaType === "image") ||
    list.find(item => item.mediaType === "video") ||
    list.find(item => item.mediaType === "link") ||
    list[0] ||
    null
  );
}

function favoritePreviewNode(favorite) {
  const wrap = document.createElement("div");
  wrap.className = `favorite-folder-preview favorite-preview-${favorite.mediaType}`;

  if (favorite.mediaType === "link") {
    wrap.innerHTML = `${ICONS.folder}<span>Enlace</span>`;
    return wrap;
  }

  const videoPoster = favorite.mediaType === "video"
    ? resolveRoutineVideoPoster(favorite.src, favorite.poster)
    : null;
  const usePosterImage = favorite.mediaType === "video" && Boolean(videoPoster);
  const media = favorite.mediaType === "video" && !usePosterImage
    ? document.createElement("video")
    : document.createElement("img");

  media.draggable = false;
  media.setAttribute("draggable", "false");
  media.addEventListener("dragstart", event => event.preventDefault());

  wrap.classList.add("is-loading");
  const favoriteReady = () => wrap.classList.remove("is-loading");
  const favoriteFailed = () => {
    wrap.classList.remove("is-loading");
    wrap.classList.add("is-error");
  };

  if (favorite.mediaType === "video" && !usePosterImage) {
    media.preload = "metadata";
    media.muted = true;
    media.playsInline = true;
    media.setAttribute("playsinline", "");
    media.setAttribute("webkit-playsinline", "");
    media.addEventListener("loadedmetadata", favoriteReady, { once: true });
    media.src = favorite.src;
  } else {
    media.alt = favorite.label || "";
    media.loading = "lazy";
    media.decoding = "async";
    media.addEventListener("load", favoriteReady, { once: true });
    media.src = usePosterImage ? videoPoster : favorite.src;
  }

  media.addEventListener("error", favoriteFailed, { once: true });
  wrap.appendChild(media);

  if (favorite.mediaType === "video") {
    const play = document.createElement("span");
    play.className = "favorite-folder-play";
    play.innerHTML = ICONS.play;
    wrap.appendChild(play);
  }

  return wrap;
}

function createFavoriteContentRow(favorite, order, allItems, day) {
  const row = document.createElement("article");
  row.className = `favorite-content-row favorite-content-${favorite.mediaType}`;

  const orderBadge = document.createElement("span");
  orderBadge.className = "favorite-content-order";
  orderBadge.textContent = String(order);

  if (favorite.mediaType === "link") {
    const icon = document.createElement("span");
    icon.className = "favorite-link-icon";
    icon.innerHTML = ICONS.folder;

    const copy = document.createElement("a");
    copy.className = "favorite-content-copy";
    copy.href = favorite.url || favorite.src.replace(/^link:/, "");
    copy.target = "_blank";
    copy.rel = "noopener";
    copy.innerHTML = `<strong>${favorite.label}</strong><span>Enlace</span>`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "favorite-row-remove is-saved";
    remove.dataset.favoriteSrc = favorite.src;
    remove.dataset.favoriteDay = String(day);
    remove.innerHTML = ICONS.bookmarkFilled;
    remove.setAttribute("aria-label", "Quitar de favoritos");
    remove.onclick = () => saveFavorite(
      favorite.src,
      favorite.label,
      favorite.mediaType,
      day,
      favorite.url,
      favorite.routineId,
      favorite.routineTitle
    );

    row.append(orderBadge, icon, copy, remove);
    setupNativePressState(row, ".favorite-row-remove");
    return row;
  }

  const mediaItems = allItems.filter(item => item.mediaType !== "link");
  const mediaIndex = mediaItems.findIndex(item => item.src === favorite.src);
  // NU APP · NOMBRES CANÓNICOS DE MATERIALES V96
  const normalizedMediaIndex = Math.max(mediaIndex, 0);
  const displayLabel = `Historia ${normalizedMediaIndex + 1} de ${mediaItems.length}`;
  const previewItems = mediaItems.map((item, index) => ({
    ...item,
    label: `Historia ${index + 1} de ${mediaItems.length}`
  }));

  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "favorite-content-thumb";
  preview.appendChild(favoritePreviewNode(favorite));
  preview.onclick = () => openMediaPreview(previewItems, normalizedMediaIndex, day);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "favorite-content-copy";
  copy.innerHTML = `<strong>${displayLabel}</strong><span>${favorite.mediaType === "video" ? "Video" : "Imagen"}</span>`;
  copy.onclick = preview.onclick;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "favorite-row-remove is-saved";
  remove.dataset.favoriteSrc = favorite.src;
  remove.dataset.favoriteDay = String(day);
  remove.innerHTML = ICONS.bookmarkFilled;
  remove.setAttribute("aria-label", "Quitar de favoritos");
  remove.onclick = () => saveFavorite(
    favorite.src,
    favorite.label,
    favorite.mediaType,
    day,
    favorite.url,
    favorite.routineId,
    favorite.routineTitle
  );

  row.append(orderBadge, preview, copy, remove);
  setupNativePressState(row, ".favorite-row-remove");
  return row;
}

function botSavedPrimaryBlock(saved) {
  const blocks = Array.isArray(saved?.blocks) ? saved.blocks.filter(Boolean) : [];
  return (
    blocks.find(block => block.type === "media") ||
    blocks.find(block => block.type === "document") ||
    blocks.find(block => block.type === "link") ||
    blocks.find(block => block.type === "text") ||
    null
  );
}

function botSavedDisplayData(saved) {
  const block = botSavedPrimaryBlock(saved);
  const text = String(saved?.text || "").trim();
  const firstLine = text.split(/\n+/).map(line => line.trim()).find(Boolean) || "Respuesta guardada";

  const title =
    saved?.topicTitle ||
    block?.title ||
    (block?.type === "text" ? String(block.content || "").trim().split(/\n+/)[0] : "") ||
    firstLine;

  const country =
    block?.country ||
    (Array.isArray(block?.countries) ? block.countries[0] : null) ||
    block?.market ||
    "";

  let kind = "Texto";
  let filterType = "text";
  if (block?.type === "media") {
    kind = block.mediaType === "video" ? "Video" : "Imagen";
    filterType = block.mediaType === "video" ? "video" : "image";
  } else if (block?.type === "document") {
    kind = "Documento";
    filterType = "document";
  } else if (block?.type === "link") {
    kind = block.resourceKind === "video" ? "Video" : "Enlace";
    filterType = block.resourceKind === "video" ? "video" : "link";
  }

  return {
    block,
    title: title || "Respuesta guardada",
    country,
    kind,
    filterType,
    excerpt: text
  };
}



function botSavedResourceCountV94(saved) {
  return (Array.isArray(saved?.blocks) ? saved.blocks : [])
    .filter(block => block && block.type !== "text")
    .length;
}

function createSavedBotBlockV94(block, index) {
  if (block.type === "text") {
    const section = document.createElement("section");
    section.className = "bot-folder-text";
    String(block.content || "")
      .split(/\n\s*\n/u)
      .map(value => value.trim())
      .filter(Boolean)
      .forEach(value => {
        const paragraph = document.createElement("p");
        paragraph.textContent = value;
        section.appendChild(paragraph);
      });
    return section;
  }

  const row = document.createElement(block.type === "link" ? "a" : "button");
  if (row.tagName === "BUTTON") row.type = "button";
  row.className = `bot-folder-resource bot-folder-${block.type}`;
  const title = block.title || block.description || `Recurso ${index}`;
  const kind =
    block.type === "document" ? "Documento" :
    block.type === "link" ? (block.resourceKind === "video" ? "Video" : "Enlace") :
    block.mediaType === "video" ? "Video" : "Imagen";
  row.innerHTML = `
    <span class="bot-folder-resource-icon">${block.type === "document" ? ICONS.folder : block.type === "media" && block.mediaType === "video" ? ICONS.play : ICONS.arrow}</span>
    <span class="bot-folder-resource-copy">
      <strong>${title}</strong>
      <small>${[block.country, kind].filter(Boolean).join(" · ") || kind}</small>
      ${block.description ? `<em>${block.description}</em>` : ""}
    </span>
    <span class="bot-folder-resource-arrow" aria-hidden="true">${ICONS.arrow}</span>`;
  if (block.type === "link") {
    row.href = block.url || "#";
    row.target = "_blank";
    row.rel = "noopener";
  } else {
    row.onclick = () => openSavedBotBlockV94(block);
  }
  return row;
}

function botSavedMatchesSearch(saved, query) {
  const needle = normalizeFavoriteSearch(query);
  if (!needle) return true;

  const data = botSavedDisplayData(saved);
  const blocksText = (saved?.blocks || [])
    .map(block => [
      block?.title,
      block?.description,
      block?.content,
      block?.country,
      Array.isArray(block?.countries) ? block.countries.join(" ") : ""
    ].filter(Boolean).join(" "))
    .join(" ");

  return normalizeFavoriteSearch(
    `${data.title} ${data.country} ${data.kind} ${data.excerpt} ${blocksText}`
  ).includes(needle);
}

function botSavedMatchesFilter(saved, filter) {
  if (filter === "all") return true;
  return (saved?.blocks || []).some(block =>
    (filter === "image" && block?.type === "media" && block.mediaType === "image") ||
    (filter === "video" && ((block?.type === "media" && block.mediaType === "video") || (block?.type === "link" && block.resourceKind === "video"))) ||
    (filter === "link" && block?.type === "link")
  );
}

function openSavedBotBlockV94(block) {
  if (!block) return;
  if (block.type === "document") {
    openBotDocument(block);
    return;
  }
  if (block.type === "link") {
    const url = block.url || "";
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  if (block.type === "media" && block.src) {
    const sourceDay = botResourceRoutineDay(block);
    openMediaPreview(
      [{
        src: block.src,
        label: block.title || "Material",
        mediaType: block.mediaType,
        poster: block.poster || null,
        shareable: block.shareable !== false,
        favorite: block.favorite !== false && Boolean(sourceDay)
      }],
      0,
      sourceDay || selectedDay
    );
  }
}

function openSavedBotFavorite(saved) {
  favoriteOpenBot = saved?.favoriteKey || botFavoriteKey(saved);
  favoriteOpenRoutine = null;
  favoriteOpenDay = null;
  favoriteSearchOpen = false;
  favoriteSearchQuery = "";
  renderFavorites();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function removeSavedBotFavorite(savedItem) {
  const favoriteKey = savedItem?.favoriteKey || botFavoriteKey(savedItem);

  try {
    const next = getSavedBotResponses().filter(
      item => item.favoriteKey !== favoriteKey
    );
    persistSavedBotResponses(next);
    renderFavorites();
    renderBotConversation({ scroll: false });
    toast("Guardado del Bot eliminado.", { type: "info" });
  } catch (error) {
    console.warn("No se pudo eliminar el guardado del Bot.", error);
    toast("No se pudo eliminar el guardado.", { type: "info" });
  }
}

function createBotFavoriteCard(saved) {
  const data = botSavedDisplayData(saved);
  const card = document.createElement("article");
  card.className = "bot-favorite-card";

  const main = document.createElement(data.block ? "button" : "div");
  if (main.tagName === "BUTTON") main.type = "button";
  main.className = "bot-favorite-main";

  const thumb = document.createElement("span");
  thumb.className = `bot-favorite-thumb bot-favorite-${data.filterType}`;

  if (data.block?.type === "media" && data.block.src) {
    if (data.block.mediaType === "video") {
      const video = document.createElement("video");
      video.src = data.block.src;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      if (data.block.poster) video.poster = data.block.poster;
      thumb.appendChild(video);
      const play = document.createElement("span");
      play.className = "bot-favorite-play";
      play.innerHTML = ICONS.play;
      thumb.appendChild(play);
    } else {
      const image = document.createElement("img");
      image.src = data.block.src;
      image.alt = "";
      image.loading = "lazy";
      thumb.appendChild(image);
    }
  } else {
    thumb.innerHTML = data.block?.type === "link" ? ICONS.arrow : data.block?.type === "document" ? ICONS.folder : ICONS.bot;
  }

  const copy = document.createElement("span");
  copy.className = "bot-favorite-copy";

  const title = document.createElement("strong");
  title.textContent = data.title;

  const meta = document.createElement("small");
  const resourceCount = botSavedResourceCountV94(saved);
  meta.textContent = `${resourceCount} recurso${resourceCount === 1 ? "" : "s"}`;

  copy.append(title, meta);
  main.append(thumb, copy);

  if (data.block) {
    main.onclick = () => openSavedBotFavorite(saved);
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "bot-favorite-remove is-saved";
  remove.innerHTML = ICONS.bookmarkFilled;
  remove.setAttribute("aria-label", "Quitar de guardados del Bot");
  remove.onclick = event => {
    event.stopPropagation();
    removeSavedBotFavorite(saved);
  };

  card.append(main, remove);
  setupNativePressState(card, ".bot-favorite-remove");
  return card;
}

function createFavoriteDayTile(day, items, allDayItems, favoritesView, routineId) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "favorite-day-tile";

  const previewFavorite = preferredFavoriteFolderPreview(allDayItems) || items[0];
  const preview = favoritePreviewNode(previewFavorite);
  preview.classList.add("favorite-day-tile-preview");

  const copy = document.createElement("span");
  copy.className = "favorite-day-tile-copy";
  copy.innerHTML = `
    <strong>Día ${day}</strong>
    <small>${items.length} material${items.length === 1 ? "" : "es"}</small>
  `;

  tile.append(preview, copy);
  tile.onclick = () => {
    favoriteOpenRoutine = routineId;
    favoriteOpenDay = { routineId, day };
    favoriteSearchOpen = false;
    favoriteSearchQuery = "";
    const panel = document.getElementById("favoritesSearchPanel");
    if (panel) panel.hidden = true;
    favoritesView?.classList.remove("favorites-searching");
    renderFavorites();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  setupNativePressState(tile);
  return tile;
}



function createFavoriteRoutineTileV93b(routineId, visibleItems, allItems) {
  const config = ROUTINE_CATALOG[routineId] || {};
  const title = config.title || allItems[0]?.routineTitle || "Rutina";
  const dayCount = new Set(allItems.map(item => Number(item.day) || 1)).size;
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "favorite-routine-tile";
  tile.innerHTML = `
    <span class="favorite-routine-cover">
      <img src="${config.cover || ""}" alt="" loading="lazy" />
    </span>
    <span class="favorite-routine-copy">
      <strong>${title}</strong>
      <small>${allItems.length} material${allItems.length === 1 ? "" : "es"}</small>
      <em>${dayCount} día${dayCount === 1 ? "" : "s"} con favoritos</em>
    </span>
    <span class="favorite-routine-arrow" aria-hidden="true">${ICONS.arrow}</span>`;
  tile.setAttribute("aria-label", `Abrir favoritos de ${title}`);
  tile.onclick = () => {
    favoriteOpenRoutine = routineId;
    favoriteOpenDay = null;
    favoriteSearchOpen = false;
    favoriteSearchQuery = "";
    const panel = document.getElementById("favoritesSearchPanel");
    if (panel) panel.hidden = true;
    renderFavorites();
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  setupNativePressState(tile);
  return tile;
}

function renderFavorites() {
  const list = document.getElementById("favoritesList");
  const routineFavs = getFavorites().filter(favorite =>
    favorite.source === FAVORITE_SOURCE_ROUTINE
  );
  const botFavs = getSavedBotResponses();
  if (!list) return;

  const favoritesView = document.getElementById("view-favoritos");
  favoritesView?.classList.toggle("favorite-day-open", Boolean(favoriteOpenDay));

  const searchPanel = ensureFavoritesSearchPanel();
  if (searchPanel) searchPanel.hidden = !favoriteSearchOpen;
  favoritesView?.classList.toggle("favorites-searching", favoriteSearchOpen);

  renderFavoriteFilterBar(list);

  const searchedRoutine = favoriteSearchQuery
    ? routineFavs.filter(favorite => favoriteMatchesSearch(favorite, favoriteSearchQuery))
    : routineFavs;
  const searchedBot = favoriteSearchQuery
    ? botFavs.filter(saved => botSavedMatchesSearch(saved, favoriteSearchQuery))
    : botFavs;

  const filteredRoutine = savedFilter === "all"
    ? searchedRoutine
    : searchedRoutine.filter(favorite => favorite.mediaType === savedFilter);
  const filteredBot = searchedBot.filter(saved => botSavedMatchesFilter(saved, savedFilter));

  if (!routineFavs.length && !botFavs.length) {
    favoriteOpenDay = null;
    list.className = "favorites-list empty-state";
    list.innerHTML = `
      <div class="saved-empty-icon">${ICONS.heart}</div>
      <strong>Todavía no tenés favoritos</strong>
      <span>Guardá materiales de tus rutinas o respuestas del Bot y los vas a encontrar acá.</span>
      <button type="button" class="empty-state-cta">Explorar contenido</button>
    `;
    list.querySelector(".empty-state-cta")?.addEventListener("click", () => {
      document.querySelector('[data-view="hoy"]')?.click();
    });
    return;
  }





  if (favoriteOpenBot) {
    const saved = botFavs.find(item => item.favoriteKey === favoriteOpenBot);
    if (!saved) {
      favoriteOpenBot = null;
      return renderFavorites();
    }
    const title = saved.topicTitle || botSavedDisplayData(saved).title || "Respuesta guardada";
    const blocks = Array.isArray(saved.blocks) ? saved.blocks.filter(Boolean) : [];
    const resourceCount = botSavedResourceCountV94(saved);
    list.innerHTML = "";
    list.className = "favorites-list bot-folder-screen";
    const header = document.createElement("header");
    header.className = "favorite-day-header bot-folder-header";
    header.innerHTML = `
      <button type="button" class="favorite-back-link" aria-label="Volver a Favoritos">
        ${ICONS.back}<span>Favoritos</span>
      </button>
      <div class="favorite-day-title">
        <small>Del Bot</small>
        <h2>${title}</h2>
        <span>${resourceCount} recurso${resourceCount === 1 ? "" : "s"}</span>
      </div>`;
    header.querySelector("button").onclick = () => {
      favoriteOpenBot = null;
      savedFilter = "all";
      renderFavorites();
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    const content = document.createElement("div");
    content.className = "bot-folder-content";
    blocks.forEach((block, index) => content.appendChild(createSavedBotBlockV94(block, index + 1)));
    list.append(header, content);
    return;
  }

  if (favoriteOpenRoutine && !favoriteOpenDay) {
    const routineId = favoriteOpenRoutine;
    const config = ROUTINE_CATALOG[routineId] || {};
    const rawRoutineItems = routineFavs.filter(favorite => favorite.routineId === routineId);
    const visibleRoutineItems = filteredRoutine.filter(favorite => favorite.routineId === routineId);
    if (!rawRoutineItems.length) {
      favoriteOpenRoutine = null;
      return renderFavorites();
    }

    list.innerHTML = "";
    list.className = "favorites-list favorite-routine-screen";
    const header = document.createElement("header");
    header.className = "favorite-day-header favorite-routine-screen-header";
    header.innerHTML = `
      <button type="button" class="favorite-back-link" aria-label="Volver a Favoritos">
        ${ICONS.back}<span>Favoritos</span>
      </button>
      <div class="favorite-day-title">
        <small>De mis rutinas</small>
        <h2>${config.title || rawRoutineItems[0]?.routineTitle || "Rutina"}</h2>
        <span>${rawRoutineItems.length} material${rawRoutineItems.length === 1 ? "" : "es"} guardado${rawRoutineItems.length === 1 ? "" : "s"}</span>
      </div>`;
    header.querySelector("button").onclick = () => {
      favoriteOpenRoutine = null;
      savedFilter = "all";
      renderFavorites();
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    const content = document.createElement("div");
    content.className = "favorite-routine-days";
    if (!visibleRoutineItems.length) {
      content.innerHTML = `
        <div class="favorite-day-filter-empty">
          <strong>No hay materiales con este filtro</strong>
          <span>Podés volver a ver todos los días guardados.</span>
          <button type="button" class="empty-state-cta">Ver todos</button>
        </div>`;
      content.querySelector("button").onclick = () => {
        savedFilter = "all";
        renderFavorites();
      };
    } else {
      const grouped = {};
      visibleRoutineItems.forEach(favorite => {
        const day = Number(favorite.day) || 1;
        (grouped[day] ||= []).push(favorite);
      });
      Object.keys(grouped).map(Number).sort((a, b) => a - b).forEach(day => {
        const items = sortFavoritesForDay(grouped[day], day);
        const allDayItems = sortFavoritesForDay(
          rawRoutineItems.filter(favorite => (Number(favorite.day) || 1) === day),
          day
        );
        content.appendChild(createFavoriteDayTile(day, items, allDayItems, favoritesView, routineId));
      });
    }
    list.append(header, content);
    return;
  }

  if (favoriteOpenDay) {
    const openFolder = typeof favoriteOpenDay === "object"
      ? favoriteOpenDay
      : { routineId: CURRENT_ROUTINE_ID, day: Number(favoriteOpenDay) };
    const day = Number(openFolder.day);
    const folderRoutineId = openFolder.routineId || CURRENT_ROUTINE_ID;
    const folderRoutineTitle = ROUTINE_CATALOG[folderRoutineId]?.title || "Rutina";
    const rawDayItems = sortFavoritesForDay(
      routineFavs.filter(favorite =>
        favorite.routineId === folderRoutineId &&
        (Number(favorite.day) || 1) === day
      ),
      day
    );

    if (!rawDayItems.length) {
      favoriteOpenDay = null;
      return renderFavorites();
    }

    const visibleItems = sortFavoritesForDay(
      filteredRoutine.filter(favorite =>
        favorite.routineId === folderRoutineId &&
        (Number(favorite.day) || 1) === day
      ),
      day
    );

    list.innerHTML = "";
    list.className = "favorites-list favorite-day-screen";

    const header = document.createElement("header");
    header.className = "favorite-day-header";
    header.innerHTML = `
      <button type="button" class="favorite-back-link" aria-label="Volver a Favoritos">
        ${ICONS.back}<span>Favoritos</span>
      </button>
      <div class="favorite-day-title">
        <small>${folderRoutineTitle}</small>
        <h2>Día ${day}</h2>
        <span>${rawDayItems.length} favorito${rawDayItems.length === 1 ? "" : "s"}</span>
      </div>
    `;

    header.querySelector("button").onclick = () => {
      favoriteOpenDay = null;
      savedFilter = "all";
      renderFavorites();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const content = document.createElement("div");
    content.className = "favorite-day-content";

    if (!visibleItems.length) {
      const empty = document.createElement("div");
      empty.className = "favorite-day-filter-empty";
      const filterNames = {
        image: "imágenes",
        video: "videos",
        link: "enlaces"
      };
      const name = filterNames[savedFilter] || "contenido";
      empty.innerHTML = `
        <strong>No hay ${name} en este día</strong>
        <span>Podés volver a ver todos los favoritos del Día ${day}.</span>
        <button type="button" class="empty-state-cta">Ver todos</button>
      `;
      empty.querySelector("button").onclick = () => {
        savedFilter = "all";
        renderFavorites();
      };
      content.appendChild(empty);
    } else {
      visibleItems.forEach(favorite => {
        const originalOrder = rawDayItems.findIndex(item => item.src === favorite.src) + 1;
        content.appendChild(
          createFavoriteContentRow(
            favorite,
            Math.max(originalOrder, 1),
            rawDayItems,
            day
          )
        );
      });
    }

    list.append(header, content);
    return;
  }

  if (!filteredRoutine.length && !filteredBot.length) {
    list.className = "favorites-list empty-state";

    if (favoriteSearchQuery) {
      list.innerHTML = `
        <div class="saved-empty-icon">${ICONS.search}</div>
        <strong>No encontramos favoritos</strong>
        <span>Probá con otra palabra, día o tipo de contenido.</span>
        <button type="button" class="empty-state-cta">Borrar búsqueda</button>
      `;
      list.querySelector(".empty-state-cta")?.addEventListener("click", () => {
        favoriteSearchQuery = "";
        const input = document.getElementById("favoritesSearchInput");
        const clear = document.querySelector(".favorites-search-clear");
        if (input) input.value = "";
        if (clear) clear.hidden = true;
        renderFavorites();
        input?.focus({ preventScroll: true });
      });
    } else {
      list.innerHTML = `
        <div class="saved-empty-icon">${ICONS.heart}</div>
        <strong>No hay contenido en este filtro</strong>
        <span>Probá con otra categoría.</span>
        <button type="button" class="empty-state-cta">Ver todos</button>
      `;
      list.querySelector(".empty-state-cta")?.addEventListener("click", () => {
        savedFilter = "all";
        renderFavorites();
      });
    }
    return;
  }

  list.innerHTML = "";
  list.className = "favorites-list favorites-native-groups";

  if (filteredRoutine.length) {
    // NU APP · JERARQUÍA DE FAVORITOS V93B
    const routineOrder = ["collagen-30", "lumispa-10", "wellspa-10", "galvanicspa-10"];
    const visibleRoutineIds = [...new Set(filteredRoutine.map(favorite => favorite.routineId))]
      .sort((a, b) => routineOrder.indexOf(a) - routineOrder.indexOf(b));
    const routineSection = document.createElement("section");
    routineSection.className = "favorite-native-section favorite-native-routine favorite-routine-library";
    const sectionLabel = document.createElement("p");
    sectionLabel.className = "favorite-native-eyebrow";
    sectionLabel.textContent = favoriteSearchQuery ? "En mis rutinas" : "Tu rutina guardada";
    const strip = document.createElement("div");
    strip.className = "favorite-routine-strip";
    visibleRoutineIds.forEach(routineId => {
      const visibleItems = filteredRoutine.filter(favorite => favorite.routineId === routineId);
      const allItems = routineFavs.filter(favorite => favorite.routineId === routineId);
      strip.appendChild(createFavoriteRoutineTileV93b(routineId, visibleItems, allItems));
    });
    routineSection.append(sectionLabel, strip);
    list.appendChild(routineSection);
  }

  if (filteredBot.length) {
    const botSection = document.createElement("section");
    botSection.className = "favorite-native-section favorite-native-bot";

    const sectionLabel = document.createElement("p");
    sectionLabel.className = "favorite-native-eyebrow";
    sectionLabel.textContent = "Recursos guardados";

    const botList = document.createElement("div");
    botList.className = "bot-favorites-list";
    filteredBot
      .slice()
      .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0))
      .forEach(saved => botList.appendChild(createBotFavoriteCard(saved)));

    botSection.append(sectionLabel, botList);
    list.appendChild(botSection);
  }
}
