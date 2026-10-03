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

## Calidad

```sh
pnpm check
```

Ejecuta formato, lint, tipos y tests en secuencia. Para ejecutar un control individual: `pnpm format:check`, `pnpm lint`, `pnpm typecheck` o `pnpm test`. `pnpm format` aplica el formato.

GitHub Actions ejecuta `pnpm check` en pushes a `main` y pull requests hacia esa rama.

## Documentación

- [Producto](docs/PRODUCT.md) y [alcance MVP](docs/MVP.md).
- [Reglas de negocio](docs/BUSINESS_RULES.md), [modelo de datos](docs/DATA_MODEL.md) y [arquitectura](docs/ARCHITECTURE.md).
- [Experiencia de uso](docs/UX.md).
- [Reglas para contribuir con agentes](AGENTS.md).

Las reglas formales viven en esos documentos. Un cambio de presentación no modifica el comportamiento del inventario ni los cálculos.
