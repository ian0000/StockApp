# API-10 — Durable account deletion

Base main bedd3c2dcfe3321d7a491674c1abb36e648960d5 (DOC-FIX PR91). Rama feat/api-10-account-deletion.
Resolución consolidada humana API-10 aplicada. CI/PR/merge se registran solo después de comprobarlos.

## Contrato y recuperación

POST /v1/me/deletion: sesión oficial verified y reciente <=300000ms inclusive por createdAt,
Origin exacto cuando presente, CSRF ligado a sesión, JSON/body{} estricto, NoQuery,
Idempotency-Key UUIDv7, bucket existente60 commands/min/user, no-store/requestId.
202 {status:DELETION_REQUESTED,requestedAt,sessionsRevoked:true} después de commit.
Misma identidad/key o distinta key con intención activa reutiliza requestedAt original.
Key incompatible/de otra identidad409 IDEMPOTENCY_KEY_REUSED sanitizado; no status endpoint.
No OperationReceipt/ChangeSet/revisión financiera por deletion ni versión nueva de protocolo.

La tx bloquea User propio, Business NO KEY UPDATE si existe, Inventory FOR UPDATE si existe,
crea/reutiliza DeletionRequest.id=key, marca Business DELETING/flagfalse y elimina todas las
Session rows propias. Fallo revierte todo. NO KEY UPDATE conserva exclusión de updates de Business
sin impedir KEY SHARE que toman FKs de receipts anteriores: un UPDATE lock allí puede deadlock
con command que ya tiene Inventory. UpdatedAt Business usa GREATEST PostgreSQL para preservar
microsegundos del timestamp original, no truncarlos por Date JS.

Cookie ya revocada retorna401. Mientras User exista, official sign-in crea sesión nueva; me/csrf
permitidos y retry deletion devuelve202 original, revocando también esa nueva sesión. Si User ya
fue purgado, signin no puede completarse. No endpoint anónimo ni bearer de recuperación.
Sin Business también se acepta y revoca identidad; bloqueo durable impide bootstrap/export aunque
Business ya haya sido purgado entre fases. Business DELETING sigue bloqueando cloud/sync/import;
SyncDevice no tiene campos nuevos y se borra después de receipts. Free local/exports offline intactos.

Decisión humana adicional confirmada en chat: export/backup en curso responde401 cuando su sesión
fue revocada; responde403 si sesión válida y DELETING. Se mantiene orden de revalidación de API-09,
sin editar su código ni reinterpretar401 como fallo de lifecycle.

## Worker durable

Estados exactos REQUESTED/PROCESSING/COMPLETED. Progress server-only estricto:
phase REVOKE/PURGE_DELIVERY/PURGE_DATASET/PURGE_AUTH/FINALIZE, attempts seguro >=0,
lease UUID temporal exclusivamente PROCESSING. Sin error/PII/SQL/stack en progress.
Claim SELECT FOR UPDATE SKIP LOCKED, REQUESTED o PROCESSING stale>=60000ms por updatedAt;
claim incrementa attempts, genera lease y actualiza tiempo. Cada phase usa tx y verifica el lease
bajo request row lock: un worker viejo no puede escribir después del reclaim. Al esperar User,
no mantiene request lock, para respetar orden HTTP/bootstrap y evitar deadlock de recovery.
Cada phase actualiza progress/updatedAt en el mismo commit que sus DELETE. Fallo hace rollback de
phase y vuelve REQUESTED con progress mínimo, sin FAILED terminal. Reintento en próximo sweep,
no tight loop de fallo. Crash deja phase durable para reclaim; si User ya no existe y phase FINALIZE,
finaliza suppression después de restart. Lease no se retoma mientras phase sostiene row lock.

Runner del mismo servicio: sweep startup, wake tras aceptación y timer5000ms. Hasta100 jobs por
sweep, sin límite de dataset/productos; cada failed job una vez por sweep. Cierre cancela timer y
espera fase en curso antes de cerrar Pool/SMTP. DB es autoridad; timer/memoria solo disparan trabajo.
A/B locks independientes. No scheduler externo, broker, retries de QA ni configuración PG nueva.

## Purga

Delivery: import_sessions→inventory_change_sets→operation_receipts→sync_devices propios.
Dataset: stock_adjustments→inventory_states→inventory_movements→sale_items→sales→purchases→
products→inventories→businesses. Orden State antes de Movement exigido por lastMovement FK;
movements se eliminan juntos, incluidos originals/reversals, sin romper self-FK ni cascadas financieras.
Auth: Session/Account/Verification asociable exactamente por user.id/email; User último.
Solo scopes rate recomputables business-read-user/business-command-user/auth-login-email/
auth-reset-email; IP/path compartidos siguen TTL. Hash usa misma función de rate existente.

SuppressionIdentifier se calcula ya en acceptance y se valida antes de perder User; sobrevivir al
crash no depende de conservar email. FINALIZE exige ausencia de User/Business/Inventory y conserva
solo request.id, status, HMAC, requestedAt, updatedAt y progress{phase:FINALIZE,attempts}; userId=null.
No business/inventory/raw user/password/email/auth token/log ni lease en COMPLETED.

## Supresión y runbook local

HMAC-SHA256(DELETION_SUPPRESSION_SECRET, User.id exacto),64hex lowercase. ID opaco case-sensitive:
no trim/lowercase del stored identity, no email, no Better Auth secret reutilizado. Nuevo env server-only
obligatorio>=32 caracteres cuando se compone auth/API, sin default; generador auth offline intacto.
La clave estable debe custodiarse y mantenerse compatible con backups; no rotación de auth implícita.

Tooling operator-only:

```sh
pnpm --filter @stock-app/api deletion:suppressions export --output <private-file>
pnpm --filter @stock-app/api deletion:suppressions apply --input <private-file>
# Compilado:
node apps/api/dist/deletion/registry-cli.js export --output <private-file>
node apps/api/dist/deletion/registry-cli.js apply --input <private-file>
```

Env explícita DATABASE_URL/BETTER_AUTH_SECRET/DELETION_SUPPRESSION_SECRET al destino autorizado.
No .env auto-load, endpoint público ni credenciales en argumentos/logs. Export solo COMPLETED/HMAC,
identifiers únicos ordenados, JSON formato stockapp-deletion-suppressions/version1. Output exclusivo
wx, mode0600 cuando plataforma lo aplica; operador debe elegir directorio privado/ACL Windows.
No overwrite silencioso, auth IDs/emails/ledger/tiempos. Apply valida shape/hex/unique/version antes
de purgar, enumera UserIDs restaurados y compara HMAC con la clave correcta. Match usa orquestador
completo idempotente y comprueba que no quede identidad suprimida. Ejecutar en DB aislada SIN tráfico
antes de promoción; no conectar workers de API al restore durante apply. No se detecta por el formato
un secret incorrecto: custodia/selección de la clave correcta es precondición operativa explícita.

API-10 no configura backup/provider/infra externa. DEV-02 debe cifrar/custodiar copia separada del
snapshot principal, respaldarla, aplicarla antes de promoción y ensayar restore real. No pruning
30/37/38 días aproximado: COMPLETED se conserva hasta que DEV-02 demuestre el último backup que
contiene al usuario y cutoff+7d. PRIV/REL siguen bloqueando producción real hasta esa retención real.
Firmas de verify-email existentes no se revocan por DELETE verification: pertenecen a Better Auth;
no rotar secret global ni inventar datos/reglas nuevas para invalidarlas. User nuevo no se suprime
por compartir email del anterior; identifier se basa en identidad opaca anterior.

## Tests y validación

Focused test:deletion y required test:db conservan PG18.6 real/concurrency2/provisioning existente.
HTTP/recencia/CSRF/body/key/sesiones oficiales/recovery/no-Business/A-B, rollback request y phases,
PG locks comerciales, workers/fencing/reclaim/restart, registro/restore con copia independiente y
compiled HTTP/SMTP/CLI. Regresiones API01..09/Auth/Ownership/Security/Backup incluidas.
OpenAPI generate/check PASS; pnpm check PASS:1477 tests (Domain428/Application432/Mobile551/
Contracts38/API28),0fail/0skip; build:api explícito PASS. Test:deletion45PASS/0fail/0skip.
Test:db completo PASS:1004tests/0fail/0skip/0cancelled, incluyendo API01..10, Auth, Ownership,
Security, Backup/export y13 smoke HTTP compilados. Regressions incluidas en ese gate requerido,
sin duplicar conteos del focused. DB generate: no schema changes/nothing to migrate; auth generate
sin diff y auth check PASS. Pool/timeout/concurrency/CI intactos. Diff completo revisado/diff check PASS.
Sin cambios Domain/Application/Mobile/schema/migrations/dependencies/CI/pool/timeout/concurrency.

AUTO-FIX mecánicos (AGENTS65.1). En todos los casos PRODUCTION BEHAVIOR CHANGED: NO;
expectativas financieras y garantías de aceptación intactas.

| AUTO-FIX / CAUSE | SOURCE OF TRUTH | FILES |
| --- | --- | --- |
| Config de fixtures compiled/runtime sin nuevo secret | API-10 exige secret dedicado server-only | apps/api/test/*/compiled-http.test.ts, test/auth/policy.test.ts, test/ownership/liveness.test.ts |
| Clock de fixture anterior a nueva sesión oficial | Recencia usa session.createdAt; no auth future | test/deletion/helpers.ts, concurrency.test.ts |
| Pools secundarios seguían abiertos al DROP de QA | Ownership de resources/teardown de helpers PostgreSQL | test/deletion/concurrency.test.ts, compiled-http.test.ts |
| Requests concurrentes no estaban ambas autenticadas antes de revocar | Old cookie401; dos requests ya autenticadas comparten intención | test/deletion/concurrency.test.ts: barrera de lock PG observada, sin sleeps |
| Sale para Void con cronología ambigua frente a INITIAL | API-06 exige última operación inequívoca; helper Void existente | test/deletion/concurrency.test.ts: Sale createdAt1000/occurredAt900, inicial456 |
| Contador OpenAPI esperaba24 | Manifest registra nueva ruta API-10, total25 | packages/contracts/test/v1.test.ts |

## Diferido

DEV-02 independent storage/encryption/backup schedules/retention cutoff/real restore promotion;
DEV-05 provider scheduling/alerts; PRIV/REL release review. Ningún servicio desplegado ni readiness
externa inferida de los tests locales. STOP al completar API-10; no próxima feature automática.
