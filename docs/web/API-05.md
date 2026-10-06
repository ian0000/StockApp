# API-05 — AdjustStock: conteo físico y costo exacto

Base main `433b68f6ab99db85ab3974b1f6e3f36ad32210f1` (API-04, PR #85).
Rama `feat/api-05-adjust-stock`. Scope: POST adjustments, adaptadores, manifest/OpenAPI,
tests/documentación; sin cambios Domain/Application, Mobile, schema/migraciones,
dependencias/lockfile ni proveedores. Head/PR/checks/merge se registran en la entrega.

## Contrato y seguridad

POST `/v1/inventories/:inventoryId/adjustments`, AdjustStockCommand STOCK_ADJUST estricto,
respuesta200 AdjustStockResult congelada. Doce rutas implemented; ninguna lectura nueva.
Operation/StockAdjustment/Movement nuevos UUIDv7; Inventory/Product referencias UUID genéricas,
legacyv4 y igualdad case-insensitive, sin remapeo/regeneración de identidades.

Sesión oficial verificada, ownership servidor, Business ACTIVE/cloud flag e Inventory propio
revalidados bajo lock API-01. CLOUD-05 conserva CORS exacto, Origin/CSRF, JSON/body1MiB,
bucket durable60 comandos/minuto/usuario, requestId/no-store y redacción. JSON válido con
whitespace40KiB prueba que no se hereda Product32KiB. Idempotency-Key igual al operationId.
Operation-ref en revision directa →400 antes de executor/receipt aun con Inventory bloqueado;
envelope global y resolución de dependencias futura Sync permanecen intactos.

## Estado exacto y reglas existentes

Dentro del lock comparar revision bigint, stock, unitCost y lastMovementId antes de Application
y SQL comercial. Null distinto de costo conocido"0". Mismatch →CONFLICT durable409
REVISION_CONFLICT/details.currentRevision, sin movimiento/ChangeSet/Inventory revision.
Product missing/foreign/archived →REJECTED404 NOT_FOUND; State ausente/corrupto →500 sin receipt.

AdjustStockUseCase/applyStockAdjustment derivan difference=actualStock-stock. actualStock entero
seguro no negativo. Diferencia cero →REJECTED422 DOMAIN_RULE, ningún efecto comercial.
Positivo acepta COUNT_CORRECTION/OTHER; requiere USE_CURRENT_COST con costo conocido (cero válido,
custom null), o CUSTOM_COST obligatorio no negativo. Stock positivo pondera con Domain:
20@10 →conteo30 con entrada@12 produce costo10.666667, sin redondeo prematuro.
Stock cero/negativo usa el nuevo costo de entrada y no pondera déficit.
Negativo conserva costo actual, admite todos los motivos V1 y requiere costMode/custom null.

BUSINESS_RULES32 y Domain exigen costo conocido con stock positivo. Una diferencia negativa
con actualStock≥0 implica stock previo positivo: costo desconocido aquí es corrupción, no una
entrada válida. La prueba altera un CHECK solo en DB descartable y exige500/rollback;
runtime mantiene constraints. Money overflow →422 MONEY_OVERFLOW solo dentro de Application;
errores inesperados de persistencia →500 y únicamente colisiones de IDs conocidas →422 DOMAIN_RULE.

## Transacción, historial y resultado

Repositorios mínimos ligados al mismo tx API-01, listas completas scoped, sin BEGIN/segunda
conexión/transacción. Outputs Application capturados, después StockAdjustment1 + Movement1 +
State update1, Inventory revision, ChangeSet y receipt se confirman juntos. Product nunca se escribe.
Movement ADJUSTMENT_IN/OUT: delta=difference, snapshots exactos, sourceType STOCK_ADJUSTMENT/
sourceId ajuste y costo resuelto de entrada/salida, no promedio final; metadata/reversal null.
State=actualStock/costo final Domain, stateRevision anterior+1n y lastMovementId nuevo.
occurredAt→effectiveAt; payload.createdAt→createdAt/updatedAt; serverRecordedAt servidor.
Counters >JS-safe exactos; int64 máximo →500/rollback sin wrap/receipt terminal.

ChangeSet solo Adjustment1/Movement1/State1, otros arrays/tombstones vacíos.
`{adjustment,state,movement,committedRevision,serverRecordedAt}` se reconstruye desde receipt+
ChangeSet durable, sin leer estado comercial actual. Domain verifica evidencia histórica;
cardinalidad, IDs/scope/motivo/modo/costo/snapshots/counters/tiempos corruptos →500.
Replay/lost ACK/restart conserva resultado original; hash distinto →409 IDEMPOTENCY_KEY_REUSED.

Dos pools PostgreSQL con barreras y lock observado: dos ajustes misma base →uno ACCEPTED/otro
CONFLICT; Sale/Purchase primero invalidan estado completo; metadata-only acepta; archive antes
rechaza y después conserva historia. La política API-03 de mismo costo en ventas permanece intacta.

## Validación

Antes del adaptador:95 Domain (ajustes/Money/promedio) y39 Application AdjustStock PASS,
sin cambiar fórmulas/expectativas. Focused API-05:128 PASS,0 fail/skip; PostgreSQL18.6 real,
atomicidad en cada write, exact-state, overflow, IDs, concurrencia, replay/corrupción, HTTP
CLOUD-05/A-B y compiled HTTP con Better Auth/SMTP local/restart. Integrado en test:db required,
sin skips/checks opcionales. Conteos completos, gates/fresh clone/PR/CI/GitGuardian en entrega.

Regresión completa local PASS: Domain428/Application432/Mobile551/Contracts35/API unit24 =1470;
PostgreSQL/Auth/Ownership/Security/API-01..04:506 más API-05:128 =634. Total único2104,
sin sumar ejecuciones focused repetidas; fail/skipped/cancelled0. Frozen install, OpenAPI
generation/check, pnpm check/build, test:db, db:generate/auth:generate/check sin drift y
git diff --check PASS. CI/GitGuardian del head final y merge se verifican antes de continuar.

El batch humano API-04→API-05→API-06 sustituye los STOP individuales anteriores:
API-06 solo empieza con API-05 DONE/MERGED, gates verdes, main limpio0/0 y BLOCKERS=NONE.
Cualquier STOP condition detiene el batch; STOP final API-06, sin API-07+/Web/Sync/deploy.
