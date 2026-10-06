# Contratos API V1

CLOUD-06 congela formas ejecutables en [CONTRACTS_V1](CONTRACTS_V1.md) y
[OpenAPI 3.1.1](openapi/stockapp-v1.json), con disponibilidad implemented/planned por operación.
Runtime usa ownership schemas compartidos; /v1/me añade capabilities de protocolo y dominio `[1]`.
No se implementaron rutas planned ni /health. Auth permanece bajo Better Auth 1.7.7 separado.

REST JSON en `https://api-stockapp.ian-k.dev/v1`. Auth library bajo `/api/auth` con
contrato separado fijado por versión. CLOUD-01 implementa solo GET /live y handlers de errores.
CLOUD-03 implementa el subconjunto auth documentado abajo. /health, negocio y sync siguen como objetivo.
JSON Schema/types/codecs base existen en packages/contracts. OpenAPI full contract generation
deferred to CLOUD-06: sin plugin/spec en CLOUD-01. Antes de features Web se generará el contrato.

## Foundation implementada — CLOUD-01

GET /live → 200 application/json `{ "status": "ok" }`, sin DB/filesystem/red.
genReqId crypto UUID; requestIdHeader=false, sin confiar en ID cliente. x-request-id también en errores.
404 NOT_FOUND, JSON Schema/JSON inválido 400 VALIDATION_ERROR, inesperados 500 INTERNAL_ERROR:
message público/requestId obligatorio; fieldErrors opcional. Details/catálogo completo en CLOUD-06.
Sin excepción/AJV crudos. JSON Schema const con FromSchema, sin interfaces duplicadas ni coerción
o eliminación silenciosa de campos adicionales. Money schema valida forma; codec exige rango safe.
Revision conserva string sin Number; rango DB/protocolo específico en CLOUD-06. Primitives rechazan
null/undefined; nullable/optional explícito por DTO futuro, sin sustituir cero. Sin rutas debug.

## Convenciones

Auth real, Better Auth 1.7.7 bajo /api/auth (cuando se compone su configuración):

| Método | Path relativo /api/auth | Contrato real |
| --- | --- | --- |
| POST | /sign-up/email | name/email/password, callbackURL opcional; user no verificado, token null |
| POST | /sign-in/email | email/password; sesión solo verified, cookie y respuesta de librería |
| GET | /get-session | session/user o null; consulta DB, sin renovar |
| POST | /sign-out | Revoca sesión actual y limpia cookie |
| POST | /send-verification-email | email/callbackURL opcional; respuesta genérica, reenvío |
| GET | /verify-email | token/callbackURL opcional; 200 JSON sin callback, 302 con callback; error expirado 401 o redirect con error |
| POST | /request-password-reset | email/redirectTo opcional; misma respuesta existing/missing |
| GET | /reset-password/:token | callbackURL; redirige al callback con token o error |
| POST | /reset-password | newPassword/token; reset de un uso, revoca todas |
| GET | /list-sessions | Lista propia autenticada |
| POST | /revoke-session | token de sesión propia |
| POST | /revoke-other-sessions | Conserva sesión actual |
| POST | /revoke-sessions | Revoca todas |
| GET | /ok, /error | Auxiliares oficiales de la librería; sin datos comerciales |

No aliases ni DTOs propios auth en contracts; éxito/errores normales conservan el shape de la librería.
x-request-id servidor/no-store pasan por Fastify. Fallos inesperados/5xx se sanitizan como error auth
genérico, sin raw SQL/stack; JSON inválido en parser Fastify usa su envelope foundation existente.
Bridge deriva URL del AUTH_BASE_URL explícito, nunca del Host recibido; Set-Cookie múltiples preservados.
No delete-user directo, perfil/change-email/password, social OAuth/proxy Expo ni endpoints /v1.
Trusted origins y CORS son controles separados: CLOUD-05 registra @fastify/cors con APP_ORIGIN
exacto, credentials=true y preflight previo a sesión/ownership. No Web UI todavía.

Convenciones siguientes corresponden a negocio futuro:

IDs comerciales nuevos UUIDv7; IDs almacenados/históricos y referencias son UUID válidos genéricos,
incluido UUIDv4 preservado sin remapeo. Money/Percentage enteros escalados como strings (sin decimales ni exponentes),
epoch ms seguros como números, revisiones como strings. Payload `null` distinto de campo ausente.
Cada comando de negocio lleva operationId, protocolVersion/domainVersion, occurredAt,
preconditions, payload; entity IDs deterministas del command. Web usa UUIDv7 nuevo solo para nueva
intención; `Idempotency-Key` debe coincidir con operationId. Sync transporta el mismo envelope.
Sale retorna Sale/items/state revisions; Purchase retorna snapshots y price analysis;
AdjustStock retorna ajuste y state; status/consulta por operationId resuelve incertidumbre.

Listados keyset: limit default 50, máximo 100 (History máximo 50), cursor opaco scoped/filtros.
Productos `createdAt DESC,id DESC`; History `effectiveAt DESC,createdAt DESC,id DESC`.
No offset ilimitado; snapshots de export/import tienen paginación coherente distinta de lista viva.
Search parcial name/variant/barcode; barcode como string sin parse numérico.
Respuestas auth/dataset `Cache-Control: no-store`; error incluye requestId.

## Rutas

`I` = inventoryId autorizado; **S** = sesión verificada, Business autorizado y cloud habilitado;
**U** = sesión propia, aun sin inventario; **R** = U reciente (<=5min).
`C` = receipt + dominio + estado + ChangeSet en una transacción de comando bajo lock Inventory.

| Método | Path | Propósito | Auth | Idempotencia | Transacción |
| --- | --- | --- | --- | --- | --- |
| POST | /api/auth/sign-up/email | Crear identidad | No | Flujos Better Auth; email unique | Auth DB |
| POST | /api/auth/sign-in/email | Login | No | No retry ciego; cliente single-flight | Crear sesión |
| GET | /api/auth/get-session | Sesión actual | U | Lectura | Auth DB |
| POST | /api/auth/sign-out | Logout | U | Revocar ya revocada sin nuevos efectos | Auth DB |
| POST | /api/auth/request-password-reset | Solicitar reset | No | Token/limit de librería, respuesta genérica | Auth + email fuera del tx |
| POST | /api/auth/reset-password | Completar reset | Token | Token un uso | Password + revocar sesiones |
| POST | /api/auth/send-verification-email | Reenviar verificación | U | Rate limit | Auth + SMTP |
| GET | /api/auth/verify-email | Consumir verificación | Token | Token según librería | Auth DB |
| GET | /v1/me | Perfil/business/access y capabilities | U | Lectura | Query scoped |
| GET | /v1/session/csrf | Token CSRF para mutaciones Web | U | Lectura | Sesión |
| POST | /v1/business | Crear negocio y reservar onboarding vacío/import | U verificada | Key | Business/reserva+receipt; owner unique, cloudAccessEnabled=false |
| GET | /v1/inventories/I | Inventario activo/moneda/timezone | S | Lectura | Query scoped |
| GET | /v1/inventories/I/dashboard | Hoy + bajo/más vendido/recientes | S | Lectura | Snapshot consulta consistente |
| GET | /v1/inventories/I/products | Buscar/listar productos | S | Lectura | Query |
| GET | /v1/inventories/I/products/by-barcode?code=... | Producto activo exacto | S | Lectura | Query scoped |
| GET | /v1/inventories/I/products/:id | Detalle + state/version/rentabilidad | S | Lectura | Query |
| POST | /v1/inventories/I/products | Crear Product + stock inicial | S | Key | C |
| PATCH | /v1/inventories/I/products/:id | Metadata/precio + expectedMetadataRevision | S | Key | C |
| POST | /v1/inventories/I/products/:id/archive | Archivar | S | Key + ya archivado | C |
| GET | /v1/inventories/I/stock-low | Productos activos con bajo stock | S | Lectura | Query/domain predicate |
| POST | /v1/inventories/I/sales | Sale multiproducto, costos derivados | S | Key | C, todas las líneas |
| GET | /v1/inventories/I/sales/:id | Detalle/snapshots/void eligibility | S | Lectura | Query |
| POST | /v1/inventories/I/sales/:id/void | Anular venta completa elegible | S | Key + ya VOIDED | C |
| POST | /v1/inventories/I/purchases | Purchase un producto | S | Key | C |
| GET | /v1/inventories/I/purchases/:id | Detalle/snapshots/eligibility | S | Lectura | Query |
| POST | /v1/inventories/I/purchases/:id/void | Anular compra elegible | S | Key + ya VOIDED | C |
| POST | /v1/inventories/I/adjustments | Conteo físico/motivo/costo aceptado | S | Key | C |
| GET | /v1/inventories/I/history | Cronología comercial | S | Lectura | Query, no filas técnicas |
| GET | /v1/inventories/I/operations/:operationId | Receipt/status de comando | S | Lectura | Query scoped |
| POST | /v1/inventories/I/sync/devices | Registrar instalación | S | deviceId unique | Registro scoped |
| POST | /v1/inventories/I/sync/push | Lote de envelopes | S/device | Por command | C por comando, resultados individuales |
| GET | /v1/inventories/I/sync/changes | Delta por cursor | S/device | Lectura | ChangeSets completos |
| POST | /v1/inventories/I/sync/snapshots | Iniciar snapshot coherente | S/device | Key | Captura highWaterMark |
| GET | /v1/inventories/I/sync/snapshots/:id | Página de snapshot | S/device | Lectura | Staging readonly |
| POST | /v1/imports | Reservar import inicial cloud vacío | U verificada/habilitada | Key/hash | Reserva generation y consent |
| PUT | /v1/imports/:id/chunks/:index | Subir fragmento de JSON | U propietaria | index/hash unique | Staging aislado |
| GET | /v1/imports/:id | Progreso/validación | U propietaria | Lectura | Query scoped |
| POST | /v1/imports/:id/commit | Activar dataset validado | U propietaria | Key/hash | Única tx de activación; ver MIGRATION |
| DELETE | /v1/imports/:id | Cancelar staging | U propietaria | Sí | Nunca elimina dataset activo |
| GET | /v1/inventories/I/backup | JSON de seguridad consistente | R + ownership | Lectura | Snapshot repeatable read, stream/download |
| GET | /v1/me/export | Perfil + dataset propio | R | Lectura | Export consistente |
| POST | /v1/me/deletion | Solicitar borrar cuenta y cloud | R | Key | Desactivar/revocar + job durable |
| GET | /health | Readiness Railway | No | Lectura | Ping DB + versión schema mínima, timeout |
| GET | /live | Liveness proceso | No | Lectura | Sin query DB |

Auth rutas/adaptación se congelan en CLOUD-03 con la versión elegida; no duplicar password handling
en `/v1`. La ruta delete-user de librería queda cerrada al bypass del flujo de borrado de negocio.
No endpoints de edición/borrado financiero, PurchaseItem, desarchivado, restore cloud arbitrario,
roles o cambio de moneda. Snapshot y backup son readonly, no autoridad para escribir stock.

## Validación y errores

Frontend valida formato y ayuda; contracts/API validan shape, tamaños, identidad/tenant,
precondiciones y protocolos. Domain protege cantidades, Money, null y reglas financieras.
JSON Schema de Fastify solo proviene del repo, nunca del usuario; validation async DB fuera del schema.
No mass assignment: campos permitidos explícitos, additionalProperties=false, sin owner/status/stock
en edit Product. API codecs reconstruyen Money y verifican safe integers antes de ejecutar Application.

Formato: `{ "error": { "code": "REVISION_CONFLICT", "message": "El producto cambió. Revisa los datos.",
"fieldErrors": {}, "requestId": "...", "details": { "currentRevision": "12" } } }`.
Details whitelist, solo datos propios necesarios, sin SQL/stack/password. Enum/códigos estables,
mensajes UI simples. requestId server-generated se retorna también en cabecera.

| HTTP | Categoría/código | Acción cliente |
| --- | --- | --- |
| 400 | VALIDATION_ERROR / UNSUPPORTED_PROTOCOL | Corregir input/actualizar cliente; cero writes |
| 401 | UNAUTHENTICATED | Login; Mobile conserva pending |
| 403 | CLOUD_ACCESS_DISABLED / EMAIL_NOT_VERIFIED | Informar habilitación/verificación |
| 404 | NOT_FOUND | Sin revelar pertenencia ajena |
| 409 | REVISION_CONFLICT / COST_SNAPSHOT_CONFLICT / IDEMPOTENCY_KEY_REUSED / IMPORT_NOT_EMPTY | Revisión explícita, nunca retry nuevo ID automático |
| 410 | SYNC_RESET_REQUIRED / SNAPSHOT_EXPIRED | Snapshot coherente preservando pendientes |
| 422 | DOMAIN_RULE / VOID_NOT_ELIGIBLE / MONEY_OVERFLOW | Mostrar motivo útil, no alterar reglas |
| 429 | RATE_LIMITED | Retry-After |
| 500/503 | INTERNAL_ERROR / TEMPORARILY_UNAVAILABLE | Estado desconocido: consulta receipt/same key |

Fuentes: [Fastify schemas](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/),
[Drizzle transactions](https://orm.drizzle.team/docs/transactions). Rutas/limits son decisiones
de esta baseline, no ejemplos copiados de otra app.

## Contrato local CLOUD-04 implementado

GET /v1/me (U verified): {user:{id,email,emailVerified},business:null|{id,status,cloudAccessEnabled},
inventory:null|{id,name,currency,reportingTimeZone}}. POST /v1/business (U verified, no flag necesario):
JSON {inventoryName,currency,reportingTimeZone}, inicio vacío únicamente; 201 creación y 200 retry
normalizado coincidente, mismo DTO Business/Inventory sin user. 409 BUSINESS_ALREADY_EXISTS si
payload distinto/reserva incompleta/DELETING. IDs UUIDv7 server-owned, sin aceptar campos extra/body/query.
GET /v1/inventories/:inventoryId (S): {id,name,currency,reportingTimeZone}; foreign/missing404.
Todos no-store/requestId; JSON Schema allowlist y errores enum usados. Sin /health ni financiera/sync.
La tabla normativa sigue como objetivo: receipts/Idempotency-Key genérico API-01/CLOUD-06,
import MIG-01 y capabilities/OpenAPI freeze CLOUD-06. /v1/session/csrf/CORS/rate ya implementados
en CLOUD-05. Despliegue e infraestructura siguen fuera de alcance. Detalle [CLOUD-04](CLOUD-04.md).

## Hardening local CLOUD-05

GET /v1/session/csrf devuelve {token:string}, con sesión oficial verified y no-store.
GET me/Inventory/csrf no exige CSRF; consume bucket120/min/user compartido.
POST business conserva body/DTO de CLOUD-04, exige X-CSRF-Token ligado a sesión y consume60/min/user.
Origin presente debe ser APP_ORIGIN exacto; ausente permite nativo sin saltarse sesión/CSRF.
Orden: Origin/transport → parse/schema → sesión verified → rate user → CSRF mutación →
bootstrap/ownership. Schema errors pueden preceder auth; no cambian stock/datos.
CORS GET/POST/PATCH/PUT/DELETE/OPTIONS, solo Content-Type/X-CSRF-Token/Idempotency-Key;
Idempotency-Key es header permitido, su comportamiento comercial sigue API-01.
1 MiB global, business32KiB, application/json con charset permitido; no unknown body/query.
Errores nuevos:403 ORIGIN_NOT_ALLOWED/CSRF_TOKEN_INVALID,413 PAYLOAD_TOO_LARGE,
415 UNSUPPORTED_MEDIA_TYPE,429 RATE_LIMITED con Retry-After y envelope requestId.
Auth mantiene respuestas oficiales (429 X-Retry-After); fallos inesperados sanitizados.
No-store auth y /v1 incluso parser/security/404/500. [Pruebas](CLOUD-05.md).
