# DEV-02D — Custodia age permanente y retención UAT

Estado: **KEY CUSTODY VERIFIED — RETENTION ACTIVATION PENDING**, 2026-10-14 local.
Base main después de [PR108](https://github.com/ian0000/StockApp/pull/108):
`2a646f992500110c90c812c40d7d05ff02d491f6`, limpio, 0 ahead / 0 behind.
Rama `docs/dev-02d-key-custody-retention`. El usuario crea el PR manualmente;
Quality checks/GitGuardian/required checks del head exacto preceden a cualquier merge normal.
Preparación documental autorizada; checkpoint adicional del ticket §5 aprobado explícitamente
por el humano el2026-10-14: «Autorizar la ceremonia humana descrita». Ceremonia humana completada;
decrypts y cleanup verificados. Esto no acredita preparación operacional de backups.

## Estado independiente de cada gate

| Gate | Estado verificado |
| --- | --- |
| Human approval checkpoint | APPROVED; ejecución exclusivamente humana, sin generación unattended |
| KEY CEREMONY | PASS; una generación permanente humana; continuaciones reutilizaron esa identity |
| Public age recipient / version | Recipient registrado abajo; versión `stockapp-uat-age-v1` |
| PRIMARY CUSTODY | PASS; archivo existente, owner/DACL privada verificados |
| RECOVERY COPY | PASS; nota Bitwarden guardada y recuperada por humano; acceso independiente atestiguado |
| RECOVERY DECRYPT TEST | PASS con ambas copias sobre el mismo ciphertext sintético |
| Cleanup | PASS temporales; clipboard confirmado mediante copia/pegado humano de marcador público |
| TRUSTED DESCRIPTOR CUSTODY | PREPARED; inventario protegido propuesto, no aprovisionado/verificado |
| Suppression HMAC custody | NOT VERIFIED; sin leer, generar o rotar el secreto original |
| RETENTION POLICY | PROPOSED; retención efectiva aún no medida |
| R2 LIFECYCLE | NOT APPLIED; configuración administrativa actual no inspeccionada |
| RAILWAY ACTIVATION | NOT AUTHORIZED; 56 STAGED, 0 deployments |

DEV-02B conserva su recuperación cifrada PostgreSQL local PASS. [DEV-02C](DEV-02C.md)
conserva su único smoke R2 real sintético PASS y cleanup; no se repite aquí.
Bucket `stockapp-uat-backups`, privado/ENAM según aprobación humana; el smoke no certifica
configuración completa, región, lifecycle, Bucket Lock o permisos administrativos actuales.
Writer/reader existentes en custodia humana; no se recuperaron sus valores para este ticket.

## Preflight y límites de ejecución

Se revisaron AGENTS.md, DEV-00/01/02/02B/02C, OPERATIONS, SECURITY, PRIVACY_IMPACT,
DEPLOYMENT, CI_CD, BACKLOG y CURRENT_STATE; encryption/private-files/tools/cli/manifest,
supresión API-10 y evidencia de recovery existente. Versiones age/age-keygen1.3.2 verificadas
con binarios portables reales; SHA-256 del ZIP age coincide con el pin de tools.ts/DEV-02B.
No instalación ni actualización. La ubicación primaria propuesta no existía en el preflight.

Railway leído sin mutaciones: StockApp UAT/uat, patch
`7eb661e7-067d-494a-917d-d1c816755b75`,56 STAGED/no destructivo. API/Postgres/volumen
staged-create, latestDeployment null, sin cron; pin API
`5222ee82437dcff1c5e5a691c466ddf5eaebfe7e` intacto. No accept-deploy ni secretos consultados.

Una identity permanente generada por el humano, con recovery Bitwarden y ambos decrypts sintéticos
verificados. Ningún backup real, escritura R2 o modificación del proveedor ejecutados.
Runtime API/Domain/Application/Mobile/contratos/
schema/migrations/BackupV1/AccountExport/registro API-10/dependencias/CI permanecen intactos.

Tras autorización se preparó un auxiliar PowerShell interactivo fuera del repositorio, en
`C:\Users\USER\.codex\artifacts\stockapp-dev02d-ceremony.ps1`, para ejecución humana.
Contiene una única generación con output file, rechaza input redirigido y ubicación existente,
verifica pins de los ejecutables, ACL/owner, recipients y digests sintéticos, pausa para custodia/
retrieval Bitwarden, y elimina solo el subdirectorio temporal propio. Secret line pasa solo por
clipboard local controlado y prompt oculto; reporte allowlist público, sin private hashes.
Syntax/ACL existentes en lectura/simulación de grant ajeno en memoria PASS. Una prueba de ACL
ajena sobre fixture de disco fue
rechazada por revisión automática (`blocked by policy`) antes de ejecutarse; se sustituyó
por esa simulación en memoria, sin cambiar permisos de archivos ajenos ni relajar el guard.
El humano ejecutó el auxiliar original: creó la identity y se detuvo por manejo de stderr en
Windows PowerShell5. Se preservó esa identity; auxiliares de continuación no generan claves.
Los reportes fallidos se conservan sin sobrescribir ni convertirlos retrospectivamente en PASS.

## Evidencia final de custodia

Recipient público de `stockapp-uat-age-v1`:

```text
age13sjc7nwzagct9wrx43pztqdaaz4zqkpe2gpuep5z5p2v2f20w9ws9mnfad
```

Reportes públicos allowlist fuera del repo, en `C:\Users\USER\.codex\artifacts`:

| Evidencia | Resultado |
| --- | --- |
| `stockapp-dev02d-verification-02-result.json` | Ambos decrypts PASS, recipients iguales, temporales limpiados; STOPPED únicamente por marcador final incorrecto |
| `stockapp-dev02d-clipboard-result-33dc7462-5a35-4917-b69a-08e56d08f332.json` | KEY_CUSTODY_VERIFIED; valida los gates del reporte anterior y completa el marcador exacto |
| Decrypts UTC | 2026-10-15 01:09:19–01:11:04; 2026-10-14 20:09:19–20:11:04 America/Guayaquil |
| Cierre UTC | 2026-10-15 01:17:12; 2026-10-14 20:17:12 America/Guayaquil |
| Primary/recovery | Ambos descifran el mismo ciphertext; digests del plaintext sintético y recipient coinciden |
| Temporales | Cero directorios `verification-*` restantes; primaria y nota permanente conservadas |
| Generación | Una humana en total; cero invocaciones en cada continuación/verificación |

El humano confirmó nota guardada, acceso independiente/MFA y retrieval desde Bitwarden.
El decrypt demuestra que la copia recuperada funciona; no es una auditoría administrativa de
la cuenta Bitwarden. El cierre de clipboard usa marcador público copiado y pegado por humano
en prompt oculto con comparación exacta: confirmación asistida, sin inspeccionar la API del
clipboard ni certificar borrado de historial remoto. No contenido/hash de identity privada en
evidencia, Git o salida capturada. No se repitió el smoke R2 ni se usaron datos PostgreSQL reales.

## Ceremonia aprobada y ejecutada — referencia operacional

La versión v1 ya existe: **no repetir generación ni sobrescribir su archivo**. Los pasos
siguientes registran la ceremonia aprobada; una nueva versión/rotación requiere aprobación propia.

El usuario eligió finalmente Bitwarden Password Manager para la copia independiente.
Elegirlo no acredita recuperación; comprobar acceso a la bóveda sin depender exclusivamente
de este PC/perfil DPAPI antes de generar. Si credenciales/MFA o acceso independiente no están
disponibles, **STOP — KEY CUSTODY NOT VERIFIED**. No pedir contraseña maestra/2FA/identity en chat.

| Material | Destino bajo control humano |
| --- | --- |
| Primaria age X25519 | `C:\Users\USER\AppData\Local\StockApp\BackupKeyCustody\stockapp-uat-age-v1\identity.txt` |
| Recovery independiente | Nota segura Bitwarden personal `StockApp UAT — age — stockapp-uat-age-v1` |
| Temporales de prueba/recovery | Subdirectorio privado `verification-<UUID>` dentro del directorio primario |
| Evidencia publicable | Solo recipient público, versión, UTC y resultados de verificación |

La primaria es un archivo age privado en formato texto, con DACL restringida; ACL no equivale
a cifrado de disco. No se acredita BitLocker ni resistencia frente a un administrador/OS
comprometido. Bitwarden protege la copia en su bóveda; una copia local DPAPI de esa nota o
dos archivos del mismo PC no sustituyen el almacenamiento independiente.
Las [notas seguras](https://bitwarden.com/help/managing-items/) soportan texto libre;
no se requieren adjuntos premium, export de la bóveda ni un servicio pago nuevo.

1. Revisar esta propuesta y obtener autorización explícita para **una** identity permanente
   X25519, ambas ubicaciones y la verificación sintética. Agente no ejecuta generación unattended.
2. El humano usa una sesión local privada, sin transcript, grabación, logging de comandos con
   datos secretos ni sincronización/historial de clipboard. Confirmar bóveda/MFA recuperables
   desde otro dispositivo; todavía no usar la identity QA de DEV-02C.
3. Crear el directorio primario nuevo fuera del repo, sin reutilizar una ruta existente/reparse
   point/sync folder. Quitar herencia DACL y conceder acceso solo al usuario actual; revisar
   también grants explícitos. No cambiar ACL de perfiles, unidades o carpetas existentes.
   [icacls](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)
   elimina grants heredados con `r`; no garantiza quitar grants explícitos ajenos por sí solo.
4. Con age-keygen1.3.2, humano genera una sola vez con `-o` al archivo primario nuevo.
   Nunca sin `-o`, nunca private identity en stdout. Error/archivo existente → STOP, sin overwrite
   ni generación de reemplazo. Se verifica ACL heredada del archivo, sin mostrar su contenido.
5. Derivar únicamente el recipient público con `age-keygen -y`; registrar versión
   `stockapp-uat-age-v1`. El writer futuro recibe solo ese recipient, nunca la identity privada.
6. El humano guarda la identity como nota segura privada Bitwarden, con la versión/recipient.
   Transferencia local privada; no Codex editor/chat/terminal capturado. Limpiar clipboard actual
   y cualquier historial que ya existiera; cerrar vistas privadas y confirmar sincronización.
   No conservar exports planos de la bóveda ni convertir la copia efímera en la definitiva.
7. Crear plaintext fijo exclusivamente sintético y cifrarlo al recipient. Descifrar con primaria,
   verificar digest SHA-256 exacto contra el plaintext original, sin imprimir contenido.
8. Recuperar la nota desde la bóveda independiente, mediante acceso humano comprobado sin
   dependencia exclusiva del PC. Materializarla solo en `verification-<UUID>\recovered-identity.txt`,
   privado, nuevo, sin stdout/transcript/editor Codex. No copiar otra vez el archivo primario
   para simular recuperación de la segunda copia.
9. Derivar recipient de esa copia y compararlo exactamente con el original. Descifrar el **mismo**
   ciphertext y comparar ambos plaintext digests con el original. Registrar solo PASS/FAIL,
   UTC, versión y recipient público. No hashes del contenido privado de las identities.
10. Eliminar únicamente archivos/subdirectorio de verificación propios: identity recuperada,
    plaintext original/descifrados y ciphertext sintético. Verificar rutas absolutas/ownership
    antes de borrar; nunca limpiar TEMP global. Conservar primaria y nota segura permanentes.
    Cleanup de archivos no certifica borrado físico SSD. Ante interrupción, inspección humana
    del directorio privado sin mostrar contenidos; no eliminar la única identity útil.
11. Solo con ambos decrypt PASS, recipient coincidente, custody independiente acreditada y
    cleanup verificado actualizar los gates respectivos. Fallo → STOP, sin regenerar o activar.

Secuencia conceptual de la ceremonia humana completada; **no volver a ejecutar generación v1**.
Herramientas en su ubicación privada existente.
Los paths/variables corresponden a archivos nuevos del operador, no valores secretos en argv:

```text
age-keygen -o <primary-private-identity-file>
age-keygen -y <primary-private-identity-file>
age --encrypt --recipient <public-recipient> -o <new-synthetic-ciphertext> <synthetic-input>
age --decrypt --identity <primary-private-identity-file> -o <new-primary-output> <synthetic-ciphertext>
age-keygen -y <retrieved-private-recovery-file>
age --decrypt --identity <retrieved-private-recovery-file> -o <new-recovery-output> <same-synthetic-ciphertext>
```

Se usa [age X25519](https://github.com/FiloSottile/age), sin `-pq`, passphrase nueva,
crypto propio, dependencia nueva ni cambio de versión. Los flags de generación/output/derive
se revisaron en el help del binario fijado. La generación permanente fue exclusivamente humana.

## Descriptor confiable y secretos históricos

Propuesta: inventario bajo control humano en Bitwarden, con una nota independiente por backup
`StockApp UAT — backup descriptor — <backupId>`, recuperable de la bóveda sin depender del PC
antes de usarlo operacionalmente. No solo metadata del objeto R2.
Estado actual PREPARED: notas/recuperación del inventario no verificadas en este ticket.
Registro explícito por artefacto: entorno/kind/UUID/object key, UTC del snapshot/export y upload,
SHA-256 del manifest cifrado obtenido al crearlo por canal confiable, SHA-256/tamaño ciphertext,
source commit, recipient/key version, suppression key version, server/client version, estado
de restore y retention reference. Descriptores no contienen emails, datos comerciales ni secrets.
El historial operacional protegido registra además expiración prevista, desaparición efectiva,
verificación de borrado/copia/restore points y aprobación; no cambia el schema del manifest.

Age protege ciphertext pero no autentica quién lo creó. Un hash descargado junto al objeto desde
R2 no establece confianza independiente. Custodiar el descriptor antes de declarar el backup
utilizable; falta/mismatch/selección ambigua → STOP. Sin firma casera o nuevo protocolo.
Backup antiguo y último registro COMPLETED pueden tener commits y claves age diferentes;
seleccionar sus descriptores/copies por separado usando los guards CLI DEV-02B existentes.

DELETION_SUPPRESSION_SECRET tiene custodia y versión históricas separadas de age, R2 keys y
BETTER_AUTH_SECRET. Propuesta: entrada de vault separada con procedencia/entorno/versión y
recuperación independiente antes de activar; no documentar su valor ni derivarlo de otra clave.
No generar, provisionar ni rotar ese secreto en DEV-02D. Custodia real original NOT VERIFIED;
no asumir que los secrets ficticios de QA son los de UAT.

API-10 con HMAC equivocado de longitud válida puede dar exit0 y cero matches. Elegir el HMAC
original por custodia confiable; usar registry COMPLETED independiente más reciente y verificar
que identidades eliminadas siguen ausentes, conjunto exacto de supervivientes/auth/historia/
receipts intactos antes de promover. La igualdad entre dos valores igualmente equivocados
no acredita origen; cero resultados/health200 por sí solos no prueban recovery. CLI/formato y
verificadores existentes no cambian; ninguna DB se restaura o promueve por este ticket.

## Propuesta explícita de retención — no aplicada

| Capa | Objetivo / condición |
| --- | --- |
| R2 `uat/postgres/` | Dump diario; retención máxima pretendida30d desde snapshot, inventario completo y expiración efectiva medida |
| Railway daily / weekly | Revisar daily cada24h/6d y weekly cada7d/27d; confirmar comportamiento efectivo antes de activar |
| Railway monthly | No habilitar schedule89d por defecto; incompatible con propuesta hasta30d sin otra decisión humana |
| Supresión independiente | Conservar hasta desaparición efectiva de la última copia que pueda contener la identidad +7d |
| Claves age históricas | Ambas copias disponibles mientras cualquier artefacto/restore point retenido necesite su decrypt |
| HMAC histórico / descriptors | Disponibles mientras cualquier recovery o supresión retenida dependa de ellos; no rotación/pruning automático |

La fecha de deletion, fecha del snapshot o regla30d no sustituyen evidencia del último backup
**realmente retenido**. Inventariar R2, snapshots Railway/manuales, volúmenes previos/desmontados,
destinos restaurados y copias independientes. Si alguna copia puede conservar la identidad,
esa supresión sigue necesaria; si no se conoce cuándo dejó de estar disponible, no hay cutoff
acreditable. Una copia histórica descubierta extiende la obligación; no constantes37/38d.
Solo después de verificar ausencia en **todas** las capas y transcurrir7d se propone revisión
humana de retiro del registro afectado; no purgar el registro completo si otro entry sigue vigente.
Inventario incompleto/retención excepcional sin cierre → **NO AUTOMATIC PRUNING** y revisión.

[Railway backups](https://docs.railway.com/volumes/backups) publica6/27/89d y snapshots
incrementales; restore conserva el volumen anterior y sus backups, que también se inventarían.
Son parámetros publicados, no schedules efectivos de StockApp. No borrar volumen ni snapshots.

Propuesta lifecycle R2: regla de expiración30d únicamente para prefix **`uat/postgres/`**,
sin transition/storage class change, pendiente aprobación y ensayo de compatibilidad.
El clock del objeto se basa en upload; retrasar upload no debe alargar silenciosamente el objetivo
desde snapshot: inventario conserva ambos tiempos y obliga a revisar ese desfase.
La [documentación R2](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) indica
eliminación normalmente dentro de24h de x-amz-expiration; cambios sobre objetos previos pueden
tardar más. `Days=30` **no garantiza borrado efectivo al cumplir30d**. Antes de habilitar datos
reales verificar/reconciliar el límite efectivo con la política aprobada; si no se demuestra,
STOP activación y revisión humana del mecanismo/plazo, sin extender privacidad silenciosamente.

Para **`uat/deletion-suppressions/`**: ninguna expiración por edad fija ni regla30d; protección
por inventario/retención causal y revisión humana de objetos exactos cuando resulte seguro.
No borrar el último registry utilizable, evidencia COMPLETED necesaria o descriptor para ahorrar
espacio. Una regla blanket del bucket o un lock largo puede contradecir ambos objetivos.
Mantener configuración actual sin cambios, incluido qa-smoke y reglas multipart preexistentes;
no afirmar que no hay rules/locks solo porque este ticket no los aplica.
Revisión administrativa read-only de R2, expiración efectiva, permisos y cambios de lifecycle/
Bucket Lock necesitan autorización propia antes de activación. No usar tokens del smoke para
alterar permisos, CORS, acceso público, jurisdiction o bucket.

## Costos, fallos y auditoría operacional

Modelo de capacidad, no tamaño medido: en régimen diario hasta30 copias, sumar los tamaños
cifrados reales de dumps + manifests + registry independientes + objetos fallidos pendientes
+ posibles uploads multipart incompletos. Medir promedio de picos diarios/GB-mes; no inferir
coste del dataset sin medición. Versiones históricas de claves e inventario exigen copias,
recuperación y revisión humana; coste operativo y capacidad de bóveda aún no medidos.

[R2 Standard](https://developers.cloudflare.com/r2/pricing/), consultado2026-10-14:
USD0.015/GB-mes, ClassA4.50/millón, ClassB0.36/millón, egress Internet sin cargo.
Free tier10GB-mes/1M A/10M B sujeto a consumo agregado/redondeo; no se afirma factura cero.
PUT/list/multipart consumen A; HEAD/GET/verificación consumen B; decrypt local no elimina
operaciones de transporte. No cambio a Infrequent Access ni plan pago. Billing real no verificado.
Railway snapshots cobran bytes incrementales propios según tarifa de volumen, además del
runtime/volumen; el plan$5 confirmado por el humano no fija un techo del coste total.

Upload fallido/interrumpido o resultado incierto: registrar privadamente object key/estado,
conservar referencia y artefactos cifrados necesarios para diagnóstico; no aceptar BYTE_VERIFIED
como restore verificado ni regenerar clave/reintentar hasta verde. Inspección de objetos exactos
bajo autorización; borrar solo asignación propia demostrada y jamás limpieza global.
Un backup solo utilizable con ciphertext, descriptor confiable, claves seleccionadas y restore/
supresión verificados; preservar última copia válida dentro de los límites aprobados y escalar
si continuidad y expiración entran en conflicto, sin extender/borrar silenciosamente.

Auditoría propuesta tras cada backup/expiración/restore: origen/commit, estado de verificación,
desfase snapshot-upload, objetos expirados todavía presentes, inventario por capas, cutoffs de
supresiones, disponibilidad y retrieval de claves históricas/descriptors. Una comprobación
fallida mantiene gates bloqueados. DEV-05 instrumentará alertas de antigüedad/fallo de backup,
integridad/restore/supresión, espacio/objetos huérfanos, demora de expiración y pérdida de custodia.
Sin implementación/scheduler en DEV-02D. RPO≤24h/RTO≤4h siguen objetivos no demostrados.

## Rotación, pérdida y recovery

Runbook FUTURO, requiere aprobación separada: generar nueva versión/recipient mediante la misma
ceremonia y ambos decrypts, registrar corte UTC/source, usar nuevo recipient solo para artefactos
futuros. Mantener recipients/versiones/copies viejos y selection independiente por artefacto.
No reescribir backups ni rotar HMAC por cambiar age. No retirar una identity hasta que ninguna
copia inventariada dependa de ella y los requisitos de recovery/supresión estén cerrados.
Pérdida de primaria → recuperar nota independiente, comprobar recipient y decrypt antes de usar.
Pérdida de recovery → STOP readiness de custodia; restaurar segunda copia mediante ceremonia
aprobada. Pérdida de ambas → objetos correspondientes irrecuperables; no rotación ficticia que
pretenda recuperar ciphertext antiguo. Incidente/copia sospechosa se escala al humano.

Restore PostgreSQL permanece aislado: descriptor confiable por artefacto, identity histórica,
DB nueva bajo autorización, restore consistente, registry último/original HMAC y verificación
independiente de purga/supervivientes; readiness/auth/ownership/replay, sign-off antes de promover.
Este documento no habilita un comando de recovery sobre Railway ni acepta un deployment.

## Revisión humana consolidada y cierre documental

Pendientes razonablemente detectables: creación y retrieval del inventario
confiable; custodia original HMAC/version histórica; inventario/cutoff de todas las capas;
config R2 actual y expiración efectiva compatible con30d; autorización separada de lifecycle,
schedules, ensayo UAT y activación. La elección Bitwarden no resuelve esos gates automáticamente.

Solo Markdown. Checks documentales/herramientas/diff y ausencia de private identities en cambios
se verifican antes de commit: `pnpm ci:run policy` PASS,77 tests/0fail/0skip, formato global,
referencias/whitespace/fences, actionlint1.7.12 fijado y lint CI PASS; git diff --check PASS.
Binarios/version/archive pin age PASS; no private identity en los documentos cambiados.
Los resultados del provider se registran independientemente. Sin test:db ni generation
por preparación de un runbook. PR manual, CI/GitGuardian/required checks pendientes hasta que
exista candidato PR; no se atribuye el verde de PR108 a DEV-02D.

AUTO-FIX:
CAUSE: Windows PowerShell5 convierte stderr público de age-keygen en error terminante con
ErrorActionPreference Stop, y Set-Clipboard con cadena vacía falla; acceso nativo al clipboard
también puede fallar en sesión no interactiva. Se reprodujeron con datos públicos sintéticos.
SOURCE OF TRUTH: help age1.3.2, invariantes de ceremonia y comportamiento comprobado de PowerShell5.
FILES: exclusivamente auxiliares locales `stockapp-dev02d-resume.ps1`, `stockapp-dev02d-verify.ps1`,
`stockapp-dev02d-verify-02.ps1` y `stockapp-dev02d-finish.ps1`, fuera del repositorio.
PRODUCTION BEHAVIOR CHANGED: NO.
Se capturó stderr nativo sin publicarlo y se reutilizó la identity existente; para clipboard se
usó reemplazo humano por marcador público y validación exacta, sin APIs nativas en el cierre.
Errores de input humano conservaron sus reportes FAIL; se completó solo el paso restante,
sin relajar assertions ni regenerar, sin retry loops ni sleeps para obtener verde.

STOP en **DEV-02D KEY CUSTODY VERIFIED — RETENTION ACTIVATION PENDING**.
Custodia age completada; descriptor/HMAC original/retención efectiva siguen bloqueando activación.
Sin Railway accept-deploy/Postgres UAT/live backups/scheduler/PROD/DEV-03.
