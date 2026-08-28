# DATA_MODEL.md

**Estado:** Baseline v1.0 **Producto:** Nombre por definir **Documentos relacionados:** `PRODUCT.md`,
`MVP.md`, `BUSINESS_RULES.md`, `UX.md`

---

# 1. Objetivo

Definir un modelo de datos que permita implementar correctamente:

- productos;
- stock;
- compras;
- ventas multiproducto;
- ajustes;
- costo promedio;
- historial;
- ganancia estimada;
- códigos de barras;
- anulaciones;
- futuras estadísticas;
- futura sincronización cloud.

El modelo debe funcionar primero de manera completamente local, pero evitar decisiones que
dificulten posteriormente:

**móvil local ↔ cloud ↔ otros dispositivos ↔ web**

---

# 2. Principios

## DM-001 — Identificadores globalmente únicos

Las entidades principales no utilizarán IDs dependientes de un servidor central.

Cada registro tendrá un identificador que pueda generarse localmente.

Ejemplos técnicos futuros:

- UUID;
- UUIDv7;
- ULID.

La elección exacta se realizará en arquitectura.

Esto permitirá crear datos completamente offline sin esperar al servidor.

---

## DM-002 — Los movimientos conservan la historia

Una modificación de stock debe tener un movimiento asociado.

No dependeremos únicamente del valor:

`product.stock = 24`

para saber qué ocurrió.

---

## DM-003 — Se permiten valores derivados/cacheados

Aunque el historial sea fundamental, no recalcularemos necesariamente miles de movimientos cada vez
que se abre un producto.

Podrán existir valores actuales almacenados, por ejemplo:

- stock actual;
- costo promedio actual;
- última fecha de venta.

Estos son datos derivados que deben poder comprobarse contra los movimientos.

---

## DM-004 — No modificar historia silenciosamente

Los movimientos confirmados no deberían editarse arbitrariamente.

Las correcciones importantes se realizarán mediante:

- reversión;
- anulación;
- movimiento compensatorio.

---

## DM-005 — Snapshots históricos

Las ventas deben conservar la información financiera utilizada cuando ocurrieron.

Una venta de ayer no debe cambiar porque hoy cambió el costo del producto.

---

# 3. Entidades principales

El modelo inicial tendrá:

```text
Inventory
Product

Purchase

Sale
SaleItem

InventoryMovement

StockAdjustment
```

No todas necesitan convertirse necesariamente en una tabla independiente.

El diseño físico se decidirá después.

---

# 4. Inventory

Representa el espacio de inventario del usuario.

Aunque V1 normalmente tendrá uno solo, introducir esta entidad evita asociar todos los datos
directamente a una cuenta o dispositivo.

Conceptualmente:

```text
Inventory
---------
id
name
currency
createdAt
updatedAt
```

Ejemplo:

```text
id: inv_...
name: "Mi negocio"
currency: USD
```

## Inventory activo en la UI móvil V1

La UI móvil V1 opera con un único `Inventory` activo:

```text
0 inventories → mostrar configuración inicial
1 inventory   → utilizar ese Inventory
>1 inventories → estado no soportado explícito
```

La aplicación no elegirá silenciosamente el primer registro cuando exista más de uno. V1 no
incluye selector de inventarios, `active_inventory_id` ni una tabla adicional para esta decisión.
El modelo conserva su soporte estructural para múltiples inventarios futuros.

---

# 5. ¿Por qué Inventory si Free ni siquiera requiere cuenta?

Porque:

```text
Usuario ≠ Inventario
```

Actualmente:

```text
Dispositivo
   ↓
Inventario local
```

Futuro Pro:

```text
Usuario
   ↓
Inventario
   ↓
Dispositivo A
Dispositivo B
Web
```

Y futuro Team:

```text
Inventario
   ↓
Miembro A
Miembro B
Miembro C
```

Podemos prepararnos para esto sin implementar Team.

---

# 6. Product

Representa un producto controlado por el usuario.

Campos conceptuales:

```text
Product
-------
id
inventoryId

name
variant
barcode

regularSalePrice
minimumStock

currentStock
currentAverageCost
costStatus

isArchived

createdAt
updatedAt
```

`createdAt` y `updatedAt` son obligatorios. Al crear un Product representan el mismo instante;
posteriormente `updatedAt` nunca puede ser anterior a `createdAt`.

---

# 7. Product.name

Obligatorio.

Ejemplos:

```text
Coca-Cola 500 ml
Camiseta básica
Labial mate
Filtro de aceite
```

---

# 8. Product.variant

Opcional.

Ejemplos:

```text
M
Negro / L
Rojo
Modelo A
```

No representa todavía un sistema formal de variantes.

Dos variantes siguen siendo dos productos diferentes.

---

# 9. Product.barcode

Opcional.

El código debe ser único entre productos activos del mismo inventario.

No asumiremos que todos los códigos siguen el mismo estándar.

Debe almacenarse como texto, no como número.

Correcto:

```text
"7861234567890"
```

No:

```text
7861234567890
```

Esto evita problemas con:

- ceros iniciales;
- códigos largos;
- representaciones numéricas.

---

# 10. Product.regularSalePrice

Representa el precio habitual actual.

Ejemplo:

```text
1.00
```

Cambiarlo afecta ventas futuras.

Nunca modifica ventas históricas.

---

# 11. Product.minimumStock

Opcional.

Cuando:

```text
currentStock <= minimumStock
```

el producto aparece como stock bajo.

---

# 12. Product.currentStock

Valor derivado/cacheado del inventario actual.

Ejemplo:

```text
21
```

Debe ser coherente con los movimientos.

No representa por sí solo el historial.

---

# 13. Product.currentAverageCost

Costo promedio actual o último costo conocido del producto.

Puede ser:

```text
0.67
```

pero también puede ser `null` cuando nunca se haya conocido un costo.

---

# 14. Estado del costo

No debemos asumir que:

```text
costo = null
```

y:

```text
costo = 0
```

son lo mismo.

Para V1 son suficientes los estados:

```text
KNOWN
UNKNOWN
```

### KNOWN

Conocemos suficientemente el costo del stock.

### UNKNOWN

No tenemos información de costo.

No existe un estado `PENDING`: una venta conserva el último costo conocido o queda explícitamente
sin costo estimable.

---

# 15. Purchase

Representa la compra de un único producto. MVP/V1 no modela compras multiproducto ni líneas de
compra.

```text
Purchase
--------
id
inventoryId
productId

quantity
unitCost
totalAmount

effectiveAt
createdAt
updatedAt

status

notes

averageCostBefore
averageCostAfter
stockBefore
stockAfter
```

`totalAmount` se deriva de `quantity × unitCost`. Los campos de stock y costo son snapshots derivados.

Son útiles para:

- mostrar rápidamente qué ocurrió;
- depuración;
- auditoría;
- futuras sincronizaciones.

Estados posibles:

```text
CONFIRMED
VOIDED
```

Todos los campos son obligatorios salvo `notes` y `averageCostBefore`, que son nullable.
`unitCost`, `totalAmount` y `averageCostAfter` siempre son valores `Money` conocidos; un costo real
de cero se conserva como cero. `averageCostBefore` es exactamente `InventoryState.unitCost` antes
de aplicar la compra y puede ser `null` cuando todavía no existía un costo conocido.
`averageCostAfter` es exactamente el costo del estado resultante y nunca es `null` porque toda compra
registrada requiere un costo unitario conocido.

Los snapshots deben cumplir:

```text
stockAfter = stockBefore + quantity

stockBefore > 0
→ averageCostBefore es obligatorio
→ averageCostAfter usa el costo promedio ponderado aprobado

stockBefore <= 0
→ averageCostAfter = unitCost
```

El stock anterior y posterior puede ser negativo. La cantidad es un entero seguro mayor que cero y
el costo unitario no puede ser negativo.

`notes` tiene representación canónica `string | null`. En la creación puede omitirse o recibirse
como `null`; ambos casos se normalizan a `null`. Las cadenas se recortan en sus extremos y una
cadena vacía o compuesta únicamente por espacios se normaliza a `null`. El contenido interno,
incluidos espacios y saltos de línea, se conserva. V1 no define una longitud máxima.

---

# 16. Compra sin líneas

No existe `PurchaseItem` en V1. Crear esa entidad para soportar una compra multiproducto futura
añadiría complejidad sin un caso de uso actual. Si la necesidad aparece después, se diseñará una
migración explícita.

---

# 17. Sale

Representa una venta completa.

```text
Sale
----
id
inventoryId

effectiveAt
createdAt
updatedAt

status

totalAmount
estimatedCost
estimatedProfit

notes
```

Si cualquier `SaleItem` tiene `costStatus = UNKNOWN`, `Sale.estimatedCost` y
`Sale.estimatedProfit` serán `null`; el total comercial de la venta continúa disponible.

`notes` tiene representación canónica `string | null`. En la creación puede omitirse o recibirse
como `null`; ambos casos se normalizan a `null`. Las cadenas se recortan en sus extremos y una
cadena vacía o compuesta únicamente por espacios se normaliza a `null`. El contenido interno,
incluidos espacios y saltos de línea, se conserva. V1 no define una longitud máxima.

Estados:

```text
CONFIRMED
VOIDED
```

---

# 18. SaleItem

Representa cada producto dentro de una venta.

```text
SaleItem
--------
id
saleId
productId

quantity

unitSalePrice
subtotal

unitCostSnapshot
estimatedCost
estimatedProfit

costStatus

createdAt
updatedAt
```

Esta entidad es especialmente importante.

---

# 19. Snapshot de costo de SaleItem

Ejemplo:

```text
Producto: Coca-Cola
Cantidad: 3
Precio: $1.00
Costo promedio al vender: $0.65
```

Guardamos:

```text
quantity = 3

unitSalePrice = 1.00
subtotal = 3.00

unitCostSnapshot = 0.65
estimatedCost = 1.95

estimatedProfit = 1.05
```

Mañana:

```text
currentAverageCost = 0.72
```

pero esta venta continúa mostrando:

```text
estimatedProfit = 1.05
```

---

# 20. Venta con stock insuficiente

Si se vende sin stock registrado suficiente y existe un último costo conocido, `SaleItem` conserva
ese costo como estimación histórica para todas sus unidades.

Ejemplo:

```text
Stock: 0

Venta:
2 × $1
```

Podemos registrar:

```text
costStatus = KNOWN
unitCostSnapshot = último costo conocido
```

Si nunca se conoció un costo:

```text
costStatus = UNKNOWN
unitCostSnapshot = null
estimatedCost = null
estimatedProfit = null
```

`null` representa información no disponible; nunca equivale a costo cero. Una compra futura no
modifica estos snapshots ni reescribe la ganancia histórica.

---

# 21. Compra después de stock negativo

Ejemplo:

```text
Stock registrado: -2

Nueva compra:
10 × $0.70
```

Conceptualmente:

```text
2 unidades
→ cubren déficit anterior

8 unidades
→ inventario disponible
```

Las dos unidades que cubren el déficit no participan en una fórmula de promedio con stock negativo.
Después:

```text
Stock actual = 8
Costo conocido de inventario restante = $0.70
```

Si el stock anterior era cero o negativo y la compra deja stock disponible, `currentAverageCost`
pasa a ser el costo unitario de la nueva compra. Si el resultado continúa en cero o negativo, ese
costo queda como último costo conocido para estimaciones futuras. No existe reconciliación ni
reescritura de ventas históricas.

---

# 22. InventoryMovement

Esta será una entidad fundamental.

Representa cualquier cambio de cantidad.

```text
InventoryMovement
-----------------
id
inventoryId
productId

type
quantityDelta

effectiveAt
createdAt
updatedAt

sourceType
sourceId

unitCostSnapshot

stockBefore
stockAfter

metadata
```

Campos obligatorios:

```text
id
inventoryId
productId
type
quantityDelta
effectiveAt
createdAt
updatedAt
stockBefore
stockAfter
```

Campos nullable:

```text
sourceType
sourceId
unitCostSnapshot
metadata
```

`sourceType` y `sourceId` forman una asociación opcional: ambos son `null` o ambos tienen valor.
Para `INITIAL_STOCK` ambos son `null`.

`stockBefore` y `stockAfter` son enteros seguros, pueden ser negativos y deben cumplir:

```text
stockBefore + quantityDelta = stockAfter
```

La suma no puede salir del rango de enteros seguros. `unitCostSnapshot = null` significa costo
histórico desconocido; un costo real de cero se conserva como cero. `metadata` es nullable y su
valor por defecto en V1 es `null`; queda reservado para metadata futura específica del movimiento.

---

# 23. Tipos de movimiento

Inicialmente:

```text
INITIAL_STOCK
PURCHASE
SALE
ADJUSTMENT_IN
ADJUSTMENT_OUT
REVERSAL
```

Más adelante podrían aparecer:

```text
RETURN_IN
RETURN_OUT
TRANSFER
```

sin necesitarlos en MVP.

---

# 24. quantityDelta

Utilizaremos conceptualmente signo.

Compra:

```text
+24
```

Venta:

```text
-3
```

Ajuste positivo:

```text
+2
```

Ajuste negativo:

```text
-1
```

Esto simplifica muchos cálculos internos.

---

# 25. sourceType y sourceId

Permiten responder:

> ¿Por qué existe este movimiento?

Ejemplo:

```text
type = SALE
sourceType = SALE
sourceId = sale_123
```

O:

```text
type = PURCHASE
sourceType = PURCHASE
sourceId = purchase_456
```

Así un movimiento no existe aislado de su evento original.

Convención V1 para compras, ventas y reversiones:

```text
PURCHASE
sourceType = PURCHASE
sourceId = Purchase.id

SALE
sourceType = SALE
sourceId = Sale.id

REVERSAL
sourceType = INVENTORY_MOVEMENT
sourceId = InventoryMovement.id original
```

La asociación `sourceType`/`sourceId` es polimórfica y V1 no agrega una foreign key SQL explícita.
Domain y Application validarán que la relación corresponda a la operación ejecutada.

---

# 26. StockAdjustment

Representa la intención de corregir el inventario.

```text
StockAdjustment
---------------
id
inventoryId
productId

stockBefore
actualStock
difference

reason

costMode
unitCost

effectiveAt
createdAt
updatedAt
```

`stockBefore` es un entero seguro y puede ser positivo, cero o negativo. `actualStock` representa el
conteo físico resultante y debe ser un entero seguro mayor o igual que cero. `difference` se almacena
y debe ser exactamente:

```text
actualStock - stockBefore
```

Una diferencia cero no representa un `StockAdjustment` válido y no genera `InventoryMovement`.
La entidad no tiene estado, notas ni motivo libre en V1; es un hecho histórico inmutable y un conteo
incorrecto se corrige con otro ajuste.

---

# 27. Adjustment.reason

Valores iniciales:

```text
COUNT_CORRECTION
DAMAGED
LOST
INTERNAL_USE
OTHER
```

El texto mostrado será amigable:

```text
Conteo incorrecto
Dañado
Perdido
Consumo interno
Otro
```

`reason` es obligatorio. Un incremento solo admite `COUNT_CORRECTION` u `OTHER`; una reducción
admite cualquiera de los cinco valores. `OTHER` no requiere texto adicional en V1.

---

# 28. Ajuste positivo y costo

Para:

```text
Stock registrado: 10
Stock real: 12
```

Difference:

```text
+2
```

Opciones:

```text
USE_CURRENT_COST
CUSTOM_COST
```

Ejemplo:

```text
costMode = USE_CURRENT_COST
unitCost = 0.65
```

`USE_CURRENT_COST` se precarga y recomienda cuando existe un costo actual. Si no existe, el usuario
debe proporcionar `CUSTOM_COST`. V1 no permite un ajuste positivo con costo desconocido.

Para una diferencia positiva, `costMode` y `unitCost` son obligatorios y `unitCost` debe ser mayor o
igual que cero. Cero conocido es válido. `USE_CURRENT_COST` conserva exactamente el costo vigente y
`CUSTOM_COST` conserva el costo aceptado explícitamente.

El ajuste se costea como una entrada conocida: con `stockBefore > 0` se aplica el promedio ponderado
existente; con `stockBefore <= 0` el stock anterior no participa y el nuevo costo es exactamente
`unitCost`, incluso si se venía de stock negativo.

---

# 29. Ajuste negativo

Para una salida por daño:

```text
difference = -2
reason = DAMAGED
```

La representación canónica es:

```text
costMode = null
unitCost = costo promedio vigente antes del ajuste
```

El stock resultante es `actualStock` y el costo vigente no cambia. Un ajuste negativo válido parte
de stock positivo, por lo que su costo es conocido; nunca se sustituye un costo desconocido por cero.

La futura asociación con movimientos es:

```text
difference > 0 → InventoryMovement.type = ADJUSTMENT_IN
difference < 0 → InventoryMovement.type = ADJUSTMENT_OUT

sourceType = STOCK_ADJUSTMENT
sourceId = StockAdjustment.id
quantityDelta = difference
stockBefore = StockAdjustment.stockBefore
stockAfter = StockAdjustment.actualStock
```

En una entrada, `unitCostSnapshot` es el costo resuelto del ajuste, no el nuevo promedio ponderado.
En una salida, es el costo promedio vigente antes del ajuste. Cero conocido se conserva como cero.
Solo la creación del producto genera `INITIAL_STOCK`; una corrección posterior siempre utiliza
`StockAdjustment`, y una adquisición comercial conocida utiliza `Purchase`.

---

# 30. Stock inicial

Puede modelarse como una operación especial que genere:

```text
InventoryMovement.type = INITIAL_STOCK
```

Datos:

```text
quantity
unitCost
```

No se registrará como compra normal.

Si `quantity > 0`, `unitCost` es obligatorio y representa el costo aproximado aceptado por el
usuario. Un producto sin costo inicial debe crearse con stock `0`.

---

# 31. Precio actual e historial de venta

`PriceChange` no es una entidad del modelo V1. `Product.regularSalePrice` conserva el precio
habitual actual y cada `SaleItem.unitSalePrice` conserva el precio utilizado históricamente.

---

# 32. Evolución futura del precio

Un historial formal de cambios de precio podrá diseñarse posteriormente si usuarios reales
demuestran esa necesidad. No se creará una estructura V1 "por si acaso".

---

# 33. Sugerencias de precio

V1 no creará una tabla:

```text
PriceSuggestion
```

La sugerencia puede calcularse cuando sea necesaria.

Solo si posteriormente queremos estudiar:

> cuántas sugerencias acepta el usuario

podremos guardar eventos analíticos.

No debemos crear entidades simplemente porque “quizá algún día”.

---

# 34. Datos actuales vs históricos

Ejemplo de `Product`:

```text
currentStock
currentAverageCost
regularSalePrice
```

representa:

**estado actual**

Mientras:

```text
Purchase
SaleItem
InventoryMovement
```

representan:

**historia**

Ambos tienen propósitos diferentes.

---

# 35. Relaciones principales

Conceptualmente:

```text
Inventory
   │
   ├── Product
   │      │
   │      └── InventoryMovement
   │
   ├── Purchase ─── Product
   │
   ├── Sale
   │      └── SaleItem
   │             └── Product
   │
   └── StockAdjustment
          └── Product
```

---

# 36. Venta y movimientos

Una venta:

```text
Sale
```

con:

```text
3 SaleItems
```

genera:

```text
3 InventoryMovements
```

Ejemplo:

```text
Venta #100

Coca-Cola ×2
Doritos ×1
Agua ×3
```

produce:

```text
SALE Coca-Cola -2
SALE Doritos   -1
SALE Agua      -3
```

Todos referencian:

```text
sourceId = Sale #100
```

---

# 37. Atomicidad

Una operación multiproducto debe aplicarse completamente o no aplicarse.

No queremos:

```text
Coca-Cola: descontada ✓
Doritos: descontada ✓
Agua: ERROR
Venta: ?
```

Conceptualmente:

```text
BEGIN

crear Sale
crear SaleItems
crear Movements
actualizar stocks

COMMIT
```

Si algo falla:

```text
ROLLBACK
```

La tecnología local elegida deberá soportar transacciones adecuadamente.

---

# 38. Anulación de venta

Una venta anulada:

```text
Sale.status = VOIDED
```

No se elimina.

Se crean movimientos compensatorios.

Ejemplo original:

```text
Coca-Cola -2
```

Anulación:

```text
Coca-Cola +2
```

vinculada al movimiento/venta original.

En V1, deshacer una venta anula la venta completa. Las devoluciones, reembolsos y reversiones
parciales quedan fuera del alcance de V1.

## 38.1 Estado y movimiento compensatorio

La única transición de estado de una operación comercial en V1 es:

```text
CONFIRMED → VOIDED
```

`effectiveAt` y `createdAt` de la operación original no cambian. `updatedAt` registra el instante en
que se persistió el cambio de estado. No existen `voidedAt` ni motivo de anulación separados en V1;
el `createdAt` del movimiento compensatorio permite auditar cuándo ocurrió la reversión técnica.

Cada movimiento compensatorio utiliza:

```text
type = REVERSAL
quantityDelta = -original.quantityDelta
sourceType = INVENTORY_MOVEMENT
sourceId = original InventoryMovement.id
unitCostSnapshot = original.unitCostSnapshot
stockBefore = estado vigente antes de anular
stockAfter = stockBefore + quantityDelta
metadata = null
effectiveAt = createdAt = updatedAt = instante de anulación
```

Existe un `REVERSAL` por cada movimiento original. Una venta multiproducto genera uno por línea, pero
continúa siendo una única operación comercial porque los movimientos originales comparten
`sourceType = SALE` y `sourceId = Sale.id`. Una compra genera un solo `REVERSAL` porque Purchase es de
un producto.

Application debe garantizar como invariante que un movimiento original tenga como máximo un
`REVERSAL`. La relación polimórfica no tiene foreign key ni restricción UNIQUE SQL. La transacción
local exclusiva, la consulta por `sourceType/sourceId` y el estado `VOIDED` proporcionan la barrera
de idempotencia V1.

Los snapshots de Purchase son suficientes para restaurar exactamente el estado anterior solo cuando
su movimiento sigue siendo el último movimiento inequívoco del producto y el estado vigente coincide
con sus snapshots posteriores. No autorizan restaurar una compra antigua después de otras
operaciones.

Si existe otro movimiento con el mismo `createdAt`, el modelo actual no conserva un ordinal de
inserción autoritativo. V1 trata ese orden como ambiguo y bloquea la anulación en vez de inferirlo por
el ID.

Los productos archivados conservan `InventoryState` e historia. Una operación elegible puede
anularse sin desarchivar ni modificar la metadata actual del Product.

## 38.2 Alcance de StockAdjustment

`StockAdjustment` no tiene `status` en V1 y permanece inmutable. No se anula y no genera
`REVERSAL`; una corrección posterior se representa mediante otro conteo físico y otro ajuste.

---

# 39. IDs y sincronización futura

Las entidades principales de V1 tendrán:

```text
id
createdAt
updatedAt
```

Esto, junto con IDs generables offline y relaciones correctas, es preparación suficiente para V1.
No existe una entidad `SyncMetadata` ni campos como `deviceId`, `version` o `syncStatus`. La metadata
específica se diseñará cuando se implemente Pro/cloud.

---

# 40. Soft delete

Para productos utilizaremos:

```text
isArchived
```

porque:

**archivado ≠ eliminado.**

Otros mecanismos de borrado o tombstones se diseñarán únicamente cuando exista un caso de uso local
o de sincronización concreto.

---

# 41. Timestamps

Debemos distinguir:

```text
effectiveAt
createdAt
updatedAt
```

### effectiveAt

Cuándo ocurrió comercialmente.

### createdAt

Cuándo se registró.

Inicialmente normalmente serán iguales.

Esto nos prepara para movimientos históricos futuros.

---

# 42. Tiempo y zonas horarias

Los timestamps se representan como enteros seguros y no negativos de milisegundos desde Unix epoch
en UTC. Representan un instante absoluto.

La presentación utilizará la zona horaria local correspondiente.

Esto será importante cuando exista sincronización entre dispositivos.

---

# 43. Moneda

Cada `Inventory` tendrá una moneda principal representada mediante un código ISO 4217 alpha-3.

El valor canónico utiliza exactamente tres letras ASCII mayúsculas. Domain elimina whitespace
exterior, normaliza a uppercase y valida únicamente este formato. V1 no mantiene un catálogo de
códigos ISO 4217 ni comprueba que cada código con forma válida aparezca actualmente en ese catálogo;
la UI/Application futura presentará opciones de moneda válidas en lugar de depender de input libre.

Ejemplo:

```text
USD
```

Los registros monetarios no necesitan repetir visualmente `$`, pero sí deberán interpretarse en el
contexto de la moneda del inventario.

No habrá conversión FX en V1.

---

# 44. Precisión monetaria

No almacenaremos dinero utilizando cálculos binarios inseguros como fuente de verdad. V1 utilizará
la representación fija definida en `ARCHITECTURE.md`:

```text
1 unidad monetaria = 1,000,000 unidades internas
```

Esto permite conservar hasta seis decimales internos sin depender de punto flotante binario.

---

# 45. Precisión del costo promedio

Hay una diferencia importante:

```text
Precio de venta: $10.67
```

puede expresarse fácilmente en centavos.

Pero:

```text
Costo promedio = 10.666666...
```

necesita mayor precisión interna.

Por tanto, el costo promedio posiblemente requiera una representación decimal de mayor precisión que
el precio mostrado.

La UI mostrará normalmente dos decimales, pero los cálculos conservarán hasta seis según
`ARCHITECTURE.md`.

---

# 46. Cantidades futuras

Aunque V1 utilice enteros, no debemos ligar conceptualmente todo el sistema a unidades físicas
indivisibles.

Una migración futura podría permitir:

```text
quantity = decimal
unit = UNIT | KG | LITER | METER
```

No implementaremos `unit` todavía.

---

# 47. Índices necesarios

La base local deberá poder buscar eficientemente por:

- `Product.name`;
- `Product.barcode`;
- `Product.isArchived`;
- movimientos por `productId`;
- movimientos por fecha;
- ventas por fecha;
- compras por fecha.

Especialmente:

```text
barcode
```

debe permitir búsquedas prácticamente inmediatas durante escaneo.

---

# 48. Búsqueda textual

No necesitamos un motor de búsqueda complejo.

Para MVP:

- nombre;
- variante;
- código.

La implementación deberá soportar búsqueda parcial razonablemente rápida para inventarios
pequeños/medianos.

---

# 49. Tamaño esperado

No diseñaremos inicialmente para millones de productos por usuario.

Sí debemos soportar cómodamente:

- cientos;
- algunos miles de productos;
- decenas de miles de movimientos históricos.

Sin degradar la experiencia cotidiana.

---

# 50. Analytics

Los datos comerciales del usuario y los eventos de producto son conceptos distintos.

No debemos confundir:

```text
Sale
```

con:

```text
analytics event "sale_created"
```

Si posteriormente instrumentamos analytics, estará desacoplado del modelo principal.

---

# 51. Información sensible

La aplicación almacenará información comercial potencialmente sensible:

- ventas;
- costos;
- precios;
- inventario;
- rentabilidad estimada.

La arquitectura deberá considerar:

- almacenamiento seguro;
- backup;
- acceso;
- autenticación cuando exista cloud.

No asumiremos que estos datos son triviales solo porque no son datos bancarios.

---

# 52. Preparación para sync

El modelo deberá soportar que dos dispositivos puedan eventualmente crear registros offline.

Ejemplo:

```text
Teléfono A
crea sale_A

Teléfono B
crea sale_B
```

Ambos IDs deben ser válidos sin coordinación previa.

Por eso evitaremos IDs autoincrementales como identidad global. Esta preparación no requiere
implementar metadata, outbox ni resolución de conflictos en V1.

---

# 53. Conflictos futuros

Algunos datos serán fáciles de combinar:

```text
Nueva venta A
Nueva venta B
```

Otros pueden generar conflictos:

```text
Dispositivo A:
precio = $1.00 → $1.10

Dispositivo B:
precio = $1.00 → $1.20
```

La detección y resolución de estas versiones se diseñará junto con Pro/cloud. V1 no anticipa esa
metadata; conserva únicamente identificadores offline, timestamps y relaciones consistentes.

---

# 54. Lo que NO modelaremos aún

No crear entidades para:

- Customer;
- Supplier complejo;
- Employee;
- Role;
- Branch;
- Warehouse;
- Invoice;
- Tax;
- Payment;
- BankAccount;
- PurchaseOrder;
- Recipe;
- ManufacturingOrder;
- LoyaltyProgram.

No prepararemos el modelo para todo ERP imaginable.

---

# 55. Posible Supplier futuro

Un nombre de proveedor podría resultar útil bastante pronto.

Pero no introduciría una entidad completa `Supplier` en MVP.

Si usuarios reales lo necesitan, inicialmente podría agregarse un campo opcional sencillo o
evolucionarse posteriormente.

---

# 56. Integridad crítica

Debe ser imposible terminar correctamente una transacción con:

```text
Sale registrada
```

pero:

```text
InventoryMovement faltante
```

o:

```text
stock actualizado parcialmente
```

Las operaciones de dominio relacionadas deben ser atómicas.

---

# 57. Invariantes del modelo

### Producto

Un producto pertenece a un inventario.

### Barcode

Un código activo identifica como máximo un producto activo dentro del inventario.

### Sale

Una venta confirmada tiene al menos un `SaleItem`.

### Purchase

Una compra confirmada referencia exactamente un producto y conserva cantidad, costo unitario y
total.

### Movement

Todo movimiento referencia un producto.

### Movimiento originado

Los movimientos de ventas/compras deben conocer su fuente.

### Snapshot

Una línea de venta conserva su costo histórico utilizado o `costStatus = UNKNOWN` cuando nunca se
conoció un costo.

### Stock

`Product.currentStock` debe coincidir con el estado derivado de movimientos válidos.

### Historia

Anular no equivale a borrar.

---

# 58. Modelo conceptual final MVP

```text
┌─────────────────┐
│    Inventory    │
└────────┬────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐
│     Product     │
│-----------------│
│ currentStock    │
│ averageCost     │
│ regularPrice    │
└───────┬─────────┘
        │
        │
        ▼
┌─────────────────────┐
│ InventoryMovement   │
└─────────────────────┘


┌──────────────┐
│     Sale     │
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────┐
│   SaleItem   │─── Product
└──────────────┘


┌──────────────┐
│   Purchase   │
└──────┬───────┘
       │ N:1
       ▼
┌──────────────┐
│   Product    │
└──────────────┘


┌─────────────────┐
│ StockAdjustment │─── Product
└─────────────────┘
```

---

# 59. Decisiones aceptadas

Para V1:

- existe `Inventory` aunque solo haya uno;
- productos tienen IDs generables offline;
- variantes continúan siendo productos independientes;
- barcode es string;
- venta y salida de inventario son conceptos distintos;
- ventas pueden contener varios productos;
- cada línea de venta conserva snapshot de costo;
- cada compra contiene exactamente un producto y no existe `PurchaseItem`;
- compras cambian costo promedio;
- ventas no recalculan costo promedio;
- stock actual puede cachearse;
- movimientos conservan historial;
- ajustes tienen motivo;
- ajuste positivo permite costo actual u otro costo aceptado;
- costo desconocido no equivale a cero;
- stock negativo está permitido;
- ventas sin stock usan el último costo conocido o quedan con ganancia no disponible;
- compras después de stock cero o negativo no ponderan el déficit;
- ventas históricas nunca se reescriben por compras futuras;
- anulación utiliza reversión, no borrado;
- `PriceChange` no es una entidad V1;
- no existe `SyncMetadata` en V1;
- datos preparados para evolución futura mediante IDs offline, `createdAt`, `updatedAt` y relaciones.

---

# 60. Relación con arquitectura

`ARCHITECTURE.md` define para V1 el stack móvil, SQLite, Drizzle, precisión monetaria, transacciones,
IDs offline, capas, backup local y estrategia de testing. Continúan provisionales únicamente las
decisiones que pertenecen a Pro/cloud o a validaciones posteriores, como proveedor cloud,
autenticación y sincronización, estrategia web definitiva, cifrado SQLite, analytics y crash
reporting.

---

# 61. Regla final

El modelo debe optimizar primero:

**integridad + trazabilidad + funcionamiento offline**

y después:

**comodidad de implementación.**

Si una estructura simplifica el código hoy pero hace imposible saber mañana por qué existe cierto
stock o costo, no es una buena estructura.
