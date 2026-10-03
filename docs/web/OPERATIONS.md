# Operación, retención y recuperación

Objetivo futuro, no infraestructura configurada. Operador responsable: desarrollador del proyecto;
permisos mínimos por entorno, procedimientos revisables y pruebas con datos ficticios.

## Tres mecanismos diferentes

| Mecanismo | Propósito | Restricción |
| --- | --- | --- |
| Backup local JSON V1 | Recuperación controlada por usuario | Archivo sin cifrado, REPLACE local; conserva historia |
| Export cloud JSON de seguridad | Copia consistente del Inventory aceptado | No incluye auth tokens ni staging/outbox pendiente de otro dispositivo |
| Backup PostgreSQL/volumen | Disaster recovery del servicio | Cifrado/acceso operador, DB+auth+receipts; restore aislado |
| Sync | Compartir cambios y resolver conflictos | Replica errores/borrados; NO reemplaza backup |

Export cloud usa snapshot consistente y codec formatVersion 1 para las ocho colecciones auditadas;
campos cloud-only (ownership/revisions/auth) no se fingen parte del backup local. Adjuntar manifest
separado de export de perfil/metadata cuando solicitado. Restore Mobile conserva formato local;
restore servidor es proceso operador, no botón para sobrescribir todos los dispositivos.

## Backup de servicio

Objetivos internos iniciales: RPO <=24h, RTO <=4h; no SLA comercial. Backup diario del volumen
Railway y logical dump cifrado diario en destino separado del volumen/servicio Railway.
Retención hasta 30 días; verificar schedules y retención real/plan en DEV-02.
Destino separado a seleccionar en ese ticket según disponibilidad/costo/privacidad (no altera DB/API).
Sin segunda copia independiente probada no liberar servicio con datos reales. PITR es futura mejora,
no se asume incluida ni HA/mantenimiento delegado por tener PostgreSQL en Railway.

[Railway volume backups](https://docs.railway.com/volumes/backups) documenta el mecanismo;
el operador conserva responsabilidad de validar dump, encrypt, restore y continuidad de claves.
Secrets de backup solo tarea mantenimiento, nunca Pages ni clientes. No guardar dump plano en Git.

## Runbooks mínimos

API caída: comprobar /health vs /live, logs requestId y DB/pool, pausar CD si migración falla;
Mobile continúa local/outbox. Aviso de sync retrasada sin afirmar pérdida. Reintentos misma key.
Corrupción sospechada: congelar writes cloud, snapshot de diagnóstico restringido, no reset/drops.
Restore: seleccionar backup, reconstruir DB nueva aislada, aplicar migraciones compatibles,
validar constraints/counts/snapshots/receipts, reaplicar lista de supresión, smoke con datos ficticios
o acceso autorizado y solo entonces promoción controlada. Nueva sync generation invalida cursores;
clientes hacen snapshot sin perder pending. Evitar admitir retries antiguos perdidos por RPO:
si un receipt no está en backup, reconciliar IDs/evidencia antes de aceptar replay; no duplicar a ciegas.

Rollback deploy: artifact API compatible con schema; expand migration mantiene versión previa;
rollback code no revierte schema destructivo. Cambio secrets: rotation plan + revocar sesiones,
consumers/env por entorno; ninguna credencial en logs de incidentes. Import atascado: consultar
estado/hash/chunks, cancelar staging o resume; no modificar dataset activo a mano.

## Borrado y retención

Cuenta solicita borrar: Business DELETING y sesiones/dispositivos revocados inmediatamente,
purga activa objetivo <=24h, reintento job durable hasta terminar. Borra inventario, historia,
receipts, cambios, imports, auth y verificaciones; no obligación contable inventada.
Backups cifrados pueden contener copia hasta 30 días; al restore se aplica registro mínimo de
supresión separado del snapshot antes de abrir servicio. Ese registro guarda ID pseudónimo/hash
necesario, sin email/ledger, hasta vencer último backup + 7 días y después se elimina.
Registro de supresión accesible solo mantenimiento y respaldado separado para resistir rollback.

Desconectar/expirar sesión no equivale a borrar cloud. Dispositivos offline y JSON exportado no se
borran remotamente de inmediato: al reconectar se revoca sync, se avisa y se ofrece borrar dataset
local conectado o conservar una copia local según decisión explícita; nunca vincularlo a otro user.
Datos Free local no se borran por logout cloud. Retención por cancelación comercial no se decide aquí,
y deberá aprobarse antes del lanzamiento Pro; piloto no implementa cobros/cancelaciones.

Mantenimiento durable usa jobs en PostgreSQL y scheduler del servicio, no en memoria únicamente.
Las tareas de cuenta/backup no corren dentro de una transacción de venta.

## Runbook local de acceso piloto — CLOUD-04

DATABASE_URL explícita al entorno autorizado y schema latest. Usar Better Auth user ID, no email:
`pnpm --filter @stock-app/api pilot:access -- --user-id <id> --enable` o `--disable`.
Enable requiere user verified + Business ACTIVE + exactamente un Inventory, bajo transacción/locks;
si falla no modifica flag. Disable bloquea rutas S sin borrar datos ni sesiones, permite DELETING.
Repeticiones no-op, salida genérica/exit1 al fallar, Pool cerrado. Sin API admin/roles/eventos.
No habilitación automática por cuenta ni bootstrap; pruebas solo fixtures locales. Sin proveedor
configurado ni acceso a producción. Account deletion jobs siguen API-10. [CLOUD-04](CLOUD-04.md).
