# Diagramas de arquitectura

13 fuentes PlantUML editables, autocontenidas sin `!include` remoto ni librerías descargadas.
Notación C4 mediante stereotypes y límites explícitos: level 1 sistemas; level 2 contenedores;
componentes API/Web. Runtime y delivery separados. Todas las cajas TARGET son diseño futuro.

| Archivo | Propósito | Validación |
| --- | --- | --- |
| [c4-context.puml](c4-context.puml) | Sistemas y usuario; infraestructura como contexto externo | Manual/estructural; render NOT RUN |
| [c4-containers.puml](c4-containers.puml) | Mobile/SQLite, Web SPA, API y DB | Manual/estructural; render NOT RUN |
| [c4-components-api.puml](c4-components-api.puml) | HTTP/auth/ownership/commands/domain/repos/sync | Manual/estructural; render NOT RUN |
| [c4-components-web.puml](c4-components-web.puml) | Shell/query/forms/client/domain y API | Manual/estructural; render NOT RUN |
| [deployment.puml](deployment.puml) | Runtime Railway/Pages/device y delivery GitHub/CI | Manual/estructural; render NOT RUN |
| [data-ownership.puml](data-ownership.puml) | Owner/Business/Inventory/dataset | Manual/estructural; render NOT RUN |
| [sequence-login.puml](sequence-login.puml) | Web cookie y Mobile SecureStore | Manual/estructural; render NOT RUN |
| [sequence-web-sale.puml](sequence-web-sale.puml) | Venta transaccional con receipt | Manual/estructural; render NOT RUN |
| [sequence-mobile-offline-sale.puml](sequence-mobile-offline-sale.puml) | Registro local atómico y posterior push | Manual/estructural; render NOT RUN |
| [sequence-sync.puml](sequence-sync.puml) | Push/pull completo/cursor/reset | Manual/estructural; render NOT RUN |
| [sequence-conflict.puml](sequence-conflict.puml) | Cambio remoto incompatible con operación local | Manual/estructural; render NOT RUN |
| [sequence-first-cloud-migration.puml](sequence-first-cloud-migration.puml) | Consent/import sobre vacío/activación | Manual/estructural; render NOT RUN |
| [system-boundaries.puml](system-boundaries.puml) | CURRENT/TARGET/INFRA/FUTURE | Manual/estructural; render NOT RUN |

PlantUML no localizado en PATH ni jar del workspace/referencia consultada. Java sí disponible,
pero Java solo no valida PlantUML. No se instaló herramienta global ni se enviaron fuentes a
renderer público. Comprobación de marcadores/bloques no sustituye compilación/render.
PlantUML validation: **NOT RUN**. Revisión manual y enlaces en [VALIDATION](../VALIDATION.md).
