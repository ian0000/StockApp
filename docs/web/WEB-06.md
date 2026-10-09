# WEB-06 — Purchase registration, detail and price recommendation

Base verificada: `13fd52c49d86e180de8fa888851416c9c844cba6`, main limpio0/0 tras WEB-05.
Rama: `feat/web-06-purchases`. Scope exclusivo WEB-06; STOP tras merge y main limpio.

## Preflight completo

Revisión read-only de AGENTS65.1, Web03/04/05, API01/02/04/08, UX/BUSINESS_RULES,
contracts/transport y código Money/Percentage/Application; Mobile solo como referencia.
Decisiones humanas nuevas: ninguna. Los46 puntos del ticket quedan resueltos por fuentes existentes:

| Puntos | Fuente / comportamiento aprobado |
| --- | --- |
| 1–7 | RegisterPurchaseCommand: un Product, quantity segura positiva, Money no negativo/cero conocido, notes:null, identidades v7/key=op |
| 8–14 | API04 directo exige revision string y stock/unitCost/lastMovementId exactos; cualquier State stale409, incluida Sale concurrente, sin recalculación silenciosa |
| 15–20 | Metadata no cambia State; archive antes404/después conserva Purchase; negativo permitido, déficit no pondera promedio Domain |
| 21–28 | Result autoritativo con Purchase/Product/beforeState/afterState/priceAnalysis/Movement/revision/time; Purchase no escribe Product, precio requiere UPDATE separado sin repetir compra |
| 29–34 | PurchaseDetail no tiene analysis ni nombre; VOIDED legible, acción WEB09 pendiente; editor transitorio se descarta al salir/reload salvo mutación Product incierta |
| 35–41 | Application selecciona previousMargin válido/currentMargin válido/vacío; rango0..<100, seis decimales/punto/coma, display2 separado del Percentage exacto/dirty |
| 42–46 | Application permite editor solo currentCost>0 aun sin costChanged/precio0; conocido0 sin editor, nunca recomienda bajar, recomendación no bloquea comprar |

## Dependencias y separación

Única dependencia añadida: `@stock-app/application: workspace:*`, autorización explícita del ticket.
Runtime importa solamente canEditPurchaseMargin/getInitialPurchaseMargin/recommendPurchasePrice
y su tipo puro. DTOs se adaptan con Money/Percentage/transport existentes. Sin fórmula duplicada
de selección/recomendación/promedio. Vite verifica root import tree-shaken a purchase-price-analysis,
sin use cases/repositories/API/Mobile/DB/Ajv/compiler/eval. Application source intacta.
Lockfile cambia solo el importer Web; ninguna dependencia externa nueva.

## Formulario, selección y comando

`/purchases/new` sustituye placeholder. Product único por búsqueda/Enter/barcode exacto propio;
ceros iniciales, paginación existente y selección explícita. Product detail añade Registrar compra
con navigation state productId; entrada GET propio activo/404 seguro. Ninguna cámara/catálogo.
Default Product:none, quantity1, unitCost vacío; costo nunca tomado de promedio/precio habitual.
Quantity entera segura positiva y costo no negativo/seis decimales/punto/coma, vacío distinto de0.
Total preview usa Domain Money exacto y bloquea overflow; cero conocido válido.

Cada intención NUEVA refresca Product detail antes de capturar State: revision string intacta
sin Number/operation ref, stock/unitCost nullable/lastMovementId exactos. Metadata solo comprueba
activo/scope. Command PURCHASE_REGISTER con UUIDv7 op/Purchase/Movement, timestamp lógico único,
dependsOn[], notes:null y sin metadata precondition ni UPDATE/recommendation. CSRF request-local,
key=op y schema browser generado. Result valida todas las relaciones/identidades propias/evidencia.

REVISION_CONFLICT409 terminal limpia pending, refresca Product y conserva formulario/costo escrito;
solo confirmación nueva usa State fresco e IDs nuevos.404 mantiene formulario y marca Product
no disponible;422 seguro sin auto resend. No cache/stock optimista: solo accepted invalida Product
list/search/barcode/detail y Purchase detail; snapshots/result permanecen autoritativos en memoria.

## Incertidumbre, privacidad y lifecycle

Reutiliza ScopedCommandController y ProductsController existentes, sin framework paralelo.
Network/timeout/500/503/malformed después de posible send conservan body/IDs/evidencia/key exactos
en memoria. Retry renueva CSRF sin refrescar State; fallo CSRF de retry conserva uncertainty.
Storage único Purchase: stockapp.pending-purchase con allowlist exacta de operationId/inventoryId/
commandKind:PURCHASE_REGISTER. Sin Purchase/Product/Movement IDs, quantity/cost/State/analysis/
margin/payload/PII/tokens. Descriptor Product y sus regresiones permanecen independientes.

Reload espera auth/Me/Inventory propio y receipt antes de nueva confirmación. ACCEPTED deriva
PurchaseID desde ChangeSet público validado; no resultReferences, beforeState ni priceAnalysis
reconstruidos. Terminal limpia e informa rechazo;404 mantiene uncertainty/descarte consciente.
Session/account/Inventory abort/epoch/generation fencean respuestas y limpian datos privados.

Form/margin/result son memoria React/controller scoped, nunca storage comercial. Router subscription
descarta el editor al navegar realmente; un guard desmontado durante revalidación de la MISMA
sesión conserva formulario/confirmación. Cambio real de sesión/Inventory los limpia. Mientras un
Product price update está incierto se conservan margin/resultado y se bloquea nueva compra;
se puede navegar y volver a resolver el mismo Product command. Offline bloquea escrituras/retry
y lecturas explícitas; cached reads se identifican como posiblemente desactualizadas.

## Confirmación y cambio de precio separado

Accepted muestra Compra registrada y el Result completo: total, stock antes/después, promedio
histórico antes/actual, precio habitual y margen anterior/actual. Null No disponible, conocido0
visible; promedios del servidor, ninguna fórmula React ni sustitución. Editor solo según Application.
Initial previous/current/vacío sin default30. Texto/dirty separado de Percentage original:
4.000008/display4.00 conserva original; rewrite4.00 cambia semántica.99.999999/display100.00
untouched sigue válido; rewrite100 inválido. Vacío sin error; inválido/overflow sin CTA de update.
Margin0..<100, coma/punto/.5/,5 y hasta seis decimales. Recommendation directa de Application.
Suficiente nunca ofrece bajar/guardar mismo precio; Mantener hace cero writes y cierra decisión local.

Actualizar crea solamente PRODUCT_UPDATE usando el snapshot result.product, metadataRevision
original, todos los campos metadata conservados y precio sugerido Money exacto, sin pre-refresh/rebase.
Single-flight Product/pending/CSRF/retry/receipt existentes; un Product pendiente impide otro update.
Unknown declara explícitamente que la compra está registrada y ofrece retry/check SOLO Product.
Terminal404/422 informa compra registrada/error de precio;409 sin auto rebase ofrece Ver producto.
Success invalida Product y confirma precio actualizado; Purchase y su priceAnalysis histórico intactos.

## Detalle

`/purchases/:id` valida PurchaseDetail/route UUID/scope; CONFIRMED/VOIDED, cantidad/costo/total,
stock transition y costos promedio históricos/notes. Timezone Inventory explícito. ProductRead
opcional solo nombre/variante actuales:404/archived no elimina historia ni reconstruye nombre histórico.
Sin analysis/editor/suggestion reconstruidos, anular/Undo ni contrato API nuevo.

## Validación y correcciones

Test-first:23 fallos RED de casos críticos sobre stubs; después formulario/margen37 PASS.
Focused Purchase/browser: 134 PASS; Web completa: 478 PASS, sin fallos ni skips.
Cobertura de108 puntos agrupada en formulario/preconditions/command/uncertainty/conflict/success/
margin/recommendation/price UPDATE/detail y regresiones Product/Sale. Validators CSP y bundle puro.
Tests node:test/fake fetch/Query real/ReactDOM; smoke navegador con fixture local, sin producción.
El smoke demuestra selección/preselect/costo vacío, compra confirmada, margen suficiente sin CTA
para bajar precio, cambio de precio incierto y retry con el mismo body/key. Log de comandos:
un Purchase POST y dos Product PATCH idénticos; no segunda compra. Navegar y volver conserva el
editor mientras Product está incierto; el detalle usa historia sin reconstruirlo. La renovación
periódica de la misma sesión conserva quantity/costo escritos; auth GET count avanzó de 9 a 10.
El reset observado durante regeneración/HMR de desarrollo se comprobó de nuevo con código estable.
No certifica hosting/provider ni QA físico completo.

Corrección de implementación detectada por navegador: cleanup de ruta confundía auth refresh
temporal con navegación. Router lifecycle y draft scoped conservan misma sesión y limpian navegación/
boundary conforme al ticket; test explícito. No cambios al auth polling existente ni a API/Domain.
La autorización humana de continuación clasifica esta restauración del lifecycle aprobado como
AUTO-FIX; no introduce una decisión nueva ni repite PURCHASE_REGISTER al resolver Product.

AUTO-FIX: tests esperaban placeholders anteriores, typing/narrowing de tests,
fixture Movement.effectiveAt requerido, snapshot JSON comparado por valores en vez de identidad,
fixture pricing elegía un precio igual al sugerido tras rounding Domain; se usa baseline inferior
para el escenario de aumento. SOURCE OF TRUTH: rutas autorizadas WEB-06, contracts,
Domain rounding/recommendPurchasePrice y transporte JSON. FILES: Web tests/fixtures.
PRODUCTION BEHAVIOR CHANGED FOR THESE MECHANICAL FIXES: NO. No assertions financieras relajadas.
Registry validators, importer interno y las rutas reales son implementación del ticket,
separada de estas correcciones de pruebas y de la corrección de lifecycle descrita arriba.

QA INFRASTRUCTURE: la primera corrida PostgreSQL quedó incompleta durante el apagado de Windows.
Backend terminó con 0xC000026B (STATUS_DLL_INIT_FAILED_LOGOFF, Windows SDK ntstatus.h); EventLog
1074/7002/6006 y Kernel-Power109 coinciden con ECONNRESET del runner. Log incompleto preservado;
no se contabiliza como PASS. Se restaura el mismo PostgreSQL QA/puerto/config y se elimina únicamente
su DB disposable huérfana, con nombre stockapp_test_<32hex> y cero conexiones comprobados,
mediante DROP normal, sin FORCE/terminate_backend. Corrida completa nueva y secuencial; ningún
archivo de harness/config/pool/timeout/concurrency/CI cambiado para esta recuperación.

Gates locales verificados hasta este punto: Web lint/typecheck/test/build, OpenAPI check y pnpm check
(1.955 tests: Domain 428, Application 432, Mobile 551, Contracts 38, API 28, Web 478), API build separado.
Historial PostgreSQL: una corrida tuvo un timeout real en schema.test.ts:509,
subtest "ledger prevents product deletion and failed multiwrite transaction rolls back".
DELETE debía rechazar con 23503; recibió "Connection terminated due to connection timeout".
Tras la autorización de investigación se revisaron fixture, release/finally, coordinator y driver.
El mensaje pertenece a newClient/connect: establecimiento de conexión nueva antes de DELETE,
no espera por pool lleno, ejecución SQL, BEGIN, ROLLBACK ni teardown. Coordinator protege CREATE,
DROP y la primera conexión; las reconexiones ordinarias están fuera. pg-pool descarta el cliente
tras errores SQL. No se amplía la serialización: no hay una carrera de provisioning demostrada.
El TAP histórico no tiene timestamp de cada query; checkpoints >2s no prueban causalidad.

QA reiniciado con mismo puerto/config/datos, ready y cero otros clientes/transacciones; trazas
temporales externas al repo delegan al driver intacto y no registran SQL/PII/tokens. Ejecución aislada
del owning fixture completo (49 PASS, incluye historia requerida por el subtest), grupo PostgreSQL
(55 PASS) y una corrida completa posterior: 1.004 PASS / 0 fail / 0 skipped / 0 cancelled / 0 connection
timeouts. Duración completa 558,996s. Conexión antes de DELETE: pool vacío/sin espera, 51,46ms
en aislamiento y 52,86ms en suite completa; 23503 y rollback originales PASS. Rechazos deliberados
ECONNREFUSED al puerto1 son escenarios de pool inaccesible, distintos de timeout.
No root-cause fix de PostgreSQL reclamado: se conserva incertidumbre de un fallo intermitente.
Ningún archivo de harness/fixture PostgreSQL ni configuración/pool/timeout/concurrency/CI cambiado.
Tests previos reutilizados porque sus fuentes no cambiaron. db:generate sin schema/migration drift;
auth:generate sin diff; auth:check PASS. Review y diff --check PASS.

Chunk Vite principal 1.113,46 kB / gzip 184,97 kB: warning existente, sin ocultar ni optimizar
fuera de scope. Chunk lazy purchases 12,16 kB / gzip 3,85 kB.
CI/GitGuardian del head final son requisitos antes de merge normal; main clean 0/0 y STOP.

## Archivos y frontera

Web purchases/*, routes/purchases/purchase-confirmation, app/router/composición, Product detail CTA;
tests input/commands/client/fixtures/app/browser; compiler browser build-only, importer Web/lockfile
y siete docs. API runtime/Domain/Application source/Mobile/schema/migrations/contracts públicos/CI
intactos. Sin WEB07/Home/History/VoidPurchase/Undo/Sync/MIG/offline queue/deployment.
