# DEV-02 — PostgreSQL UAT, migraciones y recuperación

Estado: **PREPARED / STAGED — HUMAN REVIEW REQUIRED BEFORE ACTIVATION**.
Gates locales completados; CI/GitGuardian del candidato exacto deben pasar antes del merge.
La activación conserva su aprobación humana independiente.
Fecha: 2026-10-13. Base Git: `5222ee82437dcff1c5e5a691c466ddf5eaebfe7e`, DEV-01/PR105.
Autorización excepcional para preparar DEV-02 mientras DEV-01 sigue operacionalmente pendiente.
DEV local/CI → UAT → aprobación humana → PROD nuevo e independiente.
Este documento distingue propuesta, patch pendiente, ensayo local y evidencia del proveedor.
No acredita DEV-02 DONE, UAT aceptado ni recovery remoto verificado.

## Preflight e inventario Railway

Main se verificó limpio, 0 ahead/0 behind; rama `chore/dev-02-postgres-uat-preparation`.
Se revisaron DEV-00/01, CI-OPT-01, CLOUD-02, API-09/10, ADRs, operación, seguridad,
privacidad, despliegue, observabilidad y el migrador/runtime reales antes de implementar.
Sin contradicción que requiera cambiar schema o negocio; límites de recovery inferiores explícitos.

| Recurso | Identidad | Antes | Después, solo staged |
| --- | --- | --- | --- |
| Proyecto | StockApp UAT, `1acb0266-cf67-4694-a470-543f62a7a30f` | Existente | Mismo proyecto |
| Entorno | uat, `21841fe9-3208-46ec-874d-0853d938effd` | Existente | Mismo entorno |
| API | stockapp-api-uat, `207b53d2-6c74-4a58-bb30-6e36c9e2f496` | staged-create | staged-create; configuración efectiva preservada |
| DB | Postgres, `d6c6771b-d430-413f-a86f-d338ccf4f28f` | Ausente | staged-create, una réplica, us-west2 |
| Volumen | postgres-volume, `b6eebc3d-e888-4a04-a23f-372c4b728502` | Ausente | staged-create, us-west2, mount `/var/lib/postgresql/data` |

Patch `7eb661e7-067d-494a-917d-d1c816755b75`: antes18 cambios; después56,
estado STAGED, destructive=false, solo dos servicios y un volumen. No buckets/shared variables,
deployments ni recursos PostgreSQL live. `latestDeployment=null` en ambos servicios.
DB networking `{}`; sin dominio/TCP proxy configurado. Consultas de dominios live devuelven null
porque no existe deployment; no se interpreta null como prueba de conectividad privada operativa.

Se llamó `deploy_template(code: postgres, staged: true)` con project/environment explícitos,
sin secretos ni inputs desconocidos. El nombre real del template es Postgres, no el sugerido
stockapp-postgres-uat; se preserva la definición soportada en lugar de reconstruirla manualmente.
Región DB/volumen us-west2 observada directamente, no inferida de la API.
El usuario aprobó exclusivamente el template y volumen predeterminado Hobby de5GB **solo staged**.
El connector informa `sizeMB=null`: capacidad por default del plan, todavía sin tamaño físico
provisionado. Confirmar5GB en la revisión previa a activación; no crear otro volumen para forzarlo.

Los17 campos efectivos de API coinciden exactamente antes/después: source repo/branch/root,
SHA fijado `5222ee82437dcff1c5e5a691c466ddf5eaebfe7e`, Railpack, build/start,
/health, timeout300, us-west2/una réplica, preDeployCommand `[]` y cinco nombres de variables.
El proveedor normalizó18→17 al omitir `source.image` vacío→vacío; no eliminó una imagen existente.
Valores de variables solo redacted, no consultados ni sobrescritos. **No repinear la API al SHA
de DEV-02 por efecto del merge**. No conectar fuente live, autodeploy ni aplicar el patch.
El metadata de conversión HA del template no crea réplicas/etcd/HAProxy; conversión HA fuera de scope.
ReptileApp, VZLegal, PROD, DNS y demás proyectos intactos.

## Template y conexión prevista

[Railway PostgreSQL](https://docs.railway.com/databases/postgresql) remite al
[template oficial postgres](https://railway.com/deploy/postgres).
`describe_template` reportó `isVerified=false` en su flag de marketplace: no se afirma ese badge;
la selección se fundamenta en el template enlazado por documentación oficial y sus defaults.
Imagen `ghcr.io/railwayapp-templates/postgres-ssl:18`, PGDATA
`/var/lib/postgresql/data/pgdata`, DB default railway, usuario postgres y password generado
por el proveedor al activar. No imagen/mount/env/start arbitrarios ni credenciales copiadas.
El tag major18 no garantiza patch18.6 ni digest inmutable. Antes de aceptar runtime UAT registrar
digest/version real, `SHOW server_version`, mount, persistencia y compatibilidad.

DB UAT será independiente de DEV, otros proyectos y futuro PROD; sin DB por PR,
datos de clientes, credenciales PROD o puerto público. API futura usará únicamente referencia privada
`DATABASE_URL=${{Postgres.DATABASE_URL}}`, escrita en el gestor de variables del proveedor,
nunca su valor en Git. Esta referencia es **plan**, no variable API añadida al patch.
La red privada y TLS efectivo se comprobarán tras autorización de activación, sin deshabilitar
verificación SSL para obtener verde. No exportar URL/secret ni abrir TCP para ejecutar QA.
SMTP/origins/Auth de UAT y entrega real siguen bloqueados por los tickets posteriores.

## Capacidad y costos revisados

Hobby confirmado por el usuario: USD5/mes con USD5 de uso incluido; no es un techo del total.
Tarifas publicadas: memoria USD10/GB-mes, CPU USD20/vCPU-mes, egress USD0,05/GB,
volumen USD0,15/GB-mes **usado**. Build sin cargo; consumo y snapshots pueden exceder el crédito.
No hay medición de CPU/RAM/uso de esta DB porque no está activa. No fijar presupuesto operativo
de USD5 ni asignar límites CPU/RAM arbitrarios. [Planes](https://docs.railway.com/pricing/plans).

Default Hobby5GB, un volumen por servicio, sin réplicas del servicio con volumen; crecimiento
no implica poder reducir después. Metadatos del filesystem consumen parte del espacio.
La documentación de planes y volúmenes no es uniforme sobre crecimiento Hobby sobre5GB:
no se asume permitido, autorizado ni necesario. Verificar plan/capacidad/costo antes de aumentar.
Servicios con volumen tienen limitaciones de disponibilidad durante redeploy.
[Volúmenes](https://docs.railway.com/volumes).

Backups Railway incrementales cobran bytes exclusivos según tarifa de volumen. Daily: cada24h,
retención6d; weekly:7d/27d; monthly:30d/89d. Propuesta daily+weekly, **no monthly89d** sin
revisión de la política hasta30d. Manual backup requiere revisar restricción de tamaño respecto
a la capacidad del volumen. No schedules/snapshots habilitados. Restore Railway crea volumen
staged, conserva el anterior sin mount; backups ligados al mismo proyecto/entorno y borrar volumen
borra sus backups. No constituyen copia independiente. [Backups](https://docs.railway.com/volumes/backups).

## Migración: mecanismo existente, no startup automático

Se reutilizan las cinco migraciones Drizzle existentes, ledger y advisory lock
`pg_advisory_lock(1937006960, 2)`. Sin schema/migration/tabla/columna nueva, sin db:push,
DROP/recreate, migraciones desde requests ni migración en cada startup. Rollback de código
no revierte schema; SQL destructivo exige revisión propia y backup previo verificado.

Plan predeploy API, **todavía no aplicado**: `pnpm --filter @stock-app/api db:migrate`.
Validar en el futuro entorno autorizado que monorepo/deps/assets SQL y tsx development condition
estén presentes. Alternativa ya existente validada localmente:
`node apps/api/dist/infrastructure/postgres/migrate.js`; no nuevo runner ni dependencia.
El build conserva `apps/api/drizzle` en su ubicación relativa requerida desde src/dist.
Sin migrador HTTP ni aplicación que escuche antes de validar migraciones compatibles.

Un único operador/control de predeploy invoca migración antes del start. El lock serializa
ejecuciones concurrentes; fallo nonzero bloquea continuación/deploy y mantiene fail-closed.
No inventar retry loops ni sleeps. Verificar cierre de pool, ledger/hashes, schema y /health
en vacío, existente, repetido, concurrente y fallido. Mantener preDeployCommand API staged `[]`
hasta revisión autorizada del cambio operacional, no sobrescribir la baseline DEV-01.
DEV-01 readiness200 exige esquema compatible; DB ausente/incompatible→503 ApiError/no-store,
no revela hostname/stack/tenant. /live no acredita DB, backups ni recuperación.

## Backup de desastre: dos capas

1. Volumen/snapshots de Railway, recuperables según las limitaciones reales del proveedor.
2. Dump lógico PostgreSQL consistente, cifrado **antes** de salir del entorno, en destino
   independiente de la DB/volumen principal, con restore probado y registro de supresiones separado.

BackupV1/AccountExport/browser JSON/Mobile RestoreBackup no sustituyen disaster recovery.
Dump incluye auth, ownership, productos/historia, states/movimientos, Money exacto, revisions,
receipts, ChangeSets, estado de seguridad y deletion durable. Roles/permisos/secret provisioning
se reconstruyen por proceso revisado separado; el dump QA `--no-owner --no-acl` no acredita IAM UAT.
No secretos de configuración en nombres, manifests públicos o repositorio.

Propuesta: diario; retención independiente hasta30d; RPO≤24h/RTO≤4h son **objetivos no medidos**.
Inventario privado por backup: entorno, hora UTC, SHA origen, server/client version, ledger,
tamaño/checksum, estado verificado, expiración efectiva y referencia de versión de clave/custodia
(sin valor). Verificar backup completo/restaurable, no solo exit0/subida. Backups fallidos,
antigüedad, espacio y restore/supresión fallida requieren alertas; DEV-05 implementará observabilidad.
No scheduler/monitor/proveedor provisionado por este ticket.

## Destino independiente y custodia: revisión humana pendiente

No destino ni algoritmo/herramienta de cifrado elegidos, instalados o provisionados.
No bucket S3 asumido. Comparación documental, no presupuesto contractual ni activación:

| Opción | Tarifa publicada | Región, acceso y recuperación a revisar |
| --- | --- | --- |
| Cloudflare R2 Standard | USD0,015/GB-mes; A4,50/B0,36 por millón; egress sin cargo, free tier sujeto a cuotas/redondeo | hint wnam es best effort, no garantía de residencia; jurisdiction y política deben aprobarse; token limitado a bucket, writer separado de restore/delete; lifecycle hasta30d y restore fuera de Railway por demostrar |
| Backblaze B2 | USD6,95/TB-mes, primeros10GB gratis; egress hasta3× almacenamiento medio sin cargo y luego USD0,01/GB | elegir/verificar región y cuenta antes de crear; application key mínima, identidades separadas, lifecycle y restauración revisados; no presumir residencia por nombre de región |

Fuentes: [R2 precios](https://developers.cloudflare.com/r2/pricing/),
[R2 ubicación](https://developers.cloudflare.com/r2/reference/data-location/),
[B2 precios](https://www.backblaze.com/cloud-storage/pricing),
[B2 seguridad](https://www.backblaze.com/docs/cloud-storage-security).
Costo final incluye volumen/tamaño real, operaciones, descargas y custodia; free tier no elimina
aprobación de proveedor/privacidad. Comparación no certifica políticas IAM/retención configuradas.

Elegir herramienta estándar revisada de cifrado cliente, sin crypto propio. Custodia fuera del
backup/storage/DB; clave backup distinta de BETTER_AUTH_SECRET y de clave HMAC de supresión.
Definir acceso break-glass, recuperación/rotación/versionado sin perder backups históricos,
autenticidad del manifest/registro y prueba de clave correcta. Backups contienen credenciales
auth/PII: cifrado, acceso mínimo, ubicación y eliminación verificable son prerequisites.
Ningún valor secreto se solicita en chat ni se publica como evidencia.

## API-10: registro independiente y límite de clave incorrecta

Exportar periódicamente COMPLETED mediante tooling API-10 ya existente, antes de perder la DB
original; cifrar/custodiar fuera del snapshot antiguo y conservar sus HMAC como datos sensibles.
Entrypoints compilados existentes (secretos solo desde gestor/env privado):

```text
node apps/api/dist/deletion/registry-cli.js export --output <private-new-file>
node apps/api/dist/deletion/registry-cli.js apply --input <private-registry-file>
```

`export` usa archivo nuevo/exclusivo, nunca sobrescribe la única evidencia. `apply` se ejecuta
solo contra destino aislado explícitamente verificado y con la clave HMAC original correcta,
antes de promoción, exposición o reapertura. No confiar en ledger deletion del backup anterior.
Después comprobar ausencia de identidades suprimidas y conservación del resto; repeat idempotente.
Conservar/sumar evidencia COMPLETED independiente; no volver atrás por el restore antiguo.

**Límite existente API-10:** el formato del registro no autentica la clave HMAC. Una clave equivocada
de longitud válida puede devolver exit0/mensaje genérico y eliminar cero usuarios; readiness puede
seguir200. Eso **no es recovery verificado**. API-10 documenta custodia/selección de clave correcta
como precondición explícita; no se modifica formato/runtime ni se rechazan todos los resultados cero.
El ensayo detecta la identidad todavía restaurada mediante la clave original de fixture confiable.
En UAT la procedencia/version/custodia y verificación independiente de clave/registro deben aprobarse
y demostrarse; si no se puede probar, **STOP antes de promoción**. No afirmar que el CLI detecta
automáticamente una clave incorrecta o que /health garantiza no resurrección de cuentas.

Retención de supresiones: hasta **último backup realmente retenido que contenga la identidad +7d**.
Calcular desde inventario real de copias/restore points/retención/exportaciones independientes;
no constante37/38d ni fecha de deletion+30d por suposición. Retención extendida o backup antiguo
sin expiración comprobada extiende la obligación. Sin inventario verificable, no pruning.
No borrar evidencia porque expire una sola capa. No pruning implementado por DEV-02.

## Runbook de restore y promoción

1. Declarar incidente y congelar escrituras por mecanismo operacional revisado; preservar origen,
   evidencia y supresiones más recientes. No tocar PROD/otra cuenta ni exponer backup.
2. Seleccionar snapshot/dump verificado e inventario privado; registrar fecha, checksum/autenticidad,
   versión, clave/custodia y ventana RPO. Si falta evidencia, STOP.
3. Crear destino **aislado y nuevo** bajo autorización propia; validar project/env/host/DB/rol,
   vacío/disposable cuando corresponda. No defaults apuntando al origen; ningún DROP FORCE,
   terminate_backend global ni restore encima de DB activa para ahorrar pasos.
4. Restaurar descifrado con herramientas compatibles y captura privada de errores;
   `pg_restore --exit-on-error --single-transaction --no-owner --no-acl` es comando del ensayo,
   no política de permisos UAT aprobada. Ante fallo, no continuar ni reintentar para obtener verde.
5. Verificar ledger/hashes/estructura/FKs/constraints/sequences y datos exactos de auth/ownership,
   historia/null/cero/revisions/archived/VOIDED/receipts/ChangeSets. Código compatible, sin nueva
   migration automática para acomodar backup desconocido.
6. Verificar clave original y registro COMPLETED independiente más reciente; aplicar supresión
   API-10 en aislamiento. Verificar que identidades suprimidas no existen, relaciones purgadas,
   demás cuentas intactas e idempotencia. Clave/registro dudoso o verificación fallida→STOP.
7. Ejecutar readiness y smoke auth/ownership/read/commands/durable replay con datos controlados.
   Exit0/health200 solos insuficientes. Medir duración/pérdida real, registrar evidencia redacted.
8. Revisar juntos integridad, supresión, acceso, backup independiente y gates. Obtener aprobación
   humana de promoción/variables/routing; no promoción automática por éxito de script.
9. Solo entonces promover/reabrir mediante cambio autorizado; comprobar tráfico/monitoring
   y conservar origen/rollback según política. Nunca rollback que resucite cuentas suprimidas.

Este ticket no congela runtime remoto, restaura Railway, cambia DATABASE_URL ni promueve entornos.

## Ensayo local y cobertura

PostgreSQL/server/pg_dump/pg_restore **18.6**, distribución completa existente; cluster exclusivo
DEV-02 loopback65436, DB admin stockapp_test, cada suite genera sus DBs disposable independientes.
Sin Railway credentials, Docker reset ni modificación de clusters/datos antiguos. Dumps/registro
sintéticos temporales fuera de Git, archivos exclusivos; se eliminan con teardown de su dueño.
Harness acepta solo URL QA local y nombre de DB generado por suite; no restore al origen/admin.
En GitHub Actions utiliza clientes del contenedor postgres:18.6 ya provisionado por CI,
verificando imagen/puerto/identidad; no instala paquetes ni cambia workflows/dependencias.
No pools/global concurrency/timeouts, sleeps/retry-get-green, skips ni assertions relajadas.

Nuevos tests: `test/postgres/migration-runtime.test.ts` (3) y `recovery.test.ts` (1),
helper `test/helpers/postgres-tools.ts`. Focused4 PASS con migrador compilado real:
vacío, concurrencia serializada por lock, rerun ledger estable, pool cerrado,
SQL ausente y fallo transaccional en **copias aisladas** de assets, exit1 sanitizado.
Nunca modifica las migraciones reales para inducir fallos.

Dump custom format mediante snapshot RR/read-only exportado; una escritura posterior en origen
queda fuera del dump completo. Restore a otra DB reproduce hashes/counts de todas las tablas,
constraints y sequences. Datos sintéticos verificados A/B, Business/Inventory, Product activo/
archivado, Sale/Purchase/VOIDED, Adjustment, States/Movements/reversals, receipts y ChangeSets.
Money strings exactas y revisions sobre Number.MAX_SAFE_INTEGER; null distinto de cero;
FK lastMovement inválido rechaza23503. Readiness compatible y replay durable sin segunda mutación.

Backup previo a deletion de A; supresión COMPLETED exportada desde origen posterior separadamente.
Clave incorrecta no supera verificación independiente; correcta purga A antes de declarar recovery,
B/auth/historia intactos, repeat no cambia DB. Auth real recuperada: sesión verificada B válida,
Inventory propio resuelve, foreign404 y sesión A purgada401. Origen nunca sobrescrito.
No prueba cifrado externo/custodia real, scheduler, Railway storage, provider restore ni RPO/RTO.
Regresiones DEV-01 cubren missing/incompatible503 y startup sin migración automática.

AUTO-FIX: nueva assertion de recovery usaba `status` en lugar de `statusCode` de OwnershipError.
SOURCE OF TRUTH: clase existente `src/ownership/errors.ts`. FILE: recovery.test.ts;
se conserva404/401 y código esperado; PRODUCTION BEHAVIOR CHANGED: NO.

AUTO-FIX: ProcessEnv tipa PGDATABASE como opcional; el helper usa la constante de nombre de DB
ya validado, sin cast ni nuevo default. SOURCE OF TRUTH: URL QA/name guard existentes y typing Node.
FILE: postgres-tools.ts; PRODUCTION BEHAVIOR CHANGED: NO. La detección de clientes exige18.6
y admite solamente el sufijo opcional de distribuidor entre paréntesis; no acepta otra versión.

## Gates y revisión final

QA/recovery exige full regression según AGENTS65.2/CI-OPT-01, no clasificación docs-only.
Gates secuenciales: OpenAPI check, pnpm check, build:api, test:db completo, generadores Drizzle/Auth,
auth:check, ci:workflows, diff check y revisión completa. Resultado final/exact-head CI/GitGuardian,
PR/merge/main clean0/0 se registra en la entrega; no se hereda éxito del SHA base.
No cambios de runtime API, contratos públicos, Domain/Application, Web/Mobile behavior,
schema/migrations, dependencias, financiero, BackupV1/AccountExport/deletion semantics ni CI.

### Historial QA — PostgreSQL nativo Windows

Este bloqueo histórico queda supersedido por la reanudación humana con Docker descrita debajo;
los incidentes se conservan, sin afirmar que se haya identificado/reparado su causa nativa.
Gates iniciales: OpenAPI/pnpm check2554 tests/build:api PASS; Drizzle sin migración/drift,
Auth generate sin diff/auth:check PASS, actionlint1.7.12 con checksum PASS.
Warning Vite1883,48kB/284,92kB gzip conservado, sin límites/code-splitting nuevos.
El primer test:db completo terminó1039 PASS/1 FAIL/0SKIP: timeout de conexión del fixture
`exact movement conflict precedes adjustment writes`, en `postgres/helpers.ts` al conectar
la DB recién creada, antes de ejecutar negocio. No nuevo fallo Domain/contract detectado.
El resultado fallido se conserva; no se declara gate PASS ni causa resuelta por un focused verde.
Focused diagnóstico de los dos archivos Adjustment iniciales19 PASS/0fail/skip;412 adquisiciones,
máximo74ms por conexión, event loop máximo497ms. Sin exceso de conexiones ni checkpoint lento
correlacionado demostrado; causa del primer timeout no confirmada.
El usuario autorizó únicamente logging temporal `log_connections=setup_durations` en el cluster
QA local exclusivo y una reproducción completa instrumentada, con restauración del logging vacío
original. No pools/timeouts/concurrency/CI/runtime/Railway cambiados. El diagnóstico no se usa
como reintento de aceptación. PR/merge quedan pendientes de todos los gates de aceptación.

Diagnóstico completo autorizado:1040 PASS/0fail/skip,1389 setups PostgreSQL medidos,
máximo208,893ms total/167,296ms fork/0,549ms authentication.23029 adquisiciones instrumentadas,
máximo184ms y event loop908ms; ningún timeout medido. No reproducción ni atribución concluyente
del primer incidente; no se afirma reparación de ese timeout. Logging original vacío restaurado,
0 DBs de suite restantes. Se conserva el incidente y sus límites; la aceptación requiere una
ejecución normal final independiente, sin instrumentación ni nueva relajación/retry loop.

La única aceptación final normal volvió a registrar timeout en `postgres/readiness.test.ts`,
también en `postgres/helpers.ts:69` al abrir la primera conexión de la DB disposable bajo el gate,
antes de probar readiness/negocio:1030 PASS/1 FAIL/0SKIP/0cancelled,1031 casos registrados.
Los9 subcasos readiness no llegaron a registrarse por fallar su fixture padre; no se consideran
aceptados ni skips ocultos. No se equipara el diagnóstico instrumentado1040 PASS con
aceptación: **test:db está FAIL y bloquea commit/PR/CI/GitGuardian/merge**.
No más reintentos ni corrección especulativa. Dos casos diferentes afectados por el mismo límite
de conexión del provisioning; causa exacta no confirmada. El log local incluye checkpoints de
2,026s y3,251s entre ejecuciones, pero no demuestra por sí solo la causalidad de los timeouts.
Revisión consolidada: type/lint/build/OpenAPI/generadores/workflows/diff sin otro blocker detectado;
la limitación restante es el harness/entorno QA, además de los prerequisites externos ya listados.
Antes de modificar configuración PostgreSQL/recursos/pools/timeouts/concurrency o proponer una
relajación de garantías, se necesita la decisión correspondiente según AGENTS65.1.

Entrega detenida sin commit/push/PR/CI/GitGuardian/merge. Main remoto sigue5222ee82437dcff1c5e5a691c466ddf5eaebfe7e;
trabajo conservado en la rama autorizada (11 archivos, solo tests/helpers/docs). Diff check y
validación documental final PASS. Logging QA original verificado,0 DBs de suite pendientes;
cluster exclusivo detenido mediante smart shutdown, datos/logs preservados. Inventario Railway
final continúa STAGED56/destructive=false/latestDeployment=null y API efectiva intacta.

### Reanudación autorizada — Docker, 2026-10-13

El usuario autorizó probar de nuevo al estar disponible Docker. Engine29.7.2 confirmado;
las ejecuciones fallidas anteriores usaban PostgreSQL nativo, por lo que Docker cerrado no era
una dependencia directa de aquellas ejecuciones. Se creó únicamente el contenedor local QA
stockapp-dev02-postgres-qa y su volumen propio stockapp-dev02-postgres-qa-data, con labels DEV-02,
imagen postgres:18.6 ya instalada (sin pull), ID
sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336.
Server real18.6 Debian18.6-1.pgdg13+2, mount oficial `/var/lib/postgresql`,
PGDATA `/var/lib/postgresql/18/docker`, bind exclusivo127.0.0.1:65437.
No otros contenedores iniciados ni volúmenes/datos anteriores borrados. Sin configuración
PostgreSQL, límites, pools, timeouts, concurrencia, instrumentación o assertions modificados.
Clientes nativos18.6 existentes ejecutan pg_dump/pg_restore contra este server Linux18.6;
el transport Docker del helper se valida en CI real, sin fingir GITHUB_ACTIONS localmente.

Aceptación completa normal en Docker: **1040 PASS/0fail/0skip/0cancelled/0timeout registrado**,
329199,5426ms. Incluye los9 subcasos readiness y las regresiones API-01..10/Auth/Ownership/
Security/compiled HTTP, además de los4 casos nuevos de migración y recovery. No retry loop
para verde ni supresión de fallos. Evidencia alternativa válida de QA, no atribución causal
del incidente Windows ni certificación del runtime Railway. El blocker de aceptación local
queda levantado; CI/GitGuardian/reviews del candidato exacto siguen obligatorios antes de merge.

## Revisión requerida antes de activación

- Confirmar capacidad default5GB, región/digest/version, consumo y presupuesto/alertas del proveedor.
- Aprobar activación por separado; preservar API pin5222... hasta decisión explícita sobre fuente.
- Aprobar conexión privada/predeploy/config/origins/SMTP/secrets sin usar credenciales PROD.
- Elegir destino independiente, residencia, IAM, cifrado estándar, custodia/rotación y restore identity.
- Demostrar clave/registro de supresión auténticos, retención real y verificación antes de promoción.
- Autorizar/configurar backup schedules y ejecutar recovery real medido en destino aislado;
  comprobar persistencia tras restart/redeploy, readiness/logs reales y RPO/RTO/alertas.

Ninguna de esas validaciones externas está satisfecha por stage/local/CI. Merge normal no activa
recursos ni modifica pin/API/provider state. **STOP: no accept-deploy, activación DB/API, PROD,
DNS, nuevo backup provider ni DEV-03 automático.**
