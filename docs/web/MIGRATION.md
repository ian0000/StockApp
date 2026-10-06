# Primera conexión e importación

La transición es opt-in. Instalar una versión con cloud, iniciar sesión o registrarse no sube SQLite.
Antes del consentimiento se explica qué se enviará, destino, cuenta/negocio, privacy vigente,
conflictos, respaldo y posibilidad de seguir local. Cuenta cloud no reemplaza cuenta de app store.

## Cloud vacío

1. Crear/exportar backup local formatVersion 1; verificar que está disponible para recuperación.
2. Autenticarse y verificar email; consultar Business/Inventory. Elegir importar datos existentes
   o empezar vacío. Mostrar moneda/nombre/timezone y conteos antes de consentir.
3. Pausar brevemente escrituras para obtener snapshot consistente y fijar el punto de corte;
   calcular hash del archivo. Después del corte, nuevas operaciones se guardan en outbox separada,
   dependiente de la activación de import, sin modificar el snapshot enviado.
4. Reservar ImportSession vinculada al owner, hash y generación de cloud vacío. Si aún no hay
   Inventory, reservar su ID local (import) o generar uno (inicio vacío). No crear otro Inventory
   provisional con ID distinto que bloquee el import. Business puede existir sin Inventory durante
   onboarding; la unicidad final es a lo sumo uno y exactamente uno cuando ACTIVE operativo.
5. Upload chunks idempotentes de 1 MiB, checksum por fragmento, máximo 50 MiB comprimido prohibido
   para evitar bombas; máximo 100000 movimientos en piloto. Son límites operativos explícitos del
   import inicial, no un límite Free de productos. Archivos mayores requieren ticket de ampliación
   sin truncar datos. Mostrar progreso bytes/validación/activación; sesión TTL 24h.
6. Servidor valida formato completo con reglas del Restore actual, scope, relaciones y snapshots;
   agrega controles UUID/rango cloud. Staging no visible a queries/sync. No replay de ventas/compras
   antiguas: preservar IDs, costos, snapshots, VOIDED, REVERSAL y estado actual exacto.
7. Activar con lock Business/Inventory y una transacción: verificar cloud todavía vacío y generación
   reservada, insertar ocho colecciones, scoping, receipt de import, snapshot baseline/revisión inicial.
   Estado legacy con orden ambiguo queda marcado para elegibilidad conservadora, sin inventar ordinal.
8. ACK incluye inventoryId, generation y cursor baseline. Mobile confirma adopción del dataset cloud
   en transacción local, conserva backup anterior y libera comandos posteriores según dependencias.

Vacío significa cero productos, estados, operaciones o movimientos; nombre/moneda inicial pueden
estar reservados. Web/API no permiten escribir en Inventory reservado mientras import está activo.
Cancelar libera reserva y elimina staging; usuario puede seguir trabajando local-only. Import de
backup desde Web ofrece selección/preview y el mismo protocolo; no cambia restore Mobile existente.

## Compatibilidad de identidad aprobada — CLOUD-06-FIX

La futura frontera cloud acepta IDs históricos que sean UUID válidos representables por PostgreSQL,
incluidos UUIDv4 y otras versiones admitidas por el schema UUID genérico. Preserva exactamente cada
Inventory/Product/Sale/SaleItem/Purchase/StockAdjustment/InventoryMovement ID y sus relaciones;
no regenera, remapea ni reejecuta operaciones. DTOs/read models/ChangeSets y referencias a esas
entidades aceptan el mismo UUID. Una venta nueva sobre un producto UUIDv4 conserva ese productId
y crea saleId, saleItemId y movementId UUIDv7; anular una venta/compra UUIDv4 conserva su ID y
crea movimientos de reversión UUIDv7. Business, deviceId, snapshotId, importId y operationId nuevos
siguen v7; Inventory.generation es UUID técnico genérico.

Backup local formatVersion 1 sigue aceptando strings locales y Restore conserva su semántica.
Si contiene IDs no UUID, el futuro import cloud debe rechazarlos con explicación y sin escrituras,
sin alterar el archivo, los IDs ni la posibilidad de restaurarlo localmente. CLOUD-06-FIX congela
estos contratos; MIG-01 implementará validación profunda, staging y activación.

## Duplicados y fallos

UNIQUE owner/business, entity IDs y import hash/operationId; repeat commit devuelve receipt.
Si el commit ocurrió pero ACK se perdió, consultar ImportSession/receipt, no reservar otro job.
Crash en upload permite resume por chunks; validación fallida inicia cero escrituras del dataset.
Fallo en activación rollback entero. Error después de activar pero antes de adoptar local: consultar
receipt y volver a descargar baseline; preservar pending original, no subir snapshot otra vez.

No ofrecer rollback destructivo de cloud si ya fue activado y hubo operaciones posteriores.
Revertir una incorporación antes de nuevas operaciones requiere runbook controlado y autorización;
el backup original local se mantiene disponible. ImportSession staging se purga en 24h después de
expirar/cancelar; copia temporal no se conserva indefinidamente.

## Cloud ya contiene datos

No merge automático ni reemplazo. Si coincide inventoryId/generation de una conexión previa,
reanudar delta con device nuevo. Si es otro dataset: ofrecer adoptar cloud en dataset local separado,
con backup/confirmación del cambio de dataset, o continuar inventario local desconectado.
Guardar pending y datos locales originales antes de adoptar cloud; no enviarlos a otro Business.
Combinar dos inventarios completos o remapear IDs por duplicación queda LATER con reglas propias.

## Restore y logout futuros

Restore REPLACE V1 conserva su semántica solo para dataset local-only/desvinculado. Restaurar
un archivo arbitrario sobre réplica conectada no genera uploads/deletes automáticos: primero
desvincular con consentimiento y backup, o usar import inicial a cloud vacío. Cambio de cuenta
requiere mismo aislamiento. Eliminar cuenta no elimina automáticamente archivos exportados ni
datos en dispositivos offline: aviso, detach y opciones de borrado local al próximo acceso.
