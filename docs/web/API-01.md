# API-01 — Command Transaction Engine

Base main `42acccb3567112813696917a84cfcfad381092e7` (CLOUD-06 PR #81).
Rama `feat/api-01-command-engine`. Implementación local, sin infraestructura desplegada.
SHA/PR/CI/GitGuardian/merge se verifican en la entrega; no se anticipan checks externos.

## Transacción y ownership

`apps/api/src/infrastructure/postgres/command-executor.ts`: `createCommandExecutor` recibe
CloudInventoryContext server-derived, CommandEnvelopeV1 validado, fingerprint, requestId actual
y callback `execute(tx, lockedInventory)`. Revalida envelope/hash, sin scope del body.
Callback recibe el mismo Drizzle transaction object: no transacción independiente, writes de
ownership ni otros inventarios. No se invoca todavía Application desde runtime API.

READ COMMITTED, una sola transacción/connection por comando. Lock equivalente a:

```sql
SELECT inventories.* FROM inventories
JOIN businesses ON businesses.id = inventories.business_id
WHERE inventories.id = :authorizedInventoryId
  AND inventories.business_id = :authorizedBusinessId
  AND businesses.owner_user_id = :authenticatedUserId
FOR UPDATE OF inventories;
```

Tras adquirir el lock se vuelve a leer owner real, verified, Business ACTIVE y flag cloud.
Contexto anterior no es autorización cacheada; el join evita bloquear Inventory ajeno.
Solo lock de una fila Inventory, hasta COMMIT/ROLLBACK: no JS mutex, advisory/global lock,
Redis ni sequence. Otro Business progresa independientemente. Futuros locks Product/State
requieren orden determinista en sus tickets.

Receipt `(businessId,operationId)` se consulta bajo el lock, antes del callback.
SAVEPOINT posterior al lock en la misma conexión: ACCEPTED conserva writes;
CONFLICT/REJECTED revierte writes del callback y persiste únicamente el receipt terminal.
Excepción inesperada propaga rollback completo, nunca se convierte en REJECTED.

## Fingerprint e idempotencia

`apps/api/src/commands/fingerprint.ts`: SHA-256 built-in node:crypto, 64 hex lowercase.
Primero decodeCommandEnvelope; canonical JSON de `{inventoryId,command}`, prefijado por
`stockapp-command-v1` y byte NUL para separación de dominio/versionado. Keys ordenadas
lexicográficamente en cada objeto; arrays mantienen orden y todos los valores se preservan.
No normaliza Money, notes, barcode, nombres ni UUID del envelope. Inventory server-derived
usa representación UUID de PostgreSQL. No incluye requestId ni tiempos de recepción.
deviceId ausente y null generan hashes distintos; notes ausente es inválido, no se convierte
a null. Determinismo comprobado en un nuevo proceso Node; payload/hash no se registran.

requireIdempotencyKey exige header UUIDv7 igual a operationId, comparación case-insensitive.
Missing/malformed/mismatch → 400 VALIDATION_ERROR, sin writes/receipt. Capitalización del
header puede variar; cambios de valores del envelope cambian fingerprint.
Misma key/hash → resultado durable original, sin callback ni nuevas writes/revisión/ChangeSet.
Misma key/hash diferente → 409 IDEMPOTENCY_KEY_REUSED, sin overwrite ni receipt nuevo.
Retry concurrente → exactamente un callback/receipt. ACK perdido → GET receipt/retry idéntico;
pool/runtime nuevo recupera DB. Sin Map/cache como autoridad ni endpoint público de prueba.

## Revision y ChangeSet

Inventory.revision PostgreSQL BIGINT, leído bigint. ACCEPTED asigna currentRevision + 1n,
con guarda int64; transporte decimal string, sin Number/Date.now/UUID ordering/sequence.
Solo ACCEPTED consume revisión; conflicto/rechazo, hash mismatch, validation/auth/security,
transient, DEPENDENCY_BLOCKED futuro y rollback no consumen. Dos accepted reciben revisiones
consecutivas, ordenadas por commit; A abortado no deja gap para B.

`change-sets.ts` valida cambios/ChangeSet con schemas compartidos antes de escribir y al leer,
incluido scope de cada upsert. V1 tombstones=[]; no borra historia. Un ChangeSet por ACCEPTED,
misma revision que receipt. JSONB `changes={upserts,tombstones}` estrictamente; inventoryId,
revision y serverRecordedAt son columnas, sin duplicarse. Se reconstruye y valida sin cast
ciego ni ocultar keys extra. serverRecordedAt/receivedAt usan clock servidor seguro, nunca
occurredAt/createdAt del cliente; revision gobierna orden. Fixtures vacíos solo prueban infra;
adapters comerciales futuros deben producir upserts completos correspondientes al commit.

## Receipt interno

`command-receipts.ts`, tabla existente, PK `(businessId,operationId)`, durable durante dataset.
Solo ACCEPTED/CONFLICT/REJECTED. No persiste transient ni DEPENDENCY_BLOCKED.
Device nullable para Web; si viene deviceId exige registro previo del mismo Business,
sin crear SyncDevice ni insertar FK inválida.

| commandKind ACCEPTED | resultReferences estricto |
| --- | --- |
| PRODUCT_CREATE | productId UUIDv7 |
| PRODUCT_UPDATE / PRODUCT_ARCHIVE | productId UUID genérico |
| SALE_REGISTER | saleId UUIDv7 |
| PURCHASE_REGISTER | purchaseId UUIDv7 |
| STOCK_ADJUST | stockAdjustmentId UUIDv7 |
| SALE_VOID | saleId UUID genérico |
| PURCHASE_VOID | purchaseId UUID genérico |

Referencias corresponden al payload, con igualdad UUID case-insensitive.
ACCEPTED requiere committedRevision positiva y ChangeSet del Inventory/revisión autorizados.
CONFLICT: errorCode REVISION_CONFLICT/COST_SNAPSHOT_CONFLICT; currentRevision string opcional
solo para REVISION_CONFLICT. REJECTED: DOMAIN_RULE/VOID_NOT_ELIGIBLE/MONEY_OVERFLOW/NOT_FOUND,
sin currentRevision. Ambos committedRevision=null, sin ChangeSet ni mutación.
Schemas additionalProperties=false: sin body comercial, SQL/stack, credential/session/cookie,
respuesta HTTP entera, fieldErrors ni requestId. Mensaje estable se reconstruye por código;
requestId viene de cada lectura/retry actual. Kind/status/refs/revision/hash/timestamp validados.
Corrupción, ChangeSet faltante, keys extra o scope inválido → 500 INTERNAL_ERROR sanitizado,
sin JSONB/SQL/stack en HTTP/logs; no receipt aceptado incompleto.

## GET operation y OpenAPI

GET `/v1/inventories/:inventoryId/operations/:operationId`, auth oficial verified y contexto cloud.
Busca Business autorizado + operationId; ACCEPTED reconstruye solo ChangeSet del Inventory propio.
Own200 OperationReceipt; missing/foreign404; anonymous401; disabled/DELETING403.
Inventory UUID genérico (v4 incluido), operationId UUIDv7; malformed/v4 operation400.
GET sin CSRF; Origin/CORS, bucket durable120 reads/min/user, no-store y requestId intactos.
Contracts añade OperationParams con ambos IDs; solo getOperation pasa planned→implemented.
OpenAPI3.1.1 regenerado, stale check y manifest vs runtime obligatorios. Seis implemented:
/live, /v1/session/csrf, /v1/me, POST/v1/business, GET Inventory metadata y GET operation.
/health404 y resto planned, sin handlers fake.

## Pruebas y gates

`apps/api/test/commands/*.test.ts`, PostgreSQL18.6 real, no mocks/SQLite/PGlite. Pools independientes,
Promise barriers y observación pg_stat_activity/Lock prueban serialización, retries iguales/hash
distinto, consecutividad6/7, rollback10→11 sin gap, independencia A/B y no lock de Inventory ajeno.
Atomicidad incluye fallo tardío INSERT receipt después de writes de callback/revision/ChangeSet.
Terminal revierte writes erróneos del callback. BIGINT >JS-safe/overflow, clock inválido, corrupción,
scope/device/allowlists cubiertos. ACK perdido cierra pool A y crea B. Smoke HTTP compilado reinicia
API con auth real/SMTP local, devuelve mismo ChangeSet y demuestra A/B404 y replay sin callback.

test:commands requiere build previo y TEST_DATABASE_URL para smoke compilado. Integra test:db
y required Quality checks existente, sin skip/optional/continue-on-error. Unit fingerprint/header
participa en pnpm check; OperationParams/status/OpenAPI/UUID en contracts. Conteos/gates se registran
tras ejecución. db:generate/auth:generate/check deben quedar sin diff. Domain/Application/Mobile y
schema/migrations no cambian. Runtime/dev dependencies nuevas: ninguna; crypto/Drizzle/schemas existentes.

Validación local final ejecutada, todos PASS, 0 fallos/0 skipped:

| Suite / gate | Resultado |
| --- | --- |
| Domain / Application / Mobile | 428 / 432 / 551 |
| Contracts / API | 33 / 24 |
| PostgreSQL / Auth / Ownership / Security | 55 / 35 / 21 / 37 |
| API-01 PostgreSQL/HTTP/restart/concurrency | 47 |
| Total | 1663; cinco unit API-01 ya incluidos en API24, dos contratos en Contracts33 |
| Frozen install / OpenAPI generation/check | PASS, artefacto vigente/determinista |
| pnpm check / build:api | PASS; 1468 tests, formato/lint/types/build |
| pnpm test:db | PASS; 195 tests, incluye los 47 focused API-01 |
| db:generate / auth:generate / auth:check | PASS, sin diferencias |
| git diff --check | PASS |

PostgreSQL18.6 efímero local, SMTP local y datos ficticios. Sin cambios en migrations ni lockfile.
Estado vigente del PR y checks del head final se confirma antes de merge, sin bypass/auto-merge.

## Diferido

API-02..07 ejecutarán Domain/Application/repos comerciales en el mismo tx. Resolver dependsOn,
parent receipt/expectedStateRevision.operationId y DEPENDENCY_BLOCKED retryable pertenece a
adapters/SYNC-02; API-01 guarda committedRevision pero no resuelve dependencias.
No device registration, sync push/pull/snapshot, import/chunks/activación, Mobile outbox, Web,
event sourcing/CQRS/framework/broker, readiness/deploy. Railway/Pages/DNS/production DB,
SMTP externo y secrets producción NOT TOUCHED. No se inicia el siguiente ticket al terminar.
