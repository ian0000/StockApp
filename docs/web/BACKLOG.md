# Backlog de implementación Cloud/Web

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

47 tickets: CLOUD-01..06 y API-01..10 **IMPLEMENTED** ([HTTP](CLOUD-01.md), [DB](CLOUD-02.md), [Auth](CLOUD-03.md), [Ownership](CLOUD-04.md), [Security](CLOUD-05.md), [Contracts y UUID](CLOUD-06.md), [Command engine](API-01.md), [Product commands](API-02.md), [Sales](API-03.md), [Purchases](API-04.md), [Adjustments](API-05.md), [VoidSale](API-06.md), [VoidPurchase](API-07.md), [Read models](API-08.md), [Backup/export](API-09.md), [Account deletion](API-10.md)); WEB-01 **IMPLEMENTED** ([foundation](WEB-01.md)); 30 **PLANNED / NO IMPLEMENTADOS**.
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
WEB-01 existe como foundation; sus features WEB-02+, sync/import e infraestructura siguen planned y requieren ticket autorizado.

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
| WEB-02 | Auth/app shell/onboarding vacío | WEB-01, CLOUD-03, CLOUD-04, CLOUD-05 | Verify/login/reset/session, query isolation/logout, acceso cloud habilitado |
| WEB-03 | Lista/búsqueda/alta/barcode teclado | WEB-02, API-02 | Fields actuales exactos, lector/string/unknown, inicial stock/costo |
| WEB-04 | Product detalle/edit/archive/rentabilidad | WEB-03, API-08 | Metadata conflict visible, valores no editados exactos, history preserved |
| WEB-05 | Carrito/registro/detalle Sale | WEB-04, API-03 | Multi líneas, warning negativo, uncertainty key/reload, no optimistic stock |
| WEB-06 | Compra/detalle/margen editable/precio sugerido | WEB-04, API-04 | Un producto, costo correcto; fallo precio no repite compra; sin default arbitrario |
| WEB-07 | Conteo físico/Adjustment | WEB-04, API-05 | Motivo/costo/diferencia, stale state explicación, no Undo ajuste |
| WEB-08 | Home/History/stock bajo | WEB-05, WEB-06, WEB-07, API-08 | Métricas, null, cronología/recientes sin REVERSAL, query refresh |
| WEB-09 | VoidSale/VoidPurchase desde detalles | WEB-05, WEB-06, API-06, API-07 | Eligibility/confirmación; conflicto bloquea todo; no Undo temporal |
| WEB-10 | Settings/privacy/export/delete | WEB-02, API-09, API-10 | Moneda visible, timezone, export/borrado recent auth y legal/support |

Después de CLOUD-06, WEB-01 puede avanzar paralelo a backend/sync usando contratos congelados
y fixtures tipados. Cada feature requiere su endpoint real y gates antes de aceptación.

## F4 — DevOps

| ID | Ticket / alcance | Dependencias | Aceptación específica |
| --- | --- | --- | --- |
| DEV-01 | Railway API topology/build/start/staging | CLOUD-01, CLOUD-05 | Root workspace/pnpm pin real, logs build/start, /health config, no copy de otro dominio |
| DEV-02 | Railway PostgreSQL/migrations/backups/recovery | DEV-01, CLOUD-02, API-10 | Private DB, locked migrate, backups+copia independiente cifrada; restore/supresión probado |
| DEV-03 | Pages proyecto Web/preview/build | WEB-01 | Output correcto/deep links/headers; preview ficticio, sin prod secrets |
| DEV-04 | Hosts/DNS/TLS/CORS/env y gate CD | DEV-02, DEV-03, CLOUD-03 | App/API/staging, same-site auth, CI commit gate, no wildcard previews |
| DEV-05 | Observabilidad/alertas/runtime jobs | DEV-02, API-01, API-10 | requestId/redaction, monitor externo, backup/deletion alerts probadas |
| DEV-06 | CI required/SMTP/release CD rehearsal | DEV-04, DEV-05, CLOUD-06 | GitHub CI only, deploy provider, SMTP validado, aislamiento entornos, rollback ensayo |

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

Baseline revisión → CLOUD-01 → CLOUD-02 → CLOUD-03/04 → CLOUD-05/06 → API-01 →
API-02..08 → SYNC-01/02 → SYNC-03/04/05/06 → MIG-01/02 → QA-02 → QA-04 → REL-02.
Ramas Web, DevOps y Privacy también deben llegar a REL-02 según tabla; paralelo no omite dependencias.
API-09/10 alimentan lifecycle/migración/recovery; contratos antes de pantallas.

La monetización/billing comercial será un ticket formal posterior a esta baseline: no bloquea
foundation ni piloto ficticio, sí el lanzamiento Pro comercial. REL-02 no autoriza Team, cobros
o distribución stores automática. Cada ticket se entrega y revisa por separado.
