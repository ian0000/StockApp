# API-02 — Product Commands

Base main `6b1fee73f9b4d943b6f384c0dcfe8ba98c9a096c` (API-01, PR #82).
Rama `feat/api-02-products`. API local/CI, PostgreSQL18.6 real y SMTP local con datos ficticios.
PR/head/checks/merge se registran en la entrega después de verificarlos.

## Rutas y contratos

| Método | Ruta | Resultado ACCEPTED |
| --- | --- | --- |
| POST | /v1/inventories/:inventoryId/products | 200 CreateProductResult |
| PATCH | /v1/inventories/:inventoryId/products/:productId | 200 ProductMutationResult |
| POST | /v1/inventories/:inventoryId/products/:productId/archive | 200 ProductMutationResult |

Bodies estrictos CreateProductCommand/UpdateProductCommand/ArchiveProductCommand, respectivamente;
kind equivocado400. ProductParams añade inventoryId/productId UUID genéricos, legacyv4 incluido.
Path/payload productId iguales case-insensitive; mismatch400 antes de executor. Nueva identidad
Product/Movement/operation UUIDv7; IDs recibidos preservados, canonical casing DB sin remapeo.
No UUID policy/status/body changes. OpenAPI generado, nueve rutas implemented; GET products,
by-barcode/detail/stock-low/history/dashboard siguen API-08, /health404. Otros comandos planned.

## Seguridad y envelope

Composición en server registra las rutas después de auth/security existentes. Sesión oficial
verified, Business ACTIVE/cloud flag, Inventory propio; contexto server-derived. Revalidación bajo
lock API-01. Sin owner/business/inventory tomado del body. Query Product siempre Inventory + ID.
Producto foreign/missing404 genérico; no name/barcode/revisión/archived state ajeno en errores.

CORS/Origin exactos de CLOUD-05, CSRF ligado a sesión, JSON-only, límite Product32KiB/global1MiB,
bucket durable60 commands/min/user, requestId servidor/no-store/redacción. Sin bypass nativo.
Idempotency-Key UUIDv7 requerido e igual a operationId case-insensitive; helper/fingerprint API-01
intactos. Hash usa envelope completo validado + Inventory autorizado, sin normalizar sus valores.
deviceId nullable Web; si existe exige registro previo, no device registration.

## Application/Domain y transacción

CreateProductUseCase, UpdateProductUseCase y ArchiveProductUseCase existentes, sin modificar sus
inputs, reglas ni implementación. Domain inmutable/puro, Money escalado10^6, no cálculos alternos.
Adaptadores ProductRepository/InventoryStateRepository/InventoryMovementRepository y
ProductManagementRepository mínimos, ligados al mismo CommandTransaction API-01.

boundProductTransaction.runInTransaction invoca directamente el callback con repositorios del tx
recibido. Product se escribe primero; State.save difiere solo su escritura; Movement se guarda
antes de insertar State al finalizar callback. Orden SQL Product → Movement → State respeta FK
inmediata lastMovementId, sin BEGIN/transacción anidada, segunda conexión, constraints deshabilitados,
deferred global, schema/migration ni cambio de orden Application Mobile.

Ports financieros no utilizados fallan explícitamente; no implementan Sale/Purchase/Adjustment/void.
API-01 retiene lock Inventory y SAVEPOINT, persiste revision/ChangeSet/receipt en el mismo commit.
Excepción inesperada revierte todo. Errores semánticos esperables producen receipt terminal y el
savepoint elimina cualquier write; no consumen Inventory revision ni ChangeSet.

Los dos workspace links Application/Domain permiten importarlos explícitamente. Una dependencia
dev necesaria: esbuild0.28.2, versión ya transitiva en lockfile. Los paquetes actuales exportan
TypeScript con imports relativos para Mobile; build API typecheck + esbuild empaqueta esos módulos
puros en JS Node22, sin modificar paquetes/semántica compartida. Módulos API/entry points permanecen
en sus rutas, incluyendo migraciones y CLI; dependencias de servicio quedan externas. Shared chunks
conservan identidad Money/Error. No ORM/validator/mutex/repository framework/cache/queue nuevos.

## Creación

| Entrada | Product/State/Movement |
| --- | --- |
| Stock0/costo null | Product metadataRevision0; State stock0/costo null/stateRevision0/lastMovementId null; sin Movement |
| Stock positivo/costo conocido | Product metadataRevision0; State stock recibido/costo exacto/stateRevision0/lastMovementId inicial; un INITIAL_STOCK |
| Stock positivo/costo "0" | Costo cero conocido preservado, no se transforma en null |
| Stock positivo/costo null | Envelope inválido400, sin receipt |
| Stock0/costo conocido | Domain rechaza422 DOMAIN_RULE, receipt terminal sin datos comerciales |
| Stock negativo/fraccionario o ID nuevo v4 | Transporte400, sin receipt |

Domain/Application generan INITIAL_STOCK con sourceType/sourceId/metadata null, sin Purchase ni
Adjustment ficticios. occurredAt → effectiveAt; payload.createdAt preserva createdAt/updatedAt;
serverRecordedAt es reloj servidor. No regeneración de IDs ni redondeo financiero.
Duplicate Product ID/op diferente → REJECTED DOMAIN_RULE, no overwrite; constraint PK como defensa.

## Edición, archivo y barcode

expectedMetadataRevision string → bigint exacto comparado bajo Inventory lock. Stale → CONFLICT
REVISION_CONFLICT/details.currentRevision (metadata), receipt durable, sin Application/write/ChangeSet.
Retry mismo hash conserva conflicto original aunque Product cambie después.

Update/Archive ACCEPTED incrementan metadataRevision exactamente1; Inventory revision avanza1 vía
API-01. Contadores independientes; >JS-safe se conserva exactamente. Application usa
max(createdAt, updatedAt previo, reloj servidor), nunca occurredAt para metadata.
PATCH cambia solo campos definidos; InventoryState/stock/costo/stateRevision/lastMovement/history intactos.
Product archived no editable → NOT_FOUND. Archive isArchived=true conserva Product/State/movimientos
e historia; solo Product upsert, sin DELETE ni tombstone. Mismo operation/hash replay sin incremento.
Nueva operación sobre archived → REJECTED DOMAIN_RULE, sin segundo ChangeSet/revisión. Wrapper API
aplica esta semántica solicitada; comportamiento ArchiveProductUseCase Mobile permanece idéntico.

Barcode se normaliza mediante Domain y conserva ceros iniciales. Validación scoped dentro del lock,
unique parcial DB como defensa: active collision mismo Inventory → DOMAIN_RULE; propio barcode
permitido; otros Inventories independientes; archived barcode reusable. No lectura global de Product
para edición/archivo. Unique violations conocidas se sanitizan; otras fallas DB propagan rollback500.

## ChangeSets y respuesta durable

| Comando | Upserts | Tombstones |
| --- | --- | --- |
| Create | Product1 + State1 + Movement1 o0 | [] |
| Update | Product1 | [] |
| Archive | Product1 | [] |

Arrays restantes vacíos. Un mapper Product explícito compartido por las tres rutas; State/Movement
usan resultados Domain, Money↔BIGINT exacto y transporte string, revisiones bigint↔string.
resultReferences solo productId validado por API-01; no campos comerciales arbitrarios.

Toda respuesta ACCEPTED, incluida la primera, se reconstruye desde OperationReceipt + ChangeSet,
revision/serverRecordedAt durables. No depende del resultado Application original en memoria ni lee
el Product actual para reconstruir historia. Valida cardinalidad, identidad, relaciones, costo/stock,
movimiento inicial, metadata revisions y shapes compartidos; corrupción/incompleto →500 sanitizado.
Same key/hash → respuesta comercial equivalente, callback no ejecutado; different hash409
IDEMPOTENCY_KEY_REUSED. ACK perdido/reinicio no duplican entidad/movimiento/receipt/revisión.
GET operation existente devuelve los receipts Product con ChangeSet correspondiente.

## Errores

| Caso | HTTP / persistencia |
| --- | --- |
| Shape/UUID/kind/header/path mismatch/JSON | 400 VALIDATION_ERROR antes del executor; sin receipt |
| Origin/CSRF/access/auth/rate/body/media | Gates CLOUD-05, sin receipt de comando |
| Missing/foreign/archived edit | 404 REJECTED NOT_FOUND durable propio; no mutación comercial ajena |
| Metadata stale | 409 CONFLICT REVISION_CONFLICT + currentRevision allowlisted |
| Domain stock/costo/nombre, duplicate ID/barcode, nuevo archive archived | 422 REJECTED DOMAIN_RULE |
| Key reutilizada con otro hash | 409 IDEMPOTENCY_KEY_REUSED; original intacto |
| DB/runtime/clock inválido/overflow contador/corrupción | 500 INTERNAL_ERROR; sin nuevo receipt terminal |

Money overflow comercial no se calcula en estos comandos: codecs validan rango safe de unidades,
initial stock no multiplica dinero y no hay fórmula financiera nueva. MONEY_OVERFLOW sigue catálogo
existente para operaciones que lo produzcan; no se inventa un overflow ni error code nuevo aquí.
Copy estable y requestId actual para terminales, nunca Error.message Domain/SQL/stack público.

## Validación y CI

PostgreSQL18.6 real, bases disposable y SMTP local. API-02: 78 pruebas DB/HTTP, incluye stock0/positivo/
costo0, precisión máxima, null/invalid, orden FK, rollback en Movement/State/ChangeSet/Receipt,
identidades duplicadas y barcode, edición/archive/legacy/BIGINT y reconstrucción corrupta.
Dos pools y Promise barriers + Lock observado PostgreSQL prueban same-op callback1, concurrent
metadata expected5 → accepted6/conflict6, barcode claim y duplicate identity únicos; Inventory A/B
independientes. Smoke compilado auth/SMTP local, bootstrap/piloto, comandos, GET receipt, aislamiento,
reinicio y replay CreateResult/MutationResult; import adicional con Node puro/default exports.

test/products participa en test:db y required Quality checks; focused test:products usa build previo
y TEST_DATABASE_URL. Sin skip/optional/continue-on-error ni endpoint debug. ProductParams y nueve
implemented routes se comprueban en Contracts y manifest/runtime; OpenAPI se genera, no edición manual.
Validación local final: todos PASS, 0 fallos y 0 skipped.

| Suite / gate | Resultado |
| --- | --- |
| Domain / Application / Mobile | 428 / 432 / 551 |
| Contracts / API | 35 / 24 |
| PostgreSQL / Auth / Ownership / Security | 55 / 35 / 21 / 37 |
| API-01 / API-02 DB y HTTP | 47 / 78 |
| Total | 1743; pnpm check1470 + test:db273, sin contar focused nuevamente |
| Frozen install / OpenAPI generation/check | PASS |
| pnpm check / build:api | PASS: format/lint/types/tests/build |
| test:db / API-01 regression / focused test:products | PASS: 273 / 47 incluidos / 78 |
| Compiled HTTP / Node production exports / restart replay | PASS |
| db:generate / auth:generate / auth:check | PASS, ninguna migration/drift |
| git diff --check | PASS |

Los cinco unit API-01 están ya incluidos en API24; ProductParams está incluido en Contracts35.
Los focused78 y los 47 API-01 están incluidos en test:db273, no se suman nuevamente.
PostgreSQL local18.6 y SMTP efímero no acreditan provider/producción ni QA Web/browser físico.

## Diferido

Decisión humana: completar API F1 API-02..10, después Web F3 WEB-01..10 y DevOps/API+Web/QA donde
corresponda; SYNC/Mobile/MIG móvil al final de API + Web. BACKLOG conserva dependencias, Sync no se
cancela. Este ticket termina tras PR/checks/merge/main sync: sin API-03/SYNC-01/WEB-01 automático.
Domain/Application/Mobile/schema/migrations sin cambios; Free offline permanece operativo.
No apps/web, lecturas Product públicas, Sale/Purchase/Adjustment/void/sync/import/lifecycle nuevos.
Railway, Cloudflare, DNS, production DB, SMTP externo y secrets producción NOT TOUCHED.
