# CLOUD-01 — API Foundation + Base Contracts

Implementado localmente · 2026-10-03 (America/Guayaquil). Baseline aprobada y mergeada por PR #75.
Base `1a803a827ebf474abe1f1bd6540b3eb44e9ed09a`; rama `feat/cloud-01-api-foundation`.
Commit/push/PR/merge y estado Git definitivos se verifican en entrega del chat.

## Workspace y ejecución

`apps/api` y `packages/contracts` están incluidos por los globs existentes; pnpm-workspace.yaml,
workflow CI, runtime pins y AGENTS sin cambios. Root añade build:api al check canónico.
Node local/CI 22.16.0, pnpm 11.0.9, TS resuelto 5.9.3. ESM compatible con workspace; NodeNext
en paquetes nuevos, imports relativos .js, strict heredado. No se cambian configs de paquetes previos.

```sh
pnpm install --frozen-lockfile
pnpm --filter @stock-app/api dev
# En otra terminal: GET http://localhost:3001/live
pnpm build:api
pnpm --filter @stock-app/api start
pnpm --filter @stock-app/api test
pnpm --filter @stock-app/contracts test
pnpm check
git diff --check
```

Factory buildApp en src/app.ts; server.ts importa factory y solo arranca cuando es entrypoint.
HOST default 0.0.0.0, PORT default 3001; entradas inválidas fallan sin repetir valores sensibles.
SIGINT/SIGTERM cierran Fastify una vez y retiran handlers; sin DB/workers/lifecycle framework.
Logs Fastify nativos: req solo method, res statusCode, err genérico; sin URL query/header/body/raw error.

## Rutas/request IDs/errores

Solo GET /live → HTTP 200 application/json `{ "status": "ok" }`.
External dependencies queried: NONE. No /health ficticio; namespace /v1 y /api/auth no implementados.
No rutas debug, negocio, auth o sync; endpoints auxiliares solo se registran en instancias de tests.
Fastify requestIdHeader=false y genReqId crypto.randomUUID Node; nunca autoridad cliente.
Header x-request-id en respuestas, mismo error.requestId. Request UUID no cambia IDs comerciales.
NOT_FOUND 404; JSON Schema/parse JSON/type de contenido/límite nativo → VALIDATION_ERROR 400 en
foundation; INTERNAL_ERROR 500 sanitizado, aun si excepción arbitraria intenta statusCode=400.
CLOUD-05/06 definirán políticas/status específicos de límites y el catálogo completo.

## Contracts: fuente única JSON Schema

src/http.ts: requestIdSchema/RequestId, liveResponseSchema/LiveResponse, apiErrorSchema/
ApiErrorEnvelope/ApiErrorCode, createApiError. code/message/requestId requeridos; fieldErrors opcional
map de arrays string. additionalProperties=false. Details no implementado: whitelist por contrato
en CLOUD-06. Sin catálogo financiero ni command envelope completo.
src/transport.ts: moneySchema/MoneyTransport, revisionSchema/RevisionTransport,
timestampSchema/TimestampTransport y codecs decodeMoney/encodeMoney/decodeRevision/decodeTimestamp.
src/index.ts reexporta estas dos responsabilidades; no import a Domain/Application/ORM/React/Expo/Fastify.

| Primitive | Estado | Política implementada |
| --- | --- | --- |
| Money | IMPLEMENTED | Entero decimal canónico string scaled 10^6; codec safe JS integer; sin fórmulas |
| Revision | IMPLEMENTED | String entero no negativo canónico; nunca Number; rango DB/protocolo en CLOUD-06 |
| Epoch ms | IMPLEMENTED | Number entero seguro no negativo, sin parsing de string |
| Null/absence | IMPLEMENTED como límite primitive | Ambos rechazados por codecs; nullable/optional explícito por DTO en CLOUD-06 |

Money preserva 0, negativos y límites safe. Rechaza decimales/exponentes/signo+, espacios, leading
zeros, -0 string, newline, number en vez de string, NaN/Infinity y overflow. encodeMoney(-0) → "0".
Schema limita formato/longitud; codec añade rango seguro antes del dominio, no sustituye invariantes
de Money. Decode revision no impone rango JS y conserva revisiones >MAX_SAFE_INTEGER sin pérdida.
Tipos derivados con FromSchema de json-schema-to-ts; solo imports type, sin runtime validator paralelo.
Fastify usa AJV nativo para schemas, sin coerción ni descarte silencioso de additional properties.

OpenAPI full contract generation deferred to CLOUD-06. Evaluado: wiring plugin/generador ahora no
es necesario para /live y agregaría otra superficie y gate de generación antes de DTOs V1.
No dependencia Swagger/OpenAPI, spec generado ni spec manual. CLOUD-06 conserva esa obligación.

## Build y dependencias

tsc compila contracts a packages/contracts/dist (JS + declarations), luego API a apps/api/dist.
Entry ejecutable apps/api/dist/server.js; imports workspace resuelven contracts/dist/index.js.
Sin webpack/esbuild/tsup/bundle ni import TS en runtime compilado. Se conservan ambos dist y
node_modules al ejecutar. development condition exporta source para tests/dev/typecheck;
build resuelve export types/default compilado. No publicar npm ni mover paquetes existentes.
El resolver ESLint de la API utiliza la condición development y su tsconfig local para resolver
contracts desde source incluso en un checkout limpio, antes del build; reutiliza el resolver existente.

| Paquete | Dependencia nueva | Motivo |
| --- | --- | --- |
| API runtime | fastify 5.12.5 | HTTP, inject, validación/serialización y logger nativos, aprobado por ADR |
| API runtime | @stock-app/contracts workspace:* | Consumir schemas/types base locales |
| Contracts dev | json-schema-to-ts 3.1.1 | Derivar tipos de JSON Schema sin interfaces duplicadas |
| API dev | NONE | tsc/tsx/node:test/@types/node del root existentes |
| Contracts runtime | NONE | Código TS puro; imports de inference solo type |

Versiones pin en package.json/lockfile. Importers previos y versiones de paquetes previos sin upgrades;
pnpm reindexó snapshots de peers de ESLint al enlazar workspaces. No se corrigen warnings ajenos.
Fuentes primarias revisadas: [Fastify V5/Node](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/),
[schemas y tipos](https://fastify.dev/docs/latest/Reference/Type-Providers/),
[requestIdHeader/genReqId](https://fastify.dev/docs/latest/Reference/Server/#requestidheader),
[logging](https://fastify.dev/docs/latest/Reference/Logging/).

## Validación real

| Gate | Resultado |
| --- | --- |
| pnpm install --frozen-lockfile | PASS, siete workspaces, sin cambios tras frozen |
| pnpm check | PASS: format/lint/typecheck/tests y build API |
| pnpm check sin dist previo | PASS, mismos gates desde source sin artefactos anteriores |
| API tests | PASS, 10 escenarios node:test/inject |
| Contracts tests | PASS, 7 escenarios |
| Domain/Application/Mobile | PASS: 428/424/550, sin modificar tests existentes |
| Suite total | PASS, 1419 tests; shared sigue 0 |
| pnpm build:api | PASS, contracts tsc → API tsc |
| Dev HTTP | PASS, bind 127.0.0.1 puerto alternativo 62056, /live 200/JSON/requestId |
| Compiled HTTP | PASS, puerto alternativo 62075, /live 200/JSON/requestId |
| Cierre handlers | PASS: SIGINT dev y SIGTERM compiled vía eventos IPC en Windows; exit 0/puerto cerrado |
| Señales OS Linux/EAS/dispositivo/deploy | NOT RUN: no sustituidas por smoke local |
| git diff --check | PASS |

Escenarios API: liveness/json/no listen en factory; cliente no impone ID/dos requests distintos;
404 para rutas desconocidas/futuras/debug; 500 sanitiza excepción y statusCode hostil;
schemas de envelope y primitives rechazan shape/coerción/extra fields; JSON malformado sanitizado;
close sin socket; logs omiten tokens/query/body/cookie/raw error; importar entrypoint sin handlers;
config defaults/override y rechazo de bind/port inválidos.
Contracts: shape/optional fieldErrors, canonical roundtrip, rango safe, negativos/cero;
rechazos no canónicos, revision grande sin pérdida, epoch seguro y null distinto de ausencia.
La primera corrida de tests de transporte falló por módulo aún ausente (ERR_MODULE_NOT_FOUND),
no por una regla financiera demostrada en rojo. La implementación posterior pasó estos casos.
El primer CI del PR #76 falló en lint porque contracts/dist aún no existía en checkout limpio.
Se corrigió la resolución de imports con apps/api/eslint.config.mjs y se repitió pnpm check sin
ambas carpetas dist previas; PASS. El estado final de CI y merge se verifica en entrega del chat.

## Archivos y alcance

API: package.json, tsconfig.json, tsconfig.build.json, eslint.config.mjs, src/app.ts, src/config.ts, src/server.ts,
src/routes/live.ts, test/app.test.ts, test/config.test.ts.
Contracts: package.json, tsconfig.json, tsconfig.build.json, src/http.ts, src/transport.ts,
src/index.ts, test/http.test.ts, test/transport.test.ts.
Tooling: package.json root, pnpm-lock.yaml. Docs: README root; docs/web README, CURRENT_STATE,
ARCHITECTURE, API, BACKLOG, CI_CD, DEPLOYMENT y este CLOUD-01.md. CI: NONE.
No secrets, .env real, wildcard CORS, auth, DB, migraciones, schemas cloud, ownership, sync ni Web.
Sin cambios funcionales Mobile/Domain/Application; sin Railway/Pages/DNS/deploy.
CLOUD-01 IMPLEMENTED; restantes 46 tickets PLANNED. CLOUD-02 requiere solicitud posterior.
Blockers: NONE. PR/merge autorizados por usuario después de checks, sustituyendo preferencia manual.

CLOUD-01 READY FOR PR
