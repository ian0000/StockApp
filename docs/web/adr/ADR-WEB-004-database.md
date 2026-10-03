# ADR-WEB-004 — Cloud database technology/provider

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Ventas/líneas/movimientos/estado requieren atomicidad, relaciones y concurrencia.
Mobile utiliza Drizzle SQLite; proveedor cloud antiguo Supabase era provisional.

## Decisión

PostgreSQL en Railway con Drizzle + pg; schemas/migraciones dialect-specific en apps/api,
sin compartir sqliteTable. Money BIGINT escalado 10^6 con rango seguro igual Domain,
JSON strings y codecs explícitos. UUIDv7 comercial; epoch ms domain y timestamps server UTC.
Fuente: [DATA_MODEL](../DATA_MODEL.md), [OPERATIONS](../OPERATIONS.md).

## Alternativas

Supabase añade plataforma auth/servicios no requerida frente a API Railway y librería seleccionada.
Postgres externo es alternativa si existe blocker operativo comprobado; ninguno encontrado aquí.
MongoDB no mejora relaciones/constraints. SQLite cloud único complica locking/operación multi-device.
Prisma es viable pero distinto ORM sin beneficio sobre experiencia Drizzle y SQL explícito.

## Consecuencias

Locks por Inventory, FKs compuestas, barcode/reversal uniques, migrations versionadas;
backups/restore responsabilidad del operador. No asumir PostgreSQL Railway implica HA/PITR/SLA.
[Railway PostgreSQL](https://docs.railway.com/databases/postgresql) y
[PostgreSQL exact integers](https://www.postgresql.org/docs/current/datatype-numeric.html) revisados.
