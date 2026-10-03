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

## Ajustes requeridos por los tickets, no realizados aquí

Hoy RegisterSale/Purchase generan IDs/timestamp internamente; inputs no incluyen operationId,
occurredAt, expectedRevision ni client entity IDs. API/sync necesita preservar IDs creados offline
y distinguir tiempo comercial de recibido. CLOUD-06 definirá input de comando en contracts y
adaptará Application mediante IDs/clock inyectados y factories compartidas, con regresión de todos
los casos existentes. No crear `registerSaleOnServer` con matemática duplicada.

La prevalidación de sync compara resultado derivado con snapshots locales antes de aceptar;
los valores enviados son evidencia/precondiciones, nunca permiso para escribir stock arbitrario.
El servidor deriva costos con Domain y verifica equivalencia. Un desacuerdo crea conflicto.

Las funciones de presentación existentes mezclan formatos/copy con flujos nativos en algunos casos:
reutilizar significado y pruebas de precisión, no toda UI RN. Valor original y display/edit state
seguirán separados para evitar redondear campos no editados.

Cambios financieros requieren test-first: fixture rojo real, implementación mínima, verde.
Cambios de reglas no se autorizan por un endpoint; deben reportarse y aprobarse formalmente.
