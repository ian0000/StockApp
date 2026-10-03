# StockApp

**Proyecto personal · Inventario móvil offline-first · Alpha**

StockApp ayuda a pequeños negocios y emprendedores a saber qué tienen, qué compran, qué venden y cuánto ganan aproximadamente por producto. Las operaciones principales funcionan en el dispositivo, incluso sin Internet.

[Presentación pública](https://ian-k.dev/stockapp/) · [Guía Alpha](docs/ALPHA_TESTING.md) · [Capturas y presentación para testers](docs/alpha/TESTER_INTRO.md)

La presentación y las páginas de privacidad, términos y soporte están publicadas en **Cloudflare Pages**, desde el repositorio independiente [ian-k.dev](https://github.com/ian0000/ian-k.dev). La aplicación móvil conserva sus datos de inventario localmente en SQLite y funciona offline.

## Qué puedes hacer

- Consultar productos, existencias y avisos de stock bajo.
- Registrar compras, ventas de varios productos y ajustes.
- Revisar el historial de movimientos.
- Consultar costo promedio, margen y ganancia estimada.
- Revisar sugerencias de precio cuando cambia el costo.

La ganancia es una estimación sobre el producto; no descuenta alquiler, impuestos ni otros gastos. StockApp no es un sistema contable ni un POS completo.

## Estado

La versión Alpha se prueba con **datos ficticios**. No debe utilizarse como único registro de un negocio real. Los datos se guardan localmente y no hay sincronización entre dispositivos. Las instrucciones de distribución están en la guía Alpha; este README no anuncia una publicación en las tiendas.

## Legal y soporte

Desde **Más → Legal y soporte** puedes abrir en el navegador del dispositivo:

- [Política de privacidad](https://ian-k.dev/stockapp/privacy/).
- [Términos de uso](https://ian-k.dev/stockapp/terms/).
- [Soporte](https://ian-k.dev/stockapp/support/).

Estas páginas requieren conexión al consultarlas. Los flujos de inventario
continúan funcionando offline. Si no se puede abrir un enlace, la app muestra
un mensaje para reintentar. La configuración de Google Play y App Store sigue
como **PENDING EXTERNAL ACTION**; consulta el [backlog](docs/BACKLOG.md).

## Tecnologías y estructura

React Native, Expo, Expo Router, TypeScript, SQLite y Drizzle ORM, organizados con pnpm workspaces.

| Ruta                                          | Responsabilidad                                |
| --------------------------------------------- | ---------------------------------------------- |
| [apps/mobile](apps/mobile/)                   | Interfaz, navegación y persistencia local      |
| [apps/api](apps/api/)                         | API local y schema PostgreSQL versionado       |
| [packages/contracts](packages/contracts/)     | Schemas y codecs base de transporte            |
| [packages/domain](packages/domain/)           | Reglas de negocio en TypeScript                |
| [packages/application](packages/application/) | Casos de uso y contratos                       |
| [packages/shared](packages/shared/)           | Código compartido                              |
| [docs](docs/)                                 | Producto, arquitectura, reglas y pruebas Alpha |

## Desarrollo local

Requisitos: Node.js 22.16 o superior y pnpm 11.0.9, según `package.json`. Utiliza un dispositivo o emulador compatible con la configuración de Expo del proyecto.

```sh
pnpm install --frozen-lockfile
pnpm --filter @stock-app/mobile start
```

También están disponibles:

```sh
pnpm --filter @stock-app/mobile android
pnpm --filter @stock-app/mobile ios
```

La ejecución en simulador iOS requiere macOS y Xcode.

Foundation API local de CLOUD-01:

```sh
pnpm --filter @stock-app/api dev
pnpm build:api
pnpm --filter @stock-app/api start
```

`GET http://localhost:3001/live` devuelve `{"status":"ok"}`. `HOST`/`PORT` configuran el bind.
El build compila contracts y API. Sin AUTH_BASE_URL, el start conserva el modo foundation;
con configuración explícita registra Better Auth bajo /api/auth y las tres rutas de ownership
de CLOUD-04: /v1/me, POST /v1/business (inicio vacío) y metadata de Inventory propio habilitado.
Sin sync ni comandos financieros; CSRF/CORS completo de negocio pendiente de CLOUD-05.
Detalle y evidencia en [CLOUD-01](docs/web/CLOUD-01.md).

## Calidad

```sh
pnpm check
```

Ejecuta formato, lint, tipos, tests y build de API en secuencia. Para ejecutar un control individual: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` o `pnpm build:api`. `pnpm format` aplica el formato.

GitHub Actions ejecuta `pnpm check` en pushes a `main` y pull requests hacia esa rama.
También ejecuta `pnpm test:db` contra PostgreSQL efímero, auth y HTTP compilado con SMTP local,
y comprueba la generación oficial de auth/migrations. Localmente ese gate exige un build previo
y `TEST_DATABASE_URL` de una DB disposable.

Persistencia API: `pnpm --filter @stock-app/api db:generate` genera SQL versionado y
`pnpm --filter @stock-app/api db:migrate` aplica migrations usando `DATABASE_URL` explícita.
El servidor HTTP no migra automáticamente; `/live` sigue independiente de DB.
Persistencia: [CLOUD-02](docs/web/CLOUD-02.md). Identidad email/password, verify/reset, sesiones
revocables y configuración SMTP: [CLOUD-03](docs/web/CLOUD-03.md). No hay DB Railway ni despliegue.
Ownership, bootstrap transaccional y habilitación manual del piloto:
[CLOUD-04](docs/web/CLOUD-04.md). Crear/verificar cuenta no crea ni sube inventario.
El operador usa `pnpm --filter @stock-app/api pilot:access -- --user-id <id> --enable`
o `--disable`, con DATABASE_URL explícita; no existe API administrativa.

## Documentación

- [Producto](docs/PRODUCT.md) y [alcance MVP](docs/MVP.md).
- [Reglas de negocio](docs/BUSINESS_RULES.md), [modelo de datos](docs/DATA_MODEL.md) y [arquitectura](docs/ARCHITECTURE.md).
- [Experiencia de uso](docs/UX.md).
- [Reglas para contribuir con agentes](AGENTS.md).

Las reglas formales viven en esos documentos. Un cambio de presentación no modifica el comportamiento del inventario ni los cálculos.
