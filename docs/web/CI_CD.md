# CI/CD futuro

Actual: `.github/workflows/ci.yml` corre `pnpm check` en PR a main/push main, Node 22.16.0,
pnpm fijado y install frozen lockfile. CLOUD-01 añade build:api al check; sin root build ni CD.
Workspaces nuevos participan automáticamente en formato/lint/typecheck/tests. Workflow sin cambios.

Objetivo: GitHub Actions **CI only**; Cloudflare Pages CD Web, Railway CD API.
No workflow que haga merge/PR/deploy Mobile. Build EAS separado y explícito.

## Gates

CI shared: install frozen, format:check, lint, typecheck, tests Domain/Application/Mobile,
contratos API/OpenAPI consistency y links documentales. Jobs API: build de server, Postgres real
efímero, migración desde vacío y upgrade fixture, integration ownership/idempotency/concurrency.
Jobs Web: build Vite, rutas/deep links, E2E core con API QA/dataset aislado.
Shared domain/contracts/lockfile/config changes disparan todos los consumidores. Paths app-only
pueden omitir jobs ajenos con evidencia; required summary job no queda skipped por filtros.

Scripts API dev/build/start existen en CLOUD-01; nombres web/migrate target en DEPLOYMENT
siguen pendientes. CI pin de runtime/acciones y permissions contents:read; secrets producción ausentes
en PR/forks. Seguridad dependency review y scans sin imprimir .env ni usar datasets reales.

## Flujo

main actualizado → rama ticket → cambio mínimo/tests → quality gates → diff completo → commit
→ push autorizado → PR → CI required → revisión → merge.
Desde 2026-10-03 el usuario autorizó al agente crear PR y hacer merge, sin bypass de CI ni deploy;
esta autorización sustituye la preferencia manual anterior, sin auto-merge bot.
CD de commit aprobado, migración antes de promoción API, health y smoke web/API/sync; si falla,
no anunciar release. No auto-merge ni force push. Un merge no fuerza nuevo binario móvil.

Staging branch para rehearsal con DB ficticia separada; actualizar desde commit revisable sin
copiar datos production. Freeze contracts CLOUD-06 permite páginas Web en paralelo a sync,
con mocks que satisfacen el mismo schema, no endpoints ad hoc. CD paths/config de monorepo en DEPLOYMENT.

Cambios de contrato /v1 aditivos; incompatible se bloquea en CI y requiere /v2/coexistencia.
API anterior disponible mientras la distribución Mobile instalada requiera su contrato;
retiro de versión necesita plan/revisión, nunca deshabilitar Free local por update obligatorio.
