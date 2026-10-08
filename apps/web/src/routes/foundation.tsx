import { Link } from 'react-router';

export function FoundationPage({
  title,
  home = false,
}: {
  title: string;
  home?: boolean;
}) {
  return (
    <main>
      <p className="eyebrow">Base web</p>
      <h1>{title}</h1>
      <p>Las pantallas se incorporarán por etapas.</p>
      {home ? (
        <nav aria-label="Rutas de demostración">
          <Link to="/login">Acceso</Link>
          <Link to="/products">Productos</Link>
        </nav>
      ) : (
        <Link to="/">Volver al inicio</Link>
      )}
    </main>
  );
}
