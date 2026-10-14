# DEV-02C — Smoke sintético remoto de Cloudflare R2

Continuación DEV-02D: [preparación de custodia permanente y retención](DEV-02D.md),
sin generación ni activación. Este smoke conserva su evidencia; no se repite automáticamente.

Estado: **REMOTE R2 SMOKE PASS**. Una única ejecución remota autorizada, sin cambios
de implementación. Base main después de DEV-02B/[PR107](https://github.com/ian0000/StockApp/pull/107):
`c3f0357e768bde0f2c4ac8e6ca50ab0a16bef606`, limpio y sincronizado 0 ahead / 0 behind.
Rama documental: `docs/dev-02c-r2-remote-smoke`. Quality checks, GitGuardian y reviews
del candidato documental se verifican independientemente antes del merge normal.

## Autorización y preflight

DEV-02C autoriza un solo smoke real sobre el bucket existente `stockapp-uat-backups`:
datos sintéticos, identity age efímera, writer y reader existentes separados,
upload exclusivo, descarga, verificación, descifrado y borrado solo del objeto propio.
Se revisaron AGENTS.md, DEV-02/02B, OPERATIONS, SECURITY, CI-OPT-01, package API y
CLI/workflow/transport/tools/encryption/private-files existentes. PR107 está merged;
Quality checks y GitGuardian del head `44e94bba543f6c616a6a7aa385a976d1b9e3d31d` PASS.

Credenciales disponibles al ejecutar: **YES**. El usuario usa Bitwarden Password Manager;
la inyección local empleó prompts ocultos SecureString y serialización DPAPI de Windows
en directorio privado fuera del repositorio, sin herencia ACL y con acceso del usuario actual.
La lectura se hizo en memoria y los valores pasaron al proceso por entorno; se retiraron
del entorno al finalizar. No valores secretos en comandos, historial, Git, archivos `.env`,
documentación, logs ni artifacts CI. La inyección cifrada privada no es evidencia pública
ni una identity age permanente. Administradores/OS siguen siendo frontera de confianza.

Los checks de presencia y validación publicaron exclusivamente booleanos. El endpoint
inicial no cumplía el formato account-level y bloqueó el preflight antes de invocar el smoke.
El usuario corrigió únicamente ese valor por el mismo canal privado; después config,
separación de roles, herramientas y opt-in PASS. No se normalizó ni redirigió el destino
silenciosamente. Un error del comando auxiliar tsx eval/CommonJS se resolvió invocando
Node ESM; no cambió código del repositorio ni generó una ejecución remota.

Bucket y ENAM son la identidad/localización aprobadas por el usuario. El smoke acredita
acceso al bucket exacto; no inspecciona region, privacidad, permisos completos de tokens,
billing, lifecycle o Bucket Lock mediante la API administrativa Cloudflare.
No se crearon/regeneraron tokens ni ampliaron permisos. No bucket, Workers, dominio,
CORS, acceso público o compra Workers Paid nuevos.

## Herramientas y comando

Herramientas portables existentes: age/age-keygen **1.3.2**, rclone **1.75.2**.
Los ZIP Windows coinciden con los SHA-256 fijados en tools.ts y [DEV-02B](DEV-02B.md);
cada ejecutable instalado coincide byte a byte por SHA-256 con su miembro del archivo.
Versiones verificadas con los binarios reales. Sin instalación global, actualización ni
dependencias nuevas. Docker y PostgreSQL no se iniciaron ni se necesitan para este smoke.

Comando existente, ejecutado fuera de CI/GitHub Actions y sin bypass de guards:

```sh
pnpm --filter @stock-app/api backup:qa --remote-smoke
```

BACKUP_SOURCE_COMMIT fue el SHA base exacto; BACKUP_R2_BUCKET el bucket aprobado.
BACKUP_TOOLS_DIRECTORY apuntó a las herramientas privadas existentes. El endpoint HTTPS
account-level y las cuatro credenciales llegaron por inyección privada. No se publica
endpoint/account ID ni valores de tokens. No uploader alternativo ni cambios en ops.

## Evidencia remota sanitizada

| Campo | Resultado |
| --- | --- |
| Inicio UTC | 2026-10-14T14:31:48.3533573Z |
| Fin UTC | 2026-10-14T14:31:54.8129384Z |
| Source commit | c3f0357e768bde0f2c4ac8e6ca50ab0a16bef606 |
| Bucket | stockapp-uat-backups |
| Invocaciones remotas | 1 |
| CLI status / exit | PASS / 0 |
| Object key propio | uat/qa-smoke/80c2c82f-3a7b-46c2-97f6-0b82108e7cb7/qa-smoke.age |
| Ciphertext bytes | 247 |
| Ciphertext SHA-256 | dbb7cd734954205f0b1dba4a94617439d57d98abaf3dd31aa95f6b8f228230da |
| Writer autenticado / upload | PASS |
| Reader autenticado / download | PASS |
| Tamaño y SHA-256 descargados | PASS |
| Descifrado age efímero | PASS |
| Digest plaintext sintético exacto | PASS |
| Borrado del objeto propio | PASS, deletefile completado por el CLI |
| Directorios temporales privados antes / después | 0 / 0 |

PASS se devuelve solo después de upload→reader download→ciphertext verification→decrypt→
plaintext verification→own-object delete. El cleanup remoto se acredita por la respuesta
exit0 de deletefile; no se hizo una lectura independiente posterior al borrado.
El object key es un UUID aleatorio sin User/Business/Inventory IDs ni PII. Solo se cargó
ciphertext sintético; ningún dump PostgreSQL, registro de supresión ni dato comercial real.
Los temporales plaintext y la identity efímera quedaron eliminados por su workspace propietario.
No se certifica borrado físico de bloques SSD.

El transporte existente conserva `If-None-Match: *`, immutable y no overwrite fallback.
Rclone puede listar solo el directorio del UUID asignado para resolver la lectura cat;
su alcance fue demostrado en QA DEV-02B, no mediante captura de tráfico remoto aquí.
No listado global ni limpieza de bucket, reintentos de smoke ni objetos adicionales.
No se volvió a probar una colisión/multipart con datos remotos; esa cobertura sigue siendo
la evidencia loopback de DEV-02B, no una afirmación de este smoke pequeño.

## Railway y requisitos pendientes

Consultas read-only antes y después: inventario y patch idénticos, StockApp UAT/uat,
patch `7eb661e7-067d-494a-917d-d1c816755b75`, **56 STAGED**, no destructivos.
API/Postgres/volumen staged-create; latestDeployment null en los servicios, sin cron.
Pin API `5222ee82437dcff1c5e5a691c466ddf5eaebfe7e` preservado. No accept-deploy,
variables, secretos, fuente, DB, DNS, SMTP, predeploy o startup modificados.

**REMOTE TRANSPORT PASS** no equivale a **POSTGRESQL RECOVERY VERIFIED** contra Railway.
La recuperación PostgreSQL18.6, snapshot consistente, supresión y conservación de supervivientes
se ensayaron localmente en DEV-02B. No recovery de una DB Railway live ni RPO/RTO medidos.

BACKUP ACTIVATION sigue bloqueada: ceremonia/copia/prueba de custodia age permanente fuera
de R2/Railway/Git/API/CI; descriptor y hash confiables independientes; custodia HMAC original;
retención efectiva e inventario de backups y supresiones; ensayo UAT aislado y autorización
operativa/deploy. La identity QA no se convierte en identity permanente. Sin scheduler/pruning,
backups reales, PROD o DEV-03. DEV local/CI→UAT→aprobación humana→PROD se conserva.

## Gates y scope documental

La aceptación principal es este único smoke real. Se seleccionan checks de documentación
según CI-OPT-01, con revisión completa del diff y git diff --check antes de commit/PR.
Gates locales del working tree: `pnpm ci:run policy` PASS; CI tests77 PASS/0fail/0skip,
format global, referencias/whitespace/fences de los cuatro docs, actionlint1.7.12 fijado
y lint CI PASS. Revisión del diff y git diff --check PASS. Provider CI y GitGuardian
se registran en el PR/entrega del head exacto; estos gates locales no los sustituyen.
No se ejecuta test:db completo por una operación de transporte sin cambios source.
Solo DEV-02C, DEV-02B, CURRENT_STATE y BACKLOG cambian para registrar evidencia factual.
UI/API runtime/Domain/Application/Mobile/contratos/schema/migrations/BackupV1/AccountExport/
formato de suppression registry/dependencias/CI permanecen intactos. CI/GitGuardian/reviews
se aceptan solo para el head documental exacto, sin force/bypass ni deployment por merge.

STOP después de evidencia y merge documental. No ceremonia de claves permanente,
activación Railway, scheduler, PROD ni DEV-03 automáticos.
