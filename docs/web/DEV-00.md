# DEV-00 — Arquitectura UAT-first y alineación CI/CD

Decisión humana aprobada, 2026-10-12. DOCUMENTATION ONLY.
Base main después de WEB-10: `9aefde3dca16138329a5d371fb25f59e4d4d7986`, clean0/0;
rama `docs/dev-00-uat-first`. No infraestructura externa consultada ni configurada.

## Decisión y trazabilidad

**DEV → UAT → aprobación humana → PROD.** UAT es el primer entorno online.
La topología Pages Web + Railway API/PostgreSQL antes descrita como producción se destina
al despliegue inicial UAT. PROD será un entorno NUEVO e independiente, solo después de
aceptación UAT y autorización humana expresa. Main no autoriza despliegue automático a PROD.

Esta decisión supersede la interpretación production/staging de DEPLOYMENT/CI_CD y las
decisiones originales de ADR-WEB-010/011/013. Sus textos originales se conservan con enmiendas
fechadas. DELIVERY/VALIDATION y reportes CLOUD/API/WEB son evidencia histórica, no autorización
vigente de despliegue. Ningún recurso se declara desplegado ni verificado por DEV-00.

## Entornos y etiquetas de proveedor

| Entorno StockApp | Ejecución y datos | Estado / finalidad |
| --- | --- | --- |
| DEV | Web/API/PostgreSQL locales; GitHub Actions CI con DB disposable | Desarrollo y QA; no exige una DB compartida permanentemente alojada |
| UAT | Cloudflare Pages Web + Railway API + Railway PostgreSQL propios | Primer entorno online FUTURO: integración, auth, browser, aceptación, ensayos CD/rollback |
| PROD | Nuevo proyecto/deployment Pages, API y PostgreSQL Railway independientes | NO PROVISIONADO; solo tras aceptación UAT y sign-off humano |

UAT y PROD separan DB, credenciales, secretos, cookies host-only, origins, configuración SMTP
y acceso operativo. No comparten bases comerciales ni copian DB UAT a PROD; no se trasladan
secretos PROD a UAT ni a previews/PR/forks. Configuraciones se validan para cada entorno.
UAT temprano admite únicamente datos sintéticos o fixtures de prueba controlados, sin datos
reales de clientes/negocios hasta verificar protecciones legales, operativas y de seguridad.

Pages llama a la rama principal del proyecto `production branch`; Railway crea por defecto
un entorno `production`. Son etiquetas del proveedor, NO lanzamiento comercial StockApp.
Un proyecto inicial con esas etiquetas sigue siendo UAT. Preferir recursos `stockapp-web-uat`,
`stockapp-api-uat`, `stockapp-postgres-uat`; nombres/capacidades concretos se verifican antes
de provisioning en los tickets respectivos, no se crean aquí.
Fuentes consultadas 2026-10-12: [Pages branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
y [Railway environments](https://docs.railway.com/environments). Documentación no prueba settings reales.

## Propuesta de hostnames — aprobación pendiente antes de DEV-04

| Hosts ya documentados | Mapeo PROPUESTO | Decisión pendiente |
| --- | --- | --- |
| `stockapp-staging.ian-k.dev`, `api-stockapp-staging.ian-k.dev` | UAT inicial; staging es terminología histórica, no un tercer entorno obligatorio | Confirmación humana del par UAT antes de DNS/CORS/cookies/SMTP redirects |
| `stockapp.ian-k.dev`, `api-stockapp.ian-k.dev` | Reserva propuesta para futuro PROD independiente | Confirmación humana de reserva y asignación PROD; no provisioning ahora |
| `ian-k.dev/stockapp/` | Landing/legales/support independientes | No se modifica el sitio ni su publicación |

La reasignación de la topología anterior a UAT NO aprueba automáticamente sus antiguos hosts
de producción. Se propone reutilizar los nombres staging para identificar UAT y reservar el otro
par existente; no se inventa un hostname nuevo. El responsable puede aprobar otra asignación de
estos pares en DEV-04. Ningún registro DNS, certificado, cookie/origin o disponibilidad se supone
configurado; la propuesta no permite presentar UAT como producto oficialmente lanzado.

## CI actual y gate futuro main → UAT

Actualización posterior CI-OPT-01: la descripción del workflow único inferior es baseline histórica.
[La política vigente](CI-OPT-01.md) añade selección segura, Quality checks agregador y full
programada/manual/exact-SHA. No cambia UAT-first ni permite autodeploy antes del gate DEV-04.

Revisado `.github/workflows/ci.yml`: PR hacia main y push main, contents:read, install frozen,
pnpm check (format/lint/types/Domain/Application/Mobile/contracts/API/Web/tests y builds),
PostgreSQL18.6 real, db:generate reproducible, auth:generate/auth:check oficiales.
GitGuardian y reviews/checks exigidos por reglas reales siguen obligatorios para merge normal.
No workflow CD, deployment secrets, reducción de gates ni modificación de CI en DEV-00.

Flujo FUTURO: rama → PR → CI/GitGuardian required → review → merge → commit main validado
→ deployment UAT controlado → readiness/health → smoke → validación UAT.
Un PR no validado no despliega el entorno integrado ni recibe secrets/datasets. Preview estático
ficticio no concede acceso UAT/PROD y conserva controles de ramas confiables.

DEV-04/DEV-06 deben registrar SHA exacto del source/deployment, resultados required CI y
GitGuardian/reviews asociados, proyecto/entorno, build/artifact y config pública del entorno.
Si merge genera otro SHA, no reutilizar como prueba de CI el verde de un head PR diferente:
validar el commit main exacto y su trazabilidad de revisión/scan antes de desplegarlo.
Si main avanza durante la operación, comprobar nuevamente la identidad; no desplegar latest a ciegas.

Railway documenta `Wait for CI`, pero evalúa workflows Actions, ignora checks de otras apps y
no bloquea todos los resultados skipped/neutral/cancelled. No basta para nuestro gate completo.
[Fuente oficial](https://docs.railway.com/deployments/github-autodeploys). Pages permite controlar
autodeploy por rama; eso tampoco demuestra esperar todos los required checks.
DEV-04 prueba CI pending/failing/cancelled/missing, GitGuardian pendiente/fallido y carrera de
commits, con evidencia de que NO se activa la versión no validada. DEV-06 repite el ensayo integrado.
Hasta demostrar el gate completo, mantener autodeploy integrado deshabilitado y usar despliegue
manual controlado del commit ya validado; verificar la versión desplegada, no solo pulsar latest.
No se afirma soporte efectivo ni se modifica integración/provider ahora.

## Migraciones, promoción y rollback

Drizzle SQL versionado + advisory lock PostgreSQL existentes. Ejecutar predeploy una vez bajo
control del deployment, nunca en request handlers ni en cada réplica. Migración fallida bloquea
deploy/tráfico; readiness fail-closed exige DB/schema/config compatibles.
No SQL destructivo sin revisión. Rollback de código NO equivale a rollback de schema.
DEV-02/DEV-06 deben demostrar migración/recovery/rollback UAT antes de PROD.

Promoción FUTURA: aceptación UAT → release candidate identificado → sign-off humano explícito
→ mismo commit/artifact aprobado → deployment PROD controlado → smoke PROD → monitoring.
Build frontend separado por VITE_* de entorno puede ser necesario: preservar commit/release identity,
registrar artifact/config y validar ese build; nunca reconstruir desde source no revisado.
La migración PROD se revisa por separado. No copiar DB UAT a PROD ni reutilizar sus credenciales.
Main merge o aceptación UAT NO son autorización de crear PROD ni de publicarlo.

## Recovery y aceptación UAT

Browser BackupV1/AccountExport NO son disaster recovery PostgreSQL. OPERATIONS conserva backups
de servicio, copia independiente cifrada, verificación de retención/region, restore aislado y registro
API-10 de supresión separado del snapshot, aplicado antes de reabrir la API restaurada.
No se presume que Railway cubra por sí solo todos los requisitos. No jobs/backups implementados aquí.

Aceptación UAT requiere evidencia de deployment healthy/readiness fail-closed; auth/verify/reset/
revocación con SMTP configurado; smoke Web Products/Purchase/Sale/Adjustment/Void/Home/History;
aislamiento A/B; backup/export/delete202/unknown; rollback y restore con supresión; monitor/alertas
disponibles y redacción/retención; TLS/CORS/CSRF/cookies/rate/proxy; compatibilidad browser,
teclado/accesibilidad; CI/CD exact-commit probado y ningún blocker crítico abierto.
Un build o smoke de fixture local no es aceptación UAT ni QA-03 online.

PRIV-01..06/REL y gates de seguridad/backup/recovery permanecen abiertos hasta verificación real.
Los objetivos RPO/RTO/retención de OPERATIONS no se convierten en garantías verificadas/SLA.
Datos reales y promoción PROD permanecen bloqueados; aceptación sintética no elimina esos gates.

## Secuencia pendiente y alcance Web-only

DEV-00 documental → DEV-01 API/build/start UAT → DEV-02 PostgreSQL/migrations/recovery UAT
y DEV-03 Pages/Web/preview → DEV-04 hosts/TLS/CORS/env/gate exact-commit → DEV-05 monitoring/
jobs/alertas → DEV-06 SMTP/CI-CD/rollback rehearsal UAT → QA/PRIV/REL/aceptación → sign-off PROD.
DEV-01..06 continúan PLANNED y cada ejecución necesita autorización: no continuación automática.

Sync/outbox/replicación Mobile, MIG-01/02/03, EAS/stores y billing/Pro quedan DIFERIDOS para este
track Web-only; sus tickets/dependencias históricas se conservan, no se marcan completados.
QA-03/QA-04/REL conservan dependencias de la baseline integrada (MIG-03/QA-02): el responsable
debe delimitar y aprobar su aceptación Web-only antes de release, sin fingir esos gates cumplidos
ni incorporar Sync/MIG para satisfacerlos. No afecta cerrar DEV-00 documental.

Decisiones humanas futuras abiertas: mapeo DNS antes de DEV-04; región/SMTP/proveedores y retención
real en sus tickets; aceptación QA/REL Web-only y promoción PROD explícita. No hay decisión pendiente
que impida esta actualización documental. Sin UI/runtime/auth/negocio/endpoints/schema/contracts/
BackupV1/AccountExport/deletion/deps/secrets/CI changes. STOP después de DEV-00 DONE/MERGED.
