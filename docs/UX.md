# UX.md

**Estado:** Baseline v1.0 **Producto:** Nombre por definir **Documentos relacionados:** `PRODUCT.md`,
`MVP.md`, `BUSINESS_RULES.md`

---

# 1. Objetivo UX

La experiencia debe permitir controlar inventario sin que el usuario sienta que está utilizando un
sistema administrativo complejo.

Las operaciones más frecuentes deben ser:

**Vendí esto.**

**Compré esto.**

La aplicación se encarga del resto.

El usuario no debería navegar por múltiples módulos para completar una operación cotidiana.

---

# 2. Principio principal

La cantidad de pasos debe ser proporcional a la frecuencia de la acción.

Por tanto:

### Muy frecuentes

- registrar venta;
- registrar compra;
- escanear producto;
- buscar producto.

Deben ser extremadamente rápidas.

### Frecuentes

- consultar stock;
- consultar producto;
- revisar stock bajo.

Deben ser accesibles inmediatamente.

### Poco frecuentes

- crear producto;
- ajustar inventario;
- archivar producto;
- cambiar configuraciones.

Pueden requerir algunos pasos adicionales.

---

# 3. Objetivos de velocidad

## Venta de producto conocido

Objetivo:

**5–10 segundos o menos.**

Con código de barras debería ser posible reducirlo aún más.

Ejemplo:

```text
Abrir Venta
↓
Escanear
↓
Confirmar
```

---

## Compra de producto conocido

Objetivo:

```text
Abrir Compra
↓
Escanear/buscar
↓
Cantidad
↓
Costo
↓
Confirmar
```

---

# 4. Navegación principal

La navegación móvil inicial tendrá pocas secciones.

Propuesta:

```text
Inicio
Productos
Historial
Más
```

No habrá secciones independientes para:

- compras;
- ventas;
- inventario;
- costos;
- estadísticas;
- reportes.

Eso convertiría la aplicación en un sistema modular tradicional.

Compras y ventas son **acciones**, no destinos permanentes de navegación.

---

# 5. Acciones principales

Desde Inicio siempre deben estar muy visibles:

```text
[ + Venta ]

[ + Compra ]
```

`Venta` tendrá mayor prominencia visual porque previsiblemente será la acción más frecuente.

También podrá existir un botón global `+` o acceso equivalente si durante prototipado resulta más
eficiente.

No debe introducirse una navegación experimental únicamente por estética.

---

# 6. Dashboard / Inicio

La pantalla inicial debe responder:

> ¿Qué está pasando hoy y qué debería revisar?

Ejemplo conceptual:

```text
Buenos días

HOY

Ventas registradas
$257.40

Ganancia estimada
$83.20

Unidades vendidas
73

[ + Venta ]     [ + Compra ]

────────────────────

STOCK BAJO

Coca-Cola
4 unidades

Agua 1 L
2 unidades

Ver todos →

────────────────────

MÁS VENDIDO HOY

Coca-Cola
18 unidades
```

No habrá gráficos obligatorios.

Si alguna venta del período tiene costo desconocido, `Ganancia estimada` mostrará `No disponible`
con una explicación breve. La UI nunca sumará esos costos como cero ni presentará un total parcial
como si estuviera completo.

---

# 7. Qué NO debe tener Inicio

Evitar:

- seis gráficos simultáneos;
- tablas;
- KPIs empresariales;
- widgets configurables;
- comparaciones innecesarias;
- porcentajes sin contexto;
- información histórica extensa.

Inicio no es un dashboard de Business Intelligence.

---

# 8. Nueva venta

La venta se diseñará como una pequeña cesta.

Ejemplo:

```text
Nueva venta

[ 🔍 Buscar o escanear producto ]

Coca-Cola 500ml

−    2    +

$1.00 c/u

Subtotal
$2.00

────────────────

TOTAL
$2.00

[ Registrar venta ]
```

---

# 9. Venta multiproducto

Después de agregar un producto, el usuario puede:

- agregar otro;
- escanear otro;
- aumentar/disminuir cantidades;
- modificar precio;
- eliminar una línea.

Ejemplo:

```text
Nueva venta

Coca-Cola       ×2     $2.00
Doritos         ×1     $1.25
Agua            ×3     $2.25

+ Agregar producto

────────────────────
6 unidades

TOTAL                 $5.50

[ Registrar venta ]
```

---

# 10. Escaneo durante venta

Debe existir un acceso especialmente visible:

```text
[ Escanear código ]
```

Al reconocer un producto:

```text
Coca-Cola agregada
```

y el escáner puede continuar activo para registrar otro producto.

Si se escanea nuevamente el mismo código:

```text
Coca-Cola ×2
```

No creará dos líneas separadas.

---

# 11. Modo de escaneo rápido

Cuando se utilice el escáner dentro de una venta:

```text
[ Cámara ]

Coca-Cola       ×2
Doritos         ×1
Agua            ×1

4 unidades
$4.00

[ Terminar ]
```

La interfaz no debe cerrar necesariamente la cámara después de cada producto.

Esto permitiría:

> scan → scan → scan → confirmar.

---

# 12. Código desconocido

Si el código no existe:

```text
Producto no encontrado

Este código todavía no está
en tu inventario.

[ Crear producto ]
[ Seguir escaneando ]
```

Si se crea el producto desde aquí, el código detectado debe quedar precargado.

El usuario no debería tener que escanearlo nuevamente.

---

# 13. Precio durante venta

El precio habitual aparecerá automáticamente.

Ejemplo:

```text
Coca-Cola

Cantidad
2

Precio habitual
$1.00
```

El usuario no necesita tocar el precio para una venta normal.

Si quiere cambiarlo:

```text
Precio
[ $0.90 ]
```

El precio modificado afectará únicamente esa venta.

---

# 14. Stock insuficiente

Si intenta vender más de lo registrado:

```text
⚠ Stock registrado insuficiente

Tienes: 3
Quieres vender: 5

Puedes continuar, pero el producto
quedará en -2 unidades.

[ Revisar cantidad ]

[ Registrar igualmente ]
```

La advertencia debe ser clara pero no alarmista.

Si existe un último costo conocido, la confirmación mostrará la ganancia estimada usando ese
costo. Si nunca se conoció un costo, mostrará:

```text
Ganancia estimada
No disponible

Todavía no tenemos un costo para este producto.
```

Una compra posterior no cambiará el resultado histórico mostrado para esa venta.

---

# 15. Confirmación de venta

Después de registrar correctamente:

```text
✓ Venta registrada

$5.50

Ganancia estimada
$1.82
```

La confirmación debe desaparecer rápidamente o permitir:

```text
[ Nueva venta ]
```

No necesitamos una pantalla ceremonial después de cada operación.

---

# 16. Deshacer inmediatamente

Después de registrar una venta sería útil ofrecer brevemente:

```text
Venta registrada     Deshacer
```

Esto puede reducir mucho la fricción cuando el usuario comete un error inmediatamente.

Internamente continuará respetándose la regla de reversión.

La UI puede ocultar esa complejidad.

---

# 17. Nueva compra

Ejemplo:

```text
Nueva compra

Producto
[ Coca-Cola 500 ml ]

Cantidad
[ 24 ]

Costo unitario
[ $0.65 ]

────────────────

Total
$15.60

[ Registrar compra ]
```

El total se calcula automáticamente.

---

# 18. Escaneo durante compra

El usuario podrá:

```text
Nueva compra
↓
Escanear
↓
Producto encontrado
↓
Cantidad
↓
Costo
```

No necesita navegar hasta el producto primero.

---

# 19. Resultado de una compra

Cuando una compra modifica el costo:

```text
✓ Compra registrada

24 unidades agregadas

Stock
18 → 42

Costo promedio
$0.60 → $0.63
```

Si existe impacto importante:

```text
Tu costo aumentó.

Tu margen aproximado bajó:

Antes        40%
Ahora        37%

Manteniendo un margen similar:

Precio sugerido
$1.05
```

Acciones:

```text
[ Usar $1.05 ]

[ Mantener $1.00 ]
```

Si la compra se registra con stock anterior cero o negativo y deja unidades disponibles, el
resultado mostrará que el costo promedio de esas unidades es el costo de la nueva entrada. Por
ejemplo, stock `-2` más `10 × $12` mostrará stock `8` y costo promedio `$12`, sin sugerir que se
recalcularon ventas anteriores.

---

# 20. Recomendación no intrusiva

La recomendación de precio NO debe impedir completar la compra.

Primero:

```text
✓ Compra registrada
```

Después:

```text
Tu costo cambió...
```

Una recomendación nunca debe convertirse en un modal obligatorio que interrumpa constantemente al
usuario.

---

# 21. Productos

La pantalla de productos debe priorizar búsqueda y stock.

Ejemplo:

```text
Productos

[ Buscar producto... ]      [ Escanear ]

Stock bajo (4)

Coca-Cola
4 unidades                 $1.00

Doritos
3 unidades                 $1.25

────────────────────

Todos

Agua 1 L
24 unidades                $0.75

Camiseta negra · M
7 unidades                $18.00
```

---

# 22. Búsqueda

Debe comenzar a mostrar resultados mientras el usuario escribe.

Buscará por:

- nombre;
- variante;
- código.

No requerirá pulsar “Buscar”.

---

# 23. Alta de producto

Crear un producto debe ser corto.

Pantalla inicial:

```text
Nuevo producto

Nombre *
[ Coca-Cola 500 ml ]

Variante
[ Opcional ]

Código
[ Escanear ] [ Escribir ]

Precio habitual
[ $1.00 ]

Stock mínimo
[ Opcional ]

[ Crear producto ]
```

No pediremos inicialmente:

- descripción extensa;
- categoría obligatoria;
- marca obligatoria;
- proveedor;
- impuestos;
- SKU obligatorio;
- peso;
- dimensiones;
- fotografías obligatorias;
- múltiples precios;
- atributos empresariales.

---

# 24. Producto con inventario existente

Después de crear:

```text
Coca-Cola creada

¿Ya tienes unidades de este producto?

[ Sí, agregar stock inicial ]

[ Todavía no ]
```

Si responde sí:

```text
¿Cuántas tienes?

[ 20 ]

Costo aproximado por unidad

[ $0.60 ]

Lo usamos para estimar tu ganancia.

[ Agregar stock inicial ]
```

El costo aproximado es obligatorio cuando la cantidad inicial es mayor que cero. No necesita ser el
valor histórico exacto. Si el usuario no desea proporcionarlo, puede elegir `Todavía no`, crear el
producto con stock `0` y registrar posteriormente las compras nuevas.

---

# 25. Detalle de producto

Debe responder primero las preguntas importantes.

Ejemplo:

```text
Coca-Cola 500 ml

21 unidades
EN STOCK

Precio
$1.00

Costo promedio
$0.67

Ganas aprox.
$0.33 / unidad

Margen aprox.
33%

[ + Venta ]
[ + Compra ]

────────────────────

HOY

8 vendidas
$8.00 en ventas
$2.64 ganancia est.

────────────────────

Actividad reciente

Venta
-3 unidades
Hoy · 10:42

Compra
+24 unidades · $0.65
Ayer · 16:20

Ver historial →
```

---

# 26. Jerarquía de información del producto

Primero:

1. stock;
2. precio;
3. costo;
4. ganancia estimada;
5. margen.

Después:

6. actividad de hoy;
7. historial;
8. información secundaria.

No mostrar todo simultáneamente.

---

# 27. Stock bajo

Si:

```text
stock <= stock mínimo
```

mostrar:

```text
⚠ Stock bajo

4 unidades
```

No utilizar mensajes agresivos como:

> ALERTA CRÍTICA.

Para un pequeño negocio una Coca-Cola con cuatro unidades no es una emergencia nuclear.

---

# 28. Stock negativo

Visualmente:

```text
-2 unidades

Revisar inventario
```

Al abrir:

```text
Has registrado más salidas que
unidades disponibles.

[ Ajustar inventario ]

[ Registrar compra ]
```

---

# 29. Ajuste de inventario

El usuario no debería pensar en:

> “Crear movimiento ADJUSTMENT +2”.

Debe pensar:

> “Tengo 12 realmente.”

Ejemplo:

```text
Ajustar inventario

Registrado
10

¿Cuántas tienes realmente?

[ 12 ]

Diferencia
+2
```

---

# 30. Ajuste positivo

Si aparecen unidades adicionales:

```text
Encontramos 2 unidades adicionales.

¿Qué costo tenían aproximadamente?
```

Opciones:

```text
● Usar costo actual
  $0.65 por unidad
  Recomendado

○ Otro costo
```

La opción precargada será utilizar el costo actual conocido.

El usuario conserva la posibilidad de indicar otro costo. Si todavía no existe un costo actual,
deberá indicar `Otro costo`. La aplicación nunca inventará un costo que el usuario no haya aceptado.

---

# 31. Ajuste negativo

Ejemplo:

```text
Faltan 2 unidades.

Motivo

[ Conteo incorrecto ▼ ]
```

Opciones iniciales:

- conteo incorrecto;
- dañado;
- perdido;
- consumo interno;
- otro.

La aplicación utilizará el costo promedio vigente para estimar el valor de la salida.

---

# 32. Historial

Será una única cronología sencilla.

Ejemplo:

```text
Historial

Hoy

VENTA
$5.50
6 unidades
10:42

COMPRA
Coca-Cola
+24 · $0.65 c/u
09:15

AJUSTE
Doritos
-2
Producto dañado
08:32
```

Se podrá filtrar posteriormente por:

- ventas;
- compras;
- ajustes.

Los filtros avanzados no son prioritarios.

---

# 33. Detalle de venta

Ejemplo:

```text
Venta

Hoy · 10:42

Coca-Cola       ×2      $2.00
Doritos         ×1      $1.25
Agua            ×3      $2.25

──────────────────

Total                    $5.50

Costo estimado            $3.68

Ganancia estimada         $1.82

[ Anular venta ]
```

---

# 34. Detalle de compra

Ejemplo:

```text
Compra

Coca-Cola

24 unidades
$0.65 c/u

Total
$15.60

Costo promedio
$0.60 → $0.63
```

---

# 35. Configuración / Más

Debe contener únicamente funciones poco frecuentes.

Ejemplos:

```text
Más

Moneda
USD

Datos y respaldo
Local

Apariencia

Acerca de
```

`Datos y respaldo` incluirá en Free:

```text
Crear copia de seguridad
Restaurar copia de seguridad
```

La restauración deberá explicar qué copia se seleccionó y pedir confirmación antes de reemplazar el
estado local. Backup y restauración de seguridad no se presentarán como exportaciones comerciales.

Posteriormente:

```text
Sincronización
Cuenta
Pro
Exportar
```

---

# 36. Onboarding

El onboarding debe ser extremadamente corto.

No queremos:

```text
Slide 1/7
Slide 2/7
Slide 3/7
...
```

Propuesta:

```text
Controla tu stock sin complicaciones.

Registra lo que compras.
Registra lo que vendes.
Nosotros hacemos los cálculos.

[ Empezar ]
```

Después:

```text
¿Con qué moneda trabajas?

USD $
```

Y entrar directamente a la aplicación.

---

# 37. Primer uso vacío

Inicio sin productos:

```text
Tu inventario está vacío

Agrega tu primer producto
para comenzar.

[ + Crear producto ]
```

Debajo podríamos explicar brevemente:

```text
Después podrás registrar
compras y ventas.
```

No debemos mostrar un dashboard lleno de ceros.

---

# 38. Creación progresiva

No pedir toda la configuración al crear un producto.

Ejemplo:

Primero:

```text
Nombre
Precio
```

Después podremos añadir:

```text
Código
Stock mínimo
Variante
```

cuando sean necesarios.

La UI puede mostrar campos opcionales sin convertirlos en requisitos.

---

# 39. Progressive disclosure

Las opciones avanzadas solo aparecen cuando son relevantes.

Ejemplo:

Venta normal:

```text
Coca-Cola
×1
$1.00

[ Registrar ]
```

No mostrar:

```text
Costo snapshot
Margen calculado
Markup
Método de valuación
Tipo de movimiento
```

Esos conceptos pertenecen al sistema, no al trabajo cotidiano del usuario.

---

# 40. Lenguaje

Preferir:

**Compraste 24 unidades**

sobre:

**Movimiento de entrada procesado**

Preferir:

**Ganas aproximadamente $0.33 por unidad**

sobre:

**Margen bruto unitario: $0.33**

Preferir:

**Tu costo aumentó**

sobre:

**Variación positiva del costo promedio ponderado**

---

# 41. Información técnica bajo demanda

Para usuarios que quieran entender los cálculos puede existir:

```text
¿Cómo se calcula?
```

Y explicar:

> Utilizamos el costo promedio de las unidades que tienes registradas.

No debe mostrarse permanentemente.

---

# 42. Errores

Los errores deben indicar:

1. qué pasó;
2. qué puede hacer el usuario.

Malo:

```text
ERROR 400
Invalid inventory state
```

Bueno:

```text
No encontramos este producto.

Puedes buscarlo por nombre
o crear uno nuevo.
```

---

# 43. Confirmaciones

Evitar confirmaciones para acciones fácilmente reversibles.

No preguntar:

> ¿ESTÁS SEGURO?

después de cada venta.

Sí pedir confirmación para operaciones destructivas o difíciles de revertir.

---

# 44. Gestos rápidos futuros

Durante Alpha/Beta podremos probar:

- swipe para vender;
- mantener pulsado para acciones;
- productos recientes;
- favoritos.

No son requisitos antes de comprobar que realmente reducen fricción.

---

# 45. Productos recientes

En Nueva Venta y Nueva Compra puede mostrarse:

```text
Recientes

Coca-Cola
Agua
Doritos
```

Esto puede ser más rápido que buscar para usuarios sin códigos de barras.

Debe evaluarse durante prototipado.

---

# 46. Favoritos

No se implementarán inicialmente.

Si los recientes no son suficientes, podremos evaluar favoritos después.

No necesitamos ambas cosas desde el principio.

---

# 47. Accesibilidad básica

La UI no debe depender exclusivamente del color para comunicar:

- stock bajo;
- pérdidas;
- aumentos;
- reducciones.

Los controles deben tener áreas táctiles adecuadas.

Los textos importantes deben permanecer legibles con configuraciones razonables de tamaño de fuente.

---

# 48. Estados fundamentales

Cada pantalla deberá contemplar:

- cargando;
- vacío;
- con información;
- error;
- sin resultados.

Aunque la aplicación sea local, estos estados deben diseñarse explícitamente.

---

# 49. Prioridades de prototipado

Antes de diseñar todas las pantallas debemos probar primero:

### Prototipo A

Venta manual.

### Prototipo B

Venta mediante código de barras.

### Prototipo C

Compra.

### Prototipo D

Creación de producto.

### Prototipo E

Detalle de producto.

### Prototipo F

Ajuste de inventario.

El dashboard completo viene después.

---

# 50. Criterios UX de éxito

La experiencia será considerada suficientemente buena para MVP cuando:

- crear un producto resulte comprensible sin instrucciones;
- vender un producto conocido tarde aproximadamente 5–10 segundos;
- escanear varias unidades sea rápido;
- registrar una compra no requiera cálculos manuales;
- costo y margen puedan comprenderse sin conocimiento financiero;
- corregir inventario sea comprensible;
- el usuario pueda operar sin conocer conceptos técnicos del sistema;
- las operaciones frecuentes requieran muy pocos pasos.

---

# 51. Regla final

Cuando existan dos alternativas de diseño, preferiremos aquella que reduzca:

- pasos;
- decisiones innecesarias;
- campos;
- navegación;
- conocimiento requerido.

Siempre que no sacrifique:

- exactitud;
- claridad;
- trazabilidad.

La simplicidad del producto no significa ocultar problemas.

Significa resolver la complejidad por el usuario.
