# API-09 — Consistent Backup + Account Export

Base main `a0fc46c265c8e2517f8d0ecb967749da314e6c9c` (API-08, PR #89).
Rama `feat/api-09-backup-export`. Dos GET y24 operaciones implemented en el manifest.
Preflight completo y resoluciones humanas incorporadas antes de implementar.
Validación local PASS; CI/GitGuardian/merge se verifican por separado en el PR del head final.

## Autenticación y lifecycle

Better Auth1.7.7 getSession oficial, email verificado y session.createdAt autoritativo.
StockApp compara age<=300000ms inclusivo;299999/300000 permitidos y300001 rechaza403
SESSION_NOT_FRESH con mensaje público/requestId sin timestamps/session IDs/details arbitrarios.
Missing/expired/revoked401 UNAUTHENTICATED, unverified403 EMAIL_NOT_VERIFIED. Actividad/
get-session/updatedAt no reautentican; sign-in oficial crea nueva sesión reciente. Sin cambiar
freshAge global, TTL/cookies/auth schema/password handling/PROTOCOL_VERSION/DOMAIN_VERSION.

GET `/v1/inventories/:inventoryId/backup`: ACTIVE+cloud habilitado+Inventory propio+recencia.
GET `/v1/me/export`: `{user:{id,email,emailVerified},backup,exportedAt}` propio. Sin Business
o ACTIVE sin Inventory200/backup null. ACTIVE con piloto deshabilitado permite portabilidad.
DELETING403 CLOUD_ACCESS_DISABLED incluso con nueva sesión válida reciente. Anti-IDOR404 vigente.

## Snapshot y formato

Ocho colecciones Application: inventories/products/inventoryStates/inventoryMovements/sales/
saleItems/purchases/stockAdjustments. Una transacción PostgreSQL REPEATABLE READ READ ONLY;
primer SELECT establece snapshot y ownership interno. Command concurrente entero antes/después,
sin Inventory write lock durante export. Autenticación/ownership inicial fuera del tx; después
del snapshot, comprobar sesión/ownership/lifecycle con lectura actual fuera de RR antes de
liberar bytes. La lectura RR repetiría ACTIVE antiguo. La autorización se define antes de la
respuesta; no puede recuperar bytes ya entregados si luego comienza una eliminación.

CreateBackupUseCase existente conserva integridad, orden, nombre UTC y JSON pretty con newline.
Download devuelve BackupV1 raw exacto: se valida explícitamente contra schema antes de send string
porque Fastify no reserializa strings JSON. AccountExport valida su forma y backup anidado.
Sin segundo serializer/formatVersion. Archivados/VOIDED/los seis tipos de Movement/REVERSAL/
ajustes/estado actual íntegros; IDs históricos, scaled Money/times/stock seguros numéricos,
null distinto de cero. BIGINT validado antes de Number; corrupción500 sanitizado sin parcial.
Proyección excluye businessId/generation/revisiones/lastMovementId/reversalOfMovementId/
reportingTimeZone/auth/receipts/ChangeSets/outbox/security. SourceId de REVERSAL se conserva.

## Seguridad y recursos

Origin/bucket durable business-read-user120/60 compartido/requestId/no-store existentes.
GET sin CSRF ni Idempotency-Key; JSON privado, attachment con filename del UseCase, sin email/
Business name en headers/URL pública/storage. Logging sin payload, PII o credenciales.
No heredar50MiB o100000movimientos del import como export cap; no truncar/paginar/omitir historia
ni500 intencional por dataset legítimo grande. Una sola exportación por request.

Large BackupV1 exports are materialized in memory in V1.
API-09 does not define an artificial export-size product limit.
Streaming/spooling and measured resource limits require a future
performance/operations ticket before large-scale production.

Materialización no garantiza memoria acotada. Sin rediseño preventivo/dependencia nueva;
un fallo inesperado real conserva500 sanitizado.

## Pruebas y gates

Unit: recencia inclusiva y BIGINT. PostgreSQL: ocho tablas A/B, completo/restaurable, archivados/
VOIDED/REVERSAL/ajustes/negativos/null/cero, UUID legacy/MAX_SAFE, determinismo/corrupción y
snapshot multiproducto concurrente con barreras reales. HTTP: auth/actividad/sign-in/expiración/
revocation/lifecycle/headers/query/Origin/rate/redaction/error500/revalidación tras snapshot.
Compiled HTTP con PG/auth/SMTP, archive revision1/replay y backup/export tras reinicio.
Manifest: dos rutas anónimas401 sin DB, /health404, connections=0;22→24 rutas.

Gates secuenciales: frozen install/OpenAPI generate-check/check/build:api/test:db/API-01..09/
Auth/Ownership/Security/compiled/db:generate/auth:generate-check/diff check-review. No cambios
schema/migrations/Domain/Application/Mobile/dependencies/CI/PG. La regla humana actualizada permite
correcciones mecánicas y de infraestructura exclusivamente de test con evidencia, sin relajar cobertura.
STOP humano solo ante una decisión real de producto/contrato/arquitectura/seguridad o garantías;
timeout no autoriza cambiar pool/timeout/concurrency global.
Gates locales verdes antes de PR; CI/GitGuardian verdes antes de merge normal.
STOP final API-09, sin API-10/import/deploy.

## AUTO-FIX — provisioning de bases de test

CAUSE: los workers creaban/dropeaban bases y abrían conexiones iniciales sin coordinación.
DROP DATABASE en PostgreSQL18.6 fuerza un checkpoint síncrono; se observaron checkpoints de
6.719s/5.202s y timeouts de conexión durante setup (CREATE administrativo o primera conexión).
No se demostró una fuga de API-09 ni un defecto financiero; la contención del provisioning es
infraestructura ajena al comportamiento que estos tests validan.

SOURCE OF TRUTH: autorización humana actualizada de test infrastructure y
[PostgreSQL18.6 dropdb](https://github.com/postgres/postgres/blob/REL_18_6/src/backend/commands/dbcommands.c).

FILES: test/helpers/provisioning-gate.ts, test/helpers/run-postgres-tests.ts,
test/postgres/helpers.ts, test/provisioning-gate.test.ts y scripts test: de apps/api/package.json.

PRODUCTION BEHAVIOR CHANGED: NO.

El runner de test mantiene una cola de leases local para CREATE/DROP y la conexión inicial de
la fixture. Fuera de esa sección, las operaciones y pools de negocio conservan concurrencia.
Cada escenario sigue usando una base PostgreSQL real independiente y todas las migraciones.
Lease liberado en finally, errores propagados y cierre del worker libera también la conexión del
coordinador. Sin retries, sleeps, skips, DROP FORCE, dependencias ni cambios de CI/server config.
Pool max10/connectionTimeoutMillis2000/test:db concurrency2 permanecen intactos.

## Evidencia local — 2026-10-07

- pnpm check PASS: formato/lint/tipos/OpenAPI,1477 tests (Domain428/Application432/
  Mobile551/Contracts38/API28) y build:api. Sin fails ni skips.
- pnpm test:db completo PASS:959 tests,0fail/0skip; bases y conexiones QA limpias después.
- Focused API-01..09 PASS:47/79/98/135/128/114/108/76/26 respectivamente.
- Auth35/Ownership21/Security37 PASS; compiled HTTP final12 PASS con PG/SMTP y reinicio.
- Archivo afectado de ajustes18 PASS; grupo128 PASS; tests del coordinador2 PASS.
- db:generate sin drift; auth:generate sin drift; auth:check PASS.
- git diff --check y revisión de scope PASS.2436 tests distintos entre unit y DB;
  focused/smokes repiten subsets, no se suman como cobertura única adicional.

No se afirma causa raíz única de toda latencia del host. La espera de provisioning observada
queda coordinada y la validación completa no reprodujo el timeout tras el fix test-only.
CI y GitGuardian deben finalizar PASS antes de merge; esta evidencia local no los sustituye.
