# ADR-WEB-008 — Synchronization protocol

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Retry/offline no debe duplicar ventas ni sobrescribir inventario. Timestamp dispositivo no ofrece
orden de commit; cursor de secuencia global puede saltar una transacción aún no confirmada.

## Decisión

Outbox atómica local con comandos de dominio versionados, IDs offline/dependencias.
Server receipts únicos con fingerprint, un comando/tx, lock Inventory, revisión de commit por
Inventory. Pull de ChangeSets completos con cursor/generation/highWaterMark y aplicación+cursor
atómica. Snapshot/reset preserva outbox. Tombstones/delta 90 días, receipts vida dataset.
Fuente: [SYNC](../SYNC.md).

## Alternativas

UPSERT de estados/movimientos no valida reglas ni costos concurrentes. Realtime alone no cubre
offline/retry ni catch-up. CRDT/event sourcing/broker añade complejidad innecesaria a V1.

## Consecuencias

Mayor trabajo de réplica/propuestas y recuperación, explícito en tickets. Foreground/manual sync
suficiente para consistencia eventual; background best effort. No se afirma convergencia automática
de todas las propuestas incompatibles ni orden contable por occurredAt del móvil.
