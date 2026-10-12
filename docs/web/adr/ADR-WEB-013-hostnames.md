# ADR-WEB-013 — Public/app/API hostname strategy

Estado: Accepted · Fecha: 2026-10-02.

Enmendado por DEV-00 el 2026-10-12; permanece Accepted. El uso de entornos/hosts de la decisión
original inferior queda sujeto al mapping propuesto y a aprobación explícita antes de DEV-04.

## Enmienda vigente — UAT-first y propuesta DNS

UAT será primer entorno online; la topología antes production se reasigna a UAT, sin asignar DNS
automáticamente. Propuesta: `stockapp-staging.ian-k.dev`/`api-stockapp-staging.ian-k.dev` para UAT;
reservar `stockapp.ian-k.dev`/`api-stockapp.ian-k.dev` existentes para PROD futuro independiente.
Ambos pares requieren confirmación humana antes de DEV-04. No inventar otro host PROD ni afirmar
DNS/TLS configurados. Staging es terminología histórica, no tercer entorno requerido.
Landing ian-k.dev/stockapp permanece separada; UAT no se comunica como producto oficialmente
lanzado. Cookie host-only/credentials/CORS exactos por entorno, sin compartir DB/secrets/cookies;
no wildcard previews. No provisioning ni cambios live. [DEV-00](../DEV-00.md), [DEPLOYMENT](../DEPLOYMENT.md).

## Contexto

Landing existe y no debe convertirse en inventario. Cookies entre app/API deben funcionar con
orígenes distintos, sin abrir sesión a cualquier subdominio o preview de terceros.

## Decisión original — 2026-10-02, mapping de entornos enmendado arriba

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
