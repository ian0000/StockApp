# ADR-WEB-013 — Public/app/API hostname strategy

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Landing existe y no debe convertirse en inventario. Cookies entre app/API deben funcionar con
orígenes distintos, sin abrir sesión a cualquier subdominio o preview de terceros.

## Decisión

Public https://ian-k.dev/stockapp/, app https://stockapp.ian-k.dev,
API https://api-stockapp.ian-k.dev. Staging app/api en subdominios equivalentes explícitos.
Cloudflare DNS/TLS; cookie host-only API, app usa credentials+CORS exacto. No cookie compartida
con root domain/public site.
Fuente: [DEPLOYMENT](../DEPLOYMENT.md), [AUTH](../AUTH.md).

## Alternativas

Path público /stockapp/app confunde fronteira editorial y aplicación. Dominio externo API hace
cookies cross-site/ITP más complejas sin ventaja demostrada. Otro dominio dedicado puede evaluarse
con branding formal futuro, no es necesario para esta fase.

## Consecuencias

Dos deploys y config CORS explícita; usuarios distinguen landing/app. No DNS realizado aquí;
TLS/host cookie/Origin browser se prueban en DEV-04 y QA antes de release.
[Better Auth cookies](https://better-auth.com/docs/concepts/cookies) orienta el diseño de scope.
