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

## 3. Autenticación, Claves y Secretos

- **Endpoints de Usuario de Registro/Recuperación**:
  - `POST /api/pilot/register` y `POST /api/pilot/recover` son públicos (protegidos por el código de invitación en el request body y rate limiting por IP).
- **Endpoints de Sesión de Usuario**:
  - `POST /api/pilot/renew` y `GET /api/pilot/me` requieren la cabecera HTTP `Authorization: Bearer <token>`.
  - El token es validado exclusivamente mediante `store.authenticateCredential({ token })` (o `store.renewCredential({ currentToken })`).
- **Rutas Administrativas**:
  - Exigen la cabecera HTTP `X-Pilot-Admin-Token`.
  - Comparación en tiempo constante: Se calcula el hash SHA-256 (usando `node:crypto`) de la cabecera provista y de la variable `PILOT_ADMIN_TOKEN`, y se comparan usando `crypto.timingSafeEqual` para prevenir ataques de canal lateral (timing attacks).
  - **Independencia Estricta**: `PILOT_ADMIN_TOKEN` es un secreto independiente que no se comparte con `ADMIN_TEST_TOKEN` ni `CRON_SECRET`.
  - **Identificador de Auditoría (`PILOT_ADMIN_KEY_ID`)**: `PILOT_ADMIN_TOKEN` es un secreto y NUNCA se almacena, persiste ni registra. Se requiere la variable de configuración `PILOT_ADMIN_KEY_ID` (p. ej. `"admin-key-v0"`), que es un identificador público/no-secreto que se pasa como parámetro `adminKeyId` a las funciones del store (`createRegistrationInvitation`, `createRecoveryInvitation`, `revokeAllCredentials`, `recordAdminAudit`).

---

## 4. Esquemas Mínimos de Request y Response

### 4.1. `POST /api/pilot/register`
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
  *(Nota: Si el cliente inyecta `userId` dentro del objeto `profile`, la capa HTTP o la normalización del store lo ignora completamente y utiliza el `userId` generado en el servidor).*
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

### 4.2. `POST /api/pilot/recover`
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

### 4.3. `POST /api/pilot/renew`
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

### 4.4. `GET /api/pilot/me`
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

### 4.5. `POST /api/pilot-admin/invitations/registration`
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

### 4.6. `POST /api/pilot-admin/invitations/recovery`
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

### 4.7. `POST /api/pilot-admin/credentials/revoke-all`
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

## 5. Códigos HTTP Posibles y Sanitización de Errores

- **`200 OK`**: Operación completada exitosamente.
- **`201 Created`**: Invitación o usuario registrado exitosamente.
- **`400 Bad Request`**:
  - Request malformado o JSON inválido.
  - Formato de código de invitación o perfil no válido.
  - Para `register` y `recover`: Cuando el store lanza `PilotStoreError`, se retorna mensaje genérico: `"La invitación no es válida o ya fue utilizada."`
  - Para endpoints administrativos: Cuando la entrada es inválida o el store lanza `PilotStoreError`, se retorna mensaje genérico: `"No se pudo completar la operación solicitada."`
- **`401 Unauthorized`**:
  - Para `renew` y `me`: Token de sesión ausente, malformado, o cuando el store lanza `PilotStoreError`, se retorna mensaje genérico: `"La sesión no es válida o ha expirado."`
  - Para `/api/pilot-admin/*`: Token `X-Pilot-Admin-Token` ausente o no coincidente. Mensaje genérico: `"Token de administración inválido."`
- **`403 Forbidden`**:
  - Violación de validación de origen en operaciones de escritura (`assertAllowedWriteOrigin`).
- **`404 Not Found`**:
  - Cuando `PILOT_ENABLED=false`, todas las rutas `/api/pilot/*` responden 404 independientemente del método, origen o contenido.
  - Cuando `PILOT_ADMIN_ROUTES_ENABLED=false`, todas las rutas `/api/pilot-admin/*` responden 404 independientemente del método, origen o contenido.
- **`429 Too Many Requests`**: Rate limit excedido (retorna respuesta JSON con `retryAfter`).
- **`500 Internal Server Error`**:
  - Cuando ocurre un `PilotStoreOperationalError` o cualquier excepción no controlada. Mensaje genérico: `"Error interno del servidor."`

**Regla de Oro de Seguridad**:
- Nunca comparar cadenas exactas de error ni exponer si un usuario existe o no mediante variaciones en los mensajes de respuesta.
- Nunca incluir en 4xx/500 ni en logs del servidor: código de invitación (`npi_`), token de sesión (`npt_`), HMACs, variables `PILOT_ADMIN_TOKEN` ni cabeceras de autorización.

---

## 6. Rate Limiting y Claves de Aislamiento

Se reutiliza la función existente `consumeSharedRateLimitV115` de `shared-rate-limit-v115.js` con su firma real:
`consumeSharedRateLimitV115(pool, { namespace, key, windowMs, max, now = Date.now() })`.

1. **`POST /api/pilot/register`**:
   - **Namespace**: `"pilot-register"`
   - **Límite**: 10 req / 10 min.
   - **Clave**: `ip:<clientIp>`
2. **`POST /api/pilot/recover`**:
   - **Namespace**: `"pilot-recover"`
   - **Límite**: 5 req / 10 min.
   - **Clave**: `ip:<clientIp>`
3. **`POST /api/pilot/renew`**:
   - **Namespace**: `"pilot-renew"`
   - **Límite**: 20 req / 10 min.
   - **Clave**: Si la autenticación Bearer es exitosa, se aísla por `user:<userId>`. Si la autenticación falla o el token es inválido/ausente, se aísla por `ip:<clientIp>` para mitigar ataques de fuerza bruta por IP.
4. **`GET /api/pilot/me`**:
   - **Namespace**: `"pilot-me"`
   - **Límite**: 60 req / 10 min.
   - **Clave**: Igual a renew, `user:<userId>` tras autenticación exitosa, fallback a `ip:<clientIp>` si falla.
5. **Rutas Administrativas `/api/pilot-admin/*`**:
   - **Namespace**: `"pilot-admin"`
   - **Límite**: 10 req / 10 min.
   - **Clave**: `admin:<clientIp>`
   - **Orden Crítico**: El rate limiter administrativo se ejecuta **antes** de evaluar el token `X-Pilot-Admin-Token` para evitar intentos ilimitados de adivinación de token.

---

## 7. Obtención y Normalización de `clientIp`

- `server.js` ya posee la configuración `app.set("trust proxy", 1)`.
- La capa HTTP obtiene la IP del cliente mediante `req.ip`. No se lee directamente la cabecera `X-Forwarded-For` no confiable enviada por el cliente.
- Antes de pasar `clientIp` al store o al rate limiter, se normaliza con `net.isIP(req.ip)`. Si no es una IP válida, se envía `null`.

---

## 8. Procesamiento de Body JSON y Límite de Payload

- En `server.js`, el parser global `express.json({ limit: "256kb" })` ya está registrado antes de la subida de rutas.
- Las rutas del piloto asumirán el body parseado por Express. Se aplicará además una validación estricta de esquema (descartando propiedades inesperadas o excesivamente grandes) para garantizar payloads mínimos y seguros.

---

## 9. Orden Real de Middlewares y Registro en `server.js`

Para garantizar que `PILOT_ENABLED=false` y `PILOT_ADMIN_ROUTES_ENABLED=false` devuelvan **siempre 404** sin importar si el cliente envía cabeceras `Origin` inválidas o prohibidas, los gatekeepers de las rutas piloto deben registrarse en `server.js` **antes** del middleware `assertAllowedWriteOrigin` de `/api`.

Ubicación exacta propuesta en `server.js`:

```javascript
// 1. Instanciación del router del piloto
const pilotRoutes = createPilotIdentityRoutesV0({
  express,
  store: pilotStore,
  nodeCrypto: crypto,
  pool,
  consumeSharedRateLimit: consumeSharedRateLimitV115,
  pilotEnabled: String(process.env.PILOT_ENABLED || "").toLowerCase() === "true",
  pilotAdminRoutesEnabled: String(process.env.PILOT_ADMIN_ROUTES_ENABLED || "").toLowerCase() === "true",
  pilotAdminToken: process.env.PILOT_ADMIN_TOKEN || "",
  pilotAdminKeyId: process.env.PILOT_ADMIN_KEY_ID || "admin-key-v0",
  logError: console.error,
  getClientIp: (req) => (net.isIP(req.ip || "") !== 0 ? req.ip : null)
});

// 2. Montaje de Gatekeepers de Feature Flags (404 inmediato si desactivado)
app.use("/api/pilot", (req, res, next) => {
  if (String(process.env.PILOT_ENABLED || "").toLowerCase() !== "true") {
    return res.status(404).json({ ok: false, error: "Ruta no disponible." });
  }
  next();
});

app.use("/api/pilot-admin", (req, res, next) => {
  if (String(process.env.PILOT_ADMIN_ROUTES_ENABLED || "").toLowerCase() !== "true") {
    return res.status(404).json({ ok: false, error: "Ruta no disponible." });
  }
  next();
});

// 3. Middlewares globales de /api (assertAllowedWriteOrigin, rate limiting general, etc.)
app.use("/api", assertAllowedWriteOrigin);

// 4. Montaje de sub-routers de la API
app.use(pilotRoutes);

// 5. Servidor estático y manejador global de errores...
```

---

## 10. Dependencias Exactas de `createPilotIdentityRoutesV0`

La factory inyectará explícitamente las siguientes dependencias sin depender de `process.env` disperso de forma ambigua:

```javascript
function createPilotIdentityRoutesV0({
  express,                  // Objeto Express o Router (require("express"))
  store,                    // Instancia transaccional de createPilotIdentityStoreV0
  nodeCrypto,               // Módulo node:crypto
  pool,                     // Pool de PostgreSQL
  consumeSharedRateLimit,   // Función consumeSharedRateLimitV115
  pilotEnabled = false,     // Boolean o string normalizado de flag usuario
  pilotAdminRoutesEnabled = false, // Boolean de flag administrativo
  pilotAdminToken = "",     // Secreto de token admin
  pilotAdminKeyId = "",     // Identificador para auditoría
  logError,                 // Función de logging seguro
  getClientIp               // Función para extraer/validar req.ip
}) {
  // Configuración estricta de las rutas y retorno de router Express
}
```

---

## 11. Plan de Pruebas Unitarias e Integración

Se creará el archivo `pilot-identity-routes-v0.test.js` usando `node:test` y `supertest` o un servidor HTTP en memoria:

1. **Pruebas de Feature Flags y Origen**:
   - Con `PILOT_ENABLED=false`, verificar 404 en `/api/pilot/*` incluso con cabeceras `Origin` no permitidas o métodos POST.
   - Con `PILOT_ADMIN_ROUTES_ENABLED=false`, verificar 404 en `/api/pilot-admin/*` con cualquier request.
2. **Pruebas de Formato de Bearer Token**:
   - Intentos con Bearer malformado, duplicado, esquema `Basic`, o cadena mayor a 10KB deben ser rechazados con HTTP 401.
3. **Pruebas de Token Administrativo**:
   - `X-Pilot-Admin-Token` ausente, incorrecto o de longitud excesiva debe retornar HTTP 401.
   - Token válido ejecuta la operación y genera registro de auditoría con `PILOT_ADMIN_KEY_ID`.
4. **Pruebas de Rate Limiting por IP**:
   - Intentos fallidos repetidos de autenticación o de tokens inválidos provocan un bloqueo HTTP 429 con cabecera `Retry-After`.
5. **Pruebas de Inyección y Payloads**:
   - Requests con campos extra o `userId` inyectado en `/api/pilot/register` ignoran el `userId` inyectado y procesan el registro con el ID generado en el servidor.
6. **Pruebas de Sanitización de Errores y Logs**:
   - Forzar fallos de base de datos o de conexión y verificar que la respuesta HTTP sea genérica (`500 Internal Server Error`).
   - Verificar que ningún token (`npt_`), código (`npi_`), HMAC o secreto aparezca en respuestas o en el logger.
7. **Pruebas de No Regresión**:
   - Confirmar que las rutas existentes (`/api/bootstrap`, `/api/state`, `/api/profile`, `/api/routine/*`, `/api/product-routines/*`, `/api/push/*`) siguen funcionando exactamente igual sin alteraciones.

---

## 12. Archivos a Crear en la Siguiente Fase

1. `pilot-identity-routes-v0.js`: Implementación de la capa HTTP y factory.
2. `pilot-identity-routes-v0.test.js`: Suite completa de pruebas unitarias e integración.

---

## 13. Decisiones y Riesgos Pendientes

1. **Estrategia de Renovación en el Frontend**:
   - En fases futuras, la PWA llamará periódicamente a `GET /api/pilot/me` y renovará automáticamente vía `POST /api/pilot/renew` cuando `daysUntilExpiry` sea menor a 7 días.
2. **Vinculación Progresiva de Rutas Existentes**:
   - Mantener desacopladas las rutas existentes (`/api/bootstrap`, `/api/state`) hasta que la fase de migración de frontend conecte la identidad del piloto.
