# OpenAPI StockApp V1

`stockapp-v1.json` es generado; editar `packages/contracts/src` y ejecutar desde la raíz:

```sh
pnpm contracts:openapi
pnpm contracts:openapi:check
```

OpenAPI 3.1.1 / JSON Schema 2020-12. Schemas y routeContracts son la única fuente; los tipos TS
se derivan. Check compara bytes contra generación determinista in-memory y está en `pnpm check`/CI.
No exige dist previo, herramienta global, DB, credenciales ni validator externo.

`x-stockapp-implementation-status` distingue implemented/planned por operación. Solo /live,
/v1/session/csrf, /v1/me, /v1/business e Inventory metadata existen. /health permanece planned/404.
No se afirma despliegue. Better Auth 1.7.7 maneja `/api/auth/*` mediante su contrato separado.
Sesiones oficiales por cookie, X-CSRF-Token para mutaciones, Idempotency-Key de comandos futuro.
Ver [CONTRACTS_V1](../CONTRACTS_V1.md) para versiones, unidades, IDs, tiempo y límites.
