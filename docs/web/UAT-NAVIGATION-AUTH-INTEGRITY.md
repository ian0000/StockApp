# UAT — Navegación e integridad de autenticación

Fecha: 2026-11-20. Rama de trabajo: `fix/uat-navigation-auth-integrity`.
Base local inspeccionada: `82cad2ac30e85cc1ac078eb2f70674384a6d2310`.

El reporte humano describe el entorno UAT **anterior a estos cambios locales**. No representa
una regresión del candidato local. No se han consultado cuentas, hashes, eventos privados,
variables sensibles ni datos comerciales de UAT. La base local no certifica el SHA desplegado.

Este documento reúne la evidencia del ticket de navegación/registro/reenvío. El diagnóstico y
las pruebas específicas de pérdida de formularios están en
[UAT-MOBILE-FORM-RELOAD](UAT-MOBILE-FORM-RELOAD.md).

## Estado de la investigación

| Reporte | Evidencia confirmada | Estado |
| --- | --- | --- |
| Pérdida periódica de formularios | Revalidación de sesión cada 60 s retiraba el árbol privado por estados de carga, incluso con identidad inalterada. Error de refetch también retiraba el editor de Product con datos en cache. Reproducido localmente antes de la corrección. | Corregido localmente; pruebas de la primera iteración PASS. |
| Aparente recarga al navegar | `RouteContent` sustituía todo el Outlet por LoadingPage durante la carga de rutas lazy. Se confirmó el desmontaje mediante un test focused que falló antes del cambio. Los enlaces internos usan React Router; el navegador cuenta una sola solicitud de documento. | Corregido el remount; no se reprodujo una recarga completa del documento. |
| Registro duplicado cambia contraseña | PostgreSQL real con cuentas verificadas/no verificadas conserva exactamente hash, account ID, `updated_at`, nombre y estado de verificación tras duplicar con otra contraseña y mayúsculas en correo. No cookie/sesión nueva; la contraseña intentada falla y la original funciona. | Vulnerabilidad NO REPRODUCIDA en el código/configuración local auditados. |
| Reenvío sin correo/error útil | Registro duplicado y reenvío a cuentas verificadas/ausentes no envían por diseño y retornan respuesta pública genérica. Antes la UI sugería envío y los fallos sólo contaban con señal genérica, sin aceptación/message ID sanitizado. | Mensajes públicos y observabilidad corregidos; entrega UAT histórica no verificada. |

## Causas y cambios mínimos

### Navegación

Hay dos desmontajes confirmados: el control periódico de sesión descrito en el reporte de
formularios y el reemplazo del Outlet durante una transición lazy. Son causas distintas que
comparten el efecto visual de retirar la interfaz completa. No se encontró `location.reload`,
`location.assign` ni `location.replace` en el frontend; los anchors HTML observados son anclas
de accesibilidad o enlaces externos, y las rutas internas usan React Router.

`RouteContent` ahora conserva el Outlet y muestra un estado de carga adyacente. Se mantiene
el fallback de hidratación inicial y no se deshabilita la carga lazy. La prueba de navegador
retiene artificialmente el script de la ruta siguiente y comprueba continuidad del mismo
shell/sidebar y una sola solicitud de documento. Las transiciones de identidad siguen
retirando datos privados y no se confunden con navegación comercial normal.

### Integridad de contraseña

El endpoint oficial de Better Auth 1.7.7 devuelve un usuario sintético ante el registro
duplicado bajo la configuración actual. El hash calculado en esa rama se descarta para
conservar el comportamiento temporal; no se ejecuta un update de credenciales ni un nuevo
link de account. No se añadió un handler propio de contraseñas ni se modificó auth para
corregir una vulnerabilidad no demostrada.

La nueva regresión `signup-integrity.test.ts` compara las filas antes/después en PostgreSQL
y prueba cuentas verificadas y no verificadas, correo normalizado, ausencia de sesión/cookie,
ausencia de envío duplicado, rechazo de la contraseña intentada y aceptación de la original
tras verificación. También comprueba que ni contraseñas ni hash aparecen en logs. Las pruebas
existentes de reset cubren token de un solo uso/expiración y revocación de sesiones; verificar
otra vez un token de verificación válido es idempotente según el contrato existente y no se
presenta como apropiación de cuenta.

El escenario humano de UAT no tiene una causa histórica confirmada sin sus eventos y SHA.
Puede requerir distinguir un primer alta completada de un duplicado, credenciales previamente
válidas o un reset autorizado. Esas posibilidades son hipótesis, no conclusiones.

### Reenvío y entrega

La respuesta pública genérica se conserva para evitar enumeración. El cliente explica que la
solicitud fue aceptada y, si corresponde, se intentará enviar; no afirma que el mensaje llegó.
Ofrece login y recuperación como caminos distintos de reenviar verificación. Errores HTTP
500/429 siguen mostrando mensajes seguros y no se convierten en éxitos simulados.

El proveedor emite eventos internos de aceptación/fallo con transporte, status HTTP y message
ID de Resend sólo si tiene forma UUID conforme al schema del proveedor. El servidor registra esos
campos y mensajes fijos, sin destinatario, body, URL/token, API key o detalles arbitrarios del
proveedor. Fuente del ID: [schema OpenAPI oficial de Resend](https://github.com/resend/resend-openapi/blob/main/resend.yaml).
La aceptación del proveedor no acredita entrega en inbox. El callback de observabilidad
no puede cambiar el resultado ni provocar un segundo envío.

La cola de auth sigue siendo un conjunto de promesas en memoria que se drena al cerrar; no es
durable y no se añadió retry automático. Un proceso terminado antes de enviar o un rebote del
proveedor requieren diagnóstico operativo. No se verificaron remitente/DNS/domain ni delivery
events de UAT mediante cuentas o secretos reales.

### Archivos adicionales al arreglo de formularios

| Archivo | Responsabilidad |
| --- | --- |
| `apps/web/src/app/router.tsx` | Conserva Outlet/layout durante lazy navigation. |
| `apps/web/src/routes/auth.tsx` | Mensajes de solicitud y ayuda login/reset sin prometer entrega. |
| `apps/web/test/app.test.tsx` | Regresión de continuidad durante navegación lazy. |
| `apps/web/test/auth-client.test.ts` | Resend público equivalente y errores seguros 500/429. |
| `apps/web/test/product-detail.test.tsx` | Denegaciones 401/403 no dejan el editor visible con datos cacheados. |
| `apps/web/test/browser/navigation-auth.mjs` | Navegación/document requests, lazy shell y flujos auth sintéticos. |
| `apps/api/src/auth/email-provider.ts` | Eventos internos de aceptación/fallo sanitizados. |
| `apps/api/src/auth/runtime.ts` | Propagación del callback de observabilidad. |
| `apps/api/src/server.ts` | Logs fijos y contexto permitido; sin credenciales ni destinatario. |
| `apps/api/test/email-provider.test.ts` | Regresión de eventos, sanitización y callback fallido. |
| `apps/api/test/auth/signup-integrity.test.ts` | Invariantes de credenciales y anti-enumeración en PostgreSQL real. |
| `apps/api/test/auth/resend-delivery.test.ts` | Integración de evento aceptado/fallo de Resend con PostgreSQL real. |
| Este documento | Evidencia conjunta, tooling y límites de aceptación. |

## Entorno de pruebas aislado

No había PostgreSQL ni Docker instalados/disponibles en PATH. Se prepararon binarios portables
oficiales EDB PostgreSQL 18.6-5 Windows x64 en el directorio ignorado `.ci/postgres-qa`.
La descarga se verificó antes de extraer mediante el sidecar SHA-256 del mismo distribuidor:

```text
postgresql-18.6-5-windows-x64-binaries.zip
e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2
```

Fuentes: [distribución Windows reconocida por PostgreSQL](https://www.postgresql.org/download/windows/),
[binarios oficiales EDB](https://www.enterprisedb.com/download-postgresql-binaries) y
[checksum del archivo fijado](https://get.enterprisedb.com/postgresql/postgresql-18.6-5-windows-x64-binaries.zip.sha256).
`postgres --version` y `pg_dump --version` devolvieron 18.6.

Se inicializó un cluster nuevo exclusivo de QA, con SCRAM y credencial sintética, escuchando
sólo en `127.0.0.1:55432`; base de administración `stockapp_test`. No se instaló un servicio
global ni se conectó a UAT/producción. El runner existente crea y elimina sus bases
`stockapp_test_<id>` y conserva el gate de provisioning y concurrencia global de 2.
`TEST_POSTGRES_BIN` apunta a los clientes 18.6 portables. No se modificaron pools,
`connectionTimeoutMillis`, timeouts de CI, migraciones, scripts, dependencias ni assertions.

La primera ejecución de `test:db` sobre datos de QA en D: se marcó **INTERRUPTED** por
infraestructura, no PASS ni SKIP. El disco local de D: es HDD y los logs de PostgreSQL mostraron
checkpoints de DROP con sincronización de aproximadamente 4–5 s. Se conservan el cluster y el
log ignorados como evidencia; el runner propio se interrumpió y el cluster se cerró limpiamente.
No se atribuyó un fallo de negocio ni se modificó ninguna garantía para acelerar la suite.

Para ejecutar el suite completo desde cero se creó otro cluster descartable exclusivo en
`C:\Users\nikla\AppData\Local\Temp\StockApp-UAT-QA-20261120`, sobre NVMe, con los mismos binarios,
parámetros de initdb, autenticación, puerto y runner. Elegir la ubicación de almacenamiento del
recurso temporal fue una corrección de QA local; no cambia configuración PostgreSQL, recursos de CI,
pools, concurrencia o timeouts. No hubo borrado forzado, terminación global de backends ni cambios
en bases ajenas.

La revisión cruzada también detectó una carrera al preservar formularios: un refresh pendiente
podía restaurar su snapshot anterior si otro endpoint ya había comunicado un 403 de negocio.
Se añadieron pruebas que fallaron antes del ajuste; el controlador ahora aborta/invalida el epoch
de esa comprobación y sólo retiene la vista si sigue siendo exactamente el snapshot vigente.
Se conserva así el retiro de acceso denegado frente a respuestas de sesión tardías o fallidas.
La misma revisión confirmó que conservar datos cacheados ante errores del editor debe excluir
401/403, incluso un 403 genérico fuera de la allowlist comercial. Dos regresiones SSR fallaron
antes del ajuste y pasaron después; el editor sólo se conserva para errores que no son una
denegación de autenticación/autorización.

## Quality gates

La primera iteración de corrección de formularios completó `pnpm check` con exit 0:
CI 77, Domain 428, Contracts 38, Application 432, Mobile 551, Web 1006 y API 88;
total 2620 tests, cero fallos, cancelaciones o skips. Incluye lint/typecheck y builds API/Web.
El warning existente de bundle Vite mayor a 500 kB se conserva.

Estos conteos corresponden a esa iteración, antes de consolidar los agentes de auth/navegación.
Un `pnpm check` integrado posterior completó 2627 tests (CI 77, Domain 428, Contracts 38,
Application 432, Mobile 551, Web 1011 y API 90), cero fail/cancelled/skipped, lint/typecheck y
builds API/Web PASS. El build API incluye el formato UUID final de telemetría. Después se
añadió el retiro del editor cacheado ante 401/403 (sólo Web); el check se repetirá con esas
dos regresiones. El test DB completo se ejecuta por separado y sigue válido para la fuente API
estable; no se infiere su resultado desde `pnpm check`.

| Gate final | Resultado | Evidencia/límite |
| --- | --- | --- |
| `pnpm check` | PASS final | 2629 tests: CI 77, Domain 428, Contracts 38, Application 432, Mobile 551, Web 1013 y API 90; 0 fail/cancelled/skipped; lint/typecheck y builds API/Web PASS. Log `.ci/check-final.log`. |
| Auth PostgreSQL focused | PASS | 4 tests, cero fail/skips: hash invariante verified/unverified, resend no enumerante y runtime Resend. |
| `pnpm test:db` completo | PASS | PostgreSQL real 18.6: 1052 tests, 0 fail/cancelled/skipped/todo; 575 casos principales; 373952.4637 ms. Log `.ci/test-db-final.log`. |
| Navegador: formularios | PASS final | 9 escenarios sobre build de producción servido por preview; Chromium/Edge headless 390 × 844; reloj adelantado para cinco intervalos de 60 s. No dispositivo físico. |
| Navegador: navegación/auth | PASS final | 3 escenarios del mismo build final; API sintética; una solicitud de documento, continuidad lazy shell, errores/login/signup/resend/reset. |
| Generadores/validadores | PASS | Drizzle y auth generate sin drift de schema; auth check; `ci:validators` compara 62 validators. |
| Documentación/workflows | PASS | `ci:docs` y `ci:workflows` con actionlint fijado. |
| `git diff --check` final | PASS | Incluye el diff de la implementación y sus pruebas; sin whitespace inválido. |
| UAT desplegado/móvil físico | NO EJECUTADO | Requiere aprobación de despliegue y dispositivo real. |

Las dos suites de navegador se ejecutaron conjuntamente mediante el comando explícito de QA
descrito en el reporte de formularios, pasando ambos archivos
`apps/web/test/browser/form-stability.mjs` y `apps/web/test/browser/navigation-auth.mjs` al runner.
Resultado conjunto: **12 PASS, 0 fail/cancelled/skipped**, log ignorado `.ci/browser-final.log`.

Controles focused adicionales reportados por los agentes: API typecheck/lint PASS,
email-provider 17 tests PASS; Web focused auth/app 27 tests PASS. Todos sin skips ni cambios
en assertions existentes. El resultado de `test:db` completo y del check integrado prevalece
sobre esos resultados parciales para la entrega final.

Cobertura de autenticación de la suite PostgreSQL existente, además de los casos nuevos:

- `identity-sessions.test.ts`: alta nueva, verificación requerida, login correcto/incorrecto,
  sesión expirada/revocada y retiro de acceso.
- `password-reset.test.ts`: respuesta no enumerante, token seguro de un solo uso, expiración,
  rechazo de reutilización, cambio autorizado de contraseña y revocación de todas las sesiones.
- `policy.test.ts` y `security/auth-rate.test.ts`: verificación/reenvío, Origin y limitación
  de abuso con almacenamiento PostgreSQL real.
- `resend-delivery.test.ts`: integración runtime real con fetch del proveedor simulado,
  aceptación/fallo 503 y ausencia de datos sensibles en respuestas/eventos.

El mock del proveedor acredita el manejo del protocolo de envío, no un envío ni entrega real.

La ejecución DB final usó el cluster nuevo en NVMe y el API compilado con la fuente final de
autenticación/telemetría. El cambio posterior de cache del editor sólo afecta Web y no invalida
la suite API/DB. Incluyó auth, ownership, seguridad/rate, comandos/atomicidad, migraciones,
readiness, HTTP compilado, snapshots, cifrado/recovery con pg_dump/pg_restore reales y borrado.
Se conservaron todas las pruebas; no hubo retries de aceptación, skips ni tuning. El runner
eliminó sus bases disposable; se comprobó cero bases `stockapp_test_<id>` restantes y se
cerró limpiamente el cluster local de QA. No queda un servicio PostgreSQL global instalado.

## Límites y aceptación

La validación local con fixtures prueba el código, sin demostrar qué ocurrió en la cuenta del
reporte ni la entrega de un mensaje real por Resend. No se afirma apropiación de cuentas ni
que el registro duplicado sea seguro en un despliegue cuyo SHA/configuración no se verificó.
Los eventos privados históricos y delivery/bounce del proveedor siguen fuera de esta ejecución.
El intento de consultar únicamente metadata de proyectos Railway en modo lectura devolvió
`UNAUTHORIZED` por necesidad de reautenticación del conector; no se obtuvieron eventos, servicios,
variables ni datos de UAT y no se realizó ninguna mutación. No se requiere esa conexión para
terminar los arreglos locales y sus regresiones.

No hay merge ni despliegue automático. La aceptación UAT permanece **PARTIAL** mientras no
se valide el candidato desplegado en un navegador móvil real; cualquier vulnerabilidad de
modificación no autorizada de contraseña confirmada obliga a **BLOCKED** y contención antes
de aprobar UAT. El resultado de la prueba de hash se registrará expresamente.
