// Shared by the browser, API and notification scheduler. Collagen+ keeps its own model.
(function(root) {
  "use strict";
  const products = Object.freeze({
    "lumispa-10": Object.freeze({ title: "LumiSpa", totalDays: 10 }),
    "wellspa-10": Object.freeze({ title: "WellSpa", totalDays: 10 }),
    "galvanicspa-10": Object.freeze({ title: "Galvanic Spa", totalDays: 10 }),
    "colageno-10": Object.freeze({ title: "Colágeno", totalDays: 10, category: "supplements" }),
    "lifepak-5": Object.freeze({ title: "LifePak", totalDays: 5, category: "supplements" }),
    "lifepak-elements-5": Object.freeze({ title: "LifePak Elements", totalDays: 5, category: "supplements" }),
    "nubi-10": Object.freeze({ title: "NuBi", totalDays: 10, category: "supplements" }),
    "omega-10": Object.freeze({ title: "Optimum Omega", totalDays: 10, category: "supplements" }),
    "prysm-5": Object.freeze({ title: "Prysm iO", totalDays: 5, category: "supplements" })
  });
  if (typeof module === "object" && module.exports) module.exports = products;
  else {
    root.NuProductRoutines = products;
    // New programs keep their local cache scoped to the current profile too.
    const scope = id => {
      if (products[id]?.category !== "supplements") return id;
      let userId = "guest";
      try { userId = JSON.parse(root.localStorage.getItem("routineUserProfile") || "null")?.userId || userId; } catch (_) {}
      return `${id}:user:${userId}`;
    };
    root.NuProductStorage = Object.freeze({
      stateKey: id => `routineState:${scope(id)}`,
      completeKey: (id, day) => `day:${scope(id)}:${Number(day)}:complete`,
      completedAtKey: (id, day) => `day:${scope(id)}:${Number(day)}:completedAt`
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
