# CLOUD-06 — Freeze V1 Contracts + OpenAPI + Application ID/Time Adaptation

2026-10-05 · Rama `feat/cloud-06-contracts-v1` · Base main `ce73381d97543ea8cc94987de15f085eeb7dbde2`.
Estado: implementación local validada; cierre Git/CI y aclaración de compatibilidad de IDs de import pendientes.

## Alcance implementado

`packages/contracts` congela primitivas, DTOs/read models/resultados, ocho comandos discriminados,
errores/detalles allowlist, pagination, devices/push/results/ChangeSet/pull/snapshots, import/BackupV1 y
lifecycle mínimos. JSON Schema es fuente única, tipos derivados con json-schema-to-ts3.1.1.
Ajv8.20.0 es dependencia directa exacta, ya resuelta en el lockfile de Fastify; aporta validación
estándar2020-12 sin escribir un validator propio ni duplicar reglas financieras. No se añadió Zod,
SwaggerUI, ORM/framework en contracts, cliente generado ni dependencia financiera.

[CONTRACTS_V1](CONTRACTS_V1.md) documenta semántica completa, catálogos, campos y diferimientos.
[OpenAPI](openapi/stockapp-v1.json)3.1.1 se genera determinísticamente desde schemas/manifiesto.
`contracts:openapi:check` valida schemas, referencias y registro, compara artefacto in-memory y está
en required Quality checks mediante `pnpm check`. Sin timestamp/server production/tooling global.

## Disponibilidad y regresión actual

Cinco rutas implemented: GET/live, GET/v1/session/csrf, GET/v1/me, POST/v1/business,
GET/v1/inventories/{inventoryId}. Resto planned, incluido /health404. No handlers fake501.
Ownership runtime importa schemas compartidos; /v1/me añade capabilities de versiones[1].
BetterAuth1.7.7 conserva contrato propio, password handling, cookies, user IDs opacos y delete-user cerrado.
CORS/Origin, CSRF, no-store/requestId, rate limits durables, bootstrap/scoping A/B y SMTP no cambian.
Idempotency-Key comercial queda como contrato futuro API-01, no receipt runtime implementado.

## Application / Mobile

CreateProduct, RegisterSale, RegisterPurchase y AdjustStock reciben IDs/occurredAt/createdAt, sin
generadores/clock incorrectos. VoidSale/Purchase reciben IDs de reversión y tiempos; metadata conserva
clock autoritativo. Update/Archive usa max(createdAt previo,updatedAt previo,reloj). Domain intacto.
No operationId/header/session/protocol en Application; no nueva fórmula o autoridad del cliente.
SaleItem/movimientos/reversals siguen caller identity, inclusive orden distinto por producto.
Se rechazan IDs duplicados antes de writes. Venta/compra/ajuste/void conservan transacción y reglas.

Mobile adapta composición y tipos de ports/form inputs; los campos y flujos UI no cambian.
UuidV7Generator/SystemClock preparan las entradas, sin red/auth/cloud/outbox/sync tables.
Fixtures de regresión se adaptan como callers, sin cambiar importes/stock/ganancia esperados.
Tests nuevos entran directamente a Application para probar ausencia de regeneración y tiempo exacto.

## Validación local verificada

| Gate | Resultado |
| --- | --- |
| pnpm install --frozen-lockfile | PASS; lockfile actual, sin upgrades laterales |
| OpenAPI generation/check | PASS; determinista, refs locales válidos, stale rechazado |
| Contracts tests/typecheck | PASS; 22 tests |
| Application tests | PASS; 432 tests |
| Mobile tests | PASS; 551 tests, incluye SQLite real commit/retry/rollback |
| Domain tests | PASS; 428 tests; cero cambios en source Domain |
| API foundation/SMTP tests | PASS; 19 tests, incluye manifest vs runtime sin DB |
| PostgreSQL/auth/ownership/security/HTTP compilado | PASS; 148 tests, sin skipped |
| pnpm check | PASS antes de los últimos dos tests contract; repetición final pendiente |
| Build API/contratos | PASS |
| Git diff --check | PASS |
| Checkout limpio sin dist | Pendiente verificación final |

PG18.6 local efímero escucha127.0.0.1:65432, datos ficticios. SMTP local, no proveedor.
DBs disposable restantes:0 tras la suite. Total actual de suites:1600 tests.
No nuevas migraciones, tablas ni SQL financiero; schemas PostgreSQL/SQLite intactos.

## Evidencia test-first y límites

`explicit-identity.test.ts` se ejecutó antes de adaptar Application:4 fallos reales por dependencias
de generación internas; tras adaptar pasó4/4. Añadidas pruebas de reversals por producto, tiempos
comerciales/creación distintos, updatedAt autoritativo y clock skew; las71 pruebas focalizadas pasaron.
Los tests financieros existentes conservan sus expectativas: negativo, null/zero, precisión,
snapshots, reversión, atomicidad y rollback. No se alteraron fórmulas ni rounding.

La prueba runtime compara schemas request/query/params/response registrados con el manifiesto,
valida /live y confirma404 en /health, export y productos futuros con DB inaccesible y cero conexiones.
Los tests OpenAPI verifican3.1.x, identidad única de rutas/operaciones, schemas request/response y
refs resolubles; sin validator externo de red. Auth real/SMTP/ownership/hardening regresaron en PG.

Import/lifecycle/sync son formas planned; no staging/activación/pull/ejecución de ChangeSets/borrado.
Tombstones V1 vacío para no inventar hard delete financiero. API-10 deberá definir cualquier tipo
técnico y compatibilidad de protocolo antes de introducirlo. BackupV1 local conserva números/IDs.
La diferencia entre UUIDv7 comercial obligatorio y UUID legacy representable de import se consultó
al responsable; no se cambia silenciosamente la frontera de compatibilidad.

## Cierre y frontera posterior

PR, CI remota/GitGuardian, revisiones, merge y main actualizado: pendientes de cierre verificable.
No bypass, auto-merge, force push, deploy ni provider actions. No ian-k.dev/legal/pricing/Alpha/AAB.
API-01 y WEB-01 siguen PLANNED y requieren un ticket explícito nuevo; no se comienzan como continuación.
