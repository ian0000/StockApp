import { createRoot } from 'react-dom/client';
import { App } from './app/app.js';
import { createAppRouter } from './app/router.js';
import { createWebQueryClient } from './app/providers.js';
import './styles/base.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing application root.');
createRoot(container).render(
  <App router={createAppRouter()} queryClient={createWebQueryClient()} />,
);
