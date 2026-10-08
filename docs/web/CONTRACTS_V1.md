# Contratos StockApp V1 — CLOUD-06

WEB-01 consume ApiError/type shared con compiler privado standalone en build: schema y HTTP V1 intactos; browser sin Ajv compiler ni unsafe-eval. [Detalle](WEB-01.md).

API-10 marca requestAccountDeletion implemented,25 operaciones: body{} estricto, header UUIDv7 y202 AccountDeletionResult intactos; sessionsRevoked true solo tras acceptance commit. Sin status endpoint, commandKind deletion ni receipt financiero, sin bump de versiones. Retry con cookie revocada401; reautenticación oficial permite replay202 mientras exista User. [Detalle](API-10.md).

API-08 registra ocho GET de lectura reales; disponibilidad actual22 implemented.
SaleDetailItem es schema/type de lectura dedicado: campos financieros de SaleItem más
productName/productVariant nullable y requeridos. Solo SaleDetail.items lo referencia.
Metadata Product actual scoped, incluido archived; relación no resoluble null. SaleItem,
RegisterSaleResult.items, ChangeSet/Sync y protocolVersion/domainVersion1 intactos.
VOIDED eligibility false/null sin enum nuevo. [Detalle](API-08.md).

API-07 conecta PurchaseParams UUID genéricos a registro/RouteContract.params y OpenAPI, y marca VoidPurchase implemented. Command/result compartidos intactos; nuevas Operation/REVERSAL UUIDv7, referencias legacyv4 permitidas. [Evidencia](API-07.md).

API-04 marca registerPurchase implemented y añade InventoryParams reutilizado, sin cambiar schemas/envelope V1. En POST purchases directo solo expectedStateRevision literal string; `{operationId}` se rechaza400/sin receipt antes del executor. Resolución de dependencia sigue SYNC-02; el contrato global conserva ambos modos. [Detalle](API-04.md).

API-03 marca implemented solo registerSale (POST sales200), con InventoryParams existente explícito; Diez rutas runtime. Payload/expectedCosts/Money/UUID/error catalog intactos; OpenAPI regenerado. Sale tiene min1 línea y límite global1MiB, sin máximo comercial nuevo. [Evidencia](API-03.md).

API-02 añade ProductParams (inventoryId/productId UUID genéricos, incluido legacyv4) y marca implementadas solo createProduct/updateProduct/archiveProduct. Status200, bodies y UUID policy permanecen congelados. OpenAPI generado y guard del registry ahora permiten command implemented con body/cloud-inventory. [Evidencia](API-02.md).

Adición compatible API-01: OperationParams requiere inventoryId UUID genérico y operationId UUIDv7;
GET operation pasa implemented y mantiene OperationReceipt/ApiError congelados. Seis rutas actuales.
Motor transaccional y schemas internos de receipt permanecen server-only. [API-01](API-01.md).

Fuente ejecutable: `packages/contracts/src`. JSON Schema determina las formas; `json-schema-to-ts`
deriva los tipos y Ajv 8.20.0 valida los límites. No importa Fastify, React, Expo, Drizzle,
Better Auth ni Domain. No contiene cálculos de costo, ganancia, margen o redondeo.
La API conserva las reglas de [API](API.md), [DATA_MODEL](DATA_MODEL.md) y [SYNC](SYNC.md).

## Primitivas y versiones

| Dato | Transporte V1 |
| --- | --- |
| Money | String canónico de entero escalado por 10^6, rango ±9007199254740991 |
| Percentage | La misma representación, seis decimales en puntos porcentuales; admite negativos |
| Revision | String decimal canónico no negativo, sin conversión a Number ni límite JS-safe |
| Timestamp | Número entero seguro no negativo, epoch milliseconds |
| Quantity | Número entero seguro mayor que cero |
| Stock / actualStock | Stock seguro con negativos permitidos; conteo físico no negativo |
| UUID / UUIDv7 | Schemas separados; las identidades nuevas de comandos son UUIDv7 |
| Cursor | String opaco; no se decodifica en contracts |

`"0"` es costo conocido cero; `null` significa desconocido, y no equivale a ausencia.
Se rechazan decimales, exponentes, leading plus, ceros iniciales, `-0`, whitespace y overflow.
Los campos de precio/costo no negativos usan schemas específicos; la ganancia puede ser negativa.

`PROTOCOL_VERSION=1` es la versión de entrega. No se encontró una constante canónica anterior para
la semántica de comandos: CLOUD-06 establece `DOMAIN_VERSION=1`. No equivale a la versión de app,
package, migración SQL ni `/v1`; un cambio financiero incompatible requerirá otra domainVersion.
Auth conserva IDs opacos de Better Auth; `Inventory.generation` usa UUID técnico, sin exigir v7.

## Compatibilidad de UUID — CLOUD-06-FIX

Decisión humana aprobada: los IDs históricos/importados UUID válidos representables en PostgreSQL
se preservan exactamente, incluido UUIDv4. No se regeneran ni remapean. UUID genérico valida forma,
versión/variante admitida (versiones 1–8, NIL/MAX); no acepta strings arbitrarios. UUIDv7 valida
además versión 7. Esta distinción se aplica por responsabilidad del campo, no por nombre repetido.

| Campo / responsabilidad auditada | Schema V1 |
| --- | --- |
| Inventory.id en metadata, Me y BootstrapResponse; InventoryParams.inventoryId y paths inventoryId | UUID genérico almacenado; bootstrap sigue generando v7 server-owned |
| Product/Sale/SaleItem/Purchase/StockAdjustment/InventoryMovement.id en DTOs/resultados | UUID genérico |
| inventoryId/productId/saleId en DTOs y InventoryState, lastMovementId, sourceId, reversalOfMovementId | UUID genérico, nullable según modelo |
| ProductRead, detalles, price analysis, páginas, HistoryEntry.id/productId, Dashboard.topSelling.productId | UUID genérico mediante DTOs compartidos o referencia explícita |
| PRODUCT_UPDATE/PRODUCT_ARCHIVE.productId | UUID genérico de entidad existente |
| SALE_REGISTER.items.productId; PURCHASE_REGISTER/STOCK_ADJUST.productId | UUID genérico de entidad existente |
| SALE_VOID.saleId/reversalMovements.productId; PURCHASE_VOID.purchaseId | UUID genérico de entidad existente |
| expectedCosts.productId, states.productId, expectedState.lastMovementId | UUID genérico de evidencia existente |
| PRODUCT_CREATE.productId/initialMovementId; SALE_REGISTER.saleId/items.saleItemId/items.movementId | UUIDv7 nuevo; initialMovementId nullable según stock inicial |
| PURCHASE_REGISTER.purchaseId/movementId; STOCK_ADJUST.stockAdjustmentId/movementId | UUIDv7 nuevo |
| SALE_VOID.reversalMovements.movementId; PURCHASE_VOID.reversalMovementId | UUIDv7 nuevo, aunque la operación anulada sea legacy |
| Path productId/saleId/purchaseId | UUID genérico de entidad existente |
| ChangeSet/upserts, ChangesResponse, SnapshotDescriptor/Page, DeviceRegistrationResult.inventoryId | UUID genérico comercial; mismo schema DTO, sin transformar valores |
| ImportReservation/ImportCommitResult.inventoryId | UUID genérico histórico preservado |
| Business.id | UUIDv7; solo se crea en cloud, nunca se importa |
| operationId en envelope/result/receipt, dependsOn, supersedesOperationId, expectedStateRevision.operationId | UUIDv7 de protocolo, incluso al referenciar una operación existente |
| deviceId, snapshotId, importId en requests/responses/query/path y Idempotency-Key | UUIDv7 de protocolo |
| Inventory.generation | UUID técnico genérico; sin cambio |
| IDs de BackupV1 / Auth | Strings locales existentes / IDs opacos oficiales; sin forzar UUID |

Ejemplo verificable: Product.id `550e8400-e29b-41d4-a716-446655440000` es válido en lectura,
FK y evidencia. SALE_REGISTER conserva ese productId y exige saleId, saleItemId y movementId v7.
SALE_VOID/PURCHASE_VOID aceptan el ID v4 histórico y exigen nuevos IDs de reversión v7. Archive y
VOIDED se transportan como upserts, sin cambiar el ID ni introducir borrado financiero.

Backup formatVersion 1 conserva sus strings locales. El futuro import cloud rechaza IDs no UUID
con explicación, sin remapearlos y sin modificar Restore local. Esta tarea no implementa import ni
sync runtime. Las nueve pruebas de `uuid-compatibility.test.ts` cubren ambas fronteras y OpenAPI.

## Comandos

El envelope requiere `protocolVersion`, `domainVersion`, `commandKind`, `operationId`, `occurredAt`,
`dependsOn`, `payload`, `preconditions`. `deviceId` es opcional/nullable para Web y obligatorio,
coincidente con el batch, para sync. `supersedesOperationId` identifica una intención sustituida.
Todos los objetos tienen allowlists; no se aceptan owner, stock derivado ni propiedades arbitrarias.

| commandKind | Payload e identidades | Preconditions |
| --- | --- | --- |
| PRODUCT_CREATE | productId, initialMovementId nullable, createdAt, metadata, initialStock, initialUnitCost | Objeto vacío |
| PRODUCT_UPDATE | productId, name/variant/barcode/precio/minimumStock | expectedMetadataRevision |
| PRODUCT_ARCHIVE | productId | expectedMetadataRevision |
| SALE_REGISTER | saleId, createdAt, items con productId/saleItemId/movementId/quantity/unitSalePrice, notes | expectedCosts por producto |
| PURCHASE_REGISTER | purchaseId/movementId, productId, createdAt, quantity/unitCost/notes | expectedStateRevision + estado completo |
| STOCK_ADJUST | stockAdjustmentId/movementId, productId, createdAt, actualStock/reason/costMode/customUnitCost | expectedStateRevision + estado completo |
| SALE_VOID | saleId, createdAt, reversalMovements asociados por productId | states por producto, revisión y estado completo |
| PURCHASE_VOID | purchaseId, createdAt, reversalMovementId | expectedStateRevision + estado completo |

Una compra contiene un producto: no existe PurchaseItem. AdjustStock recibe conteo físico y costo
aceptado; Application/Domain deriva diferencia y movimiento. Las anulaciones conservan las reglas
de última operación inequívoca y estado exacto. `ALREADY_VOIDED` sin nuevos efectos permanece en
Domain/Application/local y en el shared result model. Cloud directo materializa éxito VOIDED;
misma operationId/hash →replay original, distinta stale→409 REVISION_CONFLICT, distinta vigente
contra operación ya VOIDED→422 VOID_NOT_ELIGIBLE. No se agrega un ACCEPTED Cloud no-op.
La decisión humana API-06 también rige API-07 futuro, sin implementarlo todavía.

`decodeCommandEnvelope` rechaza IDs nuevos duplicados (también cambios solo de mayúsculas),
productos repetidos, evidencia incompleta/ajena, referencia de receipt no declarada en dependsOn,
self-dependency y auto-supersession. No recomputa resultados financieros. Una revisión puede ser
string o referencia `{operationId}` a un padre declarado. La venta compara costos esperados;
no impone stateRevision estricto que bloquee deltas con costo equivalente y stock negativo.

Los comandos HTTP futuros exigirán `Idempotency-Key == operationId` con igualdad UUID case-insensitive
y que IDs del path coincidan con payload. API-01 implementa el helper y motor fingerprint/receipt/lock/
revisiones, sin exponer commands comerciales todavía; CLOUD-06 congeló el contrato.
Los snapshots enviados nunca autorizan asignar costo, ganancia o stock directamente.

## Application y Mobile

CreateProduct/RegisterSale/RegisterPurchase/AdjustStock reciben IDs y tiempos explícitos, sin
dependencias de generadores ni clock. VoidSale/VoidPurchase reciben identidades de compensaciones
y tiempos explícitos; conservan clock para metadata autoritativa. UpdateProduct/ArchiveProduct
mantienen clock del ejecutor. Ningún input Application recibe operación de protocolo, headers,
session, cursor, receipt, tenant confiado por el cliente o precondiciones de transporte.

| Tiempo | Responsabilidad |
| --- | --- |
| occurredAt → effectiveAt | Momento comercial recibido del caller, preservado |
| createdAt | Evidencia original de creación offline, preservada |
| updatedAt en metadata/void | max(createdAt previo, updatedAt previo, reloj del ejecutor) |
| receivedAt / serverRecordedAt | Reloj servidor de aceptación; pertenece al futuro boundary API |

La guarda Domain de voidedAt anterior a updatedAt se conserva. CLOUD-06 no autoriza backdating UI,
replay financiero ni ordenar concurrencia por timestamp embebido en UUID.
`apps/mobile/src/composition/local-commands.ts` prepara UUIDv7 y tiempo antes del caso de uso.
VoidSale identifica cada compensación por producto, no por posición de array; Application revalida
elegibilidad y estado dentro de su transacción. Los formularios y el funcionamiento offline se conservan.

## Lecturas, errores y paginación

DTOs estrictos: Product/InventoryState/Sale/SaleItem/Purchase/StockAdjustment/InventoryMovement,
detalles de operación/eligibilidad, resultados de comando, price analysis, History y Dashboard.
Los importes cloud son strings, incluida la ganancia y Percentage; snapshots desconocidos son null.
Product mantiene metadataRevision; state mantiene stateRevision/lastMovementId.
Los movimientos conservan metadata textual nullable del modelo existente, sin objetos JSON abiertos.
Dashboard expresa el producto más vendido nullable, como el reader Application actual.

Páginas: `{items,nextCursor}`. Limit default 50, máximo general 100 y History 50. Cursor permanece
opaco/scoped/filtros; orden Products `createdAt DESC,id DESC`, History `effectiveAt DESC,createdAt DESC,id DESC`.
API-08 materializa estas consultas en PostgreSQL; el cursor interno no es contrato cliente.

El catálogo de error preserva todos los códigos CLOUD-01/04/05 y añade los códigos normativos de
API.md: UNSUPPORTED_PROTOCOL, REVISION_CONFLICT, COST_SNAPSHOT_CONFLICT, IDEMPOTENCY_KEY_REUSED,
IMPORT_NOT_EMPTY, SYNC_RESET_REQUIRED, SNAPSHOT_EXPIRED, DOMAIN_RULE, VOID_NOT_ELIGIBLE,
MONEY_OVERFLOW y TEMPORARILY_UNAVAILABLE. Envelope incluye code/message/requestId; fieldErrors
solo admite arrays de strings. `details.currentRevision` solo se permite con REVISION_CONFLICT;
no hay details arbitrario, SQL, stack, secrets ni identificadores de otro owner.

## Sync, import y lifecycle

Registro de instalación, push y resultados ACCEPTED/CONFLICT/REJECTED/DEPENDENCY_BLOCKED son contratos.
Push máximo 50 comandos / 1 MiB; respuesta individual por command. DEPENDENCY_BLOCKED es retryable,
sin receipt terminal inventado. ChangeSet completo contiene inventoryId/revision/serverRecordedAt,
upserts de las siete entidades comerciales y tombstones. V1 exige tombstones vacío: Product archivado
y Sale/Purchase VOIDED son upserts. La baseline no define un tipo concreto de borrado técnico;
API-10 deberá concretarlo antes de introducirlo, sin inventar eliminación financiera.

Pull máximo 50 ChangeSets completos, highWaterMark string estable y nextCursor opaco; retención 90 días,
snapshot coherente con TTL 24 horas. No se ejecutan ChangeSets, outbox ni proyecciones locales.

Import congela reserva (inventoryId, formato/version, hash, bytes/chunks, consentimiento), fragmento
UTF-8 JSON con hash/byteLength, progreso, commit/cancel. Conserva límites MIGRATION: 50 MiB de archivo
y fragmentos de hasta 1 MiB; MIG-01 validará bytes reales y tamaño HTTP incluyendo el wrapper JSON.
Commit retorna inventoryId, UUID técnico generation y cursor baseline. No implementa staging,
integridad, activación ni storage. BackupV1 referencia exactamente las ocho colecciones del formato
local existente: números seguros escalados y IDs locales string; su validator Application sigue siendo
la autoridad de integridad. No se transforma un fragmento en un objeto staging abierto.

GET me/export es implemented por API-09, con recencia inclusiva/session.createdAt y SESSION_NOT_FRESH403.
POST me/deletion conserva forma mínima/recent authentication <=5min y sigue planned;
Better Auth delete-user permanece deshabilitado. No se crean workers ni procesos de borrado.

## OpenAPI y disponibilidad

[stockapp-v1.json](openapi/stockapp-v1.json) es OpenAPI 3.1.1 generado de schemas y `routeContracts`.
Schemas conocidos se reutilizan mediante `$ref`. No lleva timestamps, servidores desplegados,
Swagger UI ni cliente generado. Usa JSON Schema 2020-12 y no necesita un validator externo de red.

Veinticuatro operaciones son implemented: las seis de foundation/ownership/receipt,
los ocho comandos Product/Sale/Purchase/Adjustment/void, los ocho GET de API-08 y dos export GET de API-09.
routeContracts/OpenAPI son la lista ejecutable. Sync/import/deletion y /health
siguen planned.
/health y los futuros endpoints continúan respondiendo 404. Auth `/api/auth/*` queda explícitamente
fuera del contrato de negocio, bajo Better Auth 1.7.7; no se copian sus DTOs ni password handling.
/v1 usa cookie oficial de sesión y X-CSRF-Token para mutaciones; no se anuncia JWT bearer.
/v1/me añade capabilities `{protocolVersions:[1],domainVersions:[1]}` sin alterar ownership.

```sh
pnpm contracts:openapi
pnpm contracts:openapi:check
pnpm check
```

Check compara generación in-memory con el artefacto versionado y falla si está stale. Forma parte
del required Quality checks existente, sin workflow opcional ni deployment. Tests verifican schemas,
refs, IDs únicos de rutas/operaciones, request/response, seis rutas runtime, JSON reproducible y stale.
Referencias de formato: [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html) y
[JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-core).
