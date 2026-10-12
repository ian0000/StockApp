import { createRoot } from 'react-dom/client';
import { App } from './app/app.js';
import { createAppRouter } from './app/router.js';
import { createWebQueryClient } from './app/providers.js';
import './styles/base.css';
import { readApiConfig } from './api/config.js';
import { createApiClient } from './api/client.js';
import { createOwnershipClient } from './api/ownership.js';
import { createWebAuth } from './auth/client.js';
import { SessionController } from './auth/session.js';
import { ProductsController } from './products/controller.js';
import { createProductsClient } from './products/client.js';
import { createSalesClient } from './sales/client.js';
import { SalesController } from './sales/controller.js';
import { createPurchasesClient } from './purchases/client.js';
import { PurchasesController } from './purchases/controller.js';
import { createAdjustmentsClient } from './adjustments/client.js';
import { AdjustmentsController } from './adjustments/controller.js';
import { createReadsClient } from './reads/client.js';
import { createVoidsClient } from './voids/client.js';
import { VoidController } from './voids/controller.js';

const container = document.getElementById('root');
if (!container) throw new Error('Missing application root.');
const root = createRoot(container);
try {
  const { apiUrl } = readApiConfig(import.meta.env);
  const queryClient = createWebQueryClient();
  const api = createApiClient({ baseUrl: apiUrl });
  const session = new SessionController(
    createWebAuth(apiUrl, window.location.origin),
    createOwnershipClient(api),
    queryClient,
  );
  const products = new ProductsController(
    createProductsClient(api),
    session,
    queryClient,
    window.sessionStorage,
  );
  const sales = new SalesController(
    createSalesClient(api),
    products.client,
    session,
    queryClient,
    window.sessionStorage,
  );
  const purchases = new PurchasesController(
    createPurchasesClient(api),
    products,
    session,
    queryClient,
    window.sessionStorage,
  );
  const adjustments = new AdjustmentsController(
    createAdjustmentsClient(api),
    products,
    session,
    queryClient,
    window.sessionStorage,
  );
  root.render(
    <App
      router={createAppRouter()}
      queryClient={queryClient}
      session={session}
      products={products}
      sales={sales}
      purchases={purchases}
      adjustments={adjustments}
      reads={createReadsClient(api)}
      voids={{
        sale: new VoidController(
          'SALE_VOID',
          createVoidsClient(api),
          session,
          queryClient,
          window.sessionStorage,
        ),
        purchase: new VoidController(
          'PURCHASE_VOID',
          createVoidsClient(api),
          session,
          queryClient,
          window.sessionStorage,
        ),
      }}
    />,
  );
} catch {
  root.render(
    <main>
      <h1>No pudimos iniciar la aplicación</h1>
      <p>
        La configuración de conexión no está disponible. Vuelve a intentarlo más
        adelante.
      </p>
    </main>,
  );
}
