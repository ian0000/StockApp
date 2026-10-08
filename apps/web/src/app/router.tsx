import {
  Outlet,
  createBrowserRouter,
  useNavigation,
  type RouteObject,
} from 'react-router';
import { PrivateBoundary, HomePage } from '../routes/access.js';
import { LoadingPage, NotFoundPage, RouteErrorPage } from '../routes/status.js';

const foundationRoutes = [
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
        ...(['login', 'signup', 'verify-email', 'reset-password'] as const).map(
          (path) => ({
            path,
            lazy: async () => {
              const pages = await import('../routes/auth.js');
              return {
                Component: {
                  login: pages.LoginPage,
                  signup: pages.SignupPage,
                  'verify-email': pages.VerifyPage,
                  'reset-password': pages.ResetPage,
                }[path],
              };
            },
          }),
        ),
        {
          path: '/onboarding',
          lazy: async () => ({
            Component: (await import('../routes/onboarding.js')).OnboardingPage,
          }),
        },
        {
          Component: PrivateBoundary,
          children: [
            { index: true, Component: HomePage },
            {
              path: '/products',
              lazy: async () => ({
                Component: (await import('../routes/products.js')).ProductsPage,
              }),
            },
            {
              path: '/products/new',
              lazy: async () => ({
                Component: (await import('../routes/products.js'))
                  .NewProductPage,
              }),
            },
            ...foundationRoutes.map(([path, title]) => ({
              path,
              lazy: page(title),
            })),
          ],
        },
        { path: '*', Component: NotFoundPage },
      ],
    },
  ];
}

export function createAppRouter() {
  return createBrowserRouter(createAppRoutes());
}
