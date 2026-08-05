#!/usr/bin/env bash
set -Eeuo pipefail

python3 - <<'PY'
from pathlib import Path
from datetime import datetime
import re
import shutil
import subprocess

root = Path.cwd()

paths = {
    name: root / name
    for name in (
        "app.js",
        "ui-core.js",
        "daily-view.js",
        "daily.css",
        "favorites.js",
        "favorites.css",
        "media-preview.js",
        "index.html",
        "service-worker.js",
    )
}

for name, path in paths.items():
    if not path.is_file():
        raise SystemExit(f"❌ No se encontró {name} en la raíz del proyecto.")

poster_root = root / "assets" / "collagen"
posters = sorted(poster_root.rglob("*.poster.jpg")) if poster_root.exists() else []

if len(posters) < 51:
    raise SystemExit(
        "❌ No están disponibles las 51 portadas generadas.\n"
        f"Encontradas: {len(posters)} en assets/collagen.\n"
        "No se modificó nada."
    )

required_posters = [
    root / "assets/collagen/day-08/D08_002_VIDEO.poster.jpg",
    root / "assets/collagen/day-15/D15_001_VIDEO.poster.jpg",
    root / "assets/collagen/day-30/D30_004_VIDEO.poster.jpg",
]

for poster in required_posters:
    if not poster.is_file() or poster.stat().st_size == 0:
        raise SystemExit(f"❌ Falta o está vacía la portada: {poster.relative_to(root)}")

texts = {name: path.read_text(encoding="utf-8") for name, path in paths.items()}

already_fixed = (
    "function resolveRoutineVideoPoster(" in texts["ui-core.js"]
    and "const usePosterImage = block.mediaType === \"video\"" in texts["daily-view.js"]
    and "const usePosterImage = favorite.mediaType === \"video\"" in texts["favorites.js"]
    and 'const CACHE="nuapp-v63e-ios-thumbnails";' in texts["service-worker.js"]
)

if already_fixed:
    print("ℹ️ La corrección v63e ya está aplicada. No se modificó nada.")
    raise SystemExit(0)

checks = {
    "parche genérico en app.js":
        "/* ===== Collagen+ iPhone media compatibility ===== */" in texts["app.js"],
    "creador de miniaturas de rutina":
        'function createCompactMediaItem(block, order, mediaBlocks) {' in texts["daily-view.js"],
    "creador de previews de Favoritos":
        'function favoritePreviewNode(favorite) {' in texts["favorites.js"],
    "normalizador del visor":
        'function normalizePreviewItem(item) {' in texts["media-preview.js"],
    "regla de miniatura diaria":
        '.resource-thumb img,\n.resource-thumb video {' in texts["daily.css"],
    "regla de miniatura de Favoritos":
        '#view-favoritos .favorite-folder-preview img,\n#view-favoritos .favorite-folder-preview video {' in texts["favorites.css"],
}

missing = [label for label, present in checks.items() if not present]
if missing:
    raise SystemExit(
        "❌ El código actual no coincide con el ZIP analizado.\n"
        "No se modificó nada. Faltan: " + ", ".join(missing)
    )

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = root / f"_backup-ios-miniaturas-{stamp}"
backup.mkdir()

for path in paths.values():
    shutil.copy2(path, backup / path.name)

restore = backup / "RESTAURAR.sh"
restore.write_text(
    """#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
for FILE in app.js ui-core.js daily-view.js daily.css favorites.js favorites.css media-preview.js index.html service-worker.js; do
  cp -p "$HERE/$FILE" "$ROOT/$FILE"
done
echo "✅ Restauración terminada."
""",
    encoding="utf-8",
)
restore.chmod(0o755)

try:
    # 1. Elimina el parche tardío/MutationObserver que no resuelve WebKit.
    app = texts["app.js"]
    app_pattern = re.compile(
        r'\n?/\* ===== Collagen\+ iPhone media compatibility ===== \*/'
        r'.*?'
        r'/\* ===== /Collagen\+ iPhone media compatibility ===== \*/\n?',
        re.S,
    )
    app, count = app_pattern.subn("\n", app, count=1)
    if count != 1:
        raise RuntimeError("No se pudo retirar el parche genérico de app.js.")

    # 2. Helper único: usa poster explícito de D1-D7 o .poster.jpg de D8-D30.
    ui = texts["ui-core.js"]
    helper_anchor = "function ensureToastHost() {"
    helper = r'''function resolveRoutineVideoPoster(src, explicitPoster = null) {
  const provided = String(explicitPoster || "").trim();
  if (provided) return provided;

  const rawSrc = String(src || "").trim();
  const cleanSrc = rawSrc.split(/[?#]/)[0];
  if (!cleanSrc) return null;

  if (typeof days !== "undefined" && days) {
    for (const day of Object.values(days)) {
      const block = (day?.blocks || []).find(candidate => {
        if (
          candidate?.type !== "media" ||
          candidate?.mediaType !== "video"
        ) return false;

        const candidateSrc = String(candidate.src || "").split(/[?#]/)[0];
        return candidateSrc === cleanSrc;
      });

      if (block?.poster) return block.poster;
    }
  }

  if (
    /(?:^|\/)assets\/collagen\/day-\d+\//i.test(cleanSrc) &&
    /\.(mp4|mov|m4v|webm)$/i.test(cleanSrc)
  ) {
    return cleanSrc.replace(/\.(mp4|mov|m4v|webm)$/i, ".poster.jpg");
  }

  return null;
}

'''
    if helper_anchor not in ui:
        raise RuntimeError("No se encontró el punto seguro de inserción en ui-core.js.")
    ui = ui.replace(helper_anchor, helper + helper_anchor, 1)

    # 3. Materiales para hoy: la miniatura de video pasa a ser una imagen poster.
    daily = texts["daily-view.js"]
    old_daily = '''  const media = block.mediaType === "video"
    ? document.createElement("video")
    : document.createElement("img");

  media.draggable = false;
  media.setAttribute("draggable", "false");
  preview.classList.add("is-loading");
  const thumbReady = () => preview.classList.remove("is-loading");
  const thumbFailed = () => {
    preview.classList.remove("is-loading");
    preview.classList.add("is-error");
  };

  if (block.mediaType === "video") {
    media.preload = "metadata";
    media.muted = true;
    media.playsInline = true;
    media.addEventListener("loadedmetadata", thumbReady, { once: true });
  } else {
    media.alt = "";
    media.loading = "lazy";
    media.addEventListener("load", thumbReady, { once: true });
  }
  media.addEventListener("error", thumbFailed, { once: true });
  media.src = block.src;
  preview.appendChild(media);
'''
    new_daily = '''  const videoPoster = block.mediaType === "video"
    ? resolveRoutineVideoPoster(block.src, block.poster)
    : null;
  const usePosterImage = block.mediaType === "video" && Boolean(videoPoster);
  const media = block.mediaType === "video" && !usePosterImage
    ? document.createElement("video")
    : document.createElement("img");

  media.draggable = false;
  media.setAttribute("draggable", "false");
  preview.classList.add("is-loading");
  const thumbReady = () => preview.classList.remove("is-loading");
  const thumbFailed = () => {
    preview.classList.remove("is-loading");
    preview.classList.add("is-error");
  };

  if (block.mediaType === "video" && !usePosterImage) {
    media.preload = "metadata";
    media.muted = true;
    media.playsInline = true;
    media.setAttribute("playsinline", "");
    media.setAttribute("webkit-playsinline", "");
    media.addEventListener("loadedmetadata", thumbReady, { once: true });
    media.src = block.src;
  } else {
    media.alt = "";
    media.loading = "lazy";
    media.decoding = "async";
    media.addEventListener("load", thumbReady, { once: true });
    media.src = usePosterImage ? videoPoster : block.src;
  }

  media.addEventListener("error", thumbFailed, { once: true });
  preview.appendChild(media);
'''
    if old_daily not in daily:
        raise RuntimeError("No se encontró el bloque exacto de miniaturas en daily-view.js.")
    daily = daily.replace(old_daily, new_daily, 1)

    # 4. Favoritos: misma estrategia; el video real solo se abre en el visor.
    favorites = texts["favorites.js"]
    start = favorites.find("function favoritePreviewNode(favorite) {")
    end = favorites.find("\nfunction createFavoriteContentRow", start)
    if start < 0 or end < 0:
        raise RuntimeError("No se pudo aislar favoritePreviewNode en favorites.js.")

    new_favorite_function = r'''function favoritePreviewNode(favorite) {
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
'''
    favorites = favorites[:start] + new_favorite_function + favorites[end:]

    # 5. El visor también recibe la ruta real del poster.
    preview = texts["media-preview.js"]
    old_normalizer = '''function normalizePreviewItem(item) {
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
'''
    new_normalizer = '''function normalizePreviewItem(item) {
  const mediaType = item.mediaType || "image";

  return {
    src: item.src,
    label: item.label || "Material",
    mediaType,
    poster: mediaType === "video"
      ? resolveRoutineVideoPoster(item.src, item.poster)
      : null,
    favorite: item.favorite !== false,
    shareable: item.shareable !== false,
    url: item.url || null
  };
}
'''
    if old_normalizer not in preview:
        raise RuntimeError("No se encontró normalizePreviewItem en media-preview.js.")
    preview = preview.replace(old_normalizer, new_normalizer, 1)

    # 6. Dimensiones explícitas para evitar el cálculo intrínseco de WebKit.
    daily_css = texts["daily.css"]
    old_daily_css = '''.resource-thumb img,
.resource-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
'''
    new_daily_css = '''.resource-thumb > img,
.resource-thumb > video {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 100%;
  min-height: 100%;
  max-width: none;
  max-height: none;
  border-radius: inherit;
  object-fit: cover;
  object-position: center;
}
'''
    if old_daily_css not in daily_css:
        raise RuntimeError("No se encontró la regla exacta de .resource-thumb en daily.css.")
    daily_css = daily_css.replace(old_daily_css, new_daily_css, 1)

    favorites_css = texts["favorites.css"]
    old_favorites_css = '''#view-favoritos .favorite-folder-preview img,
#view-favoritos .favorite-folder-preview video {
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
  object-fit: cover;
  pointer-events: none;
  -webkit-user-drag: none;
  -webkit-user-select: none;
  user-select: none;
}
'''
    new_favorites_css = '''#view-favoritos .favorite-folder-preview > img,
#view-favoritos .favorite-folder-preview > video {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 100%;
  min-height: 100%;
  max-width: none;
  max-height: none;
  border-radius: inherit;
  object-fit: cover;
  object-position: center;
  pointer-events: none;
  -webkit-user-drag: none;
  -webkit-user-select: none;
  user-select: none;
}
'''
    if old_favorites_css not in favorites_css:
        raise RuntimeError("No se encontró la regla exacta de Favoritos en favorites.css.")
    favorites_css = favorites_css.replace(old_favorites_css, new_favorites_css, 1)

    outputs = {
        "app.js": app,
        "ui-core.js": ui,
        "daily-view.js": daily,
        "daily.css": daily_css,
        "favorites.js": favorites,
        "favorites.css": favorites_css,
        "media-preview.js": preview,
        "index.html": texts["index.html"],
        "service-worker.js": texts["service-worker.js"],
    }

    versions = {
        "ui-core.js": "63e-ios-thumbnails",
        "daily-view.js": "63e-ios-thumbnails",
        "daily.css": "63e-ios-thumbnails",
        "favorites.js": "63e-ios-thumbnails",
        "favorites.css": "63e-ios-thumbnails",
        "media-preview.js": "63e-ios-thumbnails",
        "app.js": "63e-ios-thumbnails",
    }

    for target in ("index.html", "service-worker.js"):
        content = outputs[target]
        for asset, version in versions.items():
            pattern = re.compile(re.escape(asset) + r'\?v=[^"\']+')
            content, version_count = pattern.subn(
                f"{asset}?v={version}",
                content,
            )
            if version_count != 1:
                raise RuntimeError(
                    f"Se esperaban 1 referencia de {asset} en {target}; "
                    f"se encontraron {version_count}."
                )

        outputs[target] = content

    sw, cache_count = re.subn(
        r'const CACHE\s*=\s*"[^"]+";',
        'const CACHE="nuapp-v63e-ios-thumbnails";',
        outputs["service-worker.js"],
        count=1,
    )
    if cache_count != 1:
        raise RuntimeError("No se pudo actualizar el nombre del caché.")
    outputs["service-worker.js"] = sw

    for name, content in outputs.items():
        paths[name].write_text(content, encoding="utf-8")

    for name in (
        "app.js",
        "ui-core.js",
        "daily-view.js",
        "favorites.js",
        "media-preview.js",
        "service-worker.js",
    ):
        result = subprocess.run(
            ["node", "--check", str(paths[name])],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"{name} no superó node --check:\n{result.stderr}"
            )

    final = {name: path.read_text(encoding="utf-8") for name, path in paths.items()}
    validations = {
        "MutationObserver anterior eliminado":
            "__collagenIosMediaCompatibility" not in final["app.js"],
        "Helper de posters instalado":
            "function resolveRoutineVideoPoster(" in final["ui-core.js"],
        "Rutina usa imagen poster":
            "const usePosterImage = block.mediaType" in final["daily-view.js"],
        "Favoritos usa imagen poster":
            "const usePosterImage = favorite.mediaType" in final["favorites.js"],
        "Visor resuelve poster":
            "resolveRoutineVideoPoster(item.src, item.poster)" in final["media-preview.js"],
        "Encuadre WebKit diario fijado":
            ".resource-thumb > img" in final["daily.css"],
        "Encuadre WebKit Favoritos fijado":
            ".favorite-folder-preview > img" in final["favorites.css"],
        "Caché PWA actualizado":
            'const CACHE="nuapp-v63e-ios-thumbnails";' in final["service-worker.js"],
    }

    failed = [label for label, ok in validations.items() if not ok]
    if failed:
        raise RuntimeError("Fallaron validaciones: " + ", ".join(failed))

except Exception as error:
    for name, path in paths.items():
        shutil.copy2(backup / name, path)
    raise SystemExit(
        "❌ No se aplicó la corrección.\n"
        f"Motivo: {error}\n"
        "Los archivos originales fueron restaurados."
    )

print()
print("✅ CORRECCIÓN IPHONE APLICADA")
print(f"✅ Portadas verificadas: {len(posters)}")
print("✅ Las tarjetas de video ahora muestran una imagen poster, no un <video> miniatura.")
print("✅ El video real sigue abriéndose normalmente al tocar la tarjeta.")
print("✅ Las imágenes de Favoritos quedan ancladas al contenedor con recorte centrado.")
print("✅ Se retiró el MutationObserver anterior.")
print("✅ JavaScript validado con node --check.")
print("✅ Caché PWA actualizado: nuapp-v63e-ios-thumbnails")
print(f"✅ Backup: {backup}")
print(f"✅ Restaurar: {restore}")
PY
