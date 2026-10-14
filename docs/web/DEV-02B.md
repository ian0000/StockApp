# DEV-02B — Transporte R2 y cifrado age

Actualización 2026-10-14: DEV-02B integrado por PR107; [DEV-02C](DEV-02C.md) ejecutó
un único smoke real R2 PASS con ciphertext sintético e identity QA efímera y borró su objeto.
Custodia permanente, retención, recuperación Railway y activación siguen pendientes.
La evidencia inferior conserva el estado histórico de implementación/QA DEV-02B.

Base main después de DEV-02/PR106: `402988098caf97262ce321d3e3d5d9fe23320126`,
clean0/0. Rama `chore/dev-02b-r2-backup-encryption`. Implementación y QA sintético autorizados;
activación Railway, backups programados, PROD y DEV-03 no autorizados.
Estado de código: **CODE READY**, gates locales completos PASS. CI/GitGuardian y required
checks/reviews del head exacto se verifican en el PR antes del merge normal.

## Alcance e inventario

Preflight: AGENTS65.1/65.2, DEV00/01/02, CI-OPT-01, OPERATIONS, DEPLOYMENT, SECURITY,
PRIVACY_IMPACT, TESTING, CI_CD, BACKLOG, CURRENT_STATE, API09/10, fuentes PostgreSQL/deletion,
recovery.test.ts, postgres-tools.ts, manifests y scripts CI; documentación oficial age/rclone/R2.
No cambios de UI, runtime API, Domain/Application, Mobile, contratos, schema/migrations,
BackupV1/AccountExport ni formato/HMAC del registro API-10. Sin nuevas dependencias/lockfile.
Los cambios de package/config solo añaden comando operador y checks strict/lint de `ops`;
el build API sigue incluyendo exclusivamente `src`, sin empaquetar herramientas ni claves.

Bucket aprobado por el responsable: `stockapp-uat-backups`, privado, ENAM,
creado2026-10-13; writer Object Read & Write y reader Object Read only separados.
Estas propiedades provienen del ticket, **no de una inspección autenticada de Cloudflare**.
Endpoint/account ID y tokens se inyectan únicamente al ejecutar el smoke aprobado; no se
leen ni guardan aquí. No bucket nuevo, URL pública, dominio, browser CORS ni Workers Paid.

Railway read-only al inicio: StockApp UAT/uat, patch
`7eb661e7-067d-494a-917d-d1c816755b75`,56 STAGED/no destructivos; API/Postgres staged-create,
latestDeployment null, sin cron, networking público ni variables compartidas. Source API sigue
`5222ee82437dcff1c5e5a691c466ddf5eaebfe7e`. El merge de este ticket no cambia ese pin.

## Herramientas e integridad

`apps/api/ops` separa procesos sanitizados, espacios privados, herramientas portables,
cifrado, manifest, transporte, PostgreSQL, supresión y orquestación CLI. Los procesos reciben
una allowlist de entorno; PG/R2/HMAC secrets nunca aparecen en argv. Sin shell, rclone config
persistente, debug logs, AWS profiles ni env heredada que redirija destinos.
Errores externos se sustituyen por mensajes fijos; stdout binario se canaliza a archivos.

Versiones fijadas y verificadas: PostgreSQL18.6, age/age-keygen1.3.2, rclone1.75.2.
Preparación explícita descarga releases oficiales y verifica SHA-256 antes de extraer solo
miembros conocidos. No instalación global/PATH ni dependencia de aplicación. CI puede descargar
estos binarios públicos; **no contacta R2 ni recibe credenciales reales**.

| Distribución | SHA-256 del archivo oficial |
| --- | --- |
| age1.3.2 Windows x64 ZIP | f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7 |
| age1.3.2 Linux x64 tar.gz | cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10 |
| rclone1.75.2 Windows x64 ZIP | 8a9db2bad1dc79a65b3348fd857069598e2aab7cf4d118b77b1df23055aff818 |
| rclone1.75.2 Linux x64 ZIP | 349ac8fba6ff65d6247043f1750cdcb518ec5d500ef91463a10d37c0ccdf3702 |

[Releases age](https://github.com/FiloSottile/age/releases/tag/v1.3.2),
[releases rclone](https://github.com/rclone/rclone/releases/tag/v1.75.2).
Hashes contrastados con los digests publicados por GitHub; Windows descargado y ejecutado
localmente. Linux se prueba en CI; no atribuirle evidencia Windows.

Dump custom/no-acl de PostgreSQL18.6 mediante stdout streaming a temporal controlado; pg_dump
mantiene snapshot consistente. El ensayo comparte snapshot exportado con una transacción
REPEATABLE READ/read-only y confirma que un commit posterior queda excluido.
No dump completo operacional en Buffer. age X25519 cifra con recipient público; decrypt exige
identity privada. Archivos exclusivos wx0600, directorio propio0700 fuera del repo; en Windows
se elimina herencia ACL y se concede acceso al usuario actual. Administradores/OS son frontera
de confianza. Cleanup en éxito/fallo/señal cooperativa; SIGKILL/pérdida eléctrica no permite
prometer cleanup. Eliminar archivos no certifica borrado físico de bloques SSD.

Objeto: `uat/<postgres|deletion-suppressions|qa-smoke>/<UUIDv4>/<kind>.age`.
UUID aleatorio de backup, sin identidad comercial/PII; timestamp UTC en manifest.
Upload rechaza plaintext, usa copyto/immutable/error-on-no-transfer y condición de destino
`If-None-Match: *`; sin fallback que sobrescriba. Rclone fijado transmite la condición tanto
en PUT como en CompleteMultipartUpload; los dos caminos y una carrera HEAD/PUT se prueban
contra S3 simulado loopback. R2 real sigue requiriendo smoke.
[Fuente rclone fijada](https://github.com/rclone/rclone/blob/v1.75.2/backend/s3/s3.go),
[compatibilidad R2](https://developers.cloudflare.com/r2/api/s3/api/),
[publicación multipart condicional](https://developers.cloudflare.com/r2/platform/release-notes/#2023-08-11).

Writer solo upload/delete del propio smoke; reader solo download/verificación. rclone cat puede
listar el directorio del objeto para resolver el archivo: prefix limitado al UUID asignado,
probado en el servidor simulado; nunca listado global del bucket. Download usa archivo exclusivo,
compara tamaño y SHA-256 completo y luego verifica autenticidad de bytes con decrypt age.
ETag/multipart MD5 o exit0 de upload no sustituyen SHA-256 ni restore.
[Configuración R2/rclone](https://developers.cloudflare.com/r2/examples/rclone/),
[cifrado age](https://github.com/FiloSottile/age).

## Descriptor y confianza de recuperación

Manifest estricto: ID/environment/kind/UTC/source commit/versiones18.6/object key/tamaño/SHA-256
ciphertext/recipient/key version/HMAC custody version/restore status/retention reference.
No tokens, emails, ledger ni lista de identidades. `NOT_VERIFIED` permanece tras upload;
verificar bytes no convierte el backup en recovery aceptado. El paquete guarda manifest cifrado.

Age protege integridad del ciphertext, **no acredita la identidad del emisor**: cualquiera con
el recipient público puede cifrar contenido. Por ello el operador conserva por canal independiente
y bajo custodia el descriptor y SHA-256 del manifest cifrado. QA recovery requiere ese hash
confiable, origen/source commit y versiones de claves antes de aceptar manifest/payload.
Un hash obtenido junto al objeto desde R2 no es evidencia independiente. Sin descriptor confiable,
selección del último registro aplicable o clave histórica acreditada, recovery/activación se bloquean.
No firma casera, extensión del registro ni protocolo criptográfico nuevo.

## Comandos y runbook QA

Ejecutar desde checkout validado con build API presente y directorios privados fuera del repo:

```sh
pnpm --filter @stock-app/api backup:qa prepare-tools <nuevo-directorio-privado>
pnpm --filter @stock-app/api backup:qa qa-backup
pnpm --filter @stock-app/api backup:qa qa-suppressions
pnpm --filter @stock-app/api backup:qa qa-recover
```

Inyección privada para QA: BACKUP_TOOLS_DIRECTORY, TEST_POSTGRES_BIN o
BACKUP_QA_POSTGRES_CONTAINER dedicado18.6, BACKUP_QA_SOURCE_URL de suite disposable loopback,
TEST_DATABASE_URL administrativo local stockapp_test, BACKUP_QA_STORE_DIRECTORY privado,
BACKUP_SOURCE_COMMIT, BACKUP_AGE_RECIPIENT, BACKUP_AGE_KEY_VERSION,
BACKUP_SUPPRESSION_KEY_VERSION. Export/apply además BETTER_AUTH_SECRET y
DELETION_SUPPRESSION_SECRET. Sin secretos como argumentos ni `.env` comprometido.
`qa-backup`/`qa-suppressions` solo usan almacén local simulado; ningún upload DB a R2/Railway.
El resultado BYTE_VERIFIED_ONLY entrega object key y hash del manifest cifrado para custodia separada.

Recovery exige, para POSTGRES y SUPPRESSIONS por separado, `BACKUP_<kind>_MANIFEST_FILE/SHA256`,
`BACKUP_<kind>_SOURCE_COMMIT`, `BACKUP_<kind>_AGE_KEY_VERSION` y `BACKUP_<kind>_AGE_IDENTITY_FILE` privado.
Los dos artefactos pueden tener commits y recipients/versions/identities age diferentes:
backup antiguo y registro reciente no se fuerzan al mismo release ni rotación. Cada selección
debe coincidir con su descriptor confiable; no inferir esos valores del objeto remoto.
Además BACKUP_VERIFY_SUPPRESSION_SECRET obtenido
de la custodia original, sin default/alias al secret de apply. Elegir explícitamente el último
export COMPLETED aplicable; no usar el registro embebido en el snapshot antiguo.
Hashes/versions/origen se verifican antes de decrypt/restore/apply. El secret de apply debe
coincidir con la selección original confiable; esto es guard de configuración local, no autenticador
nuevo del registro. La selección humana correcta sigue siendo precondición, no se puede inferir
de una pareja de valores equivocados o de un nombre de key version.

1. Validar source QA/cliente18.6 y manifest confiable; recuperar/decrypt cada objeto por separado.
2. CREATE DB nueva con nombre generado. Una DB existente/source/remote/query options se rechaza;
   handle inmutable de ownership, server18.6 antes de restore. Nunca --clean/--create/DROP FORCE.
3. pg_restore single-transaction/exit-on-error/no-owner/no-acl a la DB propia, sin tráfico.
4. Reutilizar `node apps/api/dist/deletion/registry-cli.js export/apply`; formato API-10 intacto.
5. Antes de apply, derivar evidencia en memoria del restore con el HMAC original confiable:
   IDs suprimidos esperados y digests de auth/Business/Inventory/historia/receipts supervivientes.
6. Después de apply, verificar ausencia de suprimidos, conjunto exacto de supervivientes y digests
   intactos. Wrong key puede dar exit0; la verificación independiente debe fallar.
7. El ensayo comprueba también constraints, migraciones, dinero/null/cero/bigint exactos,
   VOIDED/archivados, receipts/replay sin ejecutar mutación, auth/ownership/readiness.
8. QA elimina solamente su DB nueva al finalizar. No existe comando de promoción/reapertura.
   Una futura promoción requiere aceptación humana separada y ensayo UAT real.

## Smoke remoto y custodia

Solo con autorización explícita del operador e inyección privada de endpoint/bucket y tokens:

```sh
pnpm --filter @stock-app/api backup:qa --remote-smoke
```

BACKUP_R2_ENDPOINT, BACKUP_R2_BUCKET, BACKUP_R2_WRITER_ACCESS_KEY/SECRET_KEY y
BACKUP_R2_READER_ACCESS_KEY/SECRET_KEY. Keys distintas; HTTPS/account endpoint exacto, sin query
ni URL con credentials. Rechazado en CI; nunca se dispara por pnpm check.
Genera identity QA efímera privada, carga un único ciphertext sintético en qa-smoke/UUID,
descarga con reader, compara ciphertext y plaintext y elimina solo su objeto tras éxito completo.
Fallo/resultado incierto conserva la posible asignación para revisión; nunca limpia otros objetos
ni elimina uno preexistente tras una colisión. **REMOTE SMOKE en DEV-02B: NOT RUN**;
posteriormente DEV-02C aportó opt-in e inyección privada y acreditó transporte remoto PASS.
La [evidencia separada](DEV-02C.md) no certifica custodia permanente ni recovery Railway.

Ceremonia humana UAT, aún pendiente: generar/aprobar identity permanente con age-keygen en
ubicación privada; guardar identity fuera de R2/Railway/Git/API/CI; conservar copia independiente;
ensayar decrypt con esa copia y registrar solo recipient público/fingerprint y versión.
Conceder identity solo al operador de recuperación; executor recibe recipient público.
Rotación: nueva identity/version aprobada, nuevo recipient para backups futuros; conservar
identities históricas mientras existan objetos retenidos que las necesiten y probar ambas copias.
Pérdida de todas las copias de una identity hace irrecuperables esos backups; R2 no puede descifrarlos.
La clave HMAC histórica API-10 tiene custodia separada y estable, no se rota por este ticket.
QA identity nunca se reutiliza para UAT. **BACKUP ACTIVATION BLOCKED** hasta completar custodia,
revisión de retención y autorización operativa/deploy; smoke real completado en DEV-02C.

## Retención y costos

Postgres: objetivo hasta30d. Supresiones: último backup realmente retenido que pueda contener la
identidad+7d; no constante37/38d ni pruning por edad inferida. Prefijos y policy references distintos.
Inventario/cutoff de retención bajo control privado del operador; metadata sensible cifrada.
No lifecycle blanket, Bucket Lock, pruning automático ni scheduler aplicados. Activación requiere
revisión humana y prueba de retención efectiva, incluyendo claves históricas.

R2 Standard publicado: USD0.015/GB-mes, ClassA4.50/millón, ClassB0.36/millón, egress Internet
gratuito; free tier Standard10GB-mes/1M ClassA/10M ClassB. Upload/multipart/listing/verificación
consumen operaciones; no estimar factura desde un simple POST. [Precios oficiales consultados
2026-10-13](https://developers.cloudflare.com/r2/pricing/). Sin acceso billing ni consumo real
verificado. Ningún smoke realizado/cambio de plan/Workers Paid; plan Railway$5 confirmado
humanamente sigue sin activar recursos por este ticket.

## Evidencia y límites

Operadores/crypto:38 PASS dentro de pnpm check; age real, cleanup/ACL, config/secret isolation,
writer/reader denied, missing/partial/interrupted objects, corruption/wrong identity/recipient/hash,
metadata/plaintext guards, conditional PUT/multipart race real con rclone contra loopback,
remote opt-in y borrado limitado a objetos publicados por esa instancia. Recovery focused:
8 PASS/0fail/skip con PostgreSQL18.6 Docker y secuencia CLI real,
snapshot consistente→encrypt→mock upload/download/hash→decrypt→restore aislado→supresión
independiente, wrong HMAC exit0 rechazado, pérdida de sesión superviviente rechazada y rollback.
Sin retries-until-green/skips ni cambios pool/timeouts/concurrency/CI resources. Test CI simulado
confirma que un binario PG explícito no se sustituye silenciosamente por Docker.
Gates finales locales: pnpm check2592 PASS (77 CI +2515 workspace), build API/Web PASS;
test:db1047 PASS/0fail/skip/cancelled/timeout failures,324037.9307ms TAP, incluyendo API01..10,
Auth/Ownership/Security/compiled HTTP y recovery cifrado. OpenAPI check PASS; db:generate sin
cambios/nothing to migrate; auth:generate sin diff/auth:check PASS; actionlint1.7.12/workflows,
docs/validators/diff check PASS. Warning Vite existente1883.48kB/284.92kB gzip conservado.
Revisión final:23 archivos, solo ops/tests/config de QA/docs; ninguna dependencia ni cambio
de runtime/Domain/Application/Mobile/Web/contracts/schema/migrations/workflows/lockfile.
Cleanup confirmado:0 suite DBs y0 directorios privados de backup restantes.
Railway consultado después: inventario y staged diff idénticos al preflight,56 cambios y mismo pin;
ninguna instancia/despliegue/API/DB activados. Remote integration/custodia/retención real siguen
sin verificar. CI/GitGuardian y merge se documentan en el PR y entrega del SHA revisado; no UAT acceptance.

| Fallos exigidos | Cobertura |
| --- | --- |
| 1–5 Credenciales ausentes/writer denied/reader denied/bucket errado/object ausente | Unit config/transport, sin red R2 |
| 6–12 Interrupción/parcial/corrupción/identity incorrecta o ausente/recipient errado/checksum | age real, transporte mock, archivos parciales eliminados |
| 13–17 PG ausente/incompatible/target inválido/source/existing target | Unit tool guards + CREATE/restore PostgreSQL real |
| 18–21 Registry inválido/HMAC errado/deleted reaparece/superviviente perdido | Decode API-10 + CLI/evidencia independiente + pérdida de sesión transaccional |
| 22–24 Restore interrumpido/secret output/smoke sin opt-in | Abort sin tablas, child output sanitizado, opt-in/CI guard |
| 25–28 Delete fuera de asignación/overwrite/meta incompleta/plaintext | Guard de asignación propia, wx/condicional PUT y multipart, manifest/header estricto |
| 29–30 Cleanup/no Railway deployment side effect | Private workspace success/failure/abort + imports estáticos + inventario provider read-only antes/después |

AUTO-FIX mecánicos durante implementación: version CLI age publica `v1.3.2` y rclone usa newline
de plataforma; normalización para comparar versiones exactas. Mock S3 distingue carrera HEAD
de lectura posterior e implementa ListObjectsV2 limitado al UUID, requerido realmente por cat.
Verifier usa operation_receipts.business_id según delivery.ts, en lugar de inventory_id inexistente.
Elección explícita de PG binary tiene precedencia sobre discovery CI; prueba dedicada del guard.
Revisión de recuperación separó el commit y identity/key version age de cada descriptor:
un backup antiguo y el registro reciente pueden pertenecer a releases/rotaciones diferentes.
Fuente: recuperación con registro independiente/latest del ticket y custodia histórica age;
prueba CLI real con dos identities/commits, sin fallback a los settings comunes de export.
Source of truth: binarios fijados, trace loopback y schema PostgreSQL vigente; solo tooling/QA nuevos,
PRODUCTION BEHAVIOR CHANGED: NO. No se cambia expectativa financiera ni API-10.

STOP después de code ready/merge; no DEV-03, Railway activation, live scheduler ni PROD.
