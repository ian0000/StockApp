# Operación, retención y recuperación

Reanudación autorizada en Docker18.6: test:db1040 PASS/0fail/skip/timeout; incidentes nativos conservados.

DEV-02 (2026-10-13) prepara [runbook y ensayo local PostgreSQL18.6](DEV-02.md): dump consistente,
restore aislado e integridad/idempotencia, supresión COMPLETED independiente antes de promoción.
Clave HMAC incorrecta puede dar exit0 en CLI existente; exige custodia/verificación independiente,
no basta readiness200. Retención last-backup realmente retenido+7d, sin pruning por constante.
Dos capas propuestas: snapshots Railway y dump cifrado independiente; destino/cifrado/custodia
pendientes de aprobación, sin backups/schedules/alertas/restore remoto activados. RPO24h/RTO4h
son objetivos. DB/volumen solo staged; no promoción ni reapertura automática. DEV-01 no DONE.

DEV-01 materializa /health readiness200/503 ApiError/no-store y mantiene /live independiente.
Probe read-only2s verifica migration ledger exacto y columnas/tipos/nulabilidad requeridos,
sin migrar/escribir/ocupar pool de negocio. No sustituye restore/auditoría de integridad DEV-02.
API-10 startup/worker/drain intactos; Railway UAT API staged/inactivo, sin DB ni monitor/backup
configurado. [Detalles y límites](DEV-01.md). No aplicar patch ni desplegar por efecto del merge.

DEV-00 formaliza DEV local/CI→UAT primer entorno online→aprobación humana→PROD NUEVO
independiente/no provisionado. [Política](DEV-00.md). Runbooks siguientes son requisitos, no
evidencia de backups/restore configurados. UAT temprano solo datos sintéticos/controlados de prueba;
no datos de clientes/negocios reales hasta verificar protecciones. DB/config/secrets por entorno,
sin copiar DB UAT a PROD ni secretos PROD a UAT. Casos Sync/Mobile/import siguen diferidos en el
track Web-only; no se implementan jobs/runbooks automáticos en esta actualización.

DEV-02 debe ensayar restore UAT en DB aislada, custodiar copia independiente cifrada del backup
y registro API-10 de supresión fuera del snapshot, verificar retención real y aplicar supresión
ANTES de reabrir servicio restaurado. Browser BackupV1/AccountExport no sustituyen recovery
PostgreSQL. Railway no se presume suficiente para todas las obligaciones. Evidencia UAT exigida
antes de PROD; RPO/RTO/retención inferiores son objetivos, no cumplimiento/SLA comprobado.
Predeploy Drizzle con advisory lock bajo control único; falla bloquea deploy, sin migrar requests.
SQL destructivo/migración PROD requieren revisión; rollback de código no revierte schema.

API-10 implementa REQUESTED/PROCESSING/COMPLETED, leases recuperables, startup/wake/sweep5s y purge por fases transaccionales. Registro privado HMAC export/apply se prueba localmente contra restore antiguo. No pruning automático: DEV-02 debe custodiar copia independiente cifrada y demostrar last-backup+7d antes de podar; producción sigue bloqueada por DEV-02/REL. [Detalle](API-10.md).

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
