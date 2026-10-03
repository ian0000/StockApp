# ADR-WEB-003 — Railway backend stack

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Railway es restricción aprobada; API debe proteger transacciones y dominio TS existente.
Arquitectura antigua §37 desaconsejaba backend propio sin necesidad; este ticket exige
comandos server-authoritative, auth y sync explícitos, y sustituye esa recomendación provisional.

## Decisión

Node 22 compatible con baseline, Fastify, strict TS, Drizzle/pg, Better Auth,
Domain/Application del workspace. Una API modular pequeña, sin microservicios.
JSON Schema validación/serialización de transporte, tipos derivados en contracts.
Fuente: [ARCHITECTURE](../ARCHITECTURE.md), [API](../API.md).

## Alternativas

Express es viable pero requiere ensamblar validación y contratos explícitos adicionales;
no se elige por presencia en otras apps. Nest añade DI/decoradores y estructura que no necesitamos.
Hono favorece edge/minimalidad; no hay requisito edge dado target Node transaccional Railway.

## Consecuencias

Ports PostgreSQL y wrapper de comandos controlan ownership/locking/receipts, sin duplicar dinero.
Fastify es nueva dependencia a justificar/fijar en foundation, no instalada hoy.
Compatibilidad Better Auth/Fastify se verifica como aceptación de CLOUD-03.
[Schemas Fastify](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) revisados.
