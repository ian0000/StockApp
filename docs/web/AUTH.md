# Identidad y autorización

Decisión: Better Auth alojado en la API Railway, adapter Drizzle PostgreSQL, email/password,
sesiones opacas en DB, plugin Expo. No auth criptográfica casera, JWT ledger ni proveedor BaaS.
SMTP estándar para verificación/reset; operador elige credenciales durante despliegue.

Comparación: auth propio obliga a mantener hashing, reset, sesiones y defensas; proveedor gestionado
reduce carga pero suma coste/lock-in y un sistema externo de identidad; librería especializada
mantiene identidad en nuestra DB y aporta flujos multi plataforma. Better Auth reduce implementación
propia, no elimina mantenimiento, revisión de seguridad ni monitorización de dependencias.

## Flujos

Sign-up email/password crea identidad no verificada; no inventario/upload automático.
Email de verificación obligatorio antes de habilitar cloud commands/import. Login valida credenciales
y devuelve sesión revocable. Responses de sign-up/reset no permiten enumerar cuentas.
Reset usa tokens de un uso, TTL 30 minutos, SMTP; al completar revoca todas las sesiones.
Verificación TTL 24h y reenvío limitado. Adaptar configuración soportada a la versión fijada,
con pruebas de expiración y revocación, no solo flags en cliente.

CloudAccessEnabled se verifica en API, no como role enviado por Web. Piloto permite habilitar
cuentas concretas manualmente; antes de servicio comercial se conecta entitlement formal sin
modificar Free ni inventar pricing. Autenticarse no prueba derecho sobre Business ajeno.

## Web

Cookie de sesión host-only en `api-stockapp.ian-k.dev`, Secure, HttpOnly, SameSite=Lax,
Path=/; crossSubDomainCookies desactivado. Browser SPA y API comparten site HTTPS ian-k.dev,
pero tienen origins distintos: llamadas usan credentials=include y CORS exacto con credentials.
No cookie Domain=.ian-k.dev, no sesiones en localStorage, no JWT accesible a JS.
Cache de cookie de sesión deshabilitada para revocación inmediata en servidor.

TTL absoluto 7 días sin renovación indefinida; revalidar sesión en servidor cada solicitud;
reautenticación reciente <=5 minutos para borrado/export sensible/cambio password.
Logout revoca sesión server y limpia queries/carrito de la cuenta. Logout all revoca todas.
CSRF: validación Origin exacta + token CSRF por sesión para mutaciones de negocio,
rechazo de content-type no JSON; auth mantiene protecciones propias de la librería.
No desactivar CSRF/Origin para hacer funcionar preview. Ver SECURITY.

## Mobile

Plugin Expo usa SecureStore para material de sesión y cookies; API calls de negocio adjuntan la
cookie del plugin por transporte nativo documentado. No introducir refresh/access JWT paralelos.
Sesión debe validarse online para push/pull; expirar auth pausa sync y ofrece login, sin impedir
registros locales. Logout revoca cuando hay red; sin red elimina credencial local, pero no puede
revocar inmediatamente la sesión server. Informar ese límite y permitir revocar todas las sesiones
desde otra sesión online; expiración absoluta limita la sesión remota. No conservar otra copia del
token después del logout. Llamadas de negocio nativas también obtienen token CSRF ligado a sesión
desde /v1/session/csrf; no requieren inventar Origin browser ni permiten bypass de validación.

Account switching nunca reapunta automáticamente el SQLite conectado: exige resolver pending,
desvincular y abrir dataset separado o usar el flujo de recuperación de MIGRATION.
Deep links solo scheme exacto de la app; evitar URLs arbitrarias y wildcard exp:// en producción.
Sesión online caducada no limita Free ni borra datos locales.

## Aislamiento

Resolver session.user → Business.ownerUserId → Inventory. Middleware construye contexto autorizado
inmutable y repositorios scoping obligatorio. Child IDs consultados junto con inventoryId, nunca
por PK sin scope. Endpoint de negocio ajeno devuelve 404 sin revelar existencia. Admin manual
de habilitación no expone API general de usuarios. Usuario no cambia ownerUserId/cloudAccessEnabled.

## Export/borrado

Export devuelve snapshot de seguridad y perfil propio; descarga autenticada, sin URL pública de
vida larga. Borrado exige sesión reciente, confirmación y aviso sobre pending y copias locales.
API marca Business DELETING y revoca sesiones/dispositivos antes de purgar operaciones, receipts,
imports e identidad; el trabajo durable continúa tras reinicio. Página pública de solicitud objetivo
`https://ian-k.dev/stockapp/delete-account/` dirige al flujo autenticado con reautenticación o a
recuperación/soporte con verificación de identidad; se prepara en REL-01, sin crearla aquí.
No endpoint anónimo destructivo ni revelación de datasets.
No depender solo de `deleteUser` de Better Auth: debe cubrir las tablas de negocio y recuperación
de fallos. Ruta directa delete-user de librería no puede saltarse el orquestador de borrado.
Retención/backups/datos offline en OPERATIONS y PRIVACY_IMPACT.

## Fuentes revisadas

[Better Auth email/password](https://better-auth.com/docs/authentication/email-password),
[Expo integration](https://better-auth.com/docs/integrations/expo),
[cookies](https://better-auth.com/docs/concepts/cookies),
[security](https://better-auth.com/docs/reference/security),
[Drizzle adapter/installation](https://better-auth.com/docs/installation),
[deletion lifecycle](https://better-auth.com/docs/concepts/users-accounts).
Compatibilidad concreta Fastify/Expo y SameSite en browsers se prueba en CLOUD-03/SYNC-06;
no se declara verificada por esta revisión documental.
