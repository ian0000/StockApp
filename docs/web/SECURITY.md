# Seguridad y threat model

Activos: credenciales/sesiones, inventario/costos/rentabilidad, recibos y backups.
CLOUD-03 implementa solo foundation auth: verified obligatorio, sesiones DB sin refresh/cache,
cookies host-only, verify/reset TTL, revoke, redacción y defensas propias de Better Auth.
Detalles/evidencia en [CLOUD-03](CLOUD-03.md). La tabla siguiente sigue como política V1 objetivo:
CLOUD-04 implementa ownership en tres rutas y piloto por CLI. CSRF de negocio, CORS,
límites durables/por email y seguridad de clientes aún no implementados.
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
Rate limit built-in queda sin override: default activado por Better Auth en NODE_ENV=production,
almacenamiento memory/defaults de librería; no equivale a los límites finales durables de CLOUD-05.
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
import/export/sync. Full CSRF/Origin/CORS/rate /v1 sigue CLOUD-05; sin exposición externa.
Reporte [CLOUD-04](CLOUD-04.md).
