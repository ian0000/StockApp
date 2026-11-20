# UAT — Pérdida de formularios durante revalidación de sesión

Fecha: 2026-11-20. Base: main `82cad2ac30e85cc1ac078eb2f70674384a6d2310`.
Rama integrada: `fix/uat-navigation-auth-integrity`. Estado UAT: **PARTIAL**, pendiente de desplegar
el candidato con aprobación y comprobarlo en un navegador móvil físico.

## Diagnóstico y evidencia

La causa común reproducida es un **desmontaje de React**, no una recarga del documento:

1. `SessionProvider` comprueba la sesión al montar, cada 60 segundos y en `focus`/`online`.
2. Antes del cambio, `SessionController.refresh()` publicaba `LOADING_SESSION` y después
   `AUTHENTICATED_LOADING_ME` incluso con la misma identidad y generación.
3. `PrivateBoundary` sustituye `AppShell` por `AccessStatus` durante esos estados.
   React desmonta el Outlet y pierde los `useState` del formulario. Mantener la generación
   y el Query cache, como verificaban los tests anteriores, no evitaba ese desmontaje.
4. Un fallo transitorio en session/Me también publicaba `ERROR` y retiraba el editor.

Antes de corregirlo, los tres tests iniciales de `session-stability.test.ts` fallaron:
se observó `LOADING_SESSION` durante una revalidación pendiente, `ERROR` después de un
fallo de red y falta de retirada explícita de una sesión ya vencida ante fallo de red.
El test de navegador también reprodujo la desaparición del texto al primer ciclo de 60 s.

Causa adicional en edición de Product: `LoadedProduct` retornaba únicamente un error
si fallaba un refetch aunque `query.data` todavía existiera. Esto desmontaba `EditProduct`
y perdía su draft. Se cubre con fallo de consulta, retry y respuesta nueva del servidor.

Inspección de las otras superficies:

| Superficie | Evidencia y conclusión |
| --- | --- |
| Autenticación | Cliente oficial Better Auth imperativo; API con sesiones opacas, TTL absoluto de 7 días y `disableSessionRefresh: true`. No hay refresh JWT ni redirect de renovación. Se prueba que una actualización de `expiresAt` de la misma identidad conserva la vista. |
| HTTP | Fetch con `credentials: include`, `cache: no-store` y `redirect: error`; 401 y denegaciones de acceso siguen retirando la interfaz. |
| Query | Datos comerciales y drafts separados. El error de refetch del editor era una excepción corregida; no se cambian polling/retry/invalidation de negocio. |
| Router | El estado de carga del guard era el disparador común. Navegaciones reales siguen cambiando de ruta; se añade confirmación cuando hay cambios pendientes. |
| Timers/foco | El intervalo de 60 s permanece activo. Se añade revalidación al volver a `visibilityState: visible`, sin desmontar el editor de la misma sesión. |
| PWA/versiones | No hay registro de SW/PWA, `skipWaiting`, `controllerchange`, polling de versiones, auto-reload ni handler de actualización en el cliente. No hay mecanismo de actualización que desactivar o parchear. El test comprueba ausencia de SW sin bloquearlos en el navegador. |
| Despliegue | SPA Vite con assets de hash y headers de UAT. No se modificaron workflows, headers, proveedores, secretos ni entornos. No se ha probado un rollout real de una nueva versión. |
| Segundo plano móvil | Se emulan eventos de foco, visibilidad y reconexión. La suspensión/evicción real del proceso y las particularidades de Safari/Chrome móviles requieren dispositivo físico. |

## Corrección y límites de seguridad

Una revalidación conserva la vista con Me mientras comprueba la misma sesión. La primera
hidratación y un cambio real de identidad siguen usando estados de carga y limpiando datos.
Un fallo transitorio mantiene el editor y publica un aviso con reintento; no afirma que se
haya validado la sesión. Un éxito posterior elimina el aviso. No hay escrituras optimistas.

401/null/revocación/vencimiento siguen invalidando la sesión. Un 403 no se trata como fallo
transitorio. El siguiente control periódico retira una sesión cuyo TTL venció incluso si
la petición anterior quedó pendiente; sus respuestas tardías quedan cercadas por epoch/abort.
La autorización de cada escritura sigue siendo responsabilidad de la API.

Un cambio entre inventarios existentes invalida la generación, cache y drafts. La desaparición
del dataset conserva la semántica previa de incertidumbre de borrado de cuenta. Descargas y
borrado sensibles también cancelan su contexto ante `revalidationError`; sus tests existentes
se conservaron sin relajar assertions.

El editor de Product mantiene el mismo componente cuando falla un refetch con datos en cache,
muestra el error y permite reintentar. Una respuesta actualizada no sobrescribe el draft local;
el guardado mantiene la revisión/conflictos existentes.
Los errores 401/403 retiran los campos inmediatamente, incluso antes de los efectos de sesión;
conservar el draft ante fallos transitorios no conserva datos tras una denegación de acceso.

Alta/edición de Product, compra, venta y ajuste usan un guard común para navegación interna,
atrás y cambio de URL, además de `beforeunload`. Guardar aceptado permite continuar; confirmar
salida permite descartar. Revocación/logout/cambio de cuenta tienen prioridad sobre el guard.

## Borradores y privacidad

Se evaluó persistencia en `sessionStorage`, localStorage e IndexedDB y se conserva la política
vigente de [WEB_UX](WEB_UX.md), [WEB-04](WEB-04.md) y [WEB-06](WEB-06.md): drafts comerciales
solo en memoria. No se añade almacenamiento de payloads, precios, cantidades, PII o credenciales.
La corrección elimina el desmontaje normal, por lo que tampoco requiere copiar formularios a disco.

Los drafts existentes de compra/ajuste y carrito siguen aislados por generación/business/inventory,
con limpieza al aceptar/descartar/salir según su ciclo actual y al retirar la identidad.
Los descriptores mínimos de comandos inciertos en sessionStorage permanecen intactos; no contienen
el formulario y no sustituyen el commit del backend. Los tests existentes de aislamiento y limpieza
siguen en el suite de frontend. El navegador adicional comprueba que editar no escribe en storage.

Límite: cerrar por fuerza el navegador, terminar el proceso desde el SO, recargar confirmando la
salida o perder realmente la sesión puede eliminar el draft. `beforeunload` depende del navegador
y no garantiza recuperación tras evicción móvil. No se promete persistencia duradera nueva.

## Archivos del cambio

| Archivo | Cambio |
| --- | --- |
| `apps/web/src/auth/session.ts` | Revalidación estable, aviso de fallo transitorio, TTL y cambio de inventario. |
| `apps/web/src/auth/context.tsx` | Revalidación al volver de segundo plano. |
| `apps/web/src/routes/access.tsx` | Aviso/reintento sin reemplazar el Outlet. |
| `apps/web/src/account/controller.ts` | Conserva los controles sensibles al fallar revalidación. |
| `apps/web/src/ui/unsaved-changes.ts` | Guard común para salida interna y del documento; prioridad de límites de sesión. |
| `apps/web/src/routes/product-detail.tsx` | Conserva editor ante refetch fallido y protege cambios pendientes. |
| `apps/web/src/routes/products.tsx` | Guard de alta. |
| `apps/web/src/routes/purchases.tsx` | Guard de compra. |
| `apps/web/src/routes/sales.tsx` | Guard de carrito. |
| `apps/web/src/routes/adjustments.tsx` | Guard de conteo. |
| `apps/web/test/session-stability.test.ts` | Revalidación pendiente, fallo/recovery, TTL, respuestas tardías, scope y denegación. |
| `apps/web/test/product-detail.test.tsx` | Campos cached retirados inmediatamente tras 401/403. |
| `apps/web/test/browser/form-stability.mjs` | Suite de navegador automatizada con API sintética y viewport móvil. |
| Este documento | Evidencia, comandos y comprobación UAT pendiente. |

## Pruebas reproducibles

El suite normal usa Node test runner/tsx ya existentes:

```sh
pnpm --filter @stock-app/web test
pnpm check
git diff --check
```

La prueba de navegador usa Playwright **suministrado por el entorno de QA**, sin nueva
dependencia ni cambio de scripts/lockfile. No está incluida en el glob de tests unitarios.
Se ejecuta explícitamente; no hace skip si falta el runtime. Usa Chromium/Edge headless
con viewport 390 × 844, touch y emulación móvil, API HTTP interceptada con DTOs de fixtures.
No accede a UAT ni usa credenciales. El build debe usar la URL sintética:

```powershell
$env:VITE_API_URL = 'https://api.example.test'
pnpm build:web
pnpm --filter @stock-app/web exec vite preview --host 127.0.0.1 --port 4173
```

En otra terminal, con Playwright instalado en el entorno de QA:

```powershell
$env:WEB_TEST_URL = 'http://127.0.0.1:4173'
$env:PLAYWRIGHT_MODULE = '<ruta absoluta al paquete playwright del entorno QA>'
$env:BROWSER_CHANNEL = 'msedge'
pnpm exec tsx --conditions=development --test apps/web/test/browser/form-stability.mjs
```

La prueba de cinco minutos adelanta el reloj del navegador, ejecutando cinco intervalos reales
de la aplicación; no afirma cinco minutos de espera física. Comprueba el mismo nodo conectado,
el valor intacto y una sola solicitud de documento. Los otros casos verifican foco/reconexión,
refetch fallido y exitoso, cancelar/confirmar salida, guardado aceptado/entrada limpia, compra,
venta, ajuste, storage vacío y retirada de datos al revocar/cerrar sesión.

Resultados finales de gates y CI se registran en la PR del candidato. No se modifica ninguna
prueba existente para obtener verde. Correcciones mecánicas del nuevo harness: el fixture de alta
usa HTTP 200 según `ProductsClient.create`; los eventos sintéticos de visibilidad propagan hasta
window como requiere el FocusManager instalado; las recargas se cuentan por solicitudes de
documento, excluyendo navegación interna del router. No cambian contratos productivos.

Validación inicial de esta corrección: frontend 1006 PASS, navegador emulado 7 PASS y
`pnpm check` PASS (2620 pruebas incluyendo CI, cero fallos/skips), lint/types/build incluidos.
El reporte relacionado de navegación/auth se integra después; sus gates finales se registran en
[UAT-NAVIGATION-AUTH-INTEGRITY](UAT-NAVIGATION-AUTH-INTEGRITY.md) y la PR.

AUTO-FIX local: checkout Windows con `core.autocrlf=true` convertía los archivos a CRLF y
provocaba fallos de OpenAPI/Prettier. SOURCE OF TRUTH: blobs de Git y generador canónico.
Se normalizaron únicamente archivos cuyo SHA con LF coincidía exactamente con el índice,
y se regeneró OpenAPI sin diff de contenido. FILES: checkout local, sin cambios versionados
adicionales. PRODUCTION BEHAVIOR CHANGED: NO. No se alteraron scripts ni assertions.

## Pendiente para aceptación UAT

Con autorización de despliegue y candidato exacto aprobado:

1. Desplegar ese SHA en UAT; conservar el mapping de artifacts y comprobar gates del mismo SHA.
2. En Safari iOS y Chrome Android físicos, abrir cada formulario con datos ficticios, escribir
   y esperar al menos cinco minutos; comprobar campos y ausencia de navegación del documento.
3. Alternar aplicaciones/bloquear pantalla y volver; cortar/restaurar red durante edición.
4. Verificar salida atrás/menú/recarga, continuar editando tras cancelar y guardar una sola vez.
5. Comprobar guardar, cancelar, cierre de sesión y acceso con otra cuenta sin restaurar drafts ajenos.
6. Comprobar una nueva versión disponible mientras se edita; no confundir carga manual de otra
   ruta con recarga automática. Registrar dispositivo, SO/browser, SHA, hora y resultado.

No se hizo merge, despliegue ni cambio en producción. La validación local/emulada no satisface
el último criterio de aceptación: **UAT PARTIAL** hasta observar el candidato en móvil real.
