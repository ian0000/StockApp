# StockApp Cloud + Web — baseline de arquitectura

ARCH-STOCKAPP-WEB-001 · 2026-10-02 (America/Guayaquil).
Estado: baseline aprobada humanamente y mergeada mediante PR #75. CLOUD-01 incorpora
foundation API local y contracts base; CLOUD-02 añade schema/migrations PostgreSQL y QA real local/CI.
Auth, negocio HTTP, sync, Web y despliegue siguen pendientes.
Base auditada: `e2e76c623d5c1043fdd15d2710200ad5891c8ec0` de `main`.

## Lectura y autoridad

Esta sección diseña la siguiente fase autorizada por el ticket. No cambia el MVP local,
sus reglas financieras, pricing, schema, builds ni freeze Alpha. `Accepted` en un ADR
significa decisión concreta de esta baseline, sujeta a revisión humana antes de implementar;
no significa servicio disponible ni autorización para comenzar otro ticket.

Las reglas comerciales siguen en [BUSINESS_RULES](../BUSINESS_RULES.md), el alcance local en
[MVP](../MVP.md), y la experiencia móvil en [UX](../UX.md). Para Cloud/Web, cada decisión tiene
una fuente normativa principal en la tabla siguiente; los ADRs explican motivos y consecuencias.

| Documento | Responsabilidad |
| --- | --- |
| [CURRENT_STATE](CURRENT_STATE.md) | Evidencia del repositorio actual y diferencias con el objetivo |
| [CLOUD-01](CLOUD-01.md) | Foundation local implementada, comandos y validación |
| [CLOUD-02](CLOUD-02.md) | Persistencia PostgreSQL, migrations y QA real local/CI |
| [PRODUCT](PRODUCT.md) | Usuario y frontera de la app autenticada |
| [REQUIREMENTS](REQUIREMENTS.md) | Requisitos verificables y decisiones pendientes |
| [SCOPE](SCOPE.md) | V1 cloud, exclusiones y compatibilidad con Free/Pro |
| [PARITY_MATRIX](PARITY_MATRIX.md) | Capacidades móviles verificadas y prioridad web |
| [ARCHITECTURE](ARCHITECTURE.md) | Sistemas, stack y topología del repo |
| [DOMAIN_REUSE](DOMAIN_REUSE.md) | Reutilización y límites de los adaptadores |
| [DATA_MODEL](DATA_MODEL.md) | Ownership, representación y persistencia cloud |
| [API](API.md) | Contratos, rutas, errores y validación |
| [AUTH](AUTH.md) | Identidad, sesiones y ciclo de vida |
| [SYNC](SYNC.md) | Autoridad, comandos, cursores y conflictos |
| [MIGRATION](MIGRATION.md) | Consentimiento y primera importación |
| [SECURITY](SECURITY.md) | Amenazas y controles aplicados |
| [PRIVACY_IMPACT](PRIVACY_IMPACT.md) | Cambios de tratamiento y gates de publicación |
| [WEB_UX](WEB_UX.md) | Navegación, estados y stack de presentación |
| [DEPLOYMENT](DEPLOYMENT.md) | Railway, Pages, entornos, hosts y secretos |
| [CI_CD](CI_CD.md) | Calidad y entrega futura |
| [TESTING](TESTING.md) | Pruebas y DoD de futuros tickets |
| [OBSERVABILITY](OBSERVABILITY.md) | Señales, logs y health |
| [OPERATIONS](OPERATIONS.md) | Recuperación, retención y runbooks |
| [BACKLOG](BACKLOG.md) | Tickets, dependencias y camino crítico |
| [ADR index](adr/README.md) | Decisiones Accepted |
| [Diagram index](diagrams/README.md) | PlantUML y estado de validación |
| [VALIDATION](VALIDATION.md) | Evidencia de controles de esta entrega |
| [DELIVERY](DELIVERY.md) | Inventario completo y resumen para revisión |

## Transiciones documentales explícitas

La arquitectura anterior §2/35/68 conserva Supabase como candidato provisional y §37 desaconseja
un backend propio para el primer Pro. El ticket actual fija Railway para API y exige seleccionar
base/auth; [ADR-WEB-003](adr/ADR-WEB-003-backend.md) y
[ADR-WEB-004](adr/ADR-WEB-004-database.md) sustituyen esas recomendaciones SOLO para esta fase.
No se ha descubierto un blocker técnico que obligue a reemplazar Railway o Pages.

Los ejemplos anteriores de outbox `UPSERT`, merge por ID y versión/fecha (§39/43) eran exploratorios.
[SYNC](SYNC.md) los concreta en comandos, compatibilidad de snapshots, revisiones del servidor y
conflictos visibles. No se usarán fechas del cliente para decidir qué escritura gana.
El export Expo web existente es una preview sin servicios persistentes; no es StockApp Web App.
La frase conceptual `Product.currentStock` en DATA_MODEL local se materializa realmente en
`InventoryState`, que también seguirá separado en cloud.

La secuencia del ROADMAP local continúa vigente. Este ticket autoriza diseñar la fase siguiente,
no adelantar implementación, cobros, publicación ni las features diferidas.

## Resultado de decisiones

DECIDED: monorepo; React/Vite; Fastify/Node; REST `/v1`; PostgreSQL Railway/Drizzle;
Better Auth; un propietario/un negocio/un inventario; Mobile offline-first con SQLite;
cloud autoritativo compartido para comandos aceptados; Web online-first; Pages;
hostname app `stockapp.ian-k.dev` y API `api-stockapp.ian-k.dev`.

BLOCKING IMPLEMENTATION: 0 para iniciar foundation DESPUÉS de revisión humana.
Los gates de release y pendientes no bloqueantes se detallan en REQUIREMENTS y PRIVACY_IMPACT.
La prueba del protocolo y compatibilidad auth son gates de tickets posteriores, no pruebas ya realizadas.

ARCH-STOCKAPP-WEB-001 terminó en documentación. CLOUD-01 y CLOUD-02 fueron autorizados
por tickets separados; completar CLOUD-02 no autoriza iniciar CLOUD-03. Desde 2026-10-03 el usuario autoriza al agente crear PRs
y hacer merges después de validación/revisión y CI aprobado; sin despliegues automáticos.
