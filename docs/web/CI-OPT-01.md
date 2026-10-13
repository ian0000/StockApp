# CI-OPT-01 — Selective quality y full regression

Base verificada: main `c0a21cc7e9d01bb972aa6c041f15b9e406c7190a` después de DEV-00,
clean0/0. Rama `chore/ci-opt-01-selective-quality`. Scope: únicamente CI/QA/documentación.
DEV-01..06, provisioning, deployment, PROD, Sync/MIG y funcionalidades quedan fuera.

## Grafo y selección

`scripts/ci/policy.mjs` deriva workspace dependencies/dev/peer, imports/aliases de fuentes y scripts
de build/generación. El plan incluye evento, base/head, cambios A/M/D/R/C, grafo, jobs y razones.
Relaciones verificadas (consumidor → dependencias):

| Consumidor | Dependencias workspace/source/build |
| --- | --- |
| Domain / Contracts / Shared | Ninguna |
| Application | Domain |
| API | Application, Contracts, Domain |
| Web | Application, Contracts, Domain; validators estáticos generados por Contracts |
| Mobile | Application, Domain |

El cierre transitivo selecciona consumidores reales; si Mobile empieza a consumir Contracts
directa/indirectamente, su validación queda incluida. Workspace desconocido o grafo unavailable
fuerza full. No se asume que el nombre del archivo sea suficiente.

| Cambio | Jobs además de Policy | PostgreSQL | Motivo |
| --- | --- | --- | --- |
| Markdown ordinario | Ninguno | No | Format global y refs/whitespace/fences de docs cambiados, classifier/workflow checks |
| Web src/styles/tests aislados | Web | No | Lint/types/todos los tests/build y comparación byte a byte de validators freshly generated |
| API src/tests, schema/persistence/drizzle | API | Full `test:db` | No se ha probado un mapping seguro a DB focused; conserva auth/ownership/security/compiled HTTP/migrations |
| Contracts src/tests/OpenAPI artifact | Contracts + consumidores API/Web, Mobile si depende | Full `test:db` vía API | Types/strict schemas/generación/HTTP/integración pueden afectar a consumidores |
| Mobile src/app/tests aislados | Mobile | No | Lint/types/todos los tests, sin EAS/release |
| Domain/Application/Shared | Full | Full | Impacto financiero/compartido en todos los consumidores |
| QA fixtures/helpers/setup, runner DB, configuraciones, workflows/policy/AGENTS/lockfile | Full | Full | Infraestructura/selección/global de alto riesgo |
| Unknown, D/R/C/T/U, path inseguro, diff vacío/invalid/unavailable | Full | Full | Fail-closed; no inferencia de docs-only |
| Schedule/manual/release candidate | Full | Full | No depende de archivos cambiados |

Archivos ejecutables dentro de docs, artifact OpenAPI, public deployment configs y generated Web
no son documentación ordinaria. Paths se leen como JSON/NUL y nunca como fragmentos de shell.
PR usa merge-base base/head con fetch-depth0; push usa before/after. No HEAD~1. Diff unavailable
produce full; checkout de candidato incorrecto falla, no se acepta otro SHA.

## Workflows y garantías

Antes: un job Quality checks con `pnpm check`, generadores y `test:db` siempre.
Ahora: Classify changes → Policy + jobs seleccionados → **Quality checks** (`if: always()`).
Full es reusable; no duplica jobs Web/API/Mobile/Contracts cuando ya corre full. Policy siempre
es requerida. Los scripts de cada job usan una lista estática y gates secuenciales.

El agregador vuelve a calcular evento/diff/grafo y compara el plan completo. Exige success de
classifier y jobs seleccionados, reports completos de los comandos esperados y mismo head SHA.
Fallo/cancelación/timeout/missing/skipped seleccionado/report incompleto no pueden producir verde.
Jobs no seleccionados deben estar skipped y no presentar reports. Artifact ausente falla.
Artifacts incluyen run_attempt para aislar ejecuciones y evitar reutilizar mediciones de un attempt anterior.
Las pruebas incluyen Git real divergente y ejecución del CLI agregador con reports inválidos.

`pnpm check` conserva OpenAPI/format/lint/types/todos los tests/API build/Web build. Root lint/test
añaden CI lint/tests sin quitar las validaciones existentes. `pnpm test:db` y el runner PostgreSQL
permanecen literalmente intactos. No cambia pool.max/connectionTimeoutMillis/concurrency2 ni
resources/timeouts de QA; workers siguen en ubuntu-latest con timeout15min y postgres18.6 real.
Concurrencia PR/main existente conservada; full independiente no cancela candidatos en curso.

Protección real consultada: ruleset20942932 requiere `Quality checks` (integration15368), sin
required approving reviews actuales, sin force/bypass. **GitGuardian no figura en ese required
status list**, pero sigue siendo gate operativo obligatorio por instrucción del proyecto antes
de merge. Quality checks no verifica GitGuardian ni lo presume verde. Revisar independientemente
todos los checks/reviews vigentes y GitGuardian del SHA exacto; no modificar protección.

## Full diaria y candidato manual

`.github/workflows/full-regression.yml`: schedule diario `03:23 America/Guayaquil` (08:23 UTC),
subject to GitHub scheduling delays; workflow_dispatch solicita `candidate_ref` y `expected_sha`
completo obligatorio. Checkout/resolve/report deben concordar exactamente. Ref avanzó/otro SHA
→ fallo. Todas las ejecuciones corren `pnpm check`, validators, docs/workflow checks, Drizzle/Auth
generate sin drift, auth:check y full test:db con PostgreSQL18.6. Sin skips/continue-on-error.
Full regression checks valida candidato y report aunque los jobs previos fallen.

Un scheduled failure queda rojo y exige investigar regresión; el estado del primer cron es
**NOT RUN hasta observar una ejecución real**. Simulaciones de schedule prueban política full,
no certifican una ejecución nightly. Manual release validation exitosa de otro SHA no cuenta.
Un futuro PROD necesita full exitoso del candidato exacto y aprobación humana; no hay promoción
automática. Main→UAT requiere CI selectivo/GitGuardian del commit exacto, mapping artifact y smoke,
configuración probada en DEV-04; provider autodeploy permanece deshabilitado hasta ese gate.
Ningún workflow contiene credenciales Railway/Cloudflare, deployment tokens ni operaciones CD.

## Instrumentación y baseline medido

Runner genera JSON de elapsed por comando/build/PG/generadores y fases de `pnpm check`, incluyendo
duraciones TAP por paquete. No captura stdout/datasets/env/secretos. Plan/reports/summary son artifacts
del run. `ci-timings.yml` se activa al completar CI/Full regression, ejecuta código de default branch
y consulta metadata con Actions read-only: checkout/setup/install/PG initialization/job durations
y total desde creación/inicio hasta último job finalizado. Candidate JSON se lee, nunca se ejecuta.
Duraciones paralelas no se suman. Artifacts de timings se separan de la política de aceptación.

Baseline real: [DEV-00 CI run38319573769](https://github.com/ian0000/StockApp/actions/runs/38319573769),
head `744f211`, job115044166450. Timestamps de API Actions/logs, no estimación por test counts:

| Etapa | Segundos medidos |
| --- | ---: |
| Checkout / pnpm setup / Node setup / install | 1 / 5 / 11 / 4 |
| PostgreSQL initialization | 13 |
| pnpm check total (GitHub step) | 143 |
| OpenAPI / format / lint / typecheck (log stage intervals) | 1.556 / 10.337 / 29.183 / 23.008 |
| Workspace tests wall interval (packages concurrentes) | 52.642 |
| API build / Web build (log stage intervals) | 9.909 / 15.675 |
| DB generate / Auth generate+check (GitHub steps) | 1 / 5 |
| PostgreSQL suite | 207 |
| Quality job / workflow creación→updated completion | 399 / 401 |

| Paquete tests | TAP duration segundos (no sumar por concurrencia) |
| --- | ---: |
| Contracts | 6.268 |
| Domain | 6.171 |
| Shared | 0.017 |
| Application | 5.186 |
| API | 20.266 |
| Mobile | 35.613 |
| Web | 33.263 (generación/build separado) |

2473 workspace/1022 PostgreSQL son conteos históricos, no timing. CI-OPT-01 se clasifica FULL por
cambiar CI: no demuestra la reducción de un futuro PR docs/Web aislado. Los nuevos tiempos se
leen de los artifacts/runs de este PR; no se declara porcentaje de mejora sin un before/after
comparable. Policy/aggregation/setup extra son costo visible de las garantías de selección.

## Validación y workflow local

Feedback focused: `pnpm ci:test`, lint/typecheck/test del paquete afectado. Antes de PR, usar el
impacto conservador: `pnpm ci:classify` local sin contexto confiable fuerza full; CI sí usa payload
real. `pnpm ci:run policy|web|api|mobile|contracts|full` ejecuta listas estáticas y genera reports.
API/full requieren TEST_DATABASE_URL local y utilizan el runner existente. No configurar un token
de proveedor. `pnpm ci:workflows` descarga actionlint1.7.12 gratuito fijado+SHA256 verificado,
en temporal propio; valida YAML/expresiones de todos los workflows sin nueva dependencia de app.

Gates obligatorios de CI-OPT-01: classifier/integration/failure simulations, actionlint, OpenAPI,
pnpm check, build:api, build:web, test:db completo, db/auth generate sin drift/auth:check y diff
check/review. Evidencia local y provider se reporta por separado en la entrega/PR; ninguna prueba
de negocio eliminada/skip/relajada ni cambio financiero/API/UI/schema/dependencies de apps.
Warning Vite de bundle grande se conserva; splitting/limits no forman parte de este ticket.

AUTO-FIX durante implementación: selección ignora carpetas locales `.expo` sin package workspace;
fuente de verdad pnpm-workspace/manifests reales. Hardening del selector trata un cambio malformado
como full y rechaza resultados de jobs fuera del plan; fuente de verdad aceptación fail-closed del
ticket. Solo scripts nuevos/tests de CI, comportamiento productivo unchanged.

Primer full local (working tree, antes del commit): check141.052s, test:db310.935s de wrapper,
309.036s TAP,1022 PASS/0fail/0skip/0timeout; format/lint/types/builds/OpenAPI/generadores/validators
PASS, cero drift. Local Windows no es comparable al baseline Linux para medir mejora CI.
Tras el hardening de selección: check2545 PASS (2473 workspace +72 CI), API/Web builds explícitos PASS;
warning Vite existente1883.57kB/285.01kB gzip preservado. Provider se verifica en PR.
Primer run CI-OPT real38337651758: metadata GitHub de jobs skipped puede finalizar antes de su
started_at (02:36:23→02:36:22 UTC). AUTO-FIX solo en medición: skipped/interval inválido → null,
nunca -1 ni cero inventado. Cuatro tests adicionales; no cambia selección/gates ni producción.
Ese run bloqueó correctamente Quality checks por un fixture de Git temporal que heredaba
CI_CANDIDATE_SHA del repo real. Reproducido localmente con esa variable; AUTO-FIX test-only:
candidate SHA del fixture y GITHUB_OUTPUT propio/aislado. Fuente: ownership del repositorio temporal
y verificación de SHA existente. No relaja el comparador ni assertions; nueva ejecución completa
del head corregido requerida antes de merge.
Gates locales finales: check2549 PASS (2473 workspace +76 CI), focused CI con variable heredada
reproducida PASS76/0fail/0skip, CI lint/format/workflows/docs/diff PASS. Full PostgreSQL1022/0/0
con fuentes/runner DB intactos; generadores sin drift y builds API/Web PASS.
Sin deuda pendiente que autorice iniciar DEV-01. STOP tras merge y main clean0/0.
