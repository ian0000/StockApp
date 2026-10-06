# ADR-WEB-009 — Conflict resolution strategy

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Editar nombre no equivale a una venta. Recalcular costo de venta offline tras compra remota
reescribe una estimación histórica y oculta decisiones financieras.

## Decisión

Product metadata revision optimista, conflictos visibles. Sale admite delta de stock sobre
estado actual solo con snapshot de costo equivalente y producto activo; conservar precio/costo/profit.
Purchase/Adjustment exigen estado esperado exacto. Void exige última operación inequívoca y estado
compatible. Decisión humana API-06 (2026-10-06): Cloud misma operationId/hash hace replay;
distinta stale→409, distinta vigente contra operación ya VOIDED→422, sin commit no-op.
ALREADY_VOIDED permanece local y en el shared result; aplicar lo mismo a API-07 futuro.
Propuesta rechazada y dependientes permanecen revisables,
sin reescritura financiera automática. No LWW por tiempo.
Fuente: tabla normativa y resolución en [SYNC](../SYNC.md).

## Alternativas

LWW inventario pierde salidas. Recompute automático de ventas cambia ganancias históricas.
Rechazar toda venta por stock concurrente desperdicia que los deltas son compatibles con mismo costo.
Aceptar cualquier compra concurrente invalida snapshots de operaciones dependientes.

## Consecuencias

Dos ventas pueden llevar stock a negativo, como permite el dominio. Cambio de costo exige revisión
humana y nueva intención explícita si corresponde; propuesta original nunca desaparece.
Prueba de dos dispositivos/clock skew/dependencias es gate de implementación, no pasada hoy.
