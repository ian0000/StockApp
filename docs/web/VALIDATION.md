# Validación de ARCH-STOCKAPP-WEB-001

Fecha de revisión: 2026-10-02 (America/Guayaquil). Base e2e76c6; rama docs/stockapp-web-architecture.
La validación del diseño no demuestra runtime Cloud/Web, que no se implementó.

## Controles ejecutados

| Control | Resultado / límites |
| --- | --- |
| git status inicial | CLEAN, antes de cambiar desde chore/google-play-aab-profile |
| git checkout main | PASS |
| git pull --ff-only | PASS; a164c8e → e2e76c6, sin merge propio |
| git switch -c docs/stockapp-web-architecture | PASS |
| Auditoría docs/code/SQLite/tests | PASS; evidencia en CURRENT_STATE |
| pnpm check | PASS, exit 0 |
| pnpm format:check (mediante check) | PASS; docs/ excluido por configuración existente |
| pnpm lint (mediante check) | PASS |
| pnpm typecheck (mediante check) | PASS |
| pnpm test (mediante check) | PASS, todos los paquetes; salida Mobile 550 pass/0 fail |
| pnpm build | NOT RUN: no script build raíz ni build en paquetes actuales; no inventado |
| EAS/Expo export/build nativo | NOT RUN: cambio documental, sin build/distribución autorizados |
| PlantUML compile/render | NOT RUN: no herramienta/jar localizado; Java solo no basta |
| Revisión manual PlantUML | PASS: límites actuales/target y secuencias conforme a fuentes |
| Comprobación estructural de diagramas | PASS: 13 fuentes, start/end, braces/bloques balanceados, sin include remoto; no compilación |
| Links Markdown internos | PASS: 141 enlaces a archivos existentes, 0 destinos faltantes |
| Grafo backlog/IDs/dependencias | PASS: 47 tickets, sin ciclos/dependencias ausentes |
| ADR estados | PASS: 13/13 Accepted |
| git diff --check / git diff --cached --check | PASS, exit 0 antes de commit |
| Scope de archivos | PASS: 52 nuevos archivos solo docs/web, 39 Markdown y 13 PlantUML |

No install, cambios a lockfile/schema/migrations ni nuevas dependencias. Suite actual pasó fresca;
no se llama 'PASS' a pruebas target de API/Postgres/auth/sync/browser que todavía no existen.
La auditoría local registra 1402 como total histórico reportado, no se usa ese número como sustituto
de la corrida actual. No se hizo QA de dispositivos ni servicios existentes de otros proyectos.

## Consistencia revisada manualmente

| Tema | Resultado |
| --- | --- |
| Offline-first/autoridad | SQLite inmediato/local-only; cloud aceptado compartido al conectar; mismo modelo en ADR/diagramas/backlog |
| Regla monetaria | Money entero seguro 10^6, null/0, snapshots; sin decimal/float/fórmula alternativa |
| Stock/compras/anulaciones | Negativo permitido; Purchase un producto; void último inequívoco; Adjustment sin void |
| Conflictos | Sales costo compatible, compras/conteos estado esperado, Product metadata; no LWW financiero |
| Auth/ownership | Better Auth/DB, cookie host-only, SecureStore, CSRF ambas plataformas, queries siempre scoped |
| Hosting/URLs | Pages Web, Railway API/DB; public/app/API separados y mismos hosts en fuentes/ADR |
| Repo topology/reuse | Monorepo actual evoluciona; landing separada, schemas por dialecto, Domain único |
| Migración/backup/deletion | Consent/import vacío; backup distinto de sync; purga activa y supresión al restore |
| CI/CD | Actions CI only; proveedores CD/gate, PR y merge manuales |
| Futuro vs actual | Apps/servicios/schema cloud etiquetados target; CURRENT_STATE evidencia el código real |
| Canon local vs cloud | Recomendaciones Supabase/backend provisional sustituidas explícitamente por ticket, sin cambiar MVP |

## Fuentes externas y limitaciones

Se revisaron fuentes primarias de Fastify, Better Auth, Drizzle, PostgreSQL, Railway, Cloudflare
y OWASP, enlazadas junto a decisiones en los documentos. Revisión documental de compatibilidad,
no integración ejecutada ni instalación de esas librerías nuevas.

Lecturas de política/Terms públicas mediante web fallaron; el checkout independiente actual fue
inspeccionado read-only y se registra esa procedencia en PRIVACY_IMPACT. No se afirma que el
contenido público remoto haya sido verificado ni que el rollout previo esté desplegado.
PlantUML revisión estructural/manual no equivale a render exitoso; permitido por ticket sin instalar.

## Gate de esta entrega

Documento revisable con decisiones foundation resueltas, futuros release blockers explícitos,
sin implementación. Revisión humana, PR y merge todavía pendientes; no gates de release cloud
cerrados por esta tarea. Resultado de commit/push/hash/status final se entrega en el chat.
