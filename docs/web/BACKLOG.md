# Backlog de implementación Cloud/Web

DEV-UAT-01 WEB/API/DB ONLINE / PARTIAL (2026-10-16 local): [Railway/Resend/Pages activados](DEV-UAT-01.md).
API y Postgres online; migración/readiness/CORS/auth boundary y envío Resend al simulador PASS.
Pages main386f6fd success, dominios Web/API HTTPS válidos, SPA/assets/headers/CORS PASS;
autodeploy production/preview deshabilitado. Signup/verify/login humano, bootstrap UI y CLI
piloto PASS; Inicio vacío observado. Web independiente de Mobile; monetización pendiente.
Pendientes: smoke financiero/browser completo, relogin/restart/aislamiento y recuperación
humana Bitwarden de secretos UAT nuevos. No acredita aceptación de datos reales ni PROD.

DEV-UAT-01 CHECKPOINT 1 / PARTIAL (2026-10-15 local): [sandbox mínimo sintético](DEV-UAT-01.md)
en preparación. Excepción aprobada: backup/DR/retención avanzada no bloquean solo este sandbox;
controles básicos/auth/piloto se conservan. Resend HTTPS Free autorizado para preparación,
adaptador sin dependencias y headers Web locales; costo/secrets/checkpoint2 pendientes. DEV-02E conserva evidencia parcial,
sin auditoría completa ni cambios de proveedor. PR/merge manuales; no PROD ni datos reales.

DEV-02D KEY CUSTODY VERIFIED — RETENTION ACTIVATION PENDING (2026-10-14 local): [custodia/retención](DEV-02D.md).
Identity permanente generada una vez por humano; primaria/recovery Bitwarden, ambos decrypts,
recipient y cleanup PASS. Descriptors/HMAC original/retención efectiva siguen pendientes.
Retención/lifecycle solo propuestos; Railway56 staged intactos. PR se creará manualmente por humano;
sin activación/backup real/scheduler/PROD/DEV-03. Estados inferiores conservan evidencia histórica.

DEV-02C REMOTE R2 SMOKE PASS (2026-10-14): [transporte remoto sintético](DEV-02C.md) probado
una vez con writer/reader separados, integridad y decrypt exactos, borrado solo de su objeto.
DEV-02B/PR107 merged. Railway sigue solo staged; custodia age permanente, retención,
recovery UAT y activación pendientes. Sin scheduler/PROD/DEV-03; STOP tras entrega documental.

DEV-02B CODE READY (2026-10-13): tooling operador R2/age y pruebas sintéticas de integridad y
restore/supresión; [alcance y evidencia](DEV-02B.md). Bucket ENAM confirmado humanamente,
sin validación remota ni custodia permanente completada. Activación de backup/Railway bloqueada;
no live scheduler, DEV-03/PROD ni continuación automática. Estados inferiores conservan historia.

DEV-02 PREPARED / STAGED (2026-10-13): reanudación autorizada con Docker PostgreSQL18.6,
test:db completo1040 PASS/0fail/skip/timeout. PostgreSQL/volumen UAT solo staged, ensayos locales
de migración/restore/supresión y plan de backup independiente. Capacidad default Hobby5GB autorizada
solo staged; destino/cifrado/custodia y activación requieren revisión. DEV-01 no está operacionalmente
DONE; DEV-03+ no autorizados. [Inventario, runbook y límites actuales](DEV-02.md).
DEV-01/PR105 integrado; plan Hobby$5 y región API us-west2 confirmados. Notas pendientes inferiores
son snapshots anteriores, no autorización de activar ni conectar fuente live.

DEV-01 IN PROGRESS: runtime/readiness y gates locales PASS; API Railway staged; CI/GitGuardian y plan/región/
activación pendientes. Sin DB/deployment público ni UAT acceptance; DEV-02+ no iniciados.
[Reporte y límites](DEV-01.md). Las referencias PLANNED inferiores describen el snapshot DEV-00.

CI-OPT-01: CI selectivo conservador/dependency-aware, Quality checks estable y full regression
programada/manual/exact-SHA. Cambia únicamente infraestructura de calidad y documentación;
[implementación, gates y evidencia](CI-OPT-01.md). No implementa DEV-01..06 ni provisioning/CD.

DEV-00 IMPLEMENTED — decisión documental UAT-first: DEV local/CI→UAT primer online→aprobación
humana→PROD NUEVO independiente. Sin provisioning/DNS/deploy. DEV-01..06 siguen PLANNED;
cada ejecución requiere autorización, STOP tras DEV-00. [Política y pendientes](DEV-00.md).
Track actual Web-only: SYNC-01..06 y MIG-01..03 DIFERIDOS, no eliminados/completados; Mobile,
EAS/stores/billing fuera de este release. La prioridad histórica inferior no autoriza continuarlos.

WEB-10 implementa Settings/Privacy, downloads BackupV1/AccountExport y deletion con reauth oficial, cuenta sin Inventory/disabled y recovery DELETING. API/contratos/runtime financiero intactos; PRIV/REL y UAT-first DevOps siguen pendientes. [Detalle y gates](WEB-10.md). STOP tras WEB-10.

WEB-09 implementa anulación desde detalles con eligibility servidor, State fresco, confirmación y recovery. Excepción humana: GET State scoped para active/archived reutiliza InventoryState; no modifica Product GET ni reglas financieras. [Detalle y gates](WEB-09.md). WEB-10 pendiente; STOP tras WEB-09.

WEB-08 implementa Home/History/stock bajo con métricas nullable, timezone y refresh scoped en accepted/receipt. WEB-09 permanece pendiente; STOP tras entrega. [Detalle y gates](WEB-08.md).

WEB-07 implementa conteo físico/Adjustment con revisión fresca, costo aceptado y recuperación mínima. WEB-08 permanece pendiente. [Detalle y gates](WEB-07.md).

WEB-06 implementa registro/detalle Purchase, margen editable exacto y Product price update separado.
Application pricing policy reutilizada, sin default arbitrario ni repetición de compra tras fallo de precio.
Gates/entrega de WEB-06 en [WEB-06](WEB-06.md); su STOP histórico precede a la autorización de WEB-07.

WEB-05 implementa carrito/registro/detalle Sale con precios exactos, costos frescos, warning negativo,
pending mínimo y recuperación sin stock optimista. Gates y entrega en [WEB-05](WEB-05.md).
WEB-06 y demás features siguen pendientes; STOP tras este ticket.

WEB-04 implementa Product detail/edit/archive/rentabilidad, dirty semántico exacto, conflicto explícito y recuperación CREATE/UPDATE/ARCHIVE con descriptor mínimo. Sin cambios API/Domain/DB/dependencias. Gates y entrega del head final en [WEB-04](WEB-04.md).

WEB-03 implementa lista/búsqueda/alta/barcode teclado y recuperación de incertidumbre; detalle/edit/archive siguen WEB-04. Gates y entrega remota del head final en [WEB-03](WEB-03.md).

WEB-02 IMPLEMENTED: auth oficial, aislamiento de sesión/query, shell y onboarding vacío; gates locales PASS. CI/GitGuardian/merge se verifican en PR del head final. [Detalle](WEB-02.md). No autoriza WEB-03+ ni deploy.

WEB-01 IMPLEMENTED sobre main API-10: apps/web foundation, cliente contracts/fetch y gates locales PASS. Entrega CI/GitGuardian/merge se verifica en PR; sin features/Auth/CD. [Detalle](WEB-01.md).

API-10 materializa borrado durable con worker PostgreSQL y tooling privado de supresión. DEV-02 debe almacenar/cifrar el registro separado del snapshot, aplicarlo antes de promoción y calcular last-backup+7d; DEV-05 conserva scheduling/alertas de infraestructura. Sin deploy ni continuación automática. [Detalle](API-10.md).

API-09 implementa dos export GET con BackupV1 canónico completo, snapshot RR/read-only,
recencia inclusiva/session.createdAt y SESSION_NOT_FRESH403. DELETING403; account export ACTIVE
permite piloto deshabilitado. Sin cap de export heredado de import. Validación local PASS;
PR/CI/GitGuardian/merge se verifican por separado. Riesgo de memoria V1 pendiente de hardening
medido futuro, sin ticket automático.
Scope histórico API-09: sin API-10/import/delete/Web/Sync/Mobile/deploy. La autorización posterior de API-10 está registrada arriba. [Detalle](API-09.md).

## Prioridad de ejecución humana — 2026-10-06 (historial)

Completar API F1 (API-04..10), después Web F3 (WEB-01..10); DevOps/API+Web/QA donde corresponda. SYNC/Mobile/MIG móvil se difieren intencionalmente hasta completar API + Web. Esta prioridad no elimina ni altera dependencias arquitectónicas: Sync no está cancelado y cada aceptación conserva sus gates. Batch humano vigente: API-07→API-08→API-09, cada uno con gates/PR/merge independientes; avanzar solo DONE/MERGED/main limpio0/0/BLOCKERS=NONE, Correcciones mecánicas/test-only con evidencia autorizadas; STOP ante decisiones humanas reales y STOP final API-09. No autoriza API-10/Web/Sync/Mobile/deploy.

48 tickets (incluido DEV-00): CLOUD-01..06 y API-01..10 **IMPLEMENTED** ([HTTP](CLOUD-01.md), [DB](CLOUD-02.md), [Auth](CLOUD-03.md), [Ownership](CLOUD-04.md), [Security](CLOUD-05.md), [Contracts y UUID](CLOUD-06.md), [Command engine](API-01.md), [Product commands](API-02.md), [Sales](API-03.md), [Purchases](API-04.md), [Adjustments](API-05.md), [VoidSale](API-06.md), [VoidPurchase](API-07.md), [Read models](API-08.md), [Backup/export](API-09.md), [Account deletion](API-10.md)); WEB-01..10 y DEV-00 **IMPLEMENTED** ([foundation](WEB-01.md), [auth/shell](WEB-02.md), [UAT-first](DEV-00.md)); 21 **PLANNED / NO IMPLEMENTADOS**, incluyendo Sync/MIG diferidos.
Baseline revisada/aprobada y mergeada en PR #75. Cada ticket hereda [DoD](TESTING.md)
y workflow autorizado de CI_CD.
Las dependencias son AND salvo indicación. Sin ticket monolítico 'implementar toda la web'.

## F0 — Foundation y contracts

| ID | Ticket / alcance | Dependencias | Aceptación específica |
| --- | --- | --- | --- |
| CLOUD-01 | IMPLEMENTED — API foundation Fastify/strict/build + contracts base | Baseline revisada | App mínima compilable, /live, codecs/envelope/error y tests HTTP; sin features |
| CLOUD-02 | IMPLEMENTED — PostgreSQL/Drizzle schema y migraciones iniciales | CLOUD-01 | Modelo DATA_MODEL, constraints/indexes, migrate desde vacío/upgrade fixture; DB local QA real |
| CLOUD-03 | IMPLEMENTED — Better Auth email/password/sesiones/SMTP | CLOUD-02 | Verify/reset/revoke, cookie/Expo contract server, secrets locales ficticios; PostgreSQL/SMTP/HTTP tests |
| CLOUD-04 | IMPLEMENTED — Ownership Business/Inventory y habilitación piloto | CLOUD-03 | Owner FK NO ACTION, contexto scoped, bootstrap vacío atómico, piloto CLI, signup no upload, A/B isolation |
| CLOUD-05 | IMPLEMENTED — Seguridad transport/secrets/CSRF/rate limits | CLOUD-04 | Allowlist/size/redaction, CSRF/Origin, brute force durable; SECURITY tests |
| CLOUD-06 | IMPLEMENTED — Contracts V1, compatibilidad UUID legacy y Application IDs/tiempo | CLOUD-02, CLOUD-04 | OpenAPI/schema/DTO, nuevos IDs v7/referencias UUID, tiempos offline, regresión, ninguna fórmula duplicada |

API-06 y API-07 completaron gate/merge (PR #87/#88), main limpio0/0. API-08 implementa las lecturas; sus gates/PR/CI/GitGuardian/merge se verifican antes de API-09. Ese batch histórico terminó en API-09; API-10 fue autorizado posteriormente y se implementa en este ticket. SYNC-01+ y WEB-01+ permanecen **PLANNED** fuera del alcance actual.

CLOUD-06 y CLOUD-06-FIX fueron solicitados explícitamente y tienen implementación/validación documentadas.
OpenAPI/DTO/envelopes V1, engine/GET receipt API-01 y runtime Product/Sale/Purchase API-02/03/04 existen.
WEB-01..10 existen como foundation/auth/Products/Sales/Purchases/Adjustments/Home/History/Void/Settings-Privacy; sync/import e infraestructura siguen planned y requieren ticket autorizado.

## F1 — Comandos y consultas server

| ID | Ticket / alcance | Dependencias | Aceptación específica |
| --- | --- | --- | --- |
| API-01 | IMPLEMENTED — Receipt/idempotencia/lock/revisión/ChangeSet transaccional + GET operation | CLOUD-05, CLOUD-06 | PostgreSQL real, retry/ACK perdido/hash mismatch, commit ordering sin gaps/rollback, A/B, OpenAPI |
| API-02 | IMPLEMENTED — Product create/edit/archive y stock inicial; [evidencia](API-02.md) | API-01 | Metadata version, barcode unique scoped, movement/state inicial atómicos |
| API-03 | IMPLEMENTED — RegisterSale multiproducto; [evidencia](API-03.md) | API-02 | All-or-nothing, costos históricos/null, negativo permitido, same cost delta concurrency |
| API-04 | IMPLEMENTED — RegisterPurchase un producto; [evidencia](API-04.md) | API-02 | Expected state, promedio exacto, snapshots y analysis; test-first críticos |
| API-05 | IMPLEMENTED — AdjustStock conteo físico; [evidencia](API-05.md) | API-02 | Motivo/costo válido, stateRevision, movimiento; no ajuste cero |
| API-06 | IMPLEMENTED — VoidSale server; [evidencia](API-06.md) | API-03 | Última inequívoca/todas líneas, estado exacto/distinta stale409/same-key replay; reversal unique/rollback |
| API-07 | IMPLEMENTED — VoidPurchase server; [evidencia](API-07.md) | API-04 | Última inequívoca, stock/costo snapshots, archived allowed, ninguna compra antigua replay |
| API-08 | IMPLEMENTED — Read models Home/products/detail/history/bajo; [evidencia](API-08.md) | API-03, API-04, API-05, API-06, API-07 | Scoping/keyset, métricas CONFIRMED y null completo; timezone consistente |
| API-09 | IMPLEMENTED — Backup/export de seguridad consistente | API-08 | JSON V1 exacto + perfil separado, descarga privada/snapshot, no CSV/Excel |
| API-10 | IMPLEMENTED — Borrado cuenta/dataset durable | CLOUD-05, API-01 | Revocar/bloquear, purge idempotente, no bypass auth deleteUser, supresión restore |

## F2 — Sync e importación

**DIFERIDO para el release Web-only DEV-00.** Tabla/dependencias históricas conservadas;
ningún ticket de esta sección está implementado ni autorizado por DEV-00.

| ID | Ticket / alcance | Dependencias | Aceptación específica |
| --- | --- | --- | --- |
| SYNC-01 | Device registration y sync metadata migrations Mobile | API-01, CLOUD-06 | Upgrades SQLite datos actuales intactos, identity scoped, versions/capabilities |
| SYNC-02 | Push/pull/snapshot endpoints server | API-08, SYNC-01 | Lotes por comando, changes completos/highWaterMark, 410/reset, tombstone semantics |
| SYNC-03 | Outbox atómica y sender Mobile | SYNC-01, SYNC-02 | Local operation+outbox tx, ID estable, leases/retry/401, reinicio offline |
| SYNC-04 | Réplica canónica/propuestas y aplicación delta Mobile | SYNC-03 | Página+cursor tx, own ACK dedup, pending conservado al pull/reset |
| SYNC-05 | Conflictos y revisión de dependientes | SYNC-04 | Product/stale buy/count/cost mismatch, evidencia intacta; reissue solo explícito |
| SYNC-06 | Sesión/estado sync/settings Mobile | CLOUD-03, SYNC-05 | SecureStore, expired offline conserva trabajo, account switch/detach isolation |
| MIG-01 | ImportSession/chunks/validate/activate server | SYNC-02, API-09 | Dataset vacío/hash/IDs/VOIDED/REVERSAL, rollback atomic, staging expiry |
| MIG-02 | Onboarding Mobile consent/first-sync | MIG-01, SYNC-06 | Backup/punto corte/pending, resume tras ACK perdido, no auto-upload |
| MIG-03 | Import/backup download Web | MIG-01, WEB-02 | Preview/consent/progress, cloud no vacío no merge, private download |

No integrar SYNC-06/MIG-02 si faltan pruebas de proyección/conflictos; outbox simple sola no cumple diseño.

## F3 — Web

| ID | Ticket / alcance | Dependencias | Aceptación específica |
| --- | --- | --- | --- |
| WEB-01 | IMPLEMENTED — React/Vite/Router/Query foundation | CLOUD-06 | Build SPA workspace, routes/loading, contracts client sin endpoints inventados |
| WEB-02 | IMPLEMENTED — Auth/app shell/onboarding vacío; [evidencia](WEB-02.md) | WEB-01, CLOUD-03, CLOUD-04, CLOUD-05 | Verify/login/reset/session, query isolation/logout, acceso cloud habilitado |
| WEB-03 | IMPLEMENTED — Lista/búsqueda/alta/barcode teclado; [evidencia](WEB-03.md) | WEB-02, API-02 | Fields actuales exactos, lector/string/unknown, inicial stock/costo; gates locales PASS |
| WEB-04 | IMPLEMENTED — Product detalle/edit/archive/rentabilidad; [evidencia](WEB-04.md) | WEB-03, API-08 | Metadata conflict visible, valores no editados exactos, history preserved |
| WEB-05 | IMPLEMENTED — Carrito/registro/detalle Sale; [evidencia](WEB-05.md) | WEB-04, API-03 | Multi líneas, warning negativo, uncertainty key/reload, no optimistic stock |
| WEB-06 | IMPLEMENTED — Compra/detalle/margen editable/precio sugerido; [evidencia](WEB-06.md) | WEB-04, API-04 | Un producto, costo correcto; fallo precio no repite compra; sin default arbitrario |
| WEB-07 | IMPLEMENTED — Conteo físico/Adjustment; [evidencia](WEB-07.md) | WEB-04, API-05 | Motivo/costo/diferencia, stale state explicación, no Undo ajuste |
| WEB-08 | IMPLEMENTED — Home/History/stock bajo; [evidencia](WEB-08.md) | WEB-05, WEB-06, WEB-07, API-08 | Métricas, null, cronología/recientes sin REVERSAL, query refresh |
| WEB-09 | IMPLEMENTED — VoidSale/VoidPurchase desde detalles; [evidencia](WEB-09.md) | WEB-05, WEB-06, API-06, API-07 | Eligibility/confirmación; State active/archived aprobado, conflicto bloquea todo; no Undo temporal |
| WEB-10 | IMPLEMENTED — Settings/privacy/export/delete; [evidencia](WEB-10.md) | WEB-02, API-09, API-10 | Moneda/timezone read-only, account access independiente, recent auth y deletion202/unknown |

Después de CLOUD-06, WEB-01 puede avanzar paralelo a backend/sync usando contratos congelados
y fixtures tipados. Cada feature requiere su endpoint real y gates antes de aceptación.

## F4 — DevOps

Secuencia futura, no autorización automática: DEV-00→DEV-01→DEV-02/DEV-03→DEV-04→DEV-05→DEV-06.
La topología antes production/staging se destina primero a UAT; PROD se provisiona después en
recursos nuevos/independientes con sign-off humano. Nombres staging son históricos/propuestos.

| ID | Ticket / alcance | Dependencias | Aceptación específica |
| --- | --- | --- | --- |
| DEV-00 | IMPLEMENTED — Arquitectura UAT-first/CI-CD documental | WEB-10 | DEV→UAT→sign-off→PROD; ADRs/hosts/gates alineados, sin provisioning/runtime/CI changes |
| DEV-01 | IN PROGRESS — runtime/readiness y gates locales PASS; Railway staged | DEV-00, CLOUD-01, CLOUD-05 | CI/GitGuardian, plan/región/activación y build del proveedor pendientes; no DONE |
| DEV-02 | Railway PostgreSQL/migrations/backups/recovery | DEV-01, CLOUD-02, API-10 | Private DB, locked migrate, backups+copia independiente cifrada; restore/supresión probado |
| DEV-03 | Pages proyecto UAT Web/preview/build | DEV-00, WEB-01 | Output correcto/deep links/headers; preview ficticio, sin PROD secrets |
| DEV-04 | Hosts/DNS/TLS/CORS/env y gate CD UAT | DEV-02, DEV-03, CLOUD-03 | Aprobar mapping hosts antes de DNS; same-site auth, required CI/GitGuardian exact-SHA gate o manual, no wildcard previews |
| DEV-05 | Observabilidad/alertas/runtime jobs | DEV-02, API-01, API-10 | requestId/redaction, monitor externo, backup/deletion alerts probadas |
| DEV-06 | CI required/SMTP/CD rehearsal UAT | DEV-04, DEV-05, CLOUD-06 | GitHub CI only, exact-commit gate probado, SMTP/health/smoke/rollback/monitoring; PROD solo con sign-off posterior |

## F5 — QA, privacidad y release

| ID | Ticket / alcance | Dependencias | Aceptación específica |
| --- | --- | --- | --- |
| QA-01 | API Postgres integration/security regression | API-09, API-10, CLOUD-05 | Transacciones/tenant/constraints/concurrency/receipts y migraciones reales |
| QA-02 | Sync fault/concurrency/migration suite | MIG-02, MIG-03, QA-01 | Dos dispositivos, lost ACK/crash/reset/conflicts/local-only control; física documentada |
| QA-03 | Web E2E/browser/accessibility | WEB-08, WEB-09, WEB-10, MIG-03, DEV-06 | MUST HAVE, Safari/Firefox/Chrome, teclado/móvil, offline error y precision |
| QA-04 | Seguridad/performance/recovery release review | QA-01, QA-02, QA-03, DEV-06 | Threat model pruebas, perf dataset y restore completo, sin claims ficticios |
| REL-01 | Privacy/Terms/cloud handling/deletion/store declarations | API-10, DEV-02, DEV-06 | PRIV-01..06 resueltos en repos correctos/revisión humana; no política antigua cloud |
| REL-02 | Release readiness piloto controlado | QA-04, REL-01 | Consent, support/runbooks, habilitación cuentas explícita, documentación resultados; publicación humana |

## Camino crítico

Track vigente Web-only: DEV-00→DEV-01..06→aceptación UAT/QA/PRIV/REL→sign-off humano→PROD.
No omite blockers/dependencias: delimitar aceptación QA-03/QA-04/REL Web-only con el responsable
antes de release (tabla histórica exige MIG-03/QA-02 diferidos); no declararlos cumplidos ni
activar Sync/MIG automáticamente. Camino inferior corresponde a baseline integrada histórica.

Baseline revisión → CLOUD-01 → CLOUD-02 → CLOUD-03/04 → CLOUD-05/06 → API-01 →
API-02..08 → SYNC-01/02 → SYNC-03/04/05/06 → MIG-01/02 → QA-02 → QA-04 → REL-02.
Ramas Web, DevOps y Privacy también deben llegar a REL-02 según tabla; paralelo no omite dependencias.
API-09/10 alimentan lifecycle/migración/recovery; contratos antes de pantallas.

La monetización/billing comercial será un ticket formal posterior a esta baseline: no bloquea
foundation ni piloto ficticio, sí el lanzamiento Pro comercial. REL-02 no autoriza Team, cobros
o distribución stores automática. Cada ticket se entrega y revisa por separado.
