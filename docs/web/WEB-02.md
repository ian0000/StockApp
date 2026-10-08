# WEB-02 — Auth, app shell y onboarding vacío

Base main: `3b4e8b0fb8a975934391ea28020fffd62619f471`, WEB-01 mergeado.
Rama: `feat/web-02-auth-shell`. Estado: IMPLEMENTED, gates locales completos PASS.
CI/GitGuardian/merge se comprueban sobre el head final; no equivalen a despliegue.

## Preflight completo

Main limpio0/0, pull ff-only sin avance. Leídos AGENTS (incluida65.1), BACKLOG/WEB-01/WEB_UX/
ARCHITECTURE/API/AUTH/SECURITY/CONTRACTS_V1/CLOUD-03/04/05/CURRENT_STATE/TESTING/CI_CD,
apps/web, ownership/routes/contracts, auth/security servidor y exports/types/source Better Auth1.7.7.
HUMAN DECISIONS REQUIRED:NONE.

VITE_API_URL es el único origin API público; auth sigue /api/auth con errores propios,
/v1 usa ApiError. Me es autoridad de User/Business/Inventory/capabilities; business bootstrap
crea ACTIVE+Inventory vacío y cloudAccessEnabled=false, piloto exclusivamente operator CLI.
POST business requiere CSRF por sesión y exactamente inventoryName/currency/reportingTimeZone.
No deducir ownership/acceso de cookie o frontend. Cookies host-only/HttpOnly/Secure según servidor.
Web online-first sin storage privado, import MIG-03 y comercio WEB-03+; privacidad completa WEB-10.
Las notas históricas de CLOUD-03/04 y las tablas de API anteriores al freeze se interpretan junto
al runtime/routes actual y ticket: bootstrap no envía Idempotency-Key/receipt ni reserva import.

## Implementación

Cliente React oficial Better Auth1.7.7, pin idéntico backend; única dependencia nueva Web,
ya resuelta por API: lockfile solo añade su importer. No upgrades/dependencias de forms/schema/tests.
Los métodos oficiales signUp/signIn/getSession/signOut/sendVerificationEmail/verifyEmail/
requestPasswordReset/resetPassword gestionan identidad y tokens; cookies credentials include,
no-store, sin retry ciego ni auth redirect automático. Callbacks apuntan al origin de la propia SPA.
La documentación vigente se cotejó con el código1.7.7 instalado:
[email/password](https://better-auth.com/docs/authentication/email-password).

Uso imperativo de getSession en lugar de montar useSession: el refresh manager oficial escribe
mensajes de broadcast en localStorage al montarse. Los métodos usan disableSignal soportado y
no montan atoms. Controller/React subscription propios coordinan solo UI, no password/session logic.
Prueba con browser/storage spy demuestra cero accesos. El response oficial se descarta tras extraer
userId/sessionId/expiresAt; nunca se retiene session.token. Revalidación al startup, foco, retorno
online y cada60s; callbacks/password/token solo memoria temporal, URLs callback se limpian por replace.

Signup exige name/email/password8–128 y lleva a verificar sin auto-login/Business/Inventory.
Verify soporta revisar/reenvío/callback/error y consumo token oficial GET sin callback redirect.
Reset solicita enlace con UX genérica existing/missing; completa con token oficial, limpia contexto
y vuelve a login sin auto-login. Login single-flight espera sesión oficial y Me antes de navegación.
Errores auth sanitizados; EMAIL_NOT_VERIFIED ofrece verificación. /v1 conserva envelope/status.

SessionController expresa anonymous/loading/no-business/disabled/enabled/deleting/sin-inventory/error.
Session generation en memoria cambia por login/identidad/session/logout/expiración/revocación;
queryClient.clear antes del nuevo contexto, cancelación y epoch impiden que respuestas tardías
restauren A tras B/logout. Mismo usuario+sesión en refresh no elimina caché ni cambia generation.
Keys privadas futuras incluyen generation/businessId/inventoryId. Me se consulta por generación
y User; no llamadas comerciales. Respuesta Me con identidad inconsistente falla cerrada.

Logout retira caché/UI al iniciar; solo sign-out success declara anonymous. Network/5xx conserva
pantalla de error seguro/retry, sin afirmar revocación ni restaurar queries automáticamente.
401 auth/Me/bootstrap limpia cache/generation y vuelve a login; 403 verification/cloud disabled
ofrece estado seguro. No reauth modal/export/delete en este ticket.

Private boundary lleva anonymous a login y no-business a onboarding. ACTIVE enabled con Inventory
entra al shell: Inicio/Productos/Historial/Configuración, Nueva venta/Nueva compra y logout.
Home solo name/currency/reportingTimeZone reales. Paths comerciales siguen placeholder sin HTTP.
Disabled/deleting/reserva sin Inventory retiran shell y ofrecen refresh/logout, sin repair/enable.
Public auth routes no muestran shell. Sidebar desktop y wrap narrow, active route, skip link,
labels/autocomplete/password inputs/aria-describedby/live status/foco/targets>=44px.

Onboarding solo crea vacío, nombre/moneda vacíos sin default; ISO alpha-3 obligatorio.
Timezone sugerida exclusivamente por Intl browser si usable y editable; no timezone universal.
GET csrf validado precede POST exacto con X-CSRF-Token, token solo local a esa solicitud/signal.
200 matching/201 creación son éxito, refetch Me determina acceso normalmente pendiente.
Sin import file/upload/progress/consent, business fields, billing ni habilitación Web.

## Contracts/browser

Compiler standalone WEB-01 extendido con Me/Csrf/BootstrapRequest/BootstrapResponse del schema
shared existente; tipos derivados sin casts y static ESM build-time, ninguna schema library nueva.
Schemas/DTOs de transporte/OpenAPI/API/DB/migrations/Domain/Application/Mobile intactos.
Único alias TypeScript aditivo: CsrfResponse derivado del schema ya existente; evita una importación
directa json-schema-to-ts en declaraciones generadas Web sin añadir dependencia allí.
Sin localStorage/IndexedDB/sessionStorage/query persistence/service worker ni tokens manuales.

## Validación

Focused actual:47 PASS,0fail/skip/cancelled. node:test/tsx, fake fetch al cliente oficial,
controllers/query cache real y ReactDOM static rendering con Router/Providers reales.
Cobertura: identity A→B/session nueva/re-render, logout success/fail/retry,401/expiry/revoke,
late responses/abort, estados Me/scoping, signup/verify/login/reset UX, CSRF orden/body/200/201,
validators shared/malformed DTO, defaults, shell/rutas públicas/privadas/loading/error/CSP.
No nuevo framework de tests. Browser E2E/interacciones físicas/cookies multi-origin reales QA-03;
SMTP/provider/DNS/hosting/CSP headers DEV-03/04 no ejecutados. No declarar E2E por SSR de tests.

Gates secuenciales completos PASS: frozen install; Web lint/typecheck/test47/build;
contracts:openapi:check; pnpm check1524 (Domain428/Application432/Mobile551/Contracts38/API28/Web47)
incluidos ambos builds; build:api explícito; test:db1004/0fail/0skip/0cancelled con PostgreSQL18.6
real, API01..10/Auth/Ownership/Security/compiled HTTP/SMTP. Total único2528; no volver a sumar focused.
El alias CSRF final se revalidó con focused types/tests y pnpm check completo, incluidos ambos builds.
db:generate sin cambios/migration drift; auth:generate sin diff y auth:check PASS.
Bundle generado sin eval dinámico ni lectura manual de cookies; compilación/API/source schemas
intactos salvo alias de tipo aditivo y compiler browser. Diff completo revisado y diff check PASS.
QA local cerró con cero disposable DB/conexiones y servidor propio detenido normalmente;
data existente preservada, sin cambio PG/pool/timeout/test-concurrency. Workflow/recursos CI intactos.
CI/GitGuardian/reviews/merge se verifican separadamente sobre commit final antes de entrega.

## AUTO-FIX

CAUSE: tests WEB-01 todavía renderizaban placeholders públicos/privados sin session provider.
SOURCE OF TRUTH: ticket WEB-02: rutas auth funcionales y placeholders privados dentro del shell.
FILES: apps/web/test/app.test.tsx, session-fixtures.ts.
PRODUCTION BEHAVIOR CHANGED:NO por el ajuste de tests; la implementación Web autorizada cambia guards/UI.

CAUSE: Vite env types no declaran el nombre público del origin usado por WEB-02 al startup.
SOURCE OF TRUTH: WEB-01/02 VITE_API_URL y readApiConfig strict existente.
FILES: apps/web/src/vite-env.d.ts.
PRODUCTION BEHAVIOR CHANGED:NO por la declaración de tipos; ningún default/bypass añadido.

CAUSE: aserción nueva de moneda dependía del orden de atributos ReactDOM.
SOURCE OF TRUTH: WEB-02 exige moneda vacía, no default USD; HTML no impone orden de atributos.
FILES: apps/web/test/app.test.tsx.
PRODUCTION BEHAVIOR CHANGED:NO; se identifica su input y valida value vacío+pattern, sin relajar cobertura.

Compiler validators, typing/config/estado/UI y formatting propios de WEB-02 cumplen la regla
congelada; no modifican API/auth financiero/Domain/schema ni decisiones de producto.

CAUSE: declaración generated CSRF refería json-schema-to-ts directamente desde Web, sin dependencia directa; skipLibCheck podía ocultar su resolución.
SOURCE OF TRUTH: compiler standalone build-time, schema csrfResponseSchema existente y tipos derivados de contracts.
FILES: packages/contracts/src/ownership.ts, browser-error-cli.ts.
PRODUCTION BEHAVIOR CHANGED:NO. Alias CsrfResponse aditivo derivado, sin cambio JSON Schema/HTTP, nueva dependencia ni cast.

## Ejecución y STOP

Configurar VITE_API_URL público (.env.example); servidor exige APP_ORIGIN exacto de SPA y
AUTH_BASE_URL real. No ampliar CORS para previews. Build no exige secrets/API viva; runtime con
origin ausente/inválido muestra estado seguro sin fallback silencioso ni excepciones raw.

PR/merge normales solo tras gates locales/CI/GitGuardian/reviews PASS. Sin force ni bypass.
Después main limpio0/0, WEB-02 DONE/MERGED y STOP. WEB-03/Sync/MIG/deploy no autorizados.
