# CLOUD-04 — Ownership Context + Business/Inventory Bootstrap + Pilot Access

Implementación y QA local · 2026-10-03 (America/Guayaquil).
Base main `4d9dd1a67337f5c1e824ce411c4d23ad1bf32fe5` (CLOUD-03, PR #78).
Rama `feat/cloud-04-ownership`. Commit/head, PR, CI/GitGuardian, merge y main final
se verifican en entrega del chat. Merge autorizado solo después de checks/reviews requeridos verdes,
sin bypass ni auto-merge anticipado. STOP después de main limpio 0/0; CLOUD-05/06 no autorizados.

## Migration e integridad

Migration generada Drizzle **0003_business_ownership.sql**, snapshot 0003 y journal append.
Solo añade `businesses.owner_user_id → public.user.id`, TEXT NOT NULL UNIQUE ya existente,
ON DELETE **NO ACTION**, ON UPDATE NO ACTION. Identidad Better Auth directa; no AppUser/shadow User.
0000/0001/0002 SQL y snapshots publicados intactos. Cuatro migrations y las mismas 18 tablas.
No squash/drop/reset/push/auto-migrate. DeletionRequest.userId permanece sin FK: API-10 decidirá
supresión/pseudonimización y lifecycle, respetando OPERATIONS.

Un User tiene como máximo un Business; un Business como máximo un Inventory (UNIQUE DB).
Business temporal sin Inventory sigue posible para MIG-01. Piloto habilitado requiere owner
verified, Business ACTIVE y exactamente un Inventory bajo transacción; sin trigger cross-table.
Eliminar User que tiene Business falla por FK; no cascada Business/Inventory/ledger.
Delete-user de Better Auth continúa cerrado. Sin Team/roles/memberships/cambio owner.

PostgreSQL real: empty→latest/no-op; CLOUD-03 válido→latest con User/Business/Inventory/Product/
State preservados, dinero máximo safe, revision >JS-safe, archivado, stock negativo y costo null.
Upgrade huérfano falla por 23503, conserva owner/Business/Inventory/journal y no inventa User.
Pruebas antiguas core→latest usan fixture auth explícita antes de 0003; regression CLOUD-02→CLOUD-03
se mantiene como etapa histórica independiente. No repair implícito en código de migración.

## Runtime y contextos

`startServer` compone auth y ownership con AUTH_BASE_URL/env completas. Runtime expone el mismo
Drizzle database; no segundo Pool ni auth singleton. buildApp() permanece foundation-only.
No conexión/SMTP/migración al importar; Pool lazy; cierre HTTP drena SMTP y cierra recursos.
GET /live **200** con DB ausente/inaccesible y GET /health **404**.

`resolveAuthenticatedUser`: API oficial `auth.api.getSession({headers: fromNodeHeaders(...)})`.
Better Auth valida cookie/expiración/revocación; no parseo manual ni SELECT session propio.
Contexto server-derived de user/session, no body/query. EmailVerified se comprueba explícitamente
incluso si una sesión válida se volvió inconsistente. No exponer session/token en DTO ni logs.

`resolveOwnDataset`: WHERE Business.ownerUserId = session.user.id, LEFT JOIN Inventory por
Business.id. Para ruta S añade requested inventoryId al JOIN scoped; nunca busca un ID global
y después intenta descubrir owner. Una query coherente limita metadata al usuario. Contexto S
requiere authenticated/verified, Business existente ACTIVE, flag true e Inventory propio existente.
Helpers compartidos evitan repetir lookup/checks; cada handler resuelve sesión una vez.
No GenericRepository, framework DI, lógica financiera ni imports Mobile/Domain/Application.

## Rutas y contratos locales

JSON Schema Fastify real, strict TS, removeAdditional/coerceTypes=false, additionalProperties=false.
Todos rechazan query extra (incluido userId/ownerUserId); no mass assignment. DTOs route-local pequeños
con schemas de serialización allowlist; freeze/OpenAPI/DTO compartidos completos pertenecen a CLOUD-06.
Cache-Control **no-store**, incluido 400/401/403/404/409/500 en rutas ownership; x-request-id servidor.

| Ruta | Precondición | Resultado |
| --- | --- | --- |
| GET /v1/me | Sesión + verified | 200 user propio, Business o null, Inventory o null, flag propio |
| POST /v1/business | Sesión + verified; no exige piloto enabled | 201 creación vacía, 200 repetición coincidente, 409 distinta/reserva incompleta/DELETING |
| GET /v1/inventories/:inventoryId | Contexto S | 200 metadata propia; ajeno/inexistente 404 |
| /api/auth/* | Contrato CLOUD-03 intacto | Signup/verify/signin/session/logout/reset/revoke |
| GET /live | Ninguna dependencia | 200 |
| GET /health | No implementada | 404 |

No products/sales/purchases/history/dashboard/sync/import/admin/session-csrf endpoints.

Request bootstrap JSON-only:

```json
{
  "inventoryName": "Inventario",
  "currency": "USD",
  "reportingTimeZone": "America/Guayaquil"
}
```

inventoryName trimmed no vacío, máximo técnico 200 caracteres; timezone máximo técnico 100.
Límites modestos del transporte, no reglas comerciales ni límite Free. Currency `^[A-Z]{3}$`,
sin lista mundial; timezone reconocida por Intl.DateTimeFormat, rechazando offsets `+01:00`/`-0500`
que Node también acepta pero no son nombres IANA. Alias IANA reconocidos/UTC aceptados; no tabla propia.
businessId/inventoryId/ownerUserId/userId/status/cloudAccessEnabled/generation/revision/timestamps/
import extra → 400, no se ignoran. IDs server-owned UUIDv7 generados con uuid 14.0.1 `v7()`;
Inventory.generation conserva default técnico gen_random_uuid (v4), no prueba ownership.
Clock API inyectable ()→epoch ms seguro no negativo; metadata Inventory en BIGINT, no tiempo cliente.

Respuesta bootstrap: `{business:{id,status,cloudAccessEnabled},inventory:{id,name,currency,reportingTimeZone}}`.
GET /v1/me añade `{user:{id,email,emailVerified}}` y permite null Business/Inventory; funciona con
acceso deshabilitado. GET Inventory devuelve solo `{id,name,currency,reportingTimeZone}`.
Sin password/account/session/owner ajeno/generation/revision/capabilities/billing/plan.

## Atomicidad y retry

Una transacción Drizzle crea Business ACTIVE/cloudAccessEnabled=false y su Inventory vacío.
Lock User FOR UPDATE serializa solicitudes del mismo owner incluso antes de existir Business;
UNIQUE owner e Inventory.businessId son defensa adicional. Locks posteriores Business→Inventory,
mismo orden que piloto. No locks entre tenants ni autoridad basada en ordering UUID.
Fallo del clock después de Business insert o CHECK controlado al insertar Inventory → rollback ambos.

Payload normalizado coincidente con Business ACTIVE + Inventory existente retorna mismo recurso
200; payload distinto, DELETING o Business reservado sin Inventory → 409 BUSINESS_ALREADY_EXISTS.
No crear segundo Business/Inventory ni tomar reserva import. Piloto no cambia por retry.
Dos HTTP POST concurrentes idénticos → 201 + 200, exactamente un dataset; dos payloads distintos
concurrentes → uno creado y uno 409. Generic Idempotency-Key/OperationReceipt/API command semantics
**DEFERRED CLOUD-06/API-01**; no se implementan receipts ni eventos de negocio.

## Piloto operacional

DATABASE_URL debe apuntar al entorno autorizado; no lectura automática .env ni fallback/test remoto.

```sh
pnpm --filter @stock-app/api pilot:access -- --user-id <better-auth-user-id> --enable
pnpm --filter @stock-app/api pilot:access -- --user-id <better-auth-user-id> --disable
# Alternativa compilada desde raíz:
node apps/api/dist/ownership/pilot-cli.js --user-id <better-auth-user-id> --enable
```

Argumentos estrictos: un ID y una acción, no email ni opciones ambiguas. Operación en transacción
bloquea User→Business→Inventory; enable verifica user presente/verified, Business presente/ACTIVE,
exactamente un Inventory. Fallo deja flag sin cambio. Already-enabled valida precondiciones y luego
no-op. Disable requiere identidad/Business presentes, permite unverified/DELETING/sin Inventory;
solo pasa flag a false, preserva datos y sesiones. Already-disabled no-op sin timestamp nuevo.
Actualización efectiva conserva updatedAt >= timestamp anterior. No evento/receipt/purge/revoke.
CLI imprime únicamente resultado genérico, error genérico/exit1 y cierra Pool en finally.
Sin DB URL/email/password/sesión/inventario en stdout/stderr. Sin /admin ni API de habilitación.
Signup/verify/bootstrap nunca habilitan piloto. No entitlement/billing automático.

## Errores y seguridad

Contracts enum añade únicamente cuatro códigos usados, manteniendo los tres anteriores:

| HTTP | Código | Evidencia |
| --- | --- | --- |
| 401 | UNAUTHENTICATED | Sin sesión, fake cookie, expired/revoked |
| 403 | EMAIL_NOT_VERIFIED | Sesión inconsistente no verified |
| 403 | CLOUD_ACCESS_DISABLED | Business disabled/DELETING; bloqueo S |
| 409 | BUSINESS_ALREADY_EXISTS | Payload distinto/reserva/DELETING |
| 404 | NOT_FOUND | Foreign/no Business/Inventory ausente, mismo mensaje sin pertenencia |
| 400 | VALIDATION_ERROR | JSON/schema/query/extra fields/timezone/name/currency |
| 500 | INTERNAL_ERROR | Fallo inesperado DB con mensaje genérico/requestId |

Error OwnershipError privado mapeado en plugin Fastify encapsulado; demás errores pasan al
sanitizador foundation existente. Sin SQL/constraint/table/owner ajeno/stack en HTTP ni logs.
Prueba de tabla inaccesible retorna 500/no-store y /live200 sin console raw. Auth defensas
Origin/CSRF, TTL/cookies, SMTP y delete-user disabled permanecen intactas.
No wildcard origin/cookie cross-domain/secrets reales. Session.userId no cambia al bootstrap.

**Endpoint de mutación de negocio existe localmente; hardening completo /v1 Origin/CSRF/CORS y
rate limits finales siguen CLOUD-05. No despliegue externo autorizado.** JSON-only no sustituye
esas defensas. No token CSRF /v1/session/csrf ni bypass/fake native Origin ni políticas rate nuevas.

## Evidencia PostgreSQL/HTTP y tests

PostgreSQL **18.6 real**, portable temporal local de CLOUD-02, loopback 65432; no servicio Windows
ni PATH/global install. TEST_DATABASE_URL guard disposable existente, sin fallback DATABASE_URL.
Cada suite crea/cierra/elimina DB aleatoria propia. SMTPServer loopback efímero/example.test,
sin correo externo. CI misma versión PostgreSQL y required quality sin skip/continue-on-error.
test:db limita workers a dos para evitar tormenta local de CREATE DATABASE/conexiones;
pruebas de concurrencia funcional siguen enviando operaciones simultáneas dentro de cada suite.
Una primera corrida con workers ilimitados tuvo un timeout de conexión de fixture; corregido
con ese límite sin ampliar timeout runtime ni debilitar test. /live y /health regresiones incluidas.

Compiled HTTP smoke: dist Fastify/auth/ownership → signup A → SMTP local → verify → signin →
/v1/me sin dataset → bootstrap disabled → CLI compilado enable (también no-op) → own Inventory200;
repite B → A/B crossed404 → CLI disable/no-op → S403 → logout401 → cleanup HTTP/SMTP/Pool/DB.
CLI inexistente exit1 probado, output genérico. 2 Business/Inventory, cero productos/ventas/compras.
Suite auth+ownership signup/verify verifica cero Business/Inventory/products/sales/purchases.
Sin import/read SQLite, backup/filesystem inventario ni comunicación Mobile; audit de imports/diff.
No cliente Web/Expo/SecureStore/browser CORS físico; no auth mock como sustituto de PostgreSQL.

| Suite (resultados node:test, incluidos padres/subtests) | PASS |
| --- | ---: |
| Domain | 428 |
| Application | 424 |
| Mobile | 550 |
| Contracts | 8 |
| API sin DB (SMTP separado) | 16 |
| PostgreSQL schema/migrations | 55 |
| Auth | 35 |
| Ownership (incluye compiled smoke y live regression) | 21 |
| SMTP standalone | 2 |
| shared | 0 |
| **Total sin doble contar suites específicas** | **1539** |

pnpm check 1428; test:db 111 = PostgreSQL55 + Auth35 + Ownership21. Suites específicas reejecutan
esos mismos resultados, no se suman otra vez. No cambio en expectativas financieras previas.

| Gate | Resultado local |
| --- | --- |
| install --frozen-lockfile | PASS |
| pnpm check (format/lint/typecheck/tests/build) | PASS |
| build:api | PASS |
| test:db | PASS |
| test:auth regression | PASS |
| test:ownership | PASS |
| empty/valid upgrade/orphan/no-op/FK NO ACTION | PASS |
| Drizzle generate repetido/no cambio | PASS |
| Better Auth generate/schema check | PASS, schema configurado no DB remota |
| UUIDv7/rollback/concurrent bootstrap/A-B | PASS |
| SMTP local y compiled HTTP/operator CLI | PASS |
| /live DB-down y /health404 | PASS |
| git diff --check | PASS |
| CI/GitGuardian/reviews/merge | Estado final verificado en entrega del chat |
| Externo/browser/cliente físico | NOT RUN — fuera del scope |

## Dependencias y alcance documental

Runtime añadido **uuid14.0.1**, pin alineado con Mobile, ya presente en lockfile; Node.randomUUID
solo ofrece v4. Dev añadidas NONE. Unrelated upgraded NONE. Sin cambio de versiones/resoluciones
anteriores ni deps Mobile/Domain/Application. Contracts solo enum de errores usado y regression.
Archivos API: src/ownership/{context,bootstrap,routes,errors,pilot,pilot-cli}, server/runtime,
catalog FK, migration0003/snapshot/journal, scripts API, lockfile, tests ownership/pilot/migrations
y fixture helpers previos adaptados a owner válido. CI gate test:db incluye ownership.
Docs actualizadas: README root; docs/web README/CURRENT_STATE/ARCHITECTURE/AUTH/API/DATA_MODEL/
SECURITY/TESTING/OPERATIONS/DEPLOYMENT/CI_CD/BACKLOG y CLOUD-04. AGENTS/ADRs Accepted intactos.
BACKLOG CLOUD01..04 IMPLEMENTED, restantes43 PLANNED. Blockers locales **NONE**.

Fuentes oficiales revisadas 2026-10-03: [Better Auth sesiones/API server](https://better-auth.com/docs/concepts/session-management),
[Drizzle select/scoping](https://orm.drizzle.team/docs/select), [UUID v7](https://github.com/uuidjs/uuid).
También types/source de Better Auth1.7.7 y Drizzle0.45.2 instalados; no nueva versión/arquitectura.

## Diferimientos y externa

| Responsabilidad | Ticket |
| --- | --- |
| CORS/CSRF /v1, secrets hardening, límites finales | CLOUD-05 |
| Full V1 contracts/OpenAPI/Clock/IDs compartidos | CLOUD-06 |
| Command receipts/idempotency/revisions/ChangeSet | API-01 |
| Import/reserva/chunks/activación | MIG-01 |
| Consentimiento/onboarding Mobile | MIG-02 |
| Sync/dispositivos/outbox/cursor/push/pull/snapshot | SYNC-01..05 |
| Mobile auth/SecureStore | SYNC-06 |
| Web foundation/auth UI | WEB-01/02 |
| Account deletion/orquestación/supresión/FK DeletionRequest | API-10 |
| Readiness/proveedor/deployment | DEV-01..06 |

Railway, Cloudflare, DNS, real SMTP, production DB y production secrets **NOT TOUCHED**.
Mobile/SQLite/Domain/Application sin modificaciones; apps/web no creado. No features financieras,
upload/import/sync/billing/Team. Detener después de merge/main sync y entrega.
