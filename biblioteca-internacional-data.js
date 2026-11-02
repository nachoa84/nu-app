// Biblioteca Internacional: carga el catálogo aprobado, sin modificar contenido de Iris.
window.NuInternationalLibraryData = Object.create(null);
fetch("/biblioteca-internacional-catalog.json", { credentials: "same-origin" })
  .then(response => { if (!response.ok) throw new Error("Catálogo no disponible"); return response.json(); })
  .then(catalog => {
    const entries = Object.create(null);
    for (const [key, files] of Object.entries(catalog)) {
      const parts = key.split("/");
      if (parts.length !== 3 || !Array.isArray(files)) continue;
      entries[key] = files.map((file, index) => ({
        title: "Material " + (index + 1),
        type: file.type,
        src: "/api/international-assets/" + parts[0] + "-" + parts[1] + "/" + parts[2] + "/" + (index + 1)
      }));
    }
    window.NuInternationalLibraryData = entries;
    dispatchEvent(new Event("nu-international-catalog-ready"));
  })
  .catch(error => console.warn("Biblioteca Internacional: catálogo pendiente.", error));
