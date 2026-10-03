# ADRs Cloud/Web

Todos fechados 2026-10-02, estado **Accepted dentro de esta baseline para revisión**.
Implementación requiere revisión humana del conjunto. Fuentes normativas están enlazadas,
no se reimplementan reglas financieras en ADRs. Superseden solo decisiones provisionales de cloud
de arquitectura local, según [transiciones](../README.md).

| ID | Título | Decisión | Estado |
| --- | --- | --- | --- |
| [ADR-WEB-001](ADR-WEB-001-repo.md) | Repo / monorepo topology | Evolucionar workspace StockApp, landing separada | Accepted |
| [ADR-WEB-002](ADR-WEB-002-frontend.md) | Web frontend framework | React + Vite SPA strict | Accepted |
| [ADR-WEB-003](ADR-WEB-003-backend.md) | Railway backend stack | Node + Fastify + dominio compartido | Accepted |
| [ADR-WEB-004](ADR-WEB-004-database.md) | Cloud database technology/provider | PostgreSQL Railway + Drizzle/pg | Accepted |
| [ADR-WEB-005](ADR-WEB-005-auth.md) | Authentication architecture | Better Auth local API/DB, sesiones opacas | Accepted |
| [ADR-WEB-006](ADR-WEB-006-api.md) | API style and versioning | REST JSON /v1 y comandos idempotentes | Accepted |
| [ADR-WEB-007](ADR-WEB-007-authority.md) | Mobile/cloud source-of-truth model | SQLite inmediato, cloud aceptado compartido | Accepted |
| [ADR-WEB-008](ADR-WEB-008-sync.md) | Synchronization protocol | Outbox comandos + receipts + delta/cursor | Accepted |
| [ADR-WEB-009](ADR-WEB-009-conflicts.md) | Conflict resolution strategy | Política específica por entidad; snapshots protegidos | Accepted |
| [ADR-WEB-010](ADR-WEB-010-pages.md) | Cloudflare Pages frontend deployment | Proyecto SPA independiente, root workspace | Accepted |
| [ADR-WEB-011](ADR-WEB-011-railway.md) | Railway backend deployment | API+DB production y staging aislado | Accepted |
| [ADR-WEB-012](ADR-WEB-012-offline.md) | Web offline strategy | Online-first, sin PWA/write queue | Accepted |
| [ADR-WEB-013](ADR-WEB-013-hostnames.md) | Public/app/API hostname strategy | ian-k.dev/stockapp + stockapp + api-stockapp | Accepted |

No ADR por detalle trivial. ORM/representation en ADR-004; estado UI en ADR-002;
ownership en ADR-005/007; migración/backup normativos en MIGRATION/OPERATIONS.
Future: MFA, PITR, cámara browser, offline web y Team fuera del alcance; no decisiones
Proposed necesarias para iniciar API/Web foundation.
