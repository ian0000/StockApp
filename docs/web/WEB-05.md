# WEB-05 — Sale cart, registration and detail

Base verificada: `9ce5858f5ed9586bae44147a1a82422cfd5827a7`, main limpio0/0 tras WEB-04.
Rama: `feat/web-05-sales`. Scope exclusivo WEB-05; STOP después de merge y main limpio.

## Preflight completo

Revisión read-only de AGENTS65.1, baseline Web/UX/seguridad/contratos/API-01/03/08,
Money/Sale/pricing de Domain, cart Mobile como referencia y composición Web existente.
Decisiones humanas nuevas: ninguna.

| Puntos del ticket | Evidencia / decisión existente |
| --- | --- |
| 1–7 | RegisterSaleCommand multiproducto, Product único, cantidad entera positiva y precio explícito positivo; regularSalePrice solo inicializa el carrito |
| 8–12 | RegisterSaleUseCase permite negativo; preconditions.expectedCosts sin revisiones State/metadata; stock concurrente combinable con mismo costo |
| 13–17 | Money/Domain distinguen costo null/0; costo multiplicado por cantidad y profit contra el precio de la línea, nunca precio habitual |
| 18–21 | COST_SNAPSHOT_CONFLICT409 y Product404 terminales; API-01 receipt/hash durable y key=operationId sin repetir delta |
| 22–24 | Nuevas identidades UUIDv7; accepted público ofrece ChangeSet suficiente; resultReferences permanece interno del servidor |
| 25–29 | SaleDetail contiene sale/items/voidEligibility; snapshots históricos y metadata Product actual nullable; VOIDED legible, acción WEB-09 pendiente |
| 30 | Products usa el mismo ciclo pending/CSRF/retry/receipt/scope; extracción mecánica común conservando API y regresión WEB-03/04 |

## Implementación

`/sales/new` sustituye el placeholder. Carrito React en memoria, acotado por generation,
Business e Inventory y ubicado sobre el router: navegar dentro del shell conserva el draft;
aceptación, descarte y cambio de sesión lo limpian. Sin storage comercial ni cola offline.
Lista/búsqueda/keyset y barcode reutilizan Product client/query existentes. Barcode es string
exacto con ceros iniciales; Enter consulta el endpoint propio; duplicados incrementan una línea
y conservan precio/texto/dirty. Cantidad segura positiva, decremento1 quita, Quitar explícito.

Cada precio conserva Money original separado de display2 y texto editable.1234567 muestra1.23
y se envía1234567 sin edición; reescribir1.23 envía1230000. Decimal punto/coma hasta seis
decimales según UX. Texto inválido conserva último valor semántico y bloquea confirmar.
Precio habitual0 obliga a elegir un precio positivo;1 micro puede mostrar0.00 y sigue siendo
positivo. Subtotales/total/overflow usan Domain Money existente, sin nuevas fórmulas.

Cada intención nueva refresca todos los Product detail antes de generar el comando.404/archived
bloquea sin quitar líneas; metadata/costo nuevos no sustituyen el precio elegido. expectedCosts
usa el costo fresco: unknown tres null, conocido0 exacto, costo/profit exactos por línea.
Nunca se suma el subconjunto conocido cuando el agregado es desconocido. Stock negativo
muestra warning con Tienes/Venderás/Quedará, foco y Revisar/Registrar igualmente. Continuar
envía el mismo comando preparado; editar/revisar descarta esa intención sin enviarla.

Un comando SALE_REGISTER por intención: operationId/saleId/itemId/movementId UUIDv7,
occurredAt=createdAt, dependsOn[], notes:null, CSRF request-local y key=operationId.
No expectedStateRevision/metadataRevision. Resultado200 validado con schemas browser
compilados y relaciones propias Sale/item/Product/State/Movement/evidencia.
Solo aceptación invalida las consultas Product propias y Sale detail: ningún decremento
optimista. Query refetch lee el estado real del servidor.

## Incertidumbre, sesión y privacidad

Un ciclo compartido en commands/controller/pending/scope para Product y Sale. Las variaciones
son validación/resultado/mensajes propios, no un segundo framework. Las API públicas Product
y su storage key se conservan. Single-flight, abort/epoch/generation y boundaries existentes.

Network/timeout/500/503/respuesta inválida después del posible envío preservan body/key exactos
solo en memoria. Retry renueva CSRF pero no refresca costos ni genera IDs. Fallo de CSRF en
un retry conserva incertidumbre previa.409 costo terminal limpia pending y refresca lecturas;
solo una confirmación explícita nueva usa nuevo costo/UUID y mantiene precio elegido.
404/422 conservan el carrito de la pestaña con feedback seguro; no reintento automático.

Único storage Sale: `sessionStorage['stockapp.pending-sale']`, allowlist exacta de tres campos
`{operationId,inventoryId,commandKind:'SALE_REGISTER'}`. Sin saleId/cart/payload/productId/precios/
costos/revisiones/tokens/PII. Al recargar espera auth/Me/Inventory propio y consulta receipt.
ACCEPTED recupera SaleID exclusivamente del ChangeSet público validado; terminal sin body
informa rechazo sin reconstruir cart/comando;404 conserva incertidumbre hasta descarte
consciente. Inventory ajeno no se consulta. Offline bloquea envío/retry/consultas explícitas;
lecturas cached se identifican como posiblemente desactualizadas.

## Detalle histórico

`/sales/:id` valida schema, route ID y scope de Sale/items, sin consultar Product activo para
reconstruir historia. Nombre/variante actuales nullable solo presentación; costo/profit son
snapshots históricos. Unknown muestra no disponible sin sumas parciales ni sustitución0;
conocido0 y profit negativo se muestran. CONFIRMED/VOIDED legibles, sin acción anular/Undo.
Intl usa explícitamente Inventory.reportingTimeZone; no fallback a timezone del navegador.
Labels, alert/status, controles44px y layout responsive siguen el shell existente.

## Pruebas y gates

Test-first financiero: cinco casos críticos RED sobre stubs, después PASS con Domain Money.
Focused Sale/browser:121 PASS,0fail/skips. Cubre los grupos obligatorios del ticket: cart/price/
IDs, refresh/cost/stock/warning, CSRF/POST, incertidumbre/retry/reload/storage, boundaries/cache,
DTO/scoping/historia/timezone y CSP/bundle. Incluye QueryObserver real que obtiene stock9 solo
tras accepted y GET, y late POST ignorado al expirar sesión. Regresión Products conservada.
node:test/tsx, fake fetch, Query real y render ReactDOM; QA-03 mantiene E2E en navegador físico.
Estos gates no certifican hosting ni producción.

Smoke adicional en navegador real local contra un API fixture, sin DB ni hosting: carrito conserva
precio3.123456 al navegar a Products y volver; barcode0012345+Enter incrementa sin duplicar;
warning10/11/-1 mantiene foco y Revisar no envía; confirmación produce exactamente un POST
con precio3123456/cantidad11/key=operationId, navega al detalle financiero y luego deja cart vacío.
Descarte explícito vacía sin POST; logout retira shell/cart. Layout narrow304px inspeccionado.
Screenshot y log de requests quedan como evidencia de QA externa al repo; servidores/pestaña
temporales detenidos. Esto verifica UI con fixtures, no certifica la integración API desplegada.

Gates locales completos PASS: Web lint/typecheck y348 tests, OpenAPI check, pnpm check1825 tests
(Domain428/Application432/Mobile551/Contracts38/API28/Web348), build Web/API y API build separado.
PostgreSQL test:db1004 PASS,0fail/skip/cancelled, incluidos API-01..10/Auth/Ownership/Security y
13 compiled HTTP, sin connection timeout. db:generate sin schema/migration drift;
auth:generate sin diff y auth:check PASS. Diff revisado y diff --check PASS.
Todos secuenciales, sin cambios de pool/timeout/concurrency/workflow. PostgreSQL QA detenido
preservando data; cero bases desechables y clientes residuales antes del stop.
CI y GitGuardian del head final se verifican en la entrega antes de declarar DONE/MERGED.

## Archivos y correcciones mecánicas

Web: commands/*, sales/*, routes/sales.tsx, app/router/composición/main, styles/base.css;
Product controller/pending extraídos sobre el ciclo común. Tests Sale/cart/commands/client/
fixtures, app y browser-contract. Compiler build-only añade tres validators de schemas
existentes; ningún contrato público cambia. Docs: este ticket y cinco notas mínimas.

AUTO-FIX: placeholders Sale antiguos, typing de fetch fixture Promise<Response>, nombres
del registry schema vs DTO, imports/hooks/formato y expectativas de nuevos tests auth.
CAUSE: fixtures nuevos deben seguir tipos/estados existentes, no inventar otros.
SOURCE OF TRUTH: SessionController (401 ANONYMOUS,403 ERROR seguro), registry contracts y
router WEB-05 autorizado.
FILES: apps/web/test/app.test.tsx, sale-commands.test.ts, browser-contract.test.ts y
routes/sales.tsx; packages/contracts/src/browser-error-cli.ts para validators build-only.
PRODUCTION BEHAVIOR CHANGED FOR FIX: NO; feature Web solicitada y refactor común aparte.

No cambios API runtime/Domain semantics/Application/Mobile/PostgreSQL/SQLite/schema/migrations/
contratos públicos/dependencias/CI. No WEB-06/VoidSale/Home/History/Sync/MIG/deploy.
Tras CI/GitGuardian PASS: merge normal, main clean0/0 y STOP.
