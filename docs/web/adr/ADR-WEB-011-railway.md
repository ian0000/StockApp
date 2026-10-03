# ADR-WEB-011 — Railway backend deployment

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Railway obligatorio para API y candidato DB aprobado en ADR-004. Necesitamos migraciones y
QA de sync/auth sin tocar producción. Otras apps son referencias operacionales, no plantillas.

## Decisión

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
