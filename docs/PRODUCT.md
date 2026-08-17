# PRODUCT.md

**Estado:** Baseline v1.0 **Producto:** Nombre por definir **Objetivo:** Definir qué problema resuelve
el producto, para quién se construye y cuáles son sus fronteras.

---

# 1. Visión del producto

Crear una aplicación de inventario y control de stock extremadamente sencilla para pequeños negocios
y emprendedores que necesitan entender qué tienen, qué compraron, qué vendieron y cuánto están
ganando aproximadamente con sus productos.

La aplicación debe eliminar la necesidad de realizar manualmente cálculos frecuentes relacionados
con inventario, costos y precios.

El producto se construirá alrededor de dos acciones principales:

**“Compré esto.”**

**“Vendí esto.”**

A partir de ellas, la aplicación debe calcular y actualizar automáticamente la información derivada.

El objetivo no es administrar toda la empresa.

El objetivo es que controlar productos, stock, costos y precios deje de ser complicado.

---

# 2. Problema

Muchos pequeños comerciantes administran su inventario mediante una combinación de:

- memoria;
- libretas;
- notas del teléfono;
- hojas de cálculo;
- mensajes;
- sistemas de inventario demasiado complejos.

Con frecuencia pueden saber aproximadamente cuánto venden, pero no necesariamente:

- cuánto stock tienen realmente;
- cuánto les costó el inventario actual;
- cómo cambió el costo de un producto;
- cuánto están ganando aproximadamente por unidad;
- si su margen disminuyó;
- cuánto deberían cobrar después de un aumento de costo;
- qué productos necesitan reposición.

Las alternativas existentes frecuentemente presentan uno de dos problemas:

1. son demasiado manuales y requieren que el usuario haga los cálculos;
2. forman parte de sistemas administrativos, contables o POS mucho más complejos de lo que este
   usuario necesita.

---

# 3. Usuario objetivo

## Usuario primario

Propietario u operador de un negocio pequeño que compra productos y posteriormente los vende.

Normalmente:

- administra personalmente el negocio;
- tiene pocos empleados o ninguno;
- no cuenta con un departamento administrativo;
- compra inventario periódicamente;
- vende productos físicos;
- necesita controlar stock;
- no quiere aprender un ERP;
- actualmente utiliza memoria, papel, notas, Excel u otra aplicación básica.

Ejemplos:

- tienda pequeña;
- vendedor online;
- tienda de maquillaje;
- comerciante de ropa;
- vendedor de repuestos;
- negocio de accesorios;
- pequeño distribuidor;
- emprendimiento que compra y revende productos.

## Usuarios secundarios

El producto también puede resultar útil para pequeños comercios con necesidades similares, siempre
que su inventario pueda representarse principalmente mediante productos, entradas y salidas.

## Usuarios que NO son objetivo inicial

El MVP no se diseñará específicamente para negocios que requieran:

- fabricación;
- recetas o transformación de ingredientes;
- listas de materiales;
- cálculo de mano de obra;
- producción;
- contabilidad formal;
- facturación fiscal;
- múltiples bodegas complejas;
- múltiples sucursales;
- gestión avanzada de empleados;
- trazabilidad por lotes o números de serie;
- operaciones de un ERP.

Estos casos podrían evaluarse posteriormente, pero no deben condicionar el diseño inicial.

---

# 4. Job to be Done principal

Cuando compro y vendo productos en mi negocio, quiero registrar esos movimientos rápidamente para
saber cuánto me queda y si sigo vendiendo a un precio rentable, sin tener que llevar hojas de
cálculo ni hacer cálculos manuales.

---

# 5. Preguntas que el producto debe responder

En pocos segundos, el usuario debería poder responder:

1. ¿Cuánto stock tengo?
2. ¿Qué compré?
3. ¿Cuánto me costó?
4. ¿Qué vendí?
5. ¿Cuánto estoy ganando aproximadamente por este producto?
6. ¿Mi margen mejoró o empeoró?
7. Si cambió mi costo, ¿qué precio debería utilizar para conservar aproximadamente mi margen?
8. ¿Qué productos tienen poco stock?
9. ¿Cómo se está vendiendo este producto?

Si una funcionalidad no contribuye claramente a responder alguna de estas preguntas, debe
cuestionarse antes de entrar al producto.

---

# 6. Propuesta de valor

Una herramienta de inventario que no solo registra cantidades, sino que transforma automáticamente
compras y ventas en información útil para tomar decisiones.

El usuario registra movimientos simples.

La aplicación se encarga de:

- actualizar stock;
- calcular costo promedio;
- estimar ganancia;
- calcular margen;
- detectar cambios de costo;
- sugerir precios;
- mostrar tendencias básicas;
- advertir sobre situaciones relevantes.

Conceptualmente:

> Tu registras lo que compras y vendes. La aplicación hace el resto.

El posicionamiento deberá priorizar simplicidad y claridad sobre cantidad de funcionalidades.

Posibles direcciones de posicionamiento:

**“Tu inventario sin Excel y sin complicaciones.”**

o

**“Know your stock. Know your profit.”**

El nombre y slogan definitivos se decidirán posteriormente.

---

# 7. Diferenciación principal

El producto no intentará diferenciarse únicamente por permitir registrar inventario.

Registrar inventario es una funcionalidad básica que ofrecen muchas aplicaciones.

La diferenciación se centrará en combinar:

**inventario + evolución del costo + precio + rentabilidad estimada**

de una forma comprensible para una persona que no desea utilizar terminología financiera avanzada.

Un ejemplo central de la experiencia es:

> “Tu costo aumentó 6%. Con tu precio actual, tu margen bajó de aproximadamente 33% a 29%. Para
> mantener un margen similar, podrías vender a $X.”

El usuario conserva siempre la decisión final.

La aplicación informa y recomienda; no obliga.

---

# 8. Loop principal del producto

El ciclo principal será:

**Crear producto → Registrar compra → Registrar venta → Consultar resultado**

Después de crear un producto, la mayoría de las interacciones deberían reducirse a:

### Compré

Seleccionar producto.

Indicar:

- cantidad;
- costo.

Confirmar.

### Vendí

Seleccionar producto.

Indicar:

- cantidad;
- precio, únicamente si es diferente al habitual.

Confirmar.

La aplicación procesa automáticamente las consecuencias del movimiento.

---

# 9. Principios del producto

## 9.1 Simplicidad antes que funcionalidades

Agregar una funcionalidad solo porque otros sistemas de inventario la poseen no es motivo
suficiente.

Cada nueva función debe justificar el aumento de complejidad.

---

## 9.2 Registrar un movimiento debe ser extremadamente rápido

Una aplicación de inventario deja de funcionar como producto cotidiano si registrar una venta
resulta molesto.

Las acciones frecuentes deben requerir la menor cantidad posible de pasos.

El precio habitual, configuraciones anteriores y valores razonables deben reutilizarse
automáticamente cuando sea apropiado.

---

## 9.3 El sistema calcula; el usuario decide

El usuario no debería calcular manualmente:

- nuevo costo promedio;
- margen;
- ganancia estimada;
- impacto de un cambio de costo;
- precio necesario para mantener un margen.

La aplicación debe calcularlo automáticamente.

Sin embargo, nunca debe cambiar precios o datos comerciales importantes sin decisión explícita del
usuario.

---

## 9.4 Lenguaje humano antes que lenguaje financiero

Internamente pueden existir conceptos como:

- weighted average cost;
- gross margin;
- markup;
- inventory valuation.

La interfaz no debe asumir que el usuario conoce esos términos.

Debe preferir frases como:

- “Costo promedio”
- “Ganas aproximadamente $0.35 por unidad”
- “Tu margen es aproximadamente 35%”
- “Tu costo subió”
- “Precio sugerido”

Los conceptos técnicos podrán explicarse cuando sea necesario, pero no deben dominar la experiencia.

---

## 9.5 No presentar estimaciones como contabilidad real

Cuando la aplicación muestre “ganancia”, se referirá inicialmente a una estimación basada en:

**precio de venta − costo estimado del producto vendido**

No representa utilidad neta del negocio.

No contempla automáticamente:

- alquiler;
- salarios;
- impuestos;
- servicios;
- transporte;
- marketing;
- comisiones externas;
- otros gastos operativos.

La interfaz debe dejar esta diferencia suficientemente clara sin convertir cada pantalla en un aviso
legal.

---

## 9.6 Offline first

La capacidad principal de la aplicación no debe depender de Internet.

El usuario debe poder:

- crear productos;
- registrar compras;
- registrar ventas;
- consultar inventario;
- revisar información básica;

sin conexión.

La base local constituye la fuente inmediata de trabajo del dispositivo.

---

## 9.7 Cuenta opcional

Un usuario Free no necesitará crear obligatoriamente una cuenta para comenzar a utilizar el
producto.

La creación de cuenta tendrá sentido principalmente cuando se requieran servicios asociados a
sincronización, backup cloud automático o múltiples dispositivos.

---

## 9.8 Free debe ser realmente útil

La versión gratuita no debe estar artificialmente inutilizada para provocar una compra.

El negocio puede administrarse localmente con Free.

La monetización se basará principalmente en servicios que generan valor adicional o infraestructura:

- sincronización;
- backup cloud automático;
- múltiples dispositivos;
- web;
- análisis avanzado;
- exportaciones;
- servicios cloud.

---

## 9.9 No convertirse accidentalmente en un ERP

Cada feature deberá evaluarse preguntando:

> ¿Ayuda directamente a controlar productos, movimientos, costos, precios o información derivada de
> ellos?

Si la respuesta es no, probablemente se encuentra fuera del producto inicial.

---

# 10. Casos de uso principales

## UC-01 — Crear un producto

El usuario registra un producto que desea controlar.

Debe requerirse la mínima información posible para comenzar.

---

## UC-02 — Registrar una compra

El usuario indica que recibió nuevas unidades de un producto y cuánto le costaron. En MVP/V1 cada
compra corresponde a un único producto; no existe compra multiproducto.

El sistema:

- incrementa stock;
- registra el movimiento;
- actualiza el costo promedio;
- detecta cambios relevantes de costo;
- recalcula rentabilidad estimada;
- puede generar una sugerencia de precio.

---

## UC-03 — Registrar una venta

El usuario indica qué producto vendió y cuántas unidades.

El sistema:

- disminuye stock;
- registra el movimiento;
- registra el valor de venta;
- estima el costo asociado cuando existe información de costo;
- estima la ganancia o la muestra como no disponible cuando nunca se conoció un costo;
- actualiza estadísticas.

---

## UC-04 — Consultar un producto

El usuario puede conocer rápidamente:

- stock;
- costo promedio;
- precio habitual;
- ganancia estimada por unidad;
- margen aproximado;
- actividad reciente.

---

## UC-05 — Revisar el negocio hoy

El usuario puede abrir la aplicación y visualizar un resumen reducido con información como:

- ventas registradas;
- ganancia estimada;
- unidades vendidas;
- productos destacados;
- stock bajo.

---

## UC-06 — Detectar un cambio de costo

Después de registrar una compra, el usuario puede conocer cómo afecta el nuevo costo a la
rentabilidad del producto.

---

## UC-07 — Obtener una sugerencia de precio

Cuando el costo cambia, la aplicación puede calcular qué precio permitiría conservar aproximadamente
una rentabilidad equivalente.

El usuario puede:

- aceptar la sugerencia;
- ignorarla;
- establecer otro precio.

---

## UC-08 — Corregir inventario

El usuario puede registrar un ajuste cuando el stock real no coincide con el registrado.

La corrección debe conservar un historial que permita entender por qué cambió el inventario.

---

# 11. Información principal por producto

El producto podrá presentar progresivamente información como:

- stock actual;
- costo promedio;
- precio de venta actual;
- ganancia estimada por unidad;
- margen estimado;
- unidades vendidas;
- ventas registradas;
- ganancia estimada;
- historial de compras;
- historial de ventas;
- cambios de costo.

Las métricas históricas más avanzadas podrán reservarse para etapas posteriores o para Pro.

---

# 12. Dashboard

El dashboard no debe convertirse en un panel empresarial.

Su propósito es responder:

**“¿Cómo está mi negocio ahora mismo?”**

La información prioritaria puede incluir:

### Hoy

- ventas registradas;
- ganancia estimada;
- unidades vendidas;
- producto más vendido;
- productos con stock bajo.

Y dos acciones especialmente visibles:

**+ Venta**

**+ Compra**

Debe priorizarse información accionable sobre visualizaciones decorativas.

---

# 13. Insights

Los insights deben derivarse inicialmente mediante reglas y estadísticas simples.

Ejemplos:

- “El costo de este producto aumentó 8%.”
- “Tu margen disminuyó después de la última compra.”
- “Para conservar aproximadamente tu margen anterior, el precio sería $X.”
- “Quedan pocas unidades.”
- “A este ritmo podrías quedarte sin stock pronto.”
- “Este producto lleva varios días sin venderse.”

La IA generativa no será un requisito del producto inicial.

Primero deben explotarse correctamente los datos estructurados generados por las compras y ventas.

---

# 14. Alcance inicial del producto

El núcleo funcional comprende:

- productos;
- inventario;
- compras;
- ventas/salidas;
- ajustes;
- stock;
- costo;
- costo promedio;
- precio;
- margen estimado;
- ganancia estimada;
- sugerencias de precio;
- stock mínimo;
- historial;
- estadísticas derivadas de movimientos.

---

# 15. Fuera de alcance

El producto inicial NO incluirá:

- ERP;
- contabilidad completa;
- contabilidad fiscal;
- facturación electrónica;
- CRM;
- nómina;
- conciliación bancaria;
- cuentas bancarias;
- procesamiento de pagos;
- ecommerce;
- POS completo;
- proveedores avanzados;
- órdenes de compra complejas;
- múltiples sucursales;
- múltiples bodegas;
- permisos empresariales avanzados;
- recursos humanos;
- fabricación;
- recetas;
- listas de materiales;
- producción.

Estas exclusiones son deliberadas y forman parte de la estrategia del producto.

---

# 16. Variantes y complejidad de productos

El MVP debe evitar introducir un sistema complejo de variantes.

Cuando sea necesario, diferentes combinaciones podrán manejarse inicialmente como productos
independientes.

Ejemplo:

- Camiseta negra / S
- Camiseta negra / M
- Camiseta negra / L

Un sistema avanzado de atributos, matrices de variantes y combinaciones no es requisito inicial.

Esta decisión deberá reevaluarse con usuarios reales.

---

# 17. Modelo comercial conceptual

## Free

El usuario obtiene una aplicación local completamente funcional para controlar su inventario básico.

No se limitará artificialmente el número de productos únicamente como mecanismo de conversión.

## Pro

El usuario paga principalmente por capacidades asociadas a infraestructura, continuidad y análisis
más avanzado.

Ejemplos:

- backup cloud;
- sincronización;
- múltiples dispositivos;
- aplicación web;
- historial avanzado;
- estadísticas avanzadas;
- exportaciones;
- almacenamiento cloud de recursos futuros.

La definición exacta pertenece a `MONETIZATION.md`.

---

# 18. North Star de experiencia

La aplicación deberá optimizar principalmente el siguiente comportamiento:

> Registrar correctamente las compras y ventas con la menor fricción posible.

Sin movimientos registrados, los cálculos, estadísticas e insights pierden valor.

Por tanto, reducir la fricción de registro es más importante que añadir dashboards complejos.

---

# 19. Criterio para nuevas funcionalidades

Antes de incorporar una funcionalidad deberá responderse:

1. ¿Resuelve un problema frecuente del usuario objetivo?
2. ¿Está relacionada directamente con productos, stock, compras, ventas, costos o precios?
3. ¿Reduce trabajo manual o ayuda a tomar una decisión?
4. ¿Puede diseñarse sin complicar significativamente las acciones principales?
5. ¿Existen datos reales de usuarios que justifiquen desarrollarla?

Una respuesta negativa no implica que la idea sea mala, pero sí que probablemente no pertenece al
MVP.

---

# 20. Objetivo comercial inicial

El éxito inicial no consiste en construir el sistema de inventario con más funcionalidades.

El objetivo es:

1. terminar un producto pequeño y fiable;
2. publicarlo;
3. conseguir usuarios reales;
4. comprobar que continúan utilizando la aplicación;
5. comprobar que registran compras y ventas de forma habitual;
6. conseguir el primer usuario dispuesto a pagar por Pro;
7. iterar utilizando comportamiento y feedback reales.

---

# 21. Hipótesis principal del producto

Creemos que pequeños comerciantes que actualmente utilizan herramientas manuales o excesivamente
complejas valorarán una aplicación donde puedan registrar compras y ventas rápidamente y recibir
automáticamente información sobre stock, costos y rentabilidad estimada.

La hipótesis se considerará validada progresivamente si usuarios reales:

- crean sus productos;
- registran movimientos recurrentemente;
- regresan a consultar inventario;
- utilizan información de costos o margen;
- reaccionan a alertas o recomendaciones;
- continúan utilizando la aplicación después de las primeras semanas.

---

# 22. Decisiones actualmente aceptadas

Por el momento se consideran decisiones de producto:

- offline-first;
- cuenta no obligatoria para Free;
- Free funcional;
- no utilizar límites artificiales de productos como principal paywall;
- Pro basado principalmente en servicios cloud y valor avanzado;
- dos acciones centrales: comprar y vender;
- costo promedio calculado automáticamente;
- ganancia mostrada como estimación sobre producto, no como utilidad neta;
- recomendaciones de precio, no cambios automáticos;
- arquitectura preparada para una futura sincronización;
- web como capacidad futura vinculada principalmente a Pro;
- evitar ERP, contabilidad y POS completo;
- evitar IA generativa como requisito;
- priorizar velocidad de registro sobre cantidad de funciones;
- utilizar reglas y datos reales antes que sistemas predictivos complejos;
- cantidades enteras en V1;
- variantes representadas como productos independientes;
- precio habitual precargado en ventas y modificable por operación;
- objetivo de registrar una venta sencilla en aproximadamente 5–10 segundos.

---

# 23. Decisión provisional

La baseline funcional está cerrada para comenzar el prototipo. La siguiente decisión continúa
abierta porque pertenece al posicionamiento comercial y no bloquea la implementación:

### P-01 — Mercado inicial

Determinar si el lanzamiento se comunicará específicamente para comerciantes que compran y revenden
productos o mediante un posicionamiento completamente horizontal.

La recomendación actual es utilizar un **producto técnicamente genérico pero un mensaje comercial
inicialmente más específico**.

