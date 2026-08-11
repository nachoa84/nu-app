# Prototipo PWA Collagen+ v1

Este prototipo incluye:

- Día 1 completo.
- Experiencia progresiva tipo chat.
- Botón "Mostrar todo".
- Material en el orden confirmado:
  1. A partir de los 25...
  2. La mejor forma de revertirlo...
  3. Si querés resultados...
  4. Video
- Compartir mediante Web Share API cuando el dispositivo lo permite.
- Fallback a abrir/descargar el archivo.
- Favoritos guardados en localStorage.
- Rutina visual de 7 días.
- Preguntar al Bot con 4 comandos demostrativos.
- PWA instalable con service worker.
- Día 1 e imágenes disponibles offline después de la primera carga.
  El video no se precachea inicialmente para evitar una descarga pesada automática.

## Cómo probarlo en Replit

1. Crear un Repl de HTML/CSS/JS o un proyecto estático.
2. Subir todo el contenido de esta carpeta respetando la estructura.
3. Ejecutar/publicar el proyecto.
4. Abrir la URL HTTPS desde un teléfono.
5. Probar:
   - Ver mi acción
   - Mostrar todo
   - Favoritos
   - Compartir imágenes/video
   - Completar Día 1
   - Preguntar al Bot
   - Instalar PWA (cuando el navegador lo ofrezca)

## Acceso por correo y código temporal (V110)

Los endpoints privados ya no aceptan un `userId` enviado por el cliente:
el backend lo obtiene siempre de una sesión validada.

- `POST /api/auth/request-code` · envía un código numérico al correo.
- `POST /api/auth/verify-code` · valida el código y emite la sesión.
- `GET /api/auth/session` · informa si hay sesión y a qué cuenta pertenece.
- `POST /api/auth/logout` · cierra la sesión y borra la cookie.
- `POST /api/auth/link-legacy-account` · vincula una cuenta anterior a V110.

El código se guarda sólo como HMAC-SHA256 con `AUTH_CODE_PEPPER` (un secreto
que vive fuera de la base: si alguien roba `auth_codes` no puede probar el
millón de códigos posibles), vence, se consume de forma atómica —una sola
sesión aunque lleguen dos verificaciones simultáneas—, limita los intentos y
limita cuántos se pueden pedir por correo y por IP. La sesión es un token
aleatorio de 32 bytes guardado como hash SHA-256 en PostgreSQL —sin pepper,
porque no es adivinable— y entregado en una cookie `HttpOnly`, `SameSite=Lax`
y `Secure` en producción.

Un intervalo propio, separado del scheduler V109, borra periódicamente los
códigos viejos y las sesiones vencidas.

### Arranque en producción

Con `NODE_ENV=production` el proceso falla al iniciar si:

- falta `AUTH_CODE_PEPPER` (o tiene menos de 16 caracteres);
- `EMAIL_PROVIDER` está vacío o es `console`, que imprimiría los códigos en
  los logs;
- el proveedor elegido no está bien configurado (por ejemplo `webhook` sin
  `EMAIL_WEBHOOK_URL`).

### Proxy y rate limiting

Replit publica la app detrás de un proxy inverso. `TRUST_PROXY_HOPS` fija una
política explícita: con el valor por defecto `1`, Express toma como `req.ip`
la IP que el proxy vio, y no una cabecera `X-Forwarded-For` encadenada por el
cliente. Con `0` se ignoran las cabeceras de proxy (desarrollo local). Si el
valor fuese incorrecto, todas las usuarias compartirían un mismo límite: hay
pruebas que verifican ambos modos.

### Variables de entorno

| Variable | Default | Para qué sirve |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `console` | `console` (sólo log, desarrollo) o `webhook`. |
| `EMAIL_WEBHOOK_URL` | — | Obligatoria con `EMAIL_PROVIDER=webhook`. |
| `EMAIL_WEBHOOK_TOKEN` | — | Bearer opcional para el webhook de correo. |
| `EMAIL_FROM` | `no-reply@nu-app.local` | Remitente enviado al proveedor. |
| `AUTH_CODE_PEPPER` | — | **Obligatoria en producción.** Secreto (≥16 caracteres) del HMAC de los códigos. Fuera de producción se genera uno efímero por arranque. |
| `AUTH_CODE_TTL_MINUTES` | `10` | Vigencia del código. |
| `AUTH_CODE_MAX_ATTEMPTS` | `5` | Intentos por código antes de bloquearlo. |
| `AUTH_CODES_PER_EMAIL_MAX` | `3` | Códigos por correo cada 15 minutos. |
| `AUTH_SESSION_TTL_DAYS` | `30` | Duración de la sesión. |
| `COOKIE_SECURE` | `true` si `NODE_ENV=production` | Fuerza la cookie `Secure`. |
| `LEGACY_LINKING_ENABLED` | `true` | Habilita la transición de cuentas previas. |
| `AUTH_CLEANUP_INTERVAL_MINUTES` | `60` | Cada cuánto se borran códigos y sesiones vencidos. |
| `TRUST_PROXY_HOPS` | `1` | Saltos de proxy en los que confía Express (`0` = sin proxy). |

No se incluyen claves reales en el repositorio: el proveedor de correo se
configura por variables de entorno.

### Transición de cuentas anteriores a V110

Las cuentas creadas antes de V110 no tienen correo. Después de verificar su
correo, una persona puede reclamar **una sola vez** su cuenta anterior enviando
el `userId` que la PWA guardó en `localStorage`.

Riesgos y límites de esa transición:

- El `userId` anterior es el único dato que prueba la propiedad de esa cuenta.
  Quien lo conozca podría reclamarla, por eso la vinculación es de un solo uso.
- Una cuenta ya vinculada a un correo no se puede reclamar de nuevo.
- Sólo se permite si la cuenta recién creada por correo todavía no tiene
  progreso propio; si tiene, hay que unificar manualmente.
- Se puede apagar por completo con `LEGACY_LINKING_ENABLED=false` cuando la
  migración termine.

Todo el traspaso ocurre en una sola transacción: se bloquean las dos cuentas,
se revalidan las condiciones y el progreso, se libera el correo de la cuenta
temporal —`users.email` tiene índice único—, se le asigna a la cuenta
anterior, se mueven las sesiones y se borra la temporal. Cualquier error hace
`ROLLBACK` y no queda nada a medio camino.

### Migración

El esquema de `schema.sql` es idempotente y se aplica al iniciar el servidor.
V110 agrega `users.email`, `users.email_verified_at`, `auth_codes` y
`user_sessions`.

### Pruebas

```bash
npm test
```

Las pruebas usan un store en memoria que reproduce las restricciones reales de
PostgreSQL (índice único parcial sobre `users.email`, consumo atómico del
código y transacción con `ROLLBACK`): no necesitan PostgreSQL, correo real ni
credenciales. Incluyen verificaciones concurrentes del mismo código, rollback
ante una falla intermedia de la vinculación, rate limiting por IP detrás del
proxy y dos arranques reales de `server.js` en modo producción que deben
fallar (sin `AUTH_CODE_PEPPER` y con `EMAIL_PROVIDER=console`).

## Próximo paso técnico

Después de validar esta experiencia:
- Migrar media a Cloudflare R2.
- Agregar Días 2 a 7.
- Incorporar usuarios y zonas horarias.
- Activar push notifications reales.
