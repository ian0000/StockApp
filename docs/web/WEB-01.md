# WEB-01 — React application foundation

Base main:2c399e9125b8099eb7be3f9d44b37f1487d0a174. Rama feat/web-01-foundation.
Estado: IMPLEMENTED tras gates locales completos PASS. CI/GitGuardian/merge del head final se verifican por separado en PR; no inferirlos de validación local.

## Preflight

apps/web no existía; workspace apps/* ya incluido; main limpio0/0 y pull ff-only sin cambios.
Se revisaron AGENTS65.1, BACKLOG/ARCHITECTURE/WEB_UX/CONTRACTS_V1/API/SECURITY/CI_CD/
DEPLOYMENT/PARITY_MATRIX/CURRENT_STATE, ADR001/002/006/010/012/013, contracts y config workspace.
React/Vite/Router/Query aprobados; SPA estática online-first; targets futuros app stockapp.ian-k.dev,
API api-stockapp.ian-k.dev, Pages apps/web/dist. HUMAN DECISIONS REQUIRED:NONE.
El ticket autoriza VITE_API_URL y headers finales DEV-03/04; reemplaza el nombre/atribución
históricos de esos puntos en DEPLOYMENT/SECURITY. No cambio de arquitectura aprobada.

## Implementación

apps/web contiene main/App/Providers/router, pantallas foundation y CSS mínimo responsive.
18 rutas UX conocidas más wildcard; placeholders explícitos sin datos ni llamadas comerciales.
Lazy route modules, HydrateFallback inicial y loading de navegación con status/aria-live;
Not Found y route error UI sanitizada. HTML semántico main/h1, links nativos>=44px y focus-visible.
Ningún app shell definitivo, login/Better Auth, bootstrap ni feature comercial conectada.
Sin SSR runtime, PWA/service worker, almacenamiento browser, ledger, cola offline ni optimistic writes.

QueryClient único por composición, cache en memoria, networkMode online y retry false en queries/
mutations. Sin keys de negocio ni tokens/cache persistente; scoping de sesión/dataset pertenece WEB-02+.

Cliente fetch separado, sin llamada al startup. readApiConfig exige VITE_API_URL explícita al usarlo:
origen HTTP(S) sin path prefix/credenciales/query/hash; .env.example solo localhost público.
No default production. Paths relativos al mismo origen; credentials include/cache no-store/
redirect error; Accept JSON y Content-Type JSON para body. Signal se propaga; sin reintentos internos.
Mantiene HTTP status/headers y ApiErrorEnvelope V1 validado; errores HTML/JSON corrupto/network
sanitizados y diferenciados. Body de éxito unknown: cada feature valida su DTO, sin casts genéricos.
Money/Revision strings y null/cero se conservan; JSON no serializable falla antes de fetch.

## Contracts y CSP

Solo import type de @stock-app/contracts en el cliente. El schema ApiError sigue en contracts.
Compiler privado packages/contracts/src/browser-error-cli.ts genera static ESM/declaración de tipo
al ejecutar scripts Web. Usa Ajv8.20.0 ya existente; integra su helper Unicode puro de minLength
para evitar require CJS en browser. Falla si aparece otro require inesperado. No cambia schemas,
HTTP DTOs, exports públicos, versiones de protocolo, API ni Domain.

Generated files apps/web/src/api/generated ignorados en Git/format/lint; se regeneran antes de
lint/typecheck/test/dev/build desde el único schema. No SDK ni dependencia nueva de schema.
Prueba ejecuta el validator en VM con codeGeneration strings/wasm false y compara con schema shared;
Vite también empaqueta el client y comprueba ausencia de compiler/eval/módulos server/Mobile/Domain.
Esto prepara compatibilidad con CSP: headers/hosting efectivos siguen DEV-03/DEV-04.
Referencia: [Ajv standalone](https://ajv.js.org/standalone.html).

## Dependencias

Runtime exacto: React/DOM19.2.3 (alineado Mobile), react-router7.18.4, Query5.104.1, contracts workspace.
Dev exacto: Vite7.3.7/pluginReact5.2.0, tipos React19.2.18/DOM19.2.7.
Se comprobaron engines/peers del registry: Node22.16/TS5.9 compatibles; Router8 actual requiere
Node>=22.22 y React>=19.2.7, por eso se usa línea7 estable compatible sin cambiar Mobile.
Sin nueva dependencia de tests: node:test/tsx existentes y renderToStaticMarkup de ReactDOM.
Render server se usa solo en tests, no como aplicación SSR ni E2E browser certificado.
Lockfile derivado añade importer Web/paquetes requeridos; pnpm comparte nuevo react-refresh0.18
con el peer de babel-preset-expo (antes0.14.2), sin cambiar versiones directas de Mobile.
También se completan peers opcionales @types/react-dom en los snapshots de @expo/ui/Radix/vaul ya existentes, sin cambiar sus versiones ni añadir un framework UI Web. Las551 regresiones Mobile pasan con esta resolución derivada.

## Scripts y uso local

```sh
pnpm install --frozen-lockfile
pnpm --filter @stock-app/web dev
pnpm build:web
pnpm --filter @stock-app/web preview
```

Para futuras llamadas al API, copiar .env.example a .env local ignorado o definir VITE_API_URL.
WEB-01 puede renderizar/build sin API_URL porque la foundation no inicia solicitudes. Al componer features futuras, usar readApiConfig(import.meta.env).apiUrl como baseUrl explícita de createApiClient.
Dist es index.html + assets hashed/lazy chunks; sin Functions/SSR/404.html top-level.
Vite sirve fallback SPA de dev/preview; fallback de hosting/deep-link real Pages se prueba en DEV-03.
No proyecto Pages/DNS/CD aplicado.

Root build:web añadido y pnpm check conserva todos los gates y añade build Web al final.
Workspace lint/typecheck/test incluyen Web automáticamente; workflow CI/recursos/timeouts intactos.

## Validación

Focused secuencial lint/typecheck/test15/ build PASS (0fail/0skip).
Cubre root,17 paths adicionales/ranking new-id-edit, Not Found, Query context, loading inicial/
navegación controlada, error sin detalle técnico, config, cookies/headers/signal, errores/status,
valores string exactos, body no serializable, mismo origen y CSP/bundle del cliente.
Frozen install/OpenAPI check PASS; pnpm check PASS:1492 tests/0fail/0skip, incluyendo Domain428/Application432/Mobile551/Contracts38/API28/Web15 y ambos builds. build:api explícito PASS. Preview HTTP local root/deep links/assets PASS; proceso de preview cerrado. test:db completo1004PASS/0fail/0skip/0cancelled, API01..10/Auth/Ownership/Security/Backup/13 compiled HTTP incluidos. db:generate sin cambios/schema/migration drift; auth:generate sin diff/auth:check PASS. Diff completo revisado y diff check PASS. CI/GitGuardian del head final deben pasar antes de merge normal.

## AUTO-FIX

CAUSE: lint default import con nombre de export y opción VM en API incorrecta de Node.
SOURCE OF TRUTH: lint workspace estricto y tipos Node22/codeGeneration de createContext.
FILES: apps/web/test/browser-contract.test.ts.
PRODUCTION BEHAVIOR CHANGED:NO. Se corrige test mecánico sin relajar la prueba.

CAUSE: config/documentación todavía usaba nombre env y CSP attribution anteriores.
SOURCE OF TRUTH: ticket WEB-01 actual, VITE_API_URL y headers finales DEV-03/04.
FILES: docs/web/DEPLOYMENT.md, SECURITY.md, CURRENT_STATE.md, ARCHITECTURE.md, CI_CD.md.
PRODUCTION BEHAVIOR CHANGED:NO por la actualización documental.

CAUSE: formato del nuevo compiler tras el último ajuste de imports.
SOURCE OF TRUTH: configuración Prettier del workspace.
FILES: packages/contracts/src/browser-error-cli.ts.
PRODUCTION BEHAVIOR CHANGED:NO (solo formatting).

La integración del helper CJS/Unicode y el import NodeNext de Ajv son implementación del compiler
nuevo de WEB-01; no cambios de reglas/schema/API existentes.

## Pendiente fuera del ticket

WEB-02 auth/app shell; features WEB-03+; QA-03 E2E browser/accessibility completo;
DEV-03/04 hosting/fallback/headers/CSP/DNS/TLS y CD. STOP después de WEB-01; no siguiente ticket.