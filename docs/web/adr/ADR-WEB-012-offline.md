# ADR-WEB-012 — Web offline strategy

Estado: Accepted · Fecha: 2026-10-02.

## Contexto

Mobile ya cubre durabilidad offline. Offline Web duplica ledger/cola y añade browsers/storage
eviction, sesiones y conflictos antes de validar servicio compartido.

## Decisión

Web V1 online-first, sin service worker/PWA/cola durable de writes. Cache en memoria etiquetada
al desconectar, submit deshabilitado, refresh antes de confirmar. Envío incierto usa mismo receipt/key;
descriptor mínimo de operación sobrevive reload en sessionStorage sin payload/token.
Fuente: [WEB_UX](../WEB_UX.md).

## Alternativas

PWA offline útil eventualmente pero añade persistencia/recovery y paridad de motor sync que Mobile
ya necesita. Fingir éxito con optimistic stock no significa operación durable.

## Consecuencias

Mobile permanece opción para operar sin Internet. Web no promete conservar carrito después de
cerrar pestaña. Sin red después de enviar se distingue 'estado por comprobar' de 'falló', evitando duplicados.
