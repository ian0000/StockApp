# Despliegue objetivo — sin configuración aplicada

Normativa para hosts, entornos y secretos. Plataforma fija: frontend Cloudflare Pages;
API y PostgreSQL Railway. Cloudflare conserva DNS/TLS/custom domains; Railway aloja ejecución.
No proyecto/service/DB/DNS/env externos creados ni credenciales consultadas en esta fase.

## Hosts

| Uso | Host objetivo | Estado |
| --- | --- | --- |
| Landing/legales/support | https://ian-k.dev/stockapp/ | Sistema independiente existente; no modificado |
| Web app | https://stockapp.ian-k.dev | Target, no provisionado aquí |
| API | https://api-stockapp.ian-k.dev | Target, no provisionado aquí |
| QA web | https://stockapp-staging.ian-k.dev | Target staging, antes de auth E2E |
| QA API | https://api-stockapp-staging.ian-k.dev | Target staging, DB separada |

Subdominios app/API del mismo site HTTPS simplifican cookies same-site y distinguen public/app/API.
No usar path de landing como inventario ni alternar proveedores por familiaridad.

## Cloudflare Pages

Un proyecto app-web independiente de la landing; repo StockApp, branch production main.
Build working directory raíz del monorepo para resolver workspace deps y lockfile.
Comandos OBJETIVO, scripts aún inexistentes: instalación `pnpm install --frozen-lockfile`,
build `pnpm --filter @stock-app/web build`, output `apps/web/dist`. Vite empaqueta imports domain/contracts
de source workspace; no obliga a publicar paquetes ni bundle Expo. No Pages Functions/SSR en V1.

SPA con index.html y fallback client routing; no 404.html top-level que desactive fallback de Pages.
Verificar deep links /products/id, refresh y auth redirect sin redirigir errores API a index.html.
Assets fingerprinted cache long immutable; HTML/config no-cache/revalidate; auth/API no-store.
Headers CSP/security en artefacto estático revisado; ningún dato de inventario embebido en build.

VITE_API_BASE_URL y VITE_APP_ENV son públicos y embebidos durante build, no runtime secrets.
Cambio de env requiere rebuild. Producción apunta API production; staging a API staging.
Preview de ramas confiables: Pages preview estático/contratos ficticios por defecto, sin credenciales
de prod. Para QA autenticada, usar branch staging y hostname staging mismo site, no wildcard pages.dev
en CORS; preview arbitraria con datos ficticios puede funcionar sin login. No exponer cuenta real a PR
de fork ni permitir cookies third-party como workaround. Branch controls/watches en DEV-03/DEV-04.

[Guía Vite/Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/),
[SPA serving](https://developers.cloudflare.com/pages/configuration/serving-pages/) y
[branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
revisadas; comandos de paquete son diseño futuro, no comandos ejecutados hoy.

## Railway

Proyecto con entorno production: api (una réplica V1), postgres (volumen persistente), tarea
programada de mantenimiento/backups como comando del mismo código cuando necesario; sin broker/Redis.
Staging aislado con API/DB propios y datos ficticios: justificado por sync, auth y migraciones
destructivas que no se prueban contra producción. No crear una DB por cada PR.

Repo root `/` como shared monorepo; Railpack objetivo, toolchain explícito Node 22 compatible y
pnpm 11.0.9. No copiar el Nixpacks bootstrap de otra app como garantía. DEV-01 debe demostrar
instalación pnpm determinista y resolver cualquier fallo Corepack/Railpack con logs reales antes de
llamarlo listo. Builds no llevan DB/secrets en frontend ni dependen de apps/mobile native.

Scripts implementados CLOUD-01: `pnpm build:api` compila contracts y API con tsc, sin bundler.
Entry `apps/api/dist/server.js` consume `packages/contracts/dist` mediante workspace: ambos dist
y node_modules deben conservarse. Start filtrado ejecuta `node dist/server.js` desde apps/api;
`node apps/api/dist/server.js` desde raíz también funciona. Dev usa tsx/condition development.
Domain/Application no se importan todavía. CLOUD-02 implementa db:migrate explícito, SQL versionado
y advisory lock/cierre del pool; no predeploy ni variables Railway configuradas.
Comando build Railway `pnpm --filter @stock-app/api build`; predeploy
`pnpm --filter @stock-app/api db:migrate`; start filtrado o node según script fijado en CLOUD-01.
Migration es tarea única con advisory lock, falla y bloquea nuevo deploy si SQL falla;
no correr auto migrations en cada request/start replica.

API bind 0.0.0.0:$PORT. Healthcheck `/health` timeout de plataforma 300s y ping DB acotado 2s;
200 solo DB accesible/schema compatible/config válido, 503 sin detalles. SIGTERM deja de aceptar
requests, termina transacciones dentro de grace period y cierra pool; client retry misma key.
Pool inicial max 10, timeouts query 10s para comandos, límites especiales import/export explícitos.
Postgres red privada, DATABASE_URL referencia servicio. Acceso público DB deshabilitado salvo
intervención operativa temporal autorizada; ningún VITE_DATABASE_URL.

GitHub autodeploy branch main para production, staging para QA; wait for required CI habilitado en
Railway y comprobado. Watch paths apps/api, packages/domain/application/contracts, lockfile y config
raíz. Cambios mobile-only no redeploy API; shared sí. Logs de build no equivalen a health runtime.
[Railway monorepos](https://docs.railway.com/deployments/monorepo),
[healthchecks](https://docs.railway.com/deployments/healthchecks),
[PostgreSQL](https://docs.railway.com/databases/postgresql) sustentan target operacional.
Railway healthcheck de despliegue NO es monitor continuo; OBSERVABILITY exige señal runtime adicional.

## Variables y secretos

| Lugar | Variables previstas | Secreto |
| --- | --- | --- |
| Pages production/staging | VITE_API_BASE_URL, VITE_APP_ENV | No |
| Railway API | NODE_ENV, PORT, APP_ORIGIN, AUTH_BASE_URL, LOG_LEVEL | No (config restringida) |
| Railway API | DATABASE_URL, BETTER_AUTH_SECRET, SMTP_HOST/PORT/USER/PASSWORD, SMTP_FROM | Password/secret/URL credencial sí |
| API auth config | AUTH_BASE_URL, APP_ORIGIN, SMTP_SECURITY, NODE_ENV=production en despliegue | Origins/modo públicos, no secretos |
| Railway maintenance | BACKUP_ENCRYPTION_KEY, BACKUP_DESTINATION_CREDENTIALS | Sí |
| Local .env ignorado | URLs DB de dev/secret auth ficticio/SMTP test | Sí; .env.example solo nombres/placeholders |

No valores reales en docs/Git. Secrets por entorno en Railway, acceso mínimo, rotation con
revocación cuando cambia auth secret. Variables VITE_* nunca passwords, token sesión, DB ni SMTP.
Dependencias y env schema se validan al boot; default permisivo de auth/origins prohibido.

CLOUD-03 implementa config server-side local, sin aplicar variables en Railway. AUTH_BASE_URL activa
composición auth y exige DATABASE_URL/APP_ORIGIN/secret/SMTP completos. Sin AUTH_BASE_URL conserva
foundation-only, /live 200 sin DB/SMTP, auth ausente y /health 404. No automigrations/ready ficticio.
Producción exige HTTPS; cookie Secure también para HTTPS de QA. SMTP_SECURITY debe ser tls (TLS
inmediato) o starttls (upgrade obligatorio); local solo loopback no-production. FROM bare email,
USER/PASSWORD ambos o ninguno según relay. TLS remoto/delivery externo no validados aquí.
Generación CLI usa config ficticia offline independiente; nunca desplegar schema-config.ts como runtime.

## CORS/DNS/TLS

Production allow-origin exacto https://stockapp.ian-k.dev con credentials; staging exacto host staging.
OPTIONS antes de auth, métodos requeridos, headers Content-Type/Idempotency-Key/X-CSRF-Token;
exponer X-Request-Id/Retry-After. Vary: Origin. No `*` con credenciales ni reflect Origin arbitrario.
Native no depende de CORS, pero depende de sesión/ownership. Configuración de dev localhost separada.
Cloudflare DNS apunta API al dominio Railway validado y Pages al proyecto web; TLS end-to-end
verificado con certificados/origin. API privada no cacheable; no añadir CDN cache de datos comerciales.

## CI vs CD y rollback

GitHub Actions valida, no despliega. Pages y Railway son CD; PR/revisión/merge siguen la autorización
vigente de CI_CD (agente autorizado, checks verdes obligatorios, sin bypass).
Pages auto-build no reemplaza CI: activar production deploy solo de commit main cuya CI pasó.
DEV-04 comprueba esa asociación; si integración no ofrece gate de CI efectivo, usar aprobación/deploy
manual del artefacto de commit verde desde Pages hasta resolver, sin pasar CD a GitHub Actions.
No prometer wait-for-CI nativo de Pages sin comprobarlo.
Rollback frontend al artefacto anterior; API al build compatible con schema expand.
Migración destructiva no se 'revierte' bajando código; plan restore aislado en OPERATIONS.
