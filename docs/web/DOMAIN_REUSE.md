# Reutilización del dominio

WEB-06 añade únicamente @stock-app/application workspace autorizado para canEditPurchaseMargin,
getInitialPurchaseMargin y recommendPurchasePrice. Adaptación DTO con Money/Percentage existentes;
sin políticas ni promedio duplicados en Web. Bundle tree-shakes root a pricing puro sin use cases/
repositories/infraestructura; Application source intacta. [Evidencia](WEB-06.md).

WEB-03 importa Money puro de @stock-app/domain para parsear hasta seis decimales y display exacto; codecs/contracts separados del compiler server. Ninguna fórmula financiera nueva ni dependencia Application/Mobile/DB en Web. Las reglas Product existentes guían validación/trim/null y stock/costo inicial. [Detalle](WEB-03.md).

API-08 usa mappers existentes y reglas Domain de bajo stock/margin/markup y validación pura
del ledger original con prepareSaleReversal/preparePurchaseReversal. No escribe reversals
ni modifica use cases. Detalles VOIDED omiten simulación; enrichment Product actual solo en
SaleDetailItem read DTO. Ganancias desconocidas, snapshots y sumas exactas conservan la
semántica Application. Sin imports UI/SQLite ni fórmula nueva. [Detalle](API-08.md).

API-07 reutiliza VoidPurchaseUseCase/preparePurchaseReversal intactos. PurchaseVoidRepository mínimo/scoped/mismo tx captura REVERSAL con costo entrante y State con promedio anterior. Cloud valida State antes de Application y conserva política API-06; no active-Product gate ni nueva regla financiera. [Evidencia](API-07.md).

API-06 reutiliza VoidSaleUseCase/prepareSaleReversal sin cambiar Domain/Application ni sus tests locales. SaleVoidRepository mínimo/scoped/mismo tx captura outputs completos y persiste reversalOfMovementId explícito con constraints existentes. Cloud compara State primero y mapea NOT_ELIGIBLE/ALREADY_VOIDED a422 después de esa comparación; misma key usa API-01 replay. No nueva elegibilidad, promedio, costo histórico ni active-Product gate. [Decisión y evidencia](API-06.md).

API-05 reutiliza AdjustStockUseCase/applyStockAdjustment, motivos/modos y promedio existentes, sin cambios financieros ni fórmula API alternativa. Ports completos/scoped ligados al tx API-01 capturan Adjustment/Movement/State; Movement guarda costo resuelto y State el costo final Domain. Receipt/ChangeSet verifican y reconstruyen evidencia histórica sin consultar estado actual. [Detalle](API-05.md).

API-04 reutiliza RegisterPurchaseUseCase y createPurchasePriceAnalysis sin modificar Application/Domain. Ports listByInventory completos/scoped y captura exacta en tx API-01; precondiciones antes de Application, SQL Purchase → Movement → State. Reconstrucción histórica con createPurchase y helper Application; sin fórmulas alternas ni precio automático. Mappers Product/State/Movement/Money existentes reutilizados. [Detalle](API-04.md).

API-03 usa RegisterSaleUseCase sin modificar Application/Domain: listByInventory completo y scoped, captura writes exactas; compara evidencia de costo y estimates antes de SQL. Persistencia respeta Sale → Items → Movements → States en CommandTransaction existente, sin nested transaction ni segunda fórmula. Reutiliza productFromRow/movementValues/movementDto/stateDto; StateDto admite revision con default0 intacto para Product. [Detalle](API-03.md).

API-02 reutiliza CreateProductUseCase, UpdateProductUseCase y ArchiveProductUseCase sin modificar Application/Domain. Ports mínimos PostgreSQL ligados a la transacción API-01; runInTransaction invoca el callback y difiere únicamente State hasta después de Movement, sin BEGIN adicional. Update/Archive conservan authoritativeUpdatedAt del reloj servidor. Cloud revisions/receipts/scope quedan en API. [Detalle](API-02.md).

La fuente de reglas es `docs/BUSINESS_RULES.md` y su implementación probada en
`packages/domain`; Application orquesta esas reglas. Ninguna app tendrá otra fórmula financiera.

| Área auditada | Clasificación | Uso objetivo |
| --- | --- | --- |
| Money, Percentage, parser/rango/rounding | share directly | Importar domain; codecs transport separados |
| Inventory/InventoryState, initial inventory, weighted average/applyPurchase | share directly | Mismos fixtures en API y Mobile; Web previews puros |
| Profit/margin/markup/suggestSalePrice | share directly | Domain, nunca fórmula SQL/React alternativa |
| Product, Sale, SaleItem, Purchase, StockAdjustment, Movement | share directly | Constructores/invariantes puros, objetos inmutables |
| prepareSaleReversal/preparePurchaseReversal | share directly | Plan puro conservando snapshots; Application valida elegibilidad |
| Application ports, RegisterSale/Purchase/AdjustStock | share directly con adaptadores explícitos | Repos por dialecto, scope y transacción; cambios de envelope probados |
| UpdateProduct/ArchiveProduct | share directly con envelope servidor | Hoy no incluyen optimistic version/idempotencia; wrapper añade control atómico |
| Elegibilidad void | share conceptually only para queries | SQL cloud scoped y orden aceptado; mismas restricciones, empates legacy seguros |
| Read models/list/history/summary/top selling | share conceptually only para SQL | Contratos y reglas comunes; queries SQLite/Postgres independientes |
| Backup/restore validation | share directly para formato local | Import cloud reutiliza validator puro, no invoca REPLACE local en servidor |
| ORM schemas/migrations | share conceptually only | Tablas/constraints equivalentes, no importar sqlite-core en API |
| Ownership/auth/receipts/locks/changes/import jobs | server-only | Sin deps auth/DB dentro de domain |
| Expo clock/crypto/SecureStore/camera/files/SQLite | mobile-only (client-only) | Conservar módulos nativos; generador server usa crypto Node |
| Router/TanStack Query/DOM/download | web-only (client-only) | Forms y query client; ninguna autoridad contable |

## Adaptación CLOUD-06 realizada

CreateProduct/RegisterSale/RegisterPurchase/AdjustStock reciben IDs, occurredAt y createdAt explícitos;
no generan identidad/tiempo internamente. VoidSale/VoidPurchase preservan IDs de compensaciones por
producto y tiempo comercial, conservando clock para updatedAt autoritativo. UpdateProduct/ArchiveProduct
mantienen reloj del ejecutor y max(createdAt, updatedAt previo, reloj). La composición Mobile prepara
IDs/tiempo sin cambiar UI ni requerir red. Domain no cambió; no existe `registerSaleOnServer` ni
matemática duplicada. [CONTRACTS_V1](CONTRACTS_V1.md) separa envelope transport de inputs Application.
operationId, versiones, expected revisions, receipts, sesión y headers pertenecen al boundary API futuro.

La prevalidación de sync compara resultado derivado con snapshots locales antes de aceptar;
los valores enviados son evidencia/precondiciones, nunca permiso para escribir stock arbitrario.
El servidor deriva costos con Domain y verifica equivalencia. Un desacuerdo crea conflicto.

Las funciones de presentación existentes mezclan formatos/copy con flujos nativos en algunos casos:
reutilizar significado y pruebas de precisión, no toda UI RN. Valor original y display/edit state
seguirán separados para evitar redondear campos no editados.

Cambios financieros requieren test-first: fixture rojo real, implementación mínima, verde.
Cambios de reglas no se autorizan por un endpoint; deben reportarse y aprobarse formalmente.
