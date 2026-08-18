# Informe de prueba controlada — Identidad Piloto V0

**Fecha:** 18 de agosto de 2026  
**Repositorio:** `nachoa84/nu-app`  
**Base verificada:** `57154b916bbc413a57aae04bc7046e2d34dd736c`  
**Alcance:** validación operativa de Identidad Piloto V0 incorporada por V130.

## 1. Reglas de seguridad aplicadas

- La prueba se realizó con secretos configurados exclusivamente en Replit.
- Ningún secreto, código de invitación, token de sesión, HMAC, identificador de usuario o dirección IP completa se incorporó a GitHub.
- `PILOT_ENABLED` y `PILOT_ADMIN_ROUTES_ENABLED` permanecieron apagados salvo durante la ventana controlada.
- No se modificó ni fusionó `main`.
- No se ejecutaron migraciones.
- No se modificaron usuarios existentes, rutinas, videos, notificaciones, cron ni Object Storage.
- No se inició la integración con Groq.

## 2. Preparación y línea base

Se configuraron y validaron:

- `PILOT_INVITATION_HMAC_KEY`: Base64 canónico de 32 bytes.
- `PILOT_TOKEN_HMAC_KEY`: Base64 canónico de 32 bytes y diferente de la clave de invitaciones.
- `PILOT_ADMIN_TOKEN`: valor aleatorio exclusivo.
- `PILOT_ADMIN_KEY_ID`: identificador administrativo no secreto.

Con ambos flags apagados se verificó:

| Comprobación | Resultado |
|---|---:|
| `GET /api/health` | HTTP 200 |
| Página principal | HTTP 200 |
| `GET /api/pilot/me` | HTTP 404 |
| Ruta administrativa de invitación | HTTP 404 |
| Archivo interno del store | HTTP 404 |

## 3. Aislamiento administrativo

Con solo `PILOT_ADMIN_ROUTES_ENABLED=true`:

| Comprobación | Resultado |
|---|---:|
| Salud y página principal | HTTP 200 |
| Ruta de usuario piloto | HTTP 404 |
| Ruta administrativa sin token | HTTP 401 |
| Ruta administrativa con token incorrecto | HTTP 401 |
| Archivo interno del store | HTTP 404 |

Se creó exactamente una invitación administrativa de registro. La respuesta fue HTTP 201 y el código cumplió el formato esperado. El código se conservó únicamente en un archivo temporal con permisos restringidos.

## 4. Flujo de identidad de extremo a extremo

Durante la ventana controlada, con ambos flags habilitados temporalmente:

### Registro y autenticación

- Registro con invitación: HTTP 201.
- Usuario y credencial emitidos correctamente.
- Estado inicial: día 1, ciclo 1.
- Consulta autenticada `GET /api/pilot/me`: HTTP 200.
- El `user_id` autenticado coincidió con el creado.
- La expiración correspondió al TTL previsto.
- Reutilización de la invitación consumida: HTTP 400.

### Renovación y un solo dispositivo activo

- Renovación de credencial: HTTP 200.
- Se emitió un token diferente.
- El token anterior pasó a responder HTTP 401.
- El token renovado respondió HTTP 200.
- Se conservó el mismo `user_id`.

### Recuperación

- Invitación administrativa de recuperación: HTTP 201.
- Recuperación: HTTP 200.
- Se conservó el mismo `user_id`.
- Se emitió una credencial diferente.
- La credencial previa pasó a responder HTTP 401.
- La credencial recuperada respondió HTTP 200.

### Revocación

- Revocación administrativa de todas las credenciales: HTTP 200.
- Se revocó exactamente una credencial activa.
- La credencial recuperada pasó a responder HTTP 401.

## 5. Verificación en la base productiva

La base de producción mostró exclusivamente los registros esperados para la prueba:

| Tabla | Filas verificadas |
|---|---:|
| `pilot_credentials` | 3 |
| `pilot_invitations` | 2 |
| `pilot_admin_audit` | 3 |

Se confirmó visualmente:

- Las tres credenciales históricas quedaron revocadas.
- No quedó ninguna credencial activa.
- `token_hmac` contiene representaciones hexadecimales y no tokens `npt_` legibles.
- `code_hmac` contiene representaciones hexadecimales y no códigos `npi_` legibles.
- Las dos invitaciones quedaron marcadas como utilizadas.
- La auditoría contiene las acciones:
  - `create_registration_invitation`
  - `create_recovery_invitation`
  - `revoke_all_credentials`
- Las filas usan el `PILOT_ADMIN_KEY_ID` configurado.
- `details` quedó en `NULL`.
- Las IPv4 persistidas están anonimizadas con el último octeto en cero.
- No se documentan aquí IP, IDs, hashes ni marcas temporales productivas.

## 6. Cierre seguro

Al finalizar:

- `PILOT_ENABLED=false`.
- `PILOT_ADMIN_ROUTES_ENABLED=false`.
- Salud y página principal continuaron en HTTP 200.
- Las rutas de usuario y administración piloto volvieron a HTTP 404.
- Los archivos internos continuaron bloqueados con HTTP 404.
- Los archivos temporales que contenían invitaciones y credenciales fueron eliminados.
- Los secretos permanecen configurados en Replit con ambos flags apagados.

## 7. Resultado

**Identidad Piloto V0 aprobada para continuar con la siguiente fase de diseño.**

La prueba aprobó registro, autenticación, renovación, recuperación, revocación, auditoría anonimizada y la política de un solo dispositivo activo sin alterar el comportamiento visible de la aplicación existente.

## 8. Pendiente operativo externo

Replit advirtió que la base productiva y la publicación gratuita requieren renovación para persistir. Se decidió renovar el servicio antes de continuar con un piloto real. Este pendiente es operativo y no modifica el resultado técnico de la prueba.

Groq permanece fuera de alcance hasta que el diseño de recuperación documental sea revisado y aprobado.
