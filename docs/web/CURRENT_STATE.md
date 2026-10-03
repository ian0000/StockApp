# Auditoría del estado actual

Inspección read-only sobre base `e2e76c6`, 2026-10-02. Verificación del código,
no inferencia desde nombres ni reproducción de los resultados históricos de QA.

## Estructura y ejecución

| Hallazgo | Evidencia local |
| --- | --- |
| pnpm monorepo `apps/*`, `packages/*` | `pnpm-workspace.yaml` |
| Node mínimo 22.16.0, pnpm 11.0.9 | raíz `package.json`; CI fija Node 22.16.0 |
| TypeScript strict y noEmit | `tsconfig.base.json`, tsconfig de paquetes |
| Solo app mobile; domain/application/shared | directorios y sus package.json |
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

Gate canónico `pnpm check` = format:check → lint → typecheck → test. `docs/` está excluido de
Prettier: gate de formato no comprueba estos Markdown. No hay script raíz `build`.
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
