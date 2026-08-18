# Diseño de la Capa HTTP de Identidad Piloto V0 para Nu App

## 1. Resumen Ejecutivo
Este documento especifica el diseño técnico corregido de la capa HTTP de Identidad Piloto V0 (`pilot-identity-routes-v0.js`) para Nu App. Esta capa expone endpoints REST seguros bajo `/api/pilot/*` para la experiencia de usuario y `/api/pilot-admin/*` para administración, delegando las operaciones transaccionales a `pilot-identity-store-v0.js`, las operaciones criptográficas avanzadas de hashes/timing a `node:crypto`, y el rate limiting a `shared-rate-limit-v115.js`.

---

## 2. Lista de Endpoints, Método y Propósito

### Rutas de Usuario (`/api/pilot/*`)
1. **`POST /api/pilot/register`**
   - **Propósito**: Registrar un nuevo usuario utilizando un código de invitación de registro (`registration`). Retorna la entidad de usuario creada (con `userId` generado exclusivamente por el servidor) y una credencial de sesión inicial (TTL 30 días).
2. **`POST /api/pilot/recover`**
   - **Propósito**: Recuperar el acceso de un usuario existente utilizando un código de invitación de recuperación (`recovery`). Invalida la credencial anterior del usuario, conserva exactamente el mismo `user_id` y emite una nueva credencial.
3. **`POST /api/pilot/renew`**
   - **Propósito**: Renovar la credencial de sesión activa autenticada antes de su vencimiento. Invalida el token actual y emite un token nuevo con 30 días de vigencia contados desde el reloj de PostgreSQL.
4. **`GET /api/pilot/me`**
   - **Propósito**: Consultar el perfil y el estado/vigencia de la sesión actual autenticada (retorna `userId`, fecha de expiración y días restantes hasta el vencimiento).

### Rutas Administrativas (`/api/pilot-admin/*`)
5. **`POST /api/pilot-admin/invitations/registration`**
   - **Propósito**: Crear una nueva invitación de registro especificando opcionalmente las horas de expiración (default 48h). Registra evento de auditoría atómico con `PILOT_ADMIN_KEY_ID`.
6. **`POST /api/pilot-admin/invitations/recovery`**
   - **Propósito**: Crear una invitación de recuperación para un `userId` específico (default 24h). Registra evento de auditoría atómico con `PILOT_ADMIN_KEY_ID`.
7. **`POST /api/pilot-admin/credentials/revoke-all`**
   - **Propósito**: Revocar todas las credenciales activas de un usuario objetivo. Registra evento de auditoría atómico con `PILOT_ADMIN_KEY_ID`.

---

## 3. Autenticación, Claves y Configuración Normalizada

### 3.1. Normalización de Variables de Configuración
La configuración se evalúa y normaliza **una sola vez** al instanciar la capa de rutas:
- `pilotEnabled`: booleano (`true` o `false`).
- `pilotAdminRoutesEnabled`: booleano (`true` o `false`).
- `pilotAdminToken`: cadena de texto normalizada (`trim()`).
- `pilotAdminKeyId`: cadena de texto normalizada (`trim()`).

**Validación Estricta de Inicialización**:
Si `pilotAdminRoutesEnabled === true`, la inicialización **falla inmediatamente** (lanzando una excepción explícita) si `pilotAdminToken` o `pilotAdminKeyId` están ausentes, vacíos o contienen únicamente espacios. **No se utiliza ningún valor por defecto ni fallback silencioso.**

Los gatekeepers de rutas y los handlers utilizan exclusivamente estos valores ya normalizados, sin realizar lecturas posteriores de `process.env`.

### 3.2. Mecanismos de Autenticación
- **Endpoints de Usuario de Registro/Recuperación**:
  - `POST /api/pilot/register` y `POST /api/pilot/recover` son públicos (protegidos por el código de invitación en el request body y rate limiting por IP).
- **Endpoints de Sesión de Usuario**:
  - `POST /api/pilot/renew` y `GET /api/pilot/me` requieren la cabecera HTTP `Authorization: Bearer <token>`.
  - La autenticación de la credencial se realiza exclusivamente mediante `store.authenticateCredential({ token })`.
- **Rutas Administrativas**:
  - Exigen la cabecera HTTP `X-Pilot-Admin-Token`.
  - Comparación en tiempo constante: Se calcula el hash SHA-256 (usando `node:crypto`) de la cabecera provista y de `pilotAdminToken`, y se comparan con `crypto.timingSafeEqual`.
  - **Independencia Estricta**: `PILOT_ADMIN_TOKEN` es un secreto independiente que no se comparte con `ADMIN_TEST_TOKEN` ni `CRON_SECRET`.
  - **Identificador de Auditoría (`PILOT_ADMIN_KEY_ID`)**: `PILOT_ADMIN_TOKEN` es un secreto y NUNCA se almacena, persiste ni registra. Se requiere `PILOT_ADMIN_KEY_ID`, un identificador público/no-secreto que se pasa como parámetro `adminKeyId` al store (`createRegistrationInvitation`, `createRecoveryInvitation`, `revokeAllCredentials`, `recordAdminAudit`).

---

## 4. Validación Estricta de Bodies (Allowlists)

Se aplica una validación estricta con **allowlists exactas** por endpoint. Cualquier propiedad adicional no declarada o la inyección de `userId` en endpoints no permitidos provoca un error HTTP 400 (`"La solicitud contiene campos no permitidos."`):

1. **`POST /api/pilot/register`**:
   - Permite **únicamente** las propiedades raíz: `invitationCode` y `profile`.
   - `profile` permite **únicamente**: `name`, `country`, `timezone`, `notificationTime`.
   - **Rechazo de Inyección**: Si se incluye `userId` en `profile` o en la raíz del body, la solicitud se rechaza inmediatamente con HTTP 400.
2. **`POST /api/pilot/recover`**:
   - Permite **únicamente**: `invitationCode`.
3. **`POST /api/pilot/renew`**:
   - Permite **únicamente** un body vacío (`{}`). Si se envían propiedades adicionales, se rechaza con HTTP 400.
4. **`GET /api/pilot/me`**:
   - Endpoint HTTP GET sin body. Si el cliente envía un payload con propiedades, se rechaza con HTTP 400.
5. **`POST /api/pilot-admin/invitations/registration`**:
   - Permite **únicamente**: `expiresInHours` (opcional).
6. **`POST /api/pilot-admin/invitations/recovery`**:
   - Permite **únicamente**: `userId` y `expiresInHours` (opcional).
7. **`POST /api/pilot-admin/credentials/revoke-all`**:
   - Permite **únicamente**: `userId`.

---

## 5. Esquemas Mínimos de Request y Response

### 5.1. `POST /api/pilot/register`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "invitationCode": "npi_1234567890abcdef1234567890abcdef",
    "profile": {
      "name": "María Pérez",
      "country": "AR",
      "timezone": "America/Argentina/Buenos_Aires",
      "notificationTime": "09:00"
    }
  }
  ```
- **Response Body (201 Created)**:
  ```json
  {
    "ok": true,
    "user": {
      "userId": "usr_abc123",
      "name": "María Pérez",
      "country": "AR",
      "timezone": "America/Argentina/Buenos_Aires",
      "notificationTime": "09:00",
      "currentDay": 1,
      "cycle": 1
    },
    "credential": {
      "token": "npt_0123456789abcdef0123456789abcdef0123456789a",
      "expiresAt": "2026-09-15T12:00:00.000Z"
    }
  }
  ```

### 5.2. `POST /api/pilot/recover`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "invitationCode": "npi_abcdef1234567890abcdef1234567890"
  }
  ```
- **Response Body (200 OK)**:
  ```json
  {
    "ok": true,
    "user": {
      "userId": "usr_abc123",
      "name": "María Pérez",
      "country": "AR",
      "timezone": "America/Argentina/Buenos_Aires",
      "notificationTime": "09:00"
    },
    "credential": {
      "token": "npt_fedcba9876543210fedcba9876543210fedcba9876b",
      "expiresAt": "2026-09-15T12:00:00.000Z"
    }
  }
  ```

### 5.3. `POST /api/pilot/renew`
- **Headers**: `Authorization: Bearer npt_...`, `Content-Type: application/json`
- **Request Body**: `{}`
- **Response Body (200 OK)**:
  ```json
  {
    "ok": true,
    "credential": {
      "token": "npt_newtokenbase64urlstringcharacters43longg",
      "expiresAt": "2026-09-15T12:00:00.000Z"
    }
  }
  ```

### 5.4. `GET /api/pilot/me`
- **Headers**: `Authorization: Bearer npt_...`
- **Response Body (200 OK)**:
  ```json
  {
    "ok": true,
    "user": {
      "userId": "usr_abc123"
    },
    "session": {
      "expiresAt": "2026-09-15T12:00:00.000Z",
      "daysUntilExpiry": 29
    }
  }
  ```

### 5.5. `POST /api/pilot-admin/invitations/registration`
- **Headers**: `X-Pilot-Admin-Token: <secret>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "expiresInHours": 48
  }
  ```
- **Response Body (201 Created)**:
  ```json
  {
    "ok": true,
    "invitation": {
      "id": 10,
      "code": "npi_1234567890abcdef1234567890abcdef",
      "expiresAt": "2026-08-18T12:00:00.000Z"
    }
  }
  ```

### 5.6. `POST /api/pilot-admin/invitations/recovery`
- **Headers**: `X-Pilot-Admin-Token: <secret>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "userId": "usr_abc123",
    "expiresInHours": 24
  }
  ```
- **Response Body (201 Created)**:
  ```json
  {
    "ok": true,
    "invitation": {
      "id": 11,
      "code": "npi_fedcba9876543210fedcba9876543210",
      "recoveryUserId": "usr_abc123",
      "expiresAt": "2026-08-17T12:00:00.000Z"
    }
  }
  ```

### 5.7. `POST /api/pilot-admin/credentials/revoke-all`
- **Headers**: `X-Pilot-Admin-Token: <secret>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "userId": "usr_abc123"
  }
  ```
- **Response Body (200 OK)**:
  ```json
  {
    "ok": true,
    "revokedCount": 1
  }
  ```

---

## 6. Códigos HTTP Posibles y Sanitización de Errores

- **`200 OK`**: Operación completada exitosamente.
- **`201 Created`**: Invitación o usuario registrado exitosamente.
- **`400 Bad Request`**:
  - Request malformado, JSON inválido o presencia de propiedades no permitidas/extra en el body.
  - Inyección de `userId` en el registro.
  - Para `register` y `recover`: Cuando el store lanza `PilotStoreError`, se retorna mensaje genérico: `"La invitación no es válida o ya fue utilizada."`
  - Para endpoints administrativos: Cuando la entrada es inválida o el store lanza `PilotStoreError`, se retorna mensaje genérico: `"No se pudo completar la operación solicitada."`
- **`401 Unauthorized`**:
  - Para `renew` y `me`: Token de sesión ausente, malformado, expirado, revocado o cuando el store lanza `PilotStoreError`. Mensaje genérico: `"La sesión no es válida o ha expirado."`
  - Para `/api/pilot-admin/*`: Token `X-Pilot-Admin-Token` ausente o no coincidente. Mensaje genérico: `"Token de administración inválido."`
- **`403 Forbidden`**:
  - Violación de validación de origen en operaciones de escritura (`assertAllowedWriteOrigin`).
- **`404 Not Found`**:
  - Cuando `pilotEnabled === false`, todas las rutas `/api/pilot/*` responden 404 independientemente del método, origen o contenido.
  - Cuando `pilotAdminRoutesEnabled === false`, todas las rutas `/api/pilot-admin/*` responden 404 independientemente del método, origen o contenido.
- **`429 Too Many Requests`**: Rate limit excedido (retorna respuesta JSON con `retryAfter`).
- **`500 Internal Server Error`**:
  - Cuando ocurre un `PilotStoreOperationalError` o cualquier excepción no controlada. Mensaje genérico: `"Error interno del servidor."`

**Regla de Oro de Seguridad**:
- Nunca comparar cadenas exactas de error ni exponer si un usuario existe o no mediante variaciones en los mensajes de respuesta.
- Nunca incluir en 4xx/500 ni en logs del servidor: código de invitación (`npi_`), token de sesión (`npt_`), HMACs, variables `PILOT_ADMIN_TOKEN` ni cabeceras de autorización.

---

## 7. Rate Limiting, Claves de Aislamiento y Secuencia Exacta de Ejecución

Se reutiliza la función existente `consumeSharedRateLimitV115` de `shared-rate-limit-v115.js` con su firma real:
`consumeSharedRateLimitV115(pool, { namespace, key, windowMs, max, now = Date.now() })`.

### 7.1. Secuencia Exacta para `POST /api/pilot/renew`

Para evitar revocar la credencial activa prematuramente en caso de que la solicitud sea bloqueada posteriormente por el rate limit por usuario, `POST /api/pilot/renew` sigue de forma estricta la siguiente secuencia:

1. **Validación Superficial de Cabecera**:
   - Verificar formato sintáctico de `Authorization: Bearer <token>` (prefijo `npt_`, longitud exacta de 47 caracteres, juego de caracteres Base64URL válido).
   - Si la cabecera es nula, malformada o inválida sintácticamente, responder HTTP 401 inmediatamente (`"La sesión no es válida o ha expirado."`).
2. **Consumo de Rate Limit por IP (ANTES de consultar PostgreSQL)**:
   - Consumir rate limit en namespace `"pilot-renew-ip"` con clave `ip:<clientIp>` (máximo 20 req / 10 min).
   - Si se supera el límite por IP, responder HTTP 429 (`Retry-After`) **sin realizar ninguna consulta a PostgreSQL**.
3. **Autenticación en PostgreSQL sin Revocar**:
   - Ejecutar exclusivamente `store.authenticateCredential({ token })` para validar la sesión y obtener `userId`.
   - Si la credencial no existe, está expirada o revocado, responder HTTP 401 (`"La sesión no es válida o ha expirado."`).
4. **Consumo de Rate Limit por Usuario**:
   - Consumir rate limit en namespace `"pilot-renew-user"` con clave `user:<userId>` (máximo 20 req / 10 min).
   - Si se supera el límite por usuario, responder HTTP 429 (`Retry-After`). La credencial actual sigue intacta y válida.
5. **Renovación de Credencial**:
   - Ejecutar `store.renewCredential({ currentToken: token })`. Esto revoca atómicamente el token actual y genera la nueva credencial con 30 días de vigencia en PostgreSQL.
6. **Retorno de Respuesta**:
   - Responder HTTP 200 OK con la nueva credencial y su fecha de expiración.

### 7.2. Secuencia Exacta para `GET /api/pilot/me`

1. **Validación Superficial de Cabecera**:
   - Verificar formato sintáctico de `Authorization: Bearer <token>`. Si es inválido, responder HTTP 401.
2. **Consumo de Rate Limit por IP (ANTES de consultar PostgreSQL)**:
   - Consumir rate limit en namespace `"pilot-me-ip"` con clave `ip:<clientIp>` (máximo 60 req / 10 min).
   - Si se supera, responder HTTP 429 sin consultar PostgreSQL.
3. **Autenticación en PostgreSQL**:
   - Ejecutar `store.authenticateCredential({ token })` para validar la credencial y obtener `userId`.
   - Si falla, responder HTTP 401.
4. **Consumo de Rate Limit por Usuario**:
   - Consumir rate limit en namespace `"pilot-me-user"` con clave `user:<userId>` (máximo 60 req / 10 min).
   - Si se supera, responder HTTP 429.
5. **Consulta de Expiración**:
   - Ejecutar `store.getCredentialExpiry({ token })`.
6. **Construcción y Envío de Respuesta**:
   - Responder HTTP 200 OK con `userId` y datos de vigencia de la sesión (`expiresAt`, `daysUntilExpiry`).

### 7.3. Secuencia para Endpoints Públicos y Administrativos

- **`POST /api/pilot/register`**:
  1. Validar body y allowlist.
  2. Consumir rate limit en namespace `"pilot-register"` con clave `ip:<clientIp>` (10 req / 10 min).
  3. Ejecutar `store.registerUser`.
- **`POST /api/pilot/recover`**:
  1. Validar body y allowlist.
  2. Consumir rate limit en namespace `"pilot-recover"` con clave `ip:<clientIp>` (5 req / 10 min).
  3. Ejecutar `store.recoverAccess`.
- **Rutas Administrativas `/api/pilot-admin/*`**:
  1. Consumir rate limit en namespace `"pilot-admin"` con clave `admin:<clientIp>` (10 req / 10 min) **ANTES** de verificar `X-Pilot-Admin-Token`.
  2. Verificar `X-Pilot-Admin-Token` con `crypto.timingSafeEqual`.
  3. Validar body y allowlist.
  4. Ejecutar operación administrativa en el store pasando `pilotAdminKeyId`.

---

## 8. Obtención y Normalización de `clientIp`

- `server.js` ya posee la configuración `app.set("trust proxy", 1)`.
- La capa HTTP obtiene la IP del cliente mediante `req.ip`. No se lee directamente la cabecera `X-Forwarded-For` no confiable enviada por el cliente.
- Antes de pasar `clientIp` al store o al rate limiter, se normaliza con `net.isIP(req.ip)`. Si no es una IP válida, se envía `null`.

---

## 9. Orden Real de Middlewares y Registro en `server.js`

Para garantizar que `pilotEnabled === false` y `pilotAdminRoutesEnabled === false` devuelvan **siempre 404** sin importar si el cliente envía cabeceras `Origin` inválidas o prohibidas, los gatekeepers deben registrarse en `server.js` **antes** del middleware `assertAllowedWriteOrigin` de `/api`.

Ubicación exacta propuesta en `server.js`:

```javascript
// 1. Normalización de banderas de forma previa y única
const pilotEnabled = String(process.env.PILOT_ENABLED || "").toLowerCase() === "true";
const pilotAdminRoutesEnabled = String(process.env.PILOT_ADMIN_ROUTES_ENABLED || "").toLowerCase() === "true";

// 2. Instanciación del router del piloto
const pilotRoutes = createPilotIdentityRoutesV0({
  express,
  store: pilotStore,
  nodeCrypto: crypto,
  pool,
  consumeSharedRateLimit: consumeSharedRateLimitV115,
  pilotEnabled,
  pilotAdminRoutesEnabled,
  pilotAdminToken: process.env.PILOT_ADMIN_TOKEN,
  pilotAdminKeyId: process.env.PILOT_ADMIN_KEY_ID,
  logError: console.error,
  getClientIp: (req) => (net.isIP(req.ip || "") !== 0 ? req.ip : null)
});

// 3. Gatekeepers de Feature Flags (404 inmediato usando banderas ya normalizadas)
app.use("/api/pilot", (req, res, next) => {
  if (!pilotEnabled) {
    return res.status(404).json({ ok: false, error: "Ruta no disponible." });
  }
  next();
});

app.use("/api/pilot-admin", (req, res, next) => {
  if (!pilotAdminRoutesEnabled) {
    return res.status(404).json({ ok: false, error: "Ruta no disponible." });
  }
  next();
});

// 4. Middlewares globales de /api (assertAllowedWriteOrigin, rate limiting general, etc.)
app.use("/api", assertAllowedWriteOrigin);

// 5. Montaje del router de la API del piloto
app.use(pilotRoutes);

// 6. Servidor estático y manejador global de errores...
```

---

## 10. Dependencias Exactas de `createPilotIdentityRoutesV0`

La factory inyectará explícitamente las siguientes dependencias:

```javascript
function createPilotIdentityRoutesV0({
  express,                  // Objeto Express o Router (require("express"))
  store,                    // Instancia transaccional de createPilotIdentityStoreV0
  nodeCrypto,               // Módulo node:crypto
  pool,                     // Pool de PostgreSQL
  consumeSharedRateLimit,   // Función consumeSharedRateLimitV115
  pilotEnabled = false,     // Boolean ya normalizado
  pilotAdminRoutesEnabled = false, // Boolean ya normalizado
  pilotAdminToken,          // Secreto de token admin (string)
  pilotAdminKeyId,          // Identificador para auditoría (string)
  logError,                 // Función de logging seguro
  getClientIp               // Función para extraer/validar req.ip
}) {
  if (pilotAdminRoutesEnabled) {
    const token = String(pilotAdminToken || "").trim();
    const keyId = String(pilotAdminKeyId || "").trim();
    if (!token || !keyId) {
      throw new Error(
        "Falta la configuración de administración (PILOT_ADMIN_TOKEN y PILOT_ADMIN_KEY_ID son requeridos)."
      );
    }
  }

  // Configuración de rutas y retorno de router Express
}
```

---

## 11. Plan de Pruebas Unitarias e Integración

Se creará el archivo `pilot-identity-routes-v0.test.js` usando `node:test` y `supertest` o un servidor HTTP en memoria:

1. **Pruebas de Inicialización y Configuración**:
   - Instanciar con `pilotAdminRoutesEnabled=true` sin `pilotAdminToken` o sin `pilotAdminKeyId` debe lanzar error explícito de inicialización.
2. **Pruebas de Feature Flags y Origen**:
   - Con `pilotEnabled=false`, verificar HTTP 404 en `/api/pilot/*` incluso si el cliente envía una cabecera `Origin` no permitida o un método POST.
   - Con `pilotAdminRoutesEnabled=false`, verificar HTTP 404 en `/api/pilot-admin/*`.
3. **Pruebas de Validación Estricta de Bodies (Allowlists)**:
   - Request a `/api/pilot/register` con propiedades no permitidas o con `userId` inyectado en `profile` o en la raíz debe retornar HTTP 400.
   - Request a `/api/pilot/renew` con body no vacío debe retornar HTTP 400.
   - Requests a endpoints administrativos con campos extra deben retornar HTTP 400.
4. **Pruebas de Formato de Bearer Token y Secuencia Rate Limit**:
   - Bearer malformado, duplicado, esquema `Basic` o cadena >10KB debe ser rechazado con HTTP 401.
   - Confirmar que intentos no autenticados en `renew` y `me` consumen el rate limit por IP **antes** de consultar PostgreSQL.
   - En `renew`, verificar que si falla el rate limit por usuario en el paso 4, la credencial actual **no** fue revocada.
5. **Pruebas de Token Administrativo y Auditoría**:
   - `X-Pilot-Admin-Token` ausente o no coincidente retorna HTTP 401 (sin consultar la DB de auditoría).
   - Token válido ejecuta la acción y registra auditoría asociando `PILOT_ADMIN_KEY_ID`.
6. **Pruebas de Sanitización de Errores y Logs**:
   - Forzar errores de base de datos o de conexión y verificar respuesta genérica (`500 Internal Server Error`).
   - Confirmar la usencia total de tokens (`npt_`), códigos (`npi_`), HMACs o secretos en logs y respuestas.
7. **Pruebas de No Regresión**:
   - Confirmar que las rutas existentes (`/api/bootstrap`, `/api/state`, `/api/profile`, `/api/routine/*`, `/api/product-routines/*`, `/api/push/*`) continúan funcionando sin alteraciones.

---

## 12. Archivos a Crear en la Siguiente Fase

1. `pilot-identity-routes-v0.js`: Implementación de la capa HTTP y factory.
2. `pilot-identity-routes-v0.test.js`: Suite completa de pruebas unitarias e integración.

---

## 13. Decisiones y Riesgos Pendientes

1. **Estrategia de Renovación en el Frontend**:
   - En fases futuras, la PWA llamará a `GET /api/pilot/me` y renovará automáticamente vía `POST /api/pilot/renew` cuando `daysUntilExpiry` sea menor a 7 días.
2. **Vinculación Progresiva de Rutas Existentes**:
   - Mantener desacopladas las rutas existentes (`/api/bootstrap`, `/api/state`) hasta que la fase de migración de frontend conecte la identidad del piloto.
