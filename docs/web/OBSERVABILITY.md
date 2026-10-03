# Observabilidad V1

Logs JSON de Fastify hacia Railway, requestId generado server y devuelto al cliente.
Campos permitidos: timestamp UTC, level, route template (sin IDs/query), method, status,
durationMs, errorCode, deployment commit y correlation requestId. No request/response body,
headers Cookie/Authorization, email, productos, costos, profit, notes ni archivo backup.
Ids internos solo cuando estrictamente necesarios y con acceso restringido; métricas agregadas
sin Business identificado. Nunca logger por defecto de URL completa si incluye barcode/query.

V1: tasas/latencia requests por ruta, 5xx/429, DB connection/query timeout, command conflict/error,
outbox backlog reportado agregado, sync duration/lag, import/deletion jobs fallidos y backup age.
No usar analytics de usuario para sustituir monitoreo operacional ni proveedor pago por anticipación.
Error tracking inicial por logs estructurados/requestId; proveedor dedicado es Future.

GET /health = readiness: ping DB acotado + schema mínimo compatible, 200 `{status:ok}` o
503 `{status:unavailable}`. No hostname DB, secrets, stack ni detalles de tenants. GET /live
comprueba proceso sin DB. Railway consulta /health para activar deploy; no garantiza comprobación
continua después del deploy, según [healthchecks Railway](https://docs.railway.com/deployments/healthchecks).

DEV-05 prepara monitor externo de health (cada 60s, infraestructura de monitoreo accesible sin datos
comerciales) y alertas Railway disponibles de servicios/recursos, comprobadas con fallo controlado.
Umbrales de diseño: 3 fallos consecutivos health, 5xx >1%/5min con tráfico suficiente, backup >24h,
deletion job >24h, import no progresa 15min. Canal al responsable se configura en ese ticket,
no se envían mensajes ahora ni se instala proveedor pagado. Monitor no modifica ledger.

Retención propia logs máximo 14 días; restricciones reales Railway verificadas antes de producción.
Si plataforma conserva más, declarar retención efectiva y gestionar borrado/acceso; no prometer
política que no pueda ejecutarse. Runtime separado de build/deploy logs. Un build exitoso no prueba
health, dominio, auth, CORS ni integridad de sync.
