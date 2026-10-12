# WEB-07 — Conteo físico y ajuste de stock

Base main `b3af8fadd0c52c2aeef8fbf5e3578fb44821c11c` (WEB-06, PR #98), actualizada,
limpia y 0 ahead/0 behind. Rama `feat/web-07-stock-adjustment`.

## Preflight completo

Revisión READ-ONLY de AGENTS65.1, BACKLOG, WEB-03/04/05/06, WEB_UX, API/API-01/05/08,
CONTRACTS_V1, DOMAIN_REUSE, SECURITY, TESTING, CI_CD, CURRENT_STATE, BUSINESS_RULES31–34,
UX29–31, contracts commands/entities/routes/transport, Application AdjustStock, Domain
StockAdjustment/Inventory/Money y referencias Mobile de ajuste. Web reutiliza Products queries,
barcode teclado y ScopedCommandController. HUMAN DECISIONS REQUIRED: NONE.

| Puntos | Evidencia y aplicación |
| --- | --- |
| 1–5 | API-05 registra POST adjustments STOCK_ADJUST, resultado AdjustStockResult y singleProduct, implementados en manifest/runtime. |
| 6–11 | actualStock es conteo final entero seguro >=0; before puede ser negativo; diferencia derivada segura; cero produce422 sin movimiento. |
| 12–15 | Cinco motivos; positivo solo COUNT_CORRECTION/OTHER, negativo todos; OTHER sin explicación adicional. |
| 16–22 | Positivo requiere costo conocido aceptado o custom Money >=0; null distinto de0; negativo ambos inputs null; cero no válido. |
| 23–28 | Domain pondera stock positivo y no déficit; negativo conserva costo. No Purchase/Sale/INITIAL_STOCK. |
| 29–31 | Adjustment histórico inmutable, sin status CONFIRMED/VOIDED ni Undo/void. |
| 32–35 | Revisión literal string, stock/unitCost/lastMovementId exactos; operation-ref no válido en HTTP directo; mismatch409 terminal. |
| 36–39 | Missing/archived/foreign404 seguro; tres UUIDv7 nuevos, key=operationId; ChangeSet Adjustment/Movement/State. |
| 40–44 | Sin detail Adjustment ni History nueva; invalidación Products después de aceptación, sin optimistic stock; regresiones existentes conservadas. |

## Implementación y confirmación

`/adjustments/new` reemplaza el placeholder. Conserva preselección query `productId` validada
como UUID y resuelta por GET propio; ningún dato comercial en navegación. Búsqueda servidor,
keyset Cargar más y barcode exacto con ceros iniciales. UI desktop/narrow y teclado con labels,
errores asociados/foco y aria-live. Conteo vacío inicialmente; motivo Conteo incorrecto;
costo actual precargado solo si conocido, custom vacío cuando no existe.

Preview deriva actualStock-stockBefore con overflow guard; -3→0 es entrada+3. Cero deshabilita
confirmación, sin UUID/CSRF/POST. Positivo filtra motivos; si cambia el signo a un motivo incompatible,
se exige selección visible. Money puro acepta hasta seis decimales, punto/coma y cero explícito.
No fórmula financiera nueva. Negativo oculta costos y envía ambos null, aunque exista texto custom.

Revisar conteo obtiene GET actual y crea una revisión en memoria, todavía sin command. Confirmar
ajuste obtiene otro GET: cualquier cambio de State/costo aplicable actualiza la revisión y exige
nueva confirmación. Conteo físico permanece intacto; 10→conteo12, estado fresco8 significa+4.
El command se construye únicamente tras confirmar la revisión vigente: tres UUIDv7, un timestamp,
versions compartidas, dependsOn[], payload allowlist y expectedStateRevision string exacta con
stock/unitCost/lastMovementId. CSRF precede al POST y key=operationId.

200 valida el schema estático compartido y las relaciones de identidad/scope, evidencia,
Adjustment/Movement/State, snapshots, tiempos y revision+1 exacta. La comprobación de costo usa
applyStockAdjustment existente de Domain; no promedio escrito en React. Resultado server conserva
stock/costo promedio autoritativos. Solo invalida Products scoped, sin patch optimista ni auth clear.
Confirmación muestra antes→después, diferencia, motivo y costos correspondientes; acciones Ajustar
otro producto/Volver a productos/Ver producto. Sin endpoint/detail/Undo de Adjustment.

## Incertidumbre, conflictos y privacidad

Mismo ScopedCommandController para send/check/retry/discard. Network/timeout/500/503/malformed
conservan command completo solo en memoria. Retry mantiene body, todos los IDs, key y preconditions;
renueva CSRF pero no obtiene State para modificar la intención. Single-flight evita doble confirmación.
Reload espera auth/Me/Inventory propio y consulta receipt antes de otra intención. ACCEPTED extrae
solo stockAdjustments[0]/inventoryMovements[0]/inventoryStates[0] públicos, valida consistencia,
limpia e invalida y anuncia El ajuste anterior sí fue registrado. Sin resultReferences internos ni
formulario ficticio. Receipt404/malformed conserva incertidumbre y exige comprobar/descarte consciente.

409 terminal limpia pending, conserva Product/conteo/motivo/texto custom y obtiene detalle actual.
Muestra stock observado/actual/conteo/nueva diferencia; no reenvía. Siguiente revisión/confirmación
explícita genera IDs nuevos y evidencia fresca; si coincide, no crea movimiento.404/422 terminales
usan mensajes seguros; no selección automática de otro Product ni same-key retry terminal.

Único almacenamiento nuevo: sessionStorage `stockapp.pending-adjustment`, EXACTAMENTE
`{operationId,inventoryId,commandKind:'STOCK_ADJUST'}`. Sin IDs comerciales/productId, cantidades,
stock/diferencia/motivo/costos, metadata, payload, PII, tokens ni CSRF. Allowlist rechaza extras;
fallo de storage antes del primer envío impide POST. Sin localStorage/IndexedDB/cache persistida/outbox.
Draft/revisión viven solo en memoria scoped. Misma sesión preserva draft/confirmación; navegación
real limpia revisión no enviada, intención incierta conserva retry. Logout/invalidación/User/Business/
Inventory distintos abortan, limpian y fencean respuestas tardías, sin receipt de otra cuenta.
Offline conserva texto y bloquea writes/retries; nueva intención online requiere lectura fresca.

## Browser smoke local

Fixture sintético local, sin producción/proveedores: preselección válida e inválida, búsqueda server
Agua y barcode0012345; stock10/conteo12:+2+costo, stock10/conteo8:-2+sin editor de costo,
stock-3/conteo0:+3+custom obligatorio y foco al error. Respuesta perdida: dos POST con body/key
idénticos y un único Adjustment aceptado. Estado entre review/confirm pasó10→8: preview+4,
conteo12 intacto y cero POST adicional.409 durante write conserva draft y requiere revisión.
Auth polling avanzó6→8 manteniendo count12 y revisión; cambio User/Inventory retira draft propio.
Viewport narrow sin overflow horizontal; controles mantienen baseline44px. No certificación QA-03.
Selección manual mientras GET de preselección estaba bloqueado: conteo12 persistió después de
liberar la lectura vieja200, y pudo revisarse correctamente. Una versión de selección fencea
preselección/barcode tardíos sin reemplazar elecciones posteriores. La barrera externa inicial
leyó JSON parcial durante escritura del archivo de control; el harness espera la notificación
de escritura completa, sin sleeps ni retry de comandos. Ese intento invalidado no se cuenta PASS.

## Validación y frontera

Estado: IMPLEMENTED / gates locales PASS. CI y GitGuardian del head final requeridos antes de merge.
Focused Adjustment116 PASS; Web completa596 PASS. Último pnpm check2073 PASS:
Domain428/Application432/Mobile551/Contracts38/API28/Web596,0fail/skip/cancelled;
lint/typecheck/format/OpenAPI y ambos builds incluidos. API build separado PASS.
db:generate sin schema/migration drift; auth:generate sin diff; auth:check PASS.
git diff --check PASS y diff completo revisado, sin archivos fuera del scope descrito.
Warning Vite principal1205,68kB/gzip195,80kB y lazy adjustments10,02kB/gzip3,38kB;
se conserva sin relajar límites ni introducir optimización fuera del ticket.
Historial WEB-06 de timeout al establecer conexión PostgreSQL permanece sin root cause demostrado;
este ticket no modifica pools/timeouts/concurrency/configuración PG/CI ni reclama reparación.

QA INFRASTRUCTURE: el cluster local previo no podía crear DBs descartables:58P01,
`base/1/4171` ausente, identificado como pg_toast_1247 en template1. Otra lectura encontró
`base/16384/3455` ausente; instalación portable carecía de share/postgres.bki. La primera corrida
fallida (551 resultados,13 PASS/538 FAIL) quedó archivada, sin contarse como gate PASS.
Se detuvo el QA tras comprobar cero clientes y cero DBs descartables, preservando su árbol.
Cluster nuevo aislado en artifacts usa recursos completos de PostgreSQL18.6 del
[archivo oficial EDB](https://www.enterprisedb.com/download-postgresql-binaries).
SHA-256 de postgres.exe antiguo/nuevo idéntico:
`8B8BF5D400487159E3E117053D3F5A89FAD0C740B310A3AC69E5720CE4F818E1`.
postgresql.conf/auto.conf/pg_hba.conf/pg_ident.conf copiados y hashes comparados: sin cambios
de configuración. Mismo puerto65432, encoding/locale y PostgreSQL real; fuentes/harness intactos.
CREATE inicial y Adjustment atomicity8 PASS verifican recovery del provisioning; no reparación
del cluster anterior ni explicación de por qué desaparecieron sus archivos.

La corrida completa siguiente tuvo1003 PASS/1FAIL/0skip: products/create.test.ts103,
UUIDv4 nuevo inválido. Timeout ocurrió antes de la aserción contractual, en helpers.ts69:
primer SELECT1/establecimiento de conexión nueva dentro del provisioning coordinator.
No se amplía su serialización ni se atribuye causalidad a checkpoints. Caso aislado1PASS y
archivo15PASS, cero skips. Primera conexión del fixture aislado57,52ms sin waiting de pool.
Trazas externas temporales delegan al driver original y registran tiempos/pools/stack, sin SQL,
payload/PII/tokens; permiten comparación controlada con una corrida completa observada.
Estas corridas fallidas no se presentan como PASS ni como corrección del timeout intermitente.

La corrida observada terminó1003 PASS/1FAIL/0skip/0cancelled,474,377s. Products/Create pasó,
pero void-purchases/concurrency.test.ts33, escenario archive-before, falló al consultar
waitForInventoryLock en commands/helpers.ts104. Driver abrió una conexión nueva de observación,
fuera del coordinator y antes de ejecutar SQL:2007,04ms, total1/idle0/waiting0 al fallar.
No timeout de ejecución SQL ni prueba de causalidad de checkpoint; ambos escenarios demuestran
intermitencia sin root cause. No más corridas completas para buscar verde.
La CI existente usa postgres:18.6 Linux. Docker Desktop instalado se inició sin alterar settings,
pero inicialmente la API no confirmó readiness en probes acotados. El log identificó sockets
IPC inaccesibles de dockerInference y docker-secrets-engine/engine.sock. Con procesos propios
detenidos se conservaron ambos directorios temporales bajo nombres stockapp-web07-preserved
y stockapp-web07-second-preserved, y Docker regeneró los endpoints. No se tocó VHD, volúmenes,
credenciales/settings ni se aplicó reset de fábrica. Engine29.7.2 confirmó readiness.
Se provisionó el container exclusivo stockapp-web07-postgres-qa, localhost65433, postgres:18.6
(digest74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336), variables existentes
de CI y PostgreSQL18.6 Debian verificado. Gate completo en este entorno nuevo, sin tuning,
sin modificar harness ni repetir la corrida Windows buscando verde.
Ambos clusters PostgreSQL Windows quedan detenidos y preservados;
el QA nuevo se detuvo con cero clientes/bases descartables. Logs y trazas externos conservados.

Gate final en el container Linux: test:db1004 PASS/0FAIL/0SKIP/0CANCELLED/0timeout,315,716s.
Incluye API-01..10, Auth, Ownership, Security y compiled HTTP. Generadores ejecutados después:
db:generate sin cambios/migration drift; auth:generate sin diff y auth:check PASS.
BLOCKERS locales: NONE. El timeout intermitente Windows sigue sin root cause/fix demostrado;
el PASS corresponde al QA PostgreSQL real Linux nuevo, no a esas corridas fallidas.
No se cambió connectionTimeoutMillis/pool.max/concurrency/server settings/CI,
ni se añadieron retries/sleeps/skips o assertions relajadas. PR/CI/GitGuardian/merge se verifican
sobre el head final; sincronizar main clean0/0 después de merge normal. STOP, sin WEB-08/Sync/MIG/deploy.

Smoke adicional con GET barcode bloqueado: conteo/motivo/costo/selección y Revisar conteo
permanecen disabled hasta terminar la lectura; después se desbloquean. Cero POST durante la barrera.

Sin dependencias/lockfile nuevos. Compiler browser build-only añade AdjustStockCommand/Result
desde schemas existentes y los prueba bajo CSP; ningún schema público/version/OpenAPI cambia.
API runtime, Domain/Application source, Mobile, PostgreSQL/SQLite schema/migrations y CI intactos.
STOP después del merge/main clean0/0; no WEB-08, Sync, MIG ni deployment.

## AUTO-FIX

CAUSE: route-manifest test Web seguía esperando placeholder Adjustment.
SOURCE OF TRUTH: ruta real aprobada WEB-07 y ticket actual.
FILES: apps/web/test/app.test.tsx.
PRODUCTION BEHAVIOR CHANGED FOR TEST FIX: NO; conserva comprobaciones del shell/rutas futuras.

CAUSE: browser fixture local consultaba barcode en vez de code.
SOURCE OF TRUTH: cliente Products/API existentes usan query code.
FILES: fixture externo a Git en artifacts; ninguna fuente de producción.
PRODUCTION BEHAVIOR CHANGED: NO.

Correcciones durante implementación: checks scoped de Business en el controller Adjustment,
dependencias del effect/memo según lint y key React scoped. Son garantías solicitadas del ticket,
sin alterar auth polling ni semántica API/Domain.
