# Sincronización Mobile ↔ Cloud

CLOUD-06 congela envelope V1, devices, push/results, ChangeSet, pull/highWaterMark/cursors y snapshot
en [CONTRACTS_V1](CONTRACTS_V1.md). /v1/me anuncia protocolVersions/domainVersions `[1]`.
Los endpoints sync y proyecciones/outbox siguen planned; no se ejecutan comandos ni ChangeSets.
Tombstones V1 es array vacío: no hay borrado financiero, archive/VOIDED son upserts. Tipos técnicos
de lifecycle requieren definición concreta API-10 antes de ampliar ese campo.

Fuente normativa del protocolo V1. Diseño, no código. API no recibe un CRUD del estado final.

## Autoridad y durabilidad

Local-only: SQLite es el dataset completo autoritativo del usuario, sin red obligatoria.
Conectado: cloud es autoridad de operaciones ACEPTADAS compartidas; SQLite es fuente inmediata
durable con réplica aceptada más operaciones locales pendientes. Confirmar local no equivale
a aceptar global. Mostrar `Guardado en este dispositivo · pendiente de sincronizar` y conflictos.
Web confirma solo commit cloud. No copiar un número de stock enviado por un cliente a la DB.

Mobile registra en una misma transacción operación, snapshots, movimientos, estado y OutboxEntry.
Envelope: protocolVersion=1, domainVersion, deviceId, operationId UUIDv7 estable, commandKind,
entity IDs generados offline, occurredAt, payload, base revisions por producto/metadata,
dependsOn operationIds y resultado financiero local esperado. Fingerprint SHA-256 de JSON
canónico versionado calculado por server; retries conservan bytes semánticos/IDs.

Domain preserva valores financieros históricos. El servidor deriva resultado con el MISMO Domain
y compara snapshots monetarios recibidos. Una expectativa del cliente no se vuelve fuente de stock.
ID, precio de venta explícito, cantidades, costo de compra aceptado y conteo físico son inputs;
totales, costo promedio, lucro y movimientos son outputs verificados por server.

## Comandos y reglas de concurrencia

| Entidad/comando | Conflicto posible | Estrategia/autoridad | Resolución visible |
| --- | --- | --- | --- |
| Product create | ID/barcode duplicado | Same ID/hash dedup; barcode activo unique por inventory | Revisar código, no sobrescribir otro producto |
| Product edit/archive | metadataRevision stale | Comparar versión completa, no LWW ni merge silencioso de campos | Mostrar versión remota/local; nuevo comando explícito |
| Inventory/State | Sí | Solo servidor modifica como resultado de comando; lock Inventory | Ningún editor de stock absoluto salvo AdjustStock |
| Sale | retry o costo concurrente/archive | Delta de stock combinable SOLO si costo vigente equivale al snapshot local y producto activo; precio explícito del comando se conserva | Si costo difiere, conflicto; no recalcular ganancia antigua |
| Purchase | Sí, stock/costo concurrentes | Expected stateRevision exacta; derive average y compare snapshots | Revisión de estado/resultados, no recompute automático |
| Adjustment | Sí, conteo quedó viejo | Expected stateRevision exacta; conteo observado no LWW | Nuevo conteo/costo aceptado por usuario |
| VoidSale/VoidPurchase | Operación ya voided/movimiento posterior | Ya VOIDED → éxito; si no, última inequívoca + estado exacto, toda la operación | Bloqueo comprensible sin void parcial |

Sale puede aceptar stock distinto por otras ventas con mismo costo: servidor aplica su delta al
estado actual y genera stockBefore/After canónicos, conserva precio/costo/profit exactos de la
venta local. Esos snapshots de stock locales quedan en evidencia de propuesta, no se presentan
como historia compartida. Negative stock permitido con advertencia; no se rechaza por insuficiencia.
Cambiar nombre/precio habitual remoto no altera el precio explícito de una venta pendiente.
Archivar sí impide nueva venta/compra/ajuste; void histórico elegible puede operar sobre archivado.

Purchase/Adjustment dependen del estado exacto. Para una cadena offline, precondición puede
referenciar stateRevision base o el resultado de un dependsOn ya aceptado: server resuelve receipt
y revisión por producto, y verifica el estado completo esperado. Una compra posterior a una venta
aceptada con distinto stock podría entrar en conflicto: no suponer que dependencia aceptada basta.
Las anulaciones preservan restricción de última operación; no restaurar snapshots sobre cambios
remotos. Para legacy imported, empates createdAt ambiguos siguen bloqueados; no ordenar por UUID.
Nuevo orden aceptado se registra por revisión, sin relajar la política de BUSINESS_RULES.

## Receipts e idempotencia

En transacción bloqueada por Inventory: resolver owner, comprobar operación existente,
precondiciones, dominio; escribir operación completa, estados, receipt y ChangeSet; commit.
UNIQUE `(businessId,operationId)` y IDs de entidad; fingerprint diferente con misma key devuelve
409 `IDEMPOTENCY_KEY_REUSED`. Receipt con resultado/referencias se conserva durante vida del dataset.
Repetir key devuelve el resultado original y referencias, aunque entidad sea luego VOIDED;
consulta actual refresca el estado. Repetir void ya aplicado con otra key no crea reversal adicional.

Registrar y consumir receipt usa mismo lock. Timeout después del commit: consultar receipt o reenviar
misma key; jamás generar UUID nuevo porque no llegó respuesta. Web conserva command/operationId
en memoria hasta resolver envío, consulta receipts al reconectar; ver WEB_UX para recarga.

Push hasta 50 comandos/1 MiB por lote, FIFO por dispositivo y dependencias. Una transacción por
comando, no por lote. Results ACCEPTED/CONFLICT/REJECTED/DEPENDENCY_BLOCKED por operationId;
ACCEPTED/CONFLICT/REJECTED quedan en receipt terminal para misma key. DEPENDENCY_BLOCKED por
parent aún no recibido es temporal y permite retry misma key cuando llegue; parent rechazado exige
revisión de la rama. Reintentar transient o dependencia pendiente no crea receipt terminal.
Comando conflictivo no cambia ledger/state. No bloquear comandos independientes de otros productos.
Límites de batch son transporte, no límites comerciales de productos.

## Pull, cursor y snapshot

Cada Inventory tiene contador de revisión en fila bloqueada: asignación y commit ordenados bajo
el mismo lock. NO usar secuencia global PostgreSQL como cursor de orden de commit (puede tener
huecos/transacciones fuera de orden). Cada revisión representa un ChangeSet COMPLETO de un comando.
Cursor opaco vincula inventory, generation, lastRevision, protocol y límite superior de snapshot;
cliente no debe interpretarlo. No usar updatedAt del cliente como watermark.

GET changes after cursor devuelve máximo 50 ChangeSets completos y highWaterMark estable para
la paginación. Nunca dividir Sale/Items/Movements/States entre páginas. Aplicar página y nextCursor
en UNA transacción SQLite; mantener registro de revisiones aplicadas. Crash → rollback, mismo cursor
y retry. ACK push y pull de propia operación se deduplican por entityId/operationId/revision.

Cambios son upserts completos de entidades aprobadas y tombstones tipados. Archivado y VOIDED
son actualizaciones, no deletes. Tombstones y changelog se retienen 90 días; cursor expirado
devuelve 410 `SYNC_RESET_REQUIRED`. Nueva réplica descarga snapshot consistente paginado con
token/generation/highWaterMark y staging local; activa todo atómicamente y empieza delta desde
highWaterMark. Snapshot TTL 24h; expirar/reintentar no sobrescribe dataset activo.
Nunca reemplazar pendientes al hacer reset: preservar outbox/propuestas primero.

## Réplica y pendientes

El futuro SQLite conectado necesita tablas de réplica canónica y una capa de propuestas durables
(outbox/resultados locales); ledger local-only actual se preserva hasta migración. La vista operativa
usa réplica + pendientes compatibles. Al aplicar pull, NO escribir estado remoto sobre estado local
con pending y luego perder sus deltas. Recalcular solo proyección de stock/eligibilidad con domain;
no reescribir snapshots financieros de operaciones locales ni aceptadas.

Si un pull invalida un pending (costo, compra, conteo, archivo), mover su proyección y dependientes
a revisión, conservando íntegramente command, IDs, snapshots y evidencia local. Mostrar stock
compartido y cantidad de operaciones pendientes/en revisión por separado; no sumar dependientes
inválidos a métricas cloud. Mobile puede seguir registrando operaciones localmente: si dependen de
un estado en revisión, quedan en esa misma rama de propuestas, sin enviarlas como datos confirmados.

No borrar una venta local rechazada: el usuario puede conservarla en dataset local desconectado,
o resolver y registrar una NUEVA propuesta cloud con nuevo ID y relación `supersedesOperationId`.
Se muestra antes/después y dependientes, se confirma explícitamente; la propuesta original permanece
como evidencia excluida del ledger cloud. Una resolución nueva nunca cobra/registra automáticamente
otra venta. No aceptar con costo cero para forzar sync. Rechazo permanente ofrece explicación/export.

Esta separación es más trabajo que cache única, pero evita cambiar ganancias históricas en silencio.
SYNC-04/05 debe probar estos escenarios antes de integrar Mobile; la baseline no promete merge
automático de cualquier historial offline.

## Reintentos, sesión y fallos

Outbox estados PENDING/SENDING/ACCEPTED/CONFLICT/REJECTED, leases recuperables tras restart.
Network/5xx → backoff exponencial con jitter (1s hasta 5min), conserva key. 429 respeta Retry-After.
401 pausa sync hasta login; 403 acceso deshabilitado muestra estado y conserva datos locales.
409 requiere revisión; nunca retry infinito ni LWW. Pull/push single-flight por Inventory local.
Sync al abrir/reconectar y manual; foreground polling cada 30s conectado; background es best effort
de plataforma, no condición de consistencia. Web refresca tras mutation/focus y cada 30s.

Tiempo comercial occurredAt/effectiveAt y createdAt original local son evidencia del dispositivo,
no prueba de orden/propiedad. recordedAt/receivedAt server UTC y revision gobiernan aceptación.
Clock skew se muestra en diagnóstico y no reordena costos: purchases se aplican por aceptación,
sin replay retrospectivo. Ninguna compra futura recalcula venta aceptada. No soportar edición
histórica libre ni backdating manual por haber agregado occurredAt al envelope.

`/v1/me` anuncia protocol/domain versions soportadas. Cada versión financiera aceptada debe
ejecutar fixtures equivalentes; servidor no 'actualiza' semántica de comandos antiguos en silencio.
Versión no soportada rechaza antes de writes y permite mantener trabajo local; retiro de versión
requiere plan de compatibilidad con binarios instalados, según CI_CD.
