import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  IconArrowLeft,
  IconBox,
  IconChartBar,
  IconMailCheck,
} from '@tabler/icons-react';
import { Brand } from './brand.js';

export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="public-auth">
      <a className="skip-link" href="#auth-content">
        Ir al contenido
      </a>
      <aside className="auth-story" aria-label="Acerca de StockApp">
        <Link className="brand-link" to="/" aria-label="StockApp · Inicio">
          <Brand />
        </Link>
        <div className="auth-story-content">
          <p className="public-eyebrow">Tu negocio, con más claridad</p>
          <h2>
            Cada movimiento cuenta.
            <br />
            Tenlo a la vista.
          </h2>
          <p>
            Productos, compras y ventas conectados en un inventario que puedes
            entender.
          </p>
          <ul>
            <li>
              <IconBox size={24} aria-hidden="true" />
              <span>Consulta tus existencias y detecta stock bajo.</span>
            </li>
            <li>
              <IconChartBar size={24} aria-hidden="true" />
              <span>Revisa tus costos y la ganancia estimada.</span>
            </li>
            <li>
              <IconMailCheck size={24} aria-hidden="true" />
              <span>Tu correo verificado es el primer paso para entrar.</span>
            </li>
          </ul>
        </div>
        <p className="auth-story-foot">StockApp Web · Entorno de pruebas UAT</p>
      </aside>
      <main id="auth-content" className="auth-content">
        <Link className="auth-back" to="/">
          <IconArrowLeft size={18} aria-hidden="true" /> Conocer StockApp
        </Link>
        <div className="auth-card">
          <p className="public-eyebrow">Bienvenido a StockApp</p>
          <h1>{title}</h1>
          <p className="auth-intro">{intro}</p>
          {children}
        </div>
        <p className="auth-help">
          ¿Necesitas ayuda?{' '}
          <a href="https://ian-k.dev/stockapp/support/">Contacta con soporte</a>
          . Nunca compartas tu contraseña ni enlaces de acceso.
        </p>
      </main>
    </div>
  );
}
