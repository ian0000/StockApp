# WEB-08 — Home, historial comercial y stock bajo

Base main `7c94fe4a097f3fe91585df9945432d1e3877cbbc` (WEB-07, PR #99), pull ff-only,
clean0/0 antes de crear `feat/web-08-home-history`. Scope exclusivo WEB-08.

## Preflight completo

Revisión READ-ONLY de AGENTS65.1; BACKLOG/WEB_UX/API/API-08/WEB-03..07/DOMAIN_REUSE/
SECURITY/TESTING/CI_CD/CURRENT_STATE; UX Inicio/History/low-stock/fechas y BUSINESS_RULES
16/17/38/39/41; schemas reads/entities/routes, dashboard/history PostgreSQL y Web app/routes/
Products/Sale/Purchase/Adjustment/commands/session. Ninguna decisión humana pendiente.

| Secciones del ticket | Fuente de verdad / resultado |
| --- | --- |
| 1–4 | WEB-07 integrado, endpoints Dashboard/HistoryPage/stock-low existentes, sin API/schema nuevo. Home/History reemplazan placeholders. |
| 5–8 | DashboardDto suministra total/profit nullable/units y rango diario del servidor. API-08 usa reportingTimeZone/DST y CONFIRMED; cliente no agrega ni filtra operaciones para métricas. |
| 9–13 | Acciones Venta/Compra; preview lowStock máximo2, isLowStock suministrado, negativos/null/0; topSelling nullable y recent máximo5. Sin ranking/predicado nuevos. |
| 14–21 | HistoryPage comercial SALE/PURCHASE/ADJUSTMENT, VOIDED histórico conservado, sin REVERSAL/INITIAL_STOCK. Orden servidor; limit50/cursor opaco; Hoy/Ayer solo presentación en timezone Inventory. |
| 22–27 | Keys generation/Business/Inventory; accepted directo/retry/receipt invalida lecturas propias. Pending/unknown/rejected/conflict no invalidan Home/History. Sin cache persistida ni agregación optimista. |
| 28–30 | Money transport/schema/codecs exactos y formatMoney existente; etiquetas WEB-07. Headings/links/foco/retry/live regions y narrow. |
| 31–33 | Tests/fixture browser/documentación, sin certificado QA-03 ni fuentes production. |
| 34–39 | DEV local+GitHub CI; futuro primer entorno online UAT. Cambios arquitectónicos/deployment separados. PROD requiere aprobación humana. Gates/PR/CI/GitGuardian/merge/main0/0 y STOP. |

UX canónica enumera conceptos de movimientos ADJUSTMENT_IN/OUT; el DTO de lectura aprobado
representa ambos con ADJUSTMENT y diferencia firmada. Se usa ese discriminador público existente,
sin alterar movimiento, contrato ni política de negocio.

## Home y contratos de lectura

`/` usa únicamente GET Dashboard, no listas Sale ni SQL/browser aggregation. Muestra total exacto
como Ventas de hoy, Ganancia estimada y unidades vendidas. Null es `—` con explicación de costo
desconocido; cero es dinero real y negativos conservan signo. Día vacío conserva métricas y mensajes
calmos, sin Product/top seller ficticio. Moneda procede del Inventory, no símbolo hardcodeado.
Acciones +Venta/+Compra siguen rutas existentes. Preview lowStock usa exclusivamente los dos DTOs
del servidor, muestra stock negativo y mínimo solo cuando disponible; mínimo0 visible, null distinto.
Ver productos navega a /products sin filtro nuevo. TopSelling y recent proceden del mismo Dashboard.

ReadsClient GET sin CSRF/Idempotency-Key/body, con transporte no-store/credentials existentes.
Validators estáticos se generan desde Dashboard/HistoryPage canónicos, CSP sin eval/compiler.
Respuestas inválidas se rechazan sin JSON/SQL/stack visibles; low-stock verifica identidad Product/
State/Inventory propio y activo. No inventa propiedad para HistoryEntry, cuyo DTO no contiene Inventory.
Auth/ownership siguen en API; el cliente solo consulta Inventory obtenido de la sesión válida.

## History y fechas

`/history` usa GET history?limit=50, InfiniteQuery con nextCursor opaco sin decode/offset. Cargar más
preserva páginas/orden servidor y elimina duplicados por type/id; tipos distintos con el mismo UUID
no se confunden. Reintentar/Actualizar refetch parte de la primera página y vuelve a consumir cursores
vigentes. No filtros, scroll infinito ni reconstrucción con consultas financieras separadas.

Sale muestra monto/unidades/effectiveAt/estado y enlaza detalle existente; Purchase muestra metadata
actual, quantity/unitCost/total/effectiveAt/estado y su detalle. VOIDED se presenta Venta/Compra anulada
con snapshots originales, sin restar/importar/recrear movimientos. Adjustment muestra metadata,
diferencia con signo/motivo/hora, sin status/costo/total ni enlace ficticio de detalle/Undo/anulación.
reasonLabel/signedDifference reutilizan WEB-07.

Intl.DateTimeFormat usa reportingTimeZone explícito. Hoy/Ayer y fecha anterior se derivan de fechas
civiles en esa zona; restar un día civil no asume23/24/25h entre instantes. No se cambia fromInclusive/
toExclusive ni se crea algoritmo de rangos para Dashboard. Fechas no representables informan Fecha
no disponible sin fallback a la zona del browser. Grupos conservan la secuencia servidor, sin sort.

## Cache, recuperación y seguridad

dashboardKey/historyKey incluyen private/generation/businessId/inventoryId. Queries usan AbortSignal,
keys y limpieza SessionController existentes; cambio real de identidad retira cache y fencea respuesta
vieja. Cambio Business/Inventory usa keys diferentes; revalidación de misma sesión conserva datos
propios. Sin modificación de polling/auth lifecycle ni cache comercial global.

Products/Sales/Purchases/Adjustments accepted() invocan el helper mínimo invalidateCommercialReads.
Se conserva invalidación Products y detalle previa. Direct accepted, same-key retry y receipt tras reload
recorren el mismo path. Product mutations refrescan Dashboard y metadata corriente de History;
CREATE inicial/UPDATE precio/ARCHIVE no generan entradas: solo GET de History decide contenido.
Se invalidan únicamente reads scoped; ningún total/contador/history row optimista ni cache patch.
No invalidación Home/History en request start, pending, uncertain, rejected ni conflicto terminal.

Loading/empty/error/retry/offline/stale son visibles; errores enfocables sanitizados.401/403 de acceso
delegan al SessionController existente;404 scoped no revela datos ajenos. Texto React escapado,
sin HTML ejecutable. Ninguna key/storage/dependencia nueva: Home/History solo cache de memoria;
pending Product/Sale/Purchase/Adjustment mantienen descriptors mínimos previos, sin payload/PII/tokens.

## Pruebas y browser

Fechas test-first:15 casos RED sobre stubs, después PASS; se agregó fallback seguro de fecha/zone.
Focused WEB-08:120 PASS (fecha16/client39/pages29/invalidation30+retry6).
Web completa717 PASS,0fail/skip/cancelled; includes regresiones Products/Sales/Purchases/price separation/
Adjustments/session. QueryObserver/InfiniteQueryObserver reales prueban aceptación y recuperación,
refetch scoped sin datos optimistas, cursor, boundary/late response y same-session. CSP/bundle existente
extiende validators de lecturas. Lint/typecheck/build PASS.

Smoke fixture sintético local: empty/known/null/negative profit/currency, low-stock2/negativo/mínimo0,
SALE/PURCHASE/ADJUSTMENT/VOIDED y fechas alrededor de medianoche Guayaquil; Sale/Purchase/Adjustment
aceptados y posteriores GET Home/History. Narrow305px útiles sin overflow. No production ni QA-03.
Evidencia externa en artifacts stockapp-web08-browser-* y screenshots stockapp-web08-home/history.
Cambio de cuenta con GET Dashboard A retenido: la revalidación periódica real cambió a B, retiró
todos los datos A y mostró loading propio. Al liberar la barrera, B conservó ceros/sin productos ni
operaciones ajenas; History B vacío. Sin sleeps de coordinación del harness ni modificar auth polling.
Tres POST únicos (uno Sale, uno Purchase, uno Adjustment) y GET Dashboard/History posteriores registrados.
Screenshot narrow y account-boundary inspeccionados; viewport restaurado, tab/servidores propios cerrados.

## Gates y frontera

Estado IMPLEMENTED; gates locales completos PASS antes de PR. OpenAPI check sin drift; pnpm check
2194 PASS (Domain428/Application432/Mobile551/Contracts38/API28/Web717), lint/types/format/builds PASS.
Build API separado PASS. pnpm test:db sobre PostgreSQL18.6 Linux:1004 PASS,0fail/skip/cancelled/todo,
0connection timeout; incluye API-01..10/Auth/Ownership/Security y HTTP compilado.
db:generate no schema changes/nothing to migrate; auth:generate sin diff; auth:check PASS.
git diff --check PASS; revisión completa conserva las áreas protegidas. QA termina con0 bases
disposable y0 otros client backends; container propio detenido y datos/volumen preservados.
CI/GitGuardian y requisitos de review del head final siguen siendo gates externos antes del merge.
Vite principal1318,49kB/gzip205,46kB: warning conservado, sin modificar límites ni optimización fuera
del ticket. PostgreSQL QA compatible Linux18.6 igual a CI; timeout Windows sigue sin causa demostrada.
No tuning de pools/connectionTimeoutMillis/concurrency/servidor/CI ni retries buscando verde.

API runtime, Domain/Application semantics, Mobile, schemas/migrations, contratos públicos,
dependencies/lockfile y CI intactos. Solo Web runtime/tests/presentación/styles, compiler build-only
y siete documentos. No WEB-09/Settings funcional/charts/reportes/void/Sync/MIG/UAT/PROD/deployment.

## AUTO-FIX

CAUSE: tests de placeholders esperaban Home sin métricas y History futuro; aserción literal `<main>`
ignoraba la clase semántica de Home nuevo.
SOURCE OF TRUTH: ticket WEB-08 y rutas reales aprobadas.
FILES: apps/web/test/app.test.tsx.
PRODUCTION BEHAVIOR CHANGED FOR TEST FIX: NO; mantiene navegación/metadata/guards y semantic main.

STOP tras merge normal y main clean0/0; no continuar WEB-09 automáticamente.
