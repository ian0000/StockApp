# DEV-UAT-01 — Sandbox UAT mínimo funcional

Estado actual: **PARTIAL — WEB/API/DB UAT ONLINE; AUTH Y PILOTO PASS; SMOKE FINANCIERO PENDIENTE**, 2026-10-16 America/Guayaquil.

## Publicación Cloudflare y dominios UAT — evidencia actual

Rediseño Web posterior solicitado y propuesta3 elegida por el humano: sidebar clara, resumen
diario navy, jerarquía/espaciado, formularios y detalles compartidos, adaptación móvil/tablet.
[QA visual y funcional local](../../design-qa.md) PASS; Tabler React3.49.0 es la única nueva
dependencia Web de este rediseño. No cambios de contrato financiero, Domain/Application/Mobile,
schema/migrations, CI, pagos ni Sync. Preparado localmente; aún no publicado en Pages/Railway.

Cambio posterior autorizado por el humano: acceso automático solo UAT para cuentas nuevas
verificadas al crear su inventario. Implementación local opt-in con
UAT_AUTO_ENABLE_CLOUD_ACCESS=true, RAILWAY_ENVIRONMENT_NAME=uat, APP_ORIGIN y AUTH_BASE_URL
exactamente iguales a los hosts staging de esta sección. Ausente/false mantiene la política
manual. Startup rechaza true fuera de ese entorno. No reactivar negocios existentes,
administrativamente deshabilitados ni DELETING, ni modificar Mobile/Sync/monetización.
**Pendiente de revisión/merge y deployment controlado:** el SHA remoto386f6fd aún requiere
piloto manual; la cuenta del operador ya se habilitó. No activar la variable antes de
desplegar el SHA revisado que implementa esta política. Ninguna migration nueva.

Publicación y DNS confirmados por el humano en el checkpoint final; sin cambio de plan.
Cloudflare Pages `stockapp-web-uat`, repositorio `ian0000/StockApp`, rama main y SHA exacto
`386f6fd32a10124e082dabc86ff1bfbc181c2497`, igual al API Railway.
Deployment `ce50d6d4-326e-49c4-a5d6-a87f0565cfb7`: **success**, duración40s.

- [Web UAT](https://stockapp-staging.ian-k.dev): dominio Active, SSL enabled; HTTPS200.
  Alias [Pages](https://stockapp-web-uat.pages.dev), deployment inmutable
  [ce50d6d4](https://ce50d6d4.stockapp-web-uat.pages.dev).
- Node22.16.0, pnpm11.0.9, build desde raíz:
  `pnpm install --frozen-lockfile && pnpm --filter @stock-app/contracts build && pnpm --filter @stock-app/web build`.
  Output `apps/web/dist`. Variables públicas únicas: NODE_VERSION, PNPM_VERSION y
  VITE_API_URL=`https://api-stockapp-staging.ian-k.dev`. Sin secretos en Pages.
- Después del primer build manual se deshabilitaron automatic production deployments y
  preview branch deployments (None), antes de asociar el dominio UAT. Futuros pushes no
  deben publicar automáticamente. Para nueva versión: validar SHA/CI, aprobación y deploy controlado.
- [API UAT](https://api-stockapp-staging.ian-k.dev/health): certificado Railway VALID,
  ownership verificado, CNAME propagado y HTTPS200 `{status:"ok"}`.
  CNAME `api-stockapp-staging` apunta a `4515u4eh.up.railway.app`, DNS only;
  TXT `_railway-verify.api-stockapp-staging` agregado con la prueba exacta del proveedor.
  Pages creó únicamente CNAME `stockapp-staging` a `stockapp-web-uat.pages.dev`.
  Sin cambios en correo raíz, portfolio, otros proyectos ni hosts PROD.
- Smoke HTTP remoto: rutas `/login`, `/signup`, `/settings`200 con fallback SPA;
  JS/CSS200, bundle con origen API correcto y sin `eval`/`new Function`.
  Headers CSP/HSTS/noindex/nosniff/frame DENY/permissions/referrer aplicados.
  API health no-store/requestId; `/v1/me`401 sanitizado, get-session200 null;
  CORS del Web exacto204 con credentials, origen ajeno403 sin allow-origin.
- Browser real: redirección inicial a login y navegación signup PASS; consola sin errores
  ni warnings observados antes del registro. Humano completó signup, recepción/verificación
  del correo e inicio de sesión con su buzón controlado; contraseña y enlaces no inspeccionados.
  Sesión autenticada observada en onboarding, lectura administrativa confirmó emailVerified=true.
  Inventario sintético vacío `StockApp UAT pruebas`, USD, America/Guayaquil creado por UI.
  Boundary previo al piloto mostró Acceso cloud pendiente; se ejecutó el CLI compilado existente
  `pilot-cli.js --user-id <id-privado> --enable` desde Console del servicio API UAT, con resultado
  `Pilot access operation complete.`. Después la misma Web mostró Inicio, stock/ventas/ganancia0,
  sin operaciones. Esto confirma cookies/origin/CSRF en el bootstrap y acceso cloud del tester.
  Sin SQL de escritura, bypass de verificación, claves SSH nuevas ni TCP público.
  Este permiso piloto es un control de testers, no monetización: Web usa PostgreSQL UAT y
  Mobile conserva su inventario local; no se implementó Sync, importación ni plan de pago.
- Se conservó el warning Vite de tamaño del bundle (~1733kB /238kB gzip); sin cambiar límites.
  Evidencia externa local: `stockapp-uat-pages-build-2026-10-16.jpg`,
  `stockapp-uat-pages-domain-active-2026-10-16.jpg` y `stockapp-uat-public-http-2026-10-16.json`.

Ambos dominios ya sirven HTTPS real y el operador puede probar la Web con su cuenta habilitada.
La matriz financiera completa, logout/relogin, restart/persistencia, aislamiento A/B, export y
reset siguen NOT RUN en remoto. Por ello aún no se acredita UAT SANDBOX READY ni FULL ACCEPTANCE.

## Activación Railway y Resend — evidencia actual

PR110 integrado; main desplegado `386f6fd32a10124e082dabc86ff1bfbc181c2497`, mismo árbol que
el head local validado91795ee. Quality checks y regresión completa del main PASS; GitGuardian
PASS en el head de PR110, sin check GitGuardian observado en el SHA del merge. Fuente Railway
fijada al SHA; no seguimiento automático de futuros pushes.

- StockApp UAT/uat, mismos IDs de proyecto/servicios/volumen documentados abajo.
- API deployment `dc991ae7-1c0c-4976-9812-ce1209aaaf12`: SUCCESS, una réplica online.
- PostgreSQL deployment `6c48c6eb-d541-4c16-b8f5-f958d0351b43`: SUCCESS, versión18.6.
- us-west2; API y DB limitados cada uno a0.5vCPU/500000000 bytes; volumen efectivo5000MB.
- DB privada con endpoint `postgres`, sin TCP proxies. Sin cron, HA o recursos adicionales.
- Predeploy compilado separado: `PostgreSQL migrations complete.`; ledger/schema también
  validados por readiness. Rerun remoto explícito y persistencia funcional tras restart NOT RUN.
- [Health HTTPS real](https://stockapp-api-uat-uat.up.railway.app/health):200 `{status:"ok"}`,
  no-store/requestId; `/v1/me` sin sesión401; preflight Web UAT204 con origen exacto y credentials;
  origen ajeno403 sin allow-origin. Sin bypass TLS ni cambios de seguridad/runtime.
- Usuario aprobó costo/configuración y secretos; patch68 no destructivo revisado. El conector
  canceló dos accept-deploy pese a las confirmaciones; el humano pulsó Deploy en la consola.
  Entorno final sin patch pendiente, dos servicios online y cero fallos/notificaciones observados.
- Resend: dominio `ian-k.dev` ya verificado; sin cambios DNS, plan, tracking ni claves existentes.
  Clave nueva `stockapp-uat-auth`, Sending access solo para ese dominio, guardada privadamente
  como RESEND_API_KEY; sender `stockapp-uat@ian-k.dev`, transporte HTTPS explícito.
- Un signup sintético desde Railway200, emailVerified=false; generó un único POST `/emails`200
  en Resend con la clave dedicada. Destino `delivered+stockapp-uat-smoke-20261016@resend.dev`,
  [simulador oficial](https://resend.com/docs/dashboard/emails/send-test-emails), sin buzón humano.
  Sin piloto/Inventory ni datos financieros para esa cuenta simulada. La prueba posterior con
  el operador y buzón real consta en la sección superior; no se reutilizó la cuenta del simulador.
- Auth y HMAC UAT: secretos independientes nuevos,32 bytes CSPRNG cada uno, generados una vez;
  Railway y archivo externo con ACL usuario/SYSTEM. Versión HMAC `stockapp-uat-suppression-v1`;
  copia humana Bitwarden pendiente. Claves age/HMAC históricas intactas.
- Recursos activos facturan consumo: máximo continuo teórico USD30.75/mes antes de red/otros
  usos, aprobado; Hobby incluye USD5. Consumo/factura mensual observados todavía no verificados.

La URL Railway es de la API. Pages, DNS custom, sesión autenticada y piloto se completaron
en la sección superior; el smoke financiero completo sigue pendiente.
Evidencia externa local: prefijo `stockapp-dev-uat-01-`, archivos `activation-2026-10-16.md` y
`railway-http-2026-10-16.json` en artifacts. No valores privados en Git ni en esos reportes.

## Preparación histórica — 2026-10-15

Las secciones inferiores conservan el preflight, propuestas y gates previos a la activación.
Sus observaciones staged/NOT RUN describen esa fecha; el estado actual consta arriba.

Estado: **PARTIAL — PREPARACIÓN LOCAL; ACTIVACIÓN PENDIENTE**, 2026-10-15 America/Guayaquil.
Preparación iniciada el 2026-10-14; decisiones y validaciones adicionales el 2026-10-15.
No Web/API/DB UAT desplegadas ni smoke remoto completado. `UAT SANDBOX READY` exige
los flujos reales de la matriz inferior; `UAT FULL ACCEPTANCE` conserva los controles para
datos reales, incluyendo operación/backup/recovery/privacidad. Ninguno está acreditado hoy.

## Preflight y convivencia con DEV-02E

Base main limpia y actualizada: `4219ea19bdc30d115a3072d8bbb7d4bac3e025ac`,
[PR109 DEV-02D](https://github.com/ian0000/StockApp/pull/109) integrado; 0 ahead / 0 behind.
Rama `chore/dev-uat-01-minimal-deployment`. PR y merge exclusivamente humanos.
No desplegar este head hasta revisión/merge y gates del SHA exacto finalmente seleccionado.

DEV-02E se ejecutaba en este mismo chat: rama `docs/dev-02e-backup-readiness-audit`,
sin archivos modificados, commits ni mutaciones externas. Se conservó esa rama y su evidencia
parcial en `C:\Users\USER\.codex\artifacts\stockapp-dev02e-preflight-handoff.md`.
`DEV-02E.md` aún no existe; no se atribuye auditoría terminada. Inventario del checkout/worktrees,
agentes y chats consultado: ningún segundo agente activo sobre este checkout al preparar UAT.
Revalidar exclusión antes de cualquier mutación externa, no asumirla permanente.

Revisados AGENTS65.1/65.2, DEV-00/01/02/02B/02C/02D, DEPLOYMENT, CI_CD, SECURITY,
OPERATIONS, BACKLOG/CURRENT_STATE, CI-OPT-01 y composición real Web/API/auth/migraciones/piloto.
Herramientas y documentación de backup intactas; no ceremonia age, smoke R2 o restore repetidos.

La autorización de este ticket difiere backup independiente, retención efectiva, RPO/RTO y
disaster recovery **solo para datos ficticios descartables de pruebas internas**. No resuelve
los gates pendientes de DEV-02E para datos reales ni autoriza PROD, Sync o trabajo posterior.

## Evidencia remota de lectura

| Superficie | Observación y límite |
| --- | --- |
| Railway proyecto | StockApp UAT `1acb0266-cf67-4694-a470-543f62a7a30f` |
| Entorno exacto | uat `21841fe9-3208-46ec-874d-0853d938effd` |
| Patch | `7eb661e7-067d-494a-917d-d1c816755b75`, 56 STAGED, no destructivo; updatedAt 2026-10-13T15:37:47.231Z |
| API | `207b53d2-6c74-4a58-bb30-6e36c9e2f496`, staged-create, latestDeployment null |
| Pin API | `5222ee82437dcff1c5e5a691c466ddf5eaebfe7e`; anterior a la base main, no candidato de este despliegue |
| PostgreSQL | `d6c6771b-d430-413f-a86f-d338ccf4f28f`, staged-create; imagen `ghcr.io/railwayapp-templates/postgres-ssl:18`; no HA activado |
| Volumen | `b6eebc3d-e888-4a04-a23f-372c4b728502`, staged-create, `/var/lib/postgresql/data`, sizeMB null; capacidad 5 GB previamente aprobada solo staged |
| Topología | us-west2, una réplica API y una DB; sin cron ni despliegues efectivos observados |
| Variables API | Solo nombres HOST, NODE_ENV, RAILPACK_NODE_VERSION, RAILPACK_NO_SPA, RAILPACK_PRUNE_DEPS; faltan nombres de configuración auth/DB/correo |
| Cloudflare Pages | Cuenta disponible tras login; inventario muestra tres proyectos, ninguno `stockapp-web-uat`; no se abrió ni modificó otro proyecto |
| DNS | Ambos hosts responden NXDOMAIN local; búsqueda `stockapp` en la zona ian-k.dev muestra «No DNS records»; sin escrituras |
| Cloudflare Email Sending | Consola muestra «Enable Email Sending», requiere Workers Paid; sin habilitación, compra o token |

Consultas Railway: describe-environment, get-staged-changes y describe-service de API/Postgres,
sin list-variables, valores privados, logs/datasets o credenciales. Patch completo inspeccionado:
API17, Postgres37 y volumen2 cambios; defaults `haConversionConfig` describen una opción del
template, no un cluster HA creado. Identidad, pin y contenido se compararán otra vez antes de aceptar.
No accept, repin, update-service, set-variables, DNS, creación Pages o envío de correo ejecutados.

## Configuración concreta propuesta — NO APLICADA

El humano confirmó reservar ambos hosts y el piloto CLI existente como restricción de uso
comercial. Esas respuestas no autorizan todavía cambios DNS, activación o consumo.

| Componente | Configuración propuesta para checkpoint 2 |
| --- | --- |
| API | Servicio existente, raíz `/`, Railpack, Node22.16.0/pnpm11.0.9, us-west2, una réplica |
| Build API | `pnpm install --frozen-lockfile && pnpm --filter @stock-app/api build` |
| Predeploy explícito | `node apps/api/dist/infrastructure/postgres/migrate.js`; separado del startup HTTP |
| Start | `node apps/api/dist/server.js`; HOST=0.0.0.0; PORT provisto por Railway |
| Readiness | `/health`, timeout plataforma300s existente; no cambiar probe/pools/timeouts de aplicación |
| Recursos propuestos | API y DB: máximo 0.5 vCPU / 0.5 GB RAM por réplica; volumen5 GB; sin HA, autoscaling ni réplicas adicionales |
| DB | Template existente, red privada, sin TCP proxy público; comprobar versión y capacidad efectivas tras autorización |
| Pages | Proyecto independiente `stockapp-web-uat`, source StockApp; raíz monorepo; static output `apps/web/dist`; sin Functions/SSR |
| Build Web | Instalación frozen; `pnpm --filter @stock-app/contracts build && pnpm --filter @stock-app/web build` |
| Web UAT | `https://stockapp-staging.ian-k.dev` |
| API UAT | `https://api-stockapp-staging.ian-k.dev` |
| Autodeploy | Deshabilitado en ambos proveedores, incluidas previews conectadas a UAT; despliegue manual del SHA validado |

Contracts exporta tipos/dist para build; compilarlo primero reproduce la preparación del job Web
existente. No omitirlo porque un dist residual local oculte la dependencia. Conservar migrations
SQL, node_modules y dist Contracts/API en el runtime; no copiar únicamente server.js.
Los límites son una propuesta revisable, no reserva de recursos ni garantía de memoria suficiente.
OOM/build/runtime failure exige diagnóstico; no aumentar límites facturables automáticamente.

DB URL será referencia privada al servicio Postgres, nunca copiar `${{Postgres.DATABASE_URL}}`
a ciegas sin comprobar que resuelve al hostname privado. TLS según template/cliente y certificado
válidos; sin `rejectUnauthorized:false`. No puerto público temporal para migrar desde este PC.
El migrador compilado corre dentro del servicio con red privada, usa advisory lock existente y
cierra su pool; confirmar ledger estable al repetirlo. No db:push, reset ni nuevas migraciones.

## Variables y custodia

| Lugar | Nombres y valor público/procedimiento |
| --- | --- |
| API públicas | NODE_ENV=production, HOST=0.0.0.0, AUTH_BASE_URL=https://api-stockapp-staging.ian-k.dev, APP_ORIGIN=https://stockapp-staging.ian-k.dev |
| API toolchain | RAILPACK_NODE_VERSION=22.16.0, RAILPACK_NO_SPA=1, RAILPACK_PRUNE_DEPS=false; preservar pnpm packageManager11.0.9 |
| API privadas | DATABASE_URL referenciada; BETTER_AUTH_SECRET y DELETION_SUPPRESSION_SECRET exclusivos UAT |
| Correo UAT | AUTH_EMAIL_TRANSPORT=resend, AUTH_EMAIL_FROM=sender UAT verificado por aprobar, RESEND_API_KEY privada dedicada de envío |
| Correo SMTP existente | Default si AUTH_EMAIL_TRANSPORT no existe o vale smtp; SMTP_HOST/PORT/SECURITY/FROM y USER/PASSWORD pareados, sin cambios de TLS |
| Web pública | VITE_API_URL=https://api-stockapp-staging.ian-k.dev; VITE_APP_ENV no es consumida actualmente, no introducir lógica para ella |

El humano confirmó durante DEV-02E «UAT aún no provisionado; sin registry real». No existe
evidencia de HMAC original UAT operativo ni se consulta/genera/rota uno en esta preparación.
Propuesta para checkpoint2: un nuevo secreto exclusivamente UAT de 32 bytes aleatorios o más,
versión de custodia `stockapp-uat-suppression-v1`, independiente del auth secret y claves age/R2.
Guardar privadamente en Railway y copia humana Bitwarden con entorno, procedencia, versión y
fecha; confirmar recuperación humana independiente. No imprimir valor/hash, argv o captura de
campos privados. Su generación y provisión requieren aprobación explícita propia del checkpoint.
No modificar la identity `stockapp-uat-age-v1` ni ningún secreto histórico de otro entorno.

## Decisión de correo — Resend HTTPS autorizado para preparación

La composición heredada exigía SMTP y usaba Nodemailer. [Railway outbound networking](https://docs.railway.com/networking/outbound-networking)
documenta SMTP deshabilitado en Hobby/Free/Trial; solo Pro+ lo permite. Cambiar únicamente el
host SMTP a Cloudflare no resuelve esa restricción de salida.

[Cloudflare Email Service](https://developers.cloudflare.com/email-service/api/send-emails/smtp/)
ofrece SMTP465/TLS y [API REST HTTPS](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/).
[Su precio publicado](https://developers.cloudflare.com/email-service/platform/pricing/) permite
destinos verificados gratuitos; destinatarios arbitrarios requieren Workers Paid. La consola
de esta cuenta exige Workers Paid para habilitar Email Sending: la modalidad gratuita a destinos
verificados no acredita acceso a su API. Sender/dominio/destinos todavía sin configurar.

El humano eligió «Preparar Resend HTTPS Free». Se implementó un adaptador detrás de EmailSender
con fetch nativo de Node, sin dependencia nueva. AUTH_EMAIL_TRANSPORT=resend es explícito;
sender bare y token requeridos, sin fallback a SMTP al faltar configuración. Default SMTP intacto.
POST fijo `https://api.resend.com/emails`, texto/subject/destino exactos, sin redirect ni retry,
señal de cierre y plazo propio10s. Cuerpo/error/token del proveedor nunca se propagan al logger;
se exige respuesta con id válido, aceptación no equivale a entrega al buzón. Better Auth,
verification/reset, cola, CORS/CSRF, reglas financieras y contratos públicos no cambian.
Pruebas focused17 PASS incluyen los15 casos nuevos del proveedor y2 regresiones config auth/SMTP.
Una integración adicional con PostgreSQL18.6 real y HTTP Resend simulado pasó: startup sin SMTP,
signup, bloqueo antes de verificar, verificación, login, reset, revocación de sesión y token
consumido; un envío rechazado permanece sanitizado y no habilita login sin verificación.
No envío real, alta de cuenta, token, DNS o consumo autorizados por esta decisión de preparación.

Workers Paid tiene mínimo$5/mes según [su tarifa](https://developers.cloudflare.com/workers/platform/pricing/),
distinto del Hobby Railway; no se contratará para esta propuesta. [Resend Free](https://resend.com/pricing)
publica límite diario100; confirmar cupo efectivo/cuenta propia antes de activar, sin upgrade,
overages ni credenciales de otras apps. La alternativa Pro+ con SMTP no fue seleccionada.
No usar puertos alternativos/relay para eludir la política del proveedor,
mock público, verification bypass o links secretos en logs como sustituto de entrega real.

Propuesta de sender exclusivo `auth@uat-mail.ian-k.dev`, aún sin aprobar/verificar. Revisar en
Resend los records específicos de esa alta (DKIM/SPF/return-path y conflictos) antes del checkpoint2;
no modificar MX/SPF/DMARC raíz ni reutilizar credenciales de otras apps. API key UAT con permiso
de envío limitado al dominio cuando el proveedor lo permita, custodia privada en Railway/Bitwarden.
No generar token ni solicitarlo por chat. Solo buzones de prueba del operador.

## Hosting y controles que se conservan

`apps/web/public/_headers` prepara CSP estática para el API UAT confirmado, scripts/styles
locales sin unsafe-inline/eval, frame-ancestors/object/base restringidos, no-referrer, nosniff,
permisos cámara/micro/geolocalización deshabilitados, HSTS1d sin includeSubDomains y noindex.
Es configuración exclusiva del sandbox: revisar origen CSP antes de otro entorno.
Vite copia el archivo; [Pages aplica sus reglas](https://developers.cloudflare.com/pages/configuration/headers/)
solo tras desplegar. No se acredita CSP/HSTS remoto por existir el archivo local.
No indexación no sustituye autenticación; no analytics, secretos o metadata comercial estática.

SPA usa fallback nativo de Pages sin `404.html` raíz; verificar refresh directo de rutas privadas,
verify/reset y assets en el host final. No redirigir errores API al HTML. Cache de API no-store
permanece en runtime; no cambiar reglas CDN globales ni cachear respuestas autenticadas.

Cookies API Secure/HttpOnly/host-only/SameSite=Lax y origins exactos existentes; hosts HTTPS
del mismo site evitan depender de cookies third-party de pages.dev/up.railway.app. No wildcard
CORS, compartir cookies Domain, desactivar CSRF/origin/email verification o proxy trust genérico.
Validar OPTIONS, credentials, requestId/no-store, certificados y callbacks sin URLs temporales
antes de declarar auth browser funcional. trustProxy actual conserva posible agrupación de rate
limits detrás del ingress; medir sin cambiar IP headers/trust/pools automáticamente.

Piloto aprobado: signup/login públicos, cuenta verificada y bootstrap normal; cloudAccessEnabled
permanece false hasta CLI explícito por User autorizado. No cuenta ficticia verificada por SQL.
Ejecutar `node apps/api/dist/ownership/pilot-cli.js --user-id <id-privado> --enable` en contexto
privado autorizado; no endpoint administrativo nuevo ni IDs/emails en informe publicable.
Cuenta sin piloto debe fallar en acceso comercial y otra cuenta nunca lee Inventory ajeno.

## Costo revisable — activación no aprobada

Plan Hobby$5 informado previamente por humano, no consultado en billing en esta preparación.
[Tarifas Railway publicadas](https://docs.railway.com/pricing/plans): RAM$10/GB-mes,
CPU$20/vCPU-mes, volumen$0.15/GB-mes usado, egress$0.05/GB. Hobby incluye$5 de uso,
no es un techo de gasto ni se suma dos veces a ese mismo consumo.

Con los límites propuestos, dos réplicas a máximo1GB RAM/1vCPU agregado durante todo el mes
equivalen a$30 de cómputo;5GB totalmente usados añaden$0.75, más egress/correo y otros consumos.
No es costo observado: consumo real puede ser menor; recursos máximos no son reservas y el
resto de la cuenta comparte crédito. Ejemplo de uso promedio agregado1GB/0.1vCPU y5GB usados:
$12.75/mes antes de red/correo. No prometer que el sandbox cabe en$5.
Pages estático tiene [tráfico estático gratuito](https://pages.cloudflare.com/) sujeto al plan/
[límites](https://developers.cloudflare.com/pages/platform/limits/); no activar Functions o plan nuevo.
Resend Free seleccionado, condicionado al cupo/disponibilidad reales; no plan nuevo pagado,
overages, tracking o envío a clientes. Billing UAT efectivo NOT RUN.

## Secuencia de activación posterior — requiere checkpoint2

1. Cerrar decisión de correo, completar cambios/gates y PR/merge manual. Seleccionar SHA main
   exacto revisado; comprobar Quality checks y GitGuardian de ese SHA, no solo del head PR.
2. Confirmar que DEV-02E no audita simultáneamente; releer patch completo, IDs, costos, límites,
   dominio/correo y variables. Cambio inesperado invalida aprobación; nunca aceptar patch ajeno.
3. Obtener aprobación explícita de recursos, costo, DNS exacto y nuevos secretos exclusivos UAT.
   Mantener autodeploy deshabilitado; source pin debe actualizarse solo al SHA aprobado mediante
   operación staged/controlada y comprobar sus triggers antes de activar.
4. Con consentimiento, aplicar solo recursos acordados; Postgres privado con volumen y credenciales
   administradas. Migración explícita antes de HTTP; probar vacío/rerun sin cambios inesperados.
5. Preparar Pages independiente asociado al source StockApp, Git production/preview autodeploy
   deshabilitados antes de admitir tráfico UAT. Publicar artefacto del SHA aprobado con metadata
   de commit/config y checks; no pipeline nuevo ni despliegue de latest sin identidad.
6. Asociar únicamente los dos hosts aprobados, records suministrados por cada proveedor y TLS
   válido. No sobrescribir conflictos ni tocar landing/PROD/otras aplicaciones/correo raíz.
7. Buzones de operador, signup/verify/login/piloto y smoke inferior; documentar PASS/FAIL/NOT RUN.
   No promover sandbox a datos reales por este resultado. STOP al completar el objetivo.

## Matriz de aceptación remota

| Gate | Estado actual | Evidencia requerida |
| --- | --- | --- |
| API/DB/volumen live | NOT RUN | IDs efectivos/versiones, DB privada sin TCP público, persistencia y límites |
| Migración UAT | NOT RUN | Ledger exacto desde vacío, rerun estable y advisory lock sin SQL destructivo |
| API readiness/logs | NOT RUN | /health200 real;503 ante dependencia inválida; logs sanitizados |
| Pages/HTTPS/assets/SPA/CSP | NOT RUN | Host final, headers efectivos, deep-link refresh y consola sin CSP errors |
| Resend HTTPS delivery | NOT RUN | Adaptador local aprobado; falta cuenta/sender/token dedicados y entrega real a buzones controlados |
| Signup/verify/login/sesión/logout | NOT RUN | Flujo browser real, cookies/origin/CSRF y revocación |
| Reset | NOT RUN | Entrega real, cambio de clave y revocación existentes |
| Piloto y aislamiento A/B | NOT RUN | Cuenta sin piloto rechazada; cuentas autorizadas aisladas |
| Productos/compra/venta | NOT RUN | Datos ficticios, stock/costo exactos, ganancias/historial sin reescritura |
| Ajuste/anulaciones/export | NOT RUN | Precondiciones/elegibilidad existentes, export propio válido |
| Logout/login persistente | NOT RUN | Dataset propio conserva valores y receipts |
| Reinicio API controlado | NOT RUN | Requiere autorización incluida; sin reset DB ni datasets ajenos |

Datos sugeridos únicamente sintéticos: A/B, Product a costo10/precio15, compra10 unidades,
venta2 y conteo posterior explícito; comprobar stock8 antes de otros movimientos. Anular solo
operaciones elegibles según respuesta servidor y coste snapshot; nunca forzar una anulación
antigua para completar checklist. Evidencia sin tokens, URLs con verification token o datos privados.

## Detener acceso sin pérdida accidental

Ante error crítico: no abrir tráfico, no habilitar más pilotos. Con autorización operativa usar
CLI para deshabilitar pilotos existentes y suspender acceso/servicio público UAT, conservando DB
y volumen. Deshabilitar piloto no revoca auth ni cierra signup; cierre total requiere control
de ingress/servicio acordado. No borrar recursos, DNS ajeno, volúmenes, snapshots o datos ajenos;
retirada de acceso/paro con costo y persistencia revisados, nunca cleanup destructivo automático.

## Gates locales y revisión humana consolidada

`pnpm check` final:2608 PASS/0fail/0skip/0cancelled, incluyendo Domain428, Application432,
Mobile551, Contracts38, Web997, API85 y CI77. OpenAPI, formato, lint, types y builds API/Web PASS.
La integración DB adicional se agregó después de ese typecheck: typecheck/lint API y formato
global posteriores PASS. `pnpm test:db` completo:1048 PASS/0fail/0skip/0cancelled/0todo,
343.136s; exit0, sin connection timeout. Incluye auth/ownership/security, comandos API-01..10,
lecturas/export/deletion y compiled HTTP. No es smoke de los proveedores.
Generadores finales: db:generate sin cambios; auth:generate sin drift; auth:check PASS.
`git diff --exit-code` de Drizzle y auth-schema y status de esas rutas vacíos.
actionlint1.7.12 PASS; browser validators reproducibles62 archivos PASS.
Warning Vite del check:1733.09kB/237.97kB gzip en el chunk principal. Build final con
VITE_API_URL UAT:1733.14kB/238.02kB gzip, PASS; no se elevan límites ni se añade code-splitting.
Auditoría estática de sus13 scripts: origen UAT presente, sin origen local de fallback,
new Function/eval ni marcadores de secretos del servidor; `_headers` copiado byte a byte.
Esto valida el artefacto local, no entrega de correo, CSP efectivo o HTTPS remoto.
Docker inicialmente cerrado/engine inaccesible; humano confirmó apertura. Se verificó imagen,
labels QA/DEV-02, volumen propio y bind loopback65437 y se inició únicamente ese contenedor
existente. Clientes18.6 locales. Migrador compilado real:3 PASS/0fail/0skip (vacío, lock/rerun,
rollback/fallo sanitizado). Suite completa final verde, sin cambios de pools/timeouts/concurrencia.
Browser local no pudo abrir loopback (`ERR_BLOCKED_BY_CLIENT`); no se eludió ese control.
El probe VM con generación dinámica prohibida y el test real de bundle de voids reprodujeron
dependencia Ajv; después del fix los8 browser-contract tests pasan. No es smoke browser remoto.
No CI/GitGuardian ni merge atribuibles a esta
rama hasta PR manual y verificación del SHA exacto. Cambios API limitados al transporte email
autorizado y su selección; headers Web y corrección de import puro. Ningún cambio Domain/
Application/Mobile/contratos/schema/migrations/dependencias/CI.

Decisiones conjuntas antes de activar: sender/dominio y buzones controlados/alcance de token;
provisión/custodia de nuevos auth/HMAC UAT;
costo/límites y recursos exactos; cambios DNS específicos sin interferir correo/otros proyectos;
PR/merge humano y SHA aprobado. Hosts, piloto y preparación Resend ya confirmados, sin pedirlos otra vez.
La preparación Git/headers no autoriza ningún cambio externo. Estado **PARTIAL**, no READY.

AUTO-FIX:
CAUSE: voids/input.ts importaba constantes desde el barrel Contracts que inicializa Ajv;
su generación dinámica contradice CSP sin unsafe-eval. Reproducido con VM y bundle test nuevo.
SOURCE OF TRUTH: constants reexportadas sin cambios por Contracts/transport y política CSP de
browser-contract.test.ts ya existente. FILES: apps/web/src/voids/input.ts y su test de bundle.
PRODUCTION BEHAVIOR CHANGED: NO (mismos comandos/constantes; se elimina side effect del compiler).
También se corrigieron formato del test nuevo y typing RequestInit de Node: cache-control header,
sin cast arbitrario ni relajación de assertions, timeout o política de entrega.
En la integración nueva, el payload HTTP se serializa explícitamente como JSON y el mock global
fetch se restaura antes del teardown DB: el provisioning gate local también usa fetch. El primer
focused falló en ese hook; corregido el ownership del mock,1 PASS/0fail/0skip. Sin cambios al
harness compartido ni comportamiento productivo; evidencia fallida conservada, sin reintento ciego.
Se limpió únicamente su DB descartable residual tras comprobar las dos cuentas ficticias exactas,
ventana de creación de esa ejecución y cero conexiones. DROP normal, sin FORCE/terminate;
al terminar no queda ninguna DB con el prefijo descartable del harness en ese contenedor QA.

Evidencia local fuera del repositorio: `C:\Users\USER\.codex\artifacts\`, prefijo
`stockapp-dev-uat-01-`: `check-final.log`, `db-final.log` y su `result.json`,
`resend-integration-cleanup.log`, `migrations.log`, `web-uat-final.log` y `static-audit.json`.
Las ejecuciones fallidas anteriores se conservan; solo los resultados finales descritos acreditan
los gates locales. Verificaciones finales de referencias documentales/diff y estado Git en entrega.

STOP sin PROD, datos comerciales reales, backup/scheduler/R2 lifecycle ni siguiente ticket.
