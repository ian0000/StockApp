# AGENTS.md

**Estado:** Baseline v1.0 **Producto:** Nombre por definir **Objetivo:** Definir cómo deben trabajar
Codex y otros agentes de programación dentro del repositorio.

---

# 1. Propósito

Este proyecto utiliza asistencia intensiva de agentes de programación.

Los agentes pueden:

- implementar tareas;
- escribir tests;
- refactorizar código dentro del scope indicado;
- detectar errores;
- proponer mejoras;
- documentar decisiones ya tomadas.

Los agentes NO son responsables de definir:

- producto;
- scope;
- arquitectura;
- UX;
- monetización;
- reglas de negocio.

Estas decisiones pertenecen a los documentos del proyecto y al desarrollador responsable.

---

# 2. Autoridad por responsabilidad

Antes de implementar una tarea, el agente debe consultar los documentos relevantes. No existe una
jerarquía global simple entre todos ellos; cada uno es autoridad dentro de su responsabilidad:

- `docs/PRODUCT.md`: problema, usuario, propuesta y frontera general;
- `docs/MVP.md`: scope de la primera versión;
- `docs/BUSINESS_RULES.md`: comportamiento y cálculos;
- `docs/UX.md`: interacción y experiencia;
- `docs/DATA_MODEL.md`: representación conceptual de datos;
- `docs/ARCHITECTURE.md`: decisiones técnicas;
- `docs/MONETIZATION.md`: Free/Pro y paywalls;
- `docs/ROADMAP.md`: orden y etapas;
- `AGENTS.md`: reglas de ejecución para agentes.

Si dos documentos relevantes se contradicen, Codex no debe decidir silenciosamente cuál tiene
razón. Debe reportar la contradicción y detener únicamente la decisión afectada.

---

# 3. Principio fundamental

El agente debe implementar:

> exactamente la tarea solicitada.

No:

> la tarea solicitada más todo lo que parece buena idea.

---

# 4. Scope

No agregar funcionalidades fuera del scope solicitado.

Ejemplo:

Tarea:

```text
Implementar creación de productos.
```

Correcto:

- modelo;
- validación;
- repositorio;
- tests;
- caso de uso.

Incorrecto:

- agregar categorías;
- proveedores;
- imágenes;
- tags;
- búsqueda avanzada;
- analytics;
- cloud sync.

Aunque parezcan relacionadas.

---

# 5. No anticipar features futuras

No implementar estructuras complejas solo porque puedan ser útiles más adelante.

Ejemplos prohibidos sin solicitud explícita:

- sistema de roles;
- multi-tenant empresarial;
- múltiples bodegas;
- plugins;
- event sourcing completo;
- CQRS;
- microservicios;
- feature flags avanzados;
- reglas tributarias;
- extensiones ERP.

La arquitectura debe permitir evolución razonable, pero no construir hoy funcionalidades
inexistentes.

---

# 6. Tecnologías aprobadas

Stack inicial:

```text
TypeScript

React Native
Expo
Expo Router

SQLite
expo-sqlite
Drizzle ORM

pnpm workspace
```

El dominio deberá mantenerse independiente de React Native siempre que sea posible.

---

# 7. Nuevas dependencias

El agente NO debe instalar una nueva dependencia automáticamente salvo que:

1. sea parte explícita de la tarea; o
2. sea estrictamente necesaria.

Antes de instalar una librería debe indicar:

- qué problema resuelve;
- por qué no puede resolverse razonablemente con las dependencias existentes;
- impacto esperado.

Evitar dependencias para utilidades triviales.

---

# 8. Arquitectura

Separación conceptual:

```text
UI
↓
Application
↓
Domain
↓
Repositories
↓
Infrastructure / SQLite
```

No convertir esta separación en arquitectura ceremonial.

El objetivo es proteger las reglas de negocio.

---

# 9. Domain

El código de dominio debe permanecer, siempre que sea razonable:

- TypeScript puro;
- determinista;
- testeable;
- independiente de React;
- independiente de Expo;
- independiente de SQLite;
- independiente de Supabase/Firebase.

Ejemplo correcto:

```ts
calculateMargin(...)
```

No debería importar:

```ts
expo - sqlite;
react;
supabase - js;
```

---

# 10. Reglas de negocio

Las reglas de:

- stock;
- costo promedio;
- margen;
- markup;
- ganancia;
- sugerencia de precio;
- stock negativo;
- ajustes;
- anulaciones;

deben seguir `docs/BUSINESS_RULES.md`.

El agente NO debe inventar comportamiento cuando aparezca un edge case.

---

# 11. Dinero

Nunca implementar cálculos financieros utilizando redondeos arbitrarios.

No utilizar:

```ts
0.1 + 0.2;
```

como base conceptual de cálculos monetarios sin respetar la abstracción definida para dinero.

Debe utilizarse la estrategia aprobada en arquitectura.

---

# 12. Redondeo

No redondear valores internos prematuramente.

Ejemplo:

Costo real:

```text
10.666666
```

Puede mostrarse:

```text
10.67
```

pero el cálculo posterior debe utilizar la precisión interna correspondiente.

---

# 13. Stock

Nunca modificar stock sin crear el movimiento correspondiente.

Prohibido conceptualmente:

```ts
product.stock += 10;
```

sin que exista la operación de dominio y persistencia correspondiente.

Todo cambio debe ser trazable.

---

# 14. Historial

No eliminar silenciosamente movimientos históricos confirmados.

Para operaciones relevantes utilizar:

- reversión;
- anulación;
- movimiento compensatorio;

según las reglas del dominio.

---

# 15. Ventas

Una venta confirmada debe ser atómica.

No puede existir:

```text
Sale guardada
SaleItem faltante
Movement faltante
Stock parcialmente actualizado
```

Toda la operación debe completarse o revertirse.

---

# 16. Compras

Una compra confirmada deberá actualizar correctamente:

- Purchase;
- movimiento;
- stock;
- costo promedio.

Todo dentro de una operación consistente.

En MVP/V1 una compra contiene exactamente un producto, cantidad, costo unitario, total y fecha/hora.
No crear `PurchaseItem` ni estructuras de compra multiproducto por anticipación.

---

# 17. Snapshots

Las ventas deben conservar el costo utilizado en el momento de la venta o registrar explícitamente
que nunca se conoció un costo.

Nunca recalcular ganancias históricas utilizando automáticamente el costo actual del producto.

---

# 18. Stock negativo

El stock negativo está permitido.

El agente NO debe introducir validaciones que bloqueen una venta únicamente porque:

```text
quantity > currentStock
```

Debe respetar la advertencia y comportamiento definido.

Si existe un último costo conocido, la venta con stock insuficiente lo conserva como estimación
histórica. Si nunca existió un costo, la ganancia queda no disponible; nunca se sustituye por cero.
Una compra futura no reescribe ventas históricas. Cuando el stock anterior es cero o negativo, el
costo del inventario disponible después de la compra se basa en la nueva entrada sin ponderar el
déficit.

---

# 19. Costos desconocidos

Costo desconocido NO equivale a:

```text
0
```

Nunca utilizar cero como valor sustituto salvo que el costo sea realmente cero y la regla lo
permita.

En V1, stock inicial mayor que cero requiere un costo unitario aproximado. Un ajuste positivo
requiere que el usuario acepte el costo actual o indique otro costo; no existe la opción de costo
desconocido.

---

# 20. Validación

Las entradas deben validarse en los límites apropiados.

Ejemplos:

```text
quantity > 0
name not empty
price valid
barcode format usable
```

Pero las invariantes críticas también deben existir dentro del dominio.

No confiar exclusivamente en la UI.

---

# 21. Tests obligatorios

Toda nueva regla de negocio debe incluir tests.

Especialmente:

- dinero;
- costo promedio;
- margen;
- ganancia;
- stock;
- movimientos;
- venta;
- compra;
- ajustes;
- reversión;
- stock negativo.

---

# 22. Regla test-first para lógica crítica

Para cálculos y reglas financieras:

1. crear o modificar tests;
2. ejecutar tests y confirmar el caso;
3. implementar;
4. ejecutar nuevamente.

No implementar primero grandes bloques de lógica matemática y escribir tests después únicamente para
obtener cobertura.

---

# 23. Tests que no dependen de UI

La lógica de:

```text
calculateWeightedAverageCost()
calculateMargin()
calculateProfit()
suggestPrice()
```

debe poder probarse sin:

- emulador;
- React Native;
- Expo;
- SQLite.

---

# 24. Integration tests

Las operaciones principales deberán tener tests contra persistencia real o una implementación
suficientemente equivalente.

Ejemplo:

```text
RegisterSale
↓
Sale persisted
↓
SaleItems persisted
↓
Movements persisted
↓
Stock updated
```

---

# 25. No modificar tests para hacer pasar código incorrecto

Si un test basado en una regla de negocio falla, no modificar su resultado esperado solamente para
que la implementación pase.

Primero verificar:

- regla;
- especificación;
- implementación.

---

# 26. Tareas pequeñas

El agente debe preferir cambios pequeños y revisables.

Idealmente una tarea corresponde a una responsabilidad concreta.

Ejemplos:

```text
Implementar Money
```

```text
Implementar weighted average cost
```

```text
Crear Product schema
```

```text
Implementar ProductRepository
```

No:

```text
Implementar todo ventas, compras y dashboard.
```

---

# 27. No expandir automáticamente la tarea

Si durante una tarea se descubre otra mejora:

No implementarla automáticamente.

Reportar:

```text
Posible tarea adicional:
...
```

y continuar únicamente con el scope actual.

---

# 28. Refactors

Un refactor debe:

- conservar comportamiento;
- tener scope claro;
- evitar mezclarse innecesariamente con una feature.

No realizar grandes refactors del proyecto mientras se implementa una modificación pequeña sin
necesidad real.

---

# 29. Cambios arquitectónicos

No cambiar por cuenta propia:

- estructura de paquetes;
- ORM;
- base de datos;
- framework;
- router;
- estrategia de dinero;
- modelo de movimientos;
- estrategia offline-first.

Si existe un problema arquitectónico, proponerlo antes.

---

# 30. Cloud

No agregar:

```text
Firebase
Supabase
API calls
auth cloud
sync
```

durante MVP salvo tarea explícita.

La aplicación Free debe permanecer completamente operativa localmente.

---

# 31. Offline-first

Toda feature del núcleo debe asumir que Internet puede no existir.

No introducir accidentalmente operaciones como:

```text
await api.registerSale(...)
```

antes de confirmar localmente una venta.

---

# 32. UI

La UI debe respetar `docs/UX.md`.

Prioridades:

- rapidez;
- claridad;
- pocos pasos;
- lenguaje simple;
- controles grandes;
- reducción de fricción.

No agregar terminología técnica innecesaria.

---

# 33. Lenguaje de interfaz

Preferir:

```text
Costo promedio
```

sobre:

```text
Weighted Average Inventory Cost
```

Preferir:

```text
Ganas aproximadamente $0.30
```

sobre:

```text
Gross Profit Contribution
```

salvo que el diseño indique otra cosa.

---

# 34. Formularios

No agregar campos no definidos en producto.

Ejemplo:

Si `Product` requiere:

```text
name
variant?
barcode?
regularSalePrice
minimumStock?
```

no agregar automáticamente:

```text
description
brand
supplier
category
SKU
taxRate
```

---

# 35. Errores

No mostrar errores técnicos al usuario.

Incorrecto:

```text
SQLITE_CONSTRAINT_FOREIGNKEY
```

Correcto:

```text
No pudimos registrar la venta.
Tus datos anteriores no fueron modificados.
```

Los detalles técnicos pueden registrarse internamente durante desarrollo.

---

# 36. Logging

Evitar logs indiscriminados con:

- nombres de productos;
- ventas;
- costos;
- ganancias;
- información sensible.

Durante desarrollo se permite logging controlado.

Debe eliminarse o reducirse antes de producción.

---

# 37. TypeScript

Utilizar:

```text
strict: true
```

Evitar:

```ts
any;
```

salvo justificación concreta.

No resolver errores TypeScript mediante casts arbitrarios.

Ejemplo a evitar:

```ts
value as any;
```

para silenciar problemas de tipos.

---

# 38. Tipos de dominio

Preferir tipos explícitos.

Ejemplo:

```ts
ProductId;
SaleId;
Money;
Quantity;
```

cuando aporten seguridad real.

No crear wrappers ceremoniales para cada string si no añaden valor.

---

# 39. Nullability

Distinguir correctamente:

```text
desconocido
```

de:

```text
cero
```

y:

```text
no aplicable
```

No abusar de valores mágicos.

---

# 40. Database migrations

Todo cambio de schema debe incluir migración.

No modificar el schema esperando que usuarios existentes reinstalen la aplicación.

Nunca usar como estrategia comercial:

```text
drop database
recreate
```

---

# 41. Datos existentes

Al modificar persistencia, considerar siempre:

> ¿Qué ocurre con alguien que ya tiene datos?

Aunque durante desarrollo haya pocos usuarios.

El hábito debe existir desde el principio.

---

# 42. Barcode

El scanner únicamente identifica productos existentes localmente.

No añadir catálogos externos ni requests a Internet salvo tarea explícita.

---

# 43. Permisos

Solicitar permisos únicamente cuando sean necesarios.

Ejemplo:

La aplicación no debería pedir acceso a cámara al abrirla por primera vez si el usuario todavía no
intenta escanear.

---

# 44. Performance

Optimizar lo que afecte operaciones reales.

Especialmente:

- abrir nueva venta;
- búsqueda;
- barcode lookup;
- confirmar venta;
- listar productos.

No realizar optimización prematura en áreas irrelevantes.

---

# 45. Estado global

No introducir automáticamente Redux, Zustand u otra solución global únicamente porque existe.

Primero verificar si:

- React local state;
- queries;
- repositories;

son suficientes.

Añadir estado global solo ante una necesidad clara.

---

# 46. Abstracciones

No crear interfaces y factories por cada clase únicamente para seguir patrones.

Una abstracción debe resolver un problema.

Regla:

> Si todavía no podemos explicar qué variación estamos abstraiendo, probablemente no necesitamos la
> abstracción.

---

# 47. Patrones

Los patrones de diseño son herramientas, no objetivos.

No implementar:

- repository;
- strategy;
- factory;
- observer;
- mediator;

solo para poder decir que el proyecto los utiliza.

---

# 48. Comentarios

No llenar el código con comentarios que repitan exactamente lo que dice.

Malo:

```ts
// Add quantity
stock += quantity;
```

Bueno:

```ts
// Negative stock is never included in the weighted-average-cost formula.
// A future purchase does not rewrite historical sale costs.
```

Comentar principalmente decisiones no obvias.

---

# 49. Nombres

Los nombres en código deben estar en inglés.

Ejemplo:

```text
Product
Sale
Purchase
InventoryMovement
```

La UI podrá estar localizada.

Esto facilita:

- ecosistema;
- documentación técnica;
- librerías;
- Codex;
- futura internacionalización.

---

# 50. Archivos

Evitar archivos gigantes.

Si un archivo supera una complejidad razonable, separar por responsabilidad.

Pero no fragmentar:

```text
calculateMargin.ts
calculateMarkup.ts
calculateProfit.ts
```

si pueden pertenecer coherentemente a un módulo `pricing`.

---

# 51. Código duplicado

Puede tolerarse una pequeña duplicación temporal antes de crear una abstracción incorrecta.

Regla:

> Preferimos duplicación pequeña y clara a una abstracción prematura difícil de entender.

---

# 52. Seguridad

No hardcodear:

- secrets;
- API keys privadas;
- tokens;
- credenciales.

Si posteriormente existe cloud, utilizar configuración y almacenamiento adecuados.

---

# 53. Dependencias remotas

Una falla de:

```text
analytics
crash reporting
cloud
```

nunca debe impedir:

```text
registrar compra
registrar venta
consultar inventario
```

---

# 54. Analytics

Los eventos analíticos deben ejecutarse después de completar correctamente la operación principal.

Nunca:

```text
analytics failed
→
sale failed
```

---

# 55. Feature flags

No introducir un sistema completo de feature flags inicialmente.

Si se necesita esconder una feature durante desarrollo, utilizar el mecanismo más simple que cumpla
el objetivo.

---

# 56. Internacionalización

No implementar un sistema complejo multiidioma durante la primera tarea salvo que se decida
formalmente.

Pero evitar hardcodear lógica de moneda dependiente de símbolos como:

```text
"$"
```

dentro del dominio.

---

# 57. Fechas

No depender de strings formateados visualmente como fuente de verdad.

La lógica deberá utilizar timestamps/fechas consistentes.

El formateo pertenece a presentación.

---

# 58. Zona horaria

No asumir que:

```text
createdAt === fecha comercial mostrada
```

en todo contexto futuro.

Respetar las diferencias definidas en el modelo.

---

# 59. Accesibilidad

Los componentes principales deben permitir:

- labels adecuados;
- áreas táctiles razonables;
- no depender solo del color.

No sacrificar accesibilidad básica por velocidad de implementación.

---

# 60. Código generado

Todo código generado por Codex se considera:

> código del proyecto.

Por tanto debe cumplir los mismos estándares que código escrito manualmente.

“No lo escribí yo, lo hizo Codex” no es una excepción a calidad.

---

# 61. Antes de comenzar una tarea

El agente deberá:

1. leer el ticket;
2. revisar documentación relevante;
3. inspeccionar código relacionado;
4. identificar tests existentes;
5. confirmar scope técnico.

No comenzar generando archivos inmediatamente sin revisar contexto.

---

# 62. Durante la tarea

Debe:

1. implementar el cambio mínimo;
2. agregar/actualizar tests;
3. ejecutar tests relevantes;
4. ejecutar typecheck;
5. revisar errores;
6. evitar cambios laterales innecesarios.

---

# 63. Después de la tarea

Debe proporcionar un resumen corto:

```text
Implementado:
- ...

Tests:
- ...

Decisiones:
- ninguna / ...

Pendiente:
- ...
```

No necesitamos un ensayo sobre cada cambio.

---

# 64. Si encuentra una contradicción

Debe detener la decisión afectada y reportar:

```text
docs/BUSINESS_RULES.md indica X,
pero esta tarea solicita Y.
```

No elegir silenciosamente.

---

# 65. Si encuentra una regla no definida

Ejemplo:

> “¿Qué pasa si el usuario intenta anular una compra antigua después de varias ventas?”

Si no existe regla suficientemente clara:

No inventar.

Reportar el edge case.

Podrá implementar el resto de la tarea que no dependa de esa decisión.

---

# 66. Si encuentra deuda técnica

No corregir automáticamente todo el proyecto.

Reportar:

```text
Technical debt found:
...
Suggested task:
...
```

Corregir únicamente si bloquea la tarea actual o si el cambio es pequeño y claramente seguro.

---

# 67. Commits

Cuando el agente tenga capacidad de crear commits:

Preferir commits pequeños y descriptivos.

Formato sugerido:

```text
feat(domain): add weighted average cost
fix(sales): preserve cost snapshot
test(inventory): cover negative stock
refactor(db): simplify product repository
```

---

# 68. No reescribir historial Git

No:

```text
git reset --hard
git push --force
```

sin solicitud explícita.

No eliminar trabajo existente del desarrollador para simplificar una implementación.

---

# 69. Archivos no relacionados

No modificar:

- configuraciones;
- documentación;
- estilos;
- dependencias;

si no están relacionadas con la tarea.

Evitar diffs gigantes.

---

# 70. Formatting

No reformatear automáticamente archivos completos que no se modificaron funcionalmente.

Esto dificulta revisión de código.

---

# 71. Definition of Done

Una tarea estará terminada cuando:

### Código

La funcionalidad solicitada está implementada.

### Tests

Los tests relevantes existen y pasan.

### Types

TypeScript pasa.

### Lint

No se introducen errores de lint.

### Persistence

Si aplica, migraciones existen.

### Errors

Se manejan estados razonables.

### Scope

No se agregaron funcionalidades no solicitadas.

### Docs

Si cambió una regla formal, se actualizó la documentación correspondiente.

---

# 72. Prohibiciones explícitas

Codex NO debe decidir autónomamente:

- cambiar React Native por Flutter;
- cambiar SQLite por otra base;
- añadir Firebase;
- añadir Supabase;
- introducir backend;
- agregar login;
- cambiar pricing;
- agregar anuncios;
- limitar productos Free;
- agregar IA;
- agregar Team;
- agregar sucursales;
- convertir el producto en POS;
- cambiar fórmulas financieras;
- bloquear stock negativo;
- cambiar modelo de costo;
- implementar cantidades fraccionarias.

Estas decisiones requieren cambio formal de producto/arquitectura.

---

# 73. Checklist para cada pull request

Antes de considerar listo un cambio:

```text
[ ] La tarea está dentro del scope.
[ ] Revisé los documentos relevantes.
[ ] No introduje features adicionales.
[ ] Los tests relevantes pasan.
[ ] TypeScript pasa.
[ ] No introduje `any` innecesario.
[ ] No instalé dependencias innecesarias.
[ ] Las migraciones existen si cambió DB.
[ ] Las operaciones críticas son atómicas.
[ ] No rompí funcionamiento offline.
[ ] No inventé reglas de negocio.
[ ] Revisé el diff completo.
```

---

# 74. Filosofía final

El objetivo del agente no es producir la mayor cantidad posible de código.

Es producir:

**el cambio correcto más pequeño posible.**

Prioridad:

```text
Correctitud
↓
Claridad
↓
Tests
↓
Simplicidad
↓
Velocidad
```

La velocidad de Codex es útil únicamente si nosotros podemos entender, revisar y confiar en lo que
produce.
