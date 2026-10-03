# ADR-WEB-001 — Repo / monorepo topology

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Repo ya es pnpm workspace con Mobile, Domain, Application y shared vacío.
Tres implementaciones financieras independientes aumentarían riesgo de divergencia.
Landing ian-k.dev es marketing/legales y tiene ciclo editorial independiente.

## Decisión

Mantener Cloud/Web en `ian0000/StockApp`: añadir apps/web, apps/api y packages/contracts
solo en tickets posteriores. Reusar domain/application existentes con adaptadores.
Landing permanece en repo independiente. Builds/deployments por app, revisión compartida
para cambios domain/contracts; sin Nx/Turborepo requerido.
Fuente: [ARCHITECTURE](../ARCHITECTURE.md).

## Alternativas

Repos separados aislarían CI pero exigirían publicar/versionar paquetes y coordinar contratos
con Mobile. Integrar inventario a ian-k.dev mezcla marketing con sesiones y dominio.
Ninguna ventaja justifica el costo frente al workspace que ya funciona.

## Consecuencias

CI debe incluir todos los consumidores ante shared changes; CD filtra paths cuidadosamente.
API compatible con binarios antiguos; merge main no distribuye Mobile automáticamente.
Nueva estructura es target, no carpetas implementadas por esta entrega.
