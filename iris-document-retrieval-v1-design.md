# Iris V1 — Diseño de recuperación documental

## 1. Estado

**Fase:** diseño para revisión
**Base:** `57154b916bbc413a57aae04bc7046e2d34dd736c`
**Implementación y migración:** fuera de alcance de este documento

Este diseño define la primera capa de recuperación documental de Iris. No incorpora Groq, no modifica el comportamiento determinista actual y no habilita funciones para usuarios.

## 2. Objetivos

V1 debe permitir:

- Registrar documentos autorizados de Nu Skin con procedencia y vigencia explícitas.
- Conservar los originales en Replit Object Storage privado.
- Dividir el texto extraído en fragmentos de hasta 2.000 caracteres con 200 caracteres de solapamiento.
- Buscar fragmentos mediante PostgreSQL Full Text Search.
- Filtrar por idioma, país, categoría, producto, vigencia, versión y estado.
- Resolver alias de LumiSpa, WellSpa, Galvanic, Collagen+ y Pharmanex.
- Devolver resultados con metadatos suficientes para construir citas verificables en fases posteriores.
- Mantener la arquitectura independiente del proveedor de IA.

## 3. No objetivos

V1 no incluye:

- Groq ni ningún otro modelo.
- `POST /api/bot/ask`.
- Generación de respuestas.
- Navegación web autónoma.
- Ingesta automática desde Telegram.
- `pgvector`, embeddings o búsqueda semántica.
- Cambios en usuarios, identidad, rutinas, videos, notificaciones, cron u Object Storage existente.
- Exposición pública de documentos completos.
- Ejecución automática de migraciones.

## 4. Principios

### 4.1. Determinista primero

El contenido y los accesos rápidos actuales de `bot.js` conservan prioridad. V1 prepara recuperación adicional, pero no sustituye `resolveBotAnswer`, comandos exactos, alias existentes ni filtros por país.

Un futuro consumidor deberá aplicar este orden:

1. Comando o alias exacto existente.
2. Respuesta determinista actual.
3. Recuperación documental solo si está habilitada y corresponde.
4. Fallback determinista completo ante cualquier error.

### 4.2. Desactivado por defecto

La implementación futura deberá introducir:

```text
IRIS_RETRIEVAL_ENABLED=false
```

Con el flag apagado:

- No se inicializa el módulo de recuperación.
- No se realizan consultas nuevas.
- No cambia ninguna ruta ni respuesta.
- No se descargan objetos.
- No se altera el Service Worker.

### 4.3. Solo contenido autorizado

Cada documento debe registrar procedencia, titular y estado de autorización. La ingesta debe rechazar documentos sin autorización confirmada.

V1 no automatiza extracción desde canales privados, sitios o servicios externos.

## 5. Modelo de datos propuesto

La implementación deberá usar una migración independiente, aditiva e idempotente. No se agregan estas tablas directamente a las tablas funcionales existentes.

### 5.1. `iris_documents`

Representa la versión lógica y documental de cada fuente.

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `BIGSERIAL` | Clave primaria |
| `document_key` | `TEXT` | Identificador estable generado por servidor, único |
| `title` | `TEXT` | Obligatorio |
| `source_name` | `TEXT` | Nombre de la fuente autorizada |
| `source_reference` | `TEXT` | Referencia verificable; no contiene credenciales |
| `rights_holder` | `TEXT` | Titular o responsable del contenido |
| `authorization_status` | `TEXT` | `approved` o `rejected` |
| `authorization_reference` | `TEXT` | Evidencia o referencia interna, sin secretos |
| `language` | `TEXT` | Código normalizado, por ejemplo `es` |
| `country` | `TEXT` | Código ISO o `GLOBAL` |
| `category` | `TEXT` | Categoría normalizada |
| `product_slug` | `TEXT` | Producto canónico opcional |
| `version_label` | `TEXT` | Versión visible de la fuente |
| `effective_from` | `TIMESTAMPTZ` | Inicio de vigencia opcional |
| `effective_until` | `TIMESTAMPTZ` | Fin de vigencia opcional |
| `object_key` | `TEXT` | Clave privada del original en Object Storage |
| `mime_type` | `TEXT` | Tipo permitido |
| `content_sha256` | `TEXT` | SHA-256 hexadecimal para integridad y deduplicación |
| `is_active` | `BOOLEAN` | `false` por defecto durante preparación |
| `retired_at` | `TIMESTAMPTZ` | Retiro lógico; nunca borrado automático |
| `created_at` | `TIMESTAMPTZ` | Reloj de PostgreSQL |
| `updated_at` | `TIMESTAMPTZ` | Reloj de PostgreSQL |

Restricciones mínimas:

- `document_key` único y no vacío.
- `content_sha256` con 64 caracteres hexadecimales.
- `authorization_status='approved'` para activar un documento.
- `effective_until > effective_from` cuando ambas fechas existen.
- `retired_at IS NOT NULL` implica `is_active=false`.
- `object_key` nunca se devuelve al cliente.
- No se usa `ON DELETE CASCADE` desde tablas existentes.

### 5.2. `iris_document_chunks`

Representa fragmentos recuperables.

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `BIGSERIAL` | Clave primaria |
| `document_id` | `BIGINT` | FK a `iris_documents(id)` |
| `chunk_index` | `INTEGER` | Posición desde cero |
| `heading` | `TEXT` | Encabezado contextual opcional |
| `content` | `TEXT` | Entre 1 y 2.000 caracteres |
| `content_sha256` | `TEXT` | Integridad y deduplicación local |
| `character_start` | `INTEGER` | Posición inicial en el texto normalizado |
| `character_end` | `INTEGER` | Posición final exclusiva |
| `search_vector` | `TSVECTOR` | Generado con configuración `simple` |
| `created_at` | `TIMESTAMPTZ` | Reloj de PostgreSQL |

Restricciones mínimas:

- Único por `(document_id, chunk_index)`.
- `CHAR_LENGTH(content) BETWEEN 1 AND 2000`.
- Posiciones no negativas y `character_end > character_start`.
- `content_sha256` hexadecimal de 64 caracteres.
- La FK usa `ON DELETE RESTRICT`; el retiro es lógico.
- El vector se genera en PostgreSQL para evitar divergencias entre procesos.

Se propone `to_tsvector('simple', content)` porque el corpus inicial es multilingüe. No se mezcla stemming específico por idioma hasta medir calidad con un conjunto de evaluación.

### 5.3. `iris_search_aliases`

Normaliza términos de productos y variantes aprobadas.

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `BIGSERIAL` | Clave primaria |
| `alias_normalized` | `TEXT` | Alias normalizado |
| `canonical_term` | `TEXT` | Término canónico |
| `product_slug` | `TEXT` | Producto asociado |
| `language` | `TEXT` | Idioma opcional |
| `country` | `TEXT` | País opcional |
| `is_active` | `BOOLEAN` | Estado lógico |
| `created_at` | `TIMESTAMPTZ` | Reloj de PostgreSQL |
| `updated_at` | `TIMESTAMPTZ` | Reloj de PostgreSQL |

La unicidad debe considerar alias, idioma y país normalizados. No se permiten alias vacíos ni destinos canónicos desconocidos.

Alias iniciales a revisar antes de incorporar datos:

- LumiSpa: `lumispa`, `lumi spa`, variantes con número de versión autorizadas.
- WellSpa: `wellspa`, `well spa`, `wellspa io`.
- Galvanic: `galvanic`, `galvanic spa`, denominaciones oficiales aprobadas.
- Collagen+: `collagen+`, `collagen plus`, variantes regionales autorizadas.
- Pharmanex: `pharmanex` y nombres oficiales de líneas aprobadas.

La lista final se construye a partir de documentos autorizados; no se inventan claims ni equivalencias comerciales.

## 6. Índices

La migración futura deberá crear, como mínimo:

- Índice único de `iris_documents(document_key)`.
- Índice único de `iris_documents(content_sha256, version_label)`.
- Índice de filtros activos por `(language, country, category, product_slug)` con condición `is_active=true AND retired_at IS NULL`.
- Índice de vigencia por `effective_from` y `effective_until`.
- Índice GIN sobre `iris_document_chunks(search_vector)`.
- Índice de `iris_document_chunks(document_id, chunk_index)`.
- Índice único normalizado para aliases activos.

No se instala ninguna extensión PostgreSQL en V1.

## 7. Object Storage

### 7.1. Separación

Los objetos de Iris deberán usar un prefijo dedicado, sin reutilizar ni renombrar objetos existentes:

```text
iris/documents/v1/<document_key>/<content_sha256>/original
```

### 7.2. Privacidad

- El bucket y los objetos permanecen privados.
- `object_key` solo existe en servidor y base de datos.
- No se generan URLs públicas persistentes.
- Los clientes nunca pueden elegir el nombre final del objeto.
- No se registran credenciales ni URLs firmadas.
- La recuperación textual consulta fragmentos en PostgreSQL; no descarga el original por cada búsqueda.

### 7.3. Validación de ingesta

Antes de persistir:

- Verificar tipo MIME mediante allowlist.
- Aplicar límite de tamaño configurable.
- Calcular SHA-256 durante lectura.
- Rechazar contenido vacío.
- Rechazar duplicados exactos.
- Extraer texto en un proceso controlado.
- Confirmar autorización antes de marcar el documento como activo.
- Si falla base de datos después de subir el objeto, registrar la operación para limpieza segura; no borrar objetos existentes por patrón amplio.

## 8. Fragmentación

Algoritmo determinista propuesto:

1. Normalizar saltos de línea y Unicode sin alterar el significado.
2. Separar por títulos, párrafos y listas cuando sea posible.
3. Construir fragmentos de máximo 2.000 caracteres.
4. Conservar hasta 200 caracteres de solapamiento con el fragmento anterior.
5. Evitar cortar palabras salvo que una unidad individual exceda el límite.
6. Registrar posiciones en el texto normalizado.
7. Calcular SHA-256 de cada fragmento.
8. Repetir el proceso produce exactamente los mismos fragmentos.

El solapamiento real puede ser menor en límites naturales. Nunca puede superar 200 caracteres ni elevar el fragmento por encima de 2.000.

## 9. Contrato interno de recuperación

V1 propone un módulo de servidor, no una ruta pública:

```javascript
retrieveIrisDocumentChunks({
  query,
  language,
  country,
  category,
  productSlug,
  limit = 5,
  now
})
```

### 9.1. Entrada

- `query`: texto obligatorio, normalizado y con límite estricto.
- `language`: idioma normalizado.
- `country`: país del perfil o país explícito.
- `category` y `productSlug`: filtros opcionales allowlisted.
- `limit`: entre 1 y 10; valor operativo inicial 5.
- `now`: inyectable para pruebas.

### 9.2. Elegibilidad documental

Solo se consideran documentos que cumplan simultáneamente:

- `authorization_status='approved'`.
- `is_active=true`.
- `retired_at IS NULL`.
- Vigencia iniciada o sin fecha inicial.
- Vigencia no vencida o sin fecha final.
- Idioma compatible.
- País exacto o `GLOBAL`.
- Categoría y producto compatibles cuando se solicitan.

### 9.3. Consulta

- Resolver aliases antes de construir la consulta FTS.
- Usar `websearch_to_tsquery('simple', ...)` con parámetros SQL.
- Nunca concatenar texto del usuario en SQL.
- Ordenar por coincidencia de alias exacto, país exacto, producto, `ts_rank_cd`, versión vigente y orden estable por ID.
- Limitar resultados después de aplicar todos los filtros.
- No devolver fragmentos duplicados del mismo documento cuando no aportan información adicional.

### 9.4. Salida

Cada resultado interno contiene:

```javascript
{
  documentKey,
  title,
  sourceName,
  sourceReference,
  language,
  country,
  category,
  productSlug,
  versionLabel,
  effectiveFrom,
  effectiveUntil,
  chunkIndex,
  heading,
  content,
  score
}
```

No incluye `object_key`, HMAC, credenciales, rutas internas ni texto de documentos retirados.

## 10. Citas y trazabilidad

V1 no genera citas para usuarios, pero prepara datos verificables:

- Una cita futura debe referenciar `documentKey`, versión y `chunkIndex`.
- El servidor valida que cada cita corresponda a un fragmento recuperado en esa misma operación.
- `sourceReference` debe apuntar a una referencia autorizada y estable, no a una URL inventada.
- Un modelo futuro nunca puede introducir una fuente fuera de los resultados recuperados.
- Retirar una versión impide nuevas recuperaciones sin borrar auditoría ni originales.

## 11. Interfaz de ingesta

V1 no expone ingesta pública. La implementación futura debe separar:

1. Validación de metadatos.
2. Carga privada del original.
3. Extracción y normalización.
4. Fragmentación determinista.
5. Transacción de documento y fragmentos.
6. Revisión humana.
7. Activación explícita.

No se activa un documento en la misma operación que lo carga. La activación requiere una acción administrativa posterior y auditable.

## 12. Seguridad

- Consultas parametrizadas exclusivamente.
- Límites estrictos de tamaño, longitud y cantidad.
- Rate limiting antes de cualquier futura ruta administrativa.
- Errores genéricos; no exponer contenido rechazado ni nombres de objetos.
- Logs con operación, código seguro y métricas, sin preguntas completas ni fragmentos.
- SHA-256 para integridad y deduplicación, no como autenticación.
- Credenciales de Object Storage solo en Secrets.
- Ningún original, fragmento o diseño interno servido por Express como archivo estático.
- Añadir los futuros módulos, migraciones, pruebas y utilidades de ingesta a la lista de archivos internos bloqueados públicamente.

## 13. Privacidad y retención

- V1 no almacena consultas de usuarios.
- No vincula documentos con `users`.
- No guarda respuestas generadas.
- El retiro es lógico y conserva trazabilidad.
- La eliminación física requiere inventario, respaldo, objetivo exacto y procedimiento separado.
- No usar `CASCADE` para limpiar contenido documental de forma operativa.

## 14. Observabilidad

Métricas agregadas propuestas:

- Documentos activos por idioma, país, categoría y producto.
- Fragmentos por documento.
- Documentos rechazados por validación.
- Duración de ingesta por fase.
- Consultas de recuperación, resultados vacíos y latencia.
- Conteos agregados de aliases utilizados.
- Errores por código seguro.

No registrar preguntas completas, fragmentos recuperados, IP legible, tokens ni perfiles.

## 15. Pruebas requeridas

### 15.1. Migración

- Idempotencia completa.
- Solo `CREATE TABLE IF NOT EXISTS`, índices y restricciones nuevas.
- No `DROP`, `TRUNCATE` ni alteraciones destructivas.
- Validación inicial dentro de una transacción con `ROLLBACK`.
- Cero modificaciones en tablas existentes.

### 15.2. Fragmentación

- Límite de 2.000 caracteres.
- Solapamiento máximo de 200.
- Unicode, títulos, listas y párrafos.
- Unidad individual mayor al límite.
- Determinismo e integridad SHA-256.
- Texto vacío y entradas malformadas.

### 15.3. Recuperación

- Query parametrizada.
- Alias exactos.
- Idioma y país.
- Preferencia de país exacto sobre `GLOBAL`.
- Categoría y producto.
- Vigencia, versión, activo y retirado.
- Ranking estable.
- Límite de resultados.
- Sin resultados y fallas de base de datos.
- Ninguna exposición de `object_key`.

### 15.4. No regresión

Antes de cualquier merge futuro:

- Sintaxis de todos los archivos nuevos.
- Suites existentes completas.
- `git diff --check`.
- `GET /api/health`.
- Página principal.
- Rutas piloto bloqueadas con ambos flags apagados.
- Archivos internos bloqueados.
- Flujos actuales de usuarios, rutinas, videos, notificaciones y cron sin cambios.

## 16. Despliegue propuesto

1. Revisar y aprobar este diseño.
2. Crear migración aditiva e idempotente en otra rama.
3. Crear módulo de fragmentación con pruebas puras.
4. Crear store de documentos y recuperación con pruebas PostgreSQL.
5. Validar migración con `ROLLBACK` en desarrollo.
6. Revisar diff y seguridad.
7. Aplicar migración productiva solo con aprobación separada.
8. Mantener `IRIS_RETRIEVAL_ENABLED=false`.
9. Ingerir un conjunto mínimo de documentos autorizados.
10. Evaluar precisión con preguntas predefinidas.
11. Considerar activación interna; no integrar Groq todavía.

## 17. Criterios de aceptación de V1

V1 estará lista cuando:

- La migración sea aditiva, idempotente y revisada.
- Los originales permanezcan privados.
- La fragmentación respete 2.000/200 y sea determinista.
- PostgreSQL FTS recupere contenido autorizado con filtros completos.
- Los resultados incluyan trazabilidad suficiente para citas.
- No se almacenen consultas ni respuestas completas.
- El flag permanezca apagado por defecto.
- Todas las pruebas y verificaciones de no regresión aprueben.
- No cambie el comportamiento actual de Iris ni del resto de Nu App.

## 18. Decisiones que requieren aprobación

Antes de implementar:

1. Lista inicial exacta de documentos autorizados.
2. Taxonomía definitiva de categorías y productos.
3. Idiomas y países de la primera carga.
4. Formatos MIME admitidos y tamaños máximos.
5. Responsable y evidencia de autorización.
6. Política de versiones y retiro.
7. Conjunto de preguntas para evaluar precisión.
