# Auditoría del estado actual

Actualización CLOUD-06, 2026-10-05, base main `ce73381`: contracts V1/OpenAPI generados y
reproducibles, capabilities de /v1/me, schemas runtime compartidos y Application con IDs/tiempo
explícitos. Mobile prepara esas entradas en composición; Domain y schemas/migrations SQLite/Postgres
no cambian. Cinco rutas API implemented; demás planned, incluido /health404. [Evidencia](CLOUD-06.md).
CLOUD-06-FIX preserva UUID históricos válidos en DTOs/FKs/referencias/sync/import; nuevas identidades
comerciales y de protocolo continúan UUIDv7. Sin cambios en Application, Mobile, Domain ni DB en el FIX.

Auditoría Mobile original sobre base `e2e76c6`, 2026-10-02. Actualización CLOUD-01 del
2026-10-03 desde main `1a803a8` (PR #75): API HTTP local y contracts base ahora existen.
La validación de la baseline está en VALIDATION; la nueva en [CLOUD-01](CLOUD-01.md).
Actualización CLOUD-02 (2026-10-03), base main `acf8fc5`: schema/migrations PostgreSQL y
QA contra servidor PostgreSQL real local/CI, documentados en [CLOUD-02](CLOUD-02.md).
Actualización CLOUD-03 (2026-10-03), base main `a43b327`: Better Auth 1.7.7, sesiones PostgreSQL,
verify/reset/revoke y SMTP estándar local, documentados en [CLOUD-03](CLOUD-03.md).

## Estructura y ejecución

| Hallazgo | Evidencia local |
| --- | --- |
| pnpm monorepo `apps/*`, `packages/*` | `pnpm-workspace.yaml` |
| Node mínimo 22.16.0, pnpm 11.0.9 | raíz `package.json`; CI fija Node 22.16.0 |
| TypeScript strict y noEmit | `tsconfig.base.json`, tsconfig de paquetes |
| apps/mobile/api; domain/application/shared/contracts | directorios y sus package.json |
| Expo ~57.0.26, RN 0.86.3, React 19.2.3, Expo Router ~57.0.24 | `apps/mobile/package.json` |
| Drizzle 0.45.2 + expo-sqlite ~57.0.3 | mismo archivo |
| Domain puro, sin deps de plataforma | `packages/domain/src`, package.json |
| Application depende solo de domain | `packages/application/package.json` y `src/ports.ts` |
| shared aún vacío | `packages/shared/src/index.ts` exporta `{}` |
| Composición nativa por ports/repos/clock/IDs | `apps/mobile/src/composition/create-app-services.ts`, `app-services.ts` |
| Preview web sin repositorios | `apps/mobile/src/ui/runtime/app-runtime.tsx`, servicios null |

Se leyeron AGENTS, PRODUCT, MVP, BUSINESS_RULES, UX, DATA_MODEL, ARCHITECTURE,
MONETIZATION, ROADMAP, BACKLOG y README. No hay directorio ADR separado en la base local;
las decisiones previas están en la arquitectura canónica. GOOGLE_PLAY_READINESS y el backlog
registran limitaciones de preparación de stores, no disponibilidad cloud.

## Persistencia e invariantes

`apps/mobile/src/infrastructure/sqlite/schema.ts` define ocho tablas:
inventories, products, inventory_states, inventory_movements, sales, sale_items,
purchases, stock_adjustments. Hay cuatro migraciones versionadas `0000`–`0003`.
Schema Drizzle SQLite tiene FK, checks, índices por inventario/fecha y unique parcial
de barcode activo dentro del inventario. Stock/costo están en InventoryState,
no en Product. Purchase es de UN producto; no existe PurchaseItem.

`transaction-manager.ts` usa `withExclusiveTransactionAsync`, un executor Drizzle por
transacción y repos de la misma transacción. Registro de venta guarda Sale, todas las líneas,
movimientos y estados; compra guarda Purchase, movimiento, nuevo stock/costo. Ajuste registra
conteo físico, diferencia derivada, motivo y movimiento. UI no escribe tablas directamente.

Money y Percentage usan enteros JS seguros escalados por 1,000,000; no decimal.js.
El parser trabaja desde texto y la división redondea half-away-from-zero a unidades internas.
Se comprueba overflow. Costo desconocido usa null; cero es conocido. Stock negativo permitido;
compra con stock previo <=0 usa el costo nuevo sin ponderar déficit. Sales preserva snapshots.
Ver `money/money.ts`, `percentage/percentage.ts`, `inventory/apply-purchase.ts`,
`internal/integer-arithmetic.ts` y tests de Domain.

UUIDv7 se genera mediante clock inyectado y bytes de `expo-crypto` en
`infrastructure/identity/uuid-v7-generator.ts`; no autoincrementos globales.
`SystemClock.now()` encapsula Date.now y devuelve epoch ms seguro no negativo.
Domain distingue effectiveAt, createdAt, updatedAt; presentation calcula rangos de día local.

## Capacidades verificadas

Application contiene CreateInventory, GetCurrentInventory, CreateProduct, ListProducts,
FindProductByBarcode, GetProductDetails, UpdateProduct, ArchiveProduct, RegisterSale,
RegisterPurchase, AdjustStock, GetSaleDetails, GetPurchaseDetails, ListHistory,
GetSalesSummary, GetTopSellingProduct, VoidSale, VoidPurchase, CreateBackup, RestoreBackup.
Los archivos correspondientes están en `packages/application/src` y tienen pruebas en `test`.

Las rutas nativas `apps/mobile/src/app` incluyen tabs Inicio/Productos/Historial/Más,
alta/edición/detalle de producto, venta y compra con detalles, ajuste, barcode y backup/restore.
Home tiene métricas, más vendido, stock bajo y cinco recientes. History carga 50 operaciones.
Precio sugerido y margen editable post-compra existen; cambiar precio es una operación separada.
Archivar existe; consulta de archivados/desarchivado y Undo inmediato siguen diferidos.

VoidSale/VoidPurchase preservan historia y requieren último movimiento inequívoco +
estado coincidente. Empates createdAt bloquean por ambigüedad; todos los productos deben
ser elegibles en venta múltiple. Repetir una operación VOIDED es éxito sin otra reversión.
StockAdjustment no se anula. Domain prepara planes puros; Application valida elegibilidad.

## Red, identidad y respaldo

Búsqueda en `packages`, código móvil y manifiesto: sin fetch/axios/auth/cloud propios.
Hay apertura explícita de enlaces legales mediante Linking, no una API de negocio al startup.
No se concluye que todas las dependencias carezcan de tráfico: la política local actual divulga
telemetría técnica de ML Kit Android. No hay cuenta propia, sesiones ni sync metadata/outbox.

CreateBackup genera JSON `stockapp-backup`, formatVersion 1, ocho colecciones, Money como
enteros seguros, timestamps epoch ms, IDs/barcodes exactos, archivados y VOIDED/REVERSAL.
Restore valida el documento antes de escribir y reemplaza el dataset entero atómicamente,
sin merge/replay. Export usa archivos temporales y share sheet nativa; archivo sin cifrado.
Ver application `create-backup.ts`, `restore-backup.ts`, infrastructure backup y SQLite core/native.

## Calidad y distribución existentes

Tests `node:test` vía tsx en domain/application/mobile: reglas puras, application con ports y
integraciones reales SQLite mediante `node:sqlite`/Drizzle sqlite-proxy (por ejemplo void-sale
y backup-restore); también doubles en otras pruebas. No equivalen a E2E físico.
Suite reportada históricamente: 1402 tests; resultado fresco en [VALIDATION](VALIDATION.md).

Gate canónico `pnpm check` = format:check → lint → typecheck → test → build:api. `docs/` está excluido de
Prettier: gate de formato no comprueba estos Markdown. Hay `build:api`; no hay script raíz `build`.
CI GitHub Actions quality, en PR a main y pushes main; sin CD ni deploy EAS.
EAS alpha APK internal y production AAB store están configurados; no se ejecutaron aquí.
El perfil no prueba que haya artefacto production, firma verificada o publicación en stores.

## Referencias operacionales read-only

VZLegal local `railway.json`: Nixpacks, build/start filtrados pnpm, health `/`;
`nixpacks.toml`: bootstrap pnpm explícito. No se ha probado su despliegue en esta tarea.
Checkout de referencia ReptileApp en `Apps/github-readme-refresh/ReptileApp/Backend/railway.json`:
Railpack, npm build/start, `/health`. Es configuración observada, no garantía de runtime vigente.
StockApp no hereda MongoDB, Express ni el dominio de esos proyectos.

Se leyeron únicamente Privacy y Terms del checkout independiente `Apps/ian-k.dev`:
Privacy fecha 2026-10-02, Terms 2026-10-01, ambas describen Mobile local sin cuentas/cloud.
La herramienta web no pudo abrir las URLs públicas: publicación exacta NO verificada aquí.
No se modificó ninguno de estos repositorios.

## CLOUD-01: estado real añadido

Fastify 5.12.5, Node 22.16.0, TS strict/NodeNext ESM. Factory sin listen; entrypoint separado
HOST/PORT y SIGINT/SIGTERM. Solo GET /live; requestId UUID servidor, x-request-id y envelope
NOT_FOUND/VALIDATION_ERROR/INTERNAL_ERROR sanitizado. Sin payloads/credenciales en logs.
Contracts: JSON Schema y tipos derivados con json-schema-to-ts 3.1.1, Money string scaled safe,
revision string, epoch ms seguro. Sin reglas de negocio/deps de plataforma. Build tsc contracts→API.
No DB/auth/ownership/sync/Web ni servicios desplegados. Mobile/Domain/Application sin cambios.

## CLOUD-02: persistencia local/test

Drizzle PostgreSQL 0.45.2, drizzle-kit 0.31.10, pg/@types/pg 8.23.1 dentro de apps/api.
14 tablas de aplicación, dos migrations SQL: core inventory y delivery/revisions/lifecycle.
Pool lazy/factory explícita; migrator separado con advisory lock y cierre del pool; no autoconexión
ni automigración HTTP. Money/stock/tiempo domain BIGINT safe, revisiones BIGINT exactas, lectura
Drizzle bigint/pg string, server timestamps timestamptz/sesión UTC. FK auth diferida.
Constraints scoped, barcode/reversal uniques, transiciones y null/cero probados contra PostgreSQL 18.6
portable en carpeta temporal local. CI añade servicio PostgreSQL y test:db obligatorio sin fallback.
El schema existe; CLOUD-03 añade auth como se detalla abajo. Authorization, sync ejecutable,
Web, /health y Railway continúan pendientes.
SQLite/Domain/Application sin cambios funcionales. CLOUD-01 arriba describe su entrega histórica.

## CLOUD-03: identidad local/test

Better Auth/adapter Drizzle/plugin Expo 1.7.7, CLI oficial `auth` 1.7.7; auth-schema.ts generado,
migration aditiva 0002_auth_identity y cuatro tablas user/session/account/verification.
Email/password 8–128 caracteres; signup no verificado sin sesión/Business/Inventory, verify 24h,
reset 30min de un uso con revocación completa. Sesiones opacas DB, 7d absolutos, sin refresh/cache.
Cookie HTTPS Secure/HttpOnly/Lax/Path=/, host-only. Origin/CSRF propios activos; sin exp:// implícito.
Nodemailer 10.0.14, SMTP configurable TLS/STARTTLS/local, sender inyectado, envío fuera del response,
drain al cierre y logs sanitizados. Suite SMTPServer local 3.19.16 dev-only, sin correo externo.
HTTP /api/auth conserva requestId/no-store y contrato normal Better Auth; fallos internos genéricos.
buildApp() conserva foundation-only; start compone auth solo con AUTH_BASE_URL y env completa.
Pruebas PostgreSQL real incluyen upgrade CLOUD-02 y HTTP compilado con SMTP efímero en CI.
Mobile/Contracts/Domain/Application sin cambios. Sin ownership, cloudAccess enforcement, CSRF /v1,
CORS completo, rate limits finales, login UI, SecureStore, account deletion, sync ni infraestructura.

## CLOUD-04: ownership local/test

Base main4d9dd1a (PR78). FK0003 Business.owner→Better Auth User NO ACTION, tablas18/migrations4.
GET /v1/me, POST /v1/business inicio vacío, GET Inventory metadata propio enabled; plugin/helpers
scoped por sesión oficial, verified explícito, Business ACTIVE/flag, 404 ajeno. UUIDv7 server,
Clock epoch ms inyectable y transacción Business+Inventory/lock owner. CLI piloto enable/disable
transaccional e idempotente, no HTTP admin. Signup/verify no dataset ni acceso automático.
PostgreSQL18.6, A-B/rollback/concurrency/orphan failure/valid upgrade, dist HTTP+SMTP+CLI reales.
Contracts solo cuatro códigos adicionales; uuid14.0.1 única dependencia añadida. Mobile/Domain/
Application intactos. CLOUD-05 supersede el diferimiento de CORS/CSRF/rate final;
import/sync/Web/infra/deletion siguen pendientes.
Estado actual supersede diferimientos históricos anteriores. [CLOUD-04](CLOUD-04.md).

## CLOUD-05: seguridad local/CI

Una ruta nueva GET /v1/session/csrf; token HMAC opaco por sesión oficial, reutilizable solo en
esa sesión. POST /v1/business exige token y JSON, sin upload ni habilitación automática.
CORS APP_ORIGIN exacto, credentials y preflight sin sesión/counters; Origin hostil/null rechazado.
1 MiB global y 32 KiB bootstrap; no-store en auth y /v1 incluso errores.
0004 añade security_rate_limits: HMAC por scope/key, consume SQL atómico, durabilidad y ventanas
compartidas entre instancias. Auth customStorage.consume + email/IP, negocio por user.
trustProxy=false, IP de socket entregada a Better Auth en header interno sobrescrito por servidor.
Railway proxy/WAF/TLS/SMTP real siguen sin verificar ni configurar. Mobile/Web/Domain/Application
sin cambios; sin APIs financieras, sync ni contracts freeze. [Reporte y gates](CLOUD-05.md).
