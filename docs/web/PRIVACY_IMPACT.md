# Impacto de privacidad y publicación

API-10 entrega el mecanismo local de deletion y supresión HMAC sin email/raw user ID después de completion. No borra remotamente exports ni dispositivos offline. Registro COMPLETED se conserva sin cutoff aproximado hasta que DEV-02 implemente la retención real; PRIV/REL y recovery de proveedor siguen bloqueando producción real. [Detalle](API-10.md).

Fuente actual comprobada: checkout read-only `Apps/ian-k.dev/src/pages/stockapp/privacy.md`
(2026-10-02) y `terms.md` (2026-10-01). URLs canónicas
[Privacy](https://ian-k.dev/stockapp/privacy/) y [Terms](https://ian-k.dev/stockapp/terms/).
La herramienta de navegación no pudo abrir esas páginas: no se afirma verificación de su versión
publicada. Contenido local describe la versión Mobile 0.1.0 sin cuentas/cloud y telemetría ML Kit
Android diferenciada. No se modifican políticas públicas en este ticket.

Cloud cambia materialmente las prácticas: desarrollador y proveedores recibirán identidad,
email, datos comerciales e historial, syncDevice/receipts, IP/metadata de seguridad y errores.
Public site sigue separado. Login NO es consentimiento para subir inventario; MIGRATION define
consentimiento de incorporación y qué cuenta recibe el dataset.

| Dato | Finalidad prevista | Destino | Retención de diseño |
| --- | --- | --- | --- |
| Email/identidad/password hash/sesiones | Autenticación y acceso | API/PostgreSQL Railway; SMTP solo destinatario y links de identidad | Cuenta activa; sesiones 7 días; borrado según OPERATIONS |
| Productos/costos/ventas/compras/ajustes/historia | Inventario compartido | API/PostgreSQL, dispositivos autorizados | Vida dataset; purga tras borrado |
| DeviceId generado, receipt, revisions | Dedup/entrega y seguridad | Cloud y Mobile | Receipts vida dataset; delta 90 días |
| IP/requestId/status/latencia | Seguridad/diagnóstico | Railway logs restringidos | Objetivo máximo 14 días logs propios; validar retención proveedor |
| Staging import | Incorporación consentida | API/DB temporal | TTL 24h, purge cancel/expiry |
| Backup servidor | Recuperación de desastre | Railway + copia cifrada separada | Hasta 30 días, supresión al restore |
| JSON exportado | Copia controlada por usuario | Browser/dispositivo/destino elegido | Fuera del control del desarrollador |

No vender datos, no analytics comercial nuevo, no campos de cliente/empleado añadidos.
Texto libre puede contener datos personales; usuario debe verlo en información de carga/export.
No declarar que cifrado o condiciones regionales están verificados sin revisar servicios elegidos.

## RELEASE BLOCKERS

1. PRIV-01: actualizar Privacy pública para cuentas, cloud, sync, finalidades, categorías,
   proveedores/región/subprocesadores, medidas reales, retención/borrado y contacto.
2. PRIV-02: revisar Terms para servicio cloud, cuentas, conflictos/limitaciones/recovery,
   disponibilidad y condiciones comerciales aprobadas. No inventar jurisdicción/SLA.
3. PRIV-03: implementar y probar delete account/cloud data, revocación, export, aviso local/offline
   y enlace público de solicitud de borrado; no basta auth deleteUser.
4. PRIV-04: revisar Google Play Data Safety y App Store App Privacy sobre binario final,
   SDKs transitivos (ML Kit incluido) y nueva transmisión cloud; configurar declaraciones humanas.
5. PRIV-05: demostrar consentimiento, separación Free local/cloud y ausencia de auto-upload.
6. PRIV-06: región y transporte SMTP aprobados; acuerdos/tratamiento, retención real de logs/backups
   comprobados; pruebas de restore con supresión; comunicación de seguridad/support.

Estos gates bloquean publicar Cloud/Web o piloto con datos reales, no el inicio de foundation
con datos ficticios después de revisión. Store declarations/políticas se trabajan en tickets
separados y repos correctos. No aprobación legal ficticia ni cambio en producción por esta entrega.
