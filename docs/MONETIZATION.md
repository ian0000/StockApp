# MONETIZATION.md

**Estado:** Baseline v1.0 **Producto:** Nombre por definir **Documentos relacionados:** `PRODUCT.md`,
`MVP.md`, `ARCHITECTURE.md`

---

# 1. Objetivo

Definir un modelo de monetización que permita:

- ofrecer una versión gratuita realmente útil;
- evitar paywalls artificiales;
- financiar infraestructura cloud;
- generar ingresos recurrentes;
- mantener una propuesta sencilla;
- convertir usuarios satisfechos en usuarios Pro;
- validar que existe disposición real a pagar.

El objetivo inicial no es maximizar ARPU.

El objetivo inicial es conseguir:

> **el primer usuario que pague porque Pro le aporta valor real.**

---

# 2. Principio fundamental

Free debe resolver el problema principal.

Pro debe mejorar:

- continuidad;
- seguridad;
- acceso;
- comodidad;
- análisis.

No utilizaremos el modelo:

> “La aplicación funciona hasta que creaste 100 productos.”

---

# 3. Qué vende realmente Pro

Pro no vende:

> “más inventario”.

Vende:

> **“Tu inventario está disponible, respaldado y sincronizado donde lo necesites.”**

Esto crea una separación natural.

```text
FREE
Mi inventario está en este dispositivo.

PRO
Mi inventario me acompaña.
```

---

# 4. Free

La versión Free incluirá:

- productos locales ilimitados;
- funcionamiento offline;
- compras;
- ventas;
- ventas multiproducto;
- código de barras;
- ajustes;
- stock;
- costo promedio;
- precio habitual;
- margen;
- ganancia estimada;
- sugerencias de precio;
- stock mínimo;
- historial básico;
- estadísticas básicas;
- búsqueda;
- archivado de productos;
- respaldo manual local;
- restauración manual local.

Sin anuncios.

Sin cuenta obligatoria.

---

# 5. Cambio respecto a la propuesta original

Originalmente consideramos:

> exportaciones → Pro.

Debemos distinguir dos cosas.

## Backup de seguridad

Una copia que permita restaurar los datos de la aplicación.

**Debe estar disponible en Free.**

Ejemplo:

```text
Crear copia de seguridad

inventory-backup-2026-08-15...
```

El usuario es responsable de guardarla.

## Exportaciones comerciales

Ejemplos:

- CSV de ventas;
- Excel;
- reportes;
- movimientos por período;
- estadísticas exportables.

Estas sí pueden formar parte de Pro.

---

# 6. Por qué el backup manual debe ser Free

El usuario Free podría tener meses o años de información únicamente en su teléfono.

No queremos que el producto comunique:

> “Págame o no puedes proteger tus datos.”

Free podrá hacer:

```text
Exportar backup
↓
guardar archivo
↓
restaurarlo posteriormente
```

Pro automatizará ese problema:

```text
Backup cloud automático
```

La diferencia sigue siendo suficientemente valiosa.

---

# 7. Pro

Pro incluirá progresivamente:

### Cloud

- backup cloud automático;
- restauración cloud;
- sincronización.

### Dispositivos

- múltiples teléfonos/tablets;
- cambio de dispositivo sencillo.

### Web

- acceso desde navegador.

### Datos

- historial avanzado;
- estadísticas históricas;
- períodos personalizados;
- comparaciones.

### Exportación

- CSV;
- Excel;
- otros reportes útiles.

### Insights

- agotamiento estimado;
- productos sin movimiento;
- evolución de costos;
- tendencias;
- análisis histórico.

### Recursos cloud futuros

- imágenes sincronizadas;
- almacenamiento adicional.

---

# 8. Qué NO debe convertirse en Pro

No cobraría por:

- registrar más ventas;
- registrar más compras;
- calcular costo promedio;
- conocer stock;
- escanear códigos;
- tener más de X productos;
- ajustar inventario;
- conocer margen;
- recibir la sugerencia básica de precio;
- operar offline.

Esas funciones conforman el producto.

Quitarlas debilitaría Free artificialmente.

---

# 9. Comparación conceptual

```text
                FREE              PRO

Productos       Ilimitados        Ilimitados

Compras         ✓                 ✓
Ventas          ✓                 ✓
Barcode         ✓                 ✓
Offline         ✓                 ✓

Costo/margen    ✓                 ✓
Precio sugerido ✓                 ✓

Backup manual   ✓                 ✓
Backup cloud    —                 ✓

Sync            —                 ✓
Multi-device    —                 ✓
Web             —                 ✓

Historial       Básico            Avanzado
Estadísticas    Básicas           Avanzadas
Insights        Básicos           Avanzados
Exportación     Backup             CSV/Excel/etc.
```

---

# 10. Cuenta

Free:

```text
No requiere cuenta
```

Pro:

```text
requiere cuenta
```

porque necesitamos identificar al propietario del inventario cloud.

La cuenta podrá introducirse cuando el usuario active:

```text
Pro
Backup cloud
Sync
```

No durante el onboarding inicial.

---

# 11. Conversión natural

Un buen momento para mostrar Pro sería cuando el usuario intenta realizar una acción realmente Pro.

Ejemplo:

```text
¿Quieres usar tu inventario
también en otro dispositivo?

Con Pro puedes mantener ambos
sincronizados.
```

O:

```text
Tu inventario tiene 642 movimientos.

Con Pro puedes consultar estadísticas
de períodos anteriores y exportarlos.
```

---

# 12. Lo que NO haremos

Evitar:

```text
¡¡OFERTA 70% SOLO HOY!!
```

cada vez que abre la aplicación.

Evitar:

```text
5 ventanas Pro
antes de registrar una venta.
```

El paywall jamás debe interrumpir el uso normal de Free.

---

# 13. Momento adecuado para mostrar Pro

Podemos presentar Pro cuando exista intención relacionada.

Ejemplos:

### Backup

Usuario abre:

```text
Datos y respaldo
```

Mostrar:

```text
Backup manual             Free
Backup automático cloud   Pro
```

### Otro dispositivo

```text
Usar en otro dispositivo
                       PRO
```

### Web

```text
Abrir desde computadora
                       PRO
```

### Estadísticas

Mostrar una pequeña vista de información disponible y:

```text
Ver análisis de 12 meses
                       PRO
```

---

# 14. Precio inicial

No debemos considerar este precio definitivo.

Hipótesis inicial recomendada:

```text
Pro mensual
US$3.99
```

y:

```text
Pro anual
US$34.99
```

---

# 15. Por qué $3.99

No quiero posicionarlo inicialmente en:

```text
$0.99
```

porque:

- hace difícil subir posteriormente;
- deja muy poco margen después de fees;
- puede transmitir que es una utilidad descartable;
- el valor comercial puede ser mucho mayor que $1.

Tampoco comenzaría inmediatamente en:

```text
$9.99–$15.99 / mes
```

porque todavía no tendremos:

- sync probado a escala;
- web madura;
- múltiples empleados;
- reportes avanzados;
- soporte empresarial.

`$3.99` es una hipótesis de entrada, no una conclusión sobre cuánto vale el producto.

---

# 16. Anual

Con:

```text
$3.99 × 12
=
$47.88
```

un anual de:

```text
$34.99
```

representa aproximadamente un 27% de ahorro.

Es una diferencia suficientemente visible sin regalar excesivamente el servicio.

---

# 17. No lanzar con demasiados planes

Inicialmente:

```text
FREE

PRO mensual
PRO anual
```

Nada más.

No:

```text
Basic
Starter
Standard
Plus
Premium
Pro
Ultra
Business Lite
```

El usuario debe entender la decisión inmediatamente.

---

# 18. Team / Business

No se implementará inicialmente.

Conceptualmente podría incorporar:

- empleados;
- permisos;
- varias sucursales;
- auditoría;
- administración centralizada.

Su precio se decidirá solamente después de descubrir una demanda real.

No diseñaremos Pro artificialmente limitado para reservar funciones necesarias para Team.

---

# 19. Trial

No considero obligatorio ofrecer un trial desde el primer lanzamiento.

Free ya funciona como una forma extensa de probar el producto.

Sin embargo, cuando Pro tenga:

- web;
- sync;
- multi-device;

puede tener sentido ofrecer:

```text
7–14 días de Pro
```

para experimentar esas capacidades.

Se probará posteriormente.

---

# 20. Freemium vs trial-only

Mantendremos:

```text
Free permanente
+
Pro opcional
```

y no:

```text
14 días
↓
paga o deja de utilizar la app
```

Esto encaja mejor con nuestra filosofía y permite crecer mediante usuarios Free sin costo cloud
significativo.

---

# 21. Ventaja económica del offline-first

Un usuario Free que opera únicamente:

```text
dispositivo
↓
SQLite
```

consume prácticamente cero infraestructura nuestra durante sus operaciones cotidianas.

Esto es extremadamente importante.

Podemos tener muchos usuarios Free sin que cada:

- venta;
- compra;
- búsqueda;
- consulta;

genere automáticamente una operación de base cloud.

---

# 22. Costos cloud actuales de referencia

A agosto de 2026, Supabase muestra su plan Pro desde **US$25/mes**, incluyendo actualmente recursos
como 100.000 MAU, 8 GB de disco, 250 GB de bandwidth y backups diarios, además de créditos de
compute incluidos.

Estos valores son únicamente referencia para planificación.

Deberán verificarse nuevamente antes de lanzar Pro.

---

# 23. Costo cloud no equivale a costo por usuario

Si inicialmente:

```text
Cloud = $25/mes
```

y tenemos:

```text
1 usuario Pro
```

ese usuario obviamente no “cuesta $25”.

Es un costo fijo inicial compartido.

Con:

```text
100 usuarios Pro
```

el mismo componente base se distribuye entre muchos usuarios, siempre que permanezcamos dentro de
los recursos incluidos.

---

# 24. No optimizar prematuramente costos

Durante validación podemos aceptar:

```text
Ingresos Pro: $4
Infraestructura: $25
```

si acabamos de conseguir nuestro primer cliente.

Eso no significa que el negocio haya fracasado.

Significa que estamos pagando aproximadamente `$21` ese mes para comprobar:

> alguien decidió sacar su tarjeta por nuestro producto.

Esa información vale mucho más durante la primera fase.

---

# 25. Comisiones de stores

Google Play indica actualmente una comisión del **15% para suscripciones auto-renovables**.

Apple ofrece actualmente el App Store Small Business Program, con una comisión reducida del **15%**
para desarrolladores elegibles; Apple indica que los participantes reciben el 85% del precio de una
suscripción, antes de considerar impuestos aplicables.

Estas reglas pueden cambiar y además existen diferencias regulatorias según región, por lo que se
verificarán nuevamente antes del lanzamiento.

---

# 26. Ejemplo económico simplificado

Supongamos:

```text
Precio
$3.99
```

y para modelar conservadoramente usamos:

```text
15% store fee
```

Quedarían aproximadamente:

```text
$3.39
```

antes de:

- impuestos;
- infraestructura;
- otros costos.

Por tanto, aproximadamente:

```text
8 suscriptores mensuales
```

generarían suficiente ingreso bruto post-comisión para cubrir un costo cloud fijo de `$25/mes`.

Esto no representa beneficio neto.

Sirve solamente como orden de magnitud.

---

# 27. Ejemplo con 100 Pro

Hipótesis simplificada:

```text
100 × $3.99
=
$399 / mes
```

Después de una comisión hipotética del 15%:

```text
≈ $339 / mes
```

antes de:

- infraestructura;
- impuestos;
- soporte;
- otros servicios.

No debemos construir el modelo financiero suponiendo que cada usuario siempre paga mensual; algunos
utilizarán anual y los precios podrán variar regionalmente.

---

# 28. Costos de publicación

Actualmente Google Play cobra una inscripción de desarrollador de **US$25 una sola vez**.

El Apple Developer Program tiene actualmente un costo de **US$99 por año**.

Estos son costos relativamente pequeños frente al tiempo de desarrollo, pero deben formar parte del
presupuesto de lanzamiento.

---

# 29. Otros costos potenciales

Antes de publicación podrán aparecer:

- dominio web;
- correo transaccional;
- crash reporting;
- analytics;
- backend;
- storage;
- monitoring;
- landing page;
- soporte;
- cuentas de desarrollador.

No agregaremos servicios pagos sin una necesidad concreta.

---

# 30. Cloud de Free

Free NO necesita sincronización cloud.

Por tanto no deberíamos crear automáticamente:

```text
1 usuario instalado
=
1 cuenta cloud
=
1 base sincronizada
```

Esto desperdiciaría nuestra ventaja offline-first.

---

# 31. Cloud de Pro

Al activar Pro:

```text
Inventario local
↓
Crear cuenta
↓
Crear espacio cloud
↓
Primera sincronización
↓
Backup automático
```

Cancelar Pro no debe destruir inmediatamente los datos locales.

---

# 32. Cancelación

Si el usuario cancela:

- continúa utilizando Free;
- sus productos permanecen localmente;
- sus compras permanecen;
- sus ventas permanecen;
- sus cálculos permanecen.

Pierde progresivamente las capacidades Pro:

- sync;
- web;
- multi-device;
- nuevas copias cloud automáticas;
- análisis Pro.

La política exacta de retención cloud deberá definirse antes del lanzamiento Pro.

---

# 33. Nunca secuestrar datos

El usuario que deja de pagar no debería recibir:

> “Paga para volver a ver tus productos.”

El núcleo local sigue funcionando.

Esto refuerza confianza y diferencia el producto de software empresarial agresivo.

---

# 34. Upgrade

El cambio:

```text
Free → Pro
```

debe ser sencillo.

Idealmente:

```text
Activar Pro
↓
Crear/iniciar sesión
↓
Sincronizar inventario actual
↓
Listo
```

No:

```text
Exporta
crea otra cuenta
importa
configura negocio
vuelve a crear productos
```

---

# 35. Downgrade

```text
Pro → Free
```

tampoco debe corromper el inventario.

El dispositivo conserva su base local.

Las funciones locales continúan.

---

# 36. Estrategia de lanzamiento comercial

No pondría Pro como prioridad de implementación antes de validar el núcleo local.

Orden recomendado:

### Etapa 1

MVP local.

### Etapa 2

Alpha con usuarios.

### Etapa 3

Corregir fricción de inventario.

### Etapa 4

Implementar backup cloud automático y sync. El backup y la restauración manual local ya pertenecen
al MVP Free y deben estar listos antes de Alpha.

### Etapa 5

Introducir Pro.

### Etapa 6

Conseguir primer usuario pago.

---

# 37. Excepción

No necesitamos esperar miles de usuarios para construir Pro.

Si durante Alpha varias personas preguntan:

> “¿Cómo hago para tenerlo también en mi computadora?”

o:

> “¿Qué pasa si pierdo el teléfono?”

esa es una señal fuerte para priorizar Pro.

---

# 38. Primer feature Pro recomendado

La primera capacidad Pro debería ser:

> **Backup cloud automático.**

Porque:

- tiene valor claro;
- justifica infraestructura;
- crea la cuenta;
- introduce cloud;
- sirve como base para sync posterior.

---

# 39. Segunda capacidad

Después:

> **Sync entre dispositivos.**

Esta probablemente sea una razón de pago más potente que estadísticas avanzadas.

---

# 40. Tercera capacidad

Después:

> **Acceso web.**

Esto permite una combinación atractiva:

```text
Teléfono
para vender/comprar rápido

+

Computadora
para revisar/administrar
```

---

# 41. Estadísticas Pro

No pondría estadísticas como primera razón para pagar.

Son un complemento excelente una vez existe suficiente historial.

Ejemplos Pro:

- 12 meses;
- comparaciones;
- tendencias;
- productos estancados;
- velocidad de venta;
- días estimados de inventario;
- evolución del margen.

---

# 42. Insights Free vs Pro

Free puede recibir insights directamente relacionados con una operación:

```text
Tu costo aumentó 8%.
```

```text
Tu margen bajó.
```

```text
Para mantener tu margen:
$1.20
```

No tiene sentido cobrar por estas porque constituyen parte de nuestra propuesta principal.

Pro puede utilizar historial para decir:

```text
Este producto vende aproximadamente
30% más los viernes.
```

Ese análisis sí depende de datos históricos más sofisticados.

---

# 43. Exportaciones Pro

Pro podrá exportar información para análisis externo.

Ejemplos:

```text
Ventas.csv
Compras.csv
Productos.csv
Movimientos.xlsx
```

No es lo mismo que el backup Free.

Backup:

> recuperar la aplicación.

Export:

> utilizar los datos fuera de la aplicación.

---

# 44. Imágenes

Si posteriormente permitimos imágenes:

Free podría mantenerlas únicamente localmente.

Pro podría:

- subirlas;
- sincronizarlas;
- mostrarlas en web.

Esto es coherente porque las imágenes generan almacenamiento/bandwidth cloud.

No es prioridad MVP.

---

# 45. Límites Pro razonables

Incluso Pro podría necesitar límites técnicos futuros para:

- almacenamiento;
- imágenes;
- exportaciones extremadamente pesadas;
- uso abusivo.

Pero esos límites deben proteger costos reales.

No utilizarse como trucos de conversión.

---

# 46. Pricing regional

No debemos asumir que un único precio en dólares será óptimo globalmente.

Después de obtener suficiente uso podremos probar:

- precios regionales;
- promociones de lanzamiento;
- pricing según mercado.

Inicialmente la simplicidad es más valiosa que una matriz internacional de precios.

---

# 47. Lifetime

No recomiendo un plan:

```text
Pro de por vida
$29.99
```

si Pro incluye servicios que nosotros pagaremos mientras el usuario exista:

- cloud;
- almacenamiento;
- sync;
- web.

Lifetime crea una obligación potencialmente permanente a cambio de un único pago.

---

# 48. Compra única

Una compra única podría tener sentido eventualmente para funciones puramente locales.

Por ejemplo:

```text
Advanced Local Pack
```

Pero no la introduciría inicialmente.

Complicaría un modelo que hoy puede ser:

```text
Free
Pro
```

---

# 49. Publicidad

No habrá anuncios en Free.

No utilizaremos:

```text
watch ad to register another product
```

ni banners dentro del flujo de ventas.

La atención del usuario durante una venta vale más que unos centavos de publicidad.

---

# 50. Datos y monetización

No venderemos datos comerciales del usuario como modelo de negocio.

Información como:

- ventas;
- costos;
- margen;
- inventario;

existe para ofrecer el producto.

No para monetizar indirectamente al usuario.

---

# 51. Métricas de monetización

Cuando exista Pro mediremos:

### Exposure

Usuarios que ven una función Pro.

### Intent

Usuarios que abren información de Pro.

### Conversion

Usuarios que inician suscripción.

### Retention

Usuarios que mantienen Pro.

### Churn

Usuarios que cancelan.

### Feature usage

Qué capacidades Pro utilizan realmente.

---

# 52. Métrica más importante al principio

Inicialmente:

```text
Número de usuarios Pro
```

es más importante que optimizar:

```text
ARPU
LTV
CAC
```

con una precisión ficticia.

Con tres clientes todavía no tenemos suficientes datos para construir sofisticados modelos
financieros.

---

# 53. Objetivos comerciales progresivos

```text
1 usuario Pro
```

demuestra disposición individual a pagar.

Después:

```text
10 usuarios Pro
```

empieza a demostrar repetibilidad.

Después:

```text
100 usuarios Pro
```

empieza a justificar optimización más seria de monetización, infraestructura y adquisición.

---

# 54. Señales negativas

Debemos investigar si ocurre:

```text
Muchos usuarios Free
+
cero interés por Pro
```

Puede significar:

- Free satisface completamente sus necesidades;
- Pro no tiene suficiente valor;
- el usuario objetivo no necesita multi-device;
- precio incorrecto;
- mensaje incorrecto.

No debemos solucionar automáticamente eso quitando funciones de Free.

Primero debemos entender el problema.

---

# 55. Señal positiva importante

Si un usuario pregunta espontáneamente:

> “¿Puedo ver esto en mi computadora?”

o:

> “¿Puedo usarlo en dos teléfonos?”

antes de conocer Pro, está describiendo directamente una posible disposición a pagar.

Registrar este tipo de feedback será importante durante entrevistas.

---

# 56. Paywall conceptual

Ejemplo:

```text
PRO

Tu inventario en todos lados.

✓ Backup automático
✓ Sincronización
✓ Varios dispositivos
✓ Acceso web
✓ Estadísticas avanzadas
✓ Exportaciones

$3.99 / mes

o

$34.99 / año

[ Probar Pro ]
```

No llenar esta pantalla con 30 bullets.

---

# 57. Posicionamiento Free

Evitar:

> Versión limitada.

Preferir:

> Inventario local.

---

# 58. Posicionamiento Pro

Evitar:

> Desbloquea funciones premium.

Preferir conceptualmente:

> Tu inventario respaldado, sincronizado y disponible desde cualquier dispositivo.

La segunda frase comunica valor.

La primera comunica un paywall.

---

# 59. Estrategia inicial recomendada

Por ahora adoptamos como hipótesis:

```text
FREE
$0 para siempre

PRO
$3.99 mensual
$34.99 anual
```

Pero NO se considera precio definitivo.

La primera ronda real de usuarios deberá validar:

- percepción de valor;
- necesidad de sync;
- necesidad web;
- sensibilidad al precio;
- funcionalidades esperadas.

---

# 60. Pregunta de entrevistas

No preguntaremos:

> “¿Pagarías $3.99 por esto?”

porque las personas pueden decir sí sin ninguna consecuencia.

Es más útil descubrir:

- cómo solucionan actualmente el problema;
- cuánto tiempo les consume;
- si pagan ya por alguna herramienta;
- qué ocurriría si pierden sus datos;
- cuántos dispositivos utilizan;
- si necesitan trabajar desde computadora.

Cuando tengamos producto:

> ofrecer realmente Pro.

La mejor validación de precio es una compra.

---

# 61. Decisiones actuales

Quedan adoptadas:

- Free permanente;
- productos ilimitados;
- sin anuncios;
- funcionamiento local completo;
- no cuenta obligatoria en Free;
- backup manual/restauración Free;
- backup automático cloud Pro;
- sync Pro;
- multi-device Pro;
- web Pro;
- estadísticas históricas avanzadas Pro;
- exportaciones comerciales Pro;
- insights históricos avanzados Pro;
- no lifetime inicialmente;
- no Team inicialmente;
- mensual + anual;
- precio inicial experimental de $3.99 / $34.99.

---

# 62. Decisiones futuras

Antes del lanzamiento Pro se deberá confirmar:

- proveedor cloud final;
- costos reales de infraestructura;
- billing iOS;
- billing Android;
- impuestos;
- precios regionales;
- período de retención cloud tras cancelar;
- trial sí/no;
- restore cloud;
- límites razonables de almacenamiento;
- política de refunds;
- términos y privacidad.

---

# 63. Regla final de monetización

Cuando dudemos si algo pertenece a Pro, preguntaremos:

> ¿Estamos cobrando porque estamos aportando más valor o porque hicimos Free deliberadamente peor?

Si la respuesta es la segunda:

**no es un buen paywall.**
