# StockApp V1 Alpha — Guía de testers y distribución interna

**DIST-ALPHA-001 · 2026-09-12.** Esta es una Alpha controlada, no Beta ni producción.
La base funcional está congelada; no se incorporan nuevas funciones durante esta tarea.

## 1. Antes de empezar

- Usa datos de prueba, no el inventario crítico de tu negocio.
- Los datos se guardan localmente en este dispositivo. No hay sincronización ni recuperación cloud.
- Antes de pruebas destructivas o actualizaciones importantes, crea un respaldo desde
  **Más → Respaldo → Crear copia de seguridad** y guárdalo fuera de la app.
- El respaldo contiene información del negocio y no está cifrado. No lo adjuntes a un reporte
  público. Compartirlo no es un requisito para reportar un problema.
- Restaurar **reemplaza** el inventario actual; no combina inventarios. Revisa el preview y conserva
  un respaldo anterior antes de confirmar. No desinstales ni borres datos como primera solución.

## 2. Instalación Android

**APK y enlace: PENDIENTES. No existe todavía un artefacto validado para entregar.**

Cuando el responsable entregue el enlace de un build aprobado:

1. Abre el enlace desde Android y descarga el archivo APK.
2. Si Android lo solicita, autoriza la instalación desde ese navegador/gestor de archivos.
3. Instala y abre **StockApp**. No necesitas herramientas de desarrollo ni Expo Go.
4. Conserva el mensaje con la versión y el build para incluirlos en cualquier reporte.

No se utiliza Play Store ni se entrega un AAB. Comparte el enlace únicamente con los testers
invitados: los enlaces internos de EAS pueden ser accesibles para quien tenga la URL.

Para actualizar, crea antes un respaldo e instala el nuevo APK encima, sin desinstalar.
La actualización exige conservar identificador Android y firma. Si Android rechaza la actualización,
reporta el error; no borres datos para sortearlo. La continuidad del sandbox de Expo Go al APK
**no es automática**: empieza con datos de prueba; cualquier traslado requiere el respaldo/restauración
existente, con su confirmación explícita de reemplazo.

## 3. iOS disponible y pendiente

- Disponible para testers técnicos/controlados: sesión coordinada de **Expo Go**, mecanismo usado
  en la QA física previa. El responsable levanta la revisión acordada y comparte su QR; el tester
  abre esa sesión en un Expo Go compatible con SDK 57. Esto no es un IPA autónomo.
- Membresía y credenciales Apple Developer: **no confirmadas**. No se afirma que no exista cuenta.
- Distribución iOS standalone: **pendiente de verificar Apple credentials** y de definir
  `ios.bundleIdentifier`; no hay IPA ni provisioning configurados.
- Si no existe membresía habilitada: **BLOCKED BY APPLE CREDENTIALS**, no un defecto de StockApp.
- Para habilitar Ad Hoc se necesita membresía Apple Developer activa, identidad aprobada, firma
  y dispositivos registrados incluidos en el provisioning profile. Se evaluará con esas condiciones.
- TestFlight no se configura en esta tarea. EAS Update también queda fuera del alcance.

El responsable debe informar el commit exacto de la sesión Expo Go. La app autónoma y Expo Go no
comparten automáticamente datos. No prometemos instalación independiente de iOS mientras falten
los requisitos anteriores.

## 4. Qué probar

Con un inventario de prueba:

- Crear un producto con stock y otro sin stock; comprobar costo conocido frente a no disponible.
- Registrar una compra y una venta, incluida una venta de varios productos.
- Ajustar el stock mediante conteo físico.
- Buscar por nombre, variante y código; escanear un código local real donde haya cámara disponible.
- Revisar Inicio, stock bajo, Historial y detalles de las operaciones.
- Anular una venta y una compra elegibles desde su detalle. Si el producto tuvo movimientos
  posteriores, es correcto que V1 impida la anulación; no borra la operación original.
- Crear un respaldo, comprobar que el archivo quedó guardado, restaurarlo sobre datos de prueba
  y verificar productos, stock e historial.
- Cerrar completamente la app y volver a abrir: los datos deben seguir ahí.
- Tras instalar, repetir el núcleo sin Internet; no depender de Metro para el APK autónomo.

En precios queremos saber si entiendes, **sin explicación externa**:

- costo de compra frente a precio de venta;
- margen deseado frente a ganancia estimada;
- precio sugerido y la decisión de mantener o actualizar el precio.

Comprueba que el margen pueda editarse cuando el costo actual sea calculable, aunque el margen
anterior fuera negativo; que los inputs precargados muestren normalmente dos decimales; y que
la sugerencia nunca recomiende bajar automáticamente el precio habitual.

## 5. Cómo reportar

Responde por el mismo canal a **la persona que te entregó el enlace de Alpha**. Ella centraliza el
reporte en el seguimiento del proyecto; el tester no necesita cuenta GitHub. No hay un formulario,
correo de soporte o sistema automático de reporte configurado por esta tarea.

```text
Título:
Plataforma (Android / iOS; APK / Expo Go):
Modelo/dispositivo:
Versión Android/iOS:
Build StockApp (versión + número + enlace/ID o commit de Expo Go):
Qué estabas haciendo (pasos):
Qué esperabas:
Qué ocurrió:
¿Se repite?:
Captura/video (sin información comercial sensible):
```

No hace falta adivinar la causa técnica. Si hay pérdida de datos o la app no abre, avisa de inmediato
y no reinstales ni restaures repetidamente antes de acordar cómo conservar la evidencia.

## 6. Triage y feature freeze

Flujo: **Tester → feedback → triage del responsable → bug / UX / idea**.
El responsable asigna la severidad; una opinión visual no es automáticamente un blocker.

| Severidad | Criterio |
| --- | --- |
| BLOCKER | No abre, datos perdidos/corruptos, restore destruye datos, operación duplicada o crash recurrente del núcleo. |
| HIGH | Un flujo principal falla o produce resultados incorrectos de forma relevante. |
| MEDIUM | Falla acotada con alternativa razonable, sin pérdida de información. |
| LOW | Defecto menor que no impide operar. |
| UX/FEEDBACK | Duda, fricción u opinión; triage identifica si realmente es UX crítica. |

Durante Alpha se aceptan correcciones de blockers, bugs, integridad de datos, compatibilidad de
plataforma y UX crítica. Toda propuesta nueva se registra en backlog Post-Alpha; no amplía el freeze.
Promociones, analytics, imágenes, cloud y nuevos reportes no entran por petición automática de testers.

## 7. Estado de la distribución y registro de builds

Base: `edeec914afb27e41c3deb5fed961929ad916135f`, merge humano de PR #66 / Alpha Freeze.
Rama: `chore/alpha-distribution`. La QA previa se conserva en [QA-ALPHA-003](QA-ALPHA-003.md).

| Campo | Estado inicial de DIST-ALPHA-001 |
| --- | --- |
| Expo/EAS | Enlazado a `@iankexpo/inventory-app` mediante el flujo oficial |
| Project ID | `fd2a3784-6fd8-48e2-8545-bbfb6f119597` (identificador público, no secreto) |
| EAS CLI | `24.3.0`, ejecución temporal con pnpm; sin instalación global ni dependencia de runtime |
| App version | `0.1.0`, conservada; `package.json` del workspace `0.0.0` no es la versión instalada |
| Android package | `com.iankexpo.stockapp`, aprobado por el responsable; ausente en la base |
| Android versionCode | `1`, primer build Alpha |
| iOS bundleIdentifier / buildNumber | No definidos; no se inventan para desbloquear Android |
| Perfil | `alpha`, distribución `internal`, APK Android explícito |
| Build ID / fecha / commit de build | PENDIENTES; el commit de base no sustituye el commit que EAS construya |
| Resultado / APK / URL | PENDIENTES |
| Instalación del APK en emulador | PENDIENTE; no confundir con el smoke anterior usando el flujo de desarrollo |

El package aprobado usa la identidad de la cuenta Expo existente. Cambiarlo después implica
otra identidad de aplicación y no traslada automáticamente sus datos ni su ficha de tienda.
`com.iankexpo.stockapp` es la identidad estable de StockApp y no debe cambiarse después de
comenzar la distribución. El nombre visible continúa siendo StockApp.

## 8. Procedimiento reproducible para el responsable

`apps/mobile/eas.json` configura solo el perfil interno `alpha`. Se ejecuta EAS desde esa carpeta,
manteniendo el monorepo completo. Node `22.16.0` y pnpm `11.0.9` coinciden con la base validada.
No hay perfiles de producción, submission, CI de distribución ni activación de OTA.

Versionado: conservar `expo.version = 0.1.0` durante esta Alpha; `android.versionCode = 1`
para el primer build y aumentarlo explícitamente para cada nuevo APK distribuido. La fuente
es local, versionada en Git; no hay autoincremento que produzca cambios silenciosos. Para iOS se
definirá el primer `buildNumber` al habilitar su distribución. EAS build ID distingue cada intento.

Con package/versionCode configurados y tras revisar credenciales:

```bash
# Desde la raíz del repositorio
pnpm check
git diff --check
# Commit revisado: EAS exige un working tree limpio para identificar la fuente exacta.
cd apps/mobile
pnpm dlx eas-cli@24.3.0 whoami
pnpm dlx eas-cli@24.3.0 project:info
pnpm dlx eas-cli@24.3.0 build --platform android --profile alpha
```

El proyecto ya está enlazado: no ejecutar `init` para crear otro proyecto. Usar firma gestionada
por EAS cuando se configure y conservarla entre builds. No descargar ni copiar claves en Git.
El repositorio ignora credenciales locales y artefactos de firma/build.

Antes de enviar un enlace, registrar **versión, número de build, commit completo, fecha, plataforma,
mecanismo, perfil, EAS build ID, resultado y URL del APK**. Verificar que el commit reportado por EAS
coincida con el checkout limpio utilizado. No distribuir builds fallidos o sin smoke aprobado.
Si se vuelve a construir el mismo commit, conservar ambos IDs; no sobrescribir la evidencia.

Instalar el APK descargado en un emulador mediante Android Studio o `adb install -r <archivo.apk>`.
Comprobar Startup, Home, crear Product, registrar Sale y Purchase, cierre completo y reapertura con
persistencia. Registrar dispositivo/OS/build y resultados; no sustituir esta prueba por `expo start`
ni por `expo export`. No borrar los datos existentes del emulador para conseguir un PASS.

`expo-updates` no está declarado y no hay `updates.url` ni `runtimeVersion` configurados.
**EAS Update: OUT OF SCOPE for DIST-ALPHA-001.** Los APK son builds inmutables con JS incluido.
El uso de EAS para compilar no introduce una dependencia cloud para operar el inventario.

## 9. Evidencia de plataforma y siguiente paso

Validación de la preparación ejecutada el 2026-09-12:

| Gate | Resultado |
| --- | --- |
| `pnpm test` | PASS: Domain 428, Application 424, Mobile/Infrastructure 544; total 1396/1396 |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | PASS |
| `pnpm check` / `git diff --check` | PASS |
| Expo dependency check | PASS, dependencias alineadas |
| Expo Doctor 1.20.4 | PASS, 21/21 |
| `db:generate` | 8 tablas, No schema changes, nothing to migrate |
| `expo export --platform all` | PASS, iOS/Android/Web; salida ignorada `.expo/dist-alpha-validation` |
| EAS `config --platform android --profile alpha --non-interactive` | PASS, perfil resuelto con APK y credenciales remotas por defecto |

Estos gates validan código/configuración, no sustituyen compilar e instalar un APK firmado.
No se cambian dependencias del proyecto, schema, migraciones ni comportamiento funcional.

- Android internal APK emulator: **PENDING** hasta instalar y probar el artefacto real.
- Android physical: **PENDING / post-freeze**, no bloquea preparar la configuración.
- iOS existing physical QA: **PASS previously reported**, no es validación de un IPA nuevo.
- Cuando haya Android físico: cámara, barcode real, permisos, share sheet del respaldo,
  document picker, restore, filesystem y reinicio. Limitaciones de cámara del emulador se reportan,
  nunca se convierten en PASS físico.

Con el APK validado, invitar inicialmente a **3–10 testers**, recoger feedback, hacer triage y
corregir blockers. No comenzar nuevas features.

## Referencias técnicas

- [EAS Internal Distribution](https://docs.expo.dev/build/internal-distribution/): APK, enlaces y Ad Hoc.
- [EAS con monorepos](https://docs.expo.dev/build-reference/build-with-monorepos/): configuración en la raíz de la app.
- [Versiones de aplicación](https://docs.expo.dev/build-reference/app-versions/): versión visible y número nativo.
