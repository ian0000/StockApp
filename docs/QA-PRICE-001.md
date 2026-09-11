# QA-PRICE-001 — Revisión de semántica de precios

**Estado inicial:** INVESTIGATING. **Clasificación:** decisión de producto y claridad UX,
no bug confirmado por rechazar un precio habitual vacío. **Base:** `2157e92`.
**Rama:** `docs/price-semantics-review`. Revisión documental; no aprueba cambios de comportamiento.

### Seguimiento — PURCHASE-PRICE-002

**Contradicción de sugerencia: RESOLVED.** La decisión B de este ticket aprueba margen editable
transitorio y política conservadora: sugerir solo aumentos; un precio calculado menor o igual
conserva el habitual sin write. Las reglas vigentes están en BUSINESS_RULES §21/§24 y UX §20.
Esta decisión B no es la alternativa B de precio nullable analizada en §5: Product sigue exigiendo Money.

El editor inicia con el margen anterior exacto y solo admite `0 <= margen < 100%`. No aparece sin
cambio de costo o referencia válida, con costo nuevo cero o cálculo inicial fuera de rango. Se
reutiliza el parser decimal exacto de Money internamente para `Percentage.fromDecimal`, sin tratar
porcentajes como dinero. Domain conserva la fórmula matemática general; Application diferencia
`PRICE_INCREASE_SUGGESTED`, `CURRENT_PRICE_ALREADY_SUFFICIENT` y `UNAVAILABLE`.
Schema y Backup V1 no cambian. La validación física de pricing y reinicio queda pendiente tras merge.

Las secciones de investigación y los pendientes escritos debajo son evidencia histórica de la
base indicada, no el estado posterior a PURCHASE-PRICE-002.

### Seguimiento — UX-PRICE-001

La tarea `UX-PRICE-001` implementa la nomenclatura aprobada en alta/edición/detalle de Product,
venta, compra, sus detalles y ajustes, incluidos mensajes de validación y accesibilidad. La tabla
de esta revisión conserva los textos observados en `2157e92` como evidencia histórica, no como
inventario de la UI posterior. La terminología vigente está en `UX.md`.

No cambia el contrato obligatorio `regularSalePrice: Money`, costos desconocidos, fórmulas,
schema ni Backup/Restore. La discrepancia sobre recomendar bajadas y el margen editable siguen
pendientes de decisión; no fueron implementados ni resueltos por esta tarea. La validación física
corta del nuevo wording se hará después del merge; no equivale a ejecutar PHYS-019.

## 1. Evidencia física y clasificación QA

El responsable reportó validación física satisfactoria de Startup, Products, Low Stock, Sales,
Purchases, Adjustments, History, Void y Barcode. Es evidencia reportada por el usuario; esta revisión
no volvió a ejecutar esos bloques ni declara Alpha lista. Backup/Restore y recovery no quedan
validados por esa enumeración.

El hallazgo fue que Nuevo producto no admite vacío en **Precio habitual**, aunque acepta `0`.
Eso no prueba un fallo de costo desconocido: son campos y contratos diferentes.

**PHYS-019 no es FAIL por este hallazgo.** Su objetivo es una venta con costo desconocido. Para
aislarlo: crear Product con precio habitual conocido positivo, stock inicial `0` y sin costo; vender
aceptando la advertencia de stock insuficiente; comprobar costo/ganancia no disponibles y snapshot
`UNKNOWN`/`null`. No escribir `0` como sustituto de costo desconocido. El estado individual de
PHYS-019 requiere su propia evidencia; no se marca PASS por inferencia.

No existen entradas `PHYS-019`, `QA-PRICE-001` o un registro físico que mezcle ambos conceptos en
los Markdown versionados de la base inspeccionada. Esta nota registra la clasificación corregida;
no altera retrospectivamente resultados no disponibles ni modifica las reglas canónicas.

## 2. Tres conceptos distintos

| Concepto | Representación actual | Significado |
| --- | --- | --- |
| Costo de compra por unidad | `Purchase.unitCost: Money` | Importe conocido de una entrada comercial concreta; puede ser cero real. |
| Costo actual de inventario | `InventoryState.unitCost: Money \| null` | Costo promedio ponderado o último costo conocido; incluye los efectos aprobados de entradas y ajustes. No es necesariamente la última factura. |
| Precio de venta habitual | `Product.regularSalePrice: Money` | Precio actual configurado para precargar futuras ventas. No es costo ni importe histórico de una venta. |
| Precio de venta por unidad | `SaleItem.unitSalePrice: Money` | Importe efectivamente aceptado para esa línea de venta, estrictamente positivo; puede diferir del habitual. |

## 3. Qué dice la Baseline

| Fuente | Evidencia y alcance |
| --- | --- |
| [PRODUCT §8, §9.2, §22](PRODUCT.md) | Reutilizar el precio habitual y modificarlo por operación; vender rápido. No declara precio desconocido ni `null`. |
| [PRODUCT §10, UC-07](PRODUCT.md) | Aceptar/ignorar la sugerencia o establecer otro precio; no define un editor de porcentaje. |
| [MVP §4](MVP.md) | Cada producto tendrá precio habitual de venta. Variante, código y stock mínimo sí están calificados como opcionales. |
| [MVP §5, §14](MVP.md) | Costo, margen y ganancia no disponibles cuando nunca se conoció un costo. No define precio habitual opcional. |
| [MVP §9–10](MVP.md) | Conservar margen anterior, no cambiar precio automáticamente, precargar precio habitual en la venta. |
| [BUSINESS_RULES §12–13](BUSINESS_RULES.md) | «Cada producto tendrá un» precio habitual; modificar el cobrado no cambia automáticamente el habitual. |
| [BUSINESS_RULES §18–22](BUSINESS_RULES.md) | Margen distinto de markup; sugerencia con margen inmediatamente anterior a la compra y consentimiento explícito. |
| [BUSINESS_RULES §24](BUSINESS_RULES.md) | Si baja el costo, informar nueva rentabilidad; NO recomendar automáticamente bajar el precio. |
| [BUSINESS_RULES §25, §28, §50, §52](BUSINESS_RULES.md) | Costo desconocido no equivale a cero; no inventar información financiera. §52 es un principio general, no una autorización para ampliar nullability. |
| [BUSINESS_RULES §49](BUSINESS_RULES.md) | Una venta normal requiere precio mayor que cero. No establece el mismo límite para el precio habitual de Product. |
| [UX §13, §23, §38](UX.md) | Precio habitual precargado y editable por venta; alta con Nombre y Precio. El wireframe §23 solo marca Nombre con asterisco: señal visual incompleta, no regla explícita de precio opcional. |
| [UX §19–20](UX.md) | Sugerencia no intrusiva después de registrar la compra; primero persistir, después decidir precio. |
| [DATA_MODEL §10, §14, §19–20, §31–33](DATA_MODEL.md) | Habitual actual separado de `SaleItem.unitSalePrice`; KNOWN/UNKNOWN corresponde a costo; sin PriceChange ni tabla PriceSuggestion en V1. |
| [ARCHITECTURE §22, §25–27](ARCHITECTURE.md) | Backup lógico V1/REPLACE, Money entero con seis decimales internos y presentación normalmente a dos. |
| [ROADMAP §20](ROADMAP.md) | Core y sugerencia implementados; validación física y recuperación siguen siendo gates, no excusa para ampliar funcionalidad. |

La búsqueda de «precio desconocido», «precio opcional» y «precio regular» no encontró una regla
canónica que habilite ausencia del precio habitual. La decisión actual más explícita es exigirlo.
Los documentos no formalizan con igual detalle el cero habitual: código y tests lo tratan como cero
real. No se debe reinterpretar como «pendiente de definir» ni deducir que habilita ventas gratuitas.

### Contradicción encontrada, limitada a la sugerencia

[purchase-price-analysis.ts](../packages/application/src/purchase-price-analysis.ts) genera candidato
cuando cambia el costo en cualquiera de las dos direcciones. El test
`known cost decrease can suggest a lower price preserving previous margin` en
[purchase-price-analysis.test.ts](../packages/application/test/purchase-price-analysis.test.ts)
exige costo `12 → 10`, precio `15` y sugerencia `12.50`. La UI ofrece aceptarla.

Esto contradice la instrucción específica de BUSINESS_RULES §24 de no recomendar automáticamente
una bajada. No es cambio automático del precio: aún requiere aceptación, pero sí es una
recomendación automática. No se cambia test, código ni §24 aquí. Debe aclararse esta decisión antes
de ampliar ese flujo. No encontré contradicción explícita que autorice `regularSalePrice = null`.

## 4. Contrato actual por capa

**Can regularSalePrice be null today? NO.**

| Capa | Contrato y evidencia | Consecuencia de permitir `null` |
| --- | --- | --- |
| Domain | [product.ts](../packages/domain/src/product/product.ts): Product, CreateProductInput y UpdateProductInput requieren `Money`; `requireNonNegativeSalePrice` rechaza negativos con RangeError. | Cambiar tipos/factories y consumidores. Hoy `null`/omisión fuera del contrato tipado fallan al llamar `.compare`; no existe normalizador de precio desconocido. |
| Application | [create-product.ts](../packages/application/src/create-product.ts), [manage-product.ts](../packages/application/src/manage-product.ts): precio obligatorio, delegación a Domain, sin default. [ports.ts](../packages/application/src/ports.ts) guarda/devuelve Product; `findById` nullable significa producto ausente, no precio ausente. | Revisar create/update, resultados, lecturas y todos los clientes. No basta cambiar el input del formulario. |
| Product UI | [product-form-values.ts](../apps/mobile/src/ui/products/product-form-values.ts): valor inicial `''`, placeholder `1.00` no es default. Vacío se rechaza con «Usa un precio habitual válido.». Alta/edición requieren precio no negativo. | Diseñar vacío → desconocido explícito, validación y presentación. No reutilizar el `null` interno de parsing inválido como dato aceptado. |
| Sale | [sale-cart.ts](../apps/mobile/src/ui/sales/sale-cart.ts): copia Money a precio/texto de línea; cero produce «Usa un precio mayor que cero.» y bloquea confirmar hasta corregirlo. | Necesitar estado de precio pendiente sin Money ficticio, subtotal/total incompletos y captura obligatoria de precio positivo antes de confirmar; incluye scanner. SaleItem histórico seguiría obligatorio. |
| Product Detail | [get-product-details.ts](../packages/application/src/get-product-details.ts): precio Money, costo nullable y rentabilidad derivada. [presentación](../apps/mobile/src/ui/products/product-details-presentation.ts) formatea precio sin guardia nullable. | Mostrar «Precio de venta habitual: No definido»; ganancia/margen/markup actuales no disponibles si falta precio, aunque exista costo. No tocar rentabilidad histórica de ventas con precio real. |
| Sugerencia post-Purchase | [purchase-price-analysis.ts](../packages/application/src/purchase-price-analysis.ts) requiere precio habitual conocido para márgenes anterior/actual. | Sin precio: ambos márgenes y sugerencia automática serían no disponibles; no usar cero. Un margen explícito futuro podría calcular candidato sin precio previo, con decisión UX aprobada. |
| SQLite | [schema.ts](../apps/mobile/src/infrastructure/sqlite/schema.ts), columna real `regular_sale_price_units`: `INTEGER NOT NULL`, `CHECK >= 0`, sin DEFAULT. [mappers.ts](../apps/mobile/src/infrastructure/sqlite/repositories/mappers.ts) usa `.scaledUnits` / `Money.fromScaledUnits`. | Migración versionada que preserve datos, constraints, índices y FKs; mappers nullable. Mantener seis decimales y no inferir cuáles ceros históricos eran desconocidos. |
| Backup V1 | [create-backup.ts](../packages/application/src/create-backup.ts): `BackupProductV1.regularSalePriceUnits: number`, requerido, JSON entero. Snapshot SQLite y serializer conservan valor. | Cambiar contrato sería incompatibilidad para lectores V1 actuales; no basta que JSON permita null. El serializer valida relaciones/enteros, no vuelve a validar cada Money como Restore. |
| Restore V1 | [restore-backup.ts](../packages/application/src/restore-backup.ts): `parseProduct` exige entero monetario no negativo y reconstruye Product con Money. `null`, omisión y negativo son documento inválido. | Parser, validación y compatibilidad explícita; jamás convertir precio ausente a cero silenciosamente. |
| Tests | Domain acepta cero real y rechaza negativo; edición conserva cero/seis decimales; carrito rechaza venta cero; detalle con precio cero devuelve margen no disponible; Restore conserva cero exacto. | Añadir matriz nueva en todas las capas si se aprueba B, sin borrar garantías anteriores. |

### Validación, default y cero

- UI normaliza coma/punto y `.5`/`,5`, y utiliza `Money.fromDecimal`; no `parseFloat`.
- Money limita a seis decimales y enteros escalados seguros. Domain no convierte ausencia en cero.
- Application y SQLite no asignan precio por defecto. El formulario empieza vacío y exige completarlo.
- `0` significa **precio conocido cero**, probado en Domain y edición; no bandera de desconocido.
- Con precio cero y costo positivo, detalle calcula pérdida por unidad `-costo`, margen no
  disponible y markup `-100%`. Con costo cero, markup no está definido. Con costo desconocido,
  las tres métricas son no disponibles. Esta es otra razón para no usar cero como placeholder.
- Compra requiere su propio costo conocido, incluido cero real. Stock inicial cero tiene costo
  `null`; stock inicial positivo exige costo. Ninguna regla sustituye el precio habitual.

## 5. Decisión recomendada, no implementada

**A — Mantener precio de venta obligatorio en V1.** Es la lectura consistente de MVP §4,
BUSINESS_RULES §12 y la venta precargada. Mantiene contratos, archivos de respaldo y rapidez operativa.
No exige cambiar ahora el rango no negativo de Product ni confundirlo con el precio positivo de Sale.

La recomendación no significa decir al usuario «pon 0 si no sabes»: si necesita registrar productos
antes de decidir a cuánto venderlos, existe una necesidad adicional legítima que requiere aprobación.

| Alternativa | Evaluación |
| --- | --- |
| A: exigir precio habitual conocido | Recomendada para conservar V1 actual; aclarar el campo y su obligatoriedad. Persiste la fricción de no poder crear Product sin decidir precio. |
| B: admitir desconocido y pedir precio al vender | Coherente como evolución posible: vacío/null sería ausencia real y se exigiría precio por línea antes de venta. Tiene impacto transversal, migration y compatibilidad Backup/Restore; no está aprobada hoy. |
| C: autocompletar cero, costo o precio sugerido sin decisión | No recomendada: inventa significado financiero o confunde venta con costo. Un estado borrador sería otro modelo fuera de este alcance. |

### Compatibilidad si se aprobara B

Los respaldos ya generados con precios numéricos deben seguir restaurándose exactamente en una
versión futura. No migrar `0 → null`: no hay evidencia para distinguir ceros legítimos de atajos
humanos. Archivos futuros con precio null serían rechazados por el parser V1 actual y su SQLite.
Haría falta aprobar versionado de formato/compatibilidad y tests de archivos antiguos/nuevos antes
de emitirlos; no cambiar furtivamente V1 ni asumir compatibilidad bidireccional.

## 6. Inventario de etiquetas y propuesta de nomenclatura

Inventario por inspección de código, no auditoría visual del iPhone. Agrupa repeticiones con el mismo
significado, indicando los lugares. No se modificó ningún texto. Mantener moneda y marcadores
obligatorios; actualizar también accessibilityLabel cuando se cambie una etiqueta.

«Costo de compra actual» es comprensible, pero puede confundirse con la última compra. Se recomienda
**Costo promedio actual**, con ayuda «Promedio o último costo conocido del inventario». Si se elige
«Costo de compra actual», necesita esa aclaración; en un ajuste no debe inventar una compra comercial.

| Screen | Current | Meaning | Recommended |
| --- | --- | --- | --- |
| Nuevo producto y Editar producto | Precio habitual (moneda) * | Product.regularSalePrice | Precio de venta habitual (moneda) * |
| Alta/edición, validación | Usa un precio habitual válido. | Campo requerido, formato/rango inválido | Ingresa un precio de venta habitual válido. |
| Nuevo producto | Costo unitario inicial (moneda) * | Costo aproximado de unidades iniciales | Costo inicial por unidad (moneda) * |
| Nuevo producto, ayuda | Se utiliza para estimar la ganancia de estas unidades. | Uso del costo inicial | Se utiliza para estimar la ganancia de estas unidades. |
| Nuevo producto, stock 0 | Con stock inicial 0 no se registra un costo desconocido como cero. | InitialUnitCost = null | Sin stock inicial puedes dejar el costo sin definir. |
| Alta, validación | El costo es obligatorio cuando hay stock inicial. / Usa un costo inicial válido. | Costo requerido si stock > 0 | Ingresa el costo inicial por unidad. / Usa un costo inicial por unidad válido. |
| Detalle de producto | Precio y costo | Sección de valores actuales | Precio de venta y costo actual |
| Detalle de producto | Precio habitual | Product.regularSalePrice | Precio de venta habitual |
| Detalle de producto | Costo actual / Costo desconocido | InventoryState.unitCost | Costo promedio actual / No disponible |
| Detalle de producto | Ganancia aprox. / unidad | Habitual menos costo actual | Ganancia estimada por unidad |
| Detalle de producto | Margen aprox. | Ganancia dividida por precio | Margen estimado; ayuda «sobre el precio de venta» |
| Detalle de producto | Markup aprox. | Ganancia dividida por costo | Recargo sobre costo (markup); secundario, no confundir con margen |
| Productos, fila | Importe sin etiqueta | Precio habitual | Mantener compacto; nombre accesible «Precio de venta habitual» |
| Nueva venta, selector | Importe sin etiqueta junto a stock | Precio habitual que se precarga | Identificar como precio de venta habitual en texto accesible |
| Nueva venta, línea | Precio unitario / Precio unitario de [nombre] | Precio cobrado, editable solo para la venta | Precio de venta por unidad / Precio de venta por unidad de [nombre] |
| Nueva venta, validación | Usa un precio válido. / Usa un precio mayor que cero. | Precio real de venta requerido | Usa un precio de venta válido. / El precio de venta debe ser mayor que cero. |
| Nueva venta, resumen | Subtotal / TOTAL | Cantidad × precio; suma de líneas | Subtotal / Total de venta |
| Venta registrada | Ganancia estimada | Sale.estimatedProfit histórico | Ganancia estimada |
| Venta registrada, ayuda | Costo no disponible para todos los productos. | Alguna línea carece de costo | Ganancia no disponible: falta el costo de al menos un producto. |
| Detalle de venta, línea | Cantidad × importe | Cantidad × SaleItem.unitSalePrice | Mantener compacto; indicar precio de venta por unidad |
| Detalle de venta, línea | Costo unitario histórico | Snapshot por unidad | Costo por unidad al vender |
| Detalle de venta, línea | Ganancia estimada | Ganancia de esa línea, no por unidad | Ganancia estimada de esta línea |
| Detalle de venta, total | Costo histórico estimado / Ganancia estimada | Suma histórica de costos / ganancia total | Costo total estimado / Ganancia estimada total |
| Inicio | Ganancia estimada | Agregado de ventas confirmadas del día | Ganancia estimada de hoy |
| Inicio, ayuda | Ganancia no disponible porque alguna venta no tiene costo conocido. | Agregado incompleto | Mantener: no mostrar suma parcial como completa |
| Nueva compra, introducción | Selecciona un producto e indica cuántas unidades recibiste y su costo unitario. | Costo de la nueva entrada | …y su costo de compra por unidad. |
| Nueva compra, producto seleccionado | Costo actual: importe o — | InventoryState.unitCost previo | Costo promedio actual: importe o No disponible |
| Nueva compra, campo y preview | Costo unitario / Costo unitario de compra (accesibilidad) | Purchase.unitCost aceptado | Costo de compra por unidad |
| Nueva compra, validación | Usa un costo unitario válido. | Costo de entrada inválido | Usa un costo de compra por unidad válido. |
| Nueva compra, validación de total | La cantidad y el costo producen un total no admitido. | Overflow del total | La cantidad y el costo de compra producen un total no admitido. |
| Compra, preview/confirmación/detalle | Total de compra | Purchase.totalAmount | Total de compra |
| Compra registrada | Costo anterior / Costo actual | Snapshots de costo del inventario | Costo promedio anterior / Costo promedio actual |
| Compra registrada, sin cambio | Costo promedio | Purchase.averageCostAfter | Costo promedio actual |
| Compra registrada | El costo cambió | Cambio del promedio/último conocido | Cambió el costo promedio |
| Compra registrada | Margen anterior con [importe] | Margen previo usando precio habitual | Margen anterior con precio de venta [importe] |
| Compra registrada | Margen actual con el mismo precio | Margen tras compra sin cambiar Product | Margen actual con el mismo precio de venta |
| Compra registrada | Precio para conservar el margen anterior | Candidato, no precio ya aplicado | Precio de venta sugerido para conservar el margen |
| Compra registrada, acciones | Usar [importe] / Mantener [importe] | Actualizar Product o conservarlo | Usar precio [importe] / Mantener precio [importe] |
| Compra registrada, guardado | Actualizando precio… / Reintentar cambio de precio | Actualización separada del Product | Actualizando precio de venta… / Reintentar cambio de precio de venta |
| Compra registrada, resultado | Precio habitual actualizado. / Conservaste el precio habitual actual. | Decisión aplicada/conservada | Precio de venta habitual actualizado. / Conservaste el precio de venta habitual. |
| Compra registrada, error | La compra se registró, pero no pudimos actualizar el precio. | Compra persistida, actualización posterior fallida | …pero no pudimos actualizar el precio de venta habitual. |
| Detalle de compra | Costo unitario | Costo histórico de esa compra | Costo de compra por unidad |
| Detalle de compra | Costo promedio anterior / Costo promedio posterior | Snapshots de inventario, no precio de venta | Mantener; no llamar «actual» al snapshot de una compra antigua |
| Ajustar stock, selección | Importe sin etiqueta / Costo — | Costo actual del producto | Costo promedio: importe / No disponible |
| Ajustar stock, datos y resultado | Costo actual | Costo de inventario previo/resultante | Costo promedio actual |
| Ajustar stock, entrada | Costo de las unidades agregadas | Costo aceptado para unidades encontradas | Costo de las unidades agregadas |
| Ajustar stock, opciones | Usar costo actual — [importe] / Usar otro costo | Aceptar vigente o introducir otro | Usar costo promedio actual — [importe] / Indicar otro costo por unidad |
| Ajustar stock, input | Costo unitario / Costo unitario de las unidades agregadas | Costo del ajuste positivo, no compra | Costo por unidad agregada |
| Ajustar stock, ayuda/errores | Este producto aún no tiene un costo conocido. [Ingresa el costo de estas unidades.] / Usa un costo unitario válido. | Necesidad de costo explícito para entrada | …Ingresa un costo por unidad agregada. / Usa un costo por unidad válido. |
| Historial, COMPRA | +cantidad · importe c/u | Purchase.unitCost histórico | Mantener compacto con significado/accesibilidad «costo de compra por unidad» |
| Inicio, RECIENTES COMPRA | +unidades · importe | Total de compra, no costo unitario | Identificar importe como total de compra |
| Historial/RECIENTES VENTA | Importe principal | Total histórico de venta | Identificar importe como total de venta |
| Anulación de compra, confirmación/resultado | El stock y el costo fueron restaurados… / el stock y el costo volverán… | Restauración del costo anterior, no del precio habitual | Aclarar «costo promedio»; el precio de venta habitual no se restaura |

Fuentes UI: `apps/mobile/src/app/product/new.tsx`, `product/edit/[id].tsx`, `product/[id].tsx`,
`(tabs)/products.tsx`, `(tabs)/index.tsx`, `purchase.tsx`, `purchase/[id].tsx`, `sale/[id].tsx`,
`adjustment.tsx`; `src/ui/sales/{SaleRows,SaleConfirmation}.tsx`,
`src/ui/purchases/PurchaseConfirmation.tsx` y helpers de presentación/formularios.

**Precio unitario:** aparece en la edición de Sale; en Purchase actual el texto real es **Costo
unitario**, no Precio unitario. Ambos deben llevar el contexto venta/compra. No registrar un texto
hipotético como si estuviera en la UI. Los importes de totales nunca deben etiquetarse «por unidad».

## 7. Margen editable post-compra: análisis, no implementación

Actual: RegisterPurchase persiste compra/estado/movimiento atómicamente; devuelve `priceAnalysis`
calculado con costo anterior, nuevo costo promedio y precio habitual. No hay targetMargin en
Product ni tabla de sugerencias. La confirmación permite aceptar o mantener, sin editor de porcentaje.
Aceptar usa `UpdateProductUseCase` después de la compra; si falla, el retry no repite la compra.

```text
profit = salePrice - unitCost
marginPercent = profit / salePrice × 100
markupPercent = profit / unitCost × 100
suggestedPrice = newAverageCost / (1 - targetMarginPercent / 100)
```

Costo 10, precio 15: margen ≈33.33%, markup 50%. Un margen deseado de 30% no equivale a recargar 30%
al costo. **Margen deseado (% del precio de venta)** es coherente con BUSINESS_RULES §18–21; «Quiero
ganar 30%» es ambiguo. No sustituir margen por markup.

La función existente [suggestSalePriceForMargin](../packages/domain/src/pricing/suggest-sale-price.ts)
usa Money y Percentage escalados, seis decimales internos y redondeo half-away-from-zero. Devuelve
null con costo cero o margen ≥100%; permite margen negativo cuando la aritmética es segura y falla
explícitamente ante overflow. [Percentage](../packages/domain/src/percentage/percentage.ts) solo
expone factory de unidades escaladas, no parser decimal textual: una UI futura requiere un parser
exacto probado; no `parseFloat`, ni reutilizar Money como si porcentaje fuera dinero.

Hoy, costo anterior desconocido implica margen anterior y sugerencia no disponibles. Precio habitual
cero implica ambos márgenes no disponibles. Costo anterior cero con precio positivo implica margen
100%, que no produce sugerencia utilizable; costo nuevo cero tampoco. No confundir esos casos con
ausencia de precio. Una sugerencia idéntica al habitual se omite. Se presenta a dos decimales pero al
aceptar se pasa el Money interno, no el texto formateado.

**Viabilidad:** sí, técnicamente puede seguir siendo transitorio: iniciar con el margen anterior si
está disponible, editar un Percentage local, recalcular con el costo resultante y aceptar solo un
precio explícito válido. No guardar targetMargin, ni crear tabla, ni reescribir historia. Es coherente
con DATA_MODEL §33 y ARCHITECTURE §20, pero el editor y sus estados todavía requieren aprobación UX.

Capas potencialmente afectadas: input/estado/presentación post-compra, helper puro de parsing y
orquestación de la aceptación; reutilizar cálculo Domain y actualización Application. Añadir tests
de esos cambios cuando se autoricen. No requiere nueva fórmula financiera ni schema por sí mismo.

Decisiones pendientes antes de implementar:

1. Resolver §24 frente a la sugerencia automática de bajada existente.
2. Decidir si el editor aparece también cuando no hay margen previo, costo sin cambio o sugerencia
   automática disponible; sin referencia, no inventar porcentaje inicial (campo sin definir).
3. Presentación de margen negativo, ≥100%, costo cero y overflow, sin clamp silencioso; invalidar
   la sugerencia hasta un resultado válido. No declarar un rango UX nuevo como regla ya aprobada.
4. Comunicar la diferencia entre precio mostrado y precisión interna al aceptar; no introducir
   redondeo comercial ni cambiar el importe persistido sin una decisión específica.

## 8. Validación y alcance

No se modificó Domain, Application, Infrastructure, UI, tests productivos, dependencias, schema ni
migraciones. Las pruebas existentes se conservan. Esta revisión no añade tests de reglas nuevas.

Prueba adicional de inspección: aplicar las cuatro migraciones existentes en `node:sqlite`
`:memory:` y consultar `PRAGMA table_info(products)`. Resultado: tipo INTEGER, `notnull = 1`,
`dflt_value = null` (sin DEFAULT, no significa columna nullable). INSERT precio null rechaza por
NOT NULL; negativo rechaza CHECK; cero y 123456 unidades escaladas se aceptan. Ocho tablas de negocio.
Ninguna operación tocó la DB del dispositivo.

Quality gates requeridos: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
`pnpm check`, `git diff --check`, `pnpm --filter @stock-app/mobile db:generate`.
Resultado ejecutado: todos PASS. Domain **414/414**, Application **395/395**,
Mobile/Infrastructure **481/481**, total **1290/1290** (shared no contiene tests).
Drizzle: **8 tables — No schema changes, nothing to migrate**. No se ejecutó una nueva sesión
física ni se usaron exports como sustituto de prueba en dispositivo.

## 9. Próximas tareas propuestas, no ejecutadas

1. **UX-PRICE-001 — Aclarar nomenclatura de costos/precios.** Mantener semántica actual; etiquetas,
   ayuda, obligatoriedad y accesibilidad consistentes. No recomendar cero para un precio desconocido.
2. **PURCHASE-PRICE-002 — Margen editable en sugerencia post-compra**, solo tras aprobación y
   resolución de la discrepancia §24. Transitorio, cálculo existente, sin configuración persistente.

No se propone implementar PRODUCT-PRICE-001 ahora porque la recomendación es A. Si el responsable
elige B, tratar **PRODUCT-PRICE-001 — Soportar precio de venta habitual desconocido** como decisión
y tarea separada con migración/compatibilidad de respaldo; nunca mezclarla con el ajuste de etiquetas.
