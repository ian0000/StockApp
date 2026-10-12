import {
  Outlet,
  createBrowserRouter,
  useNavigation,
  type RouteObject,
} from 'react-router';
import { PrivateBoundary } from '../routes/access.js';
import { LoadingPage, NotFoundPage, RouteErrorPage } from '../routes/status.js';

function RouteContent() {
  const navigation = useNavigation();
  return navigation.state === 'loading' ? <LoadingPage /> : <Outlet />;
}

export function createAppRoutes(): RouteObject[] {
  return [
    {
      path: '/',
      Component: RouteContent,
      HydrateFallback: LoadingPage,
      ErrorBoundary: RouteErrorPage,
      children: [
        {
          path: '/settings/reauthenticate',
          lazy: async () => ({
            Component: (await import('../routes/settings.js'))
              .ReauthenticatePage,
          }),
        },
        {
          lazy: async () => ({
            Component: (await import('../routes/settings.js')).AccountBoundary,
          }),
          children: [
            {
              path: '/settings',
              lazy: async () => ({
                Component: (await import('../routes/settings.js')).SettingsPage,
              }),
            },
            {
              path: '/settings/privacy',
              lazy: async () => ({
                Component: (await import('../routes/settings.js')).PrivacyPage,
              }),
            },
          ],
        },
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
            {
              index: true,
              lazy: async () => ({
                Component: (await import('../routes/home.js')).HomePage,
              }),
            },
            {
              path: '/history',
              lazy: async () => ({
                Component: (await import('../routes/history.js')).HistoryPage,
              }),
            },
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
            ...(['/products/:id', '/products/:id/edit'] as const).map(
              (path) => ({
                path,
                lazy: async () => ({
                  Component: path.endsWith('/edit')
                    ? (await import('../routes/product-detail.js'))
                        .EditProductPage
                    : (await import('../routes/product-detail.js'))
                        .ProductDetailPage,
                }),
              }),
            ),
            ...(['/sales/new', '/sales/:id'] as const).map((path) => ({
              path,
              lazy: async () => ({
                Component:
                  path === '/sales/new'
                    ? (await import('../routes/sales.js')).NewSalePage
                    : (await import('../routes/sales.js')).SaleDetailPage,
              }),
            })),
            ...(['/purchases/new', '/purchases/:id'] as const).map((path) => ({
              path,
              lazy: async () => ({
                Component:
                  path === '/purchases/new'
                    ? (await import('../routes/purchases.js')).NewPurchasePage
                    : (await import('../routes/purchases.js'))
                        .PurchaseDetailPage,
              }),
            })),
            {
              path: '/adjustments/new',
              lazy: async () => ({
                Component: (await import('../routes/adjustments.js'))
                  .NewAdjustmentPage,
              }),
            },
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
