# Corrección V0 de identidad — Nu App

Estado comprobado antes de corregir:

```text
tests: 96
suites: 23
pass: 69
fail: 27
```

Corregir exclusivamente `pilot-identity-store-v0.js` y
`pilot-identity-store-v0.test.js`. No modificar `pilot-crypto-v0.js`.

## Requisitos

1. El mock debe crear un snapshot en `BEGIN`, conservarlo en `COMMIT` y
   restaurar users, invitations, credentials, audit y contadores en `ROLLBACK`.
2. Normalizar SQL antes de clasificar consultas; no depender del espaciado.
3. Interpretar correctamente las acciones constantes y parametrizadas de
   `pilot_admin_audit`.
4. Usar `??` en opciones configurables de `makeStore`.
5. Crear fixtures vencidos con TTL válido y avance de `pgNow`, nunca TTL 0.
6. Validar IPv4/IPv6 con `node:net.isIP`.
7. Rechazar en auditoría: undefined, funciones, símbolos, bigint, números no
   finitos, ciclos, claves prohibidas recursivas y más de 64 KiB UTF-8.
8. Diferenciar estructura/tamaño inválido de claves prohibidas.
9. Validar `pool.connect()` y `pool.query()`.
10. PostgreSQL es la única fuente de tiempo; devolver `RETURNING expires_at`.
11. Reintentar solamente la constraint
    `pilot_credentials_token_hmac_unique`, nunca
    `idx_pilot_credentials_one_active_per_user`.
12. No eliminar ni debilitar pruebas. Corregir la causa real de cada fallo.

Ejecutar hasta obtener cero fallos:

```bash
node --check pilot-identity-store-v0.js
node --check pilot-identity-store-v0.test.js
node --test pilot-identity-store-v0.test.js
```

No integrar en producción ni modificar otros archivos de Nu App.
