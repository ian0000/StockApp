# ADR-WEB-010 — Cloudflare Pages frontend deployment

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Pages es restricción aprobada y Web es SPA estática que llama API. No necesita SSR ni Functions.
Monorepo requiere acceso a root/lockfile y fuentes compartidas.

## Decisión

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
