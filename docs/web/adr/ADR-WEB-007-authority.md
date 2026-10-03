# ADR-WEB-007 — Mobile/cloud source-of-truth model

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

SQLite confirma trabajo local sin red; añadir cloud no puede anular ese principio.
Dos dispositivos requieren distinguir estado local durable de estado aceptado compartido.

## Decisión

Local-only mantiene SQLite como autoridad completa. Conectado: cloud autoridad compartida de
comandos aceptados; SQLite fuente inmediata durable, réplica más propuestas pendientes.
Web lee/confirma cloud. Ningún cliente sobrescribe InventoryState remoto con su valor final.
Fuente: [SYNC](../SYNC.md), [MIGRATION](../MIGRATION.md).

## Alternativas

Cloud obligatorio para confirmar Mobile rompe offline-first. SQLite de un teléfono como única
autoridad global complica pérdida del dispositivo y cambios Web. Igualar cache local con cloud
sin pending visible oculta divergencias y pierde datos.

## Consecuencias

Etiqueta de guardado local/pendiente, conflictos durables y réplica separada de propuestas.
Sin upload automático; primera conexión consentida e import validado. No se presenta sync como backup.
