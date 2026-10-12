# WEB-10 — Settings, privacidad y lifecycle de cuenta

Base main dc45fd4e35119d14fffc5494eb3d32cd86c39e96, WEB-09/PR101 integrado, pull ff-only,
clean0/0. Rama feat/web-10-settings-privacy. Gates externos/merge se verifican al cerrar el PR.

## Preflight consolidado

Ticket completo33 secciones leído antes de editar. Revisados AGENTS65.1, BACKLOG/WEB_UX/AUTH/API/
API09/API10/WEB02/WEB08/WEB09/CONTRACTS_V1/SECURITY/TESTING/PRIVACY_IMPACT/OPERATIONS/PARITY_MATRIX/
CI_CD/CURRENT_STATE, UX35, lifecycle/ownership/backup/routes y runtime auth/API/backup/deletion/
SessionController/guards/shell/commands/reads/cache/tests. Fuente actual runtime y notas de cada
ticket materializado; los párrafos históricos planned conservan su contexto, no reabren decisiones.
HUMAN DECISIONS REQUIRED: NONE.

PrivateBoundary permitía solo BUSINESS_ACTIVE_ENABLED y reenviaba NO_BUSINESS a onboarding.
API09 permite portabilidad account-level ACTIVE disabled/sin Business/sin Inventory;
API10 permite me/csrf/deletion tras nuevo login durante DELETING, pero no export/comercio.
El boolean allowDeletingIdentity existente en GET me mantiene esa recuperación incluso durante
purga por fases. Si Business ya desapareció, Me no revela el job: el servidor sigue decidiendo
export/deletion; no se inventa estado de worker ni se abre un status endpoint.

Recent auth usa session.createdAt oficial<=300000ms inclusivo. Código Better Auth1.7.7 instalado
sign-in/email llama createSession y setSessionCookie; cliente React actual ya utiliza signIn.email.
[Documentación oficial](https://better-auth.com/docs/authentication/email-password) cotejada.
Get-session/polling/refresh no prueban recencia. Reutilizar login de SessionController retira cache/
intenciones privadas; comprobar mismo User después del sign-in, sin copiar tokens/timestamps.
No cambio de backend, política de recencia, TTL, cookies o auth schema necesario.

UX35 describe backup/restore local Mobile. WEB-10 autoriza explícitamente descargar backup cloud
API09; se aclara esa distinción sin agregar restore/import Web ni retirar capacidades Mobile.

## Routing y Settings

Settings/Privacy tienen AccountBoundary propio: Me verified de cualquiera de los cinco estados;
anonymous no obtiene datos privados. Me transitorio de la misma generación conserva presentación
y confirmación; otra sesión/User limpia. Acceso seguro desde onboarding y estados restringidos.
Inventario/comercio conserva PrivateBoundary sin bypass. Account shell solo enlaza app/Settings/
Privacy/logout; no concede acciones financieras ni habilita piloto.

Settings muestra email y metadata real si existe: Inventory name/currency/reportingTimeZone.
Valores read-only, sin editor/API de moneda/timezone/theme/billing/equipo/perfil/version inventada.
Offline marca metadata desactualizada; todas las solicitudes sensibles se bloquean sin conexión.
Links a secciones backup/export/deletion no ejecutan solicitudes al navegar/montar.

## Downloads

GET backup solo con Inventory enabled propio; GET account export fuera de DELETING para todos los
estados de cuenta permitidos. Servidor es autoridad final de ownership/recencia/lifecycle.
Clientes transport no-store/credentials include existentes; GET sin CSRF/body/key.
Validators standalone CSP desde BackupV1/AccountExport existentes, sin Ajv compiler browser.
Se valida DTO completo y asociación de identidad/Inventory antes de handoff.

Backup sigue formatVersion1 y ocho colecciones; AccountExport incluye user/backup nullable/
exportedAt. JSON pretty+newline, enteros escalados originales intactos: null/cero/6decimales,
legacy IDs, archivados/VOIDED/REVERSAL/historia sin conversiones financieras, omisiones o cap nuevo.
No CSV/Excel/import/restore/Sync/disaster-recovery fake. Archivo no cifrado, contiene datos privados.
Filename constante stockapp-backup.json o stockapp-account-export.json, sin PII/IDs/Business name.

Single-flight y AbortSignal/epoch/User/generation/Business/Inventory fencean respuestas tardías.
Sin raw export Query cache ni storage/logs. JsonDownloads crea Blob/URL temporal por acción,
anchor click explícito y cleanup después de handoff; failure/boundary/dispose revocan URLs vivas.
No se puede observar cancelación posterior del gestor browser: se informa Prepared/Comprueba
que se haya guardado correctamente, nunca que el usuario guardó el archivo.
Riesgo V1 de materialización API/browser en memoria sigue pendiente de hardening medido futuro;
no se impone cap/truncación ni se afirma memoria acotada.

## Recent auth y borrado

SESSION_NOT_FRESH403 tiene mensaje específico y acción /settings/reauthenticate. No se trata como
cloud disabled ni se llama refresh en loop. Password solo input/memoria transitoria, vacío antes
de sign-in y ante session generation boundary. Official sign-in crea sesión nueva; mismo User
comprobado. Identidad inesperada se retira/logout por lifecycle existente; no replay de export/
delete. Nueva acción requiere gesto y nueva confirmación, incluso durante DELETING.

Eliminar abre confirmación explícita irreversible, Cancelar cero POST, explica revocación/interrupción,
purga durable, copias descargadas fuera de control y supresión documentada al restaurar recovery.
Sin fecha de retención inventada, completion instantánea, progreso, polling de job ni Undo.
POST me/deletion body EXACTAMENTE{}; CSRF request-local antes de POST y Idempotency-Key UUIDv7.
No Inventory command, ChangeSet, revision client-side ni OperationReceipt.
202 validado/sessionsRevoked true: SessionController.expire limpia cache/intent privado y deja
aviso público mínimo DELETION_REQUESTED, sin identity/dataset ni claim COMPLETED.
Aviso survives anonymous periodic revalidation; una nueva cuenta hidratada empieza limpia.

POST network/5xx/JSON/DTO inválido/401 posterior conserva outcome UNKNOWN. 401 no prueba fallo
tras posible revocación. Misma sesión/tab permite retry consciente con MISMA key y{}; nunca
genera key nueva automática. Boundary borra key/scope y fencea late202; aviso público solo informa
incertidumbre. Sin retry anónimo ni payload de recovery persistido; login nuevo permite solicitud
consciente mientras User exista. Worker/permanencia requestedAt son responsabilidad API10.
4xx terminales distinguen no-access/verification/not-found/key-conflict/rate; mensajes sanitizados.
Un fallo CSRF antes de POST no inventa un write incierto. El rechazo explícito403
SESSION_NOT_FRESH del POST exige reauth y no inventa aceptación ni outcome incierto.

## Privacidad y legal

AccountController no usa localStorage/sessionStorage/IndexedDB/outbox. No export comercial,
password, token, email, State o idempotency key persistido. Solo key/scope en memoria durante
intención incierta; ninguna data exportada queda en view/cache tras handoff o boundary.
Pending descriptors de los comandos anteriores conservan su allowlist/lifecycle existentes.
No telemetry ni logging comercial nuevo. Query clear y abort impiden mezcla A/B.

URLs canónicas Privacy/Terms/Support ian-k.dev/stockapp/{privacy,terms,support}/.
Abrir solo por click, target_blank/noopener/noreferrer/no-referrer, sin duplicar contenido/consent.
Web tool no pudo acceder; HTTP directo comprobó200 en las tres URLs2026-10-12.
Texto público aún describe prácticas Mobile/local: NO se declara cobertura completa Cloud/Web.
PRIV01/02, PRIV04..06/REL, retención/proveedor/restore real DEV02 y QA03 siguen blockers de release.
No se modifica el repositorio separado ian-k.dev ni se implementa delete-account público REL01.

## Pruebas y QA

Focused96 PASS y Web996 PASS,0fail/skip/cancelled/todo. Types/lint/build Web PASS.
Client/controllers/Query real/SSR rutas cubren cinco estados, anonymous/unverified, snapshots/DTO,
filename/cleanup/cancel/failure,1501 Products sin truncar, single-flight/offline, recentauth/sameUser,
no auto-actions,202/cache/public notice,unknown+401/retry/switch/late responses/no storage/CSP.
Fail-closed ante auth ERROR/unverified: retira metadata/intent, fencea responses y evita quedarse
preparando. Dataset que desaparece en la misma sesión conserva aviso UNKNOWN sin key/auto-retry;
cuenta/sesión nueva retira ese aviso. Accepted público ya comprobado sobrevive a errores de red.
Regresiones auth/onboarding/Products/Sales/Purchases/Adjustment/Void/Home/History permanecen.

Browser fixture sintético local, no QA03/certificación production: Settings metadata EUR/EuropeMadrid;
descargas reales inspeccionadas, Backup histórico y AccountExport con user/backup y sin Business/null;
stale403→sign-in oficial→acción nueva explícita; Cancel0POST, accepted1POST y aviso sin datos privados;
polling de misma sesión conserva confirmation (authGET3→5); unknown tras lost202+CSRF401 conserva
incertidumbre sin segundo POST/receipt; nuevo sign-in DELETING permite Privacy sin export/comercio;
A export retenido→logout→B disabled→release no presenta identity/download A; narrow305px sin overflow,
focus/Tab/Enter de confirmación. Screenshots y eventos externos stockapp-web10-* en artifacts.
No passwords/payload de export en logs del fixture. Datos ficticios descargados preservados.
Fixture final separa Business/Inventory A/B: B export explícito devuelve userB/InventoryB después
de liberar A, sin descarga A tardía ni POST B. Eventos iniciales se preservan en phase1.json;
fixture final tiene trace separado. Tab cerrado, viewport restaurado y servidores propios detenidos.

QA PostgreSQL18.6 Debian/Linux loopback65434, contenedor propio stockapp-web10-postgres-qa;
sin cambios pool.max/connectionTimeoutMillis/concurrency/CI/PG. Timeout Windows intermitente sigue
sin root cause demostrada; no se atribuye una reparación al entorno QA compatible.
pnpm check2473 PASS (Domain428/Application432/Mobile551/Contracts38/API28/Web996), builds API/Web
y OpenAPI check PASS. PostgreSQL real1022 PASS,0fail/skip/cancelled/todo/timeout, log recuperado.
Primer intento ECONNREFUSED65434: engine estuvo ausente y contenedor quedó exited255. Se inició
el MISMO contenedor, preservando datos/configuración; version18.6 y SELECT1 host comprobados antes
de una única nueva suite. Log fallido preservado; causa raíz del cierre del engine no demostrada.
db:generate sin schema/migration drift; auth:generate sin diff; auth:check PASS.
Focused final96 PASS. Invocación errónea desde raíz usó tsconfig JSX incorrecto (React is not defined);
harness ejecutado desde apps/web PASS sin cambios productivos. CI/GitGuardian/merge se verifican en PR.
Warning Vite preservado: principal1883,57kB/gzip285,01kB; límites/optimizaciones no modificados.

## AUTO-FIX

CAUSE: fixture nuevo usaba DAMAGE, pero enum vigente es DAMAGED. SOURCE OF TRUTH: backup/entities
schemas canónicos y typecheck. FILES: test/account-fixtures.ts. PRODUCTION BEHAVIOR CHANGED:NO.
CAUSE: fixture de handoff dependía de navigator.onLine de Node. SOURCE OF TRUTH: harness online
injectado, la prueba debe alcanzar handoff. FILES: test/account-controller.test.ts.
PRODUCTION BEHAVIOR CHANGED:NO, assertion error/recovery intacta.
CAUSE: test WEB01/02 esperaba placeholder Settings. SOURCE OF TRUTH: WEB10 rutas reales.
FILES: test/app.test.tsx. PRODUCTION BEHAVIOR CHANGED:NO por fix de test; UI cambia dentro del ticket.
Sin relajar assertions financieras/security ni añadir skips. Browser HMR del generate durante build
se observó y se evitó continuar gates que regeneren módulos mientras se mide confirmation/polling;
no se cambió runtime/CI para acomodar QA.
CAUSE: fixture recent-auth simulaba rechazo antes del POST; el servidor comprueba recencia en POST.
SOURCE OF TRUTH: API10 deletion route/client CSRF. FILES: test/account-controller.test.ts.
PRODUCTION BEHAVIOR CHANGED:NO; sent callback y403 explícito, misma expectativa REAUTH_REQUIRED.

## Cierre y STOP

API runtime/public contracts/Domain/Application/PostgreSQL/SQLite/migrations/Mobile/deps/CI unchanged.
Solo Web, static validators de contracts existentes y factual docs. Preflight resolved sin extensión API.
Local gates completos→commit/push/PR→CI/GitGuardian/reviews PASS→merge normal→main clean0/0.
WEB10 DONE/MERGED y STOP. DEV→UAT→aprobación humana→PROD; no DEV01/provisioning/deployment/
Sync/MIG/Mobile/EAS/store automático.
