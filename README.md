# StockApp

**Inventario, compras y ventas desde la Web · UAT / Alpha**

StockApp Web ayuda a pequeños negocios y emprendedores a saber qué tienen, qué compran, qué venden y cuánto ganan aproximadamente por producto. Reúne catálogo, existencias y operaciones en una aplicación accesible desde el navegador, con cuenta y correo verificado.

[Abrir StockApp Web UAT](https://stockapp-staging.ian-k.dev/) · [Qué es y cómo funciona](https://ian-k.dev/stockapp/) · [Soporte](https://ian-k.dev/stockapp/support/)

La Web requiere conexión a Internet. La app móvil queda en segundo plano como **idea pendiente de lanzamiento**, sin fecha comprometida ni descarga pública. El código del prototipo móvil se conserva en este monorepo; no existe sincronización ni importación automática entre sus inventarios y la Web.

## Cómo empezar

1. Abre la Web y crea una cuenta.
2. Busca el correo «Verifica tu correo para StockApp» y abre su enlace. Si no llega, revisa spam o solicita otro desde Verificar correo.
3. Cuando aparezca «Correo verificado», inicia sesión con tu correo y contraseña. Verificar no inicia sesión automáticamente.
4. Configura un inventario vacío: nombre, moneda y zona horaria de los reportes.
5. Añade productos y prueba una compra o una venta con datos ficticios.

## Qué puedes hacer

- Consultar productos, existencias y avisos de stock bajo.
- Registrar compras, ventas de varios productos y ajustes.
- Revisar el historial de movimientos.
- Consultar costo promedio, margen y ganancia estimada.
- Revisar sugerencias de precio cuando cambia el costo.

La ganancia es una estimación sobre el producto; no descuenta alquiler, impuestos ni otros gastos. StockApp no es un sistema contable ni un POS completo.

## Estado

La Web está disponible en un entorno **UAT para pruebas con datos ficticios**, no como único registro de un negocio real. En este UAT, las cuentas nuevas verificadas pueden configurar su inventario con acceso automático. Esa política es exclusiva del entorno UAT; el servidor sigue validando sesión, ownership y acceso.

La monetización y los planes comerciales están pendientes de definición. No se anuncian precios, suscripciones ni un lanzamiento móvil.

## Presentación y soporte

La presentación pública y el soporte viven en el repositorio independiente [ian-k.dev](https://github.com/ian0000/ian-k.dev), publicado en Cloudflare Pages. El portfolio presenta StockApp y enlaza la Web; no administra su inventario ni contiene su backend.

- [Soporte](https://ian-k.dev/stockapp/support/).
- Contacto: `support@ian-k.dev`. No compartas contraseñas, tokens ni enlaces de verificación.

La documentación histórica del prototipo móvil (privacidad, términos, guías Alpha y capturas Android) se conserva identificada con ese alcance. No describe la Web actual ni anuncia una descarga móvil.

## Tecnologías y estructura

React, Vite, React Router y TanStack Query en la Web; Fastify, Better Auth y Drizzle/PostgreSQL en la API. Monorepo TypeScript con pnpm workspaces. El prototipo móvil utiliza Expo/React Native y SQLite local.

| Ruta                                          | Responsabilidad                                   |
| --------------------------------------------- | ------------------------------------------------- |
| [apps/web](apps/web/)                         | Landing, acceso y aplicación de inventario Web    |
| [apps/api](apps/api/)                         | Auth, ownership, comandos y lecturas PostgreSQL   |
| [apps/mobile](apps/mobile/)                   | Prototipo móvil conservado; lanzamiento pendiente |
| [packages/contracts](packages/contracts/)     | Contracts V1, codecs y fuente del OpenAPI         |
| [packages/domain](packages/domain/)           | Reglas de negocio en TypeScript                   |
| [packages/application](packages/application/) | Casos de uso y contratos                          |
| [packages/shared](packages/shared/)           | Código compartido                                 |
| [docs](docs/)                                 | Producto, arquitectura, reglas y pruebas Alpha    |

## Desarrollo local

Requisitos: Node.js 22.16 o superior y pnpm 11.0.9, según `package.json`. Usa exclusivamente PostgreSQL y credenciales locales de desarrollo; consulta los ejemplos de entorno de API y Web. No copies secretos UAT al repositorio.

```sh
pnpm install --frozen-lockfile
pnpm --filter @stock-app/api dev
pnpm --filter @stock-app/web dev
```

Ejecuta API y Web en terminales separadas, con `VITE_API_URL` y los origins de auth configurados para tus puertos locales. La API requiere su configuración completa de auth, base de datos y correo para el flujo de cuentas. Los builds son:

```sh
pnpm build:api
pnpm build:web
```

`/live` indica liveness; `/health` comprueba readiness de PostgreSQL. El servidor HTTP no migra automáticamente: la migración se ejecuta explícitamente antes del arranque, según [DEV-UAT-01](docs/web/DEV-UAT-01.md).

### Prototipo móvil, en segundo plano

```sh
pnpm --filter @stock-app/mobile start
pnpm --filter @stock-app/mobile android
pnpm --filter @stock-app/mobile ios
```

El simulador iOS requiere macOS y Xcode. Sus [guías Alpha](docs/ALPHA_TESTING.md) y [capturas históricas](docs/alpha/TESTER_INTRO.md) corresponden al prototipo local, no a una app publicada. Este cambio de presentación conserva su código y sus reglas offline.

## Calidad

```sh
pnpm check
```

Ejecuta OpenAPI, formato, lint, tipos, tests y builds API/Web en secuencia. `pnpm contracts:openapi:check` verifica los [contratos V1](docs/web/CONTRACTS_V1.md); `pnpm contracts:openapi` genera el JSON. `pnpm format` aplica el formato.

GitHub Actions selecciona checks por impacto en pushes a `main` y PRs hacia esa rama. `Quality checks` valida el plan y los resultados del SHA exacto; los candidatos de release conservan regresión completa. GitGuardian se revisa por separado.
También ejecuta `pnpm test:db` contra PostgreSQL efímero, auth, ownership, seguridad y HTTP compilado con SMTP local,
y comprueba la generación oficial de auth/migrations. Localmente ese gate exige un build previo
y `TEST_DATABASE_URL` de una DB disposable.

Persistencia API: `pnpm --filter @stock-app/api db:generate` genera SQL versionado y
`pnpm --filter @stock-app/api db:migrate` aplica migrations usando `DATABASE_URL` explícita.
El servidor HTTP no migra automáticamente; `/live` sigue independiente de DB.
Persistencia: [CLOUD-02](docs/web/CLOUD-02.md). Identidad: [CLOUD-03](docs/web/CLOUD-03.md). Ownership y política UAT: [CLOUD-04](docs/web/CLOUD-04.md). Crear o verificar una cuenta no crea ni sube un inventario por sí solo.

La Web UAT se publica en Cloudflare Pages y la API/PostgreSQL UAT en Railway, con despliegues controlados del SHA validado. [DEV-UAT-01](docs/web/DEV-UAT-01.md) conserva preparación, controles y evidencia histórica; una prueba local no acredita un despliegue remoto.

## Documentación

- [Producto](docs/PRODUCT.md) y [alcance MVP](docs/MVP.md).
- [Reglas de negocio](docs/BUSINESS_RULES.md), [modelo de datos](docs/DATA_MODEL.md) y [arquitectura](docs/ARCHITECTURE.md).
- [Experiencia de uso](docs/UX.md).
- [Reglas para contribuir con agentes](AGENTS.md).

Las reglas formales viven en esos documentos. Un cambio de presentación no modifica el comportamiento del inventario ni los cálculos.
