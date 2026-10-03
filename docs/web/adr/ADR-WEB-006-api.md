# ADR-WEB-006 — API style and versioning

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Mobile instalado y SPA tienen ciclos distintos. Operaciones inventario son comandos atómicos,
no CRUD libre del estado que cada cliente desea.

## Decisión

REST JSON `/v1`, auth `/api/auth` separado, health `/health`/`/live` fuera de versionado.
Envelope operationId/preconditions, receipts, errores tipados/requestId, keyset pagination.
Contratos comunes/OpenAPI congelados antes de features; incompatible en /v2 con coexistencia.
Fuente: [API](../API.md).

## Alternativas

GraphQL flexible pero no necesario para estas consultas/comandos, complica límites/seguridad.
tRPC acopla releases TypeScript y no elimina necesidad de versionado para Mobile antiguo.
SQL/DB directo en cliente permite bypass de invariantes y no cumple la arquitectura.

## Consecuencias

Rutas simples testeables y clientes desacoplados de ORM. Un middleware auth no sustituye scope
de queries. Ningún endpoint escribe stock arbitrario. Cloud-06 fija contrato antes de sync/Web.
