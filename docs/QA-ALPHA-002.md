# QA-ALPHA-002 — Regresión de pricing y gate de Alpha Freeze V1

**Fecha inicial:** 2026-09-11, America/Guayaquil. **Base inicial:** `5e4005a`.
**Rama inicial:** `qa/alpha-pricing-freeze`. **Estado:** validación física nueva pendiente;
freeze no aprobado. Esta revisión no implementa features ni modifica datos del dispositivo.

**Seguimiento BUG-QA-PRICE-001, 2026-09-12:** base `31ea4fc`, rama
`fix/purchase-pricing-physical-qa`. PR #64 integrado humanamente; ancestros `3a98e43` y `d322b67`
verificados antes de implementar. Solo fixes de regresión; sin features nuevas.

### Seguimiento — QA-PRICE-PHYS-001: PASS físico reportado

El responsable reporta fallo físico de claridad en el alta: «Precio de venta habitual» y
«Costo inicial por unidad» todavía obligan a interpretar la relación venta/compra.
Se aplica su propuesta únicamente a Nuevo producto:

- **Precio de venta por unidad**: «Lo que normalmente cobras al vender una unidad.»
- **Costo de compra inicial por unidad**: «Lo que te costó cada unidad de este stock inicial.»

Clasificación: UX / MEDIUM, sin defecto financiero ni de persistencia demostrado. Se mantienen
moneda, obligatoriedad, accesibilidad derivada del label y condición stock inicial > 0 para costo.
No cambian Domain, parser, valores, transacciones ni schema. Edición y detalle conservan su copy.
El test de terminología falla primero con el texto anterior; se actualiza con la nueva decisión.
**Retest 2026-09-12: PASS reportado por el responsable en iPhone.** Se validaron las dos etiquetas
y sus dos ayudas indicadas arriba; el responsable confirma que la diferencia entre precio de venta
y costo de compra queda clara. El FAIL inicial queda como antecedente resuelto por el fix `d322b67`.
No es una ejecución física de Codex ni una aprobación de otros escenarios. Las cifras y gates de §8
identifican la corrida base.

Validación del ajuste: terminología 8/8 (antes 7 PASS / 1 FAIL), `pnpm check` PASS con
1364/1364 tests (428 Domain, 414 Application, 522 Mobile/Infrastructure), `git diff --check` PASS,
exports iOS 1435 módulos y Web 895 módulos PASS. Logs `%TEMP%/stockapp-alpha002-copy-{check,ios,web}.log`.
No se repitió Doctor para ese cambio de copy. El impedimento se cerró en BUG-QA-PRICE-001: 21/21 PASS.

### Seguimiento — QA-PRICE-PHYS-006: FIX IMPLEMENTED / RETEST REQUIRED

El 2026-09-12 el responsable reporta que no aparece el editor pese a existir un costo posterior
calculable. Ejemplo físico transcrito: precio habitual USD 7.84, costo anterior USD 8.63,
margen anterior -10.00%, costo actual USD 7.65 y margen actual 2.43%. Son valores mostrados/reportados,
no una medición de las unidades escaladas internas. En este ejemplo el costo disminuye; se conserva
el ID 006 utilizado por el responsable sin clasificar la operación como aumento de costo.

**Expected reportado:** poder indicar un margen deseado tras una Purchase con costo calculable.
**Actual:** el margen anterior negativo oculta el editor y no permite elegir otro porcentaje.
**Estado:** FIX IMPLEMENTED / RETEST REQUIRED. El FAIL físico original se conserva como antecedente.

Causa anterior: elegibilidad y recomendación dependían de `getInitialPurchaseMargin`, que rechazaba
el margen anterior fuera de `[0, 100%)`. BUG-QA-PRICE-001 aprobó separar esas responsabilidades y
actualizar BUSINESS_RULES §21 / UX §20. Ahora costo actual conocido positivo habilita el editor,
independientemente de cambio de costo, precio cero o margen previo inválido. La referencia es:
anterior válido → actual válido → vacío. Vacío no produce error, candidato ficticio ni escrituras.
Costo null no se inventa; costo cero conocido conserva la ausencia de resultado del Domain vigente.
Overflow de un candidato permite seguir editando. No hay recomendación de bajada.

### Seguimiento — Precisión visible en inputs: FIX IMPLEMENTED / RETEST REQUIRED

El 2026-09-12 el responsable reporta exposición de los seis decimales internos en inputs.
El resultado solicitado es dinero y porcentaje con **dos decimales por defecto**, conservando
la precisión actual de los cálculos internos. No se interpreta como una nueva precisión monetaria
ni como autorización para limitar a dos decimales toda entrada manual.

La causa era la serialización a seis decimales en `formatMoneyForInput` y
`createInitialPurchaseMarginText`. Ahora el formato inicial es de dos decimales, sin sustituir
el Money/Percentage original: Product Edit conserva original + texto + dirty; el margen obtiene
la referencia exacta del resultado inmutable y mantiene dirty; Sale ya separaba Money y texto.
Solo onChangeText sustituye el valor semántico mediante el parser exacto, incluso si el usuario
reescribe el mismo texto visible. La entrada manual admite seis decimales y coma/punto.

**Estado:** FIX IMPLEMENTED / RETEST REQUIRED. Tests cubren guardar otro atributo sin redondear,
cantidad de Sale sin editar precio, margen exacto versus editado y persistencia SQLite.
Los límites `99.999999% → 100.00` y `0.000001 → 0.00` son solo presentación; el valor original
sigue válido sin editar, sin clamps. Editar explícitamente aplica la validación del nuevo valor.

## 1. Procedencia y límites de la evidencia

El ticket del responsable reporta PASS físico previo en iPhone para startup, persistencia,
Products, low stock, Home, Sales, Purchases, Adjustments, History, detalles, anulaciones de Sale
y Purchase y barcode en Products/Sale/Purchase. También reporta Backup, Restore, recovery
A → B → Restore A → restart, archivo inválido y persistencia posterior al Restore.
Se conserva ese resultado como **PASS reportado por el responsable**, no como una nueva ejecución
de Codex. No se repite QA-ALPHA-001 ni se solicita borrar la base de datos.

La regresión de pricing de este ticket sucede después de UX-PRICE-001 y PURCHASE-PRICE-002.
Se recibieron el FAIL inicial y el posterior PASS físico de QA-PRICE-PHYS-001, y el FAIL de
QA-PRICE-PHYS-006 descritos arriba, además del FAIL / UX transversal de precisión en inputs.
BUG-QA-PRICE-001 también aporta PASS físico reportado de QA-PRICE-PHYS-002 (Sale/Detail).
Los fixes de 006 y precisión no tienen retest físico; los demás resultados y el smoke siguen pendientes.
Los tests Node, las inspecciones de fuentes y los exports no prueban teclado, cámara, reinicio
de Expo Go, share sheet ni persistencia en el iPhone.

## 2. Git y entorno

- PR [#62](https://github.com/ian0000/StockApp/pull/62) integrado mediante merge humano.
- CI del commit `8d41f25`: Quality checks y GitGuardian completados con `success`.
- `main` sincronizado por fast-forward a `5e4005a`; árbol limpio antes de crear la rama QA.
- Ancestros comprobados: UX-PRICE-001 `174d0a0`, alineación Expo `50eaa9e` y
  PURCHASE-PRICE-002 `8d41f25`.
- Windows; Node `22.16.0`; pnpm `11.0.9`.
- Expo `57.0.22` / SDK 57; React Native `0.86.3`; React `19.2.3`.
- Versión instalada de Expo Go, modelo de iPhone e iOS: no informados para esta regresión.
- Sin nuevas dependencias ni cambios de schema, migraciones o Backup `formatVersion = 1`.

## 3. Revisión documental

| Decisión vigente | Fuentes revisadas | Resultado |
| --- | --- | --- |
| Precio de venta habitual obligatorio; cero conocido no es precio desconocido | PRODUCT §8/§9, MVP §4, BUSINESS_RULES §12, UX §40, DATA_MODEL §10 | Consistente |
| Costo desconocido distinto de cero; Sale sin costo conserva null y ganancia no disponible | MVP §5/§14, BUSINESS_RULES §25/§28, DATA_MODEL §14/§19/§20, UX §40 | Consistente |
| Margen deseado transitorio, sin columna ni configuración persistida | BUSINESS_RULES §21/§24, UX §20, DATA_MODEL §33 | Consistente |
| Sugerir únicamente aumento; conservar habitual si calculado <= habitual | BUSINESS_RULES §24, UX §20, seguimiento PURCHASE-PRICE-002 de QA-PRICE-001 | Contradicción anterior resuelta |
| Promociones/descuentos POST-ALPHA | BUSINESS_RULES §24, UX §20, ROADMAP §20 | Fuera del freeze |
| Expo seleccionado y arquitectura local | ARCHITECTURE §2/§5, manifiesto mobile y lockfile | SDK 57 verificado; arquitectura no fija un patch |
| Backup lógico V1 y Restore REPLACE atómico | ARCHITECTURE §22, DATA_MODEL §51, UX §35, ROADMAP §20 | Ocho colecciones; null y cero preservados |

QA-PRICE-001 conserva expresamente su investigación original como evidencia histórica. Sus
pendientes anteriores no invalidan el seguimiento que registra PURCHASE-PRICE-002 como resuelto.
ROADMAP se actualiza para distinguir la QA física previa reportada de la regresión nueva pendiente;
no se marca `Alpha readiness: PASS` ni `V1 Alpha feature freeze: COMPLETE`.

## 4. Matriz de pricing

`PASS` en Automated se limita a la lógica/copy cubierta por las suites indicadas en §5.
`PARCIAL` identifica un alcance que no equivale al escenario físico completo.
Salvo los PASS de 001/002 y el FAIL original de 006 reportados por el responsable, los resultados físicos son
**NOT EXECUTED**.
`PENDIENTE` no significa un defecto reproducido.

| Scenario | Automated | Physical | Result |
| --- | --- | --- | --- |
| QA-PRICE-PHYS-001 — Terminología Product | PASS — test actualizado al copy aprobado | PASS reportado en iPhone, 2026-09-12; etiquetas y ayudas del alta | PASS |
| QA-PRICE-PHYS-002 — Terminología Sale/Detail | PASS — copy y snapshots | PASS reportado en BUG-QA-PRICE-001 | PASS |
| QA-PRICE-PHYS-003 — Terminología Purchase/Detail | PASS — copy y snapshots | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-004 — Sale con costo desconocido / antiguo PHYS-019 | PASS — UNKNOWN/null, ganancia no disponible | NOT EXECUTED | PENDIENTE, bloquea freeze |
| QA-PRICE-PHYS-005 — Costo conocido cero | PASS — KNOWN/0, ganancia calculada | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-006 — Editor tras cambio de costo / margen anterior negativo | PASS — elegibilidad independiente y fallback actual | FAIL original en iPhone; fix sin retest físico | FIX IMPLEMENTED / RETEST REQUIRED |
| QA-PRICE-PHYS-007 — Editar margen | PASS — recalcula sin escrituras SQLite | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-008 — Aceptar aumento | PASS — actualiza Product; compra/stock/movimientos intactos | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-009 — Precio aceptado tras reinicio | PARCIAL — write/read SQLite probado, no cierre/reapertura de app | NOT EXECUTED | PENDIENTE, bloquea freeze |
| QA-PRICE-PHYS-010 — Mantener precio | PASS — cero escrituras adicionales | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-011 — Baja de costo sin recomendar reducción | PASS — precio suficiente, sin CTA inferior | NOT EXECUTED | PENDIENTE, bloquea freeze |
| QA-PRICE-PHYS-012 — Igualdad exacta | PASS — mantener, cero update | NOT EXECUTED | Exención física permitida si es impráctica |
| QA-PRICE-PHYS-013 — Cruce dinámico suficiente/aumento/suficiente | PASS — árbol de confirmación y helpers | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-014 — 0% | PASS — válido, sin reducción | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-015 — Cercano a 100% | PASS — cálculo con 99%; parser con 99.999999 | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-016 — 100% | PASS — rechazado | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-017 — Mayor que 100% | PASS — rechazado | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-018 — Negativo | PASS — rechazado | NOT EXECUTED | Condicional a teclado; no se asume inaccesible |
| QA-PRICE-PHYS-019 — Decimal punto/coma | PASS — 30.5 y 30,5 exactos | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-020 — Seis decimales | PASS — precisión exacta; séptimo decimal rechazado | NOT EXECUTED | Físico si resulta práctico |
| QA-PRICE-PHYS-021 — Sin margen inicial válido | PASS — no inventa porcentaje | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-022 — Compra desde déficit | PASS — costo real posterior, sin ponderar déficit | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-023 — Single-flight | PARCIAL — controles deshabilitados; guard ref inspeccionado, sin prueba de doble tap de pantalla | NOT EXECUTED | PENDIENTE |
| QA-PRICE-PHYS-024 — Retry | PASS — fallo SQLite/retry solo Product | NOT EXECUTED | No bloquea por sí solo si fallo físico no reproducible |

## 5. Evidencia automatizada de pricing e integridad

- [Terminología](../apps/mobile/test/price-terminology.test.ts): etiquetas reales en fuentes y
  accesibilidad, sin sustituir revisión visual nativa.
- [RegisterSale](../packages/application/test/register-sale.test.ts) y
  [presentación de Sale Detail](../apps/mobile/test/sale-details-presentation.test.ts): costo
  desconocido conserva `UNKNOWN`/null y «No disponible»; cero conocido conserva `KNOWN`/Money.zero().
- [Política post-compra](../packages/application/test/purchase-price-analysis.test.ts): margen
  anterior exacto, igualdad, bajada, aumento, 0%, 99%, inválidos y overflow. La suite nueva
  [disponibilidad](../packages/application/test/purchase-margin-availability.test.ts) cubre
  anterior válido/negativo, fallback actual, vacío, costo sin cambios, precio cero, null/cero y overflow.
- [Presentación/input/confirmación](../apps/mobile/test/purchase-price-presentation.test.ts):
  parsing sin floats, seis decimales, cruce de estados, acciones y input bloqueados al guardar.
  Los controles nativos se sustituyen por primitivas host en estas pruebas Node.
- [Persistencia de margen](../apps/mobile/test/purchase-margin-persistence.test.ts): SQLite real
  en memoria con las migraciones y repositorios Drizzle. Editar varios porcentajes no cambia
  `total_changes()`. Aceptar solo actualiza Product. Snapshots de compras, movimientos, stock,
  ventas, líneas y ajustes permanecen idénticos; una sola Purchase.
- La misma suite fuerza un fallo de UPDATE mediante trigger en su DB de test y confirma que el
  retry solo cambia Product, sin repetir Purchase. No se instrumentó ni manipuló la DB del iPhone.
- [RegisterPurchase](../packages/application/test/register-purchase.test.ts): costo promedio
  positivo y costo de entrada desde déficit; un único movimiento PURCHASE por compra.
- [Pantalla de compra](../apps/mobile/src/app/purchase.tsx): `updatingPriceRef` se activa antes del
  await y bloquea una segunda llamada; no se declara doble tap físico aprobado por esta inspección.

**No automatic price decrease recommendation: PASS (automatizado).**
Precio matemático = costo / (1 - margen / 100); no markup. Solo si supera el habitual se ofrece
el aumento. Ejemplo automatizado: costo 12 → 10, precio 15 y margen 20% producen candidato 12.50,
pero precio accionable 15, sin update. La matemática pura no se alteró.

En SQLite de test, precio 10, costo anterior 7 y compra a 8 inicializan margen 30%; aceptar 30%
guarda exactamente 11.428571, no el texto mostrado a dos decimales. Editar no cambia el costo ni el
stock; mantener no escribe; el precio aceptado se lee de SQLite. Reinicio físico aún no ejecutado.

**PHYS-019 antiguo:** Unknown cost Sale: automated PASS / physical NOT EXECUTED.
**Costo cero conocido:** automated PASS / physical NOT EXECUTED.
No confundir el PHYS-019 antiguo con QA-PRICE-PHYS-019, que verifica separadores decimales.

## 6. Preparación física mínima, sin borrar datos

Ejecutar sobre la base integrada indicada y anotar operador, fecha, iPhone/iOS/Expo Go, resultados
y evidencia por ID. Usar productos de prueba identificables, sin editar la DB a mano ni reinstalar.

- **Desconocido:** crear Product con precio 1, stock inicial 0 y costo vacío; vender una unidad
  aceptando stock insuficiente. Esperar stock -1 y costo/ganancia históricos no disponibles.
- **Cero conocido:** crear otro Product con precio 1, stock inicial 2 y costo explícito 0;
  vender una unidad. Esperar costo histórico 0, ganancia 1 y stock 1, no «No disponible».
- **Aumento/editor:** crear Product con stock 10, costo 7 y precio 10; comprar 10 a costo 9.
  Esperar stock 20, costo promedio 8 y margen inicial 30%. Probar 0, 20 (igualdad exacta), 30,
  35, 99, 100, 105, -1 si accesible, 30.5/30,5 y 30.123456. No aceptar el precio de 99%.
  Volver a 30 y aceptar: precio interno 11.428571, presentación habitual 11.43. Reiniciar
  completamente y comprobar precio, stock y una sola compra en History.
- **Bajada:** otro Product con stock 10, costo 8 y precio 12; comprar 10 a costo 4.
  Costo promedio resultante 6, stock 20. Con margen 20% el candidato es 7.50 y se mantiene 12;
  con 50% hay igualdad y con 60% candidato 15. Volver a 20% y mantener: no bajar Product.
- **Déficit:** crear Product con stock 1, costo 7 y precio 10; vender 3 y comprar 1 a costo 8.
  Esperar stock -1 y costo 8, sin ponderar stock negativo ni reescribir el costo de la venta.
- **Sin referencia:** usar precio habitual cero y primera compra con costo positivo: editor vacío,
  sin inventar margen. Con precio positivo puede existir margen actual válido y usarse como fallback.
  No mezclarlo con el caso desconocido antes de observar su Sale.
- Registrar doble tap durante aceptación; comparar una sola compra, stock e historial antes/después.
  Si no hay fallo natural para retry, conservar NOT EXECUTED físico según la exención del ticket.
  No afirmar cero UPDATEs físicos únicamente mirando History; esa garantía también tiene evidencia
  SQLite automatizada separada.

## 7. Smoke crítico post-pricing

| Scenario | Comprobación | Physical | Result |
| --- | --- | --- | --- |
| SMOKE-001 | Sale simple; stock, History, Home | NOT EXECUTED | PENDIENTE |
| SMOKE-002 | Purchase simple; stock, costo, History | NOT EXECUTED | PENDIENTE |
| SMOKE-003 | Anular una Sale o Purchase elegible | NOT EXECUTED | PENDIENTE |
| SMOKE-004 | Barcode de producto existente | NOT EXECUTED | PENDIENTE |
| SMOKE-005 | Backup con share sheet | NOT EXECUTED | PENDIENTE |
| SMOKE-006 | Abrir Restore y cancelar selector | NOT EXECUTED | PENDIENTE |

El PASS físico previo reportado en §1 no se reutiliza como resultado nuevo de estos seis smokes.

## 8. Regresión automatizada y exports

La tabla siguiente conserva la corrida inicial de QA-ALPHA-002. Su impedimento Doctor fue resuelto;
los resultados nuevos del fix se registran al final de esta sección.

| Gate ejecutado | Resultado |
| --- | --- |
| `pnpm test` | PASS: Domain 428/428, Application 414/414, Mobile/Infrastructure 522/522; total 1364/1364; shared 0 esperado |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |
| `pnpm check` | PASS tras documentación: format, lint, typecheck y 1364 tests |
| `git diff --check` | PASS |
| `pnpm --filter @stock-app/mobile exec expo install --check` | PASS: Dependencies are up to date |
| `pnpm dlx expo-doctor@latest` desde apps/mobile | NO PASS: comprobación remota de schema Expo bloqueada por DNS; dos intentos |
| `pnpm --filter @stock-app/mobile db:generate` | PASS: 8 tables; No schema changes, nothing to migrate |
| `pnpm --filter @stock-app/mobile exec expo export --platform ios --output-dir .expo/qa-alpha002-ios` | PASS: 1435 módulos |
| `pnpm --filter @stock-app/mobile exec expo export --platform web --output-dir .expo/qa-alpha002-web` | PASS: 895 módulos |

Expo Doctor inició 21 comprobaciones y reportó una fallida: `Check Expo config (app.json/
app.config.js) schema`, `TypeError: fetch failed`, `getaddrinfo EAI_AGAIN exp.host`.
La comprobación independiente de DNS también falló. No es evidencia de schema de app inválido,
pero entonces no se registró 21/21 ni se saltó la validación remota. Ese resultado es histórico.

Logs locales de esta corrida: `%TEMP%/stockapp-alpha002-{tests,typecheck,lint,format,check,ios,doctor-retry,web}.log`.
Exports ignorados por Git bajo `apps/mobile/.expo/qa-alpha002-{ios,web}`.
La configuración existente de Prettier excluye los documentos canónicos de `docs/`; se mantiene
su estilo Markdown y se revisa el diff documental manualmente, sin reformatear otros archivos.

### Corrida BUG-QA-PRICE-001 — 2026-09-12

- `pnpm test`: PASS, Domain **428/428**, Application **424/424**, Mobile/Infrastructure **544/544**;
  total **1396/1396** (+32: 10 Application y 22 Mobile), shared 0 esperado. Sin reducir suites.
- Test-first: disponibilidad falló antes del export/implementación; precisión tuvo 75 PASS / 12 FAIL.
  Después, suites focalizadas 36/36 Application, 120/120 Mobile y 49/49 presentación/persistencia.
  Typecheck detectó tres aserciones redundantes en tests nuevos; se corrigieron y pasó nuevamente.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` y `git diff --check`: PASS.
- `pnpm check`: PASS, formato → lint → typecheck → 1396 tests, sin saltar workspaces.
- `pnpm --filter @stock-app/mobile exec expo install --check`: PASS, dependencias actualizadas.
- Desde `apps/mobile`, `pnpm dlx expo-doctor@latest --verbose`: **21/21 checks passed**,
  versión ejecutada 1.20.4. GATE-02 cerrado; sin workaround ni limpieza de dependencias.
- `pnpm --filter @stock-app/mobile db:generate`: **8 tables; No schema changes, nothing to migrate**.
- `pnpm --filter @stock-app/mobile exec expo export --platform ios --output-dir .expo/bug-qa-price001-ios`:
  PASS — **1435 módulos**.
- Mismo comando con `--platform android --output-dir .expo/bug-qa-price001-android`:
  PASS — **1570 módulos**; no es smoke físico Android.
- Mismo comando con `--platform web --output-dir .expo/bug-qa-price001-web`:
  PASS — **895 módulos**; Web sigue preview.
- Aviso no bloqueante de consola: `NO_COLOR` ignorado cuando `FORCE_COLOR` está definido.
  No se modificó el entorno global para ocultarlo.
- SQLite real de test: guardar Product sin tocar `7.84` conserva **7_840_909** unidades;
  escribir `7.50` guarda **7_500_000**. Margen original `4.000008%` mostrado `4.00` guarda candidato
  **27_083_336**; reescribir `4.00` guarda **27_083_333**. Compra/stock/movimientos no se repiten.
- Logs `%TEMP%/stockapp-pricing-fix-{tests,typecheck,lint,format,check,doctor,ios,android,web}.log`.
  Exports ignorados por Git bajo `.expo/bug-qa-price001-*`.

## 9. Backup / Restore y schema freeze

PASS automatizado en [CreateBackup](../packages/application/test/create-backup.test.ts),
[Restore](../packages/application/test/restore-backup.test.ts),
[snapshot SQLite](../apps/mobile/test/sqlite-backup-snapshot-reader.test.ts) y
[transacción Restore](../apps/mobile/test/sqlite-backup-restore-transaction.test.ts).

- Backup V1: snapshot consistente de ocho colecciones, IDs, timestamps, Money, null/cero.
- Restore V1: validación antes de escribir; REPLACE atómico con FK; documentos inválidos rechazados.
- Rollback: cada fase de reemplazo y fallo de finalización conserva la DB anterior.
- Roundtrip Backup → Restore → Backup: igualdad exacta del dataset, con archivados, VOIDED,
  REVERSAL, costo desconocido y cero.
- Importación/composición native sin self-cycle cubierta por la suite existente.
- Ocho tablas: inventories, products, inventory_states, inventory_movements, sales, sale_items,
  purchases, stock_adjustments. Sin alteración de schema, migraciones o formato.

## 10. Defectos e impedimentos

No se encontró un defecto BLOCKER/HIGH reproducido en la regresión automatizada ni en la revisión
de pricing. Eso no sustituye las pruebas físicas que faltan. El seguimiento posterior registra
una corrección de copy por FAIL / UX del responsable.

| ID | Severity / clase | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| QA-ALPHA-002-GATE-01 | Gate bloqueante de evidencia | Pricing principal, PHYS-019, restart y smoke nuevos aprobados en iPhone | 001/002 PASS; 006 y precisión requieren retest; demás escenarios y smoke pendientes | OPEN |
| QA-ALPHA-002-GATE-02 | Gate de entorno | Expo Doctor 21/21 | Repetido desde apps/mobile: 21/21 checks passed | CLOSED — PASS, 2026-09-12 |
| QA-PRICE-PHYS-001-UX | MEDIUM / claridad de alta | Diferenciar venta y compra inicial sin interpretación | Retest en iPhone confirma claridad con las nuevas etiquetas y ayudas | CLOSED — PASS reportado, 2026-09-12 |
| QA-PRICE-PHYS-006-PRODUCT-UX | Producto/UX | Editor con costo posterior calculable aunque margen previo sea negativo | Elegibilidad separada e inicialización anterior → actual → vacío, tests PASS | FIX IMPLEMENTED / RETEST REQUIRED |
| QA-PRICE-INPUT-PRECISION | UX; identificador de seguimiento local | Dinero y porcentaje a dos decimales por defecto; precisión interna intacta | Texto a dos decimales, valor exacto preservado hasta edición, tests PASS | FIX IMPLEMENTED / RETEST REQUIRED |

El fallo DNS histórico no motivó cambios de dependencias; Doctor PASS corresponde a una nueva ejecución real.
Si la ejecución física descubre un defecto de datos, pricing, Sale/Purchase o recovery, registrar
ticket específico BLOCKER/HIGH y no declarar freeze. No abrir una tarea de polish por esta revisión.

## 11. Deferred / Post-Alpha

Conforme a ROADMAP §20/§22/§31/§42/§43 y las exclusiones de MVP/ARCHITECTURE/este ticket:

- DEFERRED: Undo inmediato; vista dedicada de archivados/desarchivado; StockAdjustment Void
  (excluido de V1); scanner en Adjustment.
- POST-ALPHA: promociones/descuentos, backup automático, cifrado de backup, cloud backup,
  sync, auth, multi-inventory, charts/analytics, imágenes, monetización completa y distribución pública.

No se implementa ninguno. Los aplazamientos no justifican omitir pricing físico o recuperación.

## 12. Decisión y continuación

**V1 ALPHA FREEZE: FAIL**

**ALPHA NOT READY**

Motivo: los fixes de QA-PRICE-PHYS-006 y precisión están implementados, pero falta su retest físico,
otros resultados obligatorios de pricing iOS y el smoke físico Android. Expo Doctor ya no está pendiente.
No demuestra corrupción de datos ni una fórmula incorrecta.

Después de PR y merge humanos, repetir primero sin borrar datos:

- RETEST-A: margen anterior negativo / actual válido; editor visible con fallback a dos decimales.
- RETEST-B: escribir 30%; precio sugerido correcto y aceptación explícita.
- RETEST-C: Sale con precio interno de más de dos decimales; precarga visible a dos.
- RETEST-D: confirmar sin editar; no redondeo silencioso. La suite exacta es autoridad para precisión.
- RETEST-E: costo baja; no recomendación de reducir precio habitual.

Luego continuar QA-ALPHA-002 y smoke Android. Solo con evidencia suficiente y sin BLOCKER/HIGH abierto
se podrá declarar `V1 Alpha feature freeze: COMPLETE` / `Alpha readiness: PASS`.
No nuevas features ni declaración Production Ready/App Store Ready.
