# Contratos API V1

REST JSON en `https://api-stockapp.ian-k.dev/v1`. Auth library bajo `/api/auth` con
contrato separado fijado por versión. Health fuera de versionado. No controladores creados.
DTOs/JSON Schema/types futuros en packages/contracts; API publica OpenAPI en CLOUD-01/06
antes de permitir que features Web inventen rutas. Ejemplos son contratos objetivo.

## Convenciones

IDs comerciales UUIDv7; Money/Percentage enteros escalados como strings (sin decimales ni exponentes),
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
