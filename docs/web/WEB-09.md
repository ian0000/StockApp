# WEB-09 — Anular venta y compra desde detalles

Base main87dc9ac692328bbab47ce67a030798e73eb0455d (WEB-08/PR100), pull ff-only, clean0/0.
Rama feat/web-09-void-operations. Scope exclusivo WEB-09; gates/CI/merge se registran al verificarse.

## Preflight y excepción humana aprobada

Preflight READ-ONLY de los31 puntos: AGENTS65.1, BACKLOG/WEB_UX/API01/06/07/08/WEB05..08/
CONTRACTS_V1/DOMAIN_REUSE/SECURITY/TESTING/CI_CD/CURRENT_STATE, UX34.1 y BUSINESS_RULES39.1,
contratos/manifest/lectores API y Web commands/Products/Sales/Purchases/reads/routes/tests.
Un único blocker: Product GET/list/barcode/low-stock excluyen archived; Sale/Purchase detail solo
publican eligibility/historia. Backup/export omiten stateRevision/lastMovementId; receipts son
snapshots de commits anteriores y Sync State reads siguen planned. No se inventó evidencia.
Reporte externo stockapp-web09-preflight-review.md; cero cambios Git antes de la resolución.

Resolución humana explícita2026-10-12: extensión aditiva mínima GET
`/v1/inventories/:inventoryId/products/:productId/state`. Reutiliza InventoryStateDto/InventoryState
existentes, sin nuevo schema de entidad ni versiones. Permite Product propio active/archived;
GET Product actual y list/barcode/stock-low conservan filtro active. Los dos voids usan SIEMPRE
este GET para evidencia actual, tanto para activos como archivados.

Excepción acotada: API read runtime/ruta, manifest/OpenAPI/documentación y pruebas/API-Web/cliente.
No cambia Domain/Application/Mobile/schema/migrations/dependencies/CI ni reglas API06/07.
No permite crear ventas/compras/ajustes nuevos sobre archived ni desarchiva automáticamente.

## GET State

Infraestructura API08 RR READ ONLY, sesión oficial verified, owner Business/Inventory ACTIVE y piloto,
Origin/CORS/bucket read/NoQuery/params UUID/no-store/requestId/sanitización existentes. No CSRF/key GET.
Query Product+State scoped por inventoryId/productId; devuelve stock, Money nullable exacto,
stateRevision decimal string sin Number y lastMovementId real. Missing/foreign404 indistinguibles;
Product propio sin State obligatorio falla500 seguro, sin stock/costo ficticio. Reutiliza mappers.
Sin writes comerciales, locks de escritura, executor, receipts, ChangeSets ni incrementos de revisión.
El contador de seguridad sigue su comportamiento existente.
GET no congela State hasta POST; preconditions exactas y Inventory lock del comando rechazan stale409.

## Detalles, elegibilidad y confirmación

Sale/Purchase detail conservan campos financieros y fechas históricas. Sale metadata actual nullable
solo presentación; Purchase Product label opcional no condiciona anular archived. VOIDED visible,
sin botón activo de otra anulación. Elegibilidad proviene exclusivamente del servidor: posterior/
orden ambiguo o CURRENT_STATE_MISMATCH tienen explicación simple, sin SQL/revisiones visibles.
Una sola línea ineligible bloquea Sale completa; sin anulación parcial ni Adjustment void.

Anular inicia GET fresco detail y State de cada Product distinto, aún sin POST. Confirmación explícita:
¿Anular esta venta/compra?, efectos inventario restaurados, historia permanece anulada, no borrado,
sin motivo ni timer Undo. Cancelar cero writes. Confirmar vuelve a leer detail y todos los States;
cambio de eligibility/estado bloquea o actualiza revisión y exige confirmación humana nueva.
Falta de una evidencia impide el comando completo, sin omitir Products.

SALE_VOID: un comando, UUIDv7 nuevo operation/reversal por Product, referencias existentes legacy
permitidas; occurredAt=payload.createdAt, dependsOn[], full State precondition por Product.
PURCHASE_VOID: UUIDv7 operation/reversal, purchaseId original, full State sin productId extra payload.
Timestamp lógico no anterior a updatedAt histórico. No amounts/reconstruction financiera en payload.
Schema estático compartido, CSRF request-local y key=operationId; POSTs existentes API06/07 intactos.

Resultados200 validan schema/VOIDED/identidades/scope/cardinalidad/reversal links/State pointers,
revision+1 exacta y snapshots del detalle original cuando disponibles en memoria. Sale reversals
cubren toda la venta; Purchase restaura snapshots previos server-side, incluidos costo null/cero y
stock negativo. ALREADY_VOIDED compartido/local no se interpreta como nuevo éxito Cloud.
No recalcula costos, métricas, priceAnalysis ni ejecuta PURCHASE_REGISTER.

## Incertidumbre, recovery y cache

Dos adapters VoidController sobre ScopedCommandController existente, sin framework retry paralelo.
Network/timeout/5xx/success malformed conservan intención exacta solo en memoria. Retry no refresca
State ni genera IDs: mismo body/op/key/reversals/evidencia; solo CSRF puede renovarse.
Single-flight, abort/epoch y scope generation/Business/Inventory fencean respuestas tardías.

sessionStorage independiente stockapp.pending-sale-void / stockapp.pending-purchase-void:
EXACTAMENTE operationId/inventoryId/commandKind. Allowlist existente sin relajación; ningún entity ID,
State/revisión/stock/costo/movimiento/payload/PII/token/CSRF persistido. Sin localStorage/outbox.
Storage falla antes del primer POST: no envío ni fallback comercial.

Reload espera own authenticated Inventory y GET OperationReceipt. ACCEPTED valida ChangeSet público
completo: Sale VOIDED1+REVERSAL/State por Product, o Purchase VOIDED1+REVERSAL1/State1;
sin SaleItems/Products/otras colecciones/tombstones ficticios. No resultReferences privados.
Validación precede a limpiar pending; mensaje La anulación anterior sí se registró.
Receipt404/malformed conserva uncertainty; comprobar/descarte consciente, sin inventar body perdido.
409/422 terminal limpia y refetch detail, sin nuevo comando automático. Nuevo intento necesita
otra confirmación y evidencia vigente.404 es seguro. Reload terminal sin entity ID refetch solo
el prefijo own detail; no inventa ID ni invalida totales.

Solo aceptación directa/retry/receipt invalida detail, Products list/detail/search/barcode y
WEB08 invalidateCommercialReads Dashboard/History. No stock/totales/history rows optimistas.
Pending/unknown/rejected/conflict/cancel no invalidan los totales financieros. History obtiene
VOIDED original por GET; nunca agrega una fila REVERSAL ni fake negative Sale/refund.

Misma-session refresh conserva review en controller scoped sobre guards transitorios. Navegación
real limpia revisión no enviada, incluida preparación GET en curso; intención posiblemente enviada
permanece resoluble. Logout/session invalidation/User/Business/Inventory distintos limpian/fencean.
Offline bloquea nuevas confirmaciones, envío, retry/check; detalle cached se identifica stale.
Sin reconstrucción automática al reconectar: intención nueva necesita detalle/evidencia frescos.

## Pruebas y gates

Focused Web183 PASS (commands/recovery/client/input/presentation/pointer); Web completa900 PASS,
0fail/skip/cancelled. Typecheck Web/API/contracts y lint Web PASS. API State reader14 PASS y
HTTP read37 PASS: exactitud null/zero/BIGINT/pointer, archived/missing/foreign, integrity500,
legacy/headers/auth/session revocation/Origin/rate, regresiones y no writes comerciales.
API tests archived Sale/Purchase void y mixed Sale stale all-or-nothing usando el lector nuevo.
Revisión final: lastMovementId de la evidencia vigente NO se interpreta como ID del movimiento
original. API06/07 permiten capturar un pointer nullable y resuelven el ledger original en servidor.
Se quitó esa asunción del validador Web, conservando preconditions exactas, links REVERSAL y pointer
del State resultante. Cuatro casos nuevos test-first RED→GREEN y dos casos PostgreSQL de aceptación
con pointer actual null (reader final14 PASS) lo demuestran sin cambiar API06/07/Domain ni contratos.
Scope checks también usan Business/Inventory de la sesión aunque Cloud esté deshabilitado:
cambio real limpia/fencea intención, refresh transitorio de la misma sesión la conserva. Cuatro casos
RED y focused final183 PASS lo verifican; dos casos adicionales rechazan self-reversal incoherente.
Validators CSP incluyen InventoryState y Void commands/results desde schemas existentes.
Sin dependency nueva. pnpm check final2377 PASS (Domain428/Application432/Mobile551/Contracts38/
API28/Web900), incluyendo OpenAPI/format/lint/types/builds. Build API separado PASS.
El smoke compilado API08 se extiende para obtener State por HTTP del Product ya archived y usar
esa evidencia exacta en SALE_VOID; tipo/lint owning PASS. pnpm test:db1022 PASS,0fail/skip/cancelled/
todo/connection-timeout, incluyendo API01..10/Auth/Ownership/Security/compiled HTTP.
db:generate PASS sin schema/migration drift; auth:generate sin drift; auth:check y git diff --check PASS.
OpenAPI conserva componentes y rutas anteriores idénticos; solo añade el GET aprobado.
CI/GitGuardian externos deben pasar sobre el commit revisado antes de merge.

Browser fixture sintético local y servidores propios: no production ni certificación QA03.
Smoke PASS: Sale multiproducto archived VOIDED, ineligible sin parcial, Purchase archived con costo
previo null/stock negativo, cancel0 POST, ACK perdido con dos POST idénticos y un único efecto,
reload/public receipt sin nuevo POST, History VOIDED original y Home totales servidor.
Misma-session polling3→5 auth GET conserva confirmation sin POST. Respuesta Sale POST retenida
y cambio real A→B retiran datos/intent A: B sin receipts/writes ajenos, Home vacío propio tras release.
Narrow305px útiles: clientWidth=scrollWidth, confirmation/control/snapshots legibles. Screenshots
stockapp-web09-purchase-recovery/sale-confirmation-narrow/account-boundary inspeccionados en artifacts.
Tab cerrado, viewport restaurado y servidores propios detenidos. Warning Vite final conservado:
principal1644,09kB/gzip268,36kB; sin cambios de límites ni optimización fuera del ticket.
PostgreSQL real compatible
Linux18.6 permitido; timeout intermitente Windows sigue sin root cause demostrado.
Sin modificaciones a pools/timeouts/concurrency/PG/CI ni retries/sleeps/skips para obtener verde.
QA PostgreSQL cerrado: cero bases disposable y clientes antes de detener el contenedor propio;
volumen y clusters Windows preservados. No se atribuye resolución al timeout Windows.

## AUTO-FIX mecánico

CAUSE: TypeScript ya estrechaba result.status a CONFLICT tras assert.equal; comparación adicional
contra ACCEPTED era imposible. SOURCE OF TRUTH: resultado esperado del fixture stale409 y node:assert.
FILES: apps/api/test/read-models/state.test.ts. PRODUCTION BEHAVIOR CHANGED FOR TEST FIX: NO.
CAUSE: import duplicado del mismo módulo en un test nuevo. SOURCE OF TRUTH: lint existente.
FILES: apps/web/test/void-input-client.test.ts. PRODUCTION BEHAVIOR CHANGED FOR TEST FIX: NO.
CAUSE: conteo OpenAPI/manifest del test permanecía25 tras el GET State aprobado (ahora26).
SOURCE OF TRUTH: resolución humana WEB-09 y routeContracts/runtime actualizado.
FILES: packages/contracts/test/v1.test.ts. PRODUCTION BEHAVIOR CHANGED FOR TEST FIX: NO.
Se mantiene el conteo exacto, resolución de refs/params/reproducibilidad/stale; Contracts38 PASS.
Sin cambiar expectativas financieras ni reducir cobertura; imports/format de implementación siguen
exports existentes, sin nueva semántica productiva para acomodar tests.

STOP tras WEB09 DONE/MERGED/main clean0/0. No WEB10/Sync/MIG/UAT/PROD/deployment.
Estrategia DEV local+GitHub CI → futuro UAT → aceptación humana → PROD, sin desplegar entornos.
