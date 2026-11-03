// Biblioteca Internacional: carga el catálogo aprobado, sin modificar contenido de Iris.
window.NuInternationalLibraryData = Object.create(null);
fetch("/biblioteca-internacional-catalog.json", { credentials: "same-origin", cache: "no-store" })
  .then(response => { if (!response.ok) throw new Error("Catálogo no disponible"); return response.json(); })
  .then(catalog => {
    const entries = Object.create(null);
    // Rutas del lote MP4 verificado: conservar el cache-busting del piloto inicial.
    const convertedMovBatch = new Set([
      "collagen/es/2/1",
      "collagen/es/6/2",
      "collagen/es/9/2",
      "collagen/it/6/2",
      "lumispa/it/7/1",
      "lumispa/it/7/2",
      "lumispa/it/7/3",
      "lumispa/it/7/4"
    ]);
    // Variantes 720p verificadas, exclusivas del piloto de día 6.
    const optimizedDay6 = new Set(["collagen/es/6/2", "collagen/it/6/2"]);
    for (const [key, files] of Object.entries(catalog)) {
      const parts = key.split("/");
      if (parts.length !== 3 || !Array.isArray(files)) continue;
      entries[key] = files.map((file, index) => {
        const materialKey = key + "/" + (index + 1);
        const assetPath = "/api/international-assets/" + parts[0] + "-" + parts[1] + "/" + parts[2] + "/" + (index + 1);
        return {
          title: "Material " + (index + 1),
          type: file.type,
          src: assetPath +
            (key === "collagen/es/1" && index === 0 ? "?v=collagen-es-d1-mp4-pilot-1" :
              optimizedDay6.has(materialKey) ? "?v=day6-mobile-optimized-1" :
              convertedMovBatch.has(materialKey) ? "?v=international-mov-mp4-batch-1" : ""),
          poster: optimizedDay6.has(materialKey)
            ? assetPath + "?poster=first-frame&v=day6-poster-1"
            : undefined
        };
      });
    }
    window.NuInternationalLibraryData = entries;
    dispatchEvent(new Event("nu-international-catalog-ready"));
  })
  .catch(error => console.warn("Biblioteca Internacional: catálogo pendiente.", error));
