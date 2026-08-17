# Proyecto

Aplicación móvil offline-first para controlar inventario, costos y rentabilidad estimada de pequeños negocios.

## Requisitos

- Node.js 22.16 o superior.
- pnpm 11.

## Setup

```bash
pnpm install
```

## Desarrollo móvil

```bash
pnpm --filter @stock-app/mobile start
```

## Quality checks

Formatea los archivos mantenidos por el proyecto:

```bash
pnpm format
```

Ejecuta secuencialmente formato, lint, typecheck y tests:

```bash
pnpm check
```
