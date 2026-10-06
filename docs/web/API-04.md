# API-04 — RegisterPurchase: estado exacto y análisis durable

Base main `e5b55fa15eba1f05c6ec112e7e96cdb0c352bb31` (API-03, PR #84).
Rama `feat/api-04-register-purchase`. Pruebas con PostgreSQL18.6 real, SMTP local y datos ficticios.
Head/PR/checks/merge se registran en la entrega después de verificarlos.

## Ruta, contratos y seguridad

POST `/v1/inventories/:inventoryId/purchases`, RegisterPurchaseCommand estricto, únicamente
PURCHASE_REGISTER, respuesta200 RegisterPurchaseResult. Once rutas del manifest implemented;
Purchase detail/void, Adjustment, reads/history/dashboard/backup/deletion/sync/import y /health
siguen planned. OpenAPI generado desde el contrato; /health404.

Quantity entera segura positiva, unitCost Money no negativo, costo cero válido. Una compra contiene
un Product, sin PurchaseItem ni total/state/analysis/owner asignados por cliente. Nuevos Operation/
Purchase/Movement UUIDv7; referencias Product/Inventory UUID genéricas con legacyv4 intacto.
UUIDs recibidos preservados, igualdad case-insensitive y casing canónico DB, sin remapeo/regeneración.
Notes mantiene normalización Domain null/empty/whitespace →null y trim externo sin alterar contenido
interno. Wire V1 conserva campo notes requerido: omitirlo es400, usar null representa ausencia.
occurredAt → effectiveAt; payload.createdAt → createdAt/updatedAt; serverRecordedAt servidor.

Sesión oficial verificada, ownership server-derived, Business ACTIVE/cloud flag e Inventory propio
revalidados bajo lock API-01. Origin/CORS exactos, CSRF ligado a sesión, JSON-only/body global1MiB,
bucket durable60 commands/min/user, requestId servidor/no-store y redacción CLOUD-05.
Idempotency-Key UUIDv7 obligatorio e igual a operationId case-insensitive. Hash/envelope API-01 intactos.
Payload válido notes40KiB comprueba que Purchase no hereda Product32KiB. A/B y sesión unverified/
expired/revoked se prueban en la ruta real, sin bypass nativo o datos comerciales en errores/logs.

## Precondiciones directas y concurrencia

El envelope global V1 sigue admitiendo revision string o referencia `{operationId}` declarada en
dependsOn. POST purchases directo solo acepta revision string. Operation-ref se rechaza400 antes
de crear CommandTransaction/receipt: se demuestra aun con Inventory lock bloqueado por otra conexión.
Resolución de dependencias/DEPENDENCY_BLOCKED continúa SYNC-02; no se inventa implementación parcial.

Dentro del Inventory lock, comparar exactamente revision bigint, stock, costo transport y
lastMovementId (UUID case-insensitive, null distinto de UUID). Costo null distinto de "0".
Todos los checks anteceden Application y cualquier write comercial. Cualquier mismatch, incluido
snapshot distinto con misma revision, produce receipt CONFLICT REVISION_CONFLICT409 con únicamente
details.currentRevision del State, sin Purchase/Movement/State writes/ChangeSet/Inventory revision.

Purchase depende del estado completo. Sale con mismo costo puede combinar deltas; Purchase con
stock stale queda conflictiva aunque su costo siga igual, sin recalcular silenciosamente.
Dos pools PostgreSQL, barreras y espera de lock observada por DB prueban estado20/costo10/revision5:
A compra10@12 →30/10.666667/revision6; B compra5@11 con misma base →CONFLICT/currentRevision6.
Una sola Purchase/Movement y una Inventory revision. Sale primero también provoca conflicto.

Product metadata-only no cambia State y permite Purchase; analysis/snapshot usan precio vigente
visible al aceptar bajo lock. Archive primero →NOT_FOUND; Purchase primero →ACCEPTED y archive
posterior conserva historia. Misma operación concurrente usa un único callback/efecto y replay.

## Reglas financieras reutilizadas

RegisterPurchaseUseCase, applyPurchase, calculateWeightedAverageCost, createPurchase y
createPurchasePriceAnalysis existentes, sin cambios Domain/Application ni segunda fórmula API.
Money escala10^6 y rounding Domain half-away-from-zero:20@10 +10@12 →stock30/costo10.666667,
no10.67 interno. Stock positivo requiere costo conocido; positivo/null es corrupción500.

Stock cero establece costo de la nueva compra y conserva costo anterior histórico como snapshot.
Stock negativo suma cantidad pero no pondera déficit: -10+4/-10+10/-10+15 @12 →stock-6/0/5,
todos costo12. El costo anterior conocido o null no participa en ese promedio. Compra@0 es conocida
y válida; total puede"0". Ninguna compra posterior modifica ventas/compras históricas.

Purchase persiste exactamente IDs/scope/product, cantidad, costo/total derivados, stockBefore/After,
averageCostBefore nullable/After conocido, CONFIRMED, notes y tiempos Application.
Movement PURCHASE único: +quantity, snapshots stock, **unitCostSnapshot=Purchase.unitCost**,
no averageCostAfter, sourceType PURCHASE/sourceId purchaseId, metadata/reversal null y tiempos exactos.
State final utiliza Purchase.stockAfter/averageCostAfter, revision anterior+1n y Movement lastMovementId.
Counters >JS-safe exactos; int64 máximo produce500/rollback sin wrap/receipt terminal.

## PriceAnalysis y Product snapshot

Application produce previousUnitCost, currentUnitCost, regularSalePrice, previousMargin,
currentMargin, suggestedSalePrice y costChanged. API solo convierte Money/Percentage a transport.
Costo desconocido previo no inventa margen; known zero sigue distinto. Costo igual →costChanged false,
suggestion null. Costo menor no recomienda bajar precio. Margen anterior negativo no se utiliza
como target válido; no default margin. Aumento puede sugerir exactamente el precio Domain.
Margin/suggestion RangeError disponibles como null conforme Application: una compra válida acepta
aunque analysis no pueda calcular una cifra. Tests comparan output contra helper Application.

Suggestion informativa: Purchase no llama UpdateProductUseCase ni escribe Product. Un trigger que
rechaza todo Product UPDATE demuestra aceptación con sugerencia18 tras costo10→12/precio15.
Product.metadataRevision/updatedAt/regularSalePrice intactos. Un futuro WEB-06 decide explícitamente
otro Product command; fallos/retry de precio no registran otra compra.

ChangeSet incluye Product snapshot canónico de aceptación para conservar precio/metadata requeridos
por RegisterPurchaseResult y analysis durable, aunque no hubo Product mutation. No reconsulta Product
actual al responder/reintentar. Snapshot representa la fila leída dentro del lock, incluida metadataRevision.

## Transacción y replay

Ports mínimos Purchase/Product/State/Movement ligados al mismo CommandTransaction. listByInventory
devuelve listas completas scoped, no subconjuntos fingidos. Otros ports fail closed. Se reutilizan
Product/State/Movement/Money mappers API-02/03 sin modificar ventas ni su política de concurrencia.
runInTransaction invoca callback y captura exactamente Purchase/Movement/State Application;
persistencia Purchase → Movement → State respeta FK inmediata. Sin BEGIN anidado/segunda conexión,
constraints deshabilitados en runtime o GenericRepository. State WHERE Inventory/Product/revision
previa y affected rows1; error inesperado rollback completo.

Un ChangeSet ACCEPTED: Products1 (snapshot), Purchases1, Movements1 y AfterStates1;
Sales/SaleItems/StockAdjustments y tombstones vacíos. references exactamente `{purchaseId}`.
Receipt, Inventory revision y ChangeSet mismo commit API-01. Fault injection en Purchase/Movement/
State/ChangeSet/receipt y validación del snapshot demuestra rollback sin efectos/gaps/terminal receipt.
Solo fixtures disposable de corrupción alteran CHECKs para construir datos imposibles; runtime y
migraciones conservan todas las constraints.

Respuesta desde receipt/ChangeSet durable + comando aceptado: Purchase y Product históricos;
BeforeState desde precondition exacta/revision literal; AfterState/Movement desde ChangeSet.
Domain createPurchase verifica total/weighted average/snapshots; Application helper reconstruye analysis
desde esos estados y precio histórico. Se comprueban cardinalidad exacta, identidades/scope, Product
activo y revision válida, snapshots/notes/times, Movement relations/costo, State revision+1/lastMovement.
Corrupt/faltante/duplicado/inconsistente falla500. Sin stock/costo/Product actuales ni resultado
Application original en memoria. GET operation API-01 expone receipt existente.

Same key/hash replay no repite efectos; hash distinto409; lost ACK/restart devuelve historia original.
Conflicto durable tampoco se reevaluará aunque después el estado vuelva a coincidir; nueva intención
requiere nuevo operationId. Replay conserva Product15/analysis15 aun cuando precio actual20, estados
cambiados o Product archivado después. Runtime HTTP compilado reinicia y demuestra ese resultado.

## Errores y límites

| Caso | Resultado |
| --- | --- |
| Transporte/kind/key/UUID/quantity/cost/operation-ref inválidos | 400 antes de executor, sin receipt |
| Product missing/foreign/archived | REJECTED NOT_FOUND404 durable, sin fuga |
| Estado/revision/snapshot stale | CONFLICT REVISION_CONFLICT409/currentRevision durable |
| Money arithmetic overflow conocido | REJECTED MONEY_OVERFLOW422 durable |
| Stock overflow/Domain rule/colisión conocida Purchase o Movement | REJECTED DOMAIN_RULE422 durable |
| State ausente/corrupto, counter overflow, SQL unique inesperado o fallo DB | 500 sanitizado, rollback sin terminal receipt |
| ChangeSet corrupto durante replay | 500 sanitizado, sin repetir delta |

Money no exporta error tipado de overflow; misma estrategia estrecha API-03: RangeError + mensaje
exacto `Scaled units must be a safe integer.` solo en ejecución pura Application tras validar DB/
transporte, nunca captura SQL. RangeError de margin/suggestion ya resuelto a null por Application
no se convierte en fallo Purchase. SQL23505 traduce solo allowlist de identidad conocida.

## Validación y frontera

135 tests API-04 pasan: finanzas, precio/UNKNOWN/cero/negativo, notes/legacy IDs, exact state,
overflow, corrupción/snapshots, concurrencia, atomicidad y HTTP/security/compiled restart.
Los 12 casos iniciales se escribieron antes de implementación. Primera corrida falló por puerto
PostgreSQL incorrecto; no se contabiliza como RED financiero. Corregido el entorno, stub produjo12
fallos REJECTED vs ACCEPTED y la implementación12 PASS; evidencia local guardada sin cambiar expectativas.

Regresión completa local PASS: Domain428/Application432/Mobile551/Contracts35/API unit24 =1470;
PostgreSQL55/Auth35/Ownership21/Security37/API-01:47/API-02:78/API-03:98/API-04:135 =506.
Total único1976; focused47/78/98/135 y smoke incluidos, sin sumar repeticiones. Fail/skipped/cancelled0.
Frozen install, OpenAPI generation/check, pnpm check/build, test:db, focused API-01/02/03/04,
db:generate/auth:generate/check sin drift y git diff --check PASS. Resultados GitHub del head final
se registran en la entrega al verificarlos, sin atribuir pruebas locales a infraestructura productiva.
pnpm check cubre format/lint/types/unit/build; test:db incorpora purchases al required CI existente,
PostgreSQL18.6 y SMTP local. Focused API-01/02/03 conservan casos y API-04 tiene test:purchases.
Generación DB/Auth sin cambios; no schema/migraciones/deps/upgrades/lockfile nuevos.

Domain/Application/Mobile/SQLite/networking intactos. Sin Web, Purchase detail/void, Adjustment,
sync, auto-price update ni despliegues. Railway/Cloudflare/DNS/producción DB/SMTP/secrets NOT TOUCHED.
STOP después de API-04; API-05 requiere otro ticket. API→Web→DevOps/QA aplicable→SYNC/Mobile/MIG móvil
mantiene dependencias arquitectónicas, sin comenzar automáticamente otra fase.
