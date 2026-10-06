# API-06 — VoidSale: reversión completa y estado exacto

Base main `2cd2baf62c3a5c1134f6914d757ab148b43604f0` (API-05, PR #86).
Rama `feat/api-06-void-sale`. Head/PR/checks/merge se registran en la entrega al verificarse.
Scope: POST void, adaptadores mínimos, SaleParams/manifest/OpenAPI, pruebas y documentación.
Sin cambios Domain/Application/Mobile/schema/migraciones/dependencias/lockfile ni API-07/deploy.

## Decisión humana Cloud V1 — 2026-10-06

- Misma operationId/hash: API-01 replay durable del VOIDED original, sin callback, reversión,
  State update, Inventory revision ni nuevo ChangeSet.
- Distintos void concurrentes con la misma base: primero VOIDED, segundo CONFLICT409
  REVISION_CONFLICT antes de evaluar Application. Exactamente una reversión por movimiento,
  un incremento por State, una Inventory revision/ChangeSet de void y dos receipts terminales.
- Nuevo comando con evidencia vigente contra Sale ya VOIDED: REJECTED422 VOID_NOT_ELIGIBLE;
  no commit Cloud no-op ni revisión/ChangeSet. ALREADY_VOIDED de Application se mapea a rechazo
  después de comprobar precondiciones, sin eliminarlo de Domain/local/contrato compartido.

API-01 sigue: ACCEPTED→revisión nueva/ChangeSet1/committedRevision no-null;
CONFLICT/REJECTED→sin revisión/ChangeSet y receipt terminal. No nuevos statuses/error codes.
Aplicar la misma política en API-07 VoidPurchase, sin implementarlo en este batch.
Esta decisión sustituye la expectativa ALREADY_VOIDED del segundo comando distinto del ticket original.

## Ruta, transporte y seguridad

POST `/v1/inventories/:inventoryId/sales/:saleId/void`, VoidSaleCommand SALE_VOID,
200 VoidSaleResult compartido; éxito materializado VOIDED, enum ALREADY_VOIDED compatible intacto.
SaleParams estricto con Inventory/Sale UUID genéricos, incluidos legacyv4. Nuevos Operation/
REVERSAL Movement UUIDv7; Product/OriginalMovement referencias genéricas. Comparación UUID
case-insensitive sin remapeo ni regeneración. Path saleId debe coincidir con payload antes del executor.
Identidades de reversión y states deben cubrir exactamente productos originales, sin extras/duplicados.

Revisiones directas únicamente strings: operation-ref400 antes de CommandTransaction/receipt,
aun con Inventory lock retenido por otra conexión. Envelope global Sync intacto.
Sesión oficial verificada, owner derivado/ACTIVE/cloud flag, revalidación bajo Inventory lock;
CLOUD-05 CORS/Origin/CSRF, JSON/body1MiB, bucket durable60/min/user, requestId/no-store/redacción.
No hereda Product32KiB. No Sale detail GET ni VoidPurchase; trece rutas implemented, /health404.

## Precondiciones y Application

Bajo lock: resolver Sale propia, cargar SaleItems scoped y states técnicos completos/scoped,
verificar cobertura y comparar cada revision bigint/stock/costo/lastMovementId exactos antes de
Application, incluso si Sale está VOIDED. Null distinto de costo conocido0. Stale→409 durable;
missing/foreign Sale→404; state ausente/corrupto→500 sin terminal receipt.

VoidSaleUseCase/prepareSaleReversal existentes controlan elegibilidad: todos los movimientos
SALE originales deben ser últimos inequívocos y cada State coincidir con su resultado histórico.
Movimiento posterior de Sale/Purchase/Adjustment o empate createdAt ambiguo→422 VOID_NOT_ELIGIBLE;
un producto ajeno no bloquea. Una sola línea ineligible rechaza toda la venta. Producto archivado
no impide void histórico. CONFIRMED con reversal existente es corrupción500, sin reparación automática.

SaleVoidRepository mínimo y completo scoped, ligado al mismo tx API-01; sin segundo BEGIN,
conexión/transacción ni reglas de elegibilidad alternativas. Application captures antes de SQL.
No importar SQLite ni exigir Product activo en esta operación histórica.

## Persistencia e historia

REVERSAL1 por original: delta opuesto, stockBefore vigente/stockAfter original.stockBefore,
costo original conocido/null, sourceType INVENTORY_MOVEMENT/sourceId original.id y
reversalOfMovementId explícito con FK/unique existentes. Metadata null; occurredAt→effectiveAt,
payload.createdAt→createdAt/updatedAt. State conserva costo y restaura stock, revision anterior+1n,
lastMovementId nuevo. Contadores >JS-safe exactos; int64 máximo→500/rollback completo.

Sale cambia solo status VOIDED y updatedAt de Clock servidor/authoritativeUpdatedAt Application.
No sustituirlo por occurredAt ni cambiar total/costo/profit/notes/SaleItems/original movements.
SQL reversals→States→Sale, Inventory revision/ChangeSet/receipt mismo commit. Fallo en reversión#2,
State/Sale/Inventory/ChangeSet/receipt revierte todo, sin gap/terminal receipt inesperado.
Solo colisiones de nuevas identidades conocidas son DOMAIN_RULE422; unique inesperada queda500.

ChangeSet: Sale VOIDED1, todas las REVERSAL y States; Products/Items/Purchases/Adjustments/tombstones vacíos.
Respuesta reconstruida con DTOs durables y metadata receipt. Originales SALE inmutables se consultan
solo para verificar referencia, cantidad/costo/snapshots y cobertura de cada reversión; ningún campo
de respuesta se toma del stock/costo/precio actuales. El historial original es inmutable y scoped,
por lo que replay después de movimientos posteriores/restart devuelve el mismo resultado.
Validación de cardinalidad/IDs/scope/status/deltas/links/FK pointer/costo/tiempos/stateRevision/lastMovement
falla cerrada500 ante ChangeSet corrupto. GET operation existente expone el receipt completo.

## Validación

Antes del adaptador:33 Domain SaleReversal y27 Application VoidSale PASS, sin modificar reglas/tests
locales. Tests nuevos cubren reversión simple/múltiple/costos null/cero/negativo, historia y archived,
estado exacto/cobertura, elegibilidad, concurrencia entre dos pools con lock observado, política humana,
rollback por write, corrupción, UUID legacy, HTTP/CLOUD-05/A-B, SMTP local y compiled runtime/restart.
Incluidos en test:db required y focused test:void-sales; conteos/gates se registran tras ejecutarlos.

Focused API-06:114 PASS,0 fail/skipped/cancelled. Incluye compiled HTTP con PostgreSQL18.6,
Better Auth/SMTP local, reinicio y replay histórico después de Purchase/metadata posteriores.
La conexión SaleParams al tipo del manifest se completó tras la primera comprobación de TypeScript;
typecheck, lint y build pasan. No se cambiaron expectativas ni reglas para resolverla.

STOP final después de API-06 DONE/MERGED/main limpio0/0. No comenzar API-07+/Web/Sync/Mobile/deploy.

## Local validation interruption

El primer STOP conservó la implementación sin commit: el run completo produjo connection timeouts
en duplicate-state/movement-type de ajustes y auth identity/sessions al adquirir conexiones en
migrateDatabase, mientras test:db y pnpm check se ejecutaban simultáneamente. Contención de recursos
es una hipótesis, no una causa raíz confirmada. No se cambiaron timeout, pool, concurrencia, tests,
migraciones ni CI. Reanudación humana autorizada el 2026-10-06, con gates secuenciales y STOP ante fallo.

Inspección QA: PostgreSQL18.6 accepting connections, max_connections100/reservadas3; nueve entradas
pg_stat_activity (un cliente de inspección y ocho procesos internos), sin sesiones QA ni runners
anteriores. Host con poca memoria física disponible. Una base disposable conservada tenía cinco
migraciones y cero sesiones; eliminada únicamente después de inspeccionarla. Diez ciclos secuenciales
connect/SELECT1/release/pool.end con configuración original PASS. Los tres casos aislados PASS:
duplicate-state1, movement-type1, auth23, sin fail/skip/cancel.

Frozen install, OpenAPI generate/check y pnpm check completo PASS: Domain428, Application432,
Mobile551, Contracts35, API24 (1470 tests unitarios únicos), lint/typecheck/build/format PASS.
Luego se inició solamente test:db run1. Los tres escenarios del timeout anterior también PASS dentro
de esa suite, sin connection timeout observado en el tramo ejecutado.

Nuevo STOP: Product HTTP commands retain shared security, transport boundary, ownership, durable
receipts and sanitized responses, apps/api/test/products/http.test.ts:436, ERR_ASSERTION/doesNotMatch.
Sus39 subcasos HTTP PASS, pero la aserción final busca el barcode canary001234 en todo el log y
coincidió con responseTime22.138200000001234. Es un falso positivo de la aserción de logs, no evidencia
de filtración del barcode en esa coincidencia. El test y sus expectativas se conservaron intactos.
Suite interrumpida al detectar el fallo; no hay PASS completo ni total único completo de DB.

Estado de esa pausa: API-06 NOT READY — PRODUCT LOG REDACTION ASSERTION. No run2, nueva corrida focused114,
regresiones focused/generadores ni commit/PR/CI/GitGuardian/merge de API-06. El focused114 previo
sigue siendo evidencia histórica, no una nueva ejecución. No se puede concluir estabilidad ni usar
la conclusión de dos suites secuenciales PASS. Runners propios detenidos; dos bases QA vacías del
run interrumpido inspeccionadas/eliminadas y PostgreSQL local detenido, sin sesiones ni bases
disposable restantes. No se tocaron recursos de otras aplicaciones ni proveedores.

Logs: %TEMP%/stockapp-api06-resume-{sanity,isolated-duplicate-state,isolated-movement-type,
isolated-auth,install,openapi,openapi-check,check,db-1}.txt. Incidentes anteriores conservados.
En esa pausa quedó pendiente decisión humana para tratar la aserción de redacción y reanudar gates.

## Validation incident — Product log assertion

La decisión humana posterior autorizó únicamente corregir el sentinel del test y reanudar los gates.
La aserción anterior buscaba el substring numérico001234 sobre todo el log; coincidió con la duración
legítima responseTime22.138200000001234. Esa coincidencia no demostró una filtración de Product.
Se conservan ambos STOP y sus logs como evidencia histórica, sin clasificarlos como vulnerabilidad.

apps/api/test/products/http.test.ts usa ahora PRIVATE_BARCODE_LOG_CANARY:
PRODUCT_BARCODE_PRIVATE_CANARY_Q7X9K2, barcode string válido según el contrato/domain existentes.
Viaja por POST/PATCH reales de Product y se verifica en el resultado de creación. La comprobación
de privacidad busca su literal completo sin transformar el log y conserva los otros canaries de
nombre/barcode ajeno. Un helper local mínimo comprueba ausencia; su test acepta el responseTime
del incidente y detecta la presencia del canary mediante una AssertionError esperada.
La prueba HTTP además confirma que responseTime sigue presente normalmente.

Focused Product HTTP corregido40 PASS y prueba del detector1 PASS, sin fail/skip/cancel.
Production logger changed: NO. responseTime retained: YES. No nuevos serializers, filtros,
redondeos, parser/framework de logs ni cambios a cobertura funcional de barcode/leading zeros.
No cambios a VoidSale/API-01 ni a pool/timeout/concurrencia/CI. Gates restantes en validación
secuencial; conteos y resultados finales se registran únicamente al completarlos.

## Canonical sequential PostgreSQL validation

Tras la corrección autorizada: focused API-06 de nuevo114 PASS; pnpm check completo PASS
(1470 tests unitarios, lint/typecheck/format/OpenAPI/build). Luego test:db se ejecutó solo dos veces:

| Ejecución | Tests/pass | Fail/skip/cancel | Duración |
| --- | --- | --- | --- |
| test:db secuencial1 | 749/749 | 0/0/0 | 654706.5108 ms |
| test:db secuencial2 | 749/749 | 0/0/0 | 588320.8597 ms |

Tras cada suite: cero conexiones QA, runners Node de tests y bases disposable. PostgreSQL18.6
seguía disponible, con max_connections100 y sin pools QA huérfanos. Sanity10 y los tres escenarios
aislados de la reanudación anterior PASS; también pasaron en ambas suites completas actuales.
No se cambiaron max10, timeout2000 ms ni test:db concurrency2; tampoco client.ts/migrate.ts/CI.

Timeout was not reproduced under the canonical sequential CI execution. The earlier failure occurred
while the full DB suite and pnpm check were running concurrently. No timeout/concurrency/pool settings
were changed.

Not reproduced under canonical sequential validation. Contención del run paralelo es la explicación
probable soportada por estos resultados; no hay causa raíz definitivamente probada ni un fix ficticio
del entorno en production. Logs stockapp-api06-final-db-{1,2}.txt y cleanup-{1,2}.txt en %TEMP%.
Continúan los gates finales/regresiones/generadores; PR/CI/GitGuardian/merge se verifican después.

## Final local gates — 2026-10-06

Frozen install, OpenAPI generate/check, pnpm check completo y build:api explícito PASS después
de las dos suites DB. Regresiones focused secuenciales: API-01/47, API-02/79, API-03/98,
API-04/135, API-05/128, API-06/114, Auth/35, Ownership/21, Security/37 PASS. También se ejecutaron
por separado Domain/428, Application/432, Mobile/551 y Contracts/35 PASS. Smoke HTTP compilado
independiente con PostgreSQL/SMTP/restart:9 PASS. Todas las suites completas/focused:0 fail/skip/cancel.

Total único2219:1470 unitarios +749 DB. DB incluye PostgreSQL55, Auth35, Ownership21, Security37,
API-01/47, API-02/79, API-03/98, API-04/135, API-05/128 y API-06/114. Las dos suites completas,
filtros, regresiones y smoke se solapan; no sumarlos nuevamente al total único. API-02 añade solamente
la prueba del detector del canary, además de corregir el sentinel del test HTTP existente.

db:generate PASS sin migration/schema drift; auth:generate/auth:check PASS sin auth-schema drift.
No cambios en dependencias/lockfile, production logger, client.ts/migrate.ts, pool/timeout/concurrencia,
CI, Domain/Application/Mobile ni lecturas Web/Sync/API-07. Diff y gates locales se revisan antes del
commit; head/PR/CI/GitGuardian/merge/main final se registran en la entrega externa al verificarse.

Un pnpm check final recién iniciado se interrumpió administrativamente al preparar la tabla de
evidencia documental, sin fallo de tests; log preservado como stockapp-api06-final-check-before-document-format.txt.
La comprobación final se ejecutó después hasta completar PASS. Logs restantes:
stockapp-api06-final-{install,openapi,openapi-check,check,build,compiled-http,db-generate,
auth-generate,auth-check}.txt y final-regression-*.txt en %TEMP%. No retries ocultos ni settings alterados.
