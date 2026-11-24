# Organización de materiales de Europa

Las cinco colecciones comparten ahora este destino de almacenamiento:

`routines/library/v1/europe/{pais}/{estrategia}/day-{dia}/{tipo}/{numero}.{extension}`

| Colección | País | Estrategia | Días | Materiales |
| --- | --- | --- | --- | --- |
| Colágeno España | es | collagen | 10 | 48 |
| Colágeno Italia | it | collagen | 10 | 48 |
| LumiSpa Italia | it | lumispa | 10 | 41 |
| LumiSpa + Colágeno España | es | lumispa-collagen | 7 | 26 |
| Colágeno Portugal | pt | collagen | 7 | 36 |

Tipos: `originals`, `previews`, `thumbnails`, `posters`, `optimized`.
Los números de día y material tienen dos dígitos.
Ejemplos:

- `routines/library/v1/europe/es/collagen/day-01/originals/01.mp4`
- `routines/library/v1/europe/es/collagen/day-01/posters/01.jpg`
- `routines/library/v1/europe/pt/collagen/day-01/originals/01.jpg`
- `routines/library/v1/europe/pt/collagen/day-01/thumbnails/01.jpg`

## Preparación en Replit

Primero debe terminar la carga de Portugal con el importador existente. La
organización no sustituye la importación inicial de materiales.

1. Ejecutar `node scripts/organize-europe-assets-preview.js --dry-run`.
2. Si la revisión no informa faltantes ni diferencias, ejecutar
   `node scripts/organize-europe-assets-preview.js --copy`.
3. Reiniciar Run y revisar las cinco colecciones en preview.

Ambos modos revisan fuentes y destinos antes de copiar. Solo `--copy` escribe.
Se admite `--collection=collagen-pt` para trabajar sobre una colección.

La copia fija la generación del objeto de origen y crea el destino con una
precondición que impide sobrescribirlo. Se verifican tamaño, MD5 y tipo de
contenido. No se descarga ni recomprime el material.

Cada colección se activa al terminar sus verificaciones, mediante un marcador
cuya ruta incluye el hash de su plan. Un error antes de terminar una colección
deja sus copias parciales sin activar; el comando puede reanudarse.

La app conserva las URL `/api/international-assets/{coleccion}/{dia}/{indice}`
y consulta el destino organizado solo cuando existe el marcador de esa
colección. Si falta, usa las rutas anteriores. También conserva las versiones
optimizadas de los cinco videos y su respaldo original.

No se eliminan las carpetas anteriores, no se modifica el catálogo ni el orden,
y el comando no publica la app. Los importadores iniciales de España y Portugal
siguen apuntando a sus ubicaciones anteriores, que funcionan como fuentes de
importación; después se ejecuta la organización. La eliminación de respaldos y
el cambio de los importadores no forman parte de esta migración.

El informe de las copias verificadas se guarda en
`scripts/_audit-output/europe-organized-v1.json` (fuera de Git).
Para organizar también las cuatro rutinas generales, usar el procedimiento de
`docs/routine-library-layout.md`. Los suplementos conservan sus rutas actuales.
