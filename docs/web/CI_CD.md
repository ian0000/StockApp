# CI/CD futuro

API-06 incorpora void-sales al required test:db existente y focused test:void-sales; sin skips/opcional/continue-on-error ni cambios de workflow/deploy. Validar frozen install/check/build/OpenAPI/DB/Auth sin drift y CI/GitGuardian del head final antes de merge normal/main clean0/0. Decisión humana Cloud documentada; STOP final API-06, sin API-07+ automático. [Evidencia](API-06.md).

Batch humano API-04→API-05→API-06 vigente: cada ticket tiene rama/commit/PR/checks/merge independientes. API-05 añade tests de ajustes al required existente. Avanzar solo con todos los gates PASS, CI/GitGuardian del head final, merge normal y main limpio0/0; cualquier STOP condition detiene el batch. STOP final API-06, sin deploy. Las notas inferiores describen autorizaciones históricas ya sustituidas por este batch. [API-05](API-05.md).

API-04 integra test/purchases en test:db required existente, sin skip/optional/continue-on-error. Frozen install/check/build/OpenAPI y generate DB/Auth sin drift; CI/GitGuardian del head final antes de merge normal. STOP después de API-04/main limpio0/0, sin API-05/WEB-01/SYNC-01 automático. [Evidencia](API-04.md).

API-03 integra tests/sales en test:db del required Quality checks existente; sin skip/optional/continue-on-error ni cambios de workflow/deploy. Frozen install, pnpm check/build/OpenAPI y generación DB/auth sin drift son gates. STOP después de API-03/main limpio0/0, sin API-04/WEB-01/SYNC-01 automático. [Evidencia](API-03.md).

API-02 integra test/products/*.test.ts en test:db required existente, sin skip/optional/continue-on-error. Build API mantiene typecheck y empaqueta Application/Domain puros con esbuild0.28.2, preservando módulos API y entry points Node. Frozen lockfile incorpora dos workspace links y esbuild dev; schema/auth generation sigue sin drift. STOP después de API-02, main limpio0/0; sin API-03/SYNC-01/WEB-01 ni deploy. [Evidencia](API-02.md).

API-01 integra test/commands/*.test.ts en pnpm test:db y required Quality checks existente,
con PostgreSQL18.6 real y SMTP local. Fingerprint/header y OperationParams/manifest/OpenAPI se
validan también en pnpm check. Sin workflow opcional/skip/continue-on-error/deploy. Generadores
Drizzle/auth deben permanecer sin diff. PR/merge autorizado solo con checks/reviews verdes; STOP
main clean0/0 sin API-02/SYNC-01/WEB-01. [API-01](API-01.md).

CLOUD-06 añade `contracts:openapi` y `contracts:openapi:check`. `pnpm check` ejecuta primero el check
de artefacto, que compara generación in-memory y falla ante stale; el required Quality checks de CI
lo hereda sin nuevo job opcional. Check corre desde checkout limpio sin dist/global tooling.
[OpenAPI](openapi/README.md), [evidencia](CLOUD-06.md). No cambia CD ni despliega servicios.

Actual: `.github/workflows/ci.yml` corre `pnpm check` en PR a main/push main, Node 22.16.0,
pnpm fijado y install frozen lockfile. CLOUD-01 añade build:api al check; sin root build ni CD.
Workspaces nuevos participan automáticamente en formato/lint/typecheck/tests. CLOUD-02 añade al
mismo job quality un servicio postgres:18.6, verificación de generate sin diff y `pnpm test:db`.
TEST_DATABASE_URL local disposable es explícita en ese paso, sin passwords ni secrets externos.
Missing DB/config/constraints/migrations fallan el job; no tests skipped ni allow-failure.
CLOUD-03 añade auth:generate reproducible/auth:check oficiales y extiende test:db con auth real
y smoke HTTP compilado usando SMTP local efímero. check ya ejecuta SMTP adapter sin DB.
No nuevo job opcional ni SMTP secrets/servicio externo; required quality mantiene estos gates.

Objetivo: GitHub Actions **CI only**; Cloudflare Pages CD Web, Railway CD API.
No workflow que haga merge/PR/deploy Mobile. Build EAS separado y explícito.

## Gates

CI shared: install frozen, format:check, lint, typecheck, tests Domain/Application/Mobile,
contratos API/OpenAPI consistency y links documentales. Jobs API: build de server, Postgres real
efímero, migración desde vacío y upgrade fixture, integration ownership/idempotency/concurrency.
Jobs Web: build Vite, rutas/deep links, E2E core con API QA/dataset aislado.
Shared domain/contracts/lockfile/config changes disparan todos los consumidores. Paths app-only
pueden omitir jobs ajenos con evidencia; required summary job no queda skipped por filtros.

Scripts API dev/build/start existen en CLOUD-01; db:generate/db:migrate/test:db en CLOUD-02.
Scripts Web y CD siguen pendientes. CI pin de runtime/acciones y permissions contents:read; secrets producción ausentes
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

## Gate CLOUD-04

El mismo required Quality checks test:db añade ownership, FK0003 y compiled HTTP con SMTP/CLI;
ningún job opcional/skip ni secrets externos. Workers limitados a2, concurrency funcional dentro
de suites preservada. Drizzle/auth generation/check siguen obligatorios. CI green + GitGuardian +
reviews/reglas exigidas antes de merge, sin bypass. STOP main clean0/0; no CLOUD-05 automático.
Reporte [CLOUD-04](CLOUD-04.md).

## Gate CLOUD-05

Quality checks ejecuta pnpm check, generadores reproducibles oficiales y pnpm test:db que ahora
incluye test/security/*.test.ts junto a PostgreSQL18.6/auth/ownership/compiled HTTP/SMTP local.
Security no es opcional ni un workflow aparte sin requisito. IP de harness/socket, no Railway fake.
Workflow autorizado commit/push/PR→esperar CI/GitGuardian/reviews/checks/reglas reales→merge normal
sin bypass→main fast-forward/clean0/0→STOP. No CLOUD-06/API-01/deploy automático. [CLOUD-05](CLOUD-05.md).
