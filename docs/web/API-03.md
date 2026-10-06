# API-03 — RegisterSale multiproducto

Base main `3e5f5e309bf24b4c5ee6866fc0b85c13982ab06c` (API-02, PR #83).
Rama `feat/api-03-register-sale`. Validación con PostgreSQL18.6 real y SMTP local,
datos ficticios. SHA del PR, checks y merge se registran en la entrega tras verificarlos.

## Ruta y contrato

`POST /v1/inventories/:inventoryId/sales` recibe RegisterSaleCommand estricto y devuelve
200 RegisterSaleResult: sale, items, states, movements, committedRevision y serverRecordedAt.
InventoryParams UUID genérico; Inventory/Product legacyv4 siguen válidos. Operation/Sale/Item/
Movement nuevos requieren UUIDv7; no se regeneran ni remapean IDs. Igualdad UUID case-insensitive.
El contrato financiero/envelope/hash API-01 no cambia; OpenAPI marca registerSale implemented.

Una o varias líneas, un Product por línea, cantidad entera positiva y precio explícito por línea.
Precio de venta no se lee de regularSalePrice ni modifica Product. Notes utiliza la normalización
Application existente, sin cambiar Mobile. occurredAt → effectiveAt; payload.createdAt → createdAt/
updatedAt; serverRecordedAt proviene del servidor. Sin límite comercial nuevo de líneas.

## Costos, evidencia y concurrencia

RegisterSaleUseCase y Domain Money existentes calculan subtotal, snapshots, costo/ganancia estimados
y agregados con escala10^6, sin float/rounding alternativo. Costo conocido cero permanece "0".
Costo desconocido conserva null en snapshot/costo/ganancia de la línea. Si alguna línea es UNKNOWN,
Sale.estimatedCost y estimatedProfit son null, sin sumar parcialmente costos conocidos. Una venta
por debajo del costo conserva ganancia negativa. No se modifica costo unitario canónico.

expectedCosts exige evidencia por Product: unitCostSnapshot, estimatedCost y estimatedProfit.
Primero se compara costo exacto contra estado canónico; después, los estimates exactos derivados
por Application. Toda la evidencia se valida antes del primer write comercial. Un mismatch en
cualquier línea produce receipt terminal CONFLICT/COST_SNAPSHOT_CONFLICT409 sin detalles comerciales,
Sale/Item/Movement/State writes, ChangeSet ni nueva Inventory revision.

Sale no tiene expectedStateRevision. Bajo el mismo Inventory row lock API-01, stock/revisión/
lastMovement cambiados por otra venta no invalidan una operación si el costo exacto sigue igual.
El delta se aplica al stock canónico actual, incluso cero/negativo. Prueba con dos conexiones:
stock10/costo5 → venta A qty2 → stock8; venta B qty3 con evidencia original → stock5, costo5,
ambas ACCEPTED y revisiones consecutivas. Un escritor controlado de fixture cambia costo bajo
ese lock y la venta esperando termina CONFLICT; no implementa Purchase ni endpoint de depuración.
Update de metadata concurrente conserva precio explícito; archive primero rechaza la venta,
venta primero conserva historia y permite archive posterior.

## Adaptadores y atomicidad

`sales/transaction.ts` liga los ports mínimos al CommandTransaction existente. listByInventory
devuelve Products/States completos del Inventory autorizado. No presenta subconjuntos como listas
completas, no consulta datos ajenos. Ports no usados fallan explícitamente. Domain/Application/
Mobile conservan su código y comportamiento; Product mappers se reutilizan.

runInTransaction ejecuta el callback con estos repositorios y captura exactamente Sale, Items,
Movements y States generados por Application. No abre BEGIN, transacción anidada ni segunda conexión.
Antes de persistir valida cobertura, identidades y relaciones, y luego escribe en el mismo tx:
Sale → SaleItems → SALE Movements → InventoryStates. Las FK inmediatas siguen activas.

Cada State usa stock/costo de Application, stateRevision previo +1n y el Movement correspondiente
como lastMovementId. No hay clamps ni bloqueo por stock insuficiente. metadataRevision y Product
permanecen intactos. Counters bigint exactos conservan valores mayores que JS-safe; int64 máximo
produce500 y rollback completo, sin receipt terminal ni gap. API-01 conserva lock, savepoint,
Inventory revision, ChangeSet y receipt dentro del mismo commit.

## Errores

| Caso | Resultado |
| --- | --- |
| Transporte/envelope/key/UUID/duplicados inválidos | 400 antes del executor, sin receipt |
| Product missing/foreign/archived | REJECTED NOT_FOUND404 genérico, receipt durable |
| Costo o estimate no coincidente | CONFLICT COST_SNAPSHOT_CONFLICT409, receipt durable |
| Regla Domain o colisión conocida Sale/Item/Movement | REJECTED DOMAIN_RULE422, receipt durable |
| Overflow de cálculo Money | REJECTED MONEY_OVERFLOW422, receipt durable |
| InventoryState ausente, counter overflow, DB inesperada o ChangeSet corrupto | 500 sanitizado, rollback; error interno no se transforma en rechazo financiero |

Money no exporta error tipado/helper de overflow. El adaptador reconoce únicamente RangeError con
mensaje exacto `Scaled units must be a safe integer.` durante ejecución pura Application, después
de validar transporte/estado. Errores de persistencia quedan fuera de ese catch. Stock underflow
se clasifica DOMAIN_RULE, no MONEY_OVERFLOW. SQL23505 solo se traduce para constraints conocidas
de identidad; un índice unique inesperado sigue500. No se cambia Domain para esta adaptación.

## ChangeSet y replay

Un ACCEPTED genera un ChangeSet: Sale1, ItemsN, MovementsN y StatesN, en orden de líneas del comando.
Products/Purchases/StockAdjustments y tombstones vacíos. references conserva saleId. GET operation
API-01 expone el receipt existente sin nuevo endpoint o schema. Rechazos/conflictos no consumen revisión.

La respuesta se reconstruye solo desde receipt/ChangeSet durable y comando validado. Se verifican
cardinalidad, identidades sin duplicados, Inventory/Product/Sale scope, cantidades/precios, snapshots,
costStatus/nullability, agregados con Domain Money, tipos/relaciones de Movement, stock/lastMovement,
revisión técnica, fechas y notes. Arrays persistidos desordenados se indexan por identidad y devuelven
en orden de entrada. Evidencia faltante/corrupta falla500, sin inventar respuesta parcial.

Replay no lee stock/costo/Product actuales ni depende del objeto original Application en memoria.
Después de otras ventas/cambios de costo y reinicio conserva estados/snapshots/revisión/tiempo
originales. Misma key/hash no repite delta; hash diferente409; operaciones concurrentes con misma
key ejecutan una sola venta. Un lost ACK se resuelve mediante este mismo replay histórico.

## Seguridad

Composición reutiliza CLOUD-05: sesión oficial verificada, Business ACTIVE/cloud flag, Inventory
propio revalidado bajo lock, Origin exacto/CSRF de sesión, JSON-only y límite global1MiB.
Sale no hereda el límite Product32KiB: se prueba payload válido con notes40KiB. Bucket durable60
commands/min/user, Idempotency-Key obligatorio, requestId servidor/no-store, errores/logs redactados.
A/B demuestra no filtración de datos ajenos. Sin bypass nativo ni campos owner/business/inventory
tomados del body. No secrets o proveedor real en pruebas.

## Validación

Test-first: once casos financieros fallaron ante stub REJECTED y pasaron con implementación.
Otro caso mixto con sumatoria parcial de costos fuera de JS-safe falló antes de corregir únicamente
la reconstrucción API; UNKNOWN conserva agregado null como Application. No se alteraron expectativas
para aceptar cálculos incorrectos.

| Suite | Tests únicos |
| --- | ---: |
| Domain | 428 |
| Application | 432 |
| Mobile | 551 |
| Contracts | 35 |
| API unit | 24 |
| PostgreSQL base | 55 |
| Auth | 35 |
| Ownership | 21 |
| Security | 37 |
| API-01 | 47 |
| API-02 | 78 |
| API-03 | 98 |
| Total | 1841 |

pnpm check:1470; pnpm test:db:371; total1841 sin contar nuevamente suites focalizadas.
API-03 incluye finanzas, UNKNOWN/cero, costo repetitivo24666667, legacy IDs, notes, evidencia,
ID collisions, unique inesperado, counters, concurrencia observada vía locks PostgreSQL,
fault injection en cada etapa comercial/ChangeSet/receipt, replay corrupto y HTTP real/compilado.
API-01:47 y API-02:78 también pasan por separado; API-03:98 pasa por separado.

Frozen install, OpenAPI generation/check, pnpm check (format/lint/types/unit/build), build API,
test:db y git diff --check pasan localmente. db:generate reporta No schema changes;
auth:generate/check no produce drift. Smoke compilado importa dist/server.js en proceso Node sin
loader TS y verifica auth/bootstrap, venta mixta, concurrencia de stock, aislamiento, conflicto,
GET operation y replay tras reinicio. CI y GitGuardian se verifican sobre el head final antes del merge.

## Frontera y siguiente paso

Sin nuevas dependencias/runtime/dev, upgrades, cambios DB/schema/migraciones, Domain/Application/
Mobile/SQLite/networking, Website o proveedores. Sin deployment ni acceso Railway/Cloudflare/DNS/
producción/SMTP real/secrets. Diez rutas de contracts implementadas; /health sigue404.
Sale detail/void, Purchase, Adjustment, reads/history, backup/lifecycle y sync permanecen planned.

Se detiene después de API-03. API-04 requiere otro ticket; API fase1 precede Web fase3 y después
DevOps/QA aplicable, SYNC/Mobile/MIG Mobile al final, manteniendo dependencias arquitectónicas.
