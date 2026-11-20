# UAT — Integridad del registro y despliegue controlado

Continuación de la [PR 113](https://github.com/ian0000/StockApp/pull/113) sobre `f55e301`.
El identificador del candidato es el SHA completo de la cabeza revisada de la PR.
El SHA para publicar se vuelve a verificar después de cualquier merge manual.

## Diagnóstico y cambios

Better Auth 1.7.7 transforma a minúsculas el correo válido antes de buscar y crear el usuario.
La restricción `user_email_unique` de `0002_auth_identity.sql` comparaba el texto almacenado.
Una prueba directa de PostgreSQL reprodujo que una escritura ajena al adaptador podía insertar una
variante en mayúsculas. Una segunda prueba bloqueó ambas inserciones hasta que las dos solicitudes
habían consultado el correo. PostgreSQL conservó una cuenta, y la solicitud perdedora recibió 422
en lugar del 200 genérico de un registro duplicado. El cambio de contraseña que motivó el reporte
original sigue sin reproducirse.

- `0005_auth_email_normalized.sql` añade un índice UNIQUE sobre `lower(email COLLATE "C")` a
  `user`, consistente con los correos ASCII admitidos por Better Auth. Conserva la restricción
  existente y los datos. Registra la migración en el journal y snapshot de Drizzle. Los ensayos de
  upgrade comprueban que una colisión histórica bloquea la migración con el ledger intacto.
- `auth/adapter.ts` y `auth/create-auth.ts` conservan el adaptador oficial. Un savepoint revierte
  el `INSERT` de usuario que colisiona. Sólo el error PostgreSQL `23505` de los dos índices de
  correo toma la rama sintética de Better Auth. Así ambas solicitudes obtienen el mismo estado
  y forma pública, y sólo la ganadora crea la cuenta y encola un correo. Otros errores siguen su
  tratamiento normal. El test valida el correo guardado, una fila `credential`, cero sesiones de
  alta y que sólo la contraseña ganadora funciona tras verificar. Los duplicados posteriores
  conservan el hash, el perfil, el ID, la verificación y cualquier sesión activa.
- `auth/routes.ts` limita el reenvío a tres solicitudes por hora y correo normalizado, además del
  límite por IP y los controles de Origin y callback existentes. El límite se consume antes de
  conocer si existe el correo. Better Auth impide reenviar para otro correo si hay sesión. Antes de
  iniciar sesión, el endpoint ofrece la misma respuesta para correos pendientes, verificados o
  inexistentes. Sólo encola un enlace para la cuenta pendiente y sólo el buzón puede confirmarlo.
- `routes/auth.tsx` muestra Iniciar sesión, Recuperar contraseña y Solicitar verificación junto
  al registro. La pantalla posterior conserva la respuesta genérica y evita prometer entrega.
- `test/auth/signup-integrity.test.ts`, las pruebas de migración y `test/browser/navigation-auth.mjs`
  refuerzan estos invariantes. Las pruebas existentes cubren reset, tokens, revocación y eventos de
  aceptación/fallo de Resend con datos sensibles excluidos. Se conserva la telemetría de la PR.

## Publicación y verificación UAT

El backend es [StockApp UAT en Railway](https://railway.com/project/1acb0266-cf67-4694-a470-543f62a7a30f),
entorno `uat`, API `api-stockapp-staging.ian-k.dev`. La web es el proyecto Cloudflare Pages
`stockapp-web-uat`, en `stockapp-staging.ian-k.dev`. El procedimiento documentado usa una PR
revisada y merge manual a `main`, seguido del despliegue controlado del SHA exacto. Un push a
la rama de trabajo sólo actualiza la PR y sus checks. Véase [DEV-UAT-01](DEV-UAT-01.md).

Antes de desplegar, verificar `Quality checks`, GitGuardian y la aprobación del SHA seleccionado.
Confirmar los proyectos y que el despliegue sigue siendo manual. Consultar en PostgreSQL de UAT
sólo conteos agregados de grupos en conflicto y filas no canónicas. Si hay alguna, detener la
publicación y revisar los registros con el operador autorizado. La migración no fusiona ni borra
usuarios. La creación del índice toma un bloqueo de escritura sobre `user`. Si hay que volver a
un artefacto anterior, revisar primero el ledger, porque la API comprueba las migraciones esperadas.

```sql
SELECT count(*) FROM (
  SELECT 1 FROM "user" GROUP BY lower(email COLLATE "C") HAVING count(*) > 1
) AS duplicate_groups;
SELECT count(*) FROM "user" WHERE email COLLATE "C" <> lower(email COLLATE "C");
```

Tras aprobar la publicación, aplicar la migración por el paso predeploy de Railway. Comprobar
que API y Pages sirvan el mismo código revisado, `/health` responda 200 y el índice esté válido.
El build de Pages debe usar el origen de API UAT y generar `apps/web/dist`. Registrar el SHA y los
identificadores de despliegue de ambos proveedores.

Desde Safari iOS y Chrome Android físicos, usar buzones de prueba controlados:

1. Registrar cuenta nueva con variante de mayúsculas. Comprobar solicitud aceptada genérica,
   un único mensaje de verificación en el buzón, enlace correcto e inicio de sesión posterior.
2. Volver a registrar con otro nombre y contraseña. Confirmar resultado genérico, ninguna alta
   ni correo adicional, acceso con la contraseña original y perfil intacto. Repetir con una
   cuenta sintética pendiente y solicitar un reenvío válido.
3. Solicitar una recuperación, comprobar entrega, completar el reset y verificar revocación de
   sesiones y rechazo del enlace usado. Correlacionar el resultado con Resend sin guardar enlaces,
   correos, contraseñas o tokens en el reporte.
4. Cambiar rutas durante carga, editar formularios durante más de cinco minutos y alternar entre
   primer plano, segundo plano, desconexión y reconexión. Validar campos intactos, guardado y
   protección al salir. Registrar dispositivo, navegador, hora y resultados.

**Estado UAT: PARTIAL.** La verificación en el entorno publicado y la entrega real siguen
pendientes. El conector Railway requiere reautenticación para leer el estado vigente del proyecto.
