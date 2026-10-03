# Alcance

## Esta entrega

Auditoría, arquitectura, requisitos, ADRs, PlantUML, backlog, validación documental,
commit y push. Solo `docs/web` se crea. No código, schema, migraciones, dependencias,
apps nuevas, configuración externa, DNS, builds nativos, PR ni merge.

## Implementación futura V1

Cloud: identidad verificada, ownership simple, comandos de dominio, persistencia transaccional,
API de consultas, protocolo push/pull, importación inicial consentida, export de seguridad,
eliminación de cuenta/datos, observabilidad y recuperación probada.
Web: capacidades MUST HAVE de [PARITY_MATRIX](PARITY_MATRIX.md), online-first y responsive.
Mobile conectado: almacenamiento local durable, outbox, descarga transaccional, reintentos,
conflictos revisables y separación de datos locales/compartidos. Free local conserva sus capacidades.

SHOULD HAVE no bloquea primera V1. Cámara browser es LATER; barcode manual/lector USB sí entra.
Undo temporal, desarchivado, gráficas, PWA, offline web, Team, múltiples negocios, compras
multiproducto, cantidades fraccionarias, impuestos, pagos, IA y catálogos externos quedan fuera.
Backup local manual permanece; CSV/Excel y restores parciales/merge no entran.

Solo servidor acepta comandos cloud; clientes no reciben CRUD arbitrario de stock,
InventoryState, movimientos o snapshots. No se construye event sourcing completo ni broker.
El registro de cambios existe para entrega incremental, no para rehacer historia contable.

## Compatibilidad comercial

Ninguna cuenta obligatoria en Free; ningún límite nuevo de productos ni publicidad.
La habilitación técnica V1 es manual a nivel Business (`cloudAccessEnabled`), ver AUTH.
La política de cobro/cancelación pública queda fuera y requiere aprobación posterior;
sin ella solo se autoriza piloto cerrado al terminar los tickets, nunca publicación Pro automática.
