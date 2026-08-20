# Iris AI Pilot Runbook V1

## Estado seguro por defecto

Mantener en producción salvo autorización explícita de activación:

- `IRIS_AI_ENABLED=false`
- `IRIS_RETRIEVAL_ENABLED=false` o ausente
- `IRIS_AI_USER_ROUTE_ENABLED=false` o ausente
- `IRIS_AI_PILOT_ENABLED=false` o ausente
- `IRIS_AI_PILOT_EMERGENCY_STOP=true` o ausente
- `IRIS_AI_PILOT_PERCENT=0` o ausente
- `IRIS_AI_PILOT_ALLOWLIST_SHA256=` vacío o ausente
- `IRIS_AI_PROVIDER_EMERGENCY_STOP=true`
- `window.NU_IRIS_AI_ESCALATION_ENABLED` ausente o distinto de booleano `true`

## Barreras requeridas para un piloto real

Una solicitud de usuario solo puede llegar al runtime cuando se cumplan todas las barreras aplicables:

1. ruta de usuario habilitada;
2. piloto habilitado;
3. emergency stop del piloto desactivado explícitamente;
4. usuario elegible por allowlist SHA-256 o rollout porcentual estable;
5. runtime Iris AI habilitado;
6. retrieval habilitado;
7. cliente habilitado de forma separada para generar la solicitud;
8. si se pretende usar provider externo, su emergency stop y presupuestos requieren otra decisión explícita.

## Allowlist

`IRIS_AI_PILOT_ALLOWLIST_SHA256` acepta únicamente hashes SHA-256 hexadecimales completos de 64 caracteres separados por comas. No almacenar IDs de usuario en claro en esta variable.

La allowlist tiene precedencia sobre el porcentaje, pero nunca sobre el emergency stop.

## Rollout porcentual

`IRIS_AI_PILOT_PERCENT` acepta enteros de `0` a `100`.

La asignación es estable por hash del `userId`, por lo que el mismo usuario permanece en el mismo bucket mientras no cambie su identidad local.

Configuraciones inválidas fallan cerrado.

## Activación gradual propuesta

No ejecutar sin autorización explícita de activación.

1. Mantener provider externo bloqueado y validar primero respuestas locales/retrieval.
2. Habilitar ruta y piloto con porcentaje `0`.
3. Agregar únicamente hashes de usuarios internos autorizados a la allowlist.
4. Validar métricas agregadas, errores, cuotas y rollback.
5. Si se autoriza, retirar allowlist o mantenerla y avanzar gradualmente por porcentaje.
6. Abrir provider externo solo bajo autorización separada y con presupuestos configurados.
7. Habilitar cliente únicamente para la población aprobada.

## Kill switch / rollback inmediato

Ante cualquier comportamiento inesperado, aplicar una o más barreras, priorizando la más rápida disponible:

1. `IRIS_AI_PILOT_EMERGENCY_STOP=true`
2. `IRIS_AI_USER_ROUTE_ENABLED=false`
3. `IRIS_AI_ENABLED=false`
4. `IRIS_AI_PROVIDER_EMERGENCY_STOP=true`
5. retirar/inhabilitar `window.NU_IRIS_AI_ESCALATION_ENABLED`

El emergency stop del piloto bloquea elegibilidad antes de tocar runtime, retrieval, cuotas o provider.

## Pruebas controladas

El bypass de piloto para integraciones anteriores existe únicamente cuando coinciden exactamente:

- `NODE_ENV=development`
- `IRIS_AI_TEST_ENVIRONMENT=development`
- `IRIS_AI_CONTROLLED_EXECUTION=true`

No es un mecanismo de activación de producción.
