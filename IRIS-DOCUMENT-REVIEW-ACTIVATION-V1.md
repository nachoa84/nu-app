# Iris V1 — Revisión y activación documental controlada

## Estado y alcance

Este documento define el flujo administrativo interno para revisar, aprobar,
activar, rechazar y retirar documentos Iris V1. No implementa rutas HTTP, no
expone documentos a usuarios y no conecta Iris con el bot actual.

La implementación posterior debe permanecer desactivada por defecto, operar
solo mediante una herramienta interna y exigir autorización explícita para
cualquier escritura.

## Objetivos

- Separar revisión humana, aprobación y activación.
- Mantener los documentos recién ingeridos en `pending` e inactivos.
- Asegurar una sola versión activa por familia, idioma y país.
- Registrar cada transición en `iris_document_audit` dentro de la misma
  transacción.
- Permitir rechazo y retiro lógico sin borrar originales, fragmentos ni
  auditoría.
- Evitar que claves de objeto, hashes, contenido o secretos aparezcan en la
  salida del comando o en logs.

## Fuera de alcance

- Groq, generación de respuestas y búsqueda semántica.
- Rutas públicas o administrativas de Express.
- Cambios en usuarios, identidad, rutinas, videos, notificaciones o cron.
- Eliminación física de filas u objetos.
- Activación automática después de la ingesta.
- Publicación o despliegue de la aplicación.

## Estados y transiciones

El estado se representa con `authorization_status`, `is_active` y
`retired_at`.

| Operación | Estado previo permitido | Resultado |
|---|---|---|
| revisar | `pending`, inactivo, no retirado | `pending`, inactivo |
| aprobar | `pending`, inactivo, no retirado | `approved`, inactivo |
| activar | `approved`, inactivo, no retirado | `approved`, activo |
| rechazar | `pending`, inactivo, no retirado | `rejected`, inactivo |
| retirar | `approved`, activo o inactivo, no retirado | inactivo y retirado |

No se permite:

- activar un documento `pending` o `rejected`;
- activar un documento sin `authorization_reference`;
- reactivar un documento retirado;
- rechazar un documento activo;
- modificar una transición ya consumada repitiendo el mismo comando;
- usar un identificador numérico proporcionado por el operador.

Las operaciones identifican documentos exclusivamente por `document_key`.

## Revisión humana

Antes de aprobar, el operador debe comprobar fuera del comando:

- procedencia y titular del material;
- referencia de autorización;
- idioma y país aplicables;
- categoría y producto;
- versión y vigencia;
- que el texto extraído represente fielmente el original;
- que el contenido no incluya secretos ni datos personales innecesarios;
- que los claims correspondan al mercado indicado.

La acción `review` registra `document_reviewed`, pero no aprueba ni activa.
La salida solo informa operación, estado, actividad y éxito. No muestra texto,
metadatos privados, IDs, hashes ni `object_key`.

## Servicio interno

La implementación propuesta expone un módulo interno, sin ruta:

```javascript
transitionIrisDocumentV1({
  documentKey,
  operation,
  actorKeyId,
  now
})
```

Operaciones permitidas:

- `review`
- `approve`
- `activate`
- `reject`
- `retire`

La entrada se valida antes de abrir una transacción. Los valores se envían a
PostgreSQL mediante parámetros; nunca se concatenan en SQL.

## Concurrencia y atomicidad

Cada transición de escritura debe:

1. abrir una transacción;
2. obtener el documento con `SELECT ... FOR UPDATE` por `document_key`;
3. bloquear el alcance lógico de familia, idioma y país antes de activar;
4. validar el estado actual;
5. realizar la actualización exacta;
6. insertar la auditoría allowlisted;
7. confirmar la transacción.

Ante cualquier error se ejecuta `ROLLBACK`. La restricción única parcial de la
migración sigue siendo la última defensa contra dos versiones activas.

La activación no retira ni reemplaza implícitamente otra versión. Si ya existe
una versión activa en el alcance, falla de forma segura. Un futuro flujo de
reemplazo deberá ser una operación explícita y atómica independiente.

## Auditoría

Cada operación inserta exactamente una acción:

| Operación | Acción de auditoría |
|---|---|
| revisar | `document_reviewed` |
| aprobar | `document_reviewed` |
| activar | `document_activated` |
| rechazar | `document_rejected` |
| retirar | `document_retired` |

Para distinguir revisión de aprobación, `details` puede contener únicamente
`{"decision":"reviewed"}` o `{"decision":"approved"}`. No se registra texto,
metadatos completos, hashes, claves de objeto, rutas, credenciales ni motivos
libres.

El comando local no recibe IP; `client_ip` permanece nulo. Una futura ruta
administrativa deberá anonimizar la IP antes de llamar al servicio.

## Herramienta administrativa

La CLI propuesta requiere:

```text
--document-key <clave>
--operation <review|approve|activate|reject|retire>
--commit
--confirm=IRIS_V1_TRANSITION_DEVELOPMENT
```

Además, para escribir deben cumplirse simultáneamente:

```text
IRIS_REVIEW_ENABLED=true
IRIS_REVIEW_ENVIRONMENT=development
IRIS_REVIEW_ACTOR_KEY_ID=<identificador no secreto>
NODE_ENV!=production
REPLIT_DEPLOYMENT ausente
```

Sin `--commit`, la herramienta solo valida argumentos y consulta un resumen
seguro. Nunca cambia estado. Las variables se proporcionan de forma efímera al
comando y no se crean como secretos permanentes.

La salida permitida es:

```text
mode=<dry-run|commit>
operation=<operación>
authorization_status=<pending|approved|rejected>
is_active=<true|false>
retired=<true|false>
persisted=<true|false>
```

## Aplicación al documento Collagen Plus

El documento ya ingerido en desarrollo permanece `pending` e inactivo. El
orden controlado será:

1. ejecutar `review` en desarrollo;
2. verificar auditoría y ausencia de cambios de actividad;
3. ejecutar `approve` en desarrollo;
4. verificar `approved` e inactivo;
5. ejecutar `activate` solo con una autorización explícita adicional;
6. verificar recuperación interna con el flag de recuperación apagado fuera de
   la prueba.

Cada paso requiere una autorización separada. Aprobar el diseño o fusionar su
implementación no autoriza ninguna transición sobre datos.

## Pruebas requeridas

- validación estricta de argumentos y operaciones;
- bloqueo de toda escritura sin las barreras completas;
- SQL parametrizado;
- `SELECT ... FOR UPDATE`;
- revisión que no aprueba ni activa;
- aprobación que no activa;
- activación exclusiva para documentos aprobados;
- rechazo exclusivo para documentos pendientes e inactivos;
- retiro lógico sin borrado;
- rechazo de repeticiones y transiciones inválidas;
- conflicto seguro con otra versión activa;
- auditoría atómica para cada operación;
- `ROLLBACK` ante error de actualización o auditoría;
- salida y errores sin datos privados;
- liberación de conexión incluso ante fallos;
- prueba de integración PostgreSQL completa con `ROLLBACK` en desarrollo;
- sintaxis y `git diff --check`;
- no regresión de las suites existentes.

## Secuencia de entrega

1. Revisar y fusionar este diseño.
2. Implementar el store transaccional y sus pruebas unitarias en otra rama.
3. Añadir la CLI protegida y pruebas sin persistencia real.
4. Validar integración PostgreSQL con `ROLLBACK` en desarrollo.
5. Fusionar solo después de revisión explícita.
6. Ejecutar `review`, `approve` y `activate` como pruebas controladas y
   autorizaciones separadas.

Hasta completar esta secuencia, `Collagen Plus` continúa pendiente e inactivo
y `IRIS_RETRIEVAL_ENABLED` permanece apagado.
