import { Link } from 'react-router';
import {
  IconArrowRight,
  IconBox,
  IconChartBar,
  IconClipboardList,
  IconMailCheck,
  IconShoppingBag,
  IconShoppingCart,
} from '@tabler/icons-react';
import { Brand } from '../ui/brand.js';

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="brand-link" to="/" aria-label="StockApp · Inicio">
        <Brand />
      </Link>
      <nav aria-label="Acceso a StockApp">
        <Link to="/login">Iniciar sesión</Link>
        <Link className="primary-action" to="/signup">
          Crear cuenta <IconArrowRight size={18} aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}

const features = [
  {
    Icon: IconBox,
    title: 'Tu catálogo, en orden',
    text: 'Consulta productos, existencias, precios y avisos de stock bajo en un mismo lugar.',
  },
  {
    Icon: IconShoppingBag,
    title: 'Compras con contexto',
    text: 'Registra entradas y costos. Revisa el costo promedio y una sugerencia de precio antes de decidir.',
  },
  {
    Icon: IconShoppingCart,
    title: 'Ventas más claras',
    text: 'Reúne varios productos en una venta y consulta el total y su ganancia estimada.',
  },
  {
    Icon: IconClipboardList,
    title: 'Una historia que puedes seguir',
    text: 'Consulta compras, ventas y ajustes. Compara el stock registrado con tu conteo físico.',
  },
];

export function LandingPage() {
  return (
    <div className="public-site">
      <a className="skip-link" href="#public-content">
        Ir al contenido
      </a>
      <PublicHeader />
      <main id="public-content" className="landing-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div>
            <p className="public-eyebrow">Inventario para pequeños negocios</p>
            <h1 id="landing-title">
              Menos hojas de cálculo.
              <br />
              <span>Más claridad en tu negocio.</span>
            </h1>
            <p className="hero-lead">
              Qué tienes, qué entra y qué vendes. StockApp reúne tu inventario,
              compras y ventas en una Web sencilla, para que entiendas tus
              números sin perderte entre archivos.
            </p>
            <div className="public-actions">
              <Link className="primary-action" to="/signup">
                Empezar con mi cuenta{' '}
                <IconArrowRight size={20} aria-hidden="true" />
              </Link>
              <a className="secondary-action" href="#como-funciona">
                Ver cómo funciona
              </a>
            </div>
            <p className="public-note">
              Web en pruebas · Requiere conexión · Usa datos ficticios durante
              UAT
            </p>
          </div>
          <figure className="product-preview">
            <img
              src="/images/stockapp-web-preview.jpg"
              width="1487"
              height="1058"
              alt="Ejemplo de StockApp Web: resumen del día, una venta, una compra e información de stock."
              fetchPriority="high"
            />
            <figcaption>
              <IconChartBar size={18} aria-hidden="true" /> Una vista del día.
              Datos de ejemplo, no resultados de un negocio real.
            </figcaption>
          </figure>
        </section>
        <section
          className="landing-section"
          id="funciones"
          aria-labelledby="features-title"
        >
          <p className="public-eyebrow">Lo esencial, conectado</p>
          <h2 id="features-title">Del primer producto al cierre del día.</h2>
          <div className="feature-grid">
            {features.map(({ Icon, title, text }) => (
              <article key={title}>
                <Icon size={28} stroke={1.7} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <p className="public-note">
            La ganancia es una estimación a partir de ventas y costos conocidos.
            No descuenta impuestos, alquiler ni otros gastos del negocio.
          </p>
        </section>
        <section
          className="landing-section getting-started"
          id="como-funciona"
          aria-labelledby="steps-title"
        >
          <div>
            <p className="public-eyebrow">Cómo funciona</p>
            <h2 id="steps-title">
              Empieza con un inventario vacío.
              <br />
              Hazlo tuyo, paso a paso.
            </h2>
            <p>
              No necesitas instalar una aplicación. Entra desde el navegador y
              registra tus propias operaciones.
            </p>
          </div>
          <ol className="onboarding-steps">
            <li>
              <strong>Crea tu cuenta y verifica tu correo</strong>
              <p>
                Recibirás un enlace para confirmar que el correo es tuyo. Ábrelo
                y vuelve a iniciar sesión con tu contraseña.
              </p>
            </li>
            <li>
              <strong>Configura tu inventario</strong>
              <p>Elige su nombre, moneda y zona horaria para los reportes.</p>
            </li>
            <li>
              <strong>Registra y consulta</strong>
              <p>
                Añade productos, registra una compra o una venta y revisa los
                cambios en tu historial.
              </p>
            </li>
          </ol>
        </section>
        <section
          className="landing-section landing-faq"
          aria-labelledby="faq-title"
        >
          <div>
            <p className="public-eyebrow">Antes de empezar</p>
            <h2 id="faq-title">Tus preguntas, sin letra pequeña.</h2>
          </div>
          <div>
            <details>
              <summary>¿Para quién está pensada StockApp?</summary>
              <p>
                Para pequeños negocios y emprendedores que compran y venden
                productos y necesitan consultar existencias, costos y
                movimientos sin un sistema complejo.
              </p>
            </details>
            <details>
              <summary>¿Por qué tengo que verificar mi correo?</summary>
              <p>
                Para comprobar que puedes acceder a esa dirección antes de usar
                la cuenta. No te pediremos que respondas el correo ni que envíes
                tu contraseña. Si el enlace vence, solicita otro desde Verificar
                correo.
              </p>
              <Link to="/verify-email">Ayuda con la verificación</Link>
            </details>
            <details>
              <summary>
                ¿Puedo usarla sin conexión o desde la app móvil?
              </summary>
              <p>
                La Web necesita conexión a Internet. Una app móvil está prevista
                como idea pendiente, sin fecha de lanzamiento ni descarga
                pública. No hay sincronización ni importación automática de
                inventarios de prototipos móviles.
              </p>
            </details>
            <details>
              <summary>¿Es una versión definitiva? ¿Tiene un precio?</summary>
              <p>
                Esta es una versión UAT para pruebas con datos ficticios. La
                monetización y los planes están pendientes de definición; esta
                página no anuncia una suscripción ni un precio. No uses UAT como
                único registro de un negocio real.
              </p>
            </details>
          </div>
        </section>
        <section className="landing-cta" aria-labelledby="cta-title">
          <IconMailCheck size={34} aria-hidden="true" />
          <div>
            <h2 id="cta-title">
              Tu próximo paso: una cuenta y un correo verificado.
            </h2>
            <p>
              Conoce el flujo con datos de prueba y empieza a organizar tu
              inventario.
            </p>
          </div>
          <Link className="primary-action" to="/signup">
            Crear mi cuenta <IconArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="public-footer">
        <Brand />
        <p>Inventario claro, decisiones con contexto.</p>
        <nav aria-label="Más información">
          <a href="https://ian-k.dev/stockapp/">Sobre el proyecto</a>
          <a href="https://ian-k.dev/stockapp/support/">Ayuda y soporte</a>
          <Link to="/login">Iniciar sesión</Link>
        </nav>
      </footer>
    </div>
  );
}
