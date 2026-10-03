# ADR-WEB-009 — Conflict resolution strategy

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Editar nombre no equivale a una venta. Recalcular costo de venta offline tras compra remota
reescribe una estimación histórica y oculta decisiones financieras.

## Decisión

Product metadata revision optimista, conflictos visibles. Sale admite delta de stock sobre
estado actual solo con snapshot de costo equivalente y producto activo; conservar precio/costo/profit.
Purchase/Adjustment exigen estado esperado exacto. Void exige última operación inequívoca y estado
compatible; ya VOIDED idempotente. Propuesta rechazada y dependientes permanecen revisables,
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
