# Arquitectura objetivo

Normativa para la fase Cloud/Web; sistema actual en CURRENT_STATE. No hay servicios desplegados.

CLOUD-01 (2026-10-03) implementa solo foundation HTTP local/contracts base. Roles de negocio,
ownership y sync continúan como objetivo. CLOUD-02 incorpora solo schema/migrations PostgreSQL
y conexión explícita de mantenimiento/test, con servidor real local/CI; no DB desplegada.
CLOUD-03 incorpora Better Auth 1.7.7 y SMTP provider-neutral dentro de apps/api, configuración
y factories explícitas, bridge Fastify oficial y schema generado/migration Drizzle. Sin DI framework.
HTTP no automigra; /live y buildApp() no necesitan auth/DB/SMTP. Sender se drena al shutdown;
correo en memoria no es job durable. CLOUD-04 implementa ownership separado de identidad:
session oficial → owner → Business → Inventory scoped, bootstrap vacío y piloto por CLI.
Helpers pequeños en apps/api/src/ownership, sin framework DI ni duplicación de Application.

CLOUD-05 añade boundary en apps/api/src/security: CORS oficial, Origin exacto antes de DB,
HMAC-SHA256 con claves derivadas separadas CSRF/rate y sesión oficial antes del token CSRF.
Tabla propia security_rate_limits, consume SQL ON CONFLICT atómico por PK(scope,key_hash),
ventana fija desde primer intento; denegación no extiende ventana y count saturado.
Auth/negocio comparten storage, tienen scopes distintos; no contador memory ni JWT propio.
Schema Better Auth intacto. /live sigue independiente de DB; migration0004 explícita aparte.
IP viene de socket Fastify trustProxy=false; header interno sobrescrito por servidor hacia Better Auth.
Proxy real por verificar en DEV-01/DEV-04. [Evidencia y ventanas](CLOUD-05.md).

## Sistemas y responsabilidades

| Sistema | Responsabilidad | Persistencia/autoridad |
| --- | --- | --- |
| Mobile | Operar sin red, dominio local, UI nativa, consentir conexión, sync | SQLite inmediato; operaciones pendientes durables |
| Web App | UI autenticada online, consultas y comandos; cálculos de preview | Memoria de UI/query; ningún ledger financiero browser |
| API | Sesión, autorización, validación, dominio compartido, comandos/sync/import | Único escritor cloud; transacciones PostgreSQL |
| Cloud DB | Dataset aceptado compartido y metadatos de entrega | Autoridad compartida para operaciones aceptadas |
| ian-k.dev | Landing, privacidad, términos y soporte | Repo independiente; no accede al inventario |
| Infraestructura | Railway ejecución/DB; Pages entrega SPA; Cloudflare DNS/TLS | Supporting infrastructure, fuera del dominio lógico |
| Email | Transporte SMTP de verificación/reset | Mensajes de identidad; sin catálogo/ventas adjuntos |

Fuente inmediata local y autoridad compartida son responsabilidades distintas. Antes de conectar,
SQLite es todo el inventario del usuario. Después de conectar, cloud contiene el estado aceptado
compartido; SQLite conserva esa réplica más operaciones locales pendientes. La app sigue confirmando
durabilidad LOCAL sin esperar cloud, con etiqueta de sincronización. Ver SYNC para conflictos.
Web confirma solo después de commit del servidor. Internet/email/telemetría no bloquean Free local.

## Stack decidido

React + Vite + TypeScript strict SPA, React Router para rutas, TanStack Query para server-state,
estado React local para forms/carrito. Backend Node 22 (baseline mínimo 22.16.0), Fastify,
JSON Schema de transporte con tipos derivados, Better Auth, Drizzle PostgreSQL y driver `pg`.
REST JSON `/v1`, sesiones opacas revocables y comandos idempotentes.
No Redux/Zustand, SSR, PWA, broker, Redis, microservicios ni endpoints DB directos en V1.
Foundation fija Fastify 5.12.5 y json-schema-to-ts 3.1.1; restantes dependencias en sus tickets.

Fastify gana frente a Express por validación/serialización explícitas y composición pequeña;
Nest añade estructura/decoradores innecesarios; Hono tiene menor ventaja aquí que en edge.
React/Vite gana frente a Expo Web por separar UI browser de APIs nativas, y frente a Astro/Next
porque inventario privado interactivo no requiere contenido estático editorial ni SSR/SEO.
PostgreSQL gana por transacciones, constraints y joins; SQLite cloud único complicaría concurrencia
y operación; MongoDB duplicaría un modelo relacional sin ventaja específica.

## Topología del repositorio

Un solo `ian0000/StockApp` pnpm workspace, despliegues independientes por app:

```text
apps/mobile/                  EXISTENTE, UI + SQLite
apps/web/                     OBJETIVO, SPA + API client
apps/api/                     EXISTENTE HTTP + PostgreSQL + Better Auth/SMTP + ownership; sync OBJETIVO
packages/domain/              EXISTENTE, reglas puras
packages/application/         EXISTENTE, casos de uso/ports
packages/shared/              EXISTENTE, aún vacío; no llenar por anticipación
packages/contracts/           EXISTENTE schemas/codecs base; DTO/command envelopes OBJETIVO
docs/web/                     ESTA ENTREGA
```

No se crea package infrastructure común: schemas dialect-specific viven en sus apps.
Web no importa Application que ejecuta repositorios como si fueran HTTP CRUD; consume contratos.
API implementa ports de Application y envoltura transaccional de ownership/idempotencia/sync.
Mobile incorpora esos mecanismos por tickets específicos sin mover carpetas por conveniencia.

Un cambio de domain/contracts dispara CI de todos los consumidores. Cada app tiene build independiente;
main no implica nuevo binario Mobile ni OTA. API mantiene compatibilidad con binarios instalados,
capabilities y versión de protocolo. Cambios compatibles aditivos en `/v1`; incompatibles requieren
`/v2` y ventana de coexistencia explícita. No versionar paquetes privados/publicar npm en V1.

Repos separados evitarían CI común pero introducirían distribución/versionado y riesgo de divergencia
de reglas. El workspace existente reduce ese costo y permite revisión de contracts antes de features.
La landing permanece en su repo; no se incorpora al monorepo.

## Límite de transacción

Un comando API bloquea la fila del Inventory (`SELECT FOR UPDATE`) y valida Business activo,
propietario, precondiciones y receipt; ejecuta dominio y persiste datos, receipt y ChangeSet juntos.
V1 serializa escritores por inventario: suficiente para negocios pequeños, evita deadlocks multiproducto
y secuencias de sync fuera de orden. No locks entre tenants. Operaciones largas/import se preparan fuera
del lock y activan dentro de transacción corta. Consultas no bloquean el loop; snapshots coherentes.

READ COMMITTED con todos los escritores sujetos al mismo lock. No se permite bypass desde rutas,
jobs o import. Unique constraints son defensa adicional. Fallos SQL rollback; reintentos internos
acotados solo por deadlock/transient con misma operationId. Ningún email se envía dentro de la venta.

Los [diagramas](diagrams/README.md) separan runtime, delivery, sistema actual y objetivo.
