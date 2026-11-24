# Biblioteca de materiales de rutinas

## Alcance

Se organiza el almacenamiento de Colágeno 30 días, LumiSpa, Galvanic Spa,
WellSpa y las cinco estrategias de Europa. Los suplementos son una sección
independiente y conservan sus referencias actuales.

| Colección | Días | Recursos originales | Archivos con variantes y portadas |
| --- | --- | --- | --- |
| Colágeno general | 30 | 184 | 242 |
| LumiSpa general | 10 | 42 | 85 |
| Galvanic Spa general | 10 | 43 | 86 |
| WellSpa general | 10 | 50 | 100 |
| Colágeno España | 10 | 48 | 134 |
| Colágeno Italia | 10 | 48 | 134 |
| LumiSpa Italia | 10 | 41 | 93 |
| LumiSpa + Colágeno España | 7 | 26 | 58 |
| Colágeno Portugal | 7 | 36 | 107 |
| Total | 104 | 518 | 1039 |

Los recursos incluyen imágenes, videos y documentos locales de las rutinas;
no se descargan ni trasladan enlaces externos como YouTube, Canva o Drive.

## Estructura

Todo queda debajo de `routines/library/v1/`:

- `general/{routine-id}/day-01/originals/01.jpg`
- `general/{routine-id}/day-01/posters/02.webp`
- `general/{routine-id}/appearance/covers/01.png`
- `general/{routine-id}/appearance/heroes/01.png`
- `europe/{pais}/{estrategia}/day-01/originals/01.jpg`
- `europe/{pais}/{estrategia}/day-01/previews/01.jpg`
- `europe/{pais}/{estrategia}/day-01/thumbnails/01.jpg`
- `europe/{pais}/{estrategia}/day-01/posters/02.jpg`
- `europe/{pais}/{estrategia}/day-01/optimized/02.mp4`

Las extensiones originales se conservan; los ejemplos no convierten formatos.
Los identificadores generales son `collagen-30`, `lumispa-10`,
`galvanicspa-10` y `wellspa-10`. Los países de Europa son `es`, `it` y `pt`.

## Compatibilidad

No se modifica ningún archivo de contenido del navegador, favorito guardado,
identificador de rutina, registro de progreso, calendario ni orden de bloques.

El servidor sigue respondiendo a las URL originales `/assets/...`,
`/api/routine-assets/...` y `/api/international-assets/...`. Solo cambia el
destino interno una vez activada la copia verificada de esa colección. Si falta
la copia o su marcador, conserva la respuesta anterior.

Para las cuatro rutinas generales, `general-routine-asset-manifest.json` conserva
la relación entre cada URL y su destino. Se genera desde los archivos existentes
con `node scripts/build-general-routine-layout.js`, que también verifica los
331 archivos locales únicos mediante SHA-256. Las referencias pueden repetirse
en varios días; se conserva una copia organizada en cada ubicación necesaria.

## Ejecutar en el workspace de Replit

Primero debe terminar la importación inicial de Portugal con
`scripts/upload-portugal-collagen-preview.js`. Esta migración parte de los
archivos que ya utiliza cada colección.

1. `node scripts/organize-all-routine-assets-preview.js --dry-run`
2. Si la revisión completa termina sin faltantes ni diferencias:
   `node scripts/organize-all-routine-assets-preview.js --copy`
3. Reiniciar Run.
4. `node scripts/audit-organized-routines-preview.js`
5. Revisar en la interfaz las nueve colecciones: navegar días, abrir imágenes,
   reproducir y descargar videos, descargar documentos, compartir y abrir
   favoritos previos. Comprobar que el perfil y el progreso se conservan.

Se puede ejecutar una colección con `--collection=collagen-30`; esta opción
también está disponible en la auditoría. Su puerto predeterminado es 5000 y
puede modificarse con `--port=5000`.

El primer comando es de solo lectura. El segundo copia objetos de almacenamiento
con la generación de origen fijada y sube archivos locales tras verificar su
SHA-256. Todas las escrituras requieren que el destino todavía no exista. Las
copias se verifican por tamaño, MD5 y tipo de contenido antes de activar cada
colección. Nunca se eliminan ni sobrescriben los originales. No se recomprime
ningún archivo ni se cambia su contenido.

Cada marcador incorpora el hash de su índice. La ejecución puede reanudarse si
se interrumpe. El informe queda en
`scripts/_audit-output/all-routines-organized-v1.json` y no se agrega a Git.

La auditoría consulta `/api/routine-library-status`, revisa 1235 solicitudes
HEAD o GET de un byte y exige que todas respondan desde la biblioteca organizada.
Detecta colecciones sin activar y respuestas que todavía usan el respaldo.
No descarga archivos completos y no modifica almacenamiento ni datos.

## Publicación y respaldo

Ninguno de los comandos publica la aplicación. La versión publicada anterior
sigue utilizando sus rutas hasta que se publique explícitamente el nuevo código.
Los archivos viejos permanecen como respaldo. No se deben borrar durante esta
fase. Volver a desplegar el código anterior conserva el acceso a esas fuentes.

Los importadores anteriores conservan sus ubicaciones de entrada. Al añadir un
lote nuevo se lo importa primero y luego se ejecuta su organización. Cambiar
estos importadores o eliminar los respaldos es una tarea posterior a la revisión.
Si un archivo cambia en el futuro, debe prepararse una nueva versión de la
biblioteca; la migración actual rechazará sobrescribir una copia diferente.
