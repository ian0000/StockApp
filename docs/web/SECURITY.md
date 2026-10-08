# Seguridad y threat model

API-10 mantiene CSRF/Origin/rate/JSON/no-store/requestId y A/B. Acceptance tx: User lock, Business NO KEY UPDATE compatible con FKs, Inventory FOR UPDATE, DELETING/flagfalse, todas las sesiones eliminadas y job durable. Clave server-only DELETION_SUPPRESSION_SECRET separada de auth; ningún ID/key/email/dataset/progreso sensible en logs/HTTP. [Detalle](API-10.md).

API-09 backup/export: sesión oficial verified/reciente, SESSION_NOT_FRESH403 inclusivo,
Origin y bucket durable read120/60 compartido; JSON private/no-store/requestId. Sin contenido,
PII o credenciales en logs. Ownership en snapshot y relectura actual antes de liberar bytes,
DELETING403 y account portability ACTIVE sin flag piloto. Sin export cap artificial; riesgo
de materialización V1 pendiente de hardening medido. [Detalle](API-09.md).

API-01 añade GET receipt con autorización/read limit/CORS/Origin/no-store/requestId existentes.
Pruebas A/B incluyen Inventory v4/operation v7 y JSONB corrupto500 sanitizado; no payload/hash en logs.
Motor revalida owner/verified/ACTIVE/flag tras lock Inventory, queries scoped, refs/ChangeSets allowlist.
Concurrencia/replay/rollback probados en PostgreSQL real, sin exponer command/debug endpoint.
Seguridad de futuros adapters financieros sigue pendiente. [Evidencia](API-01.md).

Activos: credenciales/sesiones, inventario/costos/rentabilidad, recibos y backups.
CLOUD-03 implementa solo foundation auth: verified obligatorio, sesiones DB sin refresh/cache,
cookies host-only, verify/reset TTL, revoke, redacción y defensas propias de Better Auth.
Detalles/evidencia en [CLOUD-03](CLOUD-03.md). La tabla siguiente sigue como política V1 objetivo:
CLOUD-04 implementa ownership y piloto por CLI. CLOUD-05 implementa CORS/Origin exactos,
CSRF de negocio, límites durables por email/IP/user, JSON/body y sanitización local/CI.
Seguridad de clientes e infraestructura permanece pendiente. [Evidencia CLOUD-05](CLOUD-05.md).
Límites: dispositivo/browser no confiable → API autenticada → PostgreSQL privado;
public site y previews no reciben autoridad sobre datos. Railway/SMTP/operador son superficies
de infraestructura con acceso restringido, no actores comerciales.

| Amenaza concreta | Control V1 | Evidencia futura exigida |
| --- | --- | --- |
| Cuenta A usa ID Product/Sale/backup B (IDOR) | Session→owner→inventory, query compuesta, 404 ajeno | Integración para cada grupo de rutas, sync cursor/import/export inclusive |
| Body cambia owner/cloudAccess/stock/costo histórico | Allowlist schema; Business server-derived; stock solo command/domain | Payload hostil additionalProperties y mass assignment rechazados |
| Dos compras actualizan promedio simultáneamente | Lock Inventory, precondición stateRevision, snapshots verificados | Barrera concurrente en PostgreSQL real |
| Retry duplica venta o reversal | Receipt unique + hash + tx; reversal unique | Commit con ACK perdido, retry simultáneo |
| Credential stuffing/reset spam | Better Auth hashing y límites; 5 login/min por email hash + 30/IP/min, reset 3/h/email | Lockout temporal sin bloquear Free, respuestas genéricas |
| Robo de cookie/browser XSS | HttpOnly host-only Secure; CSP estricta; sin dangerouslySetInnerHTML con textos usuario | XSS nombre/notes/barcode; cookie JS inaccesible |
| Sibling site provoca mutación con cookie | Origin allowlist + CSRF session token, JSON-only, CORS exacto | POST cross-origin/null origin y token ausente/reused |
| Falso cliente nativo usa Origin para saltarse auth | Cookie validada server siempre; plugin Expo con scheme exacto | Origin/deviceId solos no autorizan; sesión revocada rechazada |
| SQL injection en search/history | Drizzle parametrizado; no concatenar sort/cursor SQL | Inputs maliciosos; sort enum fijo |
| Cursor o snapshot revela tenant | Cursor opaque signed/DB token scoped inventory+generation | Token de A no sirve a B |
| DoS por import/lote/form | 1 MiB request sync, 50 ops, límites de import; timeouts y paginación | Archivo grande/zip bomb rechaza sin writes parciales |
| Robo de session Mobile | SecureStore; revocación server; no logs/token en SQLite outbox | Logout/reinstall/expired y reset revoca |
| Preview captura datos production | Staging separado; nada de wildcard *.pages.dev | Cookie/domain/DB/env isolation probado |
| Fuga por logs/export/backups | Redacción, no payload, export autenticado; backups cifrados acceso mínimo | Inspección logs; restore aislado sin URLs públicas |
| Dependencia auth comprometida | Lockfile, versiones fijadas, revisión advisories, actualización con regresión | QA/sec gate antes de release; no declarar seguro por marca |
| Borrado restaurado desde backup | Supresión mínima fuera del snapshot y reaplicada antes de abrir restored API | Restore con usuario eliminado sigue sin dataset accesible |

Rate limit business piloto: 120 reads/min + 60 commands/min por user, sync un lote/segundo y
máximo 2 concurrentes/user. Ajustables tras medición, no ocultar 429. Una instancia API V1;
límites auth durables en DB o almacenamiento soportado por librería. In-memory IP limit es defensa
adicional, no único control de brute force; escalar replicas exige coordinación antes del rollout.

CSRF auth usa defensas de Better Auth; mutaciones /v1 exigen token ligado a sesión en Web y Mobile,
content-type JSON y, cuando haya Origin browser, allowlist exacta. Native obtiene token mediante
sesión válida y transporte del plugin; no necesita simular navegador ni saltarse token por
`X-Mobile: true`. Ausencia de Origin no sustituye cookie/token/ownership.
El token de sesión nunca es 'secreto' que se pueda poner en VITE_*.

Auth 1.7.7: disableOriginCheck=false y disableCSRFCheck=false explícitos, también en tests.
Plugin Expo sin exp:// implícito; APP_ORIGIN/API origin/scheme exactos y redirect hostil rechazado.
Rate limit Better Auth enabled=true en todos los entornos, customStorage.consume atómico PostgreSQL.
Reglas sensibles explícitas 30/min por IP/path; bridge adicional 30/min IP agregado, login 5/min
y reset 3/h por email normalizado, sin reset por éxito. Lecturas /v1 120/min y comandos 60/min/user.
Sin almacenamiento memory como autoridad. Detalle de ventanas y claves en CLOUD-05.
Auth logger interno deshabilitado y onAPIError convierte excepciones inesperadas en APIError genérico
para impedir console.error raw de better-call; bridge sanitiza 5xx. Logs Fastify sin URL/header/body.
SMTP logger/debug/file/url access deshabilitados; TLS valida certificados, STARTTLS obligatorio cuando
seleccionado, plaintext solo loopback fuera de producción. Ningún proveedor/credencial externo usado.
No deleteUser bypass: rutas directas/perfil/OAuth fuera de scope deshabilitadas y comprobadas.

CSP de SPA: default-src self; script-src self sin unsafe-inline/eval; connect-src self + API exacta;
object-src none; frame-ancestors none; base-uri self. HSTS HTTPS después de verificar dominios,
Referrer-Policy no-referrer y nosniff. Cloudflare/API no cachean respuestas privadas.
DB y backups sin endpoint público permanente; conexiones TLS según transporte/proveedor,
red privada Railway, operador verifica cifrado/controles antes de release y no los supone.

No claims de cumplimiento legal/certificación. [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
orienta deny-by-default y verificar cada acceso; [Better Auth security](https://better-auth.com/docs/reference/security)
orienta auth/Origin/cookies. Controles son diseño que debe probarse, no auditoría de servicio desplegado.

## Evidencia de ownership CLOUD-04

Tres rutas locales con sesión oficial/verified, query owner+Inventory scoped y 404 ajeno;
A own/B own200, A→B/B→A404, disable/DELETING403, inconsistent unverified403, expired/revoked401.
Body/query mass assignment rechazado400; piloto solo CLI y enable precondiciones en transacción.
Signup/verify crean cero datasets; bootstrap nunca enable. Error DB sanitizado/requestId/no-store.
FK owner NO ACTION y delete-user disabled, sin cascade del negocio. Sin imports Mobile/backup.
Los controles aplican a metadata/bootstrap implementados; aún no prueban futuras rutas financieras,
import/export/sync. CLOUD-05 agrega CSRF/Origin/CORS/rate a estas rutas; sin exposición externa.
Reporte [CLOUD-04](CLOUD-04.md).

## IMPLEMENTED CLOUD-05

CORS exact APP_ORIGIN, credentials=true, Vary Origin; ningún wildcard/reflect/pages.dev wildcard.
OPTIONS válido no consulta sesión/ownership ni incrementa contadores. Origin /v1 hostil/null
rechazado403 antes de DB, incluso con sesión/token válidos. Ausente no concede autoridad.
CSRF HMAC-SHA256 con clave derivada separada, session.id oficial y timingSafeEqual;43 caracteres
base64url, no session token/email/User ID en payload. Sesión se valida en DB por cada petición.
JSON-only POST/PATCH/PUT /v1, global1MiB/bootstrap32KiB,413/415 sin writes. Headers de identidad,
rol o Mobile ignorados. ApiError códigos usados, requestId servidor y no-store incluso en errores.
Durable PostgreSQL consume atómico; login5/min/email, reset3/h/email, sensitive auth30/min/IP
agregado e IP/path oficial30/min; negocio120 reads/60 commands por minuto/user.
Claves rate HMAC con separación por scope, sin email/IP/user raw en esa tabla. Datos oficiales de
sesión de Better Auth conservan su schema; no confundir privacy del rate store con sesiones.
Fastify serializers excluyen URL/query/body/headers/raw errors, redaction defensiva adicional;
Better Auth logger deshabilitado/sanitizer, SMTP sin debug/raw credentials.
DATABASE_URL/BETTER_AUTH_SECRET/SMTP_PASSWORD/password/cookies/CSRF/verify/reset no se registran.
Pruebas con canaries ficticios, dos pools/instancias, reinicio, concurrencia y clock de seguridad
injectado (no cambia TTL auth ni clock Domain). [Resultados](CLOUD-05.md).

## FUTURE / no verificado en infraestructura

DEV-01/DEV-04: validar proxy sender/CIDR reales Railway; trustProxy permanece false. IP actual
es del socket y puede agrupar usuarios detrás de proxy. No configurar forwarded trust por suposición.
DEV-04: WAF/edge/TLS y HSTS después de verificar dominios; WEB-01: CSP de SPA.
API-02..API-10/QA-01: seguridad por cada futura ruta financiera/deletion/export; SYNC-02/QA-01: abuso sync;
MIG-01: límites de import; SYNC-06 y WEB-02: auth/CSRF/SecureStore clientes; DEV-05: monitoreo
y mantenimiento periódico de rate store. No se declara release seguro/certificación ni despliegue.
