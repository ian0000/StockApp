# API-08 — Read models de inventario

Base main `726d9decc28ddc344594e452f3fe3e616c8a1c9c` (API-07, PR #88).
Rama `feat/api-08-read-models`. Ocho GET reales; veintidós rutas implemented en el manifest.
Sin cambios Domain/Application/Mobile/schema/migraciones/dependencias/lockfile/CI ni deployment.
API-09 requiere API-08 DONE/MERGED, CI/GitGuardian PASS y main limpio0/0.

## Transporte y seguridad

GET `/v1/inventories/:inventoryId` con los sufijos dashboard, products,
products/by-barcode?code=..., products/:productId, stock-low, sales/:saleId,
purchases/:purchaseId e history. Sesión oficial verified, ownership, Business ACTIVE,
cloud habilitado, Origin y bucket durable de lectura120/min/user existentes.
Sin CSRF ni Idempotency-Key para GET; requestId/no-store y errores públicos sanitizados.
Missing/foreign/archived Product404 sin revelar otro owner. Sale/Purchase VOIDED propios200.
Schema/query estrictos: límites URL enteros canónicos, sin cambiar coerción global del body.
Ausencia de State obligatorio o corrupción estructural500, sin ocultarla con stock/costo cero.

Cada request utiliza una transacción PostgreSQL REPEATABLE READ READ ONLY.
No Inventory write lock, executor, receipts, ChangeSets ni incrementos de revisiones.
El bucket de seguridad puede persistir su contador fuera de la lectura comercial.

## Productos y cursores

ProductRead reutiliza mappers, Money/Percentage y reglas Domain de bajo stock/margin/markup.
Stock negativo permitido; minimumStock null/0 y costo null/cero siguen siendo distintos.
Métricas no representables son null según la disponibilidad Application existente.
Productos activos ordenados createdAt DESC,id DESC, limit50 por defecto/máximo100.
Search aplica trim/normalización de whitespace/case en name/variant; barcode es coincidencia
exacta de string tras trim de la consulta, conservando mayúsculas y ceros iniciales.
El endpoint by-barcode recibe el código exacto y no convierte a número.
Bajo stock aplica el mismo predicado Domain con consultas en bloques acotados.

Cursores opacos autenticados y cifrados con crypto Node existente, ligados a Inventory,
endpoint y filtro. Conceptualmente contienen la última clave de orden; el formato interno
no es contrato cliente. Manipulación, scope/filtro incompatible o forma inválida400.
La clave se deriva del secret auth existente; reinicios con el mismo secret conservan validez.
Páginas de requests distintas son una lista viva, sin promesa de snapshot entre páginas.

## Detalles y elegibilidad aprobada

SaleDetail.items usa exclusivamente SaleDetailItem: todos los campos financieros de SaleItem
más productName nullable y productVariant nullable. Provienen del Product actual scoped,
incluido archived, y reflejan renames/variant changes. Metadata no resoluble retorna null,
sin sustituir nombres ficticios ni modificar snapshots históricos.
SaleItem financiero, RegisterSaleResult.items, ChangeSet.saleItems y Sync permanecen intactos.
PurchaseDetail conserva su contrato existente, sin extensión de nombres por analogía.

CONFIRMED elegible: true/null. Movimiento posterior o createdAt ambiguo:
false/SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT. Estado actual diferente: false/CURRENT_STATE_MISMATCH.
VOIDED terminal y legible: false/null; no simula otra reversión ni amplía el enum.
CONFIRMED valida originales únicos/completos, ausencia de reversión y estado exacto con
Domain y política API-06/07 existentes. Producto archived no altera elegibilidad.
La lectura no cambia la política de comandos: misma key/hash replay; distinta stale409;
distinta vigente contra VOIDED422. No accepted Cloud no-op.

## Historia y dashboard

History contiene SALE/PURCHASE/ADJUSTMENT comerciales, incluidos VOIDED; no filas REVERSAL.
Orden effectiveAt DESC,createdAt DESC,id DESC; type es desempate interno final si coinciden
las tres claves entre tablas. Limit50 por defecto/máximo50, keyset scoped y consultas acotadas.
Nombre/variante actuales de Purchase/Adjustment incluyen archived; metadata requerida
estructuralmente ausente500. Sale units procede de sus líneas históricas propias.

Dashboard utiliza Inventory.reportingTimeZone IANA y límites UTC epoch semiabiertos del día
local, incluidos días DST23/25h. Totales/units/top-selling consideran solo CONFIRMED.
Sin ventas: total/profit0 y topSelling null. Cualquier profit desconocido hace el total de
profit null, sin sumas parciales ni coste sustituto. Dinero agregado exacto en strings,
con rango safe del contrato antes de responder.
Top-selling: units DESC, última Sale.effectiveAt DESC y Product.id DESC; excluye Product
archived de esa promoción, conservando los totales históricos. Bajo stock preview máximo2
y recent máximo5 siguen UX/Application existentes. No fórmula financiera nueva.

## Validación y correcciones de fixtures

Tests reales en test/read-models: límites/cursor/search/barcode/legacy UUID, A/B, metadata
actual/archived/null, snapshots conocidos/desconocidos, matriz de elegibilidad/corrupción,
history/keyset, timezone/DST, dashboard y no escrituras comerciales.
Smoke compilado Node/PostgreSQL/Auth/SMTP verifica flujo Product/Purchase/Sale/void, detalle
enriquecido, snapshots intactos, privacidad, restart y validez del cursor.

Correcciones autorizadas tras STOP: 404 scoped usa OwnershipError existente; unión explícita
SaleDetailDto/PurchaseDetailDto solo en test; fixture UUID añade metadata null solo al read DTO;
test del manifest distingue Products401 de futuras404 con cero conexiones; archive del smoke
read-models usa revisión1 después del update. Sin cambios a producción financiera ni expectativas.

Gates ejecutados: pnpm check1473 PASS y build separado PASS; test:db933 PASS,
0 fail/skipped/cancelled, sin timeout. Total único2406; no sumar regresiones repetidas.
Regresiones focused API-01..08:47/79/98/135/128/114/108/76 PASS; Auth35/Ownership21/Security37
PASS. Smoke compilado final11 PASS, sin skips. db:generate sin migration/schema drift;
auth:generate/auth:check sin auth drift. Frozen install y diff check PASS.
Revisión de scope: solo lectores/contrato read/tests/docs y registro runtime; configuración PG,
motor API-01, Domain/Application/Mobile y dependencias intactos. CI/GitGuardian/PR/merge
se verifican contra el head final antes de continuar API-09.
