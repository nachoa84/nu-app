# Iris AI Layered Response Policy V1

## Estado

Diseño únicamente. Este documento no autoriza implementación, despliegue, migraciones, activación de IA ni llamadas reales a proveedores externos.

## Objetivo

Iris debe resolver primero con contenido propio, autorizado, aprobado, activo y vigente. Un proveedor de IA externo se utilizará solo cuando sea necesario interpretar, relacionar, resumir o redactar a partir de fragmentos autorizados.

El núcleo de Iris debe permanecer independiente del proveedor. Groq será el primer proveedor de prueba, pero no debe quedar acoplado al orquestador ni al motor de políticas.

## Principios de seguridad

1. `IRIS_AI_ENABLED=false` por defecto.
2. Toda exposición pública de Iris permanece desactivada por defecto.
3. `PILOT_ENABLED=false` y `PILOT_ADMIN_ROUTES_ENABLED=false` permanecen sin cambios.
4. Ninguna cuota agotada, error de proveedor o desactivación de IA puede afectar funciones no relacionadas de Nu App.
5. No enviar a proveedores externos secretos, tokens, credenciales, datos personales, IPs, archivos completos, claves de almacenamiento, hashes internos ni datos ajenos a la consulta.
6. Nunca asumir que recuperar un fragmento implica tener una respuesta suficientemente respaldada.
7. Nunca inventar una respuesta cuando el material autorizado sea insuficiente.
8. No guardar texto completo de preguntas o respuestas privadas salvo necesidad explícita y aprobada.
9. Los límites por usuario, dispositivo y período deben aplicarse antes de cualquier escalamiento a proveedor.
10. El interruptor general de emergencia debe poder impedir llamadas a proveedor sin afectar el resto de Iris.

## Escala inicial

Referencia del piloto:

- aproximadamente 300 usuarios activos;
- máximo inicial de 5 preguntas diarias por usuario, configurable;
- máximo teórico de 45.000 preguntas mensuales;
- Groq Free como primer entorno de prueba;
- sin habilitar todavía facturación paga;
- límites globales diarios y mensuales independientes del límite individual.

Estos valores son configuración, no constantes de dominio.

## Tipos de respuesta

El sistema debe clasificar cada resolución en exactamente uno de estos estados:

### `deterministic`

Respuesta producida por reglas locales conocidas sin depender de búsqueda semántica ni proveedor externo.

Ejemplos:

- enlaces conocidos;
- recursos conocidos;
- datos estructurados;
- respuestas exactas predefinidas;
- FAQ aprobadas;
- alias normalizados con respuesta inequívoca.

### `verified_cache`

Respuesta previamente validada y almacenada en caché verificable, todavía válida para el mismo alcance documental y de autorización.

La caché debe invalidarse cuando cambie la versión documental, autorización, vigencia o política relevante.

### `direct_retrieval`

Respuesta entregable directamente desde uno o más fragmentos autorizados, sin modelo generativo.

Solo se permite si una política de confianza determina que el material recuperado responde de forma suficientemente directa a la pregunta.

### `provider_assisted`

Respuesta redactada, resumida o relacionada por un proveedor externo exclusivamente a partir de fragmentos Iris autorizados recuperados previamente.

El proveedor no puede ampliar conocimiento fuera del material proporcionado.

### `insufficient`

Iris no dispone de material autorizado suficiente para responder con seguridad.

Debe devolver una respuesta segura y no inventar información.

## Flujo por capas

Orden obligatorio:

1. validar formato y tamaño de la pregunta;
2. aplicar protección contra prompt injection y entradas no permitidas;
3. aplicar límites por usuario, dispositivo y período;
4. aplicar límites globales diarios y mensuales;
5. verificar interruptor general de emergencia y flags;
6. normalizar consulta;
7. intentar resolución determinística;
8. consultar caché verificada;
9. realizar retrieval únicamente sobre documentos Iris aprobados, activos, vigentes y autorizados;
10. evaluar confianza y suficiencia del material recuperado;
11. si la respuesta puede entregarse directamente, responder sin proveedor;
12. si requiere interpretación/redacción y la política permite escalamiento, evaluar presupuesto de escalamiento;
13. si se autoriza escalamiento, llamar al provider con contexto mínimo;
14. validar respuesta y citas contra el contexto recuperado;
15. si el provider falla, devuelve 429, se agota cuota o está deshabilitado, intentar fallback seguro desde recuperación directa;
16. si no existe fallback seguro, responder `insufficient`;
17. registrar métricas anonimizadas.

## Política de confianza

La confianza no puede basarse únicamente en que exista al menos un fragmento.

La primera implementación debe ser determinista y testeable. Puede considerar, como mínimo:

- coincidencia exacta de términos normalizados;
- presencia del producto/recurso solicitado;
- número de fragmentos concordantes;
- cobertura de términos significativos de la pregunta;
- coincidencia de país, idioma y producto;
- estado documental aprobado/activo/vigente ya garantizado por retrieval;
- contradicciones entre fragmentos;
- tipo de consulta: factual simple vs. comparativa, interpretativa o abierta.

Una respuesta `direct_retrieval` requiere umbral explícito. Si el umbral no se cumple, el motor puede escalar al provider si las cuotas y flags lo permiten.

No debe existir un umbral oculto o dependiente de un proveedor externo.

## Motor de políticas

El futuro policy engine debe ser puro o mayormente puro, inyectable y testeable sin DB ni red.

Entrada conceptual:

```js
{
  question,
  normalizedQuestion,
  actorScope,
  deviceScope,
  retrieval,
  deterministicMatch,
  verifiedCacheMatch,
  quotaState,
  globalBudgetState,
  escalationState,
  flags
}
```

Salida conceptual:

```js
{
  decision: "deterministic" |
            "verified_cache" |
            "direct_retrieval" |
            "provider_assisted" |
            "insufficient",
  allowProvider: false,
  reason: "stable_machine_code",
  confidence: "high" | "medium" | "low"
}
```

`allowProvider` solo puede ser `true` cuando `decision` sea `provider_assisted` y todas las barreras estén satisfechas.

Las razones deben ser códigos estables y no incluir datos privados.

## Barreras de escalamiento a proveedor

Antes de cada llamada a provider deben cumplirse simultáneamente:

- `IRIS_AI_ENABLED=true`;
- provider habilitado por configuración;
- emergency kill switch no activo;
- pregunta válida y segura;
- contexto autorizado disponible;
- la política de confianza determina que no alcanza resolución local;
- cuota individual disponible;
- cuota de dispositivo/período disponible;
- cuota diaria global disponible;
- cuota mensual global disponible;
- porcentaje máximo de escalamiento no excedido;
- provider configurado;
- modelo configurado;
- límites de tokens válidos;
- timeout válido.

Si una barrera falla, no se llama al provider.

## Configuración propuesta

Nombres conceptuales, sujetos a revisión antes de implementar:

```text
IRIS_AI_ENABLED=false
IRIS_AI_PROVIDER=noop
IRIS_AI_MODEL=
IRIS_AI_EMERGENCY_STOP=true
IRIS_AI_MAX_INPUT_TOKENS=
IRIS_AI_MAX_OUTPUT_TOKENS=
IRIS_AI_TIMEOUT_MS=5000
IRIS_AI_USER_DAILY_LIMIT=5
IRIS_AI_DEVICE_DAILY_LIMIT=
IRIS_AI_GLOBAL_DAILY_LIMIT=
IRIS_AI_GLOBAL_MONTHLY_LIMIT=
IRIS_AI_MAX_PROVIDER_ESCALATION_PERCENT=
IRIS_AI_METRICS_ENABLED=false
```

La configuración debe validarse en un único módulo. No dispersar nombres de provider/modelo/límites por el código.

El modelo concreto de Groq debe ser variable de entorno. No debe quedar fijado rígidamente en múltiples archivos.

## Provider contract

El contrato debe seguir siendo independiente del proveedor.

Entrada mínima esperada:

```js
{
  question,
  fragments,
  signal,
  limits
}
```

`fragments` solo puede contener contenido autorizado y metadatos públicos mínimos requeridos para citas.

Salida mínima esperada:

```js
{
  status: "ok" | "rate_limited" | "quota_exhausted" | "error",
  answer,
  citations,
  usage: {
    inputTokens,
    outputTokens
  }
}
```

El provider adapter no decide si puede ser llamado. Esa decisión pertenece al policy engine/orquestador.

## Tratamiento de errores y cuotas

### Provider deshabilitado

- no intentar llamada;
- usar `direct_retrieval` si el contenido permite respuesta segura;
- de lo contrario `insufficient`.

### HTTP 429 / rate limit

- no reintentar indefinidamente;
- registrar métrica anonimizada;
- fallback local si existe;
- nunca afectar otras funciones de Nu App.

### Cuota diaria/mensual agotada

- bloquear nuevos escalamientos;
- no generar cargos automáticos;
- mantener capas determinísticas, caché y retrieval operativas;
- devolver fallback local o `insufficient`.

### Timeout / error de proveedor

- cancelar cuando sea posible;
- no exponer errores internos;
- fallback local o `insufficient`.

## Privacidad y datos enviados al proveedor

Permitido:

- pregunta normalizada estrictamente necesaria;
- instrucciones mínimas del sistema;
- fragmentos autorizados mínimos;
- título/version/fragmento u otros metadatos públicos mínimos para citas.

Prohibido:

- secretos y tokens;
- API keys;
- credenciales;
- direcciones IP;
- IDs internos innecesarios;
- claves de Object Storage;
- hashes internos;
- logs completos;
- perfiles completos de usuario;
- archivos PDF completos;
- contenido no relacionado con la pregunta.

## Caché verificada

La caché futura debe ser opcional y segura.

Una entrada debe estar vinculada al menos a:

- consulta normalizada o clave derivada no reversible cuando corresponda;
- alcance de país/idioma/producto;
- versiones documentales utilizadas;
- fecha de validación;
- expiración;
- estado de revisión/verificación.

No reutilizar una respuesta si alguno de los documentos base dejó de estar activo, aprobado o vigente.

## Métricas del piloto

Registrar de forma anonimizada y agregada:

- preguntas totales;
- respuestas `deterministic`;
- respuestas `verified_cache`;
- respuestas `direct_retrieval`;
- respuestas `provider_assisted`;
- respuestas `insufficient`;
- porcentaje de escalamiento;
- tokens de entrada y salida;
- costo estimado;
- errores del provider;
- 429;
- bloqueos por cuota;
- latencia por capa;
- valoración de utilidad cuando exista mecanismo aprobado.

No almacenar por defecto el texto completo de pregunta o respuesta.

## Costos y control financiero

Durante el piloto el objetivo es permanecer en Free tier y costo esperado USD 0.

Con referencia de 300 usuarios y 5 preguntas diarias:

- máximo teórico mensual: 45.000 preguntas;
- escalamiento 10 %: ~4.500 llamadas al provider;
- escalamiento 20 %: ~9.000 llamadas al provider.

Las estimaciones de costo no deben usarse como garantía. Antes de habilitar un plan pago deben medirse tokens reales, porcentaje de escalamiento, caché, latencia, utilidad y errores.

Ningún cambio futuro puede activar facturación paga, aumentar presupuesto o eliminar límites sin aprobación explícita.

## Threat model mínimo

La implementación debe probar al menos:

1. prompt injection desde pregunta de usuario;
2. prompt injection embebido en documento/PDF;
3. fragmentos manipulados para intentar revelar secretos;
4. cita inventada por el provider;
5. respuesta no respaldada por fragmentos;
6. respuesta excesivamente larga;
7. provider lento o que no responde;
8. HTTP 429;
9. cuota global agotada;
10. cuota individual agotada;
11. escalamiento porcentual agotado;
12. emergency stop activo;
13. AI deshabilitada;
14. ausencia de contexto autorizado;
15. documento retirado o vencido después de generar caché;
16. intento de enviar metadata interna no permitida al provider.

## Plan de implementación incremental

### PR siguiente: policy engine local

Implementar únicamente:

- tipos de decisión;
- evaluación de confianza determinista;
- barreras de escalamiento simuladas;
- configuración validada;
- provider `noop`/mock;
- tests unitarios exhaustivos.

No incluir Groq, red real, DB nueva, rutas públicas ni migraciones.

### PR posterior: cuotas y métricas

Agregar stores/interfaces inyectables para contadores y métricas, primero simulados. Diseñar persistencia separadamente si fuera necesaria.

### PR posterior: adapter Groq

Agregar adapter aislado y mockeado. Modelo configurable por entorno. Sin llamada real durante CI.

### Primera llamada real

Solo con aprobación explícita y condiciones simultáneas:

- Free tier confirmado;
- API key únicamente en Replit Secrets/gestor autorizado;
- datos sintéticos;
- flags temporales;
- límite de una cantidad mínima de llamadas;
- sin usuarios reales;
- sin rutas públicas;
- verificación previa de logs y ausencia de secretos;
- presupuesto efectivo igual a cero o límite explícitamente aprobado.

## Gates antes de cada merge futuro

- rama nueva desde `origin/main`;
- revisión del diff completo;
- sintaxis correcta;
- tests nuevos y regresión relevante;
- `git diff --check` limpio;
- CI en verde;
- secretos ausentes;
- flags públicos apagados;
- ninguna migración destructiva;
- ninguna modificación accidental de usuarios, rutinas, videos, notificaciones, cron u Object Storage;
- autorización explícita antes del merge.

## Fuera de alcance de este documento

- implementación del policy engine;
- creación de tablas;
- rutas de usuario/admin;
- integración real con Groq;
- API key;
- activación de IA;
- cambio de plan de Groq;
- despliegue de producción;
- modificación de límites actuales de Nu App.
