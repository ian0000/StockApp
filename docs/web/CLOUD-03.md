# CLOUD-03 — Better Auth + Email/Password + Sessions + SMTP

Implementación/QA local · 2026-10-03 (America/Guayaquil).
Base main `a43b327fa177fc7f135370e85affb75a8841eec5` (CLOUD-02, PR #77).
Rama `feat/cloud-03-better-auth`. Commit/head/PR/checks/merge/main final se verifican en entrega
del chat; no registrar aquí hashes aún inexistentes. PR y merge autorizados después de checks/reviews
verdes, sin auto-merge anticipado, force ni bypass. STOP después de main clean 0/0; CLOUD-04 no autorizado.

## Versiones y referencias revisadas

Versión estable elegida: **1.7.7**, comprobada contra documentación oficial y metadatos npm.
Node local/CI 22.16.0, pnpm 11.0.9, Fastify 5.12.5, Drizzle 0.45.2/kit 0.31.10, pg 8.23.1,
PostgreSQL 18.6 y TS 5.9.3 conservados. No incompatibilidad detectada en server build/typecheck/HTTP.

| API dependency | Pin | Uso / justificación |
| --- | --- | --- |
| better-auth | 1.7.7 | Runtime identidad, hashing, verify/reset y sesiones DB oficiales |
| @better-auth/drizzle-adapter | 1.7.7 | Runtime adapter Drizzle oficial separado en esta versión |
| @better-auth/expo | 1.7.7 | Runtime plugin server oficial, sin importar cliente/runtime Expo |
| nodemailer | 10.0.14 | Runtime SMTP estándar; Node/Fastify no traen cliente SMTP completo |
| auth | 1.7.7 | Dev-only CLI oficial actual, genera/verifica schema; no CLI legacy ni npx latest |
| smtp-server | 3.19.16 | Dev-only servidor SMTP efímero que prueba protocolo/adapter sin proveedor externo |
| @types/nodemailer | 8.0.2 | Dev-only tipos para adapter SMTP; versión disponible compatible con build |
| @types/smtp-server | 3.5.13 | Dev-only tipos para servidor de prueba |

Todos pin exactos en apps/api/package.json y lockfile. No deps nuevas en Mobile/Domain/Application/
Contracts. Las 950 resoluciones anteriores del lockfile siguen presentes: 1021 ahora, 71 nuevas
necesarias por estos paquetes. Reindexación de peers jiti/ESLint y kysely/Drizzle, sin upgrade de
versiones de dependencias previas ni cambios funcionales Mobile. Frozen install reproduce el lock.

Consultado 2026-10-03:
[installation](https://better-auth.com/docs/installation),
[email/password y verificación](https://better-auth.com/docs/authentication/email-password),
[email](https://better-auth.com/docs/concepts/email),
[sessions](https://better-auth.com/docs/concepts/session-management),
[cookies](https://better-auth.com/docs/concepts/cookies),
[Drizzle adapter](https://better-auth.com/docs/adapters/drizzle),
[CLI](https://better-auth.com/docs/concepts/cli),
[Fastify](https://better-auth.com/docs/integrations/fastify),
[Expo](https://better-auth.com/docs/integrations/expo),
[security](https://better-auth.com/docs/reference/security),
[options/onAPIError](https://better-auth.com/docs/reference/options),
[Nodemailer SMTP](https://nodemailer.com/smtp) y
[SMTPServer](https://nodemailer.com/extras/smtp-server).
Fuente ejecutada complementaria: entrypoints/type declarations oficiales de los paquetes instalados.
No ADR Accepted cambiado ni stack reemplazado; diferencias concretas frente a ejemplos baseline:
CLI `auth`, adapter separado, verify-email GET y callback reset GET oficiales.

## Composición, configuración y ejecución

Factory createAuth(database/emailSender/config) en apps/api/src/auth/create-auth.ts, sin globals
de aplicación, Pool/SMTP al importar, singleton ni DI framework. readAuthConfig/readSmtpConfig validan
env explícita. createAuthRuntime compone recursos lazy; registerAuthRoutes monta handler Web Request
oficial bajo /api/auth en la misma foundation Fastify. El bridge usa AUTH_BASE_URL, nunca Host externo,
preserva status/headers/cuerpo/Set-Cookie múltiples, x-request-id servidor y no-store.
Contrato auth separado: no wrappers para errores normales de Better Auth ni DTOs manuales en contracts.
JSON malformado en parser Fastify conserva su envelope foundation. Excepciones inesperadas/5xx auth
son genéricas sin stack/SQL. Logger Better Auth disabled y onAPIError oficial impiden fallback raw
console.error de better-call; logs Fastify existentes siguen sin URL/query/header/body.

buildApp() sigue foundation-only sin DB/auth/SMTP. startServer solo compone auth si AUTH_BASE_URL
está configurado; entonces exige env completa. No leer .env automáticamente ni automigrar HTTP.
Sin auth config: /live 200, auth ausente, /health 404. Con auth/DB fallando: /live también 200.
Cierre HTTP drena correos, cierra transport/pool. Pool no conecta antes del primer uso auth.
No cache/queue durable, broker, jobs ni nuevos procesos de producción.

| Config real | Política |
| --- | --- |
| BETTER_AUTH_SECRET | Obligatorio >=32 caracteres, sin default; tests/CLI solo valores inequívocamente ficticios |
| AUTH_BASE_URL | API origin explícito, sin userinfo/path/query/hash/wildcard; HTTPS, HTTP loopback solo no-production |
| APP_ORIGIN | Un origin app explícito con mismas restricciones; no wildcard Pages/preview |
| NODE_ENV | production en despliegue futuro; habilita defaults rate limit productivos de Better Auth |
| BETTER_AUTH_TRUSTED_ORIGINS | No soportado: runtime rechaza valor para impedir el env magic adicional de librería |
| SMTP_HOST/PORT/FROM | Explícitos; puerto 1–65535; FROM una dirección bare, sin CRLF |
| SMTP_USER/PASSWORD | Ambos o ninguno según relay; nunca hardcodeados/loggeados |
| SMTP_SECURITY | tls = TLS inmediato; starttls = upgrade obligatorio; local = solo loopback no-production |

TLS verifica certificados/min TLS1.2; no rejectUnauthorized=false. Nodemailer logger/debug desactivados,
sin filesystem/URL access de contenido, timeouts acotados. Solo correos de verify/reset en texto simple,
con propósito/link/expiración; sin password/session token/inventario. EmailSender.send separa protocolo
de auth. Callbacks encolan sin esperar SMTP en response público, con drain explícito antes de cerrar.
Fallo envío registra código estático AUTH_EMAIL_FAILED, sin dirección/link/credenciales/error raw.
Envío en memoria no garantiza entrega ni retry tras crash; no afirmar SMTP externo validado.
.env.example solo nombres vacíos/comentarios. No .env real ni nuevas credenciales/secrets CI.

```sh
pnpm install --frozen-lockfile
pnpm --filter @stock-app/api auth:generate
pnpm --filter @stock-app/api auth:check
pnpm --filter @stock-app/api db:generate
# DATABASE_URL explícita al destino autorizado, migrations antes de habilitar auth
pnpm --filter @stock-app/api db:migrate
pnpm build:api
# Runtime auth usa las variables listadas arriba; sin AUTH_BASE_URL, foundation-only
pnpm --filter @stock-app/api start
# TEST_DATABASE_URL solo DB local disposable stockapp_test, no fallback a DATABASE_URL
pnpm --filter @stock-app/api test:auth
pnpm test:db
pnpm check
git diff --check
```

## Schema y migraciones

CLI oficial:
`auth generate --config src/auth/schema-config.ts --output src/infrastructure/postgres/auth-schema.ts --adapter drizzle --dialect postgresql --yes`.
Script auth:generate aplica después el formato Prettier existente, única normalización del output.
schema-config es CLI-only ficticio/offline, Pool lazy sin conexión/SMTP externo; misma factory/opciones
de auth que runtime. No tablas escritas de memoria ni better-auth migrate/drizzle-kit push.
auth:check ejecuta `auth check schema --config src/auth/schema-config.ts`: **PASS** contra schema
Drizzle configurado, no prueba que una DB remota esté migrada. La prueba real es migración + auth PostgreSQL.

auth-schema.ts reexportado desde schema.ts, generador produce exactamente:

| Tabla | Propósito |
| --- | --- |
| user | ID text opaco, email unique, email_verified false, name/image y fechas |
| session | Token opaco unique, expiración/fechas/User FK, IP/userAgent propios de librería |
| account | Credencial/password y campos requeridos, incluidos OAuth aunque no habilitado |
| verification | Reset identifier/value/expiración/fechas; verificación email firmada no usa esta fila |

Migración nueva **0002_auth_identity.sql**, snapshot 0002 y journal aditivo; cuatro tablas, tres índices,
dos FKs auth User→Account/Session con cascada oficial. No cascadas en ledger ni nuevos campos arbitrarios.
Fechas auth timestamp sin zona según output oficial; Pool usa UTC. No forzar IDs comerciales UUIDv7.
0000_core_inventory/0001_delivery_metadata y snapshots previos intactos. Tres migrations ahora.
Empty→latest: 18 tablas exactas. CLOUD-02→latest: fixture Business/Inventory/Product/State preservado
incluye money safe max, revision >JS-safe, stock negativo, costo null y archivado; auth vacío, sin owner FK.
Core→latest conserva prueba anterior de SaleItem/VOIDED/costo cero. Segundo migrate no-op/mismo journal.
Generate repetido auth: mismo hash; Drizzle: sin cambio/nueva migration inesperada.
Business.ownerUserId NOT NULL/UNIQUE/SIN FK sigue CLOUD-04. DeletionRequest FK/lifecycle CLOUD-04/API-10.

## Identidad, verificación y reset

Signup crea solo User/Account no verificado; token null/no cookie/no Business/Inventory/cloudAccess.
Email/password únicamente; password **min 8/max 128**, sin regex extrema ni hashing propio.
Password almacenado distinto de plaintext, hash/prefix no asumidos. Duplicate signup conserva shape
genérico/identidad sintética de Better Auth, sin duplicar fila; invalid email/password rechazados.
Wrong/missing signin comparten 401/cuerpo; usuario no verificado 403/no sesión.

Verificación sendOnSignUp=true, sendOnSignIn=false, resend oficial; **TTL 24h = 86400s**.
Token firmado de email propiedad de Better Auth; no JWT de sesiones ni crypto paralelo.
GET verify-email sin callback devuelve status=true/user=null; con callback redirige 302 (enlace default
callback /). Confirma emailVerified sin iniciar sesión. Expirado rechazado y no verifica (test TTL acotada
1s/espera 2.1s, runtime siempre 86400s). Reuso válido **idempotente**, no one-time en 1.7.7:
segunda confirmación no cambia User ni crea sesión. Ticket solo exige one-time si contrato lo define.

Reset **TTL 30min = 1800s**, verification DB y consumo oficial de un uso. Request existing/missing
comparte HTTP200/cuerpo; falta identidad no envía correo. Callback GET oficial valida destino/expiración
y redirige con token; POST reset cambia password, revoca **todas** las sesiones. Dos sesiones anteriores
invalidadas inmediatamente; viejo password 401, nuevo funciona, reuso/expirado 400 sin cambio indebido.
Redirect externo hostil rechazado en request/send/verify/reset callback. No custom endpoints/aliases.

## Sesiones, cookies y revocación

Database-backed/opaque/revocable; token no JWT/user JSON. **TTL 7d absoluto = 604800s**,
disableSessionRefresh=true, freshAge=300, cookieCache.enabled=false. Test DB compara expiresAt/updatedAt
antes/después con sesión de tres días de edad, sin extender; expirado/revocado con cookie válida da null.
Cookie material de sesión de librería, no session_data cache/localStorage/custom access-refresh.
HttpOnly **YES**, Secure HTTPS/prod **YES**, SameSite **Lax**, Path **/**, Domain **NONE/host-only**,
crossSubDomainCookies **DISABLED**. Cookie producción inspeccionada con configuración HTTPS explícita;
HTTP localhost solo para desarrollo/test. No E2E físico de cookies entre browsers aún.
Sign-out revoca actual/limpia cookie y conserva otra; revoke-session elimina seleccionada;
revoke-other-sessions conserva actual; revoke-sessions elimina todas. Reset también todas.
Listado/lookup oficiales en PostgreSQL real; cache deshabilitada demuestra efecto inmediato.

## Expo y defensas propias

Plugin oficial Expo 1.7.7 server, transport/callback hooks delegados. Su init público envuelto para
eliminar exp:// adicional de desarrollo, manteniendo exclusivamente origins configurados y
**inventory-app://** (scheme actual app.json). No copia de internals ni plugin crypto propio.
Origin/expo-origin presentes deben ser exactos; plugin oficial transforma expo-origin al Origin
cuando corresponde. Cookie válida sigue obligatoria; origin solo no da sesión. Callback nativo
inventory-app://reset permitido; other-app/host externo/exp:// implícito rechazados.
disableOriginCheck=false/disableCSRFCheck=false explícitos, incluso NODE_ENV test; pruebas hostile
Origin/Referer/Fetch Metadata/redirect PASS. Trusted origins **no son CORS**; no dependencia CORS nueva.
Defaults rate limit sin override ni desactivación: Better Auth los activa por defecto en producción,
memory en esta foundation. Límites durables/por email y política SECURITY final siguen CLOUD-05.

Peer dependencies oficiales Expo opcionales: linking>=7, constants>=17, network>=8.0.7,
web-browser>=14, secure-store>=12.5. SDK57 actual linking57.0.11/constants57.0.20 satisface rangos;
entrypoint server no importa módulos Expo runtime. Paquete declara dev examples SDK56, lo que no
certifica cliente57 físico. Build/typecheck/server transport PASS; integración cliente57 física
**NOT RUN — SYNC-06**. Mobile código/package/schema/tests sin cambios; SecureStore **NO instalado**,
auth client/screens/session persistence/sync **NO implementados**.
DeleteUser.enabled=false y rutas delete-user/callback deshabilitadas, sin bypass destructivo;
profile/change-email/change-password/update-session/proxy Expo/social signin deshabilitados.
No OAuth providers, roles, organizations, magiclink/OTP/passkey/2FA.

## Rutas reales

Tabla detallada en [API](API.md), todas bajo /api/auth:
POST sign-up/email, sign-in/email, sign-out, send-verification-email, request-password-reset,
reset-password, revoke-session, revoke-other-sessions, revoke-sessions;
GET get-session, verify-email, reset-password/:token, list-sessions y auxiliares oficiales ok/error.
Callbacks OAuth internos sin proveedores habilitados no son capacidad OAuth utilizable.
Contratos/status/callbacks de esta versión documentados, sin OpenAPI auth manual/DTO duplicados.
GET /live **200** sin DB/auth/SMTP; /health **404**; /v1 me/business/products/sales/purchases/history/
sync/session-csrf **NONE/404**. No auth implica ownership ni cloudAccess enforcement.

## QA, CI y conteo

PostgreSQL real **18.6**, mismo cluster portable temporal local de CLOUD-02, bind loopback/65432,
sin servicio Windows/global PATH/DB externa. Cada suite crea DB stockapp_test_<random>, migra,
cierra Pool y elimina solo esa DB. TEST_DATABASE_URL guard existente, sin fallback production.
SMTPServer loopback/puerto efímero, destinatarios example.test; sin entrega externa. Cierra servidor
y transport en cleanup. Test adicional exige STARTTLS contra relay sin TLS: falla sin entregar nada.
Smoke real con módulos **dist** compilados, Pool real y runtime SMTP: signup→captura SMTP→verify→
signin→get-session→signout→cookie inválida; requestId, /live200 y /health404; HTTP/Pool/SMTP cerrados.

| Suite, sin doble contar smoke | Tests PASS |
| --- | ---: |
| Domain | 428 |
| Application | 424 |
| Mobile | 550 |
| Contracts | 7 |
| API sin DB (sin SMTP separado abajo) | 15 |
| PostgreSQL schema/migrations | 52 |
| Auth (incluye HTTP compilado auth/SMTP y foundation-only) | 35 |
| SMTP adapter standalone | 2 |
| shared | 0 |
| **Total** | **1513** |

pnpm check: 1426 resultados; test:db: 87 = PostgreSQL52 + Auth35. test:auth ejecuta los mismos35,
no sumar nuevamente. Node:test cuenta tests padre/subtests; no son 1513 flujos E2E distintos.

| Gate | Resultado |
| --- | --- |
| frozen install | PASS |
| pnpm check (format/lint/types/tests/build) | PASS |
| build:api | PASS |
| test:db PostgreSQL + auth | PASS |
| test:auth específico | PASS |
| SMTP local/required STARTTLS fail-closed | PASS |
| auth generate repetido + hash igual | PASS |
| auth check schema configurado | PASS, no DB remoto |
| Drizzle generate repetido | PASS, no cambios/nueva migration |
| empty/upgrade CLOUD-02/core/no-op | PASS |
| HTTP compilado auth + SMTP local | PASS |
| /live sin DB/config y /health404 | PASS |
| redacción HTTP/logs + console sin errores raw | PASS |
| git diff --check | PASS |
| SMTP externo/TLS provider/browser físico/cliente Expo | NOT RUN — fuera de scope |
| GitHub CI/GitGuardian/reviews/merge | Estado final verificable en entrega del chat |

CI conserva required quality con PostgreSQL18.6, añade auth:generate sin diff/auth:check y test:db
ampliado auth/compiled smoke. SMTP adapter entra en check, sin credentials/service externo adicional.
Missing config/DB/migration/auth/SMTP tests falla el job; sin optional/skip/continue-on-error.

Observaciones corregidas durante QA: fixture inicial asumía verify HTTP200 y User JSON; contrato real
con callback es302 y sin callback status=true/user=null. Se ajustó fixture tras leer fuente1.7.7 y
comprobar estado DB, sin cambiar reglas para pasar. Fallo DB reveló raw console.error de better-call;
se resolvió con onAPIError oficial/APIError genérico y prueba console mock de cero llamadas.
Published SQL intacto; no expected financiero modificado ni protecciones deshabilitadas.

## Scope, seguridad y diferimientos

YES: Better Auth, schema PostgreSQL auth, email/password, verify, reset, sesiones DB/revoke,
SMTP capability y compatibilidad Expo **server-side**.
NO: Business ownership/Inventory authorization/cloudAccess (CLOUD-04), CORS completo/CSRF /v1/
rate final (CLOUD-05), auth DTO/OpenAPI negocio (CLOUD-06), Mobile/SecureStore (SYNC-06), Web login
(WEB-02), account deletion orquestada (API-10). Sin cloudAccess automático, datos/upload/onboarding.
Railway/Cloudflare/DNS/production DB/real SMTP/production secrets **NOT TOUCHED/NONE**.
Password/Authorization/Cookie/Set-Cookie/session/verify/reset token/secret/SMTP credentials en logs
**NO**, raw SQL/stack HTTP **NO**, secret real comprometido **NO**, wildcard/cross-domain cookie **NO**,
delete-user bypass **NO**, custom JWT auth/localStorage **NO**, Business auto-created **NO**.
No claims de release/provider delivery/cumplimiento ni nueva regla financiera. Blockers locales **NONE**.

Archivos: API src/auth (config/create-auth/email/routes/runtime/schema-config), auth-schema.ts/reexport,
server.ts, .env.example, package.json; migration0002/snapshot/journal; auth-config/smtp tests, helpers SMTP,
auth fixtures/identity-sessions/password-reset/policy/compiled-http; migrations upgrade test actualizado.
Tooling: CI y lockfile. Docs: READMEroot, docs/web README/CURRENT_STATE/ARCHITECTURE/AUTH/API/DATA_MODEL/
SECURITY/TESTING/DEPLOYMENT/CI_CD/BACKLOG y este reporte. Sin AGENTS/ADRs/otros paquetes modificados.
BACKLOG: CLOUD-01/02/03 IMPLEMENTED, otros44 PLANNED. Detener después de merge/main sync.
