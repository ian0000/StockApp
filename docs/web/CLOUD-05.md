# CLOUD-05 — API Security Hardening

Implementación y validación local/CI, 2026-10-03. Base main
`ba894d656e77932163502e0e082db4faad1ccd68` (CLOUD-04, PR #79).
Branch `feat/cloud-05-security-hardening`; PR hacia main. SHA final, checks y merge se registran
en la entrega después de verificarlos. Este reporte no certifica infraestructura desplegada.

## Alcance y dependencias

Solo apps/api, errores base usados de contracts, migración PostgreSQL, tests, CI y documentación.
Runtime añadido: `@fastify/cors` **11.3.0**, versión exacta compatible con Fastify **5.12.5**.
Resuelve CORS/preflight con plugin oficial; no se implementa un protocolo CORS manual.
Dev dependencies añadidas: ninguna. Upgrades ajenos: ninguno.
Better Auth/Expo/Drizzle adapter **1.7.7**, ORM **0.45.2**, Kit **0.31.10** sin cambio.
Node **22.16.0**, pnpm **11.0.9**, PostgreSQL **18.6** real local y CI.
Node crypto cubre CSRF/HMAC; sin SDK rate-limit, Redis, CAPTCHA ni JWT propio.

## CORS

| Configuración | Valor |
| --- | --- |
| Origin fuente | APP_ORIGIN validado por configuración existente |
| Matching | Array de un string exacto; sin regex/substring/suffix |
| Credentials | true |
| Métodos | GET, POST, PATCH, PUT, DELETE, OPTIONS; HEAD no habilitado |
| Allowed headers | Content-Type, X-CSRF-Token, Idempotency-Key |
| Exposed headers | X-Request-Id, Retry-After, X-Retry-After |
| Vary | Origin |
| Preflight | strictPreflight=true, preflightContinue=false, válido204 |
| Wildcard / arbitrary reflection / pages.dev wildcard | NO / NO / NO |

El plugin devuelve ACAO exactamente APP_ORIGIN cuando coincide. Authorization/Set-Cookie/internal
headers no se exponen. Idempotency-Key es permiso de transporte, no implementación de receipts.
OPTIONS válido para auth/business no requiere cookie/token, no consulta sesión/ownership, no
consume rate ni crea datos. OPTIONS /v1 sin Origin/método requerido devuelve400 sanitizado.
Origin hostil no obtiene autorización CORS. No se autoriza ian-k.dev ni previews arbitrarios.

## Origin y transporte

Para /v1, Origin presente debe coincidir exactamente con APP_ORIGIN antes de consultas DB.
Allowed200/201; evil/sibling/null/otro puerto/path/subdominio/suffix spoof403 ORIGIN_NOT_ALLOWED.
Origin ausente permite cliente nativo/server con sesión válida y CSRF en mutaciones.
Auth mantiene trustedOrigins API/Web/native y defensas Origin/CSRF oficiales; el token /v1
no se aplica a auth. No exp:// implícito ni bypass X-Mobile.

Global body limit **1048576 bytes (1 MiB)**; POST /v1/business **32768 bytes (32 KiB)**.
Oversize413 PAYLOAD_TOO_LARGE antes de handlers/counters/writes/session side effects.
POST/PATCH/PUT /v1 exige application/json, permite parámetros como charset=utf-8;
text/plain/form/multipart415 UNSUPPORTED_MEDIA_TYPE. Auth conserva su contrato de transporte.
additionalProperties=false y removeAdditional/coerceTypes=false conservados.
X-User-Id/X-Business-Id/X-Inventory-Id/X-Role/X-Admin/X-Mobile no conceden autoridad.
X-Content-Type-Options nosniff y Referrer-Policy no-referrer. No HSTS ni CSP server especulativo.
Cache-Control no-store global en auth y /v1, incluidos parser/security/validation/404/500.

## CSRF

GET **/v1/session/csrf** devuelve `{token:string}` solo con sesión oficial verified válida.
Token opaco HMAC-SHA256, **43 caracteres base64url**, ligado a **session.id**, sin incluir
session.token, email, password, User ID ni credenciales. No es bearer/auth JWT.
Clave derivada con dominio `stockapp:csrf-key:v1`; MAC tiene dominio de sesión/versionado separado.
Formato/longitud acotados y comparación Node timingSafeEqual. No paquete crypto adicional.
Misma sesión: reutilizable/estable. Mismo User con nueva sesión: token diferente.
Otra sesión/User:403 CSRF_TOKEN_INVALID. Sin cookie válida:401 UNAUTHENTICATED.
Expiración/logout/reset/revoke: lookup oficial DB invalida sesión antes de validar el MAC.
No devuelve expected MAC/session ID/causa criptográfica.

POST business exige sesión verified + valid Origin si presente + token + JSON + reglas bootstrap.
GET me/Inventory/csrf no exige CSRF. Orden real:
Origin/transport → parse/schema → sesión verified → rate user → CSRF mutación → bootstrap/ownership.
Validación de body/query puede producir400 antes de sesión; nunca escribe datos.
El ejemplo CSRF+IDOR del ticket se verifica con mutación **solo en app aislada de test**, usando
el mismo authorizeBusinessRequest y resolver owner: valid A token + Inventory B404, invalid token403.
GET Inventory mantiene su contrato sin CSRF y su A→B404; no se publica un comando financiero futuro.

## Rate limiting durable

Una tabla propia **security_rate_limits**: scope, key_hash, count, expires_at.
PK(scope,key_hash), índice expiry, checks count positivo y hash hexadecimal64.
Keys HMAC-SHA256 con clave derivada `stockapp:rate-key:v1`, separada de CSRF; entrada JSON
incluye scope y key. No raw key/email/IP/User/session/password en esta tabla.
No SHA de email susceptible a diccionario sin secret. No FK hacia User ni datos comerciales.
La tabla oficial Session conserva su schema de Better Auth; esta regla de privacy aplica al rate store.

Consume: **un INSERT ON CONFLICT DO UPDATE RETURNING** atómico. Conflicto de PK serializa solicitudes
concurrentes en PostgreSQL. No read-decide-write separado, Map memory ni contador por proceso.
Ventana fija empieza con primer intento: expiry=now+window. Denegaciones no extienden ventana;
count satura en max+1 para evitar overflow. Expiry resetea el mismo row, sin crear uno por request.
Retry restante ceil(segundos), mínimo1. Clock de seguridad inyectable para tests, Date.now en runtime;
no altera clock Domain/Application ni TTL auth. Instancias deben tener relojes operativos sincronizados.
Mismo DB/secret conserva buckets al reiniciar y los comparte entre instancias.

| Scope | Key antes del HMAC | Límite |
| --- | --- | --- |
| auth-login-email | email trim+lowercase | 5 / 60s |
| auth-reset-email | email trim+lowercase | 3 / 3600s |
| auth-sensitive-ip | Fastify socket IP | 30 / 60s agregado |
| auth-path-ip | key IP/path oficial Better Auth | 30 / 60s por path |
| business-read-user | User ID de sesión oficial | 120 / 60s compartido GET me/Inventory/csrf |
| business-command-user | User ID de sesión oficial | 60 / 60s POST business |

Normalización email no aplica canonicalización Gmail/dots/plus. Cuenta existente y ausente
consumen igual; respuesta pública equivalente. Éxito no borra intentos. IP sensible agrega
sign-in/email, sign-up/email, request-password-reset, send-verification-email y reset-password.
Aliases con trailing slash/percent encoding pasan por matching normalizado del bridge.
Tras denegación IP no se crean buckets email nuevos para esa solicitud.
Auth limita intentos de entrada; esquema/parsing de Fastify sucede antes. Business cuenta peticiones
que llegan al helper con sesión verified, incluyendo CSRF/ownership/dominio rechazados.
Schema/transport/Origin/anonymous/preflight no consumen buckets business.
Fallo del rate store: **fail closed**,500 genérico sin ejecutar auth ni mutación business.

## Better Auth e IP trust

Integración oficial **rateLimit.customStorage.consume(key,rule)** de Better Auth1.7.7,
enabled=true también fuera de production. Reglas sensibles explícitas reemplazan builtin3/10s;
el patrón simple `*` no cubre segmentos slash en esta versión y no se usa como override.
Server-side auth.api.getSession conserva su comportamiento oficial, sin rate HTTP interno;
las lecturas business tienen su propio bucket user.
429 auth conserva respuesta pública compatible con librería y **X-Retry-After**;429 business
RATE_LIMITED envelope + **Retry-After**. Ambos headers quedan expuestos a APP_ORIGIN.

Fastify **trustProxy=false** explícito. Fuente: **request.ip del socket**.
Bridge sobrescribe **x-stockapp-client-ip** con esa IP antes de construir Request hacia Better Auth;
advanced.ipAddress.ipAddressHeaders acepta solo ese nombre. Header interno enviado por cliente,
X-Forwarded-For/CF-Connecting-IP no son autoridad. BaseURL auth fija, no Host/forwarded host.
Better Auth aplica su normalización IP oficial (incluida IPv6); el scope agregado usa socket IP.
Railway proxy NO configurado. DEV-01/DEV-04 deben verificar emisor/CIDR/topología real antes
de habilitar forwarded trust. Detrás de proxy el límite socket puede agrupar usuarios.

## Migración y mantenimiento

Nueva **0004_security_hardening.sql** y snapshot/journal generados por Drizzle Kit0.31.10.
Solo añade security_rate_limits. 19 tablas y5 migraciones en latest.
0000–0003 SQL/snapshots intactos. User/Session/Account/Verification intactos y generador oficial
reproducible. No DROP/rename de tablas productivas ni manipulación del histórico financiero.
Empty→latest, CLOUD-04 fixture→latest, preservación auth/session/owner/Inventory y rerun no-op probados.
Migración explícita antes de tráfico auth/business; servidor no automigra.
Expired rows se reutilizan; keys inactivas requieren mantenimiento periódico **DEV-05** antes
de producción. Índice expiry permite purgar expiradas antiguas (>24h, ventana actual máxima1h),
query documentada en DEPLOYMENT. No scheduler/provider/job creado ni purga externa ejecutada.
Secret compartido estable; rotarlo cambia CSRF/keys y requiere plan operativo, fuera de este ticket.

## Errores y secretos

| Error / status | Comportamiento |
| --- | --- |
| RATE_LIMITED /429 | Envelope business + Retry-After, sin key/hash/count/IP |
| CSRF_TOKEN_INVALID /403 | Mensaje simple, sin token esperado/session ID |
| ORIGIN_NOT_ALLOWED /403 | No reflejar Origin ni allowlist |
| PAYLOAD_TOO_LARGE /413 | Sanitizado antes de handler |
| UNSUPPORTED_MEDIA_TYPE /415 | JSON requerido en comandos /v1 |
| INTERNAL_ERROR /500 | Sin SQL/stack/credentials; auth usa contrato genérico propio |

X-Request-Id siempre servidor; errors business incluyen mismo requestId. En auth se preserva
contrato oficial, incluyendo errores normales; no se convierte a envelope comercial.
Fastify serializers no registran URL/query/body/headers/raw error; redaction adicional defensiva.
Better Auth logger deshabilitado y onAPIError sanitiza unexpected; bridge catch no imprime error.
SMTP conserva logger/debug/file/url access off y sanitizer callback; startup mensajes genéricos.

| Valor | Registrado en logs/errores públicos |
| --- | --- |
| DATABASE_URL | NO |
| BETTER_AUTH_SECRET | NO |
| SMTP_PASSWORD | NO |
| password/newPassword | NO |
| cookie/session token | NO |
| CSRF token | NO |
| verification/reset token | NO |

Canaries ficticios comprobados, sin secretos reales ni provider credentials.

## Pruebas y evidencia

CORS exact/credentials/Vary/header allowlist, preflight sin cookie/CSRF/DB/counters;
evil/sibling/null/preview/suffix, native sin Origin. CSRF opaque/same-session/cross-session/cross-user,
anonymous/expired/logout/reset, invalid token sin writes. JSON charset/plain/form/multipart/body limits.
Schema/mass assignment/ID spoof/A-B isolation conservados; todos los datasets bootstrap permanecen vacíos.
Login5/email y reset3/h/email existente/ausente, normalize, no reset-on-success; IP30 spoof-resistant,
IP/path oficial30, user120/60, Retry-After/no-store/requestId y expiry sin sleeps prolongados.
Reinicio app/auth real con mismo DB/secret; dos instancias con **pools independientes**.
80 reads antes del restart,80 concurrentes después: exactamente40 accepted y40 denied.
100 consume simultáneos max5: exactamente5 accepted y95 denied. Harness de estrés usa espera
de adquisición de pool10s; el runtime productivo conserva su policy2s. Pools arrancados antes de carga.
HTTP auth concurrente entre instancias: login5, reset3 e IP sensible30 exactos.
Rate store ausente falla cerrado500; /live200 y /health404, preflight/Origin funcionan DB-down.

Compiled API + PostgreSQL disposable + SMTP local: signup A/B→verify→signin→bootstrap sin CSRF403→
GET token→valid CSRF/Origin201→pilot CLI→own200→foreign404→evil/wrong-CSRF403→auth429→
logout→cookie/CSRF antiguo401→resources cerrados. Cookies Secure/HttpOnly/Lax/host-only conservadas
y probadas en suite auth HTTPS; HTTP local no finge Secure. Sin email/network externo.

Security está en **pnpm test:db** y required **Quality checks** con PostgreSQL18.6.
Sin skip/optional/continue-on-error. Suites específicas son subconjuntos, no se suman otra vez.
Regresiones auth anteriores usan clock rate en ventanas separadas; nuevos security tests usan
clock fijo/avances explícitos para verificar umbrales reales, sin alterar TTL de sesiones/reset/verify.
Apps/pools/SMTP locales cerrados, cero DB disposable restantes y cluster portátil detenido al finalizar.

### Conteos finales locales

| Suite | Resultados PASS |
| --- | ---: |
| Domain | 428 |
| Application | 424 |
| Mobile | 550 |
| Contracts | 8 |
| API foundation/config | 16 |
| PostgreSQL | 55 |
| Auth | 35 |
| Ownership (incluye compiled HTTP + SMTP) | 21 |
| SMTP standalone | 2 |
| Security | 37 |
| **Total único** | **1576** |

pnpm check:1428; pnpm test:db:148 (55+35+21+37). Shared sin tests,0.
Sin failures/skips/cancelled. Suite security específica37 PASS, no sumada dos veces.

### Quality gates

| Gate | Evidencia local |
| --- | --- |
| pnpm install --frozen-lockfile | PASS, lockfile sin resolución adicional |
| pnpm check | PASS: formato/lint/types/tests/build de todo workspace |
| pnpm build:api | PASS, NodeNext/contracts + API compilados |
| pnpm test:db | PASS,148 resultados PostgreSQL18.6 real |
| Auth / ownership / SMTP regressions | PASS,35/21/2 en gates anteriores |
| test:security; CORS/CSRF/rate/Origin | PASS,37 resultados, también required DB gate |
| Empty→latest; CLOUD-04→latest; no-op | PASS, fixtures reales/preservación/no destructive migration |
| Drizzle db:generate | PASS, no schema changes tras0004 |
| Official auth:generate / auth:check | PASS, schema auth sin diff y check contra Drizzle |
| Compiled HTTP security smoke | PASS, PostgreSQL+SMTP local+dist API/CLI, incluyendo429 business helper |
| /live DB-down / /health404 | PASS, incluidos preflight/Origin sin DB |
| git diff --check | PASS |

Generadores SQL/snapshots0000–0003/auth schema intactos. Diff revisado: solo alcance del ticket.
CI/GitGuardian/reviews/reglas se verifican sobre head exacto antes de merge, sin bypass;
resultado externo/PR/head/merge/main clean0/0 se registra en la entrega final.
Bloqueos funcionales locales: **NONE**. No aceptación de producción inferida de estas pruebas.

## Rutas, infraestructura y diferimientos

/live200; /health404. /api/auth/* contrato oficial + CORS/durable rate. /v1/session/csrf nuevo.
/v1/me metadata, POST business bootstrap vacío, GET Inventory own/pilot, ahora endurecidos.
Products/sales/purchases/sync/import/history/deletion HTTP/admin: ausentes.
No cambios apps/mobile, packages/domain/application ni ian-k.dev; no apps/web.
No Railway/DB Railway/Cloudflare/DNS/TLS/SMTP real/secrets/proxy producción: **NOT TOUCHED**.
DEV-01/DEV-04 proxy/TLS/HSTS/WAF; WEB-01 CSP; DEV-05 monitoring/cleanup; API-02..10/QA-01
future endpoint security; SYNC-02 abuse; MIG-01 file/chunk limits; SYNC-06 Mobile auth/CSRF;
WEB-02 cliente Web; CLOUD-06 OpenAPI/contracts freeze. Todos separados y no iniciados.
BACKLOG CLOUD-01..05 IMPLEMENTED; CLOUD-06+ PLANNED. STOP tras merge/main clean0/0.

## Fuentes oficiales consultadas

[Fastify CORS](https://github.com/fastify/fastify-cors): compatibilidad11/Fastify5 y opciones exactas.
[Fastify server](https://fastify.dev/docs/latest/Reference/Server/): bodyLimit/trustProxy.
[Better Auth rate limits](https://better-auth.com/docs/concepts/rate-limit): consume atómico,
custom rules/IP derivation/X-Retry-After. [Opciones](https://better-auth.com/docs/reference/options)
y [seguridad](https://better-auth.com/docs/reference/security): defensas auth/cookies.
Código instalado Better Auth1.7.7 cotejado para normalización de path y customStorage.consume.
