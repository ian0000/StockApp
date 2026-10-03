# Paridad de capacidades

Auditoría: rutas `apps/mobile/src/app` y casos de uso `packages/application/src` en e2e76c6.
Prioridad de Web V1, no duplicación de pantallas. Todos los importes mantienen precisión interna.

| Capacidad | Mobile actual / evidencia | Web V1 | Decisión |
| --- | --- | --- | --- |
| Home/dashboard | index tab, GetSalesSummary/GetTopSellingProduct | MUST HAVE | Hoy, ventas, unidades, ganancia completa/null, stock bajo y recientes |
| Productos y búsqueda | products tab, ListProducts, product-search | MUST HAVE | Nombre/variante/barcode; búsqueda server scoped |
| Crear producto | product/new, CreateProduct | MUST HAVE | Campos actuales; stock inicial/costo obligatorio si positivo |
| Editar producto | product/edit, UpdateProduct | MUST HAVE | Versión esperada; preservar valor exacto si no editado |
| Archivar | detalle, ArchiveProduct | MUST HAVE | Sin borrar historia |
| Consultar archivados/desarchivar | diferido; sin caso de uso/ruta operativa | LATER | No inventar paridad existente |
| Detalle producto | product/[id], GetProductDetails | MUST HAVE | Stock, costo/precio, rentabilidad, actividad |
| Stock bajo | domain/low-stock, Home/lista | MUST HAVE | Misma regla; lista sin gráficos obligatorios |
| Registrar venta | sale.tsx, RegisterSale | MUST HAVE | Precio explícito por línea, alerta stock insuficiente |
| Venta multiproducto | carrito y RegisterSale items | MUST HAVE | Transacción completa; producto único por línea |
| Compra | purchase.tsx, RegisterPurchase | MUST HAVE | Exactamente un producto |
| Detalle compra | purchase/[id], GetPurchaseDetails | MUST HAVE | Snapshots antes/después |
| Detalle venta | sale/[id], GetSaleDetails | MUST HAVE | Costos históricos/null y estado |
| History unificado | history tab, ListHistory | MUST HAVE | Sales/Purchases/Adjustments; sin filas técnicas REVERSAL/INITIAL_STOCK |
| Anular venta | detalle, VoidSale | MUST HAVE | Completa; última operación inequívoca en todos sus productos |
| Anular compra | detalle, VoidPurchase | MUST HAVE | Restaurar snapshots solo cuando elegible |
| Undo temporal | diferido UX | LATER | Acción permanente de anulación cubre V1 |
| Ajustes | adjustment, AdjustStock | MUST HAVE | Conteo físico, motivo, costo aceptado en entrada |
| Anular ajuste | excluido V1 | NOT APPLICABLE | Corregir con nuevo conteo |
| Precio/costo | detalle/product-form | MUST HAVE | Costo promedio distinto de precio; null distinto de 0 |
| Ganancia/margen/markup | domain/pricing y presentación | MUST HAVE | Estimaciones con dominio compartido |
| Sugerencia/margen deseado | purchase confirmation, purchase-price-analysis | MUST HAVE | Sin default arbitrario; actualizar precio separado y explícito |
| Barcode escribir/buscar/lector USB | FindProductByBarcode, formularios | MUST HAVE | String exacto, enter del lector, sin catálogo externo |
| Cámara barcode browser | cámara nativa Expo actual | LATER | No depende de BarcodeDetector ni permisos al login |
| Escaneo repetido nativo | sale-barcode-scanner | NOT APPLICABLE | Mobile lo conserva; lector Web incrementa carrito |
| Backup JSON de seguridad | CreateBackup/native share | MUST HAVE | Descarga de snapshot cloud consistente, no share sheet |
| Restore local JSON | RestoreBackup/native picker, REPLACE | NOT APPLICABLE | Solo Mobile desconectado; import cloud inicial separado |
| Importar JSON a cloud vacío | nuevo, no existente | MUST HAVE | Flujo de migración consentida, no restore destructivo global |
| Export CSV/Excel | no implementado, Pro futuro | LATER | No confundir con backup JSON |
| Settings/moneda/acerca/legal | more tab/FirstRunSetup | MUST HAVE | Moneda de inventario visible; cuenta/sync/seguridad cloud añadidos por ticket |
| Apariencia personalizable | texto conceptual, no capacidad completa | SHOULD HAVE | Solo si aporta, sin sistema de temas en foundation |
| Filtros avanzados/gráficas | diferidos | LATER | No dependencia del loop V1 |

Auth, ownership, export de datos personales y borrado son capacidades nuevas obligatorias del
servicio, detalladas en AUTH/API. El backup local no se retira por introducir export cloud.
MUST HAVE es el gate funcional; SHOULD HAVE y LATER no bloquean la primera versión.
