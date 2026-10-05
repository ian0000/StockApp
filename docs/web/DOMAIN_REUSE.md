# Reutilización del dominio

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
