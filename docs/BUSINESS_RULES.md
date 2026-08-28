# BUSINESS_RULES.md

**Estado:** Baseline v1.0 **Producto:** Nombre por definir **Documentos relacionados:** `PRODUCT.md`,
`MVP.md`

---

# 1. Objetivo

Este documento define las reglas que determinan:

- stock;
- compras;
- ventas;
- ajustes;
- costo promedio;
- costo de ventas;
- ganancia estimada;
- margen;
- cambios de costo;
- sugerencias de precio;
- correcciones;
- situaciones excepcionales.

Estas reglas constituyen la fuente de verdad funcional del producto.

La interfaz y la implementación deberán respetarlas.

---

# 2. Principios fundamentales

## BR-001 — Todo cambio de stock tiene un origen

El stock no debe modificarse silenciosamente.

Todo cambio debe poder explicarse mediante un movimiento:

- compra;
- venta;
- ajuste positivo;
- ajuste negativo;
- reversión/corrección.

---

## BR-002 — Los movimientos son la historia

Los movimientos representan lo que ocurrió.

El sistema podrá mantener valores derivados para mejorar rendimiento, pero estos deberán ser
coherentes con el historial.

---

## BR-003 — Los cálculos monetarios deben ser deterministas

El mismo conjunto de datos debe producir siempre el mismo resultado.

La implementación no utilizará operaciones monetarias inseguras de punto flotante.

La representación técnica exacta es la precisión fija definida en `ARCHITECTURE.md`.

---

# 3. Stock

Conceptualmente:

```text
Stock =
entradas
- salidas
+ ajustes positivos
- ajustes negativos
```

Una compra aumenta stock.

Una venta disminuye stock.

Un ajuste puede aumentarlo o disminuirlo.

---

# 4. Cantidades

V1 soportará únicamente cantidades enteras.

Válido:

```text
1
2
24
150
```

Inválido:

```text
0
-4
1.5
0.25
```

Una operación deberá indicar una cantidad positiva.

El tipo de movimiento determina si esa cantidad entra o sale del inventario.

---

# 5. Producto nuevo

Un producto puede crearse sin stock.

Ejemplo:

```text
Coca-Cola
Stock: 0
Precio habitual: $1.00
```

Crear un producto no equivale automáticamente a comprarlo.

---

# 6. Stock inicial

Cuando el usuario ya posee unidades al comenzar a utilizar la aplicación, podrá indicar stock
inicial.

Ejemplo:

```text
Ya tengo:

Cantidad: 20
Costo aproximado por unidad: $0.60
```

El sistema registrará esto como un movimiento especial:

**INITIAL_STOCK**

No será una compra ficticia.

Esto permite distinguir:

> “Esto ya existía cuando empecé a usar la app.”

de:

> “Esto lo compré después.”

Si el stock inicial es mayor que cero, el costo unitario aproximado es obligatorio. La interfaz
explicará que se utiliza para estimar la ganancia; no necesita ser el valor histórico exacto.

Si el usuario no desea proporcionar un costo, deberá crear el producto con stock `0` y registrar
posteriormente las nuevas compras.

---

# 7. Compra

Una compra requiere:

- producto;
- cantidad;
- costo unitario;
- fecha/hora.

En MVP/V1 cada compra corresponde a un único producto. No contiene líneas ni varios productos. El
total se deriva de `cantidad × costo unitario`.

Opcionalmente podrá conservar:

- nota.

Ejemplo:

```text
Producto: Coca-Cola
Cantidad: 24
Costo unitario: $0.65

Total: $15.60
```

Al confirmar:

1. se registra la compra;
2. aumenta el stock;
3. se actualiza el costo promedio;
4. se evalúa el cambio de costo;
5. se recalcula el margen estimado;
6. se evalúa una posible sugerencia de precio.

---

# 8. Costo promedio ponderado

Mientras exista stock, una nueva compra utilizará:

```text
nuevo costo promedio =
(
  stock anterior × costo promedio anterior
  +
  cantidad comprada × costo nuevo
)
/
(
  stock anterior + cantidad comprada
)
```

Ejemplo:

```text
20 × $10 = $200
10 × $12 = $120

Valor total = $320
Stock = 30

Costo promedio = $10.6666...
```

Visualmente:

```text
$10.67
```

El sistema podrá conservar mayor precisión internamente.

---

# 9. Una venta NO recalcula el costo promedio

Supongamos:

```text
30 unidades
Costo promedio = $10.6666...
```

Vendemos 5.

Después:

```text
25 unidades
Costo promedio = $10.6666...
```

El costo promedio permanece igual.

La venta utiliza el costo vigente para estimar cuánto costaron las unidades vendidas.

---

# 10. Costo estimado de una venta

Para una línea de venta:

```text
costo estimado =
cantidad vendida × costo promedio al momento de la venta
```

Ejemplo:

```text
3 unidades
Costo promedio: $0.65

Costo estimado:
$1.95
```

Este valor debe quedar asociado a la venta.

---

# 11. Snapshot de costo

Una venta debe conservar el costo utilizado cuando fue registrada.

Ejemplo:

Hoy:

```text
Venta:
3 × $1.00

Costo promedio en ese momento:
$0.65
```

Aunque mañana el costo promedio cambie a `$0.72`, la venta histórica seguirá utilizando `$0.65`.

Por tanto:

> Los cambios futuros de costo NO deben modificar retroactivamente la ganancia estimada de ventas
> anteriores.

Esta regla es fundamental.

---

# 12. Precio de venta

Cada producto tendrá un:

**precio habitual**

Al crear una venta, ese precio aparecerá precargado.

Ejemplo:

```text
Precio habitual:
$1.00

Venta:
Coca-Cola ×3
$1.00 c/u
```

El usuario podrá modificar el precio para esa venta sin cambiar necesariamente el precio habitual.

---

# 13. Precio diferente en una venta

Si el usuario modifica:

```text
$1.00 → $0.90
```

la venta utilizará `$0.90`.

Esto NO modifica automáticamente el precio habitual del producto.

En etapas posteriores podría ofrecerse:

> “¿Quieres establecer $0.90 como nuevo precio habitual?”

No es obligatorio para MVP.

---

# 14. Venta multiproducto

Una venta contiene una o más líneas.

Ejemplo:

```text
Venta #123

Coca-Cola    2 × $1.00
Doritos      1 × $1.25
Agua         3 × $0.75
```

Cada línea conserva independientemente:

- producto;
- cantidad;
- precio unitario;
- costo promedio utilizado;
- subtotal;
- costo estimado;
- ganancia estimada.

Dentro de una misma venta, cada `productId` aparece como máximo una vez. Si el mismo producto se
agrega nuevamente, la interfaz debe incrementar la cantidad de su línea; Application rechazará una
operación que contenga líneas duplicadas en lugar de fusionarlas silenciosamente.

---

# 15. Total de venta

```text
total venta =
suma de subtotales
```

Para cada línea:

```text
subtotal =
cantidad × precio unitario
```

---

# 16. Ganancia estimada

Por unidad:

```text
ganancia estimada =
precio de venta - costo estimado unitario
```

Por línea:

```text
ganancia estimada =
subtotal - costo estimado
```

Por venta:

```text
ganancia estimada total =
suma de ganancias estimadas de sus líneas
```

Si cualquier línea tiene costo desconocido, la ganancia estimada de esa línea y de la venta completa
se muestra como no disponible. Los agregados por día o período tampoco tratarán esos costos como
cero ni presentarán como completo un total que no puede calcularse.

Para un resumen de ventas por día o período:

- solo participan ventas confirmadas cuya fecha efectiva pertenece al rango;
- si no existen ventas, la ganancia estimada es cero;
- si todas las ventas tienen ganancia estimada conocida, se suman sus valores exactos;
- si al menos una venta tiene ganancia estimada desconocida, el agregado completo queda no
  disponible.

---

# 17. No es utilidad neta

La aplicación debe dejar claro que esta cifra representa una estimación basada en el costo del
producto.

No incluye automáticamente:

- alquiler;
- salarios;
- electricidad;
- impuestos;
- transporte;
- marketing;
- comisiones;
- otros gastos.

La UI podrá utilizar:

**Ganancia estimada**

en lugar de simplemente:

**Ganancia neta**.

---

# 18. Margen

El margen estimado se calculará:

```text
margen =
(precio - costo) / precio × 100
```

Ejemplo:

```text
Costo: $10
Precio: $15

Ganancia: $5

Margen:
5 / 15 × 100
= 33.33%
```

---

# 19. Markup / recargo

Conceptualmente:

```text
markup =
(precio - costo) / costo × 100
```

Con el mismo ejemplo:

```text
5 / 10 × 100
= 50%
```

Por tanto:

```text
Margen = 33.33%
Markup = 50%
```

NO son equivalentes.

La interfaz priorizará margen.

Markup no necesita aparecer prominentemente en MVP.

---

# 20. Precio sugerido para conservar margen

Si conocemos el margen objetivo:

```text
precio sugerido =
nuevo costo / (1 - margen objetivo)
```

Ejemplo:

Antes:

```text
Costo: $10
Precio: $15

Margen:
33.33%
```

Nuevo costo:

```text
$12
```

Para conservar aproximadamente 33.33%:

```text
$12 / (1 - 0.3333)
≈ $18
```

Precio sugerido:

```text
$18.00
```

---

# 21. Margen de referencia

Cuando cambia el costo, necesitamos decidir qué margen intentamos conservar.

La regla inicial será:

> utilizar como referencia el margen existente inmediatamente antes de la compra que modificó el
> costo.

Ejemplo:

```text
Antes:

Costo promedio: $10
Precio habitual: $15
Margen: 33.33%

Nueva compra modifica costo promedio:
$10 → $10.67
```

La aplicación puede calcular qué precio permitiría conservar aproximadamente el `33.33%`.

Esto evita inventar un margen arbitrario.

---

# 22. El usuario controla el precio

Una sugerencia nunca modifica automáticamente:

**precio habitual**

El usuario debe aceptarla explícitamente.

Opciones:

```text
[ Usar precio sugerido ]
[ Mantener precio ]
```

---

# 23. Aumento de costo

Si el costo aumenta, se mostrará el impacto sobre el margen.

Ejemplo:

```text
Tu costo aumentó 8%.

Tu margen aproximado:

Antes     35%
Ahora     31%

Para conservar un margen similar:
$1.10
```

No necesariamente cada cambio minúsculo debe generar una alerta prominente.

El umbral UX se definirá posteriormente.

---

# 24. Disminución de costo

Si el costo disminuye:

```text
Tu costo disminuyó.

Con tu precio actual,
tu margen aumentó de 30% a 35%.
```

La aplicación NO recomendará automáticamente bajar el precio.

Podrá informar de la nueva rentabilidad.

---

# 25. Venta sin costo conocido

Puede ocurrir que el usuario cree un producto con stock `0` y registre una venta antes de haber
registrado cualquier compra o costo:

```text
Stock: 0
```

pero no conozca cuánto le costaron esas unidades.

En ese caso, el sistema no inventará un costo.

Debe representar explícitamente:

**Costo desconocido**

Una venta de esas unidades podrá registrarse, pero la ganancia no deberá mostrarse falsamente como
si el costo fuera `$0`.

La UI podrá indicar:

```text
Ganancia estimada:
No disponible

Falta información de costo.
```

---

# 26. Stock cero

Cuando:

```text
stock = 0
```

el producto continúa existiendo.

Se conserva:

- historial;
- último precio habitual;
- código;
- configuración;
- movimientos anteriores.

El costo histórico tampoco debe eliminarse.

---

# 27. Nueva compra después de stock cero

Regla V1:

Cuando el stock real es exactamente `0`, una nueva compra establece un nuevo costo promedio basado
únicamente en las nuevas unidades.

Ejemplo:

```text
Antes:

Stock: 0
Último costo promedio histórico: $10

Nueva compra:

10 × $14
```

Resultado:

```text
Stock: 10
Costo promedio actual: $14
```

No mezclaremos inventario inexistente con la nueva compra.

El costo anterior permanece disponible en historial para comparar:

```text
Último costo: $10
Nuevo costo: $14
Cambio: +40%
```

---

# 28. Venta con stock insuficiente

Ejemplo:

```text
Stock registrado: 3
Venta: 5
```

La aplicación advertirá:

```text
Solo tienes 3 unidades registradas.
```

La aplicación permitirá continuar explícitamente.

Resultado:

```text
Stock: -2
```

Esto reconoce que el inventario registrado puede estar desactualizado respecto al físico.

La operación debe quedar claramente identificada.

Si existe un último costo conocido, todas las unidades de la venta utilizarán ese costo como
estimación y snapshot histórico. Si nunca se conoció un costo, el costo y la ganancia estimada de la
venta serán no disponibles. En ningún caso se utilizará cero como sustituto de un costo desconocido.

Una compra futura no modificará el snapshot ni la ganancia de esta venta histórica.

---

# 29. Stock negativo

El stock negativo representa:

> según los movimientos registrados, se han vendido más unidades de las que constaban disponibles.

Debe considerarse un estado que requiere atención.

Ejemplo:

```text
Stock: -2

⚠ Revisa tu inventario
```

No debe tratarse como estado normal.

---

# 30. Compra con stock negativo

Este caso no utiliza el stock negativo como inventario valorizado.

Ejemplo:

```text
Stock: -2
Costo anterior: $10

Compra:
10 × $12
```

No debemos aplicar ingenuamente:

```text
(-2 × $10 + 10 × $12) / 8
```

porque el stock negativo no representa inventario físico con valor negativo.

Regla V1:

- el stock resultante es `stock anterior + cantidad comprada`;
- las unidades necesarias para cubrir el déficit no participan en el costo promedio;
- si el resultado es positivo, el costo promedio del inventario disponible pasa a ser el costo
  unitario de la nueva compra;
- si el resultado continúa en cero o negativo, se conserva el costo de la nueva compra como último
  costo conocido para estimaciones futuras;
- ninguna venta histórica se recalcula ni reescribe.

En el ejemplo, el resultado es stock `8` con costo promedio `$12`.

---

# 31. Ajustes

Los ajustes sirven para reconciliar el inventario registrado con el inventario físico. El usuario
indica el stock físico actual, que debe ser un entero seguro mayor o igual que cero. El stock
registrado anterior puede ser positivo, cero o negativo.

Ejemplo:

```text
Registrado: 15
Real: 13

Ajuste:
-2
```

La diferencia se deriva siempre como:

```text
difference = actualStock - stockBefore
```

Si la diferencia es cero, no existe un ajuste válido ni se crea un movimiento. Todo ajuste requiere
un motivo.

Opciones iniciales:

- conteo físico;
- dañado;
- perdido;
- consumo interno;
- otro.

Para un ajuste positivo solo se permiten `COUNT_CORRECTION` y `OTHER`. Para un ajuste negativo se
permite cualquiera de los cinco motivos. `OTHER` no requiere texto adicional en V1.

---

# 32. Ajuste negativo

Un ajuste negativo reduce stock. No permite seleccionar ni introducir otro costo.

Utiliza como snapshot el costo promedio vigente antes del ajuste para estimar el valor de las
unidades retiradas.

El stock resultante es el conteo físico indicado y el costo vigente de las unidades restantes no
cambia. En V1 un ajuste negativo válido parte de stock positivo y, por tanto, de un costo conocido;
nunca se sustituye un costo desconocido por cero.

---

# 33. Ajuste positivo

Un ajuste positivo es diferente.

Si aparecen unidades adicionales:

```text
Registrado: 10
Real: 12
```

el usuario debe aceptar el costo de esas dos unidades.

En V1 existen únicamente estas opciones:

1. `Usar costo actual`, precargado y recomendado cuando existe un costo actual conocido;
2. `Otro costo`, indicado explícitamente por el usuario.

Si todavía no existe costo actual, el usuario deberá indicar `Otro costo`. No existe la opción `No
sé`. La aplicación nunca inventará un costo distinto del que el usuario haya aceptado.

El costo aceptado puede ser cero conocido, pero nunca desconocido. Si el stock registrado es
positivo, el nuevo costo utiliza la misma fórmula y redondeo de promedio ponderado que una entrada
con costo conocido. Si el stock registrado es cero o negativo, no participa en la ponderación y el
costo posterior es exactamente el costo aceptado para el ajuste.

Un ajuste no reemplaza una compra comercial. Tampoco crea stock inicial: solo la creación inicial
del producto puede generar `INITIAL_STOCK`.

Los ajustes son hechos históricos inmutables y no tienen estado en V1. No existe Undo, anulación ni
reversión de un ajuste; un conteo incorrecto se corrige mediante otro conteo físico.

---

# 34. Producto dañado o perdido

Debe registrarse como ajuste negativo.

No como venta.

No genera ingresos.

Ejemplo:

```text
-2 unidades
Motivo: Dañado
```

Esto mantiene correcta la diferencia entre:

**salió del inventario**

y

**fue vendido**.

---

# 35. Devoluciones

Las devoluciones de clientes y devoluciones a proveedores introducen implicaciones sobre:

- stock;
- costo;
- ventas;
- ganancia histórica.

Para evitar reglas incorrectas, **no se implementarán como simples ajustes genéricos si entran al
producto**.

Propuesta:

postergar flujos formales de devoluciones hasta después del MVP.

Durante pruebas deberemos evaluar si esta exclusión genera demasiada fricción.

---

# 36. Corrección de errores

Un movimiento histórico con consecuencias de inventario no debería simplemente editarse
silenciosamente.

Ejemplo:

```text
Compra:
24 × $0.65
```

Si realmente fueron 12, cambiar directamente `24 → 12` puede alterar todos los cálculos posteriores.

La estrategia recomendada será:

**revertir + registrar correctamente**

en lugar de mutar el pasado.

---

# 37. Reversión

Una reversión crea una operación compensatoria vinculada al movimiento original.

Conceptualmente:

```text
Compra original
+24

Reversión
-24

Compra correcta
+12
```

El historial permite entender qué ocurrió.

La interfaz podrá presentar esto de manera mucho más amigable que la representación interna.

---

# 38. Venta anulada

Si una venta se registró por error, podrá anularse.

La anulación:

- restaura stock;
- elimina su impacto de las estadísticas activas;
- conserva evidencia histórica;
- referencia la venta original.

La venta original no desaparece físicamente.

---

# 39. Compra anulada

Anular una compra es más complejo porque compras posteriores y ventas pueden haber ocurrido
utilizando el costo generado por ella.

Por tanto, no debemos asumir que simplemente eliminar una compra histórica siempre es seguro.

Las reglas exactas de recalculación deberán estar cubiertas por tests antes de habilitar
correcciones arbitrarias de compras antiguas.

## 39.1 Anulación y reversión — política V1

Anular una operación comercial significa compensar sus efectos sin borrar ni editar su historia:

- la operación original cambia de `CONFIRMED` a `VOIDED`;
- sus importes, líneas, costos y snapshots históricos permanecen intactos;
- cada movimiento original recibe como máximo un movimiento técnico `REVERSAL` con delta opuesto;
- el `REVERSAL` se aplica sobre el `InventoryState` vigente dentro de la misma transacción;
- History conserva una sola fila comercial marcada como anulada y no muestra el `REVERSAL` como
  otra operación;
- no existe transición de `VOIDED` a `CONFIRMED` en V1.

Para proteger los snapshots de operaciones posteriores, V1 solo permite anular cuando cada
movimiento original afectado sigue siendo el último movimiento inequívoco de su producto. Antes de
escribir se debe comprobar además que el estado vigente coincide exactamente con el estado posterior
de la operación original. Cualquier movimiento posterior del mismo producto —venta, compra, ajuste,
stock inicial o reversión— bloquea la anulación. Si otro movimiento tiene el mismo `createdAt` y no
puede probarse el orden, la anulación también se bloquea de forma segura.

Un movimiento posterior de otro producto no bloquea la operación. Para una venta multiproducto,
todos sus productos deben cumplir la condición; de lo contrario no se anula ninguna línea.

Esta restricción no se adopta solo por simplicidad técnica. Evita:

- recalcular costos promedio históricos;
- reescribir snapshots financieros posteriores;
- interpretar retrospectivamente un conteo físico;
- producir un costo actual contrafactual que el historial aprobado no puede justificar.

### Estrategias evaluadas para Purchase

- **A — restaurar el snapshot anterior:** es exacta cuando Purchase sigue siendo la última operación
  inequívoca y el estado actual coincide con sus snapshots posteriores. Después de otro movimiento,
  sobrescribiría stock y costo legítimos posteriores.
- **B — compensar sobre el estado actual:** restar la cantidad al stock vigente conserva el delta,
  pero no define un costo promedio económicamente justificable y podría contradecir snapshots ya
  usados por ventas o compras posteriores.
- **C — restringir la anulación:** combina `REVERSAL` con restauración exacta de snapshots solo si la
  compra continúa siendo la última operación inequívoca. Es la estrategia adoptada para V1; evita
  replay y recalculación retrospectiva.

### Venta elegible

Por cada movimiento `SALE` original se crea un `REVERSAL` con la cantidad opuesta. Como no existe
ningún movimiento posterior del producto, el stock vuelve exactamente a `stockBefore` del movimiento
original y el costo vigente no cambia. Si el costo era conocido, se conserva; si era desconocido,
continúa siendo `null`. Esto aplica también cuando la venta había dejado stock negativo.

La venta se anula completa y atómicamente. No existen devoluciones, reembolsos ni anulaciones
parciales en V1.

### Compra elegible

Si el movimiento `PURCHASE` sigue siendo el último movimiento inequívoco del producto y el estado
vigente coincide con `Purchase.stockAfter` y `Purchase.averageCostAfter`, la anulación restaura
exactamente:

```text
stock = Purchase.stockBefore
unitCost = Purchase.averageCostBefore
```

Esto cubre stock anterior positivo, cero o negativo. `averageCostBefore = null` se restaura como
costo desconocido; un costo conocido igual a cero permanece cero.

Si hubo una venta, compra, ajuste u otro movimiento posterior del mismo producto, la compra no puede
anularse en V1. No se resta únicamente la cantidad, no se restaura ciegamente el snapshot anterior y
no se ejecuta un replay contrafactual. La operación permanece `CONFIRMED` y la interfaz debe explicar
que existen movimientos posteriores.

### Idempotencia y consistencia

Una solicitud repetida sobre una operación ya `VOIDED` devuelve éxito idempotente con el estado ya
anulado y no crea movimientos ni modifica stock otra vez. Si una operación todavía figura
`CONFIRMED` pero ya existe algún `REVERSAL` de sus movimientos, se trata como inconsistencia de datos:
no se escriben cambios adicionales.

Un producto archivado no bloquea por sí solo la anulación de una operación histórica elegible. La
anulación no desarchiva el producto ni restaura nombre, variante, barcode, stock mínimo o precio
habitual.

### Undo

`Undo` no es otra regla de dominio. Es un acceso rápido al mismo comando de anulación y está sujeto a
las mismas validaciones, atomicidad e idempotencia. V1 no define Undo ni anulación para
`StockAdjustment`: un conteo incorrecto se corrige con otro conteo físico.

### Precio y métricas

Anular una compra nunca restaura `Product.regularSalePrice`, aunque el usuario hubiera aceptado una
sugerencia después de comprar. Ese cambio fue una decisión posterior y separada.

Solo las ventas `CONFIRMED` participan en ventas, unidades, ganancia y futuras métricas comerciales.
Las ventas `VOIDED` permanecen visibles en History, pero no contribuyen a agregados. Una futura
métrica de compras aplicará la misma regla y excluirá compras `VOIDED`.

### Matriz V1

| Operación | Estado inicial | Operaciones posteriores del mismo producto | ¿Se puede anular? | Resultado stock | Resultado costo |
| --- | --- | --- | --- | --- | --- |
| Sale | stock positivo | ninguna | Sí | vuelve al `stockBefore` de `SALE` | conserva el costo vigente/original |
| Sale | termina negativo | ninguna | Sí | vuelve al `stockBefore` de `SALE` | conserva conocido o `null` |
| Sale | cualquiera | compra posterior | No | sin cambios | sin cambios |
| Purchase | stock positivo | ninguna | Sí | `Purchase.stockBefore` | `Purchase.averageCostBefore` |
| Purchase | stock cero | ninguna | Sí | `0` | snapshot anterior, incluido `null` |
| Purchase | stock negativo | ninguna | Sí | stock negativo anterior | snapshot anterior, incluido `null` |
| Purchase | cualquiera | venta posterior | No | sin cambios | sin cambios |
| Purchase | cualquiera | compra posterior | No | sin cambios | sin cambios |
| Adjustment | cualquiera | ninguna | No en V1 | un nuevo conteo corrige el stock | según la nueva corrección |

Para cualquier operación comercial, un movimiento posterior distinto de los ejemplos de la tabla
también bloquea la anulación si afecta uno de sus productos.

---

# 40. Movimientos con fecha anterior

Propuesta MVP:

el usuario registra movimientos con la fecha actual por defecto.

No permitir inicialmente insertar libremente movimientos históricos que alteren el orden contable
del inventario.

Motivo:

Registrar hoy una compra diciendo posteriormente:

> “En realidad esto ocurrió hace tres semanas.”

podría requerir recalcular todos los costos y ventas posteriores.

Podremos agregar movimientos históricos correctamente cuando exista un motor de recalculación
suficientemente robusto.

---

# 41. Fechas

Cada movimiento conservará al menos:

- fecha efectiva;
- fecha de creación.

Inicialmente ambas normalmente serán iguales.

Esto prepara el sistema para funcionalidades futuras sin obligarnos a soportar edición histórica
completa en MVP.

---

# 42. Código de barras

El código identifica un producto dentro del inventario del usuario.

En principio:

> un código activo no puede identificar simultáneamente dos productos activos diferentes dentro del
> mismo inventario.

Escanear un código existente selecciona el producto correspondiente.

---

# 43. Código desconocido

Si durante una venta se escanea un código no registrado:

```text
Producto no encontrado

[ Crear producto ]
[ Escanear otro ]
```

No se realizará una búsqueda automática en Internet en MVP.

---

# 44. Producto archivado

Un producto archivado:

- conserva historial;
- conserva movimientos;
- no acepta nuevas ventas, compras ni ajustes de inventario;
- deja de aparecer normalmente en selecciones operativas;
- puede restaurarse.

No se elimina físicamente si posee historial.

---

# 45. Redondeo

Los valores mostrados al usuario podrán utilizar normalmente dos decimales:

```text
$10.67
```

Los cálculos internos no deben redondear prematuramente.

Ejemplo:

Si el costo real calculado es:

```text
10.666666...
```

no debemos convertir permanentemente cada operación intermedia a `$10.67` y acumular errores.

La precisión interna utilizará hasta seis decimales según `ARCHITECTURE.md`.

---

# 46. Precio sugerido y redondeo comercial

El precio matemático sugerido puede resultar:

```text
$1.073846
```

Mostrar eso sería absurdo.

Inicialmente podrá mostrarse:

```text
$1.07
```

Más adelante podremos incorporar redondeo comercial opcional:

```text
$1.10
$1.25
$1.99
```

No es requisito MVP.

---

# 47. Venta por debajo del costo

La aplicación permitirá vender por debajo del costo.

Ejemplo:

```text
Costo: $10
Venta: $8
```

Pero podrá advertir:

```text
Con este precio perderías aproximadamente $2 por unidad.
```

La aplicación informa.

No impone decisiones comerciales.

---

# 48. Precio igual al costo

Si:

```text
precio = costo
```

entonces:

```text
ganancia estimada = $0
margen = 0%
```

---

# 49. Precio cero

Una venta normal deberá tener precio mayor que cero.

Entregas gratuitas, muestras y regalos deberían modelarse eventualmente mediante un tipo de salida
diferente, no fingiendo que son ventas normales de `$0`.

No es necesario desarrollar ese flujo completo en MVP.

---

# 50. Invariantes críticas

La implementación deberá proteger al menos estas condiciones:

### Inventario

Todo cambio de stock tiene un movimiento asociado.

### Venta

Toda línea de venta conserva el costo utilizado en ese momento o registra explícitamente que el
costo era desconocido.

### Historia

Cambios futuros de costo no modifican ganancias históricas.

### Precio

Una sugerencia nunca modifica el precio sin consentimiento.

### Costo desconocido

Costo desconocido nunca equivale automáticamente a `$0`.

### Archivo

Archivar un producto nunca elimina su historial.

### Correcciones

Una corrección nunca debe ocultar silenciosamente que existió el movimiento original.

---

# 51. Casos obligatorios de prueba

Antes del MVP deberán existir tests para:

1. primera compra;
2. compras consecutivas con mismo costo;
3. compras consecutivas con costos diferentes;
4. costo promedio ponderado;
5. venta parcial;
6. venta total del stock;
7. nueva compra después de stock cero;
8. venta multiproducto;
9. venta con precio diferente al habitual;
10. venta por debajo del costo;
11. costo desconocido;
12. ajuste positivo con costo actual o con otro costo;
13. ajuste negativo;
14. stock insuficiente;
15. stock negativo;
16. compra después de stock negativo sin ponderar el déficit;
17. sugerencia de precio;
18. aumento de costo;
19. disminución de costo;
20. anulación de venta;
21. corrección de compra;
22. producto archivado;
23. código duplicado;
24. redondeo;
25. persistencia del snapshot histórico de costo;
26. venta con stock insuficiente y último costo conocido;
27. venta sin ningún costo conocido;
28. compra futura que no reescribe una venta histórica.

---

# 52. Regla de diseño para casos ambiguos

Cuando una operación pueda interpretarse de varias formas, priorizaremos:

1. no perder información;
2. no inventar información financiera;
3. conservar trazabilidad;
4. mantener cálculos reproducibles;
5. explicar la situación al usuario de manera sencilla.

Cuando no conocemos un dato, es preferible mostrar:

**“No disponible”**

que inventar una cifra aparentemente precisa.
