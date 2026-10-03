# ADR-WEB-005 — Authentication architecture

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Mobile actual anónimo; cloud requiere identidad/ownership multi plataforma. Hacer crypto/reset
propios aumenta carga de seguridad; provider externo añade costo y lock-in.

## Decisión

Better Auth en API Railway, Drizzle PostgreSQL, email/password verificado, sesiones opacas revocables,
SMTP estándar. Web cookie host-only HttpOnly/Secure; Mobile plugin Expo/SecureStore.
Un owner por Business, un Business por User, un Inventory operativo; sin memberships N:M.
Free sigue anónimo; cloud piloto habilitado manualmente. Borrado de identidad Y dataset orquestado.
Fuente: [AUTH](../AUTH.md), [DATA_MODEL](../DATA_MODEL.md).

## Alternativas

Auth propio obliga implementar hashing/session/reset/CSRF. Auth gestionada reduce operación
pero suma identidad fuera DB y cambios de provider/SDK. Library conserva control sobre DB y
aporta integración documentada Expo sin gestionar un BaaS ni construir JWT paralelo.

## Consecuencias

Mantener updates/advisories y pruebas reales de cookies/CSRF/plugin. DB sessions permite revocar;
no offline login obligatorio para registrar compras/ventas locales. SMTP y región deben validarse
antes de piloto con datos reales. [Expo integration](https://better-auth.com/docs/integrations/expo)
revisada; selección no equivale a integración ya comprobada.
