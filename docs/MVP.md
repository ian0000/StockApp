# MVP.md

**Estado:** Baseline v1.0 **Producto:** Nombre por definir **Documento relacionado:** `PRODUCT.md`

---

# 1. Objetivo del MVP

Construir la versión mínima del producto que permita comprobar que un pequeño comerciante puede
controlar su inventario cotidiano mediante un flujo extremadamente sencillo:

**Crear producto → Registrar compra → Registrar venta → Consultar resultado**

El MVP debe demostrar que el usuario puede confiar en la aplicación para conocer:

- cuánto stock tiene;
- qué compró;
- qué vendió;
- cuál es su costo promedio;
- cuánto gana aproximadamente por producto;
- cómo cambia su rentabilidad cuando cambia el costo;
- qué precio podría utilizar para conservar aproximadamente su margen.

El MVP no intenta demostrar todas las posibilidades futuras del producto.

---

# 2. Hipótesis que debe validar

> Un pequeño comerciante utilizará regularmente una aplicación de inventario si registrar compras y
> ventas es suficientemente rápido y la aplicación transforma automáticamente esos movimientos en
> información útil sobre stock, costos y rentabilidad.

Por tanto, las prioridades son:

1. velocidad;
2. confiabilidad de los cálculos;
3. facilidad de uso;
4. claridad de la información;
5. persistencia correcta de los movimientos.

Una aplicación con diez gráficos pero incómoda para registrar ventas habrá fracasado el MVP.

---

# 3. Loop obligatorio

El loop mínimo será:

```text
Crear producto
      ↓
Registrar compra
      ↓
Stock aumenta
      ↓
Registrar venta
      ↓
Stock disminuye
      ↓
Consultar stock + costo + ganancia
```

El usuario debe poder repetir este ciclo indefinidamente sin conexión a Internet.

---

# 4. Productos

## Obligatorio

El usuario puede:

- crear;
- consultar;
- editar;
- archivar productos.

Cada producto tendrá inicialmente:

- nombre;
- variante opcional;
- código de barras opcional;
- precio habitual de venta;
- stock mínimo opcional;
- estado activo/archivado.

El stock y costo promedio son valores derivados de los movimientos y no deben depender de que el
usuario los mantenga manualmente.

Al crear un producto, el stock inicial es opcional. Si el usuario indica una cantidad mayor que
cero, también debe aceptar un costo unitario aproximado para esas unidades. Si no desea indicar un
costo, puede crear el producto con stock `0` y registrar después las compras nuevas.

## Variante

En V1 una variante continúa siendo un producto independiente.

Ejemplo:

```text
Camiseta básica / M
Camiseta básica / L
```

`Variante` será un campo descriptivo opcional.

No existirá todavía un sistema de matrices de:

**Producto × talla × color × material.**

---

# 5. Inventario

La aplicación debe mostrar para cada producto:

- stock actual;
- costo promedio actual;
- precio habitual;
- ganancia estimada por unidad;
- margen estimado;
- estado de stock bajo.

Todo debe calcularse automáticamente a partir de los movimientos correspondientes.
Cuando nunca se haya conocido un costo, costo promedio, ganancia y margen se mostrarán como no
disponibles en lugar de asumir cero.

---

# 6. Compras

El usuario podrá registrar una compra indicando:

- producto;
- cantidad;
- costo unitario.

En MVP/V1 cada compra corresponde a un único producto. No contiene líneas ni varios productos.

La aplicación calculará:

- costo total;
- nuevo stock;
- nuevo costo promedio;
- variación del costo;
- nuevo margen estimado.

Ejemplo:

```text
Coca-Cola 500 ml

Cantidad             24
Costo unitario      $0.65

Total              $15.60

[ Registrar compra ]
```

Registrar una compra debe generar automáticamente el movimiento correspondiente.

---

# 7. Costo promedio

El MVP utilizará costo promedio ponderado.

Ejemplo:

```text
Stock anterior:
20 × $10 = $200

Compra:
10 × $12 = $120

Nuevo stock:
30

Valor estimado:
$320

Nuevo costo promedio:
$10.67
```

El usuario no realiza manualmente este cálculo.

Las reglas exactas, precisión decimal y edge cases serán definidos en `BUSINESS_RULES.md`.

---

# 8. Cambios de costo

Después de registrar una compra, si el costo cambia de manera relevante, la aplicación podrá
comunicarlo.

Ejemplo:

```text
El costo aumentó

Antes        $10.00
Ahora        $10.67
Cambio        +6.7%
```

La información debe mostrarse sin bloquear el flujo de compra.

---

# 9. Sugerencia de precio

Si un cambio de costo afecta la rentabilidad del producto, el sistema podrá calcular un precio que
conserve aproximadamente el margen anterior.

Ejemplo:

```text
Tu costo aumentó.

Precio actual              $15.00
Margen anterior             33.3%
Margen aproximado ahora     28.9%

Para mantener un margen similar:

Precio sugerido             $16.00

[ Usar $16.00 ]    [ Mantener $15.00 ]
```

La aplicación nunca cambiará automáticamente el precio habitual.

La decisión pertenece al usuario.

---

# 10. Ventas

Una venta podrá contener uno o varios productos.

El usuario podrá agregar productos mediante:

- búsqueda;
- selección desde productos recientes;
- código de barras.

Cada línea tendrá:

- producto;
- cantidad;
- precio unitario.

El precio habitual se precarga automáticamente.

El usuario puede modificarlo para esa venta.

---

# 11. Venta multiproducto

Ejemplo:

```text
NUEVA VENTA

Coca-Cola 500 ml      ×2       $2.00
Doritos               ×1       $1.25
Agua 1 L              ×3       $2.25

────────────────────────────
6 unidades

TOTAL                         $5.50

[ Registrar venta ]
```

Al confirmar, la aplicación:

- registra la venta;
- genera las salidas correspondientes;
- disminuye stock;
- registra los precios utilizados;
- calcula costo estimado;
- calcula ganancia estimada;
- actualiza las estadísticas.

---

# 12. Código de barras

El MVP incluirá lectura de códigos de barras como mecanismo rápido para localizar productos.

## Alta de producto

El usuario podrá:

- escanear el código;
- introducirlo manualmente;
- no utilizar código.

## Venta

Escanear un código existente agrega el producto a la venta.

Si el mismo código se escanea nuevamente, incrementa su cantidad.

## Compra

El código también puede utilizarse para localizar rápidamente el producto que se está comprando.

## Restricción importante

El MVP NO intentará identificar automáticamente productos mediante catálogos externos.

El código significa únicamente:

> Este código corresponde a este producto dentro de mi inventario.

El escaneo y búsqueda deben funcionar offline para productos ya registrados.

---

# 13. Ajustes de inventario

El usuario debe poder corregir diferencias entre inventario registrado e inventario físico.

Ejemplos:

- producto perdido;
- producto dañado;
- error de conteo;
- consumo interno;
- corrección manual.

Un ajuste debe crear un movimiento.

No debe modificarse silenciosamente el stock.

En un ajuste positivo V1 el usuario elegirá entre `Usar costo actual`, precargado y recomendado, u
`Otro costo`. No existe la opción de costo desconocido y la aplicación no inventará un valor no
aceptado por el usuario.

Ejemplo:

```text
AJUSTAR STOCK

Stock registrado:       15
Stock real:              13

Diferencia:              -2

Motivo:
[ Producto dañado ▼ ]

[ Confirmar ajuste ]
```

---

# 14. Stock negativo

Como principio inicial, una venta que supere el stock disponible debe generar una advertencia.

Ejemplo:

```text
Solo tienes 3 unidades registradas.

Intentas vender 5.

[ Revisar ]    [ Registrar igualmente ]
```

La aplicación no bloqueará la operación únicamente por stock insuficiente.

Los pequeños negocios pueden tener diferencias entre inventario físico y registrado.

Si existe un último costo conocido, la venta utilizará ese costo como snapshot histórico para todas
sus unidades. Si nunca se conoció un costo, la venta podrá registrarse, pero su costo y ganancia
estimada se mostrarán como no disponibles; costo desconocido nunca equivale a cero.

Una compra futura no modificará el costo ni la ganancia de la venta histórica. Cuando una compra se
registra con stock anterior igual o menor que cero, el stock resultante será la suma normal de
cantidades y, si queda inventario disponible, su costo promedio será el costo unitario de la nueva
entrada. Las unidades que cubren el déficit no participan en una fórmula ponderada con stock
negativo.

---

# 15. Historial

Debe existir un historial básico de movimientos.

El usuario podrá distinguir:

- compras;
- ventas;
- ajustes.

Cada movimiento debe conservar como mínimo:

- producto;
- tipo;
- cantidad;
- fecha/hora;
- información monetaria correspondiente.

No se requiere un sistema avanzado de auditoría.

---

# 16. Detalle de producto

La pantalla de producto deberá responder rápidamente:

```text
Coca-Cola 500 ml

Stock
21 unidades

Costo promedio
$0.67

Precio
$1.00

Ganancia estimada / unidad
$0.33

Margen estimado
33%

────────────────────

Hoy
Vendidas            8
Ventas           $8.00
Ganancia est.    $2.64

[ + Venta ] [ + Compra ]

Actividad reciente
...
```

La información exacta podrá ajustarse durante UX.

---

# 17. Dashboard MVP

El dashboard será deliberadamente pequeño.

Debe priorizar:

```text
HOY

Ventas registradas       $257.40
Ganancia estimada         $83.20
Unidades vendidas             73

Stock bajo
4 productos

Más vendido
Coca-Cola · 18 unidades

[ + Venta ]
[ + Compra ]
```

No se requiere una colección de gráficos para el MVP.

---

# 18. Stock mínimo

Cada producto podrá tener opcionalmente un stock mínimo.

Cuando:

```text
stock actual <= stock mínimo
```

el producto aparecerá como stock bajo.

El MVP no necesita predicciones avanzadas para esta funcionalidad.

---

# 19. Estadísticas incluidas

El MVP tendrá estadísticas básicas calculadas a partir de los movimientos.

Como mínimo:

- ventas de hoy;
- unidades vendidas hoy;
- ganancia estimada de hoy;
- producto más vendido;
- productos con stock bajo;
- información básica individual por producto.

---

# 20. Estadísticas NO necesarias para MVP

No son requisitos del MVP:

- comparaciones mensuales avanzadas;
- cohortes;
- gráficos complejos;
- forecasting;
- estacionalidad;
- análisis por hora;
- tendencias semanales avanzadas;
- detección de productos muertos;
- recomendaciones mediante machine learning;
- reportes empresariales.

Pueden incorporarse posteriormente utilizando los movimientos históricos ya almacenados.

---

# 21. Offline-first

Todas las capacidades centrales del MVP deberán funcionar sin Internet:

- productos;
- búsqueda;
- código de barras de productos registrados;
- compras;
- ventas;
- ajustes;
- inventario;
- costos;
- historial;
- estadísticas básicas.

Una pérdida de conexión no debe impedir operar el inventario.

---

# 22. Cuenta de usuario

El funcionamiento local del MVP no requerirá obligatoriamente una cuenta.

El usuario debe poder instalar la aplicación y comenzar a utilizarla.

La autenticación se introducirá cuando sea necesaria para servicios cloud.

---

# 23. Cloud y sincronización

**No forman parte del MVP funcional inicial.**

El modelo de datos y arquitectura sí deberán permitir una evolución razonable hacia sincronización
futura mediante IDs generables offline, `createdAt`, `updatedAt` y relaciones correctas.

Esto significa:

> Preparado para sincronizar ≠ implementar sincronización ahora.

No construiremos un motor de sincronización antes de demostrar que el producto local funciona
correctamente.

El MVP no incluirá entidades ni metadata específica de sincronización.

---

# 24. Free / Pro durante el MVP

El MVP se enfocará inicialmente en validar el producto local.

No es obligatorio implementar completamente la monetización Pro durante la primera etapa funcional.

El producto debe diseñarse para que posteriormente:

**Free = capacidades locales**

y

**Pro = servicios cloud + capacidades avanzadas.**

La implementación de suscripciones puede realizarse cuando el núcleo haya alcanzado suficiente
estabilidad para preparar el lanzamiento comercial.

---

# 25. Cantidades

V1 utilizará cantidades enteras.

Ejemplos válidos:

```text
1
5
24
150
```

No serán válidos inicialmente:

```text
0.5 kg
1.25 L
2.75 m
```

Sin embargo, el modelo de datos deberá evitar decisiones que hagan extremadamente difícil soportar
cantidades fraccionarias posteriormente.

---

# 26. Moneda

El MVP manejará una moneda principal por inventario/negocio.

No habrá conversiones automáticas entre monedas.

Los valores monetarios deberán manejarse con precisión adecuada y nunca depender de operaciones
inseguras de punto flotante.

La representación técnica seguirá la precisión fija definida en `ARCHITECTURE.md`, separando la
precisión interna de la presentación visual.

---

# 27. Imágenes

Las imágenes de productos **no son requisito del MVP funcional**.

Si durante diseño se determina que aportan significativamente a la identificación rápida de
productos, podrán entrar durante Alpha/Beta.

La aplicación debe ser perfectamente utilizable sin imágenes.

Esto evita introducir almacenamiento, compresión, permisos y sincronización de archivos demasiado
pronto.

---

# 28. Búsqueda

El usuario debe poder encontrar rápidamente un producto mediante:

- nombre;
- variante;
- código.

La búsqueda debe funcionar localmente.

---

# 29. Eliminación de información

Los movimientos históricos no deberían desaparecer silenciosamente.

Productos con historial podrán archivarse en lugar de eliminarse destructivamente.

Las reglas de corrección, reversión y eliminación serán definidas en `BUSINESS_RULES.md`.

---

# 30. Funcionalidades explícitamente fuera del MVP

El MVP NO incluye:

- facturación electrónica;
- generación de facturas fiscales;
- contabilidad;
- impuestos avanzados;
- CRM;
- clientes;
- proveedores avanzados;
- cuentas por cobrar;
- cuentas por pagar;
- nómina;
- empleados;
- permisos;
- sucursales;
- múltiples bodegas;
- transferencias entre bodegas;
- POS completo;
- caja registradora;
- apertura/cierre de caja;
- procesamiento de pagos;
- integración bancaria;
- ecommerce;
- tienda online;
- delivery;
- fabricación;
- recetas;
- materias primas;
- listas de materiales;
- lotes;
- números de serie;
- fechas de caducidad;
- descuentos/promociones complejas;
- programa de fidelización;
- impresión fiscal;
- impresoras de tickets;
- catálogos externos de códigos de barras;
- IA generativa;
- forecasting avanzado.

---

# 31. Features deliberadamente postergadas

Son interesantes, pero no necesarias para demostrar el valor principal:

### Agotamiento estimado

> “A este ritmo quedan aproximadamente 3 días de stock.”

### Producto sin movimiento

> “Este producto lleva 24 días sin venderse.”

### Tendencias

> “Los viernes normalmente vendes más Coca-Cola.”

### Historial avanzado

Comparaciones de semanas, meses y períodos personalizados.

### Imágenes cloud

Asociación y sincronización de fotografías.

### Exportaciones

Excel, CSV, PDF u otros formatos.

### Web

Administración del inventario desde navegador.

### Multi-device

Sincronización entre teléfonos, tablets y web.

Estas funcionalidades podrán convertirse posteriormente en diferenciadores Pro.

---

# 32. Rendimiento percibido

Las acciones cotidianas deben sentirse inmediatas.

Especialmente:

- abrir nueva venta;
- buscar producto;
- escanear código;
- agregar producto;
- confirmar venta;
- abrir nueva compra.

Objetivo UX:

> Una venta sencilla de un producto existente debería poder registrarse aproximadamente en 5–10
> segundos.

Cuando se utiliza código de barras, debemos intentar reducirla todavía más.

---

# 33. Confiabilidad

El MVP no puede considerarse terminado si existe riesgo razonable de perder movimientos o producir
cálculos incorrectos.

En este producto:

**exactitud > features.**

Errores en:

- stock;
- costo promedio;
- totales;
- historial;
- ganancia estimada;

son errores críticos.

---

# 34. Testing mínimo obligatorio

Antes de considerar terminado el MVP deberán existir pruebas automatizadas para las reglas críticas.

Especialmente:

- creación de movimientos;
- incremento de stock;
- decremento de stock;
- ajustes;
- costo promedio;
- ventas multiproducto;
- ganancia estimada;
- margen;
- sugerencia de precio;
- stock insuficiente;
- reversión/corrección de movimientos;
- venta con stock insuficiente usando el último costo conocido;
- venta sin ningún costo conocido;
- compra después de stock cero o negativo sin ponderar stock no disponible.

Las reglas matemáticas importantes no deberán depender únicamente de pruebas manuales de interfaz.

---

# 35. Criterios de finalización del MVP

El MVP se considerará funcionalmente terminado cuando un usuario pueda:

1. instalar la aplicación;
2. utilizarla sin crear una cuenta;
3. utilizarla sin Internet;
4. crear productos;
5. opcionalmente asignarles códigos de barras;
6. encontrar productos rápidamente;
7. registrar compras;
8. registrar ventas de uno o varios productos;
9. escanear productos durante compras y ventas;
10. realizar ajustes de inventario;
11. consultar stock correcto;
12. consultar costo promedio correcto;
13. consultar precio habitual;
14. consultar margen y ganancia estimada;
15. recibir una sugerencia de precio después de cambios relevantes de costo;
16. consultar historial básico;
17. identificar productos con stock bajo;
18. consultar estadísticas básicas del día;
19. cerrar y volver a abrir la aplicación sin perder información;
20. completar estas operaciones sin conexión a Internet;
21. crear una copia de seguridad local;
22. restaurar una copia de seguridad local;
23. conservar correctamente, después de restaurar, productos, movimientos, ventas, compras y
    ajustes.

Además:

- las reglas críticas deben tener tests;
- no deben existir errores conocidos que puedan corromper inventario;
- los flujos principales deben ser suficientemente rápidos para uso cotidiano.

---

# 36. Lo que NO define que el MVP esté terminado

El MVP no necesita:

- tener todas las pantallas imaginadas;
- tener sincronización;
- tener aplicación web;
- tener IA;
- tener decenas de estadísticas;
- tener diseño visual perfecto;
- soportar todos los tipos de negocio;
- competir feature por feature con sistemas establecidos.

El MVP está terminado cuando el núcleo es:

**simple + rápido + correcto + útil.**

---

# 37. Métrica inicial de éxito

Durante Alpha/Beta deberemos observar principalmente si los usuarios realmente registran
movimientos.

Las métricas más importantes serán posteriormente:

- usuarios que crean su primer producto;
- usuarios que registran su primera compra;
- usuarios que registran su primera venta;
- usuarios que regresan;
- movimientos registrados por usuario activo;
- tiempo necesario para registrar una venta;
- porcentaje de usuarios que continúa utilizando la aplicación después de varios días/semanas.

Estas métricas se definirán formalmente antes de instrumentar analytics.

---

# 38. Principio de control de scope

Durante el desarrollo aparecerán ideas atractivas.

Cada una deberá clasificarse como:

**MVP / Alpha-Beta / Post lanzamiento / Pro / No hacer**

Una nueva funcionalidad solo podrá incorporarse al MVP si:

1. bloquea el loop principal;
2. evita pérdida o corrupción de información;
3. resuelve un problema crítico descubierto durante pruebas;
4. mejora sustancialmente la velocidad de las operaciones principales.

“Sería chévere tenerlo” no es criterio suficiente para ampliar el MVP.
