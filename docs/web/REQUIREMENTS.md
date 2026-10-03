# Requisitos y decisiones

Requisitos del objetivo; ningún requisito futuro se afirma implementado.

| ID | Requisito verificable | Criterio de aceptación futuro |
| --- | --- | --- |
| R01 | Mobile continúa offline-first | Venta y compra local sin red, reinicio conserva datos/outbox |
| R02 | Cuenta y carga opcionales | Free opera anónimo; login no sube datos sin consentimiento |
| R03 | Una sola implementación de reglas | Domain pasa mismos fixtures Mobile/API/Web |
| R04 | Exactitud financiera | Money safe integer 10^6, JSON string, null distinto de 0, overflow rechazado |
| R05 | Atomicidad | Fallo inducido no deja Sale sin líneas/movimientos ni stock parcial |
| R06 | Ownership | Cuenta A no lee/escribe/exporta/sincroniza/elimina datos B |
| R07 | Concurrencia | Compra y ajuste stale hacen conflicto; ninguna escritura perdida |
| R08 | Reintentos seguros | Mismo operationId/payload produce una sola operación tras pérdida de ACK |
| R09 | Historia | Snapshots aceptados no se recalculan; void condicionado y append reversal |
| R10 | Delta durable | Crash al aplicar página no avanza cursor; retry converge sin duplicados |
| R11 | Import inicial | Ocho colecciones validadas, IDs preservados, activación atómica sobre cloud vacío |
| R12 | Web V1 online-first | Sin red no confirma operación; envío incierto consulta mismo operationId |
| R13 | Operación observada | Request ID, readiness, alertas de fallos y logs sin datos comerciales |
| R14 | Recoverability | Restore aislado probado con RPO <=24h y RTO objetivo <=4h |
| R15 | Lifecycle | Revocación, export y borrado de cuenta/dataset con retención documentada |
| R16 | Entrega segura | CI required; CD de commit main revisado; migración expand/contract |
| R17 | Hosting fijo | SPA Pages; API y PostgreSQL Railway; dominios definidos |
| R18 | Paridad | Todos los MUST HAVE de PARITY_MATRIX aceptados con E2E |

## DECIDED

Stack, topología, proveedor DB, ORM, REST/versionado, identidad/sesiones, ownership,
hosts, autoridad compartida, outbox/cursor, política por entidad, import sobre cloud vacío,
web online-first, server-state y deployment: decisiones cerradas en ADR y fuentes principales.

## PENDING BUT NON-BLOCKING

Precio definitivo, trial, billing y retención por cancelación: responsabilidad del producto,
fuera de foundation; bloquean lanzamiento comercial si no se aprueban.
Región Railway concreta y configuración SMTP contratada: seleccionar durante DEV-01/DEV-06,
antes de piloto, con revisión de disponibilidad, tratamiento y costos; no cambia la arquitectura.
Proveedor SMTP V1 usa transporte SMTP estándar, sin auth gestionada por ese proveedor.
Dominio/remitente y credenciales son configuración operacional; ver DEPLOYMENT.
Cámara browser, MFA/passkeys, cifrado local adicional, tiempo de Undo y archivados:
futuro; no bloquean V1 descrita. No se anticipan endpoints para esas capacidades.

## BLOCKING IMPLEMENTATION

0 decisiones arquitectónicas abiertas para foundation tras revisión humana de esta baseline.
La revisión humana es el gate de proceso del ticket, no una aprobación supuesta.

## Gates de release todavía NO cumplidos

Pruebas de aceptación de sync/conflictos/recovery; seguridad/auth multi plataforma;
Privacy/Terms actualizados; borrado funcional y enlace público de solicitud;
declaraciones stores actualizadas; operación/restore probado; consentimiento y soporte;
región/subprocesadores documentados. Ver [PRIVACY_IMPACT](PRIVACY_IMPACT.md).
El piloto tampoco puede enviar datos reales sin completar esos gates de tratamiento.
