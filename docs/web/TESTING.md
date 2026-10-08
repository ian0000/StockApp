# Pruebas y DoD futura

API-10 añade focused test:deletion y grupo obligatorio a test:db: PG/auth reales, recencia, body/key/CSRF, sesiones revocadas, recovery, A/B, Inventory locks/FK-safe purge, claim/reclaim/fencing/restart, failure injection por write, restore con registro independiente y compiled HTTP/SMTP/CLI. Concurrency y pool/timeouts originales conservados. [Detalle](API-10.md).

La política operativa canónica de HUMAN STOP, AUTO-FIX y TEST/QA INFRASTRUCTURE está en
[AGENTS.md, sección 65.1](../../AGENTS.md#651-política-operativa-human-stop-auto-fix-y-testqa-infrastructure).
Las aplicaciones al QA descritas aquí deben conservar esa política.

API-09 añade test/backup/*.test.ts al required test:db y focused test:backup, sin skips ni
cambios de workflow/PG. Recencia299999/300000/300001, auth oficial, lifecycle, ocho tablas A/B,
historial/restorabilidad/safe BIGINT/UUID legacy, snapshot multiproducto concurrente y compiled
PG/auth/SMTP/restart. Manifest401 anónimo/connections=0 y24 rutas. Gates secuenciales; fixes
mecánicos/test-only con evidencia autorizados, STOP humano solo ante decisiones reales.
Runner local serializa CREATE/DROP/primera conexión, no operaciones de negocio; bases reales
independientes y concurrency2 global conservadas. [Detalle](API-09.md).

API-08 integra read-models en required test:db y focused test:read-models: auth/A-B,
cursor opaco scoped/filtros/keyset/límites, búsqueda/barcode exacto, costs null/cero/negative,
detalles actuales/archived/VOIDED y snapshots, eligibility/corrupción, history, timezone/DST,
dashboard y no writes comerciales. Smoke compilado real con SMTP/PostgreSQL y restart.
check1473 y test:db933 PASS (total único2406), cero fail/skips/cancelled; las regresiones,
generadores y gates remotos se verifican antes de entrega. [Evidencia](API-08.md).

API-07 integra void-purchases en required test:db y focused test:void-purchases: promedio previo/null/cero/negativo, snapshots y archivo, estado exacto/elegibilidad, locks entre dos pools, replay/409/422, rollback en cada write, corrupción, legacyv4, HTTP/A-B y compiled SMTP/restart. Gates pesados secuenciales; configuración PG intacta. [Evidencia](API-07.md).

API-06 integra test/void-sales en test:db required: multi-product all-or-nothing, costos históricos/null/cero/negativo, archived, precondiciones y cobertura, elegibilidad, dos pools/lock observado, distinct concurrent void→VOIDED+CONFLICT y same-operation→una ejecución/replay, rollback por write, A/B/seguridad/corrupción/legacy y compiled HTTP/SMTP/restart. Domain/Application/local ALREADY_VOIDED tests intactos. [Evidencia](API-06.md).

API-05 integra test/adjustments en test:db required:128 focused PASS, PostgreSQL18.6 real, conteo/costos, exact-state, concurrencia con Sale/Purchase/archive, rollback por write, A/B/CLOUD-05/corrupción y compiled HTTP/SMTP/restart. [Evidencia](API-05.md).

API-04 añade test/purchases/*.test.ts al test:db obligatorio y focused test:purchases: PostgreSQL18.6, promedio exacto/test-first, cero/null/negativo, priceAnalysis incluido overflow no fatal, snapshot Product, estados exactos, dos pools/locks observados, Sale-before-Purchase conflict, rollback, A/B, corrupción, compiled HTTP/SMTP/restart/replay. Regresiones API-01/02/03/Mobile conservadas. [Conteos y gates](API-04.md).

API-03 añade test/sales/*.test.ts al test:db obligatorio y focused test:sales. PostgreSQL18.6 real: test-first financiero, mixed unknown/zero, deltas negativos, evidence/overflow, late rollback en seis etapas, dos pools/DB-observed locks, archive/metadata races, A/B, legacy IDs, corrupción, Node compiled/auth/SMTP/restart y replay histórico. Regresiones API-01/API-02/auth/ownership/security/Mobile conservadas. [Conteos y gates](API-03.md).

API-02 añade test/products/*.test.ts al test:db obligatorio y focused test:products. PostgreSQL18.6 real: stock0/positivo/costo0, FKs/rollback tardío, barcode, metadata revisions/BIGINT, dos pools con lock observado, aislamiento A/B, legacy UUID y replay. HTTP compilado usa auth real/SMTP local y reinicia runtime para recuperar CreateResult y MutationResult. ProductParams/manifest/OpenAPI participan en pnpm check. [Conteos y gates](API-02.md).

API-01 añade test:commands a test:db obligatorio: PostgreSQL18.6, dos pools/barriers/DB-observed locks,
retry/hash mismatch, no gaps, rollback tardío, terminales, BIGINT/overflow, corrupción, A/B y clock.
Smoke compilado + SMTP/auth real reinicia API y recupera mismo receipt. Unit fingerprint/header y
OperationParams/OpenAPI entran en pnpm check. Focused test:commands requiere build/TEST_DATABASE_URL;
no mocks DB/skips ni fake endpoints. [Detalle y gates](API-01.md).

CLOUD-06 añade tests de contratos estrictos, versiones, null/zero, Percentage/rangos, UUID/v7,
IDs duplicados, evidencia/dependencies, OpenAPI determinista/stale/refs y manifest contra runtime.
Application prueba IDs/time exactos, venta multilínea, reversals por producto y metadata clock skew.
Mobile conserva regresión y SQLite real (commit/retry/rollback). [Evidencia](CLOUD-06.md).

Suite actual node:test/tsx y SQLite real donde corresponde, descrita en CURRENT_STATE.
Esta tarea documental no agrega tests que reflejen texto ni altera tests existentes.
Validación fresca en VALIDATION. Diseño de pruebas abajo pertenece a implementación futura.
Excepción materializada: CLOUD-01 foundation HTTP/contracts, CLOUD-02 schema/migrations PostgreSQL
y CLOUD-03 Better Auth/SMTP/verify/reset/revoke.
`pnpm check` incluye API tests sin DB; `pnpm test:db` es gate separado obligatorio en CI, contra DB
real local disposable. Migrate vacío/no-op, upgrade core con datos, constraints/FKs/barcode/reversal
y exactitud BIGINT están probados. CLOUD-03 extiende test:db con auth PostgreSQL y HTTP compilado,
SMTP efímero, verificación/reset/expiración/revocación/cookies/redacción y upgrade CLOUD-02.
No equivalen a command transactions, ownership, browsers físicos/CORS o sync aún pendientes.
Resultados y ejecución en [CLOUD-02](CLOUD-02.md).
Auth/SMTP y conteo fresco en [CLOUD-03](CLOUD-03.md). Local test:auth/test:db requieren build:api previo
para el smoke compilado, TEST_DATABASE_URL local disposable y no credenciales SMTP externas.

## Matriz requerida

| Nivel | Casos decisivos |
| --- | --- |
| Domain regression/test-first | Promedio, Money overflow/6 decimales, null/cero, negativo, margen/markup, sugerencia, reversals |
| Shared contracts | Money string canonical→Money→JSON exacto, Percentage puntos porcentuales, unsafe number/revisions, additional props |
| PostgreSQL real | Sale multiproducto atómica; fail cada write; purchase/adjust/void rollback; unique barcode y reversal; migrations upgrade |
| Tenant isolation | A→B por resourceId/childId/history/import/export/cursor/receipt, 404 sin fuga |
| Auth browsers/native | Cookie host-only/Safari/Chrome/Firefox, credentials+CORS, CSRF, verify/reset/revoke/logout/SecureStore |
| Sync fault injection | Commit→ACK perdido; mismo ID/hash distinto; dup batches; crash aplicación página; cursor watermark ordering |
| Concurrency | A/B venden mismo costo→delta negativo permitido; compra antes de sync venta cambia costo→conflicto sin reescribir profit |
| Strict state | Compra/ajuste stale; venta multiproducto conflicto en una línea→sin writes; void con posterior o empate legacy bloqueado |
| Local projection | Pull con pending no pisa delta; reset con cursor >90 días conserva outbox; rama conflictiva conservada/revisión dependientes |
| Import | Ocho tablas/archivados/VOIDED/REVERSAL/unknown/zero; hash/chunks retry; no replay; cloud no vacío rechaza; crash activation rollback |
| Lifecycle/recovery | Account delete/revoke/import purge; restore backup con supresión aplicada; export consistente; logout account-switch isolation |
| Web E2E | Login→alta→compra→venta múltiple→historial→void elegible; stock warning, null/precisión, precio separado, uncertainty/reload |
| Mobile physical | Guardar offline/reiniciar/sync en dos dispositivos, cámara/share/files/SecureStore; no sustituir con Expo export |

Clock fixtures incluyen skew/futuro/empates; ordering server nunca UUID/time cliente.
Datos ficticios, no backups reales de usuarios en CI. PostgreSQL no se sustituye por SQLite para
probar locking/constraints cloud. Integration solo de HTTP mock no demuestra atomicidad real.

## Objetivos de performance V1

Dataset de referencia: 2000 productos, 50000 movimientos, venta de 20 líneas.
Objetivo medido en staging: búsqueda p95 <=500ms API, comando p95 <=1s sin cold start,
UI Web venta conocida 5–10s objetivo UX, lote sync 50 commands <=10s con red QA.
No promesas/SLA comerciales. Medir antes de índices extra; locks por tenant y query planos reales.

## DoD de implementación

- Scope del ticket y docs revisados; ninguna regla inventada ni feature adicional.
- Tests relevantes y suite de consumidores afectados PASS; test-first para cálculos críticos.
- Typecheck strict, lint, format, build real de apps nuevas, API contract checks PASS.
- Persistencia: migración versionada si aplica, datos previos y rollback/atomicidad probados.
- Auth/ownership/errors/offline/idempotencia/observabilidad cubiertos según cambio.
- No secrets/PII/payload comercial en logs; revisión de dependencias nuevas justificada.
- Docs/contracts/diagramas ajustados cuando cambie diseño, diff completo revisado.
- CI verde requerido, PR/revisión y merge según autorización vigente de CI_CD; despliegue es gate separado.

Un ticket no está DONE si solo compila o si su test financiero esperado se cambió para pasar.
Un resultado NOT RUN lleva motivo y no se sustituye por PASS histórico.

## CLOUD-04: ownership real

test:db incluye test/ownership y nuevos tests FK/migration; workers=2 evita tormentas de conexiones,
concurrencia funcional interna permanece real. test:ownership específico requiere build:api/DB local
para smoke dist+SMTP+CLI compilado. Auth regression conserva TTL/cookies/password/reset.
empty/latest, valid03 upgrade, orphan reject/journal unchanged, no-op; UUIDv7/rollback/concurrencia/
no signup upload/A-B isolation/pilot requirements/revocation/access tested. 1539 resultados PASS,
sin doble sumar suites específicas; conteos, comandos y gates en [CLOUD-04](CLOUD-04.md).

## CLOUD-05: security requerido

`pnpm --filter @stock-app/api test:security` es también parte de `pnpm test:db` y del required
Quality checks con PostgreSQL18.6 real. No optional/continue-on-error/skips. CORS/preflight/Origin,
CSRF same/cross/revoked sessions, JSON/body, no-store/requestId/redaction, auth email/IP, negocio
user buckets, ventanas, reinicio real y dos pools/instancias/concurrencia.
Migración CLOUD-04→latest conserva User/Session/Account/Verification y ownership; empty latest y
no-op comprobados. Compiled HTTP con SMTP local incluye bootstrap sin/con CSRF, Origin hostil,
token incorrecto, A/B404,429 auth y logout con token antiguo.
Regresiones auth usan ventanas separadas con clock de rate fixture; security fija/avanza clock
explícitamente para comprobar umbrales, sin cambiar TTL auth ni esperar horas.
GET Inventory no requiere CSRF; orden CSRF→IDOR se prueba con mutación solo en app de test
usando el mismo authorizeBusinessRequest, sin publicar endpoint futuro. [Conteos/gates](CLOUD-05.md).
