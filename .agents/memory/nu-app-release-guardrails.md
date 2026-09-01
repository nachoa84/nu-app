---
name: Ramas y límites de Nu App
description: Restricciones durables para integrar funciones sin alterar producción ni la identidad visual estable.
---

Trabajar únicamente sobre `development` para integraciones solicitadas. No fusionar a `main` o `prod`, no publicar y no sustituir la base visual blanca por temas oscuros, overlays negros o estilos de ramas Claude sin una instrucción nueva y explícita.

**Why:** La base blanca publicada es la referencia estable y el usuario pidió separar estrictamente el trabajo de desarrollo de producción.

**How to apply:** Antes de editar, confirmar la rama activa. Mantener Home, navegación y rutinas sin cambios colaterales al integrar funciones aisladas.

Iris debe conservar el flujo determinista como experiencia principal. Provider externo, Groq, IA generativa y retrieval/productos experimentales deben permanecer fail-closed y desactivados en producción; sólo pueden abrirse en pruebas controladas de desarrollo.

**Why:** La aplicación debe responder de forma predecible y evitar consumo o exposición accidental de servicios externos.

**How to apply:** Verificar flags y emergency stops antes de pruebas Iris. Nunca convertir una prueba de desarrollo en configuración de producción.