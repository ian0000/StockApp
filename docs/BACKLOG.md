# Backlog

Registro acotado de store readiness; no sustituye el scope y las fases de
[ROADMAP.md](ROADMAP.md) ni declara disponibilidad pública en stores.

## STORE-READINESS-001 — In-app legal and support links

**Estado: STORE-READINESS-001 READY FOR PR.** Implementado y revalidado mediante
STORE-READINESS-001R sobre `main` actualizado. El bloqueo Expo quedó resuelto
por MAINT-EXPO-001R; esta feature no modifica dependencias.

La pantalla `apps/mobile/src/app/(tabs)/more.tsx` incorpora **Legal y soporte**:
Política de privacidad, Términos de uso y Soporte. URLs canónicas centralizadas
en `apps/mobile/src/ui/more/legal-support-links.ts`, dentro de UI. Cada fila
invoca `Linking.openURL`; ante rechazo se muestra el Alert existente como
patrón de feedback, sin propagar la promesa rechazada. No existe WebView,
contenido legal duplicado, tracking ni acceso a red al startup.

El pendiente de accesos legales/soporte dentro de la app se resuelve en este
ticket autorizado. No equivale a configurar las tiendas ni a publicar una
versión nueva. La integración estará disponible en una distribución que
incluya este commit; el APK Alpha anterior permanece inmutable.

| Requisito | Estado |
| --- | --- |
| Public Privacy URL | READY — `https://ian-k.dev/stockapp/privacy/` |
| Public Terms URL | READY — `https://ian-k.dev/stockapp/terms/` |
| Public Support URL | READY — `https://ian-k.dev/stockapp/support/` |
| Privacy accessible in app | READY — tap, navegador, URL final, render y regreso PASS |
| Terms accessible in app | READY — tap, navegador, URL final, render y regreso PASS |
| Support accessible in app | READY — tap, navegador, URL final, render y regreso PASS |
| Google Play Privacy Policy URL / Console | PENDING EXTERNAL ACTION |
| Google Play Data Safety | PENDING EXTERNAL ACTION |
| App Store Connect Privacy Policy URL | PENDING EXTERNAL ACTION |
| App Store Connect Support URL | PENDING EXTERNAL ACTION |
| App Store App Privacy answers | PENDING EXTERNAL ACTION |

## Validación y alcance

- Tests con `node:test`/`tsx`, sin React Native en Node ni testing library nueva:
  contrato de URLs/nombres, apertura de los tres destinos y fallos asíncrono y
  síncrono sin rechazo propagado, con feedback. Seis tests preservados PASS.
- Suite completa: **1402/1402 PASS** (Domain 428, Application 424, Mobile 550).
  Los seis tests nuevos están incluidos. Sin testing library de UI nativa:
  binding de Pressable/Linking se verificó por interacción manual en Android;
  los ports del helper y el feedback de errores se prueban automáticamente.
- Smoke Android: **PASS** en Inicio, Productos, Historial y Más, después de
  regresar de los tres enlaces. Inventario ficticio existente `Prueba legal`
  conservado, sin crear productos, ventas ni alterar respaldos.
- iOS manual: **NOT RUN — environment unavailable**, Windows sin simulador iOS.
- Domain, Application, Infrastructure/SQLite, schema y migraciones: sin cambios.
- Dependencias, Expo config, permisos, versión y build number: sin cambios.
- `ian-k.dev`, Search Console y configuración de stores: fuera de alcance y sin cambios.
- No build de store, PR automático ni merge. Entrega mediante commit/push en
  `feat/store-readiness-links`; CI de esa rama se dispara al crear PR manual.

## Quality gates — 2026-10-02

`pnpm check` es el gate oficial de README/CI y ejecuta las cuatro comprobaciones
siguientes en secuencia; no se sustituyó por una suite parcial.

| Comando | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, workspace y lockfile sin cambios |
| `pnpm format:check` | PASS, mediante `pnpm check` |
| `pnpm lint` | PASS, mediante `pnpm check` |
| `pnpm typecheck` | PASS, mediante `pnpm check` |
| `pnpm test` | PASS, mediante `pnpm check`, 1402 tests |
| `pnpm check` | PASS |
| `pnpm --filter @stock-app/mobile exec expo install --check` | PASS en main y con WIP restaurado; cero mismatches |
| `git diff --check` | PASS |

El comando Expo se ejecuta dentro del paquete móvil, donde está instalada Expo;
no hay un script `expo` en la raíz. Se mantiene SDK **57**, Expo **57.0.26**,
React Native **0.86.3** y React **19.2.3**, heredados de main. `package.json`,
lockfile y Expo config no tienen diferencias propias de la feature.
`db:generate` no es un gate obligatorio de CI y no se ejecuta: schema sin cambios.

## Reanudación y preservación del WIP

- Base anterior de la feature: `5bf88dcaf2156df6e43369c17b2036cd095bdede`.
- Main actualizado: `667be8f429bcb9dafbaff62201a7a6f6e4d24a54`, merge del PR #70.
- Mantenimiento incluido: `97b6d2d8f1d72be6d8c6a8a78f5ee5719dd54c8a`.
- WIP guardado con `git stash push -u` antes de actualizar main; árbol limpio.
- Feature actualizada mediante `git merge --ff-only main`, sin merge propio ni rebase.
- Restauración con `git stash apply` del stash exacto: **7/7 archivos con SHA256
  idénticos** a la captura previa. El stash se eliminó solo después de verificarlo.
- La implementación y sus seis tests no se reescribieron; después de restaurar
  únicamente se actualizó este backlog para reflejar la validación final.

## Android manual — 2026-10-02

Entorno existente: AVD `StockApp_Tester_Demo`, Android 15/API 35, Expo Go 57.0.9,
código de la feature sobre main actualizado servido por Metro. No se utilizó el
APK Alpha anterior para validar estos cambios ni se creó un build de store.

| Acción desde Más | URL final en Chrome Android | HTTP / render | Atrás del sistema → StockApp |
| --- | --- | --- | --- |
| Política de privacidad | `https://ian-k.dev/stockapp/privacy/` | 200 / PASS | PASS, Más operativa |
| Términos de uso | `https://ian-k.dev/stockapp/terms/` | 200 / PASS | PASS, Más operativa |
| Soporte | `https://ian-k.dev/stockapp/support/` | 200 / PASS | PASS, Más operativa |

Tap, apertura externa, URL visible y contenido renderizado: PASS para los tres.
HTTP 200 comprobado además mediante requests de lectura sin redirección.
Sin crash ni envío de correo/formularios. El regreso preserva un estado razonable
de navegación; las cuatro pestañas siguen funcionando después de los enlaces.
Los fallos de apertura se verifican mediante tests; no se provocó un fallo nativo
artificial en Android. iOS manual: **NOT RUN — environment unavailable**.

Accesibilidad: labels visibles completos, nombres explícitos y role `link`,
target mínimo de 58 unidades lógicas, estilo existente de pulsación y flecha
decorativa excluida del nombre accesible. Sin rediseño ni prueba de TalkBack.

Bloqueadores: **NONE**. La configuración de tiendas sigue como
**PENDING EXTERNAL ACTION**; no condiciona la preparación de este PR.

## STORE-READINESS-002 — Google Play Technical Readiness Audit

**Estado: BLOCKED. Entrega: STORE-READINESS-002 NOT READY FOR PR**, conforme al
criterio del ticket cuando hay bloqueadores de preparación para Play. El
informe documental sí se entrega para revisión; no declara un build válido ni
una configuración de Console terminada.

Fuente de preparación: [GOOGLE_PLAY_READINESS.md](GOOGLE_PLAY_READINESS.md).
Base `a164c8e`, PR #71 integrado; contiene el commit `60bc98d` de
STORE-READINESS-001. Su validación anterior se conserva arriba.

- Identidad confirmada: StockApp, `com.iankexpo.stockapp`, `0.1.0 (1)`, Expo SDK
  57/57.0.26, React Native 0.86.3 y React 19.2.3.
- `PLAY_TARGET_API: PASS`: prebuild temporal y resolución de catálogo Android
  inspeccionados, compileSdk 36 / targetSdk 36 / minSdk 24. Sin AAB compilado.
- `PLAY_AAB_PROFILE: BLOCKER`: solo existe alpha internal APK. Perfil store
  propuesto en el informe, no aplicado a eas.json.
- `PRIVACY_POLICY_MISMATCH: BLOCKER`: expo-camera incorpora ML Kit nativo;
  la divulgación publicada omite sus métricas de uso/diagnóstico. Corregir en
  un ticket separado de ian-k.dev; no hubo cambios en la web.
- `DATA_SAFETY_RESOLUTION: BLOCKER`: candidato YES por métricas SDK; sharing,
  tipos/condiciones definitivas y retención/borrado necesitan resolución antes
  de enviar el formulario. La ausencia de backend/analytics propios no prueba
  ausencia de telemetría transitiva. Esta auditoría amplía la evidencia del
  ticket de enlaces; no invalida su smoke ni sus tests.
- Audiencia/copy requieren decisión del responsable. Assets propios de icono
  y feature graphic faltan; capturas Alpha reales disponibles pero históricas,
  sin validación del release actual ni evidencia de tablet.
- Signing EAS-managed registrado para Alpha; continuidad de credenciales,
  Play App Signing, historial de uploads y manifest release pendientes.

Se modifican únicamente este backlog y el informe. Sin código, dependencias,
permisos, versión, SDK, EAS config, builds APK/AAB ni acciones en stores.
Rama `docs/google-play-readiness`; commit/push autorizados por el ticket.
Sin creación de PR ni merge automático.

### Quality gates — STORE-READINESS-002 / 2026-10-02

| Comando | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; lockfile sin cambios |
| `pnpm check` (format/lint/types/tests) | PASS; 1402/1402 tests, Domain 428 / Application 424 / Mobile 550 |
| `pnpm --filter @stock-app/mobile exec expo install --check` | PASS; cero mismatches |
| `git diff --check` | PASS |

Detalles de inspección, confianza de respuestas, tabla de SDKs, matriz de
preparación y checklist externo: informe canónico. Play Console permanece
**PENDING EXTERNAL ACTION**.
