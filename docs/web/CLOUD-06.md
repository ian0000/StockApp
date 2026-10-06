# CLOUD-06 — Freeze V1 Contracts + OpenAPI + Application ID/Time Adaptation

2026-10-05 · Rama `feat/cloud-06-contracts-v1` · Base main `ce73381d97543ea8cc94987de15f085eeb7dbde2`.
Decisión de compatibilidad aprobada por CLOUD-06-FIX: UUID legacy válido preservado, nuevos IDs v7.
Estado técnico: **IMPLEMENTED**, validación local completa. Cierre Git mediante PR #81 existente:
el merge normal exige CI/GitGuardian/revisiones del head final, verificadas antes de fusionar.

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
| Contracts tests/typecheck | PASS; 31 tests, incluidos nueve de compatibilidad UUID |
| Application tests | PASS; 432 tests |
| Mobile tests | PASS; 551 tests, incluye SQLite real commit/retry/rollback |
| Domain tests | PASS; 428 tests; cero cambios en source Domain |
| API foundation/SMTP tests | PASS; 19 tests, incluye manifest vs runtime sin DB |
| PostgreSQL/auth/ownership/security/HTTP compilado | PASS; 148 tests, sin skipped |
| pnpm check | PASS; 1461 tests, formato/lint/types/build |
| Build API/contratos | PASS |
| Git diff --check | PASS |
| Checkout limpio sin dist | PASS; install frozen, generación/check y pnpm check con LF, sin diff |
| db:generate | PASS, sin cambios de schema ni migraciones nuevas |
| auth:generate / auth:check | PASS, schema oficial sin diff |

PG18.6 local efímero en127.0.0.1:65432, datos ficticios. SMTP local, no proveedor; servidor detenido al finalizar.
DBs disposable restantes:0 tras la suite. Total actual de suites:1609 tests.
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
La diferencia entre UUIDv7 nuevo y UUID legacy representable queda resuelta por decisión humana:
DTOs/FKs/lecturas/paths/evidencia/referencias/sync/import aceptan UUID genérico válido sin remapeo.
Creaciones, movimientos y reversals nuevos exigen UUIDv7; también Business y IDs de protocolo.
La clasificación campo por campo está en [CONTRACTS_V1](CONTRACTS_V1.md#compatibilidad-de-uuid--cloud-06-fix).
Inventory.generation y BackupV1 mantienen sus schemas anteriores; non-UUID local se rechaza solo
en la futura frontera cloud, sin modificar Restore. Application/Mobile/Domain/DB no cambian en el FIX.

Las nueve pruebas de compatibilidad se añadieron antes del FIX: **7 fallos y 2 PASS** reprodujeron
la contradicción. Después del FIX: **9/9 PASS**; suite contracts completa **31/31 PASS**.
Prueban Product/Inventory v4, siete DTOs y FKs, todas las referencias de comandos/evidencia,
venta nueva v7 sobre Product v4, void de Sale/Purchase v4 con reversals v7, historial/dashboard,
resultados/receipt/ChangeSet/pull/snapshot, import reservado con Inventory v4, strings de BackupV1,
rechazo de non-UUID/malformed y rechazo de v4 en identidades nuevas/de protocolo.
Se verifica preservación exacta, incluida capitalización, y distinción de schemas en OpenAPI generado.

## Cierre y frontera posterior

[PR#81](https://github.com/ian0000/StockApp/pull/81) existente; CLOUD-06-FIX continúa en la misma rama,
sin nuevo PR ni rebase. El FIX se publica como `fix(contracts): preserve legacy UUID compatibility`.
Evidencia CI previa al FIX, head `d1e784db29d62bf335ad5f4cebe67b5b114027ea`
(commit inicial `5e9f100688eb0b328081e7dec337a510b1f3deb5`):
[CI37381094317](https://github.com/ian0000/StockApp/actions/runs/37381094317), job112002986345:
Quality checks **SUCCESS**, incluidos frozen install, check, migrate generation, auth schema y PG/SMTP.
[GitGuardian112002964134](https://github.com/ian0000/StockApp/runs/112002964134): **SUCCESS**.
Revisiones/hilos/requested reviewers/teams observados: ninguno pendiente. Ruleset20942932 exige
Quality checks (integration15368) y permite merge normal; no se utilizó bypass ni auto-merge.
El checkout limpio se clonó con core.autocrlf=false para conservar LF, igual que el repo original.
Un primer clone con conversión CRLF activada falló formato; no se reformateó la baseline por eso.
Estado actual/revisiones se verifican en el PR, nunca se extrapolan a otro head.

La contradicción UUID está resuelta y no quedan decisiones técnicas pendientes del FIX.
La evidencia CI anterior corresponde a los heads indicados, no valida automáticamente el FIX.
Antes del merge se verifican CI/GitGuardian/revisiones nuevos del head final mediante el flujo normal.
El estado Git vigente y SHA de merge se consultan en el PR; no se anticipa el resultado de checks externos.
No bypass, auto-merge, force push, deploy ni provider actions. No ian-k.dev/legal/pricing/Alpha/AAB.
API-01 y WEB-01 siguen PLANNED y requieren un ticket explícito nuevo; no se comienzan como continuación.
