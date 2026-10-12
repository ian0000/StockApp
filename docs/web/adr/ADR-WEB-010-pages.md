# ADR-WEB-010 — Cloudflare Pages frontend deployment

Estado: Accepted · Fecha: 2026-10-02.

Enmendado por DEV-00 el 2026-10-12; permanece Accepted. La interpretación main→PROD del texto
original inferior queda supersedida, no autoriza deployment comercial.

## Enmienda vigente — UAT-first

Primer proyecto/deployment Pages será UAT independiente de la landing. Rama candidata main
validada; `production branch` es etiqueta Pages, no PROD StockApp. Recursos naming UAT sujetos
a verificación posterior. PROD futuro requiere proyecto/deployment/config independiente tras
aceptación UAT y sign-off humano. No main→PROD automático ni provisioning en DEV-00.
DEV-04/DEV-06 prueban gate de required CI/GitGuardian del SHA exacto; sin evidencia completa,
autodeploy integrado deshabilitado y deployment manual controlado del commit validado.
Previews ficticios sin secrets/datos reales; VITE_* separado por entorno y release identity
conservada en build específico. [DEV-00](../DEV-00.md), [DEPLOYMENT](../DEPLOYMENT.md).

## Contexto

Pages es restricción aprobada y Web es SPA estática que llama API. No necesita SSR ni Functions.
Monorepo requiere acceso a root/lockfile y fuentes compartidas.

## Decisión original — 2026-10-02, interpretación de entornos supersedida arriba

Proyecto Pages Web independiente, root workspace, build filtrado Web, output apps/web/dist,
main production y staging autenticado aislado. Preview arbitraria usa datos ficticios;
no whitelist de todos los pages.dev en API. Cache assets hashed, HTML revalidate, API no-store.
Fuente: [DEPLOYMENT](../DEPLOYMENT.md).

## Alternativas

Vercel/Firebase Hosting/IIS/VPS no cumplen target aprobado y no hay blocker demostrable de Pages.
Reutilizar proyecto landing une publicaciones independientes e introduce riesgo de sesiones.

## Consecuencias

SPA deep-link fallback probado; VITE_* público. Pages CD no sustituye required CI; promoción de
commit verde se comprueba en DEV-04 o se usa control manual de deploy en Pages hasta tener gate.
[Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) revisado.
