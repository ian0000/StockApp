# Backlog

Registro acotado de preparación para stores; no sustituye el scope y las fases de
[ROADMAP.md](ROADMAP.md) ni declara disponibilidad pública en stores.

## STORE-AAB-001 — Google Play AAB Build Profile

**Estado: STORE-AAB-001 READY FOR PR.** Configuración preparada y validada localmente;
integración pendiente de PR y merge manuales.

Base: `main` actualizado en `a164c8e`, con STORE-READINESS-001 (`60bc98d`)
y MAINT-EXPO-001R (`97b6d2d`) integrados. Rama: `chore/google-play-aab-profile`.
La auditoría `9221500` se consulta como referencia READ-ONLY; su documento
no existe en esta base y no se copia ni se integra la rama de auditoría.

`apps/mobile/eas.json` incorpora un perfil `production` explícito:
`distribution: store`, `android.buildType: app-bundle`, Node `22.16.0` y
pnpm `11.0.9`, sin `extends`. `alpha` conserva íntegramente distribución
`internal`, artefacto `apk` y el mismo toolchain. CLI `24.3.0`, versiones
locales y `requireCommit: true` se conservan. Sin `autoIncrement`, submit
ni configuración de credenciales; versionCode pendiente de cotejar con el
historial de Play antes del primer build autorizado.

| Preparación | Estado |
| --- | --- |
| Production profile | READY — configuración para AAB |
| Artifact intended | AAB |
| PLAY_AAB_PROFILE | RESOLVED — CONFIGURED; artefacto aún no validado |
| Build executed / AAB generated / APK generated | NO / NO / NO |
| AAB artifact validated / signing validated | NO / NO |
| PLAY_AAB_ARTIFACT_VALIDATION | PENDING |
| Play upload / Play Console modified / EAS credits consumed | NO / NO / NO |
| Credentials modified / keystore downloaded | NO / NO |
| PRIVACY_POLICY_MISMATCH | RESOLVED EXTERNALLY — WEB-PRIVACY-MLKIT-001; contenido no duplicado aquí |
| DATA_SAFETY_RESOLUTION | OPEN — no respuestas ni envío de formulario |

Validación: JSON y semántica de campos contrastados con la
[referencia oficial EAS](https://docs.expo.dev/eas/json/). EAS CLI config validation:
**NOT RUN — no safe no-build validator available**; CLI no disponible en el
proyecto ni en PATH, sin instalar herramientas adicionales.

Quality gates ejecutados el 2026-10-02 (America/Guayaquil), con Node `22.16.0`
y pnpm `11.0.9`:

| Comando | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; workspace y lockfile sin cambios |
| `pnpm check` | PASS; format:check, lint, typecheck y suite completa |
| Tests | 1402 PASS / 0 FAIL; Domain 428, Application 424, Mobile 550 |
| `pnpm --filter @stock-app/mobile exec expo install --check` | PASS; dependencias actualizadas, sin mismatches |
| `git diff --check` | PASS |

JSON parseado y comparado con la base: `alpha` y `cli` intactos, perfil production
igual al objeto requerido, sin overrides. No se añaden tests para un JSON trivial;
`docs/` conserva su formato establecido y está excluido de Prettier.

Identidad intacta: StockApp, `com.iankexpo.stockapp`, versión `0.1.0`, versionCode `1`.
Expo `57.0.26`, React Native `0.86.3`, React `19.2.3` y baseline nativa `36/36/24`
sin cambios. No se genera proyecto nativo, no se modifican permisos, app.json,
dependencias, lockfile, código funcional ni `ian-k.dev`.
Firma, manifest y artefacto se comprobarán en el primer build store autorizado.
Configurar el perfil no declara preparación de release o publicación en Google Play.
PR y merge permanecen manuales; no se ejecuta EAS Build ni Submit.

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
