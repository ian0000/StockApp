# ADR-WEB-002 — Web frontend framework

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Web es inventario privado interactivo, no landing. Equipo ya usa React/TypeScript;
preview Expo web actual no tiene servicios persistentes.

## Decisión

React + Vite SPA TypeScript strict, React Router y TanStack Query. React local para forms,
carrito y estado de edición exacto; contracts/domain para validación/previews.
Sin Redux/Zustand ni librería forms nueva inicialmente. Hosting Pages.
Fuente: [WEB_UX](../WEB_UX.md), [ARCHITECTURE](../ARCHITECTURE.md).

## Alternativas

Expo Web reutiliza componentes pero acopla UI/browser a módulos nativos/preview sin persistencia.
Astro encaja en landing, aporta poco al estado autenticado dinámico. Next/SSR aumenta runtime y
deployment sin necesidad SEO en inventario privado. No se cambia framework Mobile.

## Consecuencias

UI web propia, no clon de pantallas RN; dominio/tipos reutilizables. Vite build empaqueta workspace
source. Query library justificada por fetch/cache/invalidation/session scoping, no estado global.
Rutas requieren SPA fallback y pruebas de refresh/deep links. Dependencias se fijan después.
