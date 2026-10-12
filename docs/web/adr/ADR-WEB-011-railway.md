# ADR-WEB-011 — Railway backend deployment

Estado: Accepted · Fecha: 2026-10-02.

Enmendado por DEV-00 el 2026-10-12; permanece Accepted. Production/staging y autodeploy main
del texto original inferior no autorizan PROD StockApp.

## Enmienda vigente — UAT-first

La topología API Node + PostgreSQL inicial se destina a UAT, primer entorno online. Railway
puede llamar `production` al entorno inicial: etiqueta del proveedor, no lanzamiento comercial.
DEV local/CI no requiere DB compartida hosted permanente. PROD futuro es NUEVO independiente
con API/DB/config/secrets/origins/cookies propios, tras aceptación UAT y sign-off; no copiar DB UAT.
Main validado→UAT solo con gate exact-commit required CI/GitGuardian comprobado en DEV-04/06
o deployment manual controlado; Wait for CI solo no prueba todos los checks. No main→PROD automático.
Drizzle/advisory lock/predeploy/fail-closed readiness y recovery se mantienen; no SQL destructivo
sin revisión ni rollback schema implícito. UAT migration/restore/supresión/rollback deben probarse
antes de PROD. No provisioning/config aplicada. [DEV-00](../DEV-00.md), [OPERATIONS](../OPERATIONS.md).

## Contexto

Railway obligatorio para API y candidato DB aprobado en ADR-004. Necesitamos migraciones y
QA de sync/auth sin tocar producción. Otras apps son referencias operacionales, no plantillas.

## Decisión original — 2026-10-02, interpretación de entornos supersedida arriba

API Node una réplica inicial + PostgreSQL por entorno production/staging aislados.
Railpack, root workspace, build filtrado, toolchain fijado, predeploy migration con lock,
start/bind PORT, /health readiness y /live liveness. GitHub autodeploy de main tras CI verde;
ningún deploy nativo Mobile incluido.
Fuente: [DEPLOYMENT](../DEPLOYMENT.md), [OPERATIONS](../OPERATIONS.md).

## Alternativas

No cambiar provider por errores de setup sin investigar evidencia. DB por cada PR suma costo y
drift; staging estable basta V1. Docker no es obligación inicial; reconsiderar solo ante blocker real.

## Consecuencias

Probar install/build/start efectivos y no dar por resuelto bootstrap por copiar config VZLegal.
Responsabilidad backup/restore/monitoring no delegada a 'DB managed'. Health deployment no es
monitor continuo, según [Railway healthchecks](https://docs.railway.com/deployments/healthchecks).
