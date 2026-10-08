# WEB-04 — Product detail, edit, archive and profitability

Base main `a038096f426e3e2ae2a93f11aa1fa2019c924d9f` (WEB-03, PR #95), actualizado,
limpio y 0 ahead/0 behind. Rama `feat/web-04-product-detail-edit`.

## Preflight completo

Revisión READ-ONLY de AGENTS65.1, BACKLOG/WEB-01/02/03/WEB_UX/API/API-01/02/08,
CONTRACTS_V1/DOMAIN_REUSE/SECURITY/TESTING/CURRENT_STATE, UX/BUSINESS_RULES,
contracts transport/entities/commands/reads/routes, Domain Money/Percentage/Product/pricing,
Web products/auth/session/query y runtime API Product/read como evidencia contractual.
HUMAN DECISIONS REQUIRED: NONE. Ninguna dependencia nueva.

| Puntos del preflight | Fuente y resultado confirmado |
| --- | --- |
| 1–5 | GET Product detail scoped, ProductRead con product/state/isLowStock/margin/markup; API-08 solo activos y missing/foreign/archived404 genérico |
| 6–10 | API-02 PATCH y POST archive usan executor API-01, key=operationId y expectedMetadataRevision |
| 11–13 | transport revision string exacta; executor compara bigint e incrementa metadata1; no cambia State |
| 14–18 | Archive produce solo Product upsert/isArchived, sin DELETE/movement/tombstone; historia/State intactos; PATCH solo cinco metadata fields |
| 19–21 | REVISION_CONFLICT409 terminal con currentRevision; receipt/hash original durable; reissue explícito con UUIDv7 nuevo |
| 22–24 | contracts/Domain conservan costo null distinto de cero, Percentage nullable y strings escalados1e6 |
| 25–27 | UX/input existente distingue display y semántica exacta; precio no editado intacto y reescritura explícita dirty |
| 28 | pending/controller WEB-03 reconocían CREATE; se generalizan los mismos módulos para UPDATE/ARCHIVE |

## Implementación

`/products/:id` y `/products/:id/edit` sustituyen placeholders. ProductRead validado por
schema estático compartido y por las cuatro relaciones UUID case-insensitive. Query key incluye
generation/Business/Inventory/Product;404 confirmado reemplaza el detalle cached por null y
muestra Producto no disponible. Loading/error/retry/offline,401/403 existentes y429 seguro.

Detalle semántico con nombre/variante/barcode, stock negativo, costo promedio, precio habitual,
mínimo/bajo stock y margen/markup. Money y Percentage usan Domain/codec y redondeo exacto solo
en display2; null No disponible y cero conocido0.00. Sin IDs/revisiones/ledger en presentación.
Editar y Ajustar stock enlazan rutas; Adjustment continúa placeholder WEB-07.

Formulario de cinco campos mantiene original semántico, texto y dirty individual exclusivamente
en memoria. Precio precargado1234567 muestra1.23; editar solo nombre conserva1234567; reescribir
1.23 explícitamente genera1230000. Opcionales trim/null, barcode conserva ceros, mínimo entero
seguro/no negativo, precio Money no negativo/hasta seis decimales. Labels/errores/foco/fieldset
deshabilitado/status y layout responsive sin esconder stock/costo/rentabilidad.

UPDATE/ARCHIVE importan versiones, UUIDv7 por intención, occurredAt y dependsOn[], sin device ni
supersession. Revisión original string exacta, CSRF request-local y key=operationId. Result200
valida ProductMutationResult e identidad/scope/archive state; ninguna escritura optimista.
Update invalida listas/search/barcode/detail propios y refetch activo, con feedback/navegación.

409 REVISION_CONFLICT limpia pending, bloquea retry/submit y consulta GET actual. Dirty draft
se conserva; Revisar con la versión actual mantiene dirty y toma untouched/latest revision;
Descartar mis cambios reinicializa todo. Ninguna acción reenvía; próximo submit genera nueva key.
Si GET falla, Reintentar consulta repite solo esa lectura. Un404 retira el recurso. Reload terminal
sin payload informa rechazo/refresca consultas y permite reconstrucción consciente.
Al navegar a otro Product, el conflicto bloquea la mutación y enlaza al Product original;
nunca ofrece rebase entre identidades distintas. Un accepted de otra ruta permite Continuar
explícitamente, sin reenviar ni alterar ese segundo formulario.

Archive exige confirmación inline con foco, warning de historial conservado y Cancelar/Confirmar.
Solo POST archive; nunca DELETE ni escrituras State/history. Success retira detalle sin refetch
archived, invalida listas/barcode propios y navega a Products con feedback. Conflicto cierra
confirmación y requiere nueva confirmación explícita con revisión vigente. API-02 conserva
la prueba PostgreSQL de Product/State/history intactos; no se modifica runtime API.

## Incertidumbre y privacidad

Mismo ProductsController/pending/client WEB-03 para CREATE/UPDATE/ARCHIVE. Single-flight común;
unknown después del envío conserva body/op/key solo en memoria y bloquea nueva mutación.
Retry mantiene exactamente el comando, incluso revisión; error CSRF antes del retry no descarta
el original incierto. Session/account/Inventory boundary aborta, fencea y limpia antes de nuevas reads.

Único storage: `sessionStorage['stockapp.pending-product']` con allowlist exacta
`{operationId,inventoryId,commandKind}`. Sin productId/revision/payload/draft ni datos comerciales.
Reload espera auth/Me/Inventory y GET receipt; accepted identifica Product desde upsert validado
del ChangeSet (resultReferences es evidencia interna API, no campo del DTO receipt público).
UPDATE informa El cambio anterior sí fue guardado; ARCHIVE El producto anterior fue archivado,
sin volver al detail. Receipt404 mantiene incertidumbre sin recrear comandos; descarte explícito.
CREATE recovery conserva comportamiento WEB-03. Sin storage tokens, IndexedDB ni cola offline.

## Validación

Web lint/typecheck/tests/build PASS. Suite enfocada WEB-04:102 PASS; suite Web completa230 PASS,
0fail/skip/cancelled, incluidos102 casos adicionales y regresión CREATE.
node:test/tsx, fake fetch, Query real y ReactDOM semantic rendering; validators bajo CSP sin eval
y bundle sin Ajv/compiler/API/Mobile/Application/DB. QA-03 conserva browser E2E físico;
no se certifica hosting ni producción mediante estas pruebas.

OpenAPI check PASS; pnpm check1707 PASS: Domain428/Application432/Mobile551/Contracts38/API28/Web230.
Build API separado y ambos builds del gate final PASS. PostgreSQL test:db1004 PASS,0fail/skip/cancelled,
sin connection timeout; API-01..10/Auth/Ownership/Security y13 compiled HTTP incluidos.
API-02 confirma archive como Product upsert único conservando State/historial. db:generate sin
schema/migration drift; auth:generate sin diff y auth:check PASS. Diff revisado y diff --check PASS.
PostgreSQL QA se detiene conservando data; cero DBs desechables/clientes residuales antes del stop.
CI/GitGuardian/PR/merge del head final se verifican en la entrega antes de declarar DONE/MERGED.

## Archivos

- Web runtime: app/router.tsx; products/client/controller/edit/input/pending/queries;
  routes/product-detail.tsx y products.tsx; styles/base.css.
- Web tests: product-edit.test.ts, product-detail.test.tsx, app.test.tsx,
  browser-contract.test.ts y products.test.tsx.
- Compiler build-only: packages/contracts/src/browser-error-cli.ts añade tres validators existentes.
- Documentación: WEB-04, BACKLOG, CURRENT_STATE, WEB_UX, TESTING y CI_CD.

## Correcciones mecánicas

AUTO-FIX: fixture de recuperación CREATE usaba otro Product ID que el comando realmente enviado.
SOURCE OF TRUTH: API-01/02 receipt/ChangeSet y misma identidad de intención.
FILES: `apps/web/test/products.test.tsx`; captura el comando y construye su Product/State con
el helper strictResult existente. Expectativas ACCEPTED/refetch permanecen intactas.
PRODUCTION BEHAVIOR CHANGED FOR FIX: NO.

Fixtures nuevos corrigieron token CSRF y método GET explícito del cliente; receipt archive usa
objetos independientes para no mutar el fixture global. Typing/imports/formato propios corregidos.

## Frontera y entrega

Cambios limitados a Web products/routes/query/styles/tests, compiler browser build-only y estas
notas. Domain/Application/Mobile/API runtime/schema/migrations/contracts públicos/deps/CI intactos.
Tras CI/GitGuardian PASS: merge normal, main clean0/0 y STOP. Sin WEB-05/Sync/MIG/deploy.
