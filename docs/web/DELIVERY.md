# Entrega para revisión — ARCH-STOCKAPP-WEB-001

## Git

Base: `e2e76c623d5c1043fdd15d2710200ad5891c8ec0` de main actualizado.
Rama: `docs/stockapp-web-architecture`. Mensaje commit:
`docs: define StockApp web and cloud architecture`.
Commit definitivo, resultado push, working tree y ahead/behind se registran en la entrega final
del chat después de verificarlos; no se incrusta el hash de un commit dentro de sí mismo.
PR y merge manuales; sin implementación siguiente autorizada.

## Current-state audit

Mobile: Expo 57/RN 0.86.3/React 19.2.3, strict TypeScript, Router, SQLite/expo-sqlite/Drizzle.
Ocho tablas y cuatro migraciones; transacciones exclusivas; UUIDv7/Clock inyectados.
Domain puro, Application casos de uso/ports, shared vacío; solo apps/mobile existe.
Reglas puras más integración SQLite real y doubles según test; `pnpm check` fresco PASS.
Sin API/auth/sync propios; enlaces legales externos explícitos y telemetría transitiva ML Kit
no confundida con transmisión propia de inventario. Backup JSON V1 y restore REPLACE atómico.
Expo web es preview sin persistencia. EAS alpha/production profiles y CI calidad actuales,
sin deploy Cloud/Web ni artefacto de store validado en esta tarea.
Referencias/código exactos: [CURRENT_STATE](CURRENT_STATE.md).

## Target architecture y hosts

Web: React/Vite/Router/TanStack Query, Pages, online-first sin PWA/write queue.
Backend: Node 22/Fastify/TypeScript strict, Railway. DB: PostgreSQL Railway/Drizzle + pg.
Auth: Better Auth email/password verificado, SMTP y sesiones opacas DB; web cookie host-only
Secure/HttpOnly; Mobile plugin Expo/SecureStore. Auth no sustituye ownership.
Mobile persistence: SQLite conservado; cloud es autoridad de comandos aceptados compartidos.
Sync: outbox comandos/retry, receipts, revisiones/cursor/delta completo y conflictos específicos.

Public landing `https://ian-k.dev/stockapp/`; app target `https://stockapp.ian-k.dev`;
API target `https://api-stockapp.ian-k.dev`. DNS/servicios no configurados aquí.
Topología: monorepo StockApp con apps/mobile existente, apps/web/api y packages/contracts futuros,
Domain/Application existentes; ian-k.dev conserva repo independiente.

## Reuse y ownership

Share directly: Money/Percentage, InventoryState, cost/profit/margin/markup/suggest,
modelos y planes puros de compra/venta/ajuste/reversal; Application con ports/adaptadores explícitos.
Share conceptually: queries, schemas por dialecto y UX, sin copiar UI RN ni SQL SQLite a Postgres.
Server-only: auth/ownership/locks/receipts/changeSets/import/deletion. Mobile-only:
SQLite/Expo/camera/files/SecureStore/outbox. Web-only: DOM/Router/Query/forms/download.
User → un Business propietario → un Inventory operativo. No Team/membership N:M.
Contexto autorizado server y FK/queries compuestos aíslan datos; nunca filtros del frontend como defensa.

## Sync y database

Outbox atómica; IDs UUIDv7 estables y unique receipt `(businessId,operationId)`/hash.
Cursor opaco inventory/generation/revision/highWaterMark; revisión asignada bajo lock hasta commit,
sin timestamp móvil ni secuencia global como cursor. ChangeSets completos; página+cursor SQLite tx.
Tombstones/delta 90 días, receipt vida dataset; archived/VOIDED son updates.
Sale delta compatible solo si costo coincide; Purchase/Adjustment state exacto; Product version;
void última inequívoca. Propuestas conflictivas preservadas para revisión, sin recalcular profit.
Cloud timestamps UTC separan recepción de effectiveAt/createdAt local; orden por server revision.

Schemas/migrations Postgres son de API, SQLite de Mobile, sin shared dialect. Dinero BIGINT scaled
10^6 con rango JS safe; JSON string; Domain Money number entero seguro, nunca float decimal.
Unknown null distinto de zero. Import inicial preserva snapshot/historia, no replay ni merge cloud lleno.

## Auth/API/deployment

Sesiones revocables 7 días absolutos; CSRF/cookies/Origin; propietario único, piloto manual habilitado.
Borrado orquesta identidad+Business/dataset con revocación inmediata, job durable y backup supresión;
copias locales/offline/exportadas requieren explicación, no borrado remoto ficticio.
API REST /v1 con auth /api/auth; validation frontend UX/transport shape+security/Domain invariants;
error code/message/fieldErrors/requestId, sin stacks; /health readiness y /live proceso.

Pages SPA build desde workspace raíz/output apps/web/dist; Railway root workspace, build/start
fijados y migrate predeploy con lock. Los scripts target no fueron creados/ejecutados aquí.
CI Actions only; CD proveedores después de main revisado/gate; producción/staging aislados.
Previews estáticos ficticios y staging autenticado; CORS exacto por environment, no wildcard pages.dev.
VITE_* solo API URL/env público; DB/auth/SMTP/backup secrets solo servidor.

## ADRs y diagramas

13 ADRs Accepted: tabla ID/title/decision/status en [ADR index](adr/README.md).
13 diagramas: archivo/purpose/status en [Diagram index](diagrams/README.md).
PlantUML compile/render NOT RUN (no herramienta disponible); revisión manual y estructural
sin remote includes. No se instalaron herramientas ni se presume validación visual.

## Web V1 paridad/backlog

MUST HAVE: Inicio, productos/alta/edit/archive/details/bajo, ventas múltiples, compra de un
producto, detalles, History, void elegible, conteo físico, precios/costos/rentabilidad/sugerencia,
barcode teclado, backup/import y settings/identity/lifecycle.
SHOULD HAVE: apariencia simple. LATER: cámara browser, Undo temporal, desarchivado, gráficas,
offline web/PWA, CSV/Excel; no capacidades inventadas del móvil actual.

47 tickets en fases Foundation/Contracts, Server commands/read models, Sync/Migration,
Web, DevOps y QA/Privacy/Release. Dependencias explícitas y grafo sin ciclos; críticos:
CLOUD-01→DB/auth/ownership→contracts/commands→sync/proyección/conflictos→import→QA→readiness.
Primer recomendado CLOUD-01, únicamente después de revisión humana.

## Release blockers/open questions

Foundation architectural BLOCKING: **0** después de revisión de esta baseline.
NON-BLOCKING: región/SMTP/destino segunda copia en tickets operacionales, pricing/billing/trial
antes de lanzamiento Pro comercial, features Future. No se convierten en permisos de release.
Release blockers todavía abiertos: Privacy/Terms cloud, tratamiento y proveedores, borrado funcional/
enlace público, declaraciones Play/App Store, consentimiento, security/sync/recovery/performance
probados y soporte. Modelo operativo y retención están definidos; implementación y evidencia faltan.

Docs/ADRs consistencia manual PASS; links/dependency/structural check y git diff --check en
[VALIDATION](VALIDATION.md). Repo quality gates `pnpm check` PASS; build raíz inexistente NOT RUN.
Blockers de la entrega documental: NONE. Observaciones: PlantUML NOT RUN y páginas legales
públicas no accesibles con herramienta web; se verificó checkout local read-only.

Final status: **ARCH-STOCKAPP-WEB-001 READY FOR REVIEW**.

## Todos los archivos generados

El inventario siguiente incluye Markdown, ADRs, índices y fuentes PlantUML. Ningún archivo funcional.

- [API.md](API.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [AUTH.md](AUTH.md)
- [BACKLOG.md](BACKLOG.md)
- [CI_CD.md](CI_CD.md)
- [CURRENT_STATE.md](CURRENT_STATE.md)
- [DATA_MODEL.md](DATA_MODEL.md)
- [DELIVERY.md](DELIVERY.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [DOMAIN_REUSE.md](DOMAIN_REUSE.md)
- [MIGRATION.md](MIGRATION.md)
- [OBSERVABILITY.md](OBSERVABILITY.md)
- [OPERATIONS.md](OPERATIONS.md)
- [PARITY_MATRIX.md](PARITY_MATRIX.md)
- [PRIVACY_IMPACT.md](PRIVACY_IMPACT.md)
- [PRODUCT.md](PRODUCT.md)
- [README.md](README.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [SCOPE.md](SCOPE.md)
- [SECURITY.md](SECURITY.md)
- [SYNC.md](SYNC.md)
- [TESTING.md](TESTING.md)
- [VALIDATION.md](VALIDATION.md)
- [WEB_UX.md](WEB_UX.md)
- [adr/ADR-WEB-001-repo.md](adr/ADR-WEB-001-repo.md)
- [adr/ADR-WEB-002-frontend.md](adr/ADR-WEB-002-frontend.md)
- [adr/ADR-WEB-003-backend.md](adr/ADR-WEB-003-backend.md)
- [adr/ADR-WEB-004-database.md](adr/ADR-WEB-004-database.md)
- [adr/ADR-WEB-005-auth.md](adr/ADR-WEB-005-auth.md)
- [adr/ADR-WEB-006-api.md](adr/ADR-WEB-006-api.md)
- [adr/ADR-WEB-007-authority.md](adr/ADR-WEB-007-authority.md)
- [adr/ADR-WEB-008-sync.md](adr/ADR-WEB-008-sync.md)
- [adr/ADR-WEB-009-conflicts.md](adr/ADR-WEB-009-conflicts.md)
- [adr/ADR-WEB-010-pages.md](adr/ADR-WEB-010-pages.md)
- [adr/ADR-WEB-011-railway.md](adr/ADR-WEB-011-railway.md)
- [adr/ADR-WEB-012-offline.md](adr/ADR-WEB-012-offline.md)
- [adr/ADR-WEB-013-hostnames.md](adr/ADR-WEB-013-hostnames.md)
- [adr/README.md](adr/README.md)
- [diagrams/README.md](diagrams/README.md)
- [diagrams/c4-components-api.puml](diagrams/c4-components-api.puml)
- [diagrams/c4-components-web.puml](diagrams/c4-components-web.puml)
- [diagrams/c4-containers.puml](diagrams/c4-containers.puml)
- [diagrams/c4-context.puml](diagrams/c4-context.puml)
- [diagrams/data-ownership.puml](diagrams/data-ownership.puml)
- [diagrams/deployment.puml](diagrams/deployment.puml)
- [diagrams/sequence-conflict.puml](diagrams/sequence-conflict.puml)
- [diagrams/sequence-first-cloud-migration.puml](diagrams/sequence-first-cloud-migration.puml)
- [diagrams/sequence-login.puml](diagrams/sequence-login.puml)
- [diagrams/sequence-mobile-offline-sale.puml](diagrams/sequence-mobile-offline-sale.puml)
- [diagrams/sequence-sync.puml](diagrams/sequence-sync.puml)
- [diagrams/sequence-web-sale.puml](diagrams/sequence-web-sale.puml)
- [diagrams/system-boundaries.puml](diagrams/system-boundaries.puml)
