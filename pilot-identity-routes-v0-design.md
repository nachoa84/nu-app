# Diseño de la Capa HTTP de Identidad Piloto V0 para Nu App

## 1. Resumen Ejecutivo
Este documento especifica el diseño técnico de la capa HTTP de Identidad Piloto V0 (`pilot-identity-routes-v0.js`) para Nu App. Esta capa expone endpoints REST seguros bajo `/api/pilot/*` para la experiencia del usuario y `/api/pilot-admin/*` para administración, delegando las operaciones transaccionales a `pilot-identity-store-v0.js` y las operaciones criptográficas a `pilot-crypto-v0.js`.

---

## 2. Lista de Endpoints, Método y Propósito

### Rutas de Usuario (`/api/pilot/*`)
1. **`POST /api/pilot/register`**
   - **Propósito**: Registrar un nuevo usuario utilizando un código de invitación de registro (`registration`). Retorna la entidad de usuario creada (con `userId` generado por el servidor) y una credencial de sesión inicial (TTL 30 días).
2. **`POST /api/pilot/recover`**
   - **Propósito**: Recuperar el acceso de un usuario existente utilizando un código de invitación de recuperación (`recovery`). Invalida credenciales anteriores del usuario, conserva exactamente el mismo `user_id` y emite una nueva credencial.
3. **`POST /api/pilot/renew`**
   - **Propósito**: Renovar una credencial de sesión activa antes de su fecha de expiración. Invalida el token actual y emite un token nuevo con 30 días de vigencia adicionados desde el tiempo de PostgreSQL.
4. **`GET /api/pilot/session`**
   - **Propósito**: Consultar el estado y la vigencia de la sesión actual autenticada (retorna fecha de expiración y días restantes).

### Rutas Administrativas (`/api/pilot-admin/*`)
5. **`POST /api/pilot-admin/invitations/registration`**
   - **Propósito**: Crear una nueva invitación de registro con su tiempo de expiración en horas (default 48h). Registra evento de auditoría.
6. **`POST /api/pilot-admin/invitations/recovery`**
   - **Propósito**: Crear una invitación de recuperación para un `userId` específico con su tiempo de expiración en horas (default 24h). Registra evento de auditoría.
7. **`POST /api/pilot-admin/credentials/revoke-all`**
   - **Propósito**: Revocar todas las credenciales activas de un usuario objetivo. Registra evento de auditoría.

---

## 3. Autenticación de Endpoints

- **`POST /api/pilot/register`**: Pública (protegida por el código de invitación en el request body y rate limiting por IP).
- **`POST /api/pilot/recover`**: Pública (protegida por el código de invitación de recuperación en el request body y rate limiting por IP).
- **`POST /api/pilot/renew`**: Autenticada mediante cabecera HTTP `Authorization: Bearer <token>`.
- **`GET /api/pilot/session`**: Autenticada mediante cabecera HTTP `Authorization: Bearer <token>`.
- **Rutas `/api/pilot-admin/*`**: Autenticadas mediante cabecera HTTP `X-Pilot-Admin-Token` comparada contra la variable de entorno `PILOT_ADMIN_TOKEN`.
  - **Comparación Segura**: Se calcula el hash SHA-256 del token provisto y del token esperado, y se comparan usando `crypto.timingSafeEqual` para prevenir ataques de tiempo.
  - **Independencia de Tokens**: `PILOT_ADMIN_TOKEN` es completamente independiente de `ADMIN_TEST_TOKEN` y `CRON_SECRET`.

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
  *(Nota: Si el cliente envía `userId` dentro de `profile`, la capa HTTP o el store lo descarta y utiliza exclusivamente el generado en el servidor).*
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

### 4.4. `GET /api/pilot/session`
- **Headers**: `Authorization: Bearer npt_...`
- **Response Body (200 OK)**:
  ```json
  {
    "ok": true,
    "session": {
      "userId": "usr_abc123",
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

## 5. Códigos HTTP Posibles

- **`200 OK`**: Operación completada exitosamente.
- **`201 Created`**: Recurso (registro o invitación) creado exitosamente.
- **`400 Bad Request`**:
  - Request malformado o JSON no válido.
  - Formato de código de invitación o perfil inválido.
  - Código de invitación expirado o ya utilizado.
- **`401 Unauthorized`**:
  - Token de sesión inválido, expirado, revocado o ausente en cabecera `Authorization`.
  - Token administrativo `X-Pilot-Admin-Token` inválido o ausente.
- **`403 Forbidden`**: Violación de origen en requests de escritura (`assertAllowedWriteOrigin`).
- **`404 Not Found`**:
  - `PILOT_ENABLED=false` (rutas `/api/pilot/*` responden 404).
  - `PILOT_ADMIN_ROUTES_ENABLED=false` (rutas `/api/pilot-admin/*` responden 404).
  - Usuario objetivo no encontrado en endpoints administrativos.
- **`429 Too Many Requests`**: Rate limit excedido.
- **`500 Internal Server Error`**: Errores operacionales o de base de datos no controlados (retorna mensaje genérico `"Error interno del servidor."`).
- **`503 Service Unavailable`**: Base de datos o variables de entorno requeridas no configuradas.

---

## 6. Rate Limits y Claves de Aislamiento

Se reutiliza la función `consumeSharedRateLimitV115` de `shared-rate-limit-v115.js` sin crear un sistema paralelo.

1. **`POST /api/pilot/register`**
   - **Namespace**: `"pilot-register"`
   - **Parámetros**: 10 solicitudes por 10 minutos (10 req / 10 min).
   - **Clave de Aislamiento**: `ip:<req.ip>`
2. **`POST /api/pilot/recover`**
   - **Namespace**: `"pilot-recover"`
   - **Parámetros**: 5 solicitudes por 10 minutos (5 req / 10 min).
   - **Clave de Aislamiento**: `ip:<req.ip>`
3. **`POST /api/pilot/renew`**
   - **Namespace**: `"pilot-renew"`
   - **Parámetros**: 20 solicitudes por 10 minutos (20 req / 10 min).
   - **Clave de Aislamiento**: `user:<userId>` (del token autenticado) o `ip:<req.ip>`.
4. **`GET /api/pilot/session`**
   - **Namespace**: `"pilot-session"`
   - **Parámetros**: 60 solicitudes por 10 minutos (60 req / 10 min).
   - **Clave de Aislamiento**: `user:<userId>` (del token autenticado) o `ip:<req.ip>`.
5. **Rutas `/api/pilot-admin/*`**
   - **Namespace**: `"pilot-admin"`
   - **Parámetros**: 10 solicitudes por 10 minutos (10 req / 10 min).
   - **Clave de Aislamiento**: `admin:<req.ip>`

---

## 7. Orden de Middlewares

En la futura integración con Express, el orden de registro de los middlewares debe ser el siguiente:

1. **Gatekeepers de Feature Flags**:
   - Para `/api/pilot/*`: Verificar `PILOT_ENABLED === "true"`. Si es falso, responder 404 inmediatamente.
   - Para `/api/pilot-admin/*`: Verificar `PILOT_ADMIN_ROUTES_ENABLED === "true"`. Si es falso, responder 404 inmediatamente.
2. **Body Parser & Origin Check**:
   - `express.json({ limit: "256kb" })`
   - `assertAllowedWriteOrigin` (protección contra CSRF y escrituras cross-origin).
3. **Rate Limiters**:
   - Middleware invocando `consumeSharedRateLimitV115` por namespace y clave de aislamiento.
4. **Middlewares de Autenticación**:
   - `extractBearerToken`: Extrae el token de la cabecera `Authorization: Bearer <token>`.
   - `authenticatePilotSession`: Ejecuta `store.authenticateCredential({ token })` y adjunta `req.pilotUser`.
   - `assertPilotAdminToken`: Compara la cabecera `X-Pilot-Admin-Token` usando `crypto.timingSafeEqual`.
5. **Route Handlers**:
   - Ejecución de los handlers específicos de la API del piloto.
6. **Manejador Global de Errores**:
   - Middleware de error `(err, req, res, next)` para sanitizar cualquier excepción no capturada y devolver status 500 genérico.

*Ubicación requerida en la futura integración*: Las rutas se deben registrar **antes** de `express.static` y **antes** del manejador global de errores en `server.js`.

---

## 8. Dependencias de la Factory `createPilotIdentityRoutesV0`

La factory inyectará explícitamente todas las dependencias necesarias:

```javascript
function createPilotIdentityRoutesV0({
  store,         // Instancia creada con createPilotIdentityStoreV0
  crypto,        // Módulo criptográfico o utilidades node:crypto para SHA-256 + timingSafeEqual
  pool,          // Pool de PostgreSQL para rate limiting compartido
  env = process.env, // Objeto de variables de entorno
  logError       // Logger seguro de errores operacionales
}) {
  // ...
}
```

---

## 9. Mapeo de Errores del Store a HTTP

| Excepción / Resultado del Store | HTTP Status | Respuesta JSON Pública |
| :--- | :--- | :--- |
| `PilotStoreError` ("invitacion no es valida...") | `400 Bad Request` | `{ "ok": false, "error": "La invitación no es válida o ya fue utilizada." }` |
| `PilotStoreError` ("sesion no es valida...") | `401 Unauthorized` | `{ "ok": false, "error": "La sesión no es válida o ha expirado." }` |
| `PilotStoreError` ("perfil no es valido...") | `400 Bad Request` | `{ "ok": false, "error": "El perfil enviado no es válido." }` |
| `PilotStoreError` ("Usuario no encontrado.") | `404 Not Found` (en admin) / `400 Bad Request` (en login/auth) | `{ "ok": false, "error": "El usuario no existe." }` / `{ "ok": false, "error": "La invitación no es válida o ya fue utilizada." }` |
| `PilotStoreOperationalError` | `500 Internal Server Error` | `{ "ok": false, "error": "Error interno del servidor." }` |
| Excepción no controlada (p. ej. fallo DB) | `500 Internal Server Error` | `{ "ok": false, "error": "Error interno del servidor." }` |

**Privacidad y Seguridad en Logs**:
- No registrar tokens (`npt_`), códigos (`npi_`), valores HMAC, credenciales ni cabeceras `Authorization` o `X-Pilot-Admin-Token` en los logs del servidor ni en respuestas de error.

---

## 10. Plan de Pruebas Unitarias e Integración

Se diseñará la suite `pilot-identity-routes-v0.test.js` usando `node:test` y `node:assert`, levantando una aplicación Express de prueba:

1. **Pruebas de Feature Flags**:
   - Con `PILOT_ENABLED=false`, confirmar que toda ruta `/api/pilot/*` responda 404.
   - Con `PILOT_ADMIN_ROUTES_ENABLED=false`, confirmar que toda ruta `/api/pilot-admin/*` responda 404.
2. **Pruebas de Autenticación Administrativa**:
   - Token inválido o ausente en `X-Pilot-Admin-Token` debe responder 401.
   - Token válido debe permitir la ejecución de la ruta y registrar auditoría.
3. **Pruebas de Flujo de Usuario**:
   - Registro exitoso con código válido de invitación.
   - Intento de enviar `userId` en el perfil durante el registro debe ser ignorado.
   - Renovación de credencial activa mediante `Authorization: Bearer`.
   - Recuperación de acceso manteniendo exactamente el mismo `user_id`.
4. **Pruebas de Rate Limiting**:
   - Exceder el número permitido de solicitudes debe retornar HTTP 429 con cabecera `Retry-After`.
5. **Pruebas de Sanitización de Errores**:
   - Forzar errores de base de datos y verificar que la respuesta sea 500 con `"Error interno del servidor."`, sin detalles de SQL ni trazas.

---

## 11. Archivos que Deberían Crearse en la Siguiente Fase

1. `pilot-identity-routes-v0.js`: Implementación de la capa de rutas de Express y la factory `createPilotIdentityRoutesV0`.
2. `pilot-identity-routes-v0.test.js`: Suite completa de pruebas unitarias y de integración para las rutas HTTP.

---

## 12. Riesgos y Decisiones Pendientes

1. **Coexistencia de Sesiones en el Cliente**:
   - Las rutas existentes (`/api/bootstrap`, `/api/state`, etc.) actualmente leen/escriben `userId` directamente. En fases posteriores se deberá integrar un middleware de autenticación por Bearer token para vincular automáticamente el `userId` autenticado con el resto de los endpoints de rutinas.
2. **Rotación de Claves y Tokens Administrativos**:
   - Se recomienda definir un procedimiento operativo seguro para actualizar `PILOT_ADMIN_TOKEN` en producción sin interrumpir el servicio.
3. **Estrategia de Renovación en la PWA**:
   - El frontend deberá monitorear la fecha de expiración obtenida via `/api/pilot/session` para solicitar `/api/pilot/renew` antes del vencimiento de 30 días.
