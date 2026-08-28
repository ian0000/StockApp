# ARCHITECTURE.md

**Estado:** Baseline v1.0 **Producto:** Nombre por definir **Documentos relacionados:** `PRODUCT.md`,
`MVP.md`, `BUSINESS_RULES.md`, `UX.md`, `DATA_MODEL.md`

---

# 1. Objetivo

Definir una arquitectura que permita construir una aplicación:

- offline-first;
- rápida;
- fiable;
- mantenible por un solo developer;
- preparada para sincronización futura;
- preparada para aplicación web;
- compatible con desarrollo asistido intensivamente por Codex;
- sin introducir infraestructura innecesaria antes de validar el producto.

La arquitectura debe favorecer:

**simplicidad ahora + capacidad de evolución después.**

---

# 2. Decisión tecnológica principal

Decisión para V1:

```text
Mobile
React Native
     +
Expo
     +
TypeScript
     +
Expo Router
     +
SQLite
     +
Drizzle
```

Cloud futuro:

```text
Supabase / PostgreSQL
```

Web futuro:

```text
React / TypeScript
```

compartiendo principalmente:

- reglas de dominio;
- tipos;
- validaciones;
- contratos;
- lógica de negocio.

No asumiremos que toda la UI o almacenamiento móvil debe reutilizarse en web.

---

# 3. Por qué React Native + Expo

React Native permite construir aplicaciones nativas utilizando React, mientras Expo proporciona
infraestructura y APIs alrededor de React Native. Expo Router permite una estructura de navegación
compartida entre Android, iOS y web.

Para este proyecto tiene varias ventajas:

- TypeScript en gran parte del stack;
- Android e iOS desde un mismo proyecto;
- buen soporte para cámara;
- soporte para barcode scanning;
- tooling de builds;
- routing estructurado;
- posibilidad futura de compartir código con web;
- ecosistema suficientemente grande para Codex y herramientas automáticas.

Expo Camera dispone actualmente de capacidades relacionadas con lectura de códigos de barras, por lo
que no necesitamos desarrollar directamente integración nativa de cámara para el caso normal.

---

# 4. Flutter como alternativa

Flutter sería una alternativa perfectamente válida.

Flutter soporta Android, iOS y web desde una misma base de código.

Sin embargo, para este proyecto recomiendo React Native + Expo principalmente por:

- TypeScript;
- React;
- futura web;
- facilidad para compartir dominio;
- disponibilidad de librerías;
- menor cantidad de contextos tecnológicos diferentes.

No considero que Flutter sea técnicamente inferior.

Simplemente no presenta una ventaja suficientemente grande para justificar elegirlo aquí.

---

# 5. Expo

Utilizaremos Expo como framework alrededor de React Native.

Esto NO significa:

> depender de servicios cloud de Expo para que la aplicación funcione.

La app deberá funcionar completamente offline.

Expo se utilizará principalmente para:

- runtime;
- configuración;
- APIs nativas;
- cámara;
- builds;
- routing;
- tooling.

EAS Build puede simplificar builds y firma de aplicaciones, aunque también es posible realizar
builds locales. Expo mantiene actualmente una capa gratuita limitada para ciertos servicios de
build/update.

---

# 6. Expo Router

Utilizaremos:

```text
Expo Router
```

para navegación.

Ejemplo:

```text
app/
├── (tabs)/
│   ├── index.tsx
│   ├── products.tsx
│   ├── history.tsx
│   └── more.tsx
│
├── sale/
│   └── new.tsx
│
├── purchase/
│   └── new.tsx
│
└── product/
    └── [id].tsx
```

Expo Router utiliza routing basado en archivos y soporta Android, iOS y web.

---

# 7. Arquitectura offline-first

La regla fundamental será:

```text
UI
 ↓
Aplicación
 ↓
Dominio
 ↓
Base local SQLite
```

NO:

```text
UI
 ↓
Internet
 ↓
Servidor
 ↓
Base cloud
```

para operaciones cotidianas.

---

# 8. Fuente de verdad cotidiana

En móvil:

```text
SQLite local
```

será la fuente inmediata de verdad.

Registrar una venta:

```text
Venta
 ↓
Transacción SQLite
 ↓
Guardado correctamente
 ↓
UI confirma
```

La aplicación no necesita esperar:

```text
Wi-Fi
4G
Servidor
Cloud
```

para confirmar una operación.

---

# 9. Base de datos local

Decisión:

```text
SQLite
```

mediante:

```text
expo-sqlite
```

Expo SQLite ofrece una base SQLite persistente entre reinicios de la aplicación y soporta
transacciones.

SQLite encaja especialmente bien porque nuestro dominio es claramente relacional:

```text
Product
Sale
SaleItem
Purchase
InventoryMovement
```

---

# 10. Por qué NO AsyncStorage

AsyncStorage es almacenamiento key-value persistente y no cifrado.

No es apropiado como base principal para:

- miles de movimientos;
- relaciones;
- consultas;
- transacciones;
- índices;
- historial;
- cálculos de inventario.

Podrá utilizarse para preferencias triviales si fuese necesario.

No para inventario.

---

# 11. ORM / capa SQL

Decisión:

```text
Drizzle ORM
```

sobre:

```text
expo-sqlite
```

Drizzle mantiene integración específica con Expo SQLite y herramientas para schema y migraciones.

Esto nos permitirá definir el esquema aproximadamente como:

```text
products
sales
sale_items
purchases
inventory_movements
stock_adjustments
```

sin esconder completamente SQL.

---

# 12. Por qué Drizzle

Buscamos una capa que:

- mantenga TypeScript;
- facilite migraciones;
- permita SQL explícito cuando sea necesario;
- no introduzca un runtime gigantesco;
- permita conocer realmente qué ocurre en la base.

No queremos una abstracción donde Codex genere operaciones de base de datos que nosotros no
entendemos.

---

# 13. Migraciones

Desde la primera versión existirán migraciones versionadas.

Ejemplo:

```text
0001_initial.sql
0002_add_barcode.sql
0003_add_cost_status.sql
```

Nunca dependeremos de:

> borrar la base y volver a crearla.

Una app comercial instalada por usuarios reales debe poder evolucionar conservando sus datos.

## CI básico desde fundaciones

Desde la configuración inicial, el repositorio tendrá integración continua básica para validar en
cada cambio:

```text
pnpm lint
pnpm typecheck
pnpm test
```

El pipeline se limitará inicialmente a calidad del código. No incluirá despliegues automáticos,
Kubernetes, Docker obligatorio, infraestructura cloud ni pipelines complejos.

---

# 14. Capas

Decisión:

```text
┌──────────────────────────┐
│           UI             │
│ React Native / Screens   │
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│      Application         │
│ Use cases / Commands     │
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│         Domain           │
│ Business rules           │
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│          Data            │
│ Repositories / SQLite    │
└──────────────────────────┘
```

No utilizaremos una Clean Architecture de veinte carpetas por entidad.

La separación existe para proteger las reglas importantes, no para producir arquitectura ceremonial.

---

# 15. Domain

El dominio debe ser TypeScript puro siempre que sea posible.

Ejemplos:

```text
calculateAverageCost()
calculateMargin()
calculateEstimatedProfit()
suggestSalePrice()
registerPurchase()
registerSale()
applyInventoryAdjustment()
```

Estas funciones NO deberían depender directamente de:

```text
React
Expo
SQLite
Supabase
```

---

# 16. Beneficio

Esto permite probar:

```text
20 × $10
+
10 × $12
```

sin:

- abrir simulador;
- levantar React Native;
- crear pantallas;
- conectar base de datos.

Las matemáticas pueden verificarse de manera independiente.

---

# 17. Application layer

Representará acciones que el usuario realiza.

Ejemplos:

```text
CreateProduct
RegisterPurchase
RegisterSale
VoidSale
AdjustStock
ArchiveProduct
```

Un caso de uso podrá:

1. validar datos;
2. consultar repositorios;
3. ejecutar dominio;
4. iniciar transacción;
5. crear registros;
6. actualizar derivados;
7. confirmar.

---

# 18. Repositories

El dominio no debería contener:

```text
SELECT * FROM...
```

Tendremos interfaces como:

```text
ProductRepository
SaleRepository
PurchaseRepository
InventoryMovementRepository
```

La implementación móvil utilizará SQLite.

---

# 19. Transacciones

Operaciones críticas deberán ejecutarse dentro de una única transacción local.

Ejemplo:

```text
RegisterSale

BEGIN

create sale
create sale items
create movements
update stock
update derived values

COMMIT
```

Ante error:

```text
ROLLBACK
```

Nunca confirmar parcialmente una venta.

## 19.1 Anulaciones atómicas e idempotentes

La anulación pertenece a Application y utiliza reglas puras de Domain, ports explícitos e
Infrastructure/SQLite. UI nunca actualiza estados ni inserta movimientos directamente.

Antes de cualquier escritura, el caso de uso valida dentro de la misma transacción:

- operación e inventario solicitados;
- estado `CONFIRMED` o retorno idempotente si ya es `VOIDED`;
- movimientos originales exactos y sin `REVERSAL` previo;
- último movimiento inequívoco de cada producto;
- coincidencia exacta entre `InventoryState` actual y snapshots posteriores;
- rango seguro de cantidades y timestamps;
- conjunto completo de líneas en una venta multiproducto.

Orden conceptual para `VoidSale`:

```text
BEGIN EXCLUSIVE
  load Sale + SaleItems
  if VOIDED: return idempotent result
  load original SALE movements + existing reversals
  validate complete movement/item set
  validate latest movement and current state for every product
  prepare every REVERSAL and restored InventoryState
  insert every REVERSAL
  update every InventoryState
  update Sale.status = VOIDED and Sale.updatedAt = now
COMMIT
```

Orden conceptual para `VoidPurchase`:

```text
BEGIN EXCLUSIVE
  load Purchase
  if VOIDED: return idempotent result
  load original PURCHASE movement + existing reversal
  validate latest movement and current state
  restore Purchase.stockBefore + Purchase.averageCostBefore
  insert REVERSAL
  update InventoryState
  update Purchase.status = VOIDED and Purchase.updatedAt = now
COMMIT
```

Un fallo revierte todo. Nunca puede existir una operación `VOIDED` sin sus reversiones, stock
parcialmente restaurado o una venta con solo algunas líneas compensadas. Una operación
`CONFIRMED` que ya tenga reversiones se considera inconsistente y falla sin nuevas escrituras.

`Undo` llama al mismo caso de uso; no duplica reglas ni transacciones.

Los ports futuros mínimos son:

- lectura y actualización de estado para Sale/Purchase;
- lectura de SaleItems;
- lectura de movimientos por fuente y por producto;
- detección de `REVERSAL` por movimiento original;
- inserción de movimientos;
- lectura y actualización de `InventoryState`;
- `TransactionManager` existente como límite atómico.

Sale y Purchase deben conservar casos de uso separados: su restauración de costo es distinta y una
abstracción genérica ocultaría invariantes importantes.

### Evaluación de schema

Clasificación V1: **B. Schema suficiente con limitaciones documentadas**.

Las ocho tablas existentes representan estados, snapshots, movimientos compensatorios y relaciones
necesarias. No se requiere migración para el alcance aprobado. La unicidad de un `REVERSAL` por
movimiento y la relación polimórfica se protegen en Application dentro de la transacción, no mediante
foreign key/UNIQUE SQL. Tampoco existe ordinal autoritativo para movimientos con el mismo
`createdAt`; V1 bloquea esos casos ambiguos.

No se añaden `voidedAt` ni motivo de anulación porque V1 no los presenta ni los exige. El tiempo
técnico se obtiene del `REVERSAL.createdAt` y `updatedAt` registra el cambio de estado. Si producto
requiere mostrar posteriormente el instante o motivo comercial de anulación sin consultar
movimientos, deberá aprobarse una migración específica.

### Matriz mínima de pruebas futuras

`VoidSale` deberá cubrir:

- una línea y múltiples líneas;
- stock positivo y venta que terminó en negativo;
- costo conocido, conocido cero y desconocido;
- producto archivado;
- movimiento posterior en un producto y empate ambiguo de timestamps;
- operación ya `VOIDED`, retry y doble llamada;
- correspondencia exacta entre SaleItem, movimiento original y `REVERSAL`;
- fallo en cada escritura y rollback sin líneas parciales.

`VoidPurchase` deberá cubrir:

- stock anterior positivo, cero y negativo;
- costo anterior conocido, conocido cero y `null` cuando sea válido;
- restauración exacta de ambos snapshots;
- venta, compra o ajuste posterior;
- producto archivado;
- operación ya `VOIDED`, retry y doble llamada;
- inconsistencia entre estado actual y snapshots;
- `REVERSAL` exacto y rollback ante cada fallo.

Las pruebas de integración deberán comprobar además que History y los detalles conservan la
operación `VOIDED`, que los movimientos técnicos no aparecen como filas comerciales, que las
métricas excluyen ventas anuladas y que Product list/detail/stock bajo reflejan el estado restaurado.

---

# 20. Estado de UI

No crearemos desde el inicio un estado global gigantesco duplicando la base de datos.

SQLite contiene los datos persistentes.

React maneja:

- estado temporal de formularios;
- selección actual;
- navegación;
- estado visual.

La base local maneja:

- productos;
- ventas;
- movimientos;
- costos;
- historial.

---

# 21. Código de barras

Se utilizará la cámara del dispositivo mediante APIs de Expo.

Flujo:

```text
Camera
 ↓
barcode string
 ↓
ProductRepository.findByBarcode()
 ↓
Product
```

No existe una petición a Internet.

La identificación del producto registrado es completamente local.

---

# 22. Seguridad local

Datos como:

```text
ventas
costos
ganancia
inventario
```

permanecerán en almacenamiento privado de la aplicación.

Información pequeña y sensible como futuros tokens de autenticación deberá almacenarse utilizando
almacenamiento seguro del sistema. Expo SecureStore está diseñado para valores pequeños como tokens
y secretos utilizando almacenamiento seguro del dispositivo.

No utilizaremos SecureStore para almacenar toda la base de inventario.

## Backup y restauración local

Antes de Alpha, Free deberá permitir crear manualmente una copia de seguridad local y restaurarla.
La operación deberá conservar productos, movimientos, ventas, compras y ajustes de forma
consistente, y deberá probarse con una copia real. Este formato sirve para recuperación de la app;
no es la exportación comercial CSV/Excel reservada para Pro.

---

# 23. Cifrado completo de SQLite

`expo-sqlite` permite opcionalmente configurarse con SQLCipher.

Sin embargo:

**no lo convertiría automáticamente en requisito del MVP.**

Añade:

- complejidad;
- manejo de claves;
- recuperación;
- implicaciones de backup.

Lo reevaluaremos antes de publicación según el modelo de amenazas real.

---

# 24. IDs

Decisión para V1:

```text
UUIDv7
```

para entidades sincronizables.

Ejemplo:

```text
Product
Sale
Purchase
Movement
```

Ventajas conceptuales:

- se generan offline;
- no necesitan servidor;
- evitan colisiones prácticas;
- funcionan bien en escenarios multi-device.

No utilizaremos IDs globales autoincrementales como identidad de sincronización.

En V1, IDs generables offline, `createdAt`, `updatedAt` y relaciones correctas son preparación
suficiente. No se implementará metadata específica de sincronización; se diseñará al comenzar
Pro/cloud.

## Timestamps persistibles

Todos los instantes persistibles de V1 se representan como milisegundos desde Unix epoch en UTC.
En TypeScript se utiliza `number`, con estas invariantes:

```text
Number.isSafeInteger(value)
value >= 0
```

El valor representa un instante absoluto. Domain y Application no almacenan nombres de zona
horaria, fechas formateadas ni strings dependientes de locale. La presentación convierte el
instante a la zona horaria local del usuario cuando corresponda.

---

# 25. Money

No utilizaremos directamente:

```text
JavaScript Number
```

para realizar cálculos monetarios arbitrarios con decimales.

Definiremos una abstracción de dominio:

```text
Money
```

y una representación fija.

Decisión para V1:

```text
1 unidad monetaria
=
1,000,000 unidades internas
```

Ejemplo:

```text
$1.00
→
1,000,000
```

```text
$10.666667
→
10,666,667
```

Esto nos proporciona seis decimales internos.

---

# 26. Por qué más de dos decimales

El usuario normalmente verá:

```text
$10.67
```

pero el costo promedio puede ser:

```text
$10.666666...
```

Si redondeamos a centavos después de cada compra, acumularemos errores.

Por tanto:

```text
display precision
≠
calculation precision
```

---

# 27. Regla de precisión

Internamente:

```text
hasta 6 decimales
```

Visualmente normalmente:

```text
2 decimales
```

El redondeo ocurrirá en los límites definidos, no después de cada operación intermedia.

Antes de implementación tendremos tests específicos para esta regla.

---

# 28. Cantidades

V1:

```text
integer
```

pero el dominio evitará reglas que hagan imposible:

```text
decimal quantity
```

en una versión futura.

No implementaremos todavía:

```text
kg
litros
metros
```

---

# 29. Arquitectura cloud

El MVP local:

```text
Mobile
 ↓
SQLite
```

No necesita backend.

Pro futuro:

```text
Mobile
   ↓
SQLite
   ↓
Sync Engine
   ↓
Cloud
```

Cloud será réplica/sincronización y servicio remoto.

No reemplazará a SQLite como dependencia cotidiana del móvil.

---

# 30. Opciones cloud consideradas

Evaluamos inicialmente:

### Firebase

- Authentication;
- Firestore;
- Storage;
- Functions.

### Supabase

- Authentication;
- PostgreSQL;
- Storage;
- Edge Functions.

### Backend propio

- Node/TypeScript;
- PostgreSQL;
- infraestructura propia.

---

# 31. Firebase

Firestore posee soporte de persistencia offline en sus SDKs y permite leer/escribir datos cacheados
cuando el dispositivo está desconectado.

También utiliza un modelo NoSQL orientado a documentos.

Esto es atractivo para muchas aplicaciones.

Sin embargo, nuestro diseño ya establece:

```text
SQLite = fuente local
```

y nuestro dominio contiene relaciones importantes entre:

```text
Sale
SaleItem
Product
Purchase
Movement
```

Utilizar Firestore como segunda representación principal introduciría dos modelos bastante
diferentes:

```text
SQLite relational
↕
Firestore document
```

---

# 32. Firebase y costos

Cloud Firestore factura principalmente según operaciones como lecturas, escrituras y eliminaciones,
además de almacenamiento/tráfico según el caso.

No significa que Firebase sea necesariamente caro.

Pero para nuestro producto obliga a pensar cuidadosamente en patrones de lectura y listeners cuando
llegue la sincronización.

---

# 33. Supabase

Supabase utiliza PostgreSQL como base de datos y proporciona además autenticación, almacenamiento y
funciones.

Para nuestro modelo tiene una ventaja conceptual importante:

```text
SQLite local
↕
PostgreSQL cloud
```

Ambos son relacionales.

Esto no significa que sus schemas deban ser idénticos, pero reduce la diferencia conceptual.

Supabase ofrece desarrollo local con migraciones versionadas y una base PostgreSQL desplegada en su
plataforma.

---

# 34. Supabase NO resuelve automáticamente nuestro sync

Elegir Supabase no significa que podamos escribir:

```text
sync = true
```

y obtener nuestro sistema offline-first completo.

Supabase ha documentado arquitecturas local-first junto con herramientas externas, lo que
precisamente demuestra que la sincronización local necesita una capa adicional.

Por tanto:

```text
Supabase
≠
Sync Engine automático de nuestra app
```

---

# 35. Decisión cloud provisional

Recomendación:

**Supabase como candidato preferido para Pro.**

Pero:

**NO instalar Supabase como dependencia arquitectónica crítica durante el MVP local.**

Cuando comience Pro:

1. revisaremos precios actuales;
2. revisaremos volumen de usuarios;
3. construiremos un prototipo real de sincronización;
4. volveremos a comparar Firebase, Supabase y soluciones especializadas.

---

# 36. Por qué no decidir cloud definitivamente hoy

Nuestro MVP puede conseguir sus primeros usuarios sin cloud.

Implementar sincronización antes de eso añadiría:

- autenticación;
- networking;
- conflictos;
- retries;
- seguridad remota;
- backend;
- observabilidad;
- costos;
- bugs multi-device.

Sin validar aún si alguien quiere utilizar el inventario básico.

No es una buena inversión inicial.

---

# 37. Backend propio

No recomiendo un backend Node propio para la primera versión Pro salvo que aparezca una necesidad
concreta.

Nos obligaría a mantener:

- servidor;
- PostgreSQL;
- autenticación;
- backups;
- despliegue;
- seguridad;
- observabilidad;
- infraestructura.

Tenemos suficiente complejidad en el producto.

Un backend propio sigue siendo una opción futura si la escala o reglas de negocio lo justifican.

---

# 38. Arquitectura de sincronización futura

Conceptualmente:

```text
┌───────────────┐
│ Mobile App    │
│               │
│ SQLite        │
└───────┬───────┘
        │
        │ Outbox
        ▼
┌───────────────┐
│ Sync Engine   │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Cloud DB      │
└───────────────┘
```

---

# 39. Outbox

Cuando Pro esté habilitado, una operación local podrá generar dentro de la misma transacción:

```text
Sale
SaleItems
Movements
OutboxEntry
```

Ejemplo:

```text
OutboxEntry

entityType: SALE
entityId: abc
operation: UPSERT
status: PENDING
```

El usuario no espera a que esto llegue al servidor.

---

# 40. Flujo futuro

```text
Registrar venta
       ↓
Guardar SQLite
       ↓
✓ Venta registrada
       ↓
Outbox pendiente
       ↓
Internet disponible
       ↓
Push cloud
       ↓
ACK
```

Si Internet falla:

```text
Venta sigue existiendo localmente.
```

---

# 41. Pull de cambios

Otro dispositivo puede haber creado movimientos.

Por tanto también necesitaremos:

```text
Cloud
 ↓
changes since cursor X
 ↓
Mobile
 ↓
SQLite
```

No descargaremos necesariamente toda la base en cada sincronización.

---

# 42. Conflictos

No todos los datos tienen el mismo tipo de conflicto.

### Movimientos

Ventas y compras normalmente serán append-only.

Ejemplo:

```text
Teléfono A → Sale A
Teléfono B → Sale B
```

Podemos conservar ambos.

### Configuración

Ejemplo:

```text
Teléfono A
precio $1 → $1.10

Teléfono B
precio $1 → $1.20
```

Existe conflicto real.

---

# 43. Estrategia inicial de conflictos

Para eventos:

```text
merge por ID
```

Para campos editables:

podremos utilizar inicialmente una estrategia determinista basada en versión/fecha, manteniendo
suficiente metadata para detectar conflictos.

No construiremos CRDTs ni sistemas distribuidos sofisticados para V1.

---

# 44. Stock durante sync

Importante:

```text
currentStock
```

NO debería considerarse el dato global definitivo que dos dispositivos compiten por sobrescribir.

La información fundamental serán los movimientos.

Ejemplo:

```text
A vende -2
B vende -3
```

Después del merge:

```text
-5
```

Esto es mucho más seguro que:

```text
A dice stock = 8
B dice stock = 7
¿cuál gana?
```

---

# 45. Stock negativo multi-device

Puede ocurrir que:

```text
Teléfono A
ve stock 1

Teléfono B
ve stock 1
```

sin conexión.

Ambos venden una unidad.

Después del sync:

```text
stock = -1
```

Esto es coherente con nuestra regla existente:

> el stock negativo está permitido pero requiere revisión.

Nuestra regla de producto también ayuda a resolver concurrencia offline.

---

# 46. Web futura

No asumiría que la web será simplemente:

```text
la app móvil compilada para navegador
```

Expo Router puede producir aplicaciones web, pero `expo-sqlite` mantiene actualmente el soporte web
marcado como alpha.

Por tanto, para Pro:

```text
Web
 ↓
Cloud API / Database
```

será probablemente más apropiado.

---

# 47. Código compartido con web

Idealmente compartiremos:

```text
domain/
contracts/
validation/
formatting/
```

Ejemplo:

```text
calculateMargin()
suggestPrice()
Money
ProductId
SaleDTO
```

La UI podrá compartirse selectivamente.

No estableceremos como requisito:

> 100% del código móvil debe ejecutarse también en web.

---

# 48. Repositorio

V1 utilizará un monorepo pequeño.

Conceptualmente:

```text
inventory-app/
│
├── AGENTS.md
│
├── apps/
│   └── mobile/
│
├── packages/
│   ├── domain/
│   ├── shared/
│   └── testing/
│
├── docs/
│   ├── PRODUCT.md
│   ├── MVP.md
│   ├── BUSINESS_RULES.md
│   ├── UX.md
│   ├── DATA_MODEL.md
│   ├── ARCHITECTURE.md
│   ├── MONETIZATION.md
│   └── ROADMAP.md
│
└── package.json
```

`apps/web` se añadirá cuando realmente se implemente web.

---

# 49. Package manager

Decisión:

```text
pnpm
```

workspace.

No necesitamos:

- Nx;
- Turborepo;
- Bazel;

para el MVP.

Podrán evaluarse si el repositorio realmente crece.

---

# 50. Domain package

```text
packages/domain/
```

contendrá las reglas importantes.

Ejemplo:

```text
src/
├── inventory/
├── pricing/
├── purchases/
├── sales/
└── money/
```

Sin dependencias de React Native.

---

# 51. Código específico móvil

```text
apps/mobile/
```

contendrá:

- screens;
- components;
- SQLite;
- cámara;
- Expo;
- navegación;
- repositorios concretos.

---

# 52. Testing

Tendremos tres niveles principales.

## Unit

Reglas puras:

```text
average cost
margin
profit
price suggestion
negative stock costing
```

## Integration

SQLite:

```text
RegisterSale
→ Sale
→ SaleItems
→ Movements
→ Stock
```

## UI

Flujos críticos:

```text
crear producto
registrar compra
registrar venta
```

---

# 53. Qué debe tener muchos tests

Prioridad extrema:

```text
Money
AverageCost
InventoryMovement
RegisterSale
RegisterPurchase
AdjustStock
VoidSale
NegativeStockCosting
```

Una animación no merece el mismo nivel de tests que el cálculo del costo.

---

# 54. Validación

Las entradas se validarán antes de llegar al dominio.

Ejemplo:

```text
quantity > 0
price > 0
name not empty
```

También existirán invariantes dentro del dominio.

No dependeremos únicamente de que la interfaz “no deje escribir algo incorrecto”.

---

# 55. Logging

Durante desarrollo debemos poder saber:

- qué operación falló;
- qué migración existe;
- qué transacción falló;
- qué versión de base utiliza el dispositivo.

No registraremos indiscriminadamente información financiera sensible en logs de producción.

---

# 56. Crash reporting

Antes de publicación añadiremos una solución básica de crash reporting.

No es necesaria para comenzar el prototipo.

Sí es necesaria para una aplicación comercial donde no tenemos acceso directo al dispositivo del
usuario.

Proveedor a decidir antes de Beta.

---

# 57. Analytics

No deben estar dentro del dominio.

Conceptualmente:

```text
Domain
   │
   ├── operation succeeds
   │
   └── emits application event
              ↓
          Analytics
```

Si analytics falla:

```text
la venta NO falla.
```

---

# 58. Cloud independence

El dominio no podrá importar directamente:

```text
firebase/*
supabase/*
```

Las integraciones pertenecen a infraestructura.

Así podremos reemplazar proveedores sin reescribir reglas de inventario.

---

# 59. Dependencias

Principio:

> añadir una librería únicamente cuando resuelve una necesidad real mejor que una implementación
> pequeña y segura propia.

Especialmente evitaremos instalar paquetes para:

- funciones triviales;
- estado global innecesario;
- arquitecturas automáticas;
- abstracciones que Codex sugiera sin necesidad.

---

# 60. Codex

La arquitectura estará diseñada para que Codex reciba tareas pequeñas.

Ejemplo correcto:

```text
Implementa calculateWeightedAverageCost según BR-008.

Requisitos:
- usar Money;
- no modificar otras capas;
- agregar tests para estos cinco casos.
```

No:

```text
Haz el sistema de inventario.
```

`AGENTS.md` formalizará estas restricciones.

---

# 61. Estrategia de desarrollo

Orden técnico recomendado:

```text
Domain
 ↓
Tests
 ↓
SQLite schema
 ↓
Repositories
 ↓
Use cases
 ↓
UI mínima
 ↓
Flujo end-to-end
```

No diseñaremos primero 25 pantallas para después descubrir que el dominio no funciona.

---

# 62. Primer vertical slice

El primer flujo funcional debería ser:

```text
Crear producto
        ↓
Registrar compra
        ↓
Consultar stock
        ↓
Registrar venta
        ↓
Consultar stock actualizado
```

Con:

- SQLite real;
- dominio real;
- tests reales.

Sin cloud.

---

# 63. Segundo vertical slice

Después:

```text
Costo promedio
 ↓
Margen
 ↓
Ganancia
 ↓
Sugerencia de precio
```

---

# 64. Tercer vertical slice

Después:

```text
Barcode
 ↓
Venta rápida
 ↓
Venta multiproducto
```

---

# 65. Lo que NO implementaremos inicialmente

No montar:

```text
Kubernetes
Docker obligatorio
microservices
message brokers
Redis
GraphQL
event streaming
server propio
cloud sync
CI/CD complejo
observability stack complejo
```

El CI básico de lint, typecheck y tests sí forma parte de las fundaciones. Lo excluido aquí son los
despliegues automáticos y la infraestructura de CI/CD compleja.

---

# 66. Arquitectura inicial completa

```text
                MOBILE

┌─────────────────────────────────┐
│ React Native + Expo             │
│                                 │
│  ┌───────────────────────────┐  │
│  │ UI / Expo Router          │  │
│  └─────────────┬─────────────┘  │
│                │                │
│  ┌─────────────▼─────────────┐  │
│  │ Application / Use Cases   │  │
│  └─────────────┬─────────────┘  │
│                │                │
│  ┌─────────────▼─────────────┐  │
│  │ Domain                    │  │
│  │ Stock / Cost / Margin     │  │
│  └─────────────┬─────────────┘  │
│                │                │
│  ┌─────────────▼─────────────┐  │
│  │ Repositories              │  │
│  └─────────────┬─────────────┘  │
│                │                │
│  ┌─────────────▼─────────────┐  │
│  │ SQLite + Drizzle          │  │
│  └───────────────────────────┘  │
│                                 │
└─────────────────────────────────┘


          NO CLOUD REQUIRED
              FOR MVP


                FUTURE PRO

┌────────────┐
│   Mobile   │
│   SQLite   │
└──────┬─────┘
       │
       │ Sync
       ▼
┌──────────────┐
│ Cloud        │
│ Supabase (?) │
│ PostgreSQL   │
└──────┬───────┘
       │
       ▼
┌────────────┐
│    Web     │
└────────────┘
```

---

# 67. Decisiones adoptadas

Para iniciar desarrollo:

- TypeScript;
- React Native;
- Expo;
- Expo Router;
- SQLite;
- expo-sqlite;
- Drizzle;
- dominio separado de UI;
- repositories;
- use cases;
- transacciones locales;
- funcionamiento 100% local en Free;
- UUID generable offline;
- precisión monetaria fija;
- monorepo pequeño;
- pnpm;
- tests de dominio obligatorios;
- barcode mediante cámara local;
- ninguna dependencia cloud para MVP.

---

# 68. Decisiones provisionales

### Cloud

Supabase es actualmente el candidato preferido.

Se reevaluará antes de implementar Pro.

### Web

React/TypeScript.

Se decidirá posteriormente si:

- Expo Web;
- aplicación React separada;
- otro framework React;

según las necesidades reales de la versión web.

### SQLite encryption

Evaluar antes de lanzamiento.

### Analytics

Proveedor por decidir.

### Crash reporting

Proveedor por decidir.

---

# 69. Regla arquitectónica final

La aplicación debe continuar permitiendo:

```text
Abrir
↓
Comprar
↓
Vender
↓
Consultar
```

aunque:

```text
Firebase esté caído
Supabase esté caído
Internet esté caído
nuestro servidor esté caído
```

Si una dependencia remota puede impedir esas operaciones en Free, hemos violado la arquitectura
offline-first.
