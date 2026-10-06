# API-07 — VoidPurchase: restauración exacta del estado anterior

Base main `ad5bbe51f4c037ab0b603be9ad7b20ef4272f85e` (API-06, PR #87).
Rama `feat/api-07-void-purchase`. Head/PR/CI/GitGuardian/merge se registran al verificarse.
Scope: POST void, adaptador mínimo, PurchaseParams/manifest/OpenAPI, tests y documentación.
Sin cambios Domain/Application/Mobile/schema/migraciones/dependencias/lockfile ni deploy.
Batch humano vigente API-07→API-08→API-09, secuencial con gates/PR/merge independientes;
no iniciar el siguiente hasta DONE/MERGED/main limpio0/0/BLOCKERS=NONE. STOP ante cualquier fallo.

## Transporte y seguridad

POST `/v1/inventories/:inventoryId/purchases/:purchaseId/void`, PURCHASE_VOID,
VoidPurchaseCommand y VoidPurchaseResult compartidos. PurchaseParams conecta al registro,
RouteContract.params y OpenAPI: Inventory/Purchase UUID genéricos, incluidos legacyv4;
nuevas Operation/REVERSAL UUIDv7. Path/body iguales case-insensitive antes del executor.
Product se deriva de Purchase persistida; no campo nuevo ni mass assignment.
Revision directa string: operation-ref400 antes de lock/receipt, incluso con lock retenido.
Envelope global Sync intacto. Catorce rutas implemented; Purchase detail GET pertenece a API-08.

Reutiliza sesión oficial verificada, owner/ACTIVE/cloud flag y revalidación bajo lock;
CLOUD-05 Origin/CSRF/CORS, JSON/body1MiB, bucket durable60/min/user, requestId/no-store
y errores sanitizados. No nuevo middleware, pool, timeout, infraestructura ni dependencia.

## Estado exacto y autoridad existente

Bajo Inventory lock API-01: Purchase propia404, State ausente/corrupto500 sin terminal receipt;
comparar revision bigint/stock/costo/lastMovementId exactos ANTES de Application, incluso VOIDED.
Null distinto de cero. Stale409 durable. VoidPurchaseUseCase/preparePurchaseReversal existentes
deciden elegibilidad: original PURCHASE único, último inequívoco, State coincide con Purchase.after.
Sale/Purchase/Adjustment/REVERSAL posterior o createdAt ambiguo bloquea422; movimiento de otro
producto no bloquea. Producto archivado permitido. CONFIRMED con reversal existente es500,
sin reparación. No nueva fórmula financiera ni criterio alternativo de elegibilidad.

PurchaseVoidRepository mínimo, scoped y ligado al mismo tx; captura resultados Application
y escribe REVERSAL→State→Purchase. No segunda conexión, BEGIN ni transacción independiente.
State restaura Purchase.stockBefore y averageCostBefore, incluidos null y cero conocido.
REVERSAL conserva el costo unitario entrante (Purchase.unitCost/original.unitCostSnapshot),
delta negativo, stockBefore Purchase.after, stockAfter Purchase.before, metadata null,
sourceType INVENTORY_MOVEMENT/sourceId original y reversalOfMovementId explícito.
occurredAt→effectiveAt, payload.createdAt→createdAt/updatedAt; State revision+1n/pointer nuevo.
Purchase cambia solo status VOIDED y updatedAt de Clock servidor Application. Todos los snapshots,
notas, fechas originales y el movimiento PURCHASE permanecen intactos.

Inventory revision/ChangeSet/ACCEPTED receipt mismo commit. Cualquier fallo revierte todo.
ChangeSet incluye Purchase1/REVERSAL1/State1; demás arrays/tombstones vacíos.
Solo colisiones conocidas de nuevas identidades son422 DOMAIN_RULE; SQL inesperado es500.
Contadores >JS-safe exactos, int64 máximo falla500 sin efectos.

## Política Cloud y replay

Misma operationId/hash: API-01 replay durable VOIDED sin callback ni efectos.
Distintos void concurrentes con misma base: VOIDED+CONFLICT409, dos receipts terminales,
una REVERSAL y un incremento State/Inventory/ChangeSet. Nuevo comando vigente contra VOIDED:
REJECTED422 VOID_NOT_ELIGIBLE, sin accepted no-op. Domain/local/shared ALREADY_VOIDED intacto.

Respuesta proviene únicamente del receipt/ChangeSet durables. Como API-06, consulta el original
inmutable solo para verificar links/cantidad/costo/snapshots; no usa State/Purchase/Product actuales
para devolver campos. Replay después de movimientos/metadata/restart devuelve la respuesta original.
Valida cardinalidades/scope/IDs/status/links/deltas/costos/restauración/contadores/pointers/times
y falla cerrada500 ante corrupción. No modifica API-01 ni reconstruye el void desde estado actual.

## Validación local final — 2026-10-06

Antes del adaptador:31 Domain PurchaseReversal y30 Application VoidPurchase PASS, sin modificar
reglas ni tests locales. Tests financieros API-07 preparados antes del adaptador.
Gates pesados secuenciales; poolmax10/connectionTimeout2000/test:db concurrency2 intactos.
Suite void-purchases incluida en required test:db y focused test:void-purchases.

Frozen install, OpenAPI generate/check, pnpm check y build:api PASS.
Unitarios: Domain428/Application432/Mobile551/Contracts35/API24 =1470 únicos,
0 fail/skipped/cancelled; lint/typecheck/format/build PASS.
Focused API-07 completo108 PASS (63179.0517 ms), y regresión final108 PASS (55763.4278 ms).
Full test:db857 PASS,0 fail/skipped/cancelled (362804.4904 ms).
Total único2327 =1470 unitarios +857 DB. No sumar ejecuciones focused/smoke repetidas.
DB incluye PostgreSQL55, Auth35, Ownership21, Security37, API-01/47, API-02/79,
API-03/98, API-04/135, API-05/128, API-06/114 y API-07/108.
Regresiones focused separadas API-01..07/Auth/Ownership/Security también PASS con esos conteos.
Smoke HTTP compilado independiente10 PASS, con PostgreSQL18.6/Auth/SMTP local y restart.

DB generate PASS, sin schema/migration drift. Auth generate/check PASS, sin auth-schema drift.
Diff check PASS. QA:0 conexiones/0 runners/0 bases disposable; PostgreSQL propio detenido.
Sin cambios Domain/Application/Mobile/API-01/schema/migrations/dependencies/lockfile/CI
ni settings PG. Revisión final del diff y head/PR/CI/GitGuardian/merge quedan registrados en la
entrega al verificarse. API-08 solo comienza tras API-07 DONE/MERGED/main limpio0/0.

## Incidente de validación resuelto — tests HTTP

Primera ejecución focused:108 tests,103 PASS,5 fail (cuatro subtests HTTP y su padre),
58132.613 ms. Se aplicó STOP sin commit/PR/merge. Evidencia original preservada en
C:/Users/USER/.codex/artifacts/stockapp-api07-stop.md y stop-{focused,check}.txt.
La autorización humana posterior permitió únicamente corregir dos errores del test y reanudar.

Defecto1: se enviaron dos spellings de purchaseId en el body con la misma operationId.
API-01 preserva valores del envelope en el fingerprint; el segundo body distinto corresponde409.
El fixture ahora fija purchaseId uppercase desde el principio y todos los retries usan exactamente
el mismo body; mantiene prueba de path uppercase y header case-insensitive sin modificar algoritmo,
Idempotency-Key, CommandTransaction, runtime ni expectativas.
Defecto2: query de test usaba operation_receipts.inventory_id inexistente. Se conecta ChangeSet
con Inventory.id y Receipt.business_id/committed_revision usando exclusivamente columnas reales.
Sin producción/schema/migration/compatibilidad nuevos. Diff adicional antes de reanudar verificado
por hashes: únicamente test/void-purchases/http.test.ts y formatting derivado.

Primero solo cuatro subcasos antes fallidos y su padre:5 PASS,0 fail/skipped/cancelled;
6873.725 ms. Después focused completo108 PASS; luego gates/regresiones/smoke/generadores
secuenciales descritos arriba. Production code changed for fixes: NO.
Sin fallos restantes, retries para obtener verde ni PostgreSQL timeout observado.
Logs en %TEMP%: stockapp-api07-resume-{isolated,focused,check,build,db,compiled-http,
db-generate,auth-generate,auth-check}.txt y resume-regression-*.txt.
