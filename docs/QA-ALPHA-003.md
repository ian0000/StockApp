# QA-ALPHA-003 — Cierre y freeze de V1 Alpha

**Fecha:** 2026-09-12, America/Guayaquil. **Alcance:** QA final, documentación y baseline freeze.
No se implementan features ni se modifican código funcional, dependencias o datos de dispositivos.

```text
V1 Alpha feature development: COMPLETE
V1 Alpha feature freeze: COMPLETE
Alpha readiness: PASS
V1 ALPHA FREEZE: PASS
ALPHA READY
```

Esta declaración corresponde exclusivamente a Alpha controlada. No certifica preparación para
Beta, producción, App Store o Play Store. La distribución pública sigue fuera de este alcance.

## 1. Base y procedencia Git

- Baseline funcional: `8d4130f786a92485b6ab8a0521bc3dd15443f4d7`.
- [PR #65](https://github.com/ian0000/StockApp/pull/65) integrado humanamente con merge commit:
  `fix/purchase-pricing-physical-qa` → `main`.
- `git merge-base --is-ancestor cc5e7d3 origin/main`: exit code 0; fix y documentación incluidos.
- `git switch main` y `git pull --ff-only`: sincronizados, árbol limpio.
- Rama de cierre: `qa/alpha-final-freeze`, creada desde esa base limpia.
- Commit previsto para este cierre documental: `chore(qa): freeze v1 alpha baseline`.
  Su hash identifica la revisión documental, no una nueva versión del código funcional.
- El usuario crea el PR y decide su merge; Codex no integra automáticamente.

Documentos revisados: AGENTS, PRODUCT, MVP, BUSINESS_RULES, UX, DATA_MODEL, ARCHITECTURE,
ROADMAP, QA-PRICE-001 y QA-ALPHA-002. Se conservan las decisiones financieras y de persistencia.

## 2. Entorno verificado

| Componente | Versión |
| --- | --- |
| Host | Windows / PowerShell |
| Node | 22.16.0 |
| pnpm | 11.0.9 |
| Expo | 57.0.22 / SDK 57 |
| React | 19.2.3 |
| React Native | 0.86.3 |
| Expo Doctor ejecutado | 1.20.4 |

Versiones instaladas comprobadas mediante Node/pnpm y listado de dependencias del workspace.
Modelos/versiones concretas de iPhone, iOS, Expo Go y AVD Android no fueron aportados en el reporte
final; no se inventan. No se atribuye a los dispositivos una medición hecha en el host.

## 3. Regresión final ejecutada por Codex

| Suite | Resultado |
| --- | --- |
| Domain | 428/428 PASS |
| Application | 424/424 PASS |
| Mobile/Infrastructure | 544/544 PASS |
| Total | 1396/1396 PASS |
| Shared | 0 tests, esperado; participa en el workspace |

La cantidad coincide con la base anterior: sin reducción silenciosa, sin tests nuevos ni retirados.

| Comando | Resultado |
| --- | --- |
| `pnpm test` | PASS, 1396 tests |
| `pnpm typecheck` | PASS, todos los workspaces |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |
| `pnpm check` | PASS, formato → lint → typecheck → test |
| `git diff --check` | PASS |
| `pnpm --filter @stock-app/mobile exec expo install --check` | PASS, Dependencies are up to date |
| Desde `apps/mobile`: `pnpm dlx expo-doctor@latest --verbose` | PASS, 21/21 checks passed |
| `pnpm --filter @stock-app/mobile db:generate` | PASS, 8 tables; No schema changes, nothing to migrate |

No se evitó ninguna comprobación remota de Doctor; el impedimento DNS de QA-ALPHA-002 permanece
cerrado. No se añadió `metro-cache` ni se alteró el node_modules global del usuario.

## 4. Exports ejecutados por Codex

| Comando desde raíz | Resultado |
| --- | --- |
| `pnpm --filter @stock-app/mobile exec expo export --platform ios --output-dir .expo/qa-alpha003-ios` | PASS — 1435 módulos |
| `pnpm --filter @stock-app/mobile exec expo export --platform android --output-dir .expo/qa-alpha003-android` | PASS — 1570 módulos |
| `pnpm --filter @stock-app/mobile exec expo export --platform web --output-dir .expo/qa-alpha003-web` | PASS — 895 módulos |

Web continúa como preview no persistente. Un export no demuestra funcionamiento físico de cámara,
permisos, share sheet, selector de archivos o reinicio. Los exports quedan ignorados bajo `.expo`.
Aviso no bloqueante de entorno: `NO_COLOR` ignorado cuando `FORCE_COLOR` está definido.

Logs locales: `%TEMP%/stockapp-alpha003-{tests,typecheck,lint,check,doctor,ios,android,web}.log`.
Formato, dependencia Expo y generación de schema también se ejecutaron directamente en la sesión.

## 5. Schema, Backup y Restore

Ocho tablas de negocio sin cambios: `inventories`, `products`, `inventory_states`,
`inventory_movements`, `sales`, `sale_items`, `purchases`, `stock_adjustments`.
No se genera migración ni se cambia `formatVersion = 1`.

| Garantía | Evidencia de la suite final |
| --- | --- |
| Backup V1 | `create-backup.test.ts` y `sqlite-backup-snapshot-reader.test.ts`: snapshot consistente, ocho colecciones y valores exactos |
| Restore V1 | `restore-backup.test.ts` y `sqlite-backup-restore-transaction.test.ts`: validación previa, REPLACE atómico, adopción del Inventory restaurado |
| Rollback | Fallos en delete/inserción de cada colección y finalización preservan el dataset anterior |
| Roundtrip | Backup → Restore → Backup conserva exactamente el dataset; restaurar dos veces no crea duplicados |
| Native bootstrap | `sqlite-native-backup-imports.test.ts`: adapters iOS/Android importables y componibles sin self-cycles |

Todas estas pruebas pasan en la corrida final. Son pruebas automatizadas, incluidas integraciones
SQLite de test; no implican haber manipulado la base del teléfono. Backup, Restore y recovery iOS
tienen además PASS reportado por el responsable.

## 6. Revisión financiera y UX de pricing

| Regla conservada | Evidencia |
| --- | --- |
| Precio habitual obligatorio | MVP §4, BUSINESS_RULES §12, Product Money obligatorio y tests create/edit/Restore |
| Costo desconocido distinto de cero | BUSINESS_RULES §25/§28, DATA_MODEL §14/§20; suites Sale/Backup/Restore conservan null frente a cero |
| Margen deseado transitorio, margen y no markup | BUSINESS_RULES §18–24, UX §20; tests Application y ausencia de columna targetMargin |
| Editor independiente del margen anterior | Costo actual conocido positivo; anterior válido → actual válido → vacío; tests `purchase-margin-availability.test.ts` y retest reportado |
| No automatic price decrease recommendation | Tests de candidato mayor/igual/menor, confirmación y persistencia; Conservative pricing PASS reportado |
| Display inicial 2 / precisión interna 6 | Tests Product Edit, Sale cart y margen; Input precision PASS reportado |
| No silent rounding | Valor original separado de texto/dirty; tests unitarios y SQLite exacto, sin inferir precisión por observar el display |

Costo actual null no se inventa; conocido cero conserva la ausencia de sugerencia del Domain
existente. No se cambia la matemática, el rango `[0, 100%)` del editor ni la precisión manual de
hasta seis decimales con punto/coma. Cambiar margen no escribe; aceptar actualiza solo Product,
sin otra Purchase ni movimientos extra.

Prueba exacta: Product `7.840909` muestra `7.84` y se conserva si no se edita. Margen `4.000008%`
mostrado `4.00` conserva su referencia exacta; reescribir `4.00` utiliza ese nuevo valor.
La suite automatizada, no la inspección visual, es la autoridad de estas unidades internas.

## 7. QA iOS — evidencia reportada, no ejecutada por Codex

```text
Physical execution source: User/device validation
iOS physical QA: PASS
```

Fuente: reporte del responsable en el ticket de cierre Alpha y mensajes de retest de esta tarea.
Cobertura reportada: Startup, persistencia, Products, Low Stock, Home, Sales, Purchases,
Adjustments, History, Details, Sale Void, Purchase Void, Barcode, Backup, Restore, recovery,
pricing, margen editable, política conservadora, terminología y precisión visible.

| Finding identificado | Cierre reportado |
| --- | --- |
| QA-PRICE-PHYS-001 — Terminología Product | PASS; etiquetas y ayudas claras |
| QA-PRICE-PHYS-002 — Terminología Sale | PASS |
| QA-PRICE-PHYS-006 — Editor | PASS; margen anterior negativo no lo oculta, fallback actual y recálculo correctos |
| Input precision | PASS; dinero y porcentaje con dos decimales visibles |
| Conservative pricing | PASS; no recomienda bajar automáticamente el precio |

Findings anteriores cerrados; no se reinterpreta el FAIL inicial como inexistente. El reporte final
declara los bloques completos, no proporciona una planilla nueva por cada ID de QA-ALPHA-002.
Por eso no se inventan timestamps, capturas ni PASS individuales de casos límite o fallos inducidos.
El cierre de producto/QA acepta esa evidencia por bloques, junto con la suite exacta.

## 8. Android — tres niveles distintos

```text
Android export: PASS
Android emulator smoke: PASS
Android physical smoke: PENDING / DEFERRED VALIDATION
```

- Export: ejecutado por Codex en esta regresión, 1570 módulos.
- Emulator smoke: **PASS reportado por el usuario**, no ejecutado por Codex. Cobertura informada:
  Startup, restart/persistence, Product, Sale, Purchase, editable margin, Void, Barcode flow,
  Backup, Restore, inputs y navegación Android.
- Teléfono físico: **no ejecutado**. Clasificación **DEFERRED VALIDATION / TESTING**,
  específicamente testing / platform validation, no feature.

Por decisión explícita de producto/QA, Android físico no bloquea este freeze: export Android,
smoke de emulador y suite automatizada compartida pasan. Esa decisión no equivale a certificar
periféricos o diferencias entre fabricantes.
Cuando haya dispositivo real, comprobar especialmente cámara/barcode, permisos, share sheet,
filesystem, document picker y comportamiento específico de fabricante/dispositivo.

## 9. Gates y defectos

- Automated regression, Expo install check, Doctor 21/21 y exports iOS/Android/Web: PASS ejecutados.
- Schema unchanged y Backup/Restore/rollback/roundtrip: PASS automatizados.
- iOS physical QA y Android emulator smoke: PASS reportados por el responsable.
- QA-ALPHA-002-GATE-01: CLOSED por reporte final y retests; GATE-02: CLOSED, Doctor 21/21.
- No blocking defects found. Ningún BLOCKER/HIGH identificado en esta regresión o reportado abierto.
- Android físico: pendiente explícitamente no bloqueante; no se registra Android physical PASS.

No encontrar defectos bloqueantes no garantiza ausencia absoluta de bugs. Un defecto posterior de
datos, compatibilidad o UX crítica requiere evaluación y corrección, sin ampliar el scope por polish.

## 10. Deferred / Post-Alpha

Fuera de V1 Alpha: promociones/descuentos; Undo inmediato; vista dedicada de archivados/unarchive;
StockAdjustment Void; scanner Adjustment; backup automático; cifrado de backup; cloud backup;
sync; auth; multi-inventory; charts/analytics; imágenes; monetización completa; distribución pública.

Validación diferida, no feature: **Android physical device validation**.

## 11. Freeze y continuación

Los gates finales cumplen los criterios aprobados. **V1 ALPHA FREEZE: PASS — ALPHA READY.**

```text
Android physical smoke: pending post-freeze validation
No new V1 features before tester feedback.
```

Solo se permiten correcciones de blockers, bugs, integridad de datos, compatibilidad de plataforma
y UX crítica reportada por testers Alpha. Ideas nuevas se registran en backlog Post-Alpha/Beta.

**Prepare Alpha distribution and tester workflow. No new V1 features.**
La preparación de distribución será otra tarea; no se implementan aquí builds de distribución,
automatizaciones, publicación ni un nuevo flujo funcional.
