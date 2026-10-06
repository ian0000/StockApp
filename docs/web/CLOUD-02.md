# CLOUD-02 — PostgreSQL + Drizzle Schema + Initial Migrations

Implementación y QA local · 2026-10-03 (America/Guayaquil).
Base main `acf8fc5e7ee1b82d0db48db3e51b6a1173bff027` (CLOUD-01 PR #76).
Rama `feat/cloud-02-postgres-foundation`. Commit, PR/checks/merge y main final se verifican en entrega
del chat; no guardar aquí hashes de commits todavía inexistentes. PR y merge autorizados por ticket,
solo después de checks verdes, sin bypass ni auto-merge anticipado. No autoriza CLOUD-03.

## Dependencias y ownership

| API | Versión | Propósito |
| --- | --- | --- |
| drizzle-orm runtime | 0.45.2 | Schema PostgreSQL y queries tipadas |
| pg runtime | 8.23.1 | Driver PostgreSQL real y Pool |
| drizzle-kit dev | 0.31.10 | Generación reproducible de SQL/snapshots |
| @types/pg dev | 8.23.1 | Pool/client tipados sin any propio |

Drizzle ORM/kit alineados con Mobile: YES. Node 22.16.0/pnpm 11.0.9/TS 5.9.3 sin cambios.
No upgrades ajenos; lockfile enlaza peers opcionales pg/@types/pg de Drizzle también en el importer
Mobile, sin cambiar versión ni código/schema/migrations/package.json Mobile.
Contracts/Domain/Application/shared no reciben deps ni imports PostgreSQL. Sin ORM compartido.

## Archivos y comandos

Schema `apps/api/src/infrastructure/postgres/schema.ts` reexporta catalog.ts/ledger.ts/state.ts/delivery.ts.
columns.ts concentra BIGINT exacto y CHECKs de rango/tiempo, sin fórmulas nuevas.
Client: client.ts, createPostgresPool(connectionString) lazy/createDatabase(pool); sin pool global,
sin conexión al importar. pg mantiene BIGINT string y Drizzle usa mode bigint, nunca parser Number global.
Sesiones pool timezone UTC, max 10 y connection timeout 2s. Server HTTP no importa/connecta DB.
Runner: migrate.ts, migrateDatabase(pool)/runMigrations(); pool de CLI siempre cerrado en finally.
SQL localizado respecto al módulo: funciona desde src y dist. Advisory lock de sesión serializa
runners; Drizzle migrator registra/aplica SQL transaccional y libera lock/client/pool incluso al fallar.
Errores CLI genéricos, exit no-cero, sin URL/SQL/credenciales. No auto-migrate en import/build/start/live.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build:api
pnpm --filter @stock-app/api db:generate
# DATABASE_URL explícita en el shell, apuntando al destino de migración elegido
pnpm --filter @stock-app/api db:migrate
# Alternativa compilada desde root, conservando apps/api/drizzle y node_modules:
node apps/api/dist/infrastructure/postgres/migrate.js
# TEST_DATABASE_URL explícita en el shell, DB local disposable
pnpm test:db
git diff --check
```

drizzle.config.ts usa dialect postgresql/schema local/out drizzle, sin leer credenciales para generate.
No drizzle-kit push. .env.example contiene solo nombres vacíos y comentarios; no auto-load ni .env real.
Tests no hacen fallback a DATABASE_URL. Guard acepta solo postgres/postgresql en localhost/127.0.0.1/::1,
DB stockapp_test o stockapp_test_<suffix>, sin query/hash. URL rechazada no se repite en errores.
Test role necesita CREATE DATABASE: cada escenario de migración/suite crea una DB con nombre aleatorio
stockapp_test_<uuid>, la cierra y DROP solo esa DB generada; no reset/TRUNCATE de un dataset existente.
Guard adicional es defensa operacional, no autorización futura de negocio.

## Tablas e integridad

Core inventory: businesses, inventories, products, inventory_states, sales, sale_items, purchases,
stock_adjustments, inventory_movements. Sync/idempotency: sync_devices, operation_receipts,
inventory_change_sets. Lifecycle/import: import_sessions, deletion_requests. Auth tables: NONE.

| Invariante | Estado / protección |
| --- | --- |
| Owner / Inventory | IMPLEMENTED: owner text NOT NULL UNIQUE, businessId FK UNIQUE; un Inventory máximo |
| FK Better Auth | DEFERRED CLOUD-03/04: identidad de la librería no existe; no fake User |
| Money | IMPLEMENTED: BIGINT scaled 10^6, CHECK JS-safe y signo por campo; profit puede ser negativo |
| Stock/quantity | IMPLEMENTED: BIGINT exacto safe; quantity >0; conteo físico >=0; stock negativo permitido |
| Null/cero | IMPLEMENTED: null desconocido, cero conocido; costo presente con stock positivo |
| SaleItem | IMPLEMENTED: FKs compuestas Sale/Product; subtotal qty×price, KNOWN/UNKNOWN, cost/profit consistentes |
| Purchase | IMPLEMENTED: FK Product scoped, cantidad/costo/total/transición y snapshots de costo válidos |
| Adjustment | IMPLEMENTED: diferencia no cero, transición, motivo/dirección y costMode/costo actuales |
| Movement | IMPLEMENTED: delta no cero, transición, source pair, costo y metadata NULL de Domain V1 |
| Reversal | IMPLEMENTED: FK inventory/product/original, parcial unique inventory/reversal, no self-reference |
| Timestamps | IMPLEMENTED: epoch BIGINT safe >=0 y updatedAt >=createdAt; server timestamptz/UTC |
| UUID | IMPLEMENTED: tipo uuid comercial; no generador comercial ni autoridad de ordering en DB |
| Revision | IMPLEMENTED: BIGINT no negativo, exacto hasta int64, sin sequence; transporte string posterior |
| Active barcode | IMPLEMENTED: parcial unique inventory/barcode cuando no-null y isArchived=false |

Inventory generation es UUID técnico random default; revision/metadataRevision/stateRevision default 0.
lastMovementId FK incluye Inventory/Product. Campos reversal y lastMovement nullable durante upgrade.
No relaciones financieras ON DELETE CASCADE: todas las FKs NO ACTION. Product delete con historia falla.
UUIDv7 comercial nuevo se genera/valida en los límites de aplicación; PostgreSQL almacena uuid.
CLOUD-06-FIX aclara que UUID históricos válidos se preservan sin exigir v7 ni remapear FKs.
La generación técnica no es ID comercial ni cursor de commit.

104 CHECKs, 16 FKs, 14 PKs, 9 UNIQUE constraints y 34 índices totales observados en PostgreSQL 18.6.
Además de PKs/uniques: products inventory/createdAt/id para keyset; sales/purchases/adjustments y
movements inventory/effectiveAt DESC/createdAt DESC/id DESC; movimientos inventory/product/history
y inventory/sourceType/sourceId; SaleItem inventory/sale; ImportSession business/status.
PK state inventory/product, receipt business/operation y ChangeSet inventory/revision ya son índices.
Barcode y reversal son los dos unique parciales. Identidades compuestas soportan FKs scoped.
No índices speculative full-text ni endpoints History nuevos.

## Migraciones y PostgreSQL real

1. `apps/api/drizzle/0000_core_inventory.sql`: nueve tablas core y constraints/índices financieros.
2. `apps/api/drizzle/0001_delivery_metadata.sql`: cinco tablas delivery/lifecycle y columnas de
   generación/revisión/last movement/reversal con defaults compatibles sobre datos existentes.

Meta versionada: _journal.json, 0000_snapshot.json y 0001_snapshot.json. SQL revisado: UUID/BIGINT/
timestamptz, CHECKs, composite FKs, partial uniques, defaults y ausencia de cascadas financieras.
No migration vacía. Generate repetido: no cambios/no tercera migration. Defaults BIGINT usan SQL `0`:
drizzle-kit 0.31.10 no serializa un default literal JS bigint; no fue necesario cambiar versión.
Snapshots/journal usan formato Prettier del repo; generate sin cambios no los reescribe.

QA real local: PostgreSQL 18.6 Windows x64 portable, ZIP EDB enlazado por PostgreSQL oficial,
extraído en carpeta temporal fuera de Git; initdb/pg_ctl, cluster aislado, bind 127.0.0.1/puerto alternativo.
No servicio Windows/global PATH/instalación global. Docker estaba instalado pero su backend se cerró
al arrancar, por lo que no se usó para QA. No PGlite/SQLite/mocks como prueba de Postgres.
Auth trust exclusivamente en este cluster desechable local y en el servicio CI efímero, sin password.
No es configuración de servidor público/production; esos entornos no fueron creados.
Cada DB de test se elimina al terminar; el cluster QA se detiene antes de entrega.

| Prueba | Resultado local |
| --- | --- |
| Empty → latest | PASS, 14 tablas exactas y journal de dos entradas |
| Second migrate | PASS, mismo journal/hash/fechas, sin objetos duplicados |
| Upgrade real core → latest | PASS, fixture ficticio archivado/VOIDED/null/cero/safe max preservado |
| Defaults/constraints/indexes upgrade | PASS, revisions 0, last movement null, nuevos checks y reversal/import indexes |
| Runner compilado → empty | PASS, dos migrations y SQL localizado desde dist |
| Runner compilado repetido | PASS, no-op y exit 0 |

## Tests y gates

Antes: 1419 tests. Nuevos API sin DB: 3 (guard sin fallback, factory/import lazy, live con DB ausente/
inaccesible). DB: 51 resultados node:test = 2 tests migrations + suite y 48 subcasos de integridad.
Suite total: 1473 PASS (pnpm check 1422 + test:db 51). Domain 428/Application 424/Mobile 550 sin cambios,
API 13/Contracts 7/shared 0. No se cambiaron expectations de tests existentes.

DB prueba owner NOT NULL/unique y business FK/unique; moneda; scoped Sale/Product/State/Purchase/
Adjustment/Movement/devices; barcode activo/otro Inventory/archivado/null; costo cero/null/stock negativo;
BIGINT safe/overflow y revisión >safe exacta en pg/Drizzle; venta KNOWN/UNKNOWN/subtotal/cost/profit;
compra cantidad/costo/transición/total/snapshot; ajuste diferencia/motivo/costMode/transición;
movement source/delta/transición/costo/reversal unique/scoped; timestamps y rollback multiwrite.
SQL permite prototipos de receipt/change/import/deletion, sin implementar sus protocolos/handlers.

Primera corrida test-first falló por módulos aún ausentes, no por regla matemática demostrada en rojo.
La primera DB corrida encontró un error de fixture: pg codifica arrays JS como arrays PostgreSQL,
no como JSONB. Se serializó explícitamente `[]` para comprobar el rechazo JSONB de shape inválido;
no se cambió el resultado esperado ni se debilitó el CHECK. Después los 51 tests PASS.

PASS: frozen install, pnpm check (format/lint/typecheck/tests/build), build:api, API/Contracts tests,
test:db, empty/upgrade/second-run, runner compilado y git diff --check. pnpm check también pasó
sin dist previos (API/Contracts preservados fuera del repo), reproduciendo checkout limpio de CI.
El formato inicial falló en meta generado: se aplicó Prettier, sin excluir archivos del gate.
GET /live 200 sin DB configurada/con DB inaccesible; /health 404. Sin negocio/auth endpoints.
Smoke HTTP real compilado repitió /live 200 y /health 404 con DB ausente/cluster detenido;
runner compilado sin DATABASE_URL falló exit 1 con error genérico, sin filtrar configuración.
CI quality incorpora postgres:18.6 y `pnpm test:db` después de check y generación reproducible;
missing DB/error test/migration falla el job existente, sin skips/bypass. CI/GitGuardian finales en chat.

## Frontera y seguridad

Business.owner FK y DeletionRequest.user FK: DEFERRED CLOUD-03/04/API-10. Deletion.userId temporal
nullable permite suprimirlo posteriormente; progreso/suppressionIdentifier no ejecutan borrado/jobs.
Import.inventoryId es reserva UUID SIN FK física a Inventory, pues onboarding permite que aún no exista.
Reserva/owner/generation se validarán transaccionalmente en MIG-01, sin tabla auth inventada.
Delivery status/kind/resultCode text no vacío; catálogos, deep JSONB schemas/allowlists y DTOs están
reservados a CLOUD-06/API-01/MIG-01/API-10. ChangeSet es objeto de commit, no ledger reejecutable.
Suma entre SaleItems, coverage, promedio ponderado, void eligibility y conflicts no son CHECKs multirow;
seguirán Domain/Application/transaction layer. No command handler/authorization/sync implementado.

Secrets/.env real/password/URL privada comprometidos: NONE. Solo nombres vacíos .env.example y URL
loopback disposable en CI; sin valores Railway/production ni URLs en logs/errores HTTP de runtime.
No cambios funcionales Mobile/SQLite/Domain/Application/Contracts. No auth, endpoints financieros,
/health ficticio, deploy, PostgreSQL Railway, Cloudflare, DNS, producción, staging externo ni Web.
ADRs Accepted/AGENTS sin cambios: nueva lectura no requiere modificar sus decisiones.
Blockers locales: NONE; checks externos y merge definitivos solo tras su verificación real.

Docs: README root; docs/web README/CURRENT_STATE/ARCHITECTURE/DATA_MODEL/DEPLOYMENT/CI_CD/
TESTING/BACKLOG y esta evidencia. Tooling: package.json root/API, API tsconfig, lockfile, CI workflow.
API PostgreSQL: nueve archivos src, drizzle.config.ts, .env.example; migrations: dos SQL/tres JSON;
tests: postgres-config.test.ts, postgres/helpers.ts, migrations.test.ts, schema.test.ts.
BACKLOG: CLOUD-01/CLOUD-02 IMPLEMENTED; otros 45 PLANNED. STOP después de merge/main sync.

Fuentes primarias: [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql),
[BIGINT mode](https://orm.drizzle.team/docs/column-types/pg),
[generate](https://orm.drizzle.team/docs/drizzle-kit-generate),
[pg type boundary](https://node-postgres.com/features/types),
[PostgreSQL Windows/ZIP oficial](https://www.postgresql.org/download/windows/),
[EDB binaries](https://www.enterprisedb.com/download-postgresql-binaries).
