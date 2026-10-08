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
  root.render(
    <App
      router={createAppRouter()}
      queryClient={queryClient}
      session={session}
      products={products}
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
