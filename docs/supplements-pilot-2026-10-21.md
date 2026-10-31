# Suplementos: piloto en development — 21/10/2026

## Base y estado

Trabajo iniciado sobre `development` en `459a1bff612705774e5d2be3d0dfff5b37fe5dcb`.
GitHub `main` se comprobó en `f29f760a757c2a9a094806fa1be2bb3aabc453c1`, igual al traspaso.
Las ramas tienen diferencias propias: no se fusionaron ni se trasladaron cambios de main.
Se leyeron instrucciones 01, traspaso 02, inventarios 04/05, PDF 06 y referencia 07.
No hay AGENTS.md en el árbol; se respetó `.agents/memory/nu-app-release-guardrails.md`.

GitHub y la descarga autenticada de Drive funcionaron. Se resolvió la app existente
Rutina30app, pero el conector disponible no ofrece Shell ni edición directa sin Agent.
No se usó Replit Agent ni su chat. No se modificó el workspace ni la base de Replit.
El respaldo 07 se utilizó como referencia documental, sin restaurarlo.

## Cambios

- Inicio → Suplementos: entrada activa en la tarjeta existente de Pharmanex.
- Seis acciones generales del PDF, arriba; dos tarjetas de producto, debajo.
  La capacitación enlaza a la carpeta de información identificada en el PDF.
  Stela se explica sin agregar enlaces pendientes ni listas de precios inventadas.
- `colageno-10`: 10 días; `lifepak-5`: 5 días. Tres materiales por día,
  con el orden del inventario y sin tareas específicas. Prysm queda fuera del piloto.
- Se reutilizan tarjetas, vista diaria, progreso, visor multimedia, favoritos y compartir.
  Collagen+ conserva su ID `collagen-30`, contenidos, 30 días y claves de progreso.
- Catálogo compartido de IDs y duraciones para cliente, API y QStash. Finalización
  y validación por duración, incluyendo el límite de LifePak en día 5.
- Los nuevos programas confirman el completado con la API antes de mostrarlo.
  Una solicitud fallida muestra el error y permite reintentar sin marcar el día.
- Caché local nueva separada por usuario y programa; se conservan las claves anteriores
  de Collagen+ y los dispositivos. La API sigue aislando por user_id/routine_id.
- Migración aditiva e idempotente `migration-supplements-pilot-v1.sql`, también incluida
  en schema.sql. Amplía IDs en las colas y limita días de los suplementos en estados,
  progreso y colas, sin restaurar, eliminar usuarios ni reescribir progreso anterior.
- Se actualizaron versiones del shell y scripts afectados. Los medios no se precargan
  en el service worker; se cargan a demanda y los videos tienen poster y faststart.

## Materiales

Se descargaron los 45 originales del piloto y coincidieron sus tamaños/SHA-256 con 05.
Los originales siguen en Drive. Se incluyen solamente variantes móviles estáticas:
33 JPEG, 12 MP4 H.264/AAC y 12 posters WebP. No hay URLs temporales en el código.

Los materiales pasan de 468.399.371 a 25.438.720 bytes, sin contar los posters:
una reducción aproximada del 94,6 %. JPEG hasta 1080×1920; video de ancho hasta 720,
CRF 26, AAC 96 kbps, píxeles yuv420p y moov al principio del MP4.
Las duraciones, texto y audio de origen se conservan; no se hicieron cortes editoriales.
`docs/supplements-pilot-media.json` registra IDs de origen y hashes de ambas versiones.
`scripts/prepare-supplements-pilot.py` permite reconstruir desde 05 y los originales
verificados. Requiere Pillow y ffmpeg, sin modificar los originales.

## Pruebas ejecutadas

**41 pruebas Node, todas aprobadas, sin skips en la ejecución registrada.** Incluyen:
estructura de 15 días y 45 materiales; claves separadas por usuario/programa; catálogo
Collagen+; sincronización activa; protección de publicación; caché HTTP; entrega de
notificaciones; configuración del pool y limitación de solicitudes; dos pruebas nuevas
de integración con PostgreSQL/WASM PGlite 0.3.14.

La integración usa el servidor Express real y sus rutas HTTP. Comprueba persistencia,
usuarios/programas separados, día futuro bloqueado (409), día inválido rechazado (400),
avance por horario confirmado, cierre de LifePak en 5 y Colágeno en 10, completados
idempotentes y Collagen+ independiente. La migración se aplicó dos veces sobre el
esquema anterior, conservando filas existentes de usuarios, day_progress y WellSpa.

**Prueba en Chromium aprobada**, con vistas de 390×844 y 1280×900:
entrada/regreso, orden de secciones, tres materiales sin tareas, reproducción desde el
visor existente, decodificación de las 33 imágenes y 12 videos, Range HTTP 206 en los
12 MP4, favoritos, archivo JPEG listo para compartir sin leyenda, error/reintento al
completar, persistencia tras recargar, aislamiento de programas, finalización visible de
LifePak día 5 sin sexto día, tarjetas de Collagen+ y ausencia de recortes/errores JS.
También se comprobaron hashes, ffprobe, sintaxis y `git diff --check`.

Comando Node (PGlite se instala por separado solo para pruebas):

```bash
NUAPP_PGLITE_MODULE=/ruta/a/node_modules/@electric-sql/pglite node --test \
  tests/supplements-pilot.test.js tests/supplements-pilot.integration.test.js \
  tests/routine-active-sync-v169.test.js tests/release-entrypoint.test.js \
  tests/notification-delivery-v111.test.js tests/runtime-hardening-v113.test.js \
  tests/http-cache-v114.test.js tests/shared-rate-limit-v115.test.js
```

Prueba de navegador: `tests/supplements-pilot.browser.mjs`.
Requiere `NUAPP_PGLITE_MODULE` y Playwright; acepta `NUAPP_PLAYWRIGHT_MODULE`,
`NUAPP_CHROMIUM_EXECUTABLE`, `NUAPP_CHROMIUM_ARGS` (JSON) y `NUAPP_QA_OUTPUT_DIR`.
El navegador debe disponer de soporte H.264/AAC. Las capturas son temporales de QA.

## Límites y pendientes

- No está publicado ni desplegado en Replit. Pendiente levantar esta rama en su entorno
  de desarrollo y comprobar PostgreSQL nativo, almacenamiento real y el teléfono/iPhone.
- La base de pruebas es PostgreSQL/WASM, no la base de Replit. El helper de pruebas
  sustituye solo el pool y el almacenamiento de Replit no disponible; ningún helper
  se carga en el arranque normal. Rechaza liderazgo del scheduler porque PGlite tiene
  una sola sesión. No hubo envíos reales de push/QStash ni habilitación de proveedores.
- La prueba de navegador bloquea service workers para aislar el código bajo prueba;
  no valida instalación/actualización de una PWA anterior. El aviso de bloqueo del
  worker en ese contexto es esperado. El compartir nativo se verifica con un receptor
  simulado de File; no se envió contenido a personas ni se probó WhatsApp en iPhone.
- Antes de editar, fallaban dos suites ya existentes de V170:
  `routine-completion-confirmation-v170.test.js` y `routine-completion-redraw-v170.test.js`,
  por falta del controlador V170 en daily-view.js de development. Se conservó ese
  estado sin mezclar correcciones de main ni presentar toda la suite como aprobada.
- LifePak Elements, NuBi, Omega y Prysm no se implementaron. Solo Prysm recibirá
  tareas específicas por día cuando se aborde su entrega.
- No se crearon otra app, repositorio, respaldos en Actions, publicaciones ni merges.
