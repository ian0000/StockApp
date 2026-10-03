# Modelo cloud conceptual

Schema de aplicación IMPLEMENTADO por CLOUD-02; SQL/migrations versionados en apps/api/drizzle.
Auth materializado por CLOUD-03; comandos comerciales/sync todavía no ejecutables. Drizzle PostgreSQL + driver pg;
SQLite conserva su schema y migraciones propias. Server schema en `apps/api` será autoridad
para cloud; Domain/contratos son autoridad para semántica/representación común.

## Propiedad

User/Identity tiene ID opaco de Better Auth, email normalizado, verified, estado y timestamps.
No forzar UUIDv7 a IDs internos generados por la librería auth. Session/Account/Verification
siguen schema y migraciones del adapter Better Auth revisados dentro de API.

Business tiene UUIDv7, ownerUserId UNIQUE NOT NULL FK User, estado ACTIVE/DELETING,
cloudAccessEnabled boolean administrado fuera del cliente. V1 un negocio por User y un
propietario por Business. Membership se representa mediante ownerUserId; no tabla de roles,
invitaciones o memberships N:M anticipada. Inventory tiene businessId UNIQUE FK Business,
nombre, moneda ISO alpha-3 e IANA reportingTimeZone elegida al conectar; un inventario por negocio.
Nombre/moneda se toman del onboarding/import; no endpoint V1 para cambiar moneda con historia.
Durante onboarding Business puede no tener Inventory o tenerlo reservado; una vez operativo
debe tener exactamente uno. Import reserva el ID local para no generar un Inventory competidor.

API resuelve Business a partir de sesión; verifica pertenencia al Inventory en cada petición.
IDs proporcionados nunca se convierten automáticamente en tenant autorizado.

## Entidades y columnas principales

Conservar los campos/snapshots del modelo local auditado; columna técnica adicional es explícita.

| Entidad | Identidad/relaciones | Datos y estado |
| --- | --- | --- |
| Product | UUIDv7, inventoryId | name, variant?, barcode?, regularSalePriceUnits, minimumStock?, isArchived, createdAt, updatedAt; metadataRevision |
| InventoryState | PK inventoryId/productId, FK compuesta Product | stock, unitCostUnits nullable; stateRevision, lastMovementId |
| Sale | UUIDv7, inventoryId | status CONFIRMED/VOIDED, total/cost?/profit?, notes?, effectiveAt, createdAt, updatedAt |
| SaleItem | UUIDv7, inventoryId, saleId/productId | quantity, unitSalePriceUnits, subtotal, unitCostSnapshot?, estimatedCost?/Profit?, costStatus KNOWN/UNKNOWN |
| Purchase | UUIDv7, inventoryId/productId | quantity, unitCost, total, stockBefore/After, averageCostBefore?/After, status, notes?, timestamps |
| StockAdjustment | UUIDv7, inventoryId/productId | stockBefore, actualStock, difference, reason, costMode?, unitCost, timestamps; inmutable |
| InventoryMovement | UUIDv7, inventoryId/productId | type/delta, stockBefore/After, costSnapshot?, sourceType/Id, metadata?, timestamps; reversalOfMovementId? FK |
| SyncDevice | UUIDv7, businessId | registration, protocol/domain version, lastSeen; no hardware fingerprint |
| OperationReceipt | PK businessId/operationId | payloadHash, kind, entity IDs, resultCode, result references, committedRevision, deviceId?, receivedAt |
| InventoryChangeSet | PK inventoryId/revision | commit completo: upserts o tombstones de entidades, serverRecordedAt |
| ImportSession | UUIDv7, businessId | hash, inventoryId, expectedEmptyGeneration, bytes/chunks, status, expiresAt, consentRecordedAt |
| DeletionRequest | UUIDv7, userId temporal | estado/progreso; después solo identificador mínimo de supresión sin dataset |

Business/User ownership no se replica en domain como regla financiera. SyncDevice no autoriza
por sí solo y se verifica contra Business en cada push. OperationReceipt se conserva durante
vida del dataset para no duplicar operaciones tras un móvil meses offline. Sin token/payload
comercial completo en logs. ChangeSet no es historial contable reejecutable: ledger son operaciones
y movimientos; delta sirve para transportar actualizaciones confirmadas.

## Tipos exactos

Dinero/costo: `BIGINT` de unidades escaladas 10^6, CHECK rango [-9007199254740991,
9007199254740991], con restricciones de signo según campo. Drizzle/pg lee bigint como texto/bigint;
validar rango antes de convertir a number/Money. No REAL/float, casts arbitrarios ni decimal distinto
que cambie rounding del dominio. Percentage usa igual escala de seis decimales en puntos porcentuales.
API manda Money/Percentage como string de entero canónico (ej. `"10666667"`), null para desconocido.
Backup local formatVersion 1 continúa usando números seguros; codec import/export traduce sin pérdida.

Stock/cantidad: BIGINT con rango JS safe integer; quantity >0 y conteo físico >=0.
API números enteros seguros; validación antes de arithmetic. DB no limita stock >=0.
UUIDv7 comercial en tipo PostgreSQL `uuid`, sin confiar en orden/timestamp embebido para concurrencia;
V1 auditada genera UUIDv7; import cloud exige identificadores UUID representables y los preserva.
El validator local acepta strings más generales: un backup local con IDs no representables en uuid
cloud se rechaza con explicación, sin regeneración/mapeo silencioso ni impedir Restore local.
Soportar import de otros esquemas de IDs sería un ticket formal posterior.

Timestamps del dominio (`effectiveAt/createdAt/updatedAt`) siguen epoch ms BIGINT seguros y no negativos,
preservados al importar. Transporte llama `occurredAt` al tiempo comercial del comando y lo mapea a
effectiveAt. Metadatos server receivedAt/serverRecordedAt usan `timestamptz` UTC, DTO epoch ms.
Revisiones BIGINT se transportan como strings; server, no Date.now del cliente, decide secuencia.
En push preservar effectiveAt/createdAt originales del comando local; Web usa Clock server.
En actualizaciones updatedAt = max(createdAt, updatedAt previo, Clock server actual) para respetar
invariante legacy incluso con clock skew; esto no da autoridad al reloj cliente para concurrencia.
serverRecordedAt siempre refleja recepción/commit real, aunque un campo histórico esté en futuro.
Histórico no se reordena por hora de upload. Reporting usa timezone Inventory compartida;
Mobile local-only usa timezone del dispositivo como hoy. Cambiar timezone no recalcula costos.

## Integridad y consultas

UNIQUE ownerUserId, inventory businessId; UNIQUE inventoryId/id para FK compuestas de hijos,
incluido SaleItem → Sale/Product del mismo inventario. Todos los queries usan inventory autorizado.
Unique parcial barcode no-null activo; índices inventoryId/effectiveAt/id para history y operaciones,
inventoryId/productId para estados/movimientos y sourceType/sourceId. Metadata revision separada
de state revision evita que cambiar nombre vuelva conflictivas ventas sin cambiar costo/stock.

CHECK SaleItem costStatus/null consistency, subtotal quantity×price, Purchase stock transition/total,
InventoryState costo requerido con stock positivo, Adjustment diferencia/motivo/costo, movimientos
delta/transición, status y timestamps. Sumas de líneas y cobertura de movimientos se validan en
transacción Application; un CHECK aislado no alcanza para invariantes entre filas.
Reversal tiene FK explícita y unique parcial `(inventoryId,reversalOfMovementId)` cuando no-null;
sourceType/sourceId conserva compatibilidad del modelo. Un movimiento original no se compensa dos veces.

Archivar Product es actualización isArchived, no DELETE ni tombstone. Sales/Purchases conservan
historia VOIDED. Hard delete de entidad financiera no tiene ruta. Tombstone tipado transporta borrado
técnico/lifecycle cuando aplique; eliminar cuenta revoca acceso, purga dataset y obliga a desvincular
la réplica: no enviar datos de un Business eliminado a otra cuenta.

## Evolución

Migraciones SQL revisadas/versionadas en apps/api; auth y dominio dentro del mismo flujo de migración,
sin auto-push de schema en producción. Expand/contract y clientes `/v1` compatibles. Migraciones SQLite
de metadata futuras son propiedad de apps/mobile y se prueban sobre base con datos actuales.
No compartir `sqliteTable`/`pgTable` ni ejecutar scripts destructivos de reset en usuarios existentes.
Backup/recovery y retención se definen exclusivamente en OPERATIONS.

## Materialización CLOUD-02 y diferimientos explícitos

14 tablas, schemas catalog/ledger/state/delivery, dos migrations core inventory → delivery metadata.
Business.ownerUserId es text NOT NULL UNIQUE SIN FK: ahora Better Auth existe, pero la relación
FK/semántica Business.ownerUserId → User sigue DEFERRED TO CLOUD-04. DeletionRequest.userId
es temporal nullable, sin auth FK; relación y purga/supresión definitiva dependen de CLOUD-04/API-10.
No users/session/account/verification fake. Business timestamps son server timestamptz; Inventory
y las entidades del dominio conservan epoch BIGINT. Todos los BIGINT se leen como bigint/string.
Inventory tiene generation UUID técnico (default gen_random_uuid, no identidad comercial) y revision
BIGINT default 0; metadataRevision/stateRevision default 0. Revisiones no negativas hasta rango int64,
sin límite JS-safe ni sequence global. lastMovementId y reversal FK incluyen inventory/product.
reversalOfMovementId nullable permite el upgrade core sin inventar vínculos retrospectivos; import
MIG-01 deberá validar/materializar relaciones conocidas. La unicidad parcial ya protege vínculos presentes.

ImportSession.inventoryId es UUID reservado SIN FK a Inventory: onboarding permite reservar antes
de crear Inventory. Business FK/hash unique existen; verificar reserva/ownership/generation dentro
de transacción queda para MIG-01. Estado import/deletion y kind/resultCode no vacían sus campos,
pero no congelan catálogos antes de sus tickets. JSONB ChangeSet/resultReferences/progreso es objeto;
DTOs internos, allowlists y validación profunda en CLOUD-06/API-01/MIG-01/API-10, no event sourcing.
Metadata de movimientos conserva NULL de Domain V1. FKs usan NO ACTION, sin cascadas financieras.
Promedio ponderado, sumas entre líneas, cobertura de movimientos, ordering/conflictos y authorization
siguen en Domain/Application/transacciones futuras. CHECKs protegen solo fila/relación.
Comandos, estrategia de tests y evidencia en [CLOUD-02](CLOUD-02.md).

## Materialización CLOUD-03

auth-schema.ts generado por CLI oficial auth 1.7.7; user/session/account/verification, IDs text
opacos de la librería. Migration 0002_auth_identity añade solo cuatro tablas, tres índices y dos
FKs auth con cascada User→Session/Account requeridas por el generador. Ninguna cascada financiera.
Nombres/columnas requeridos preservados, incluidos campos OAuth de Account aunque OAuth no habilitado.
timestamps auth son timestamp sin zona según output oficial; Pool/migrator usan UTC, sin modificar
generator a mano. Schema de negocio sigue epoch/timestamptz original. 0000/0001 intactas.
Upgrade desde CLOUD-02 preserva dataset/revisions >JS-safe/null/negativo/archivado; identidad vacía.
Sign-up no crea Business/Inventory ni vincula owner/deletion; no orquestador de borrado implementado.

El [ADR de DB](adr/ADR-WEB-004-database.md) y la
[documentación PostgreSQL de tipos](https://www.postgresql.org/docs/current/datatype-numeric.html)
sustentan el almacenamiento entero exacto, no una fórmula monetaria nueva.
