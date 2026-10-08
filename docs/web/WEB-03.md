# WEB-03 — Products list, search, creation and keyboard barcode

Base main: `a87939013b9f686dff3b268d596f277ad6951998` (WEB-02 merged). Rama `feat/web-03-products`.
Estado: IMPLEMENTED, gates locales completos PASS. CI/GitGuardian/merge se verifican contra el head final.

## Preflight completo

Main actualizado, limpio y 0/0. Se revisaron AGENTS65.1, BACKLOG/WEB-01/WEB-02/WEB_UX/API/API-01/
API-02/API-08/CONTRACTS_V1/DOMAIN_REUSE/SECURITY/TESTING/CURRENT_STATE, UX/BUSINESS_RULES,
contracts transport/commands/entities/reads/routes, Money/Product puros, Web y rutas Product/read API.
HUMAN DECISIONS REQUIRED: NONE.

| Confirmación | Fuente / aplicación |
| --- | --- |
| 1 WEB-02 merged/main clean | Git main/origin SHA y pull ff-only |
| 2–9 ProductPage/ProductRead, activos, orden, límites50/100, search, barcode y keyset | contracts reads/entities y API-08; cliente no ordena ni decodifica cursor |
| 10–15 command exacto, UUIDv7 nuevos, key=operationId, device opcional | contracts commands, API-02 y uuid14.0.1 |
| 16–18 Money escalado1e6, exacto, unknown null | transport y Domain Money; display separado |
| 19–22 initialStock entero/no negativo; costo conocido obligatorio positivo, null con stock0 | Domain y API-02 |
| 23–26 mínimo nullable/no negativo, precio0 válido, trim y opcionales null | Product Domain y schemas existentes |
| 27–30 sin edit/archive, cámara, catálogo ni optimistic mutation | Frontera explícita WEB-03 |

La instrucción humana WEB-03 autoriza búsqueda por form explícito y siete campos en el alta Web.
Se aplica esa especificación Web actual; UX canónica Mobile conserva sus flujos existentes.
No hay una regla financiera nueva ni una decisión técnica/UX pendiente.

## Implementación

`/products` y `/products/new` sustituyen sus placeholders. Detalle/edit/archive permanecen WEB-04.
TanStack InfiniteQuery usa generation/Business/Inventory/search y pageParams opacos; búsqueda solo
al submit/Enter, cambio de filtro retira páginas previas, Cargar más conserva orden y deduplica IDs.
Loading, vacío, error/retry y offline son explícitos. Lista compacta desktop/cards narrow mantiene
nombre/variante/stock negativo/precio/barcode/Stock bajo y links al detalle placeholder.

Barcode usa input text y Enter contra by-barcode, con trim exterior y ceros/contenido interior intactos.
Missing404 es normal, con alta mediante navigation state; ningún barcode en URL de navegación o storage.
Sin cámara, permisos ni catálogo externo. Requests GET usan el URL query real autorizado por API.

Alta: name obligatorio, variant/barcode trim→null, precio requerido >=0, mínimo nullable/entero seguro,
stock inicial entero seguro >=0; costo requerido >=0 con stock positivo, conocido0 permitido,
stock0 normaliza costo a null. Money.fromDecimal mantiene hasta seis decimales y encodeMoney transporta
entero escalado. Display dos decimales usa división/redondeo exactos Domain sin modificar el DTO.
Labels, field errors/focus, aria-describedby/live regions, HTML forms y controles>=44px.

Una intención genera UUIDv7 distintos de operación/Product/Movement (Movement solo con stock positivo),
un timestamp occurredAt/createdAt, versiones importadas de contracts, dependsOn[] y preconditions{}.
CSRF compartido con WEB-02 vive solo durante la request. POST key=operationId, JSON exacto;
success200 valida CreateProductResult, invalida solo listas propias y refetch activo, luego feedback y
navegación. No inserción optimista ni invalidación global/ficticia de Home.

## Incertidumbre y aislamiento

Single-flight, form bloqueado mientras envío/check/unknown. Network/timeout/500/503 o éxito malformed
conservan intención y payload exclusivamente en memoria. Reintentar mantiene todos los IDs/body/key;
Comprobar estado consulta receipt. Un fallo al renovar CSRF antes de un retry conserva la incertidumbre
del envío original. Respuestas definitivas retiran pending y muestran mensajes públicos seguros.
401 delega invalidación WEB-02;403 de acceso retira comercio/cache;429 conserva Retry-After numérico.

Único storage nuevo: `sessionStorage['stockapp.pending-product']`, allowlist exacta
`{operationId,inventoryId,commandKind:'PRODUCT_CREATE'}`. Se escribe inmediatamente antes del POST,
después de validación y CSRF. Sin nombres/barcode/importes/stock/costo/email/tokens/CSRF/payload.
No localStorage, persistencia Query, ledger browser ni outbox. Storage inválido se descarta;
si no se puede escribir el descriptor, no se envía el comando ni hay fallback con datos comerciales.

Hydration inicial espera auth/Me/Inventory propios antes de consultar receipt y bloquea un nuevo submit.
ACCEPTED valida operation/Inventory, limpia/invalida/refresca y anuncia registro anterior; terminales
limpian con feedback seguro;404 mantiene incertidumbre y requiere descartar/reconstruir conscientemente.
No se inventa nueva operación al montar, consultar o descartar. Logout, cambio de identidad conocida o
sesión inválida limpian descriptor/memoria/cache y descartan respuestas tardías. Inventory distinto en
hydration limpia sin consultar la operación ajena. Payload anterior nunca se consulta como User B.

## Dependencias y browser contracts

Solo Web añade `@stock-app/domain workspace:*` y `uuid14.0.1` exacto ya resuelto en el lockfile.
Ningún paquete nuevo transitivo ni dependencia de tests. node:test/tsx/ReactDOM/fake fetch/Query real.
Compiler build-only existente añade ProductPage/ProductRead/CreateProductCommand/CreateProductResult/
OperationReceipt desde schemas canónicos. Validators ESM estáticos y tipos predicado, sin casts del cliente.
El subpath aditivo `@stock-app/contracts/transport` expone el módulo existente para importar constantes/
codecs sin inicializar Ajv del index server; no cambia schema, protocol, OpenAPI ni codec.
Tests VM prohíben generación dinámica y Vite comprueba que Product bundle usa Domain puro y excluye
Ajv/compiler/API/Mobile/Application/infraestructura nativa/DB. QA-03 conserva E2E browser físico.

## Validación y entrega

Frozen install PASS. Web lint/typecheck/test128/build PASS en el check final; focused Web128 PASS.
OpenAPI check PASS; pnpm check1605 PASS: Domain428/Application432/Mobile551/Contracts38/API28/Web128,
0fail/0skip/0cancelled. Ambos builds PASS; build:api separado PASS. test:db completo1004 PASS,
0fail/0skip/0cancelled, sin connection timeout: API-01..10/Auth/Ownership/Security/Products/read models/
backup/deletion y13 compiled HTTP incluidos. db:generate sin schema/migration drift; auth:generate
sin diff y auth:check PASS. Diff completo revisado y git diff --check PASS. PostgreSQL QA queda
detenido después de verificar cero bases disposable y cero clientes residuales; datos QA preservados.
Total único2609 tests (Web128 ya incluido en check1605). CI/GitGuardian/PR/merge se verifican contra el
head final, sin inferir outcomes remotos de gates locales. BLOCKERS: NONE.

Vite avisa del tamaño del chunk principal712.41kB (147.05kB gzip); build PASS sin relajar límites ni
cambiar configuración. QA-03 conserva browser E2E físico; no se certifica aquí hardware USB/Bluetooth,
hosting ni producción. La recuperación accepted anterior conserva su aviso y permite abrir un
formulario nuevo, sin rebote automático a la lista. Retry-After también se muestra en receipt429
conservando pending; controles de red se deshabilitan offline.

## Archivos cambiados

30 archivos, solo scope Web/compiler/docs/lockfile:

- Web runtime: package.json; src/api/csrf.ts y ownership.ts; src/app/app.tsx y router.tsx;
  src/auth/session.ts; src/main.tsx; src/styles/base.css; src/routes/products.tsx;
  src/products/client.ts, context.tsx, controller.ts, input.ts, pending.ts, queries.ts.
- Web tests: app.test.tsx, browser-contract.test.ts, product-fixtures.ts, product-input.test.ts,
  products.test.tsx.
- Contracts linkage/compiler: packages/contracts/package.json y src/browser-error-cli.ts.
- Lockfile: pnpm-lock.yaml, dos entradas directas Web existentes en la resolución global.
- Docs: WEB-03.md, BACKLOG.md, CURRENT_STATE.md, WEB_UX.md, TESTING.md, CI_CD.md, DOMAIN_REUSE.md.

## AUTO-FIX

CAUSE: tests WEB-02 seguían esperando placeholders de list/new.
SOURCE OF TRUTH: rutas reales autorizadas WEB-03; detalle/edit continúan placeholders.
FILES: apps/web/test/app.test.tsx.
PRODUCTION BEHAVIOR CHANGED: NO por el ajuste de tests; conserva cobertura de precedencia/guards.

CAUSE: fixtures de controller dependían de navigator.onLine inexistente en Node; barreras de POST
usaban un número supuesto de microtasks en lugar del comienzo real de fetch.
SOURCE OF TRUTH: harness Node y callback fetch real después de CSRF.
FILES: apps/web/test/product-fixtures.ts, products.test.tsx.
PRODUCTION BEHAVIOR CHANGED: NO; online se inyecta en tests y se utilizan promises/barriers, sin sleeps.

CAUSE: necesidad browser de constantes/codecs sin activar compiler del index contracts y validators nuevos.
SOURCE OF TRUTH: transport y schemas existentes, compiler autorizado WEB-03.
FILES: packages/contracts/package.json, src/browser-error-cli.ts.
PRODUCTION BEHAVIOR CHANGED: NO en API/contracts; linkage aditivo y generación browser.

Lockfile deriva únicamente dos entradas Web autorizadas; formatting limitado a archivos tocados.
Domain/Application/Mobile/API runtime/DB/migrations/auth/CI no cambian. STOP después de entrega;
sin WEB-04/Sync/MIG/DevOps/deploy.
