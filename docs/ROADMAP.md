# ROADMAP.md

**Estado:** Baseline v1.0 **Producto:** Nombre por definir **Documentos relacionados:** `PRODUCT.md`,
`MVP.md`, `BUSINESS_RULES.md`, `UX.md`, `DATA_MODEL.md`, `ARCHITECTURE.md`, `MONETIZATION.md`

---

# 1. Objetivo

Construir y publicar la primera versión comercial del producto mediante etapas pequeñas y
verificables.

El roadmap debe priorizar:

1. validar el problema;
2. construir correctamente el dominio;
3. probar los flujos principales;
4. conseguir usuarios reales;
5. publicar;
6. validar monetización;
7. agregar cloud únicamente cuando aporte valor demostrado.

---

# 2. Principio principal

No construiremos todo antes de probar nada.

La secuencia será:

```text
Especificar
↓
Prototipar
↓
Construir núcleo
↓
Probar internamente
↓
Probar con usuarios
↓
Corregir
↓
Publicar
↓
Medir
↓
Iterar
```

---

# 3. Fases

El desarrollo se dividirá en:

```text
0. Preparación
1. Prototipo UX
2. Fundaciones técnicas
3. MVP Core
4. MVP completo
5. Alpha
6. Beta
7. Release Candidate
8. Publicación
9. Post-lanzamiento
10. Pro / Cloud
```

---

# 4. Fase 0 — Preparación

## Objetivo

Cerrar suficiente planificación para empezar a implementar sin que Codex tenga que inventar
decisiones de producto.

## Entregables

- `PRODUCT.md`;
- `MVP.md`;
- `BUSINESS_RULES.md`;
- `UX.md`;
- `DATA_MODEL.md`;
- `ARCHITECTURE.md`;
- `MONETIZATION.md`;
- `ROADMAP.md`;
- `AGENTS.md`.

## Además

Crear posteriormente:

```text
README.md
CONTRIBUTING.md opcional
```

y estructura inicial del repositorio.

## Criterio de salida

Podemos explicar claramente:

- qué construimos;
- qué no construimos;
- cómo funciona el inventario;
- qué tecnologías utilizaremos;
- qué debe implementar primero Codex.

---

# 5. Fase 1 — Prototipo UX

## Objetivo

Validar flujos antes de invertir tiempo importante en UI final.

No necesitamos una aplicación completa.

Necesitamos comprobar:

> ¿Registrar compras y ventas realmente se siente rápido?

---

# 6. Flujos a prototipar

En orden:

### P1 — Crear producto

```text
Nuevo producto
↓
Nombre
↓
Precio
↓
Código opcional
↓
Crear
```

### P2 — Venta manual

```text
+ Venta
↓
Buscar producto
↓
Cantidad
↓
Registrar
```

### P3 — Venta con barcode

```text
+ Venta
↓
Escanear
↓
Producto agregado
↓
Registrar
```

### P4 — Compra

```text
+ Compra
↓
Producto
↓
Cantidad
↓
Costo
↓
Registrar
```

### P5 — Detalle del producto

Visualizar:

- stock;
- costo;
- precio;
- ganancia;
- margen.

### P6 — Ajustar stock

```text
Registrado: 10

¿Cuántas tienes realmente?
12

+2
```

---

# 7. Qué NO diseñar todavía

No gastar tiempo inicialmente en:

- settings completos;
- onboarding avanzado;
- animaciones;
- gráficos;
- pantalla Pro;
- web;
- temas visuales múltiples;
- iconografía perfecta.

Primero deben funcionar los seis flujos principales.

---

# 8. Validación del prototipo

Idealmente probar con algunas personas que realmente manejen productos.

No preguntar únicamente:

> “¿Te gusta?”

Pedir tareas:

> “Acabas de vender tres Coca-Colas. Regístralo.”

Observar:

- dónde dudan;
- qué tocan primero;
- qué términos no entienden;
- cuánto tardan;
- si necesitan explicación.

---

# 9. Fase 2 — Fundaciones técnicas

## Objetivo

Crear una base pequeña pero correctamente estructurada.

---

# 10. Repository setup

Crear:

```text
apps/
└── mobile/

packages/
├── domain/
└── shared/

docs/
```

Tecnologías iniciales:

- pnpm;
- TypeScript;
- React Native;
- Expo;
- Expo Router;
- SQLite;
- Drizzle;
- framework de tests.

---

# 11. Calidad desde el principio

Antes de features:

- TypeScript strict;
- lint;
- formatting;
- tests ejecutables;
- scripts claros;
- migraciones;
- CI básico obligatorio.

El CI inicial validará:

```text
pnpm lint
pnpm typecheck
pnpm test
```

No incluirá despliegues automáticos, Kubernetes, Docker obligatorio, infraestructura cloud ni
pipelines complejos.

---

# 12. Fase 3 — MVP Core

Esta es la primera gran etapa funcional.

## Vertical Slice 1

### Producto

Implementar:

- crear producto;
- listar productos;
- buscar;
- editar;
- archivar.

Sin imágenes.

---

# 13. Vertical Slice 2 — Compra

Implementar:

```text
RegisterPurchase
```

con:

- un único producto;
- cantidad;
- costo;
- total;
- movimiento;
- actualización de stock;
- costo promedio.

Tests obligatorios.

---

# 14. Vertical Slice 3 — Venta

Implementar:

```text
RegisterSale
```

primero para un producto.

Después extender a:

```text
Sale
└── SaleItems[]
```

Implementar:

- descuento de stock;
- snapshot de costo;
- ingreso;
- ganancia estimada.

---

# 15. Primera milestone realmente útil

Al terminar estos tres slices debe ser posible:

```text
Crear Coca-Cola
↓
Comprar 20 × $0.60
↓
Stock = 20
↓
Vender 3 × $1
↓
Stock = 17
↓
Ver ganancia estimada
```

En ese momento ya tenemos el corazón del producto.

---

# 16. Regla importante

No continuar inmediatamente con nuevas features.

Primero verificar exhaustivamente:

- stock;
- costo;
- movimientos;
- snapshots;
- persistencia;
- reinicio de app.

Si estos cálculos no son confiables, no hay producto.

---

# 17. Vertical Slice 4 — Costos y precios

Implementar:

- margen;
- ganancia por unidad;
- cambios de costo;
- margen anterior/actual;
- sugerencia de precio.

Tests primero.

---

# 18. Vertical Slice 5 — Ajustes

Implementar:

```text
AdjustStock
```

con:

- nuevo stock físico;
- cálculo de diferencia;
- ajuste positivo;
- ajuste negativo;
- motivos;
- costo del ajuste.

---

# 19. Vertical Slice 6 — Stock negativo

Implementar:

- warning;
- permitir venta;
- stock negativo;
- snapshot con el último costo conocido, si existe;
- ganancia no disponible cuando nunca se conoció un costo;
- compra posterior sin ponderar stock negativo;
- preservación de ventas históricas sin reconciliación ni reescritura.

Este slice debe tener tests especialmente fuertes.

No implementarlo “a ojo” dentro de una pantalla.

---

# 20. Fase 4 — MVP completo

Una vez estable el núcleo:

## Gate de anulación y reversión

Implementar en tareas pequeñas después de aprobar este preflight y antes de ofrecer acciones UI:

1. `DOMAIN-VOID-SALE`: transición y creación determinista de reversiones de venta;
2. `APP-VOID-SALE`: ports, caso de uso atómico, SQLite e idempotencia;
3. `UI-VOID-SALE`: confirmación y acción permanente desde detalle; el acceso rápido `Deshacer`
   permanece como decisión UX separada;
4. `DOMAIN-VOID-PURCHASE`: restauración exacta desde snapshots bajo la restricción de última
   operación;
5. `APP-VOID-PURCHASE`: ports, caso de uso atómico, SQLite e idempotencia;
6. `UI-VOID-PURCHASE`: confirmación y acción permanente desde detalle; Undo inmediato permanece
   pendiente de aprobación UX;
7. regresión de History, detalles, métricas, stock bajo y productos archivados.

No agrupar Sale y Purchase en un caso de uso genérico. No implementar anulación de
`StockAdjustment` en V1. Antes de exponer cualquier `Deshacer` inmediato debe resolverse su duración;
antes de exponer Undo de compra debe decidirse además si esa acción rápida forma parte de V1.

### Estado de implementación verificado

La revisión consolidada posterior a las anulaciones clasifica el estado real así:

| Bloque | Estado | Alcance verificado o pendiente |
| --- | --- | --- |
| Fundaciones técnicas | DONE | Workspace, TypeScript strict, quality gates, Expo, SQLite, Drizzle y ocho tablas versionadas. |
| Productos | DONE | Crear, listar, buscar, consultar detalle, editar, archivar y derivar stock bajo. |
| Compras | DONE | Registro atómico de un producto, costo promedio, snapshots, detalle y sugerencia de precio. |
| Ventas | DONE | Registro multiproducto atómico, stock negativo, snapshots de costo, ganancia y detalle. |
| Ajustes | DONE | Conteo físico, motivos, costo de entradas y movimiento trazable. |
| History y recientes | DONE | Cronología unificada, detalles navegables y operaciones anuladas sin filas `REVERSAL`. |
| Anulación de Sale y Purchase | DONE | Domain, Application, SQLite y acción permanente desde detalles; regresión automatizada completa. |
| Validación física consolidada de anulaciones | PENDING | Debe comprobarse en iPhone, incluidos reinicio, déficit, multiproducto y precio sugerido conservado. |
| Barcode | PENDING | Permiso de cámara, escaneo local, repetición, no encontrado e integración con alta, venta y compra. |
| Dashboard básico | PENDING | Ventas, ganancia y unidades ya son reales; faltan más vendido y stock bajo real dentro de Inicio. |
| Backup y restauración local | PENDING | Continúa siendo gate obligatorio antes de Alpha y requiere validación con una copia real. |
| Undo inmediato | PENDING | Duración no definida; compra requiere además decidir si ofrecerá este acceso rápido. |
| Consulta de archivados y desarchivado | DEFERRED | Archivar está completo; estas acciones adicionales no son requisito explícito del MVP actual. |
| Anulación de StockAdjustment | DEFERRED | Excluida de V1; un error se corrige mediante otro conteo físico. |

`DONE` significa implementado y validado automáticamente. No implica validación física cuando la fila
correspondiente permanece `PENDING`.

### Barcode

- permiso de cámara;
- scan;
- búsqueda local;
- código desconocido;
- escaneo repetido;
- uso en venta;
- uso en compra.

### Historial

- compras;
- ventas;
- ajustes;
- detalles.

### Dashboard básico

- ventas hoy;
- ganancia estimada;
- unidades;
- más vendido;
- stock bajo.

### Stock inicial

- cantidad;
- costo unitario aproximado obligatorio si la cantidad es mayor que cero.

### Backup manual

- crear copia de seguridad local;
- restaurar una copia;
- comprobar que se conservan productos, movimientos, ventas, compras y ajustes.

## Gate antes de Alpha

Alpha con datos reales no comenzará hasta que backup y restauración manual estén implementados y
probados de extremo a extremo. Este backup de seguridad pertenece a Free y no se confundirá con las
exportaciones comerciales CSV/Excel de Pro.

---

# 21. Milestone MVP

El MVP se considera funcional cuando un usuario puede operar su pequeño inventario localmente sin
Internet.

Debe poder:

```text
Crear
Comprar
Vender
Escanear
Ajustar
Consultar
Respaldar
Restaurar
```

sin depender de cloud.

---

# 22. Lo que sigue fuera del MVP

Aunque sea tentador, todavía NO:

- Supabase;
- Firebase;
- sync;
- login obligatorio;
- web;
- suscripciones;
- gráficos avanzados;
- Team;
- empleados;
- imágenes cloud.

---

# 23. Fase 5 — Alpha

## Objetivo

Utilizar la aplicación con personas reales.

Alpha NO significa:

> “código casi terminado”.

Significa:

> “producto suficientemente funcional para descubrir errores reales”.

---

# 24. Usuarios Alpha

Buscar inicialmente un grupo pequeño.

Ideal:

```text
3–10 personas
```

con negocios relativamente diferentes.

Por ejemplo:

- alimentos;
- ropa;
- maquillaje;
- repuestos;
- venta online.

No necesitamos cientos de testers.

---

# 25. Qué observar

Especialmente:

### Activación

¿Crean productos?

### Loop

¿Registran compras?

¿Registran ventas?

### Retención

¿Vuelven a utilizarla?

### Fricción

¿Qué acciones dejan de registrar?

### Errores

¿El stock coincide con su realidad?

### Velocidad

¿Registrar una venta resulta suficientemente rápido?

---

# 26. Pregunta Alpha más importante

No:

> “¿Qué feature te gustaría?”

Primero:

> “¿Qué fue incómodo o qué dejaste de registrar?”

La segunda pregunta protege mejor nuestro producto de feature creep.

---

# 27. Feature requests durante Alpha

Todas las solicitudes irán a un backlog.

Clasificación:

```text
BLOCKER
HIGH
NORMAL
LATER
NO
```

No implementar automáticamente cada petición.

---

# 28. Blocker

Ejemplos:

- se pierde información;
- stock incorrecto;
- no puede registrar una venta habitual;
- scanner falla constantemente;
- flujo demasiado lento;
- cálculo financiero incorrecto.

Estos tienen prioridad inmediata.

---

# 29. No blocker

Ejemplos:

> “Quisiera cambiar el color del dashboard.”

> “¿Puedes agregar cinco tipos de gráficos?”

> “Me gustaría manejar empleados.”

No bloquean lanzamiento.

---

# 30. Fase 6 — Beta

## Objetivo

Transformar el MVP útil en una aplicación publicable.

---

# 31. Beta incluye

- correcciones Alpha;
- onboarding;
- empty states;
- estados de error;
- permisos;
- backup probado;
- restauración probada;
- accesibilidad básica;
- performance;
- crash reporting;
- analytics mínimo;
- privacidad;
- textos finales;
- icono;
- branding inicial.

---

# 32. Analytics Beta

Medir eventos mínimos.

Ejemplos:

```text
first_product_created
first_purchase_created
first_sale_created

sale_created
purchase_created
adjustment_created

barcode_scan_used
backup_created
```

No necesitamos instrumentar cada toque de pantalla.

---

# 33. Métricas principales

### Activation

Usuario crea primer producto.

### Core activation

Usuario registra primera compra y/o venta.

### Usage

Movimientos por usuario activo.

### Retention

Regresa después de instalar.

### Speed

Tiempo aproximado de registro de venta.

---

# 34. Privacidad

Analytics nunca debe enviar innecesariamente:

- nombres de productos;
- costos;
- precios;
- cantidades comerciales;
- ganancias.

Podemos medir:

```text
sale_created = true
```

sin enviar:

```text
Coca-Cola $1.00
```

---

# 35. Fase 7 — Release Candidate

Antes de enviar a las stores:

- tests pasan;
- typecheck pasa;
- lint pasa;
- migraciones probadas;
- backup/restauración probados;
- cold start probado;
- actualización desde versión anterior probada;
- permisos probados;
- modo avión probado;
- dispositivos reales probados.

---

# 36. Prueba especialmente importante

Instalar versión:

```text
1.0.0
```

crear datos.

Después instalar:

```text
1.0.1
```

encima.

Comprobar que:

> todos los datos siguen ahí.

Actualizar una app comercial es distinto a reinstalar durante desarrollo.

---

# 37. Offline test obligatorio

Probar:

```text
Modo avión
```

y después:

- abrir app;
- buscar producto;
- registrar compra;
- registrar venta;
- escanear;
- revisar historial;
- cerrar app;
- volver a abrir.

Todo debe seguir funcionando.

---

# 38. Fase 8 — Publicación

Primera publicación:

```text
v1.0.0
```

No necesita ser espectacular.

Debe ser:

- estable;
- comprensible;
- confiable;
- rápida.

---

# 39. Objetivo de lanzamiento

No medir el éxito inicial mediante:

```text
100,000 descargas
```

Primer objetivo:

```text
10 usuarios reales
```

que utilicen el producto.

Después:

```text
1 usuario que lo incorpore
realmente a su operación.
```

---

# 40. Feedback post-lanzamiento

Clasificar feedback en:

### Core friction

Problemas de compra/venta/stock.

### Missing use case

Algo común que realmente bloquea.

### Enhancement

Mejora útil.

### Expansion

ERP/POS/Team/etc.

### Noise

Solicitud extremadamente específica de un usuario.

---

# 41. Fase 9 — Primeras iteraciones

Prioridad:

```text
retención
>
más features
```

Si usuarios instalan pero dejan de usar después de tres días, agregar 15 estadísticas no resolverá
el problema.

Debemos entender por qué dejaron de registrar movimientos.

---

# 42. Posibles iteraciones tempranas

Dependiendo de datos reales:

- recientes;
- favoritos;
- venta todavía más rápida;
- búsqueda mejorada;
- devoluciones;
- mejores ajustes;
- producto agotado estimado;
- producto sin movimiento;
- imágenes locales.

Ninguna está garantizada.

---

# 43. Fase 10 — Pro

Solo cuando el core tenga suficiente estabilidad.

Orden recomendado:

### Pro 1

Cuenta.

### Pro 2

Backup cloud.

### Pro 3

Sync.

### Pro 4

Segundo dispositivo.

### Pro 5

Web.

### Pro 6

Exportaciones.

### Pro 7

Estadísticas históricas.

---

# 44. No implementar sync entero de una vez

Construir progresivamente.

Primero:

```text
Mobile
→
Cloud backup
```

Después:

```text
Mobile
↔
Cloud
```

Después:

```text
Mobile A
↔
Cloud
↔
Mobile B
```

Después:

```text
Web
↔
Cloud
```

Cada salto agrega complejidad importante.

---

# 45. Primer usuario Pro

No esperar a tener:

- 30 estadísticas;
- inteligencia artificial;
- Team;
- todas las plataformas.

Cuando tengamos:

```text
backup automático
+
sync fiable
+
valor claro
```

podemos comenzar a probar pago.

---

# 46. Distribución aproximada del esfuerzo

Durante desarrollo:

```text
40% Core/domain/data

25% UX/UI

15% tests + calidad

10% bugs/polish

10% publicación/analytics/etc.
```

No es una regla contractual.

Sirve para recordar que la interfaz no es el único trabajo.

---

# 47. Ritmo de trabajo

Con tiempo limitado, trabajar mediante tareas que puedan completarse y revisarse individualmente.

Idealmente:

```text
1 tarea
→
código
→
tests
→
review
→
commit
```

No acumular diez features generadas por Codex antes de revisarlas.

---

# 48. Tamaño de tareas para Codex

Bueno:

```text
Implementar Money.valueOf()
y tests.
```

Bueno:

```text
Implementar cálculo de costo
promedio según BR-008.
```

Bueno:

```text
Crear migración inicial
de Product.
```

Malo:

```text
Implementar inventario.
```

---

# 49. Orden recomendado de trabajo con Codex

Para cada feature:

```text
1. Leer spec
2. Escribir/confirmar tests
3. Implementar dominio
4. Ejecutar tests
5. Implementar persistencia
6. Integration tests
7. Implementar UI
8. Revisar diff
9. Commit
```

---

# 50. Commits

Preferir commits pequeños.

Ejemplo:

```text
feat(domain): add weighted average cost
```

```text
feat(db): add product schema
```

```text
feat(sales): register single-product sale
```

Evitar:

```text
feat: finished half the app
```

---

# 51. Definition of Done por tarea

Una tarea no está terminada únicamente porque:

> “funciona en mi teléfono.”

Debe cumplir, según corresponda:

- implementación;
- tests;
- typecheck;
- lint;
- migración;
- estados de error;
- documentación afectada actualizada.

---

# 52. Backlog

Mantendremos un backlog separado del roadmap.

Cada idea nueva no modifica automáticamente este documento.

Ejemplo:

```text
BACKLOG.md
```

podría contener:

- imágenes;
- devoluciones;
- favoritos;
- proveedores;
- categorías;
- forecasting;
- Team.

Esto nos permite guardar ideas sin introducirlas al scope.

---

# 53. Criterio para cambiar roadmap

Solo cambiar prioridad si existe:

1. bug crítico;
2. dependencia técnica real;
3. feedback repetido de usuarios;
4. oportunidad comercial clara;
5. evidencia de que una hipótesis era incorrecta.

No porque apareció una tecnología nueva interesante.

---

# 54. Lo que no debe retrasar publicación

No retrasar v1 por:

- branding perfecto;
- slogan definitivo;
- landing page compleja;
- sistema de diseño enorme;
- animaciones avanzadas;
- web;
- Pro completo;
- AI;
- Team.

---

# 55. Lo que SÍ debe retrasar publicación

Sí retrasar si:

- stock puede corromperse;
- cálculos son incorrectos;
- backup no funciona;
- datos se pierden en actualización;
- app falla offline;
- ventas habituales son incómodas;
- barcode es inestable y bloquea flujos;
- existen crashes frecuentes.

---

# 56. Roadmap resumido

```text
PLANIFICACIÓN
      ↓
PROTOTIPO UX
      ↓
DOMAIN + SQLITE
      ↓
PRODUCTOS
      ↓
COMPRAS
      ↓
VENTAS
      ↓
COSTOS / MARGEN
      ↓
AJUSTES
      ↓
BARCODE
      ↓
HISTORIAL / DASHBOARD
      ↓
BACKUP
      ↓
MVP
      ↓
ALPHA
      ↓
CORRECCIONES
      ↓
BETA
      ↓
PUBLICACIÓN
      ↓
USUARIOS REALES
      ↓
RETENCIÓN
      ↓
CLOUD / PRO
      ↓
PRIMER CLIENTE PRO
```

---

# 57. Objetivo final del roadmap

El proyecto no se considera exitoso porque:

```text
“terminamos todos los tickets”
```

El objetivo es llegar progresivamente a:

```text
una persona real
↓
instala la aplicación
↓
registra su inventario
↓
la sigue utilizando
↓
confía en los cálculos
↓
obtiene valor
↓
eventualmente paga
```

Todo lo demás existe para hacer posible ese resultado.
