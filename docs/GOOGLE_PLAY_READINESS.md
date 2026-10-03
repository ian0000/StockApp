# STORE-READINESS-002 — Google Play Technical Readiness Audit

## 1. Scope

**Fecha: 2026-10-02, America/Guayaquil. Estado: BLOCKED.**
**Entrega: STORE-READINESS-002 NOT READY FOR PR**, según el criterio del ticket:
el informe se entrega para revisión, pero existen bloqueadores para preparar Play.

Fuente de preparación de Play Console para **ian0000/StockApp**, base
`a164c8e` (PR #71 integrado), con `60bc98d0964e0395544be9738bb194bbb5e7c1f6`
en su historial. Rama de auditoría: `docs/google-play-readiness`.

Alcance: inspección y documentación. No se cambian funcionalidad, SDK, dependencias,
permisos, versiones, EAS config ni el repositorio independiente `ian-k.dev`.
No se crea APK/AAB, no se consumen créditos EAS y no se accede a Play Console.
Las propuestas siguientes no son respuestas enviadas ni aprobación de Google.

Confianza:

- **CONFIRMED**: evidencia concreta de código/configuración o registro del repo;
  en SDKs, describe la integración y el comportamiento documentado, no una captura de tráfico.
- **LIKELY**: inferencia sustentada, pendiente de comprobación en el artefacto release.
- **UNKNOWN**: la evidencia disponible no resuelve la respuesta.
- **REQUIRES USER INPUT**: decisión o información que debe aportar el responsable.

Se consultaron las autoridades de producto, scope, reglas, arquitectura, UX y etapas:
`AGENTS.md`, `README.md`, `PRODUCT.md`, `MVP.md`, `BUSINESS_RULES.md`,
`ARCHITECTURE.md`, `UX.md`, `ROADMAP.md`, `BACKLOG.md`, además de la configuración
móvil y el lockfile. Las capacidades cloud/analytics futuras de la baseline no
se contabilizan como features implementadas.

### Evidencia utilizada

Las referencias `ruta:línea` corresponden al árbol auditado. Los archivos de
`node_modules` se regeneran con el lockfile; no son fuentes nuevas versionadas.

| ID | Evidencia y responsabilidad |
| --- | --- |
| E-ID | `apps/mobile/app.json:3-8,12-22,29-33`: identidad y plugins; `apps/mobile/package.json:15-39` y `pnpm-lock.yaml:30-107`: runtime resuelto |
| E-BUILD | `apps/mobile/eas.json:2-16`: solo alpha, versiones locales, APK; `docs/ALPHA_TESTING.md:131-144,163-173,240`: proyecto EAS y firma Alpha registrados |
| E-LOCAL | `apps/mobile/src/composition/create-app-services.ts:31-65`, `apps/mobile/src/infrastructure/sqlite/database.ts:1-30`, `schema.ts:13,31,78,122,190,267,313,335`: composición local y ocho tablas |
| E-START | `apps/mobile/src/ui/runtime/app-runtime.native.tsx:40-82,117-129`, `apps/mobile/src/ui/components/FirstRunSetup.tsx:26-50`, `apps/mobile/src/app/_layout.tsx:8-66`: inicio, configuración local y rutas |
| E-CAMERA | `apps/mobile/src/app/barcode/scan.tsx:76,114-116,143-151,218-223,333-345`; `apps/mobile/node_modules/expo-camera/plugin/src/withCamera.ts:79-86`; `expo-camera/android/build.gradle:8-10,45-49`; `expo-camera/android/src/main/java/expo/modules/camera/analyzers/BarcodeAnalyzer.kt:23-42` dentro del mismo `node_modules` |
| E-BACKUP | `apps/mobile/src/infrastructure/backup/local-backup-file-exporter.native.ts:1-23`, `backup-file-exporter.ts:29-44`, `local-backup-file-picker.native.ts:1-35`, `backup-file-picker.ts:29-44`: cache, hoja de compartir, selección JSON y limpieza |
| E-LINK | `apps/mobile/src/ui/more/legal-support-links.ts:1-28`, `apps/mobile/src/app/(tabs)/more.tsx:62-93`, `apps/mobile/test/legal-support-links.test.ts:1-81`: enlaces externos sin payload de inventario |
| E-ASSETS | `docs/alpha/CAPTURE_NOTES.md:5-17,43-60`, `docs/alpha/screenshots/01-home.png` a `05-history.png`: capturas de APK histórico; inventario de imágenes versionadas con `rg --files` |

## 2. App identity

| Campo | Valor | Confianza / evidencia |
| --- | --- | --- |
| Name | StockApp | CONFIRMED, E-ID |
| Android package | `com.iankexpo.stockapp` | CONFIRMED, E-ID; coincide con applicationId/namespace del prebuild |
| App version | `0.1.0` | CONFIRMED, E-ID |
| Android versionCode | `1` | CONFIRMED, E-ID |
| Expo SDK / paquete | `57` / `57.0.26` | CONFIRMED, E-ID y `expo config --type public` |
| React Native | `0.86.3` | CONFIRMED, E-ID |
| React | `19.2.3` | CONFIRMED, E-ID |

`package.json` móvil tiene versión de workspace `0.0.0`; la versión instalada
proviene de app.json. No hay identidad Android alternativa en la configuración
propia ni en el prebuild. No se renombra el package. Su disponibilidad/reserva
en Google Play es **UNKNOWN**, sin consulta a Console.

`versionCode: 1` es un entero positivo y `0.1.0` es una versión visible válida
para una primera subida. Que el código 1 siga disponible en Play es **UNKNOWN**:
no se conoce el historial de uploads. En subidas posteriores se deberá aumentar
el código y no reutilizar uno ya cargado; no se implementó automatización.
[Reglas de versionado Android](https://developer.android.com/studio/publish/versioning).

## 3. Android build readiness

**PLAY_AAB_PROFILE: BLOCKER — CONFIRMED, E-BUILD.** Solo existe `alpha`:
distribución interna, Android `buildType: apk`. No hay perfil store/AAB.
Google Play exige AAB para apps nuevas.
[Formato de publicación](https://support.google.com/googleplay/android-developer/answer/9844279?hl=en).

### Propuesta únicamente; no aplicada

Agregar, en un ticket autorizado, un perfil hermano de alpha:

```json
{
  "production": {
    "distribution": "store",
    "node": "22.16.0",
    "pnpm": "11.0.9"
  }
}
```

Este objeto iría dentro de `build`; no reemplaza la configuración existente.
El mínimo semántico sería `production: { "distribution": "store" }`;
las versiones conservan la reproducibilidad usada por este proyecto. No heredar
alpha sin sobrescribir su `android.buildType: apk`. `app-bundle` es el formato
por defecto y puede hacerse explícito, pero no es necesario con este perfil.
[Default AAB de EAS](https://docs.expo.dev/build-reference/apk/),
[referencia de configuración](https://docs.expo.dev/eas/json/).

| Signing | Respuesta | Confianza / evidencia |
| --- | --- | --- |
| EAS project linked | YES, `@iankexpo/inventory-app` | CONFIRMED, E-ID / E-BUILD; el UUID es identificador público |
| Android signing strategy | EAS-managed, registrada para Alpha | CONFIRMED como registro histórico, `ALPHA_TESTING.md:144,240` |
| Credenciales actuales disponibles / continuidad de upload key | UNKNOWN — verificar en el primer store build autorizado | No se consultaron ni descargaron credenciales |
| Play App Signing | PENDING EXTERNAL ACTION | Console no inspeccionada |

El debug keystore de la plantilla de prebuild no prueba la firma store. EAS
debe configurar la firma de release y preservar la identidad de firma existente.
El APK Alpha anterior tampoco demuestra que el código actual produzca un AAB válido.

## 4. Target API

| Valor del proyecto nativo generado | Resultado | Confianza |
| --- | --- | --- |
| compileSdk | **36** | CONFIRMED para configuración de prebuild inspeccionada |
| targetSdk | **36** | CONFIRMED para configuración de prebuild inspeccionada |
| minSdk | **24** (Android 7) | CONFIRMED para configuración de prebuild inspeccionada |
| Mínimo Play para esta app nueva al 2026-10-02 | **36**, desde 2026-08-31 | Política oficial verificada |
| PLAY_TARGET_API | **PASS** | Configuración 36 >= 36; no se cambió el target |

[Requisito vigente de Google Play](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).

Se ejecutó prebuild Android sin instalar dependencias, en copia temporal fuera
del checkout, usando **la plantilla de Expo instalada**. La evidencia no deriva
de Expo Go ni del API 35 del emulador. Cadena de resolución inspeccionada:

1. E-ID fija React Native `0.86.3`; `pnpm-lock.yaml:89-91` resuelve esa versión.
2. `apps/mobile/node_modules/react-native/gradle/libs.versions.toml:3-5` contiene
   `minSdk = "24"`, `targetSdk = "36"`, `compileSdk = "36"`.
3. `apps/mobile/node_modules/expo/template.tgz`, `package/android/settings.gradle`,
   llama a `expoAutolinking.useExpoVersionCatalog()`; el settings.gradle generado
   conserva esa llamada. `package/android/app/build.gradle` utiliza `rootProject.ext`.
4. `expo-modules-autolinking@57.0.13`,
   `android/expo-gradle-plugin/expo-autolinking-settings-plugin/src/main/kotlin/expo/modules/plugin/ExpoAutolinkingSettingsExtension.kt:100-135`
   importa el catálogo de React Native y aplica overrides Gradle si existen.
   `expo-autolinking-plugin/.../ExpoRootProjectPlugin.kt:50-55` toma esos valores.
5. No hay overrides SDK en E-ID/E-BUILD ni en gradle.properties generado.
   `android/app/build.gradle:88-96` generado resuelve package y versiones correctos.

La configuración efectiva inspeccionada es 36/36/24. **El manifest de un AAB
compilado no está validado**: no se ejecutó Gradle ni EAS Build. En el primer
build autorizado se deberán cotejar sus SDKs, firma y manifest combinado.
No hace falta un ticket de aumento de target API por los valores actuales.

## 5. Permissions

La introspección Expo y el prebuild coinciden. Este es el manifest de la app
generada, **anterior a la combinación de todas las bibliotecas Maven**; no es
una lista certificada del AAB final. También se revisaron los manifests de los
17 módulos Expo autolinkados. Evidencia: E-ID, E-CAMERA y los manifests instalados.

| Permiso | Fuente | Propósito / feature | ¿Necesario? | Confianza |
| --- | --- | --- | --- | --- |
| CAMERA | plugin y manifest `expo-camera/android/src/main/AndroidManifest.xml:2` | Escanear códigos de productos | Solo para escáner; no para uso manual | CONFIRMED en prebuild, E-CAMERA |
| RECORD_AUDIO | No declarado por plugin con `recordAudioAndroid: false`; tampoco en manifest camera | No hay función de audio/video | No | CONFIRMED ausente en prebuild y manifests Expo inspeccionados, E-ID/E-CAMERA; comprobar AAB final |
| READ_EXTERNAL_STORAGE | `expo-file-system/android/src/main/AndroidManifest.xml:4`, además de plantilla | Capacidad heredada del módulo; máximo API 32 | Los flujos actuales usan cache/selector; no requieren acceso amplio | CONFIRMED declarado con maxSdkVersion 32, E-BACKUP y módulo fijado en E-ID |
| WRITE_EXTERNAL_STORAGE | mismo manifest:3, además de plantilla | Capacidad heredada; máximo API 32 | No necesario para escribir cache y compartir URI | CONFIRMED declarado con maxSdkVersion 32, E-BACKUP/E-ID |
| INTERNET | plantilla y mismo manifest:2 | Capacidad de red de runtime/SDKs; métricas ML Kit | No para inventario local; sí permite red SDK | CONFIRMED declarado; no significa por sí solo recolección, E-ID/E-CAMERA |
| SYSTEM_ALERT_WINDOW | plantilla Expo | Soporte de herramientas/overlay; sin feature StockApp que lo solicite | No para el producto actual | CONFIRMED en prebuild basado en plantilla fijada por E-ID; revisar su permanencia en release |
| VIBRATE | plantilla Expo | Capacidad heredada; sin flujo propio identificado | No requerida por la funcionalidad auditada | CONFIRMED en prebuild basado en E-ID |
| READ_MEDIA_IMAGES / VIDEO / AUDIO, ubicación, contactos, AD_ID | No aparecen en prebuild/manifests Expo inspeccionados | No hay feature propia correspondiente | No identificado | LIKELY ausentes del release; dependencias Maven pueden aportar permisos adicionales |

Los paths abreviados del módulo file-system están bajo
`apps/mobile/node_modules/expo-file-system/`. DocumentPicker, Sharing y SQLite
no añaden `uses-permission` en sus manifests inspeccionados. Compartir usa
FileProvider no exportado con concesión temporal de URI; escoger JSON usa el
selector de documentos del sistema (E-BACKUP), no acceso masivo a archivos.
No se solicitan permisos de storage ni audio en el código propio.

**Cámara on demand: CONFIRMED, E-CAMERA / E-START.** La petición está vinculada
al botón del escáner; al iniciar se prepara SQLite/configuración local.
CameraView solo se monta después del permiso y busca el código en el inventario
local. No hay `takePictureAsync`, `recordAsync` ni upload de imágenes en la app.
La captura nativa puede hacer que CAMERA implique requisitos de hardware en el
manifest combinado: **UNKNOWN** sin ese manifest. No afirmar que todos los
dispositivos sin cámara son compatibles; el uso manual no depende del escáner.

`allowBackup="true"` aparece en el prebuild. Esto permite respaldos/restauraciones
del sistema operativo según dispositivo/configuración, potencialmente incluyendo
SQLite; no es un backend propio ni el export JSON manual. No afirmar que los
datos nunca salen del dispositivo. Revisar reglas efectivas en el futuro release.
[Android Auto Backup](https://developer.android.com/identity/data/autobackup).

No se quitaron permisos. Una reducción de permisos heredados y una decisión
explícita sobre backup de plataforma requerirían otro ticket aprobado.

## 6. Runtime SDK/data transmission audit

Se inspeccionaron código móvil/paquetes, imports, configuración, lockfile,
grafo `pnpm list --prod --depth Infinity`, autolinking Android, manifests y
código nativo relevante. Búsqueda de fetch/axios/XMLHttpRequest/WebSocket,
analytics/telemetry/crash, Sentry/Firebase/Amplitude/Mixpanel/Segment/PostHog/
Datadog/AppCenter/AdMob, auth y URLs: ninguna llamada HTTP propia para inventario;
las únicas URLs de producto son los tres enlaces públicos de E-LINK.

**No equivale a ausencia de transmisión por SDK.** El grafo pnpm no enumera
las dependencias Maven dentro de expo-camera. Su build.gradle incorpora
`com.google.mlkit:barcode-scanning:17.3.0` y
`com.google.android.gms:play-services-code-scanner:16.1.0` por defecto.
`BarcodeAnalyzer` usa ML Kit en el flujo CameraView (E-CAMERA).

Google documenta métricas de dispositivo/aplicación, identificadores de instalación,
diagnóstico y uso para ML Kit. Procesar imágenes localmente no elimina esa
telemetría. No se encontró un control de StockApp que la desactive.
[Divulgación Android de ML Kit](https://developers.google.com/ml-kit/android-data-disclosure),
[privacidad de ML Kit](https://developers.google.com/ml-kit/terms).
Las versiones coinciden con las entradas de
[release notes de Google](https://developers.google.com/ml-kit/release-notes).

### Dependencias runtime directas (todas las de E-ID / lockfile:30-107)

«No identificado» significa ausencia de envío en los caminos inspeccionados,
no una garantía universal sobre toda la biblioteca o tráfico observado.
En esta tabla `E-ID:n` señala la línea n de `apps/mobile/package.json`.

| Package (versión resuelta) | Propósito | Producción Android | Capaz de red | Transmisión conocida / Data Safety | Evidencia |
| --- | --- | --- | --- | --- | --- |
| @expo/dom-webview 57.0.1 | Runtime de componentes DOM | Módulo autolinkado; ningún componente `use dom` propio | Sí, WebView | No activación propia identificada; no confundir dependencia con navegador legal embebido | E-ID:16, grafo/autolinking, búsqueda de imports |
| @expo/metro-runtime 57.0.16 | Runtime Metro/Router | Sí; herramientas condicionadas por `__DEV__` | Sí | No telemetría de usuario identificada en uso actual | E-ID:17; `node_modules/@expo/metro-runtime/src/index.ts:8-20` |
| @stock-app/application workspace | Casos de uso | Sí | No en implementación actual | Inventario local | E-LOCAL, `packages/application/package.json` |
| @stock-app/domain workspace | Reglas puras | Sí | No | Cálculos locales | E-LOCAL, `packages/domain/package.json` |
| drizzle-orm 0.45.2 | Adaptador ORM SQLite | Sí | Otros adaptadores sí; SQLite actual no | Sin upload propio | E-LOCAL, E-ID:20 |
| expo 57.0.26 | Runtime nativo/entry | Sí | Sí | Capacidades de red no prueban un servicio activado; Updates deshabilitado en prebuild | E-ID:21, E-START |
| expo-camera 57.0.6 | Escáner | Sí, cuando se abre CameraView | **Sí, ML Kit nativo** | **Métricas SDK; requiere declaración** | E-CAMERA y fuentes de Google arriba |
| expo-constants 57.0.20 | Configuración runtime | Sí, vía Expo | No envío propio identificado | Información local; no cliente de analytics | E-ID:23, grafo |
| expo-crypto 57.0.3 | Aleatoriedad UUID | Sí | No para uso actual | IDs de registros locales, no IDs de tracking enviados | `src/infrastructure/identity/uuid-v7-generator.ts:1-13`, E-ID:24 |
| expo-document-picker 57.0.3 | Selección JSON | Sí, al restaurar | Proveedor del sistema puede ser remoto | StockApp lee archivo elegido, no hace upload a servidor propio | E-BACKUP, E-ID:25 |
| expo-file-system 57.0.7 | Archivos cache | Sí | Sí, también ofrece descargas | Solo lectura/escritura local usadas | E-BACKUP, E-ID:26; API instalada `src/ExpoFileSystem.types.ts` |
| expo-linking 57.0.11 | Deep links Router | Sí | Abre destinos externos | Sin payload de inventario; enlaces legales usan Linking de RN | E-ID:27, E-LINK, E-START |
| expo-router 57.0.24 | Navegación | Sí | Sí, admite rutas/servidor remotos | Rutas propias locales; no RSC/API/backend propio configurado | E-ID:3,28, E-START, rutas de `src/app/` |
| expo-sharing 57.0.22 | Share sheet | Sí, al exportar | App receptora puede transmitir | Transferencia JSON iniciada por usuario; sin upload propio | E-BACKUP, E-ID:29 |
| expo-sqlite 57.0.3 | Base local | Sí | Extensiones opcionales no utilizadas pueden permitir red | SQLite local; no libSQL/sync configurado | E-LOCAL, E-ID:30 |
| react 19.2.3 | UI | Sí | No transporte autónomo | Sin envío autónomo identificado | E-START, E-ID:31 |
| react-dom 19.2.3 | UI web/DOM | No camino UI Android propio | No autónomo | No componente DOM propio | E-ID:32, búsqueda `use dom` |
| react-native 0.86.3 | Runtime/UI nativa | Sí | Sí, fetch/Image/Linking | No HTTP propio; abre navegador por acción del usuario | E-ID:33, E-LINK, búsqueda de llamadas |
| react-native-reanimated 4.5.1 | Animación | Sí, infraestructura | No envío autónomo identificado | Sin analytics identificado | E-ID:34, grafo |
| react-native-safe-area-context 5.7.0 | Áreas seguras | Sí | No | Sin envío identificado | E-START:9, E-ID:35 |
| react-native-screens 4.26.2 | Navegación nativa | Sí | No envío autónomo identificado | Sin analytics identificado | E-ID:36, Router/autolinking |
| react-native-web 0.21.2 | Plataforma web | No renderer Android propio | Sí, navegador | No atribuir comportamiento del sitio web al APK | E-ID:37, lockfile:98-100 |
| react-native-worklets 0.10.1 | Ejecución/animación | Sí | No envío autónomo identificado | Sin tracking identificado | E-ID:38, grafo |
| uuid 14.0.1 | IDs de registros | Sí | No | IDs generados offline | `src/infrastructure/identity/uuid-v7.ts:3`, E-ID:39 |

Las rutas `src/` de esta tabla son relativas a `apps/mobile/`.

### Transitivas relevantes y límites

- ML Kit / Google code scanner: integración Android **CONFIRMED, E-CAMERA**.
  Se usa el analizador bundled de ML Kit; la API alternativa de code scanner
  está incluida pero no es invocada desde el código TS propio. No atribuirle
  escaneos observados ni datos adicionales de auto-zoom sin evidencia.
- `expo-asset@57.0.18` y `expo-font@57.0.4` pueden cargar recursos remotos;
  `expo-asset/src/Asset.ts:271-294` implementa descarga. Sin URLs de assets/fonts
  remotos en código propio. `expo-keep-awake@57.0.2`, `@expo/ui@57.0.21` y
  `expo-modules-core@57.0.20` están en autolinking; no emisor automático adicional
  de datos de negocio identificado. **LIKELY** sin transmisión en caminos usados.
- `@expo/log-box@57.0.4` puede quedar autolinkado; uso JS de LogBox/logs Metro
  condicionado por `__DEV__` en el runtime inspeccionado. Expo Go, Metro,
  Expo CLI/EAS CLI, Babel, ESLint, TS y drizzle-kit son herramientas del
  entorno/build y no servicios de usuario de un release por aparecer en pnpm.
  La ejecución, imports y compilación release determinan inclusión/activación.
- `expo-updates` no está instalado en el grafo auditado y el prebuild declara
  `expo.modules.updates.ENABLED=false`; no asumir una llamada OTA por los otros
  metadatos de plantilla. E-ID y `ARCHITECTURE.md:151-156` sostienen builds inmutables.
- Sin dependencias JS directas de anuncios/auth/crash reporter dedicado ni
  inicialización propia correspondiente. **CONFIRMED para integración propia,
  E-ID/E-START/E-LOCAL**, no una negación de las métricas nativas ML Kit.
- **UNKNOWN**: tráfico exacto/manifest Maven combinado/comportamiento del
  release final, sin AAB ni captura de tráfico. Validar también inicialización
  sin escanear, escaneo y eventos diferidos; una sesión offline no prueba ausencia
  de métricas que puedan enviarse al recuperar conexión.

## 7. Proposed Data Safety answers

**No enviar automáticamente.** La definición incluye transmisión off-device
por SDKs; almacenar solo en SQLite no la demuestra. El compartir manual puede
tener excepciones específicas y no elimina la obligación de estudiar collection.
[Definiciones y excepciones de Google Play](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

| Pregunta | Propuesta | Confianza / evidencia |
| --- | --- | --- |
| Does the app collect or share required user data? | **YES**, por integración ML Kit; descartar NO global | LIKELY para release final, E-CAMERA y documentación del SDK; integración y métricas documentadas CONFIRMED, no tráfico capturado |
| Collects user data | YES, al menos métricas SDK | LIKELY para artefacto; E-CAMERA |
| Shares user data (según definición Play) | **UNKNOWN** para métricas; resolver destinatario/rol de Google y excepciones aplicables | La declaración del SDK sobre no redistribuir a otros terceros no determina por sí sola el papel de Google frente al desarrollador de StockApp |
| Uploads backup/inventory to developer servers | **NO** | CONFIRMED para implementación propia, E-LOCAL/E-BACKUP |
| Account creation / login | **NO** | CONFIRMED, E-START/E-ID; primer uso solicita inventario y moneda, no cuenta |
| Account deletion requirement | NOT APPLICABLE para cuentas StockApp | CONFIRMED respecto a ausencia de cuenta, E-START; no equivale a borrado remoto de métricas SDK |
| Encryption in transit | HTTPS para métricas documentadas de ML Kit; respuesta global por verificar | LIKELY; no extrapolar a apps receptoras de respaldos |
| Deletion request mechanism for SDK data | **UNKNOWN / REQUIRES USER INPUT** | Verificar posibilidad y procedimiento con proveedor; soporte público no demuestra borrado por Google |

### Tipos candidatos si se mantiene esta integración

| Tipo Play candidato | Dato / finalidad | Confianza y acción |
| --- | --- | --- |
| App info and performance → Diagnostics | Métricas técnicas de ML Kit | LIKELY; Analytics como propósito candidato; verificar release |
| Device or other IDs | Identificadores de instalación del SDK | LIKELY; verificar categoría exacta y persistencia |
| App activity → App interactions | Uso/eventos del escáner | LIKELY, revisar mapping final con disclosure SDK |

El SDK documenta también información de dispositivo/app y configuración del
análisis. No inventar ubicación, Advertising ID, nombres de productos, fotografías
enviadas ni crash logs completos. Google indica que las imágenes/resultados ML
se procesan localmente; son diferentes de las métricas.

La condición «opcional» de recolección **no está resuelta**: escanear es opcional,
pero hay que comprobar si el SDK genera métricas antes de abrir el escáner.
Procesamiento efímero, retención y solicitudes de borrado: **UNKNOWN**; no inferir
que no se guarda nada en Google. Estos puntos y sharing necesitan una decisión
documentada antes de enviar el formulario: **DATA_SAFETY_RESOLUTION: BLOCKER**.

### Datos funcionales locales y transferencias elegidas

**CONFIRMED, E-LOCAL/E-BACKUP**: inventario/moneda, productos/códigos/precios,
stock, compras, ventas/líneas, ajustes, movimientos e historial se guardan en
SQLite. El JSON contiene el snapshot de respaldo. No es automáticamente
collection de Files and documents ni Financial info por existir en el teléfono.
El usuario puede escribir información personal en campos libres.

Exportar crea un archivo en cache, invoca share sheet y lo elimina al finalizar
el intento; el destino elegido conserva su propia copia. Restaurar selecciona
un JSON, valida una copia y reemplaza datos locales tras confirmación; no hace
upload a un servidor del desarrollador. La transferencia explícita a otra app
debe valorarse con la excepción de sharing iniciado por usuario; no es un envío
silencioso ni prueba una exención general de collection para todos los destinos.
Auto Backup de plataforma es un flujo distinto y debe verificarse en el release.

**CONFIRMED, E-LINK**: Privacy/Terms/Support abren navegador mediante
`Linking.openURL` al tocar la fila, sin payload de inventario. No hay WebView
en este flujo. El módulo DOM instalado no es evidencia de un WebView usado
para estas páginas. El navegador externo no se audita como StockApp; mensajes
enviados voluntariamente al soporte pertenecen a un canal externo.

## 8. Privacy consistency

La política [publicada](https://ian-k.dev/stockapp/privacy/) devuelve HTTP 200;
indica actualización **2026-10-01** y versión revisada `0.1.0`.
Lectura directa realizada el 2026-10-02 con `Invoke-WebRequest` (web.open no
pudo recuperar esta URL). No se modificó la web.

| Tema publicado | Comparación | Evidencia |
| --- | --- | --- |
| SQLite local, sin backend/sync de inventario | Coincide | CONFIRMED en código propio, E-LOCAL |
| Cámara on demand, sin guardar/subir fotografías | Coincide con camino implementado | CONFIRMED, E-CAMERA |
| JSON sin cifrar, share sheet y copia temporal | Coincide | CONFIRMED, E-BACKUP |
| Restauración sustituye datos; no mezcla | Coincide | E-BACKUP y `src/infrastructure/sqlite/backup-restore-transaction-core.ts` |
| Sin cuenta/login | Coincide | CONFIRMED, E-START |
| Sin analítica del desarrollador ni anuncios | Coincide para integración propia | E-ID/E-START; no describe toda la telemetría del SDK |
| Proveedores/SDKs: sección 6 no identifica SDKs de analítica/tracking | **Incompleta: omite métricas y destinatario Google ML Kit** | E-CAMERA y disclosure oficial Google |
| Retención/eliminación local, respaldos externos y comportamiento del SO | Coincide con el alcance local descrito | E-LOCAL/E-BACKUP; `allowBackup=true` respalda la salvedad sobre el SO |
| Retención/eliminación de métricas SDK | No descrita | UNKNOWN; resolver con información de proveedor |
| Contacto público | `support@ian-k.dev` | Publicación y E-LINK; [soporte](https://ian-k.dev/stockapp/support/) HTTP 200 |

**PRIVACY_POLICY_MISMATCH: BLOCKER.** En otro ticket de `ian-k.dev` se deberá
describir el proveedor ML Kit, sus métricas, finalidades, procesamiento local
de imágenes frente a telemetría, enlaces a información del proveedor y manejo
de solicitudes pertinentes. La frase sobre ausencia de API propia no contradice
el código; el problema es la divulgación incompleta del SDK transitivo.
No prometer que el desarrollador recibe métricas individuales ni que controla
su borrado. Aprobar el contenido después de resolver Data Safety.

## 9. App content answers

| Campo | Propuesta / hechos | Confianza / evidencia |
| --- | --- | --- |
| Login / account creation / authentication | NO | CONFIRMED, E-START/E-ID/E-LOCAL |
| App access | All functionality available without special access; explicar configuración local inicial | CONFIRMED respecto al código, E-START; sin membership/invitación/código/QR de acceso. El escáner necesita cámara/permiso, uso manual no |
| Contains ads | NO | CONFIRMED para integración propia, E-ID y búsqueda SDK/init; ML Kit no es una integración publicitaria |
| Financial-services feature | NO candidato, LIKELY; aprobación del responsable antes de declarar | Inventario y estimaciones comerciales; no banca, crédito, pagos, transferencias, inversiones ni asesoría financiera personal en E-LOCAL/E-ID; `PRODUCT.md:561-585`, `README.md:5-17` |
| Target audience / edades / niños / Families | **REQUIRES USER INPUT** | Producto orientado a pequeños negocios (`PRODUCT.md:60-91`), no determina edad legal. No se identificó experiencia infantil específica en E-START/rutas |

La clasificación financiera es una inferencia descriptiva, no una conclusión
regulatoria ni selección de categoría de tienda. También las apps sin features
financieras deben completar la declaración aplicable en Play.
[Formulario de funciones financieras](https://support.google.com/googleplay/android-developer/answer/13849271?hl=en).

### Insumos factuales para IARC; no se asignó rating

| Tema | Hecho observable | Confianza / evidencia |
| --- | --- | --- |
| User-generated content | Nombres/variantes/inventario/barcodes locales; exportables manualmente; no feed público ni moderación social | CONFIRMED, E-LOCAL/E-BACKUP y `FirstRunSetup.tsx:26-50`; no confundir entrada libre con comunidad pública |
| Social interaction | Sin chat, perfiles, feed ni interacción social integrada | CONFIRMED en rutas/config/composición propias, E-START/E-ID/E-LOCAL |
| Violence / sexual content / gambling | Sin features/contenido editorial identificado de esos tipos | CONFIRMED respecto a UI/rutas propias auditadas, E-START, `src/app/`; no controla texto libre del usuario |
| Controlled substances | Sin venta/catálogo integrado de sustancias; nombres de productos libres podrían nombrarlas | CONFIRMED respecto a features propias, E-LOCAL/E-START; responder IARC según funcionamiento real |
| Location sharing | Sin función ni permisos propios de ubicación identificados | CONFIRMED respecto a código propio, E-ID/E-START; manifest release completo pendiente |

## 10. Store listing assets

Datos conocidos (**CONFIRMED, E-ID/E-LINK**):

```text
App name: StockApp
Package: com.iankexpo.stockapp
Privacy Policy: https://ian-k.dev/stockapp/privacy/
Support: https://ian-k.dev/stockapp/support/
Terms: https://ian-k.dev/stockapp/terms/
Public support contact: support@ian-k.dev (publicado en soporte/política)
```

**Short description candidate, no aprobada (80 caracteres):**
`Inventario local: registra compras, ventas y consulta stock y ganancia estimada.`
Fuente para full description: `README.md:5-21`, `PRODUCT.md:8-27,60-91,141-171`,
`MVP.md:9-24`. Preparar copy final revisando funciones realmente disponibles;
no prometer utilidad neta, contabilidad fiscal, certificación ni publicación.

| Asset | Estado | Evidencia / acción |
| --- | --- | --- |
| App icon | **MISSING** como asset aprobado propio | app.json no define icon/adaptiveIcon y no hay archivo propio versionado; prebuild hereda icono de plantilla. Crear/aprobar icono móvil y asset Play en ticket separado |
| Feature graphic | **MISSING** | Inventario de imágenes versionadas sin gráfico Play; preparar 1024 × 500 JPEG/PNG sin alpha |
| Phone screenshots | **AVAILABLE, HISTORICAL / STALE FOR RELEASE VERIFICATION** | Cinco PNG reales, 1080 × 2424, E-ASSETS; APK fuente `64d0c71`, 2026-09-13, anteriores a SDK alignment y legal links. No hay captura de Más con enlaces. No son mockups ni capturas web |
| Tablet screenshots | **MISSING** | No encontradas. Definir dispositivos/distribución y verificar UI antes de preparar capturas aplicables; no convertir ausencia en bloqueo universal de una app de teléfono |
| Short/full description | **REQUIRES USER INPUT** | Fuentes aprobadas de producto disponibles; copy de store aún no aprobada |

Se verificaron dimensiones/formato con System.Drawing y se abrió `01-home.png`
para revisión visual. Las cinco son PNG de 32 bits; los hallazgos de contraste
de status bar/safe area ya constan en E-ASSETS. Su tamaño puede ser compatible
con capturas ordinarias; no se certifica su aceptación final ni su actualidad.
Los wireframes en `docs/design/wireframes/` no sustituyen capturas de la app.

Play: icono 512 × 512 PNG de 32 bits, hasta 1024 KB; feature graphic 1024 × 500
sin alpha. Capturas: PNG/JPEG con requisitos de dimensión y fidelidad; las reglas
para recomendaciones destacadas (por ejemplo 9:16) son distintas del mínimo
de publicación. Seleccionar/actualizar las capturas después del release build.
[Requisitos de assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).

## 11. Blockers

| ID | Bloqueo real | Remediation propuesta, no implementada |
| --- | --- | --- |
| PLAY_AAB_PROFILE | No hay perfil para AAB/store | Ticket separado para aprobar perfil production descrito en §3 |
| PRIVACY_POLICY_MISMATCH | Política omite métricas del SDK ML Kit | Ticket separado de la web para disclosure ajustado a SDK y Data Safety |
| DATA_SAFETY_RESOLUTION | Sharing/roles, tipos finales, opcionalidad, retención/borrado y transmisión release sin resolver | Auditoría/declaración específica de ML Kit, validar artefacto cuando se autorice build; aprobar respuestas antes de enviarlas |

Icono, feature graphic, copy, capturas actuales, audiencia, firma/Play App Signing
y uploads son preparación y acciones externas pendientes; no son un target API
fallido ni un defecto nuevo del dominio. No se considera el build store validado.

### Play readiness matrix

| Requirement | Status | Evidence | Action |
| --- | --- | --- | --- |
| Package name | READY en configuración | E-ID / prebuild | Confirmar disponibilidad en Console antes de registrar |
| Version | READY | E-ID | Conservar hasta decisión de release |
| Version code | READY técnico / historial externo desconocido | E-ID / §2 | Comprobar que 1 no fue subido; subir código si corresponde en otro ticket |
| Target API | READY — PLAY_TARGET_API PASS | §4, 36/36/24 | Confirmar manifest de futuro AAB |
| AAB build profile | **BLOCKER** | E-BUILD | Aprobar perfil store |
| Signing | PENDING EXTERNAL ACTION | E-BUILD, registro EAS-managed | Verificar upload key/Play App Signing sin divulgar secretos |
| Privacy Policy | **BLOCKER** | §8 | Corregir disclosure ML Kit en web |
| In-app Privacy link | READY | E-LINK, PR #71; Android manual previo `BACKLOG.md:89-104` | Verificar en futuro AAB; iOS no probado en esta auditoría |
| Support URL | READY | HTTP 200 y contacto público, §8 | Completar campos Console manualmente |
| Data Safety | **BLOCKER** | E-CAMERA / §7 | Resolver y aprobar formulario; no responder NO global |
| Permissions | PENDING EXTERNAL ACTION | §5, prebuild + manifests Expo | Inspeccionar manifest combinado y hardware requerido en release |
| App access | READY como propuesta | E-START, §9 | Registrar declaración manual y validar artefacto |
| Ads declaration | READY como propuesta NO | E-ID/E-START, §9 | Registrar manualmente |
| Content rating inputs | PENDING EXTERNAL ACTION | §9 | Responsable responde IARC sin rating inventado |
| Target audience | REQUIRES USER INPUT | §9 | Decidir edades/Families |
| Store listing copy | REQUIRES USER INPUT | §10 | Aprobar textos e idioma |
| Screenshots | PENDING EXTERNAL ACTION | E-ASSETS, §10 | Validar actualidad/selección y dispositivos |
| App icon | PENDING EXTERNAL ACTION | §10, faltante propio | Crear/aprobar assets en otro ticket |
| Feature graphic | PENDING EXTERNAL ACTION | §10, faltante | Crear/aprobar gráfico en otro ticket |

### Inspección reproducible y quality gates

Ejecutados desde raíz salvo el prebuild temporal:

```sh
git status --short --branch
git switch main
git pull --ff-only
git merge-base --is-ancestor 60bc98d0964e0395544be9738bb194bbb5e7c1f6 HEAD
git switch -c docs/google-play-readiness
pnpm --filter @stock-app/mobile exec expo config --type public
pnpm --filter @stock-app/mobile exec expo config --type introspect --json
pnpm --filter @stock-app/mobile exec expo-modules-autolinking resolve --platform android --json
pnpm --filter @stock-app/mobile list --prod --depth Infinity --json
```

Para reproducir prebuild **sin modificar el checkout**: copiar app.json y
package.json a un directorio temporal nuevo, enlazar sus node_modules a los de
la app ya instalada, entrar al directorio y ejecutar el CLI de Expo instalado:

```text
node <checkout>/apps/mobile/node_modules/expo/bin/cli prebuild --platform android --no-install --template <checkout>/apps/mobile/node_modules/expo/template.tgz
```

Inspección guardada fuera de Git en
`C:\Users\USER\.codex\tmp\store-readiness-002-native-inspection\android`.
JSONs de introspección/autolinking/grafo también están en el tmp de Codex.
No se instaló una dependencia, no se corrió Gradle y no se generaron APK/AAB.
Un primer intento con cwd incorrecto falló antes de prebuild; se corrigieron
las rutas absolutas y la inspección final terminó PASS. El package temporal
fue actualizado por Expo; el package/app.json del repo no fueron modificados.

| Gate obligatorio | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; lockfile y dependencias sin cambios |
| `pnpm check` (format, lint, types, tests) | PASS; 1402 tests: Domain 428, Application 424, Mobile 550; cero fallos |
| `pnpm --filter @stock-app/mobile exec expo install --check` | PASS; dependencies are up to date |
| `git diff --check` | PASS |

Log de la corrida: `C:\Users\USER\.codex\tmp\store-readiness-002-gates.log`.
No se añadieron tests para este cambio documental; se ejecutó el gate completo
obligatorio del proyecto. Archivos modificados: este informe y `docs/BACKLOG.md`.

## 12. External actions checklist

**Pendiente; nada configurado en Console por este ticket.** Orden sugerido:

- [ ] Aprobar perfil AAB, resolver Data Safety/ML Kit y publicar corrección de privacidad en sus tickets separados.
- [ ] Aprobar icono/feature graphic, copy, audiencia/edades/Families y dispositivos soportados.
- [ ] Autorizar un build store posterior y verificar package/versionCode, target API, manifest combinado, hardware y firma.
- [ ] Validar inventario offline, cámara/permisos, respaldo/restauración y enlaces en ese release; obtener capturas actuales.
- [ ] Verificar reserva del package e historial de versionCodes con el responsable de Console.
- [ ] Configurar Privacy Policy URL y contacto/Support URL de la ficha.
- [ ] Completar Data Safety con respuestas revisadas, incluyendo SDKs y mecanismos aplicables de solicitud de borrado.
- [ ] Completar Ads declaration y App access según el release validado.
- [ ] Completar Target audience and content y cuestionario IARC.
- [ ] Completar Financial features declaration con la clasificación aprobada, incluso si se declaran ninguna.
- [ ] Completar Store listing (nombre, descripciones, idioma, icono, feature graphic y capturas).
- [ ] Configurar/verificar Play App Signing y upload key, conservando secretos fuera del repo.
- [ ] Cargar el AAB aprobado y revisar las advertencias/requisitos reales de Console.
- [ ] Elegir testing/release track y cumplir los requisitos de la cuenta antes de revisión/publicación.

El historial/antigüedad/tipo de la cuenta Play y sus requisitos de testing son
**UNKNOWN / REQUIRES USER INPUT**. No se promete habilitación de producción
ni se configura un track en esta auditoría.
