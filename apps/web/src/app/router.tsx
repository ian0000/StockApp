import {
  Outlet,
  createBrowserRouter,
  useNavigation,
  type RouteObject,
} from 'react-router';
import { LoadingPage, NotFoundPage, RouteErrorPage } from '../routes/status.js';

const foundationRoutes = [
  ['/login', 'Acceso'],
  ['/signup', 'Crear cuenta'],
  ['/verify-email', 'Verificar correo'],
  ['/reset-password', 'Recuperar acceso'],
  ['/onboarding', 'Inicio de configuración'],
  ['/products', 'Productos'],
  ['/products/new', 'Nuevo producto'],
  ['/products/:id', 'Detalle de producto'],
  ['/products/:id/edit', 'Editar producto'],
  ['/sales/new', 'Nueva venta'],
  ['/sales/:id', 'Detalle de venta'],
  ['/purchases/new', 'Nueva compra'],
  ['/purchases/:id', 'Detalle de compra'],
  ['/adjustments/new', 'Ajuste de stock'],
  ['/history', 'Historial'],
  ['/settings', 'Configuración'],
  ['/settings/privacy', 'Privacidad'],
] as const;

function RouteContent() {
  const navigation = useNavigation();
  return navigation.state === 'loading' ? <LoadingPage /> : <Outlet />;
}

function page(title: string, home = false) {
  return async () => {
    const { FoundationPage } = await import('../routes/foundation.js');
    return {
      Component: function FoundationRoute() {
        return <FoundationPage title={title} home={home} />;
      },
    };
  };
}

export function createAppRoutes(): RouteObject[] {
  return [
    {
      path: '/',
      Component: RouteContent,
      HydrateFallback: LoadingPage,
      ErrorBoundary: RouteErrorPage,
      children: [
        { index: true, lazy: page('Aplicación web', true) },
        ...foundationRoutes.map(([path, title]) => ({
          path,
          lazy: page(title),
        })),
        { path: '*', Component: NotFoundPage },
      ],
    },
  ];
}

export function createAppRouter() {
  return createBrowserRouter(createAppRoutes());
}
