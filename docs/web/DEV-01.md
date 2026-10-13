# DEV-01 — Railway API UAT: runtime y readiness

Base: main `3dd3ebd9a32ed558865a33a2d0323c8251877384`, después de CI-OPT-01,
clean0/0. Rama `chore/dev-01-railway-api-uat`. Preflight completo antes de implementar:
AGENTS, DEV-00/CI-OPT-01/BACKLOG/DEPLOYMENT/CI_CD/OPERATIONS/SECURITY/OBSERVABILITY/
TESTING/CURRENT_STATE/ADR-WEB-011; manifest, build/start/config/auth, PostgreSQL, rutas,
tests, workflows y clasificador. Sin configuración Railway anterior encontrada.

Estado: implementación y gates locales PASS; setup staged y activación externa pendiente. **No aceptación UAT,
no deployment activo, no PROD.** El estado externo y los resultados locales se registran por separado.

## Decisión humana de Health

El preflight detectó `OBSERVABILITY.md` con `503 {status:"unavailable"}`, incompatible con
Health `{status:"ok"}` y la envoltura pública ApiError existente. El responsable aprobó usar
ApiError con `TEMPORARILY_UNAVAILABLE`, requestId y no-store, y actualizar OBSERVABILITY.
No nuevo schema/código de error, cambio financiero o versión de contrato.

GET /health es público, GET sin cookie/CSRF, sin datos de negocio ni diagnósticos.
200 contiene únicamente `{status:"ok"}`; 503 usa ApiError sanitizado. Ambas respuestas son
`Cache-Control: no-store`. /live conserva 200 independiente de DB/configuración de auth.
Manifest/OpenAPI marcan getHealth implemented: 27 operaciones implementadas.

La composición real de server instala el probe solo después de validar auth/origins,
secreto de supresión, DATABASE_URL y SMTP. Foundation-only conserva /health503; auth parcial
inválida hace fallar startup con exit1 sanitizado. No se ignoran requisitos para fingir readiness.
Los harnesses que registran rutas manualmente sin instalar un probe siguen fail-closed503.

Probe: un Client independiente, una sola comprobación en vuelo compartida por requests
concurrentes, deadline total2s, statement_timeout1.5s y conexión read-only UTC. No ocupa ni
modifica el pool de negocio (max10/connectionTimeoutMillis2000 existentes). Cierra el Client
en éxito/fallo/deadline y shutdown; no retries/sleeps ni resultado verde cacheado.
Comprueba hashes/timestamps y conjunto exacto de las cinco migraciones SQL versionadas y
presencia/tipo/nulabilidad de todas las columnas requeridas por los PgTable actuales, mediante
catálogo PostgreSQL. No SELECT1 como criterio, runner de migraciones, escritura de rate limits
ni lectura de filas comerciales. Un ledger vigente con tabla/columna/tipo incompatible falla.
Esta comprobación mínima no reemplaza la auditoría de datos/constraints ni restore de DEV-02.

## Railway verificado — 2026-10-13

Acceso autenticado al workspace personal `ian0000's Projects`,
`ec146253-f9c8-4d92-aa55-80f23755bf22`, usando el plugin Railway. Solo ReptileApp/VZLegal
existían en el inventario inicial; no se modificaron sus servicios/configuración/datos.

| Recurso | Identidad verificada | Estado |
| --- | --- | --- |
| StockApp UAT | `1acb0266-cf67-4694-a470-543f62a7a30f` | Proyecto privado nuevo, PR deploys false |
| uat | `21841fe9-3208-46ec-874d-0853d938effd` | Entorno explícito UAT; no etiqueta production |
| stockapp-api-uat | `207b53d2-6c74-4a58-bb30-6e36c9e2f496` | staged-create, sin instancia/deployment |
| Patch | `7eb661e7-067d-494a-917d-d1c816755b75` | STAGED; no accept-deploy ejecutado |

No volumen, bucket, PostgreSQL, dominio, TCP proxy, secretos ni variables compartidas creados.
Fuente GitHub inicialmente sin conectar; no autodeploy puede dispararse desde ese estado.
Repositorio público `ian0000/StockApp`, acceso GitHub read/push/admin verificado. Tras merge,
la preparación de fuente se limita a staged/main+commitSha exacto, sin conexión live ni accept-deploy;
el SHA y resultado de ese paso quedan en la entrega final. No inventar deploy ID/URL/logs ni afirmar
autorización/build efectivo del proveedor por aceptar una fuente staged.
Una réplica; región por defecto devuelta por Railway `us-west2`, **sin activar**.
Plan vigente/costo efectivo y región aprobada pendientes de confirmación: el conector no expone
billing de la cuenta. No upgrade ni recurso de ejecución pago autorizado/activado.

Configuración siguiente existe **solo en el patch**, no como runtime efectivo desplegado:

| Setting | Valor staged |
| --- | --- |
| Builder | RAILPACK |
| Root | `/` |
| Build | `pnpm install --frozen-lockfile && pnpm --filter @stock-app/api build` |
| Start | `node apps/api/dist/server.js` |
| Predeploy | Ninguno; DEV-02 configura migración explícita revisada |
| Health | `/health`, timeout de activación300s; no usar /live como readiness |
| Variables públicas operativas | RAILPACK_NODE_VERSION=22.16.0, RAILPACK_NO_SPA=1, RAILPACK_PRUNE_DEPS=false, NODE_ENV=production, HOST=0.0.0.0 |
| PORT | Inyectado por Railway; no valor3001 hosted |

NODE_ENV=production es modo técnico UAT; no crea PROD StockApp. No Dockerfile, Nixpacks,
railway.json/toml, reorganización del monorepo ni nueva dependencia. Settings explícitos de
dashboard evitan defaults de deployment globales en este repo compartido. Verificar el config
efectivo del deployment futuro; este patch no lo prueba. Railpack pruning no activado: preservar
workspace links/runtime dependencies y assets hasta verificar la imagen concreta.

Fuentes oficiales consultadas:
[Railpack Node/versiones/workspaces](https://railpack.com/languages/node),
[Railway staged changes](https://docs.railway.com/deployments/staged-changes),
[IaC y deprecación Config as Code](https://docs.railway.com/infrastructure-as-code),
[healthchecks](https://docs.railway.com/deployments/healthchecks),
[regiones](https://docs.railway.com/deployments/regions),
[planes/costos](https://docs.railway.com/pricing/plans).
La documentación publicada no verifica el plan contratado. Builds sin cargo según el proveedor;
CPU/RAM/egress del runtime tienen costo por consumo. No presupuesto ni upgrade asumidos.

## Build y lifecycle locales

Verificados Node22.16.0/pnpm11.0.9; `pnpm install --frozen-lockfile` y build filtrado reales.
Start directo desde raíz `node apps/api/dist/server.js` verificado adicionalmente en QA foundation:
/live200 y /health503/no-store, sin fingir auth/DB/SMTP configurados. El cierre de ese proceso Windows
usa terminación del harness; la prueba de SIGTERM y drain es independiente en la suite compilada.
Build produce apps/api/dist/server.js y demás módulos/chunks ESM; compila packages/contracts/dist;
esbuild empaqueta las porciones puras de Domain/Application. Fastify/pg/auth/SMTP/Drizzle y
Contracts se resuelven como dependencias runtime externas; SQL sigue en apps/api/drizzle,
misma ubicación relativa de migrate desde src/dist. No depender de tsx para el start elegido.
El monorepo completo y los links node_modules deben conservarse en la imagen de Railway;
el smoke compilado local no certifica esa imagen hasta observar un build del proveedor.

PORT validado antes de listen; HOST default0.0.0.0. Prueba HTTP por loopback y otra interfaz IPv4
verifica escucha real en el puerto asignado. Entrypoint importado no instala handlers hasta
startServer; SIGTERM/SIGINT cierran Fastify y runtime. API-10 sigue con un runner startup/wake/sweep,
sin scheduler nuevo; shutdown cierra readiness, drena deletion/email y cierra SMTP/pool.
En Windows el harness emite SIGTERM en Node (Windows no entrega señales POSIX);
en Linux CI manda SIGTERM real al proceso hijo. No se afirma señal del proveedor sin logs reales.

Auth runtime exige AUTH_BASE_URL, APP_ORIGIN, BETTER_AUTH_SECRET, DELETION_SUPPRESSION_SECRET,
DATABASE_URL, SMTP_HOST/PORT/SECURITY/FROM y USER/PASSWORD juntos si el relay los requiere.
HTTPS/origins exactos/Secure cookies/TLS SMTP siguen vigentes. Ningún valor secreto staged.
SMTP real, credenciales de UAT y delivery pertenecen DEV-06; DB/migraciones/recovery a DEV-02.
**runtime integration pending DEV-02**. Sin DB/config correctas /health no puede ser verde.

TrustProxy=false conservado; sin confiar headers ingress. CORS/CSRF/ownership/rate/auth y
sanitización/redacción existentes intactos. Sin URLs generadas públicas, custom DNS ni exposición
PostgreSQL. Antes de conectar fuente live/deploy: verificar plan/región/costo/autorización,
exact-main CI/GitGuardian/artifact identity y staged diff sin cambios ajenos. Wait for CI solo
ignora checks de otras apps y no garantiza todos los estados requeridos:
[fuente oficial](https://docs.railway.com/deployments/github-autodeploys).
No aplicar accept-deploy ni Deploy Latest Commit por efecto de este merge.

## QA, AUTO-FIX y evidencia

Focused sin DB18 PASS; Contracts38 PASS; PostgreSQL/readiness/compiled-runtime14 PASS,
0fail/skip/cancelled. Fixtures PostgreSQL18.6 reales, sin DB externa/secrets SMTP.
Una nueva prueba asumía el formato de logs de Fastify0.0.0.0; se corrigió para comprobar bind
mediante HTTP en interfaces locales. Otra fixture se adaptó a reporting_time_zone y timestamps
BIGINT reales. El fallo de conexión posterior se induce desde el admin de la DB disposable,
no desde la misma DB ni con terminate_backend/global DROP FORCE.

AUTO-FIX: expectativas health404 históricas pasan a503 en composiciones sin readiness y count
OpenAPI26→27. SOURCE OF TRUTH: ruta operacional autorizada/manifest actualizado, fail-closed.
FILES: tests API que referencian /health y packages/contracts/test/v1.test.ts.
PRODUCTION BEHAVIOR CHANGED por estos fixes de fixtures: NO; cambio operacional Health es
implementación explícita DEV-01. Ninguna assertion de negocio/seguridad relajada ni skip añadido.

QA INFRASTRUCTURE: Docker no quedó disponible al intentar usar el contenedor QA existente.
El cluster antiguo stockapp-cloud02-postgres respondió18.6 pero su template1 y distribución
tenían archivos faltantes; se conserva, detenido como estaba antes del ticket. No reparación,
borrado ni reutilización de sus datos para pasar tests. Se inicializó cluster QA nuevo en
C:/Users/USER/.codex/artifacts/stockapp-dev01-pg-qa/data con binarios18.6 completos previamente
disponibles de stockapp-web07-postgres, bind127.0.0.1:65435 y stockapp_test. Cada suite crea/drop
solo sus DBs disposable con el provisioning gate existente. Pools/global concurrency/timeouts/CI
sin cambios. Sin descargas/dependencias nuevas ni reset de Docker/WSL/volúmenes.

Gates locales secuenciales PASS: OpenAPI check; pnpm check2553 tests (76 CI+2477 workspace),
build:api; test:db1036 PASS,0fail/skip/cancelled/timeout failures; db:generate sin migración/drift;
auth:generate sin diff y auth:check; ci:workflows/actionlint1.7.12 fijado+SHA256; diff check/review.
Regresiones: Domain428/Application432/Mobile551/Contracts38/API32/Web996; PostgreSQL incluye
API-01..10/Auth/Ownership/Security/compiled HTTP. Warning Vite1883.48kB/284.92kB gzip conservado,
sin límites ni UI/code-splitting modificados. CI/GitGuardian del candidato final pendientes antes del PR.
Clasificación conservadora real CI-OPT-01: nuevas pruebas bajo test/postgres/config operativa
pueden forzar full; no modificar policy/CI para reducir checks. Source SHA final/PR/merge y gates
remotos se registran en la entrega del candidato exacto, no se heredan del SHA base.

Railway build/start logs: **NOT RUN**, latestDeployment null; sin source SHA desplegado.
Estado runtime UAT: **INACTIVE**, dependencias DB/SMTP y aprobación de activación pendientes.
No declarar DEV-01 DONE ni UAT aceptado mientras sus entregables externos sigan bloqueados.
DEV-02/03/04/05/06, PROD, DNS, Sync/MIG/Mobile y nuevos tickets no comienzan automáticamente.
