import { useId, useRef, useState } from 'react';

type TutorialTopic = 'products' | 'sales';

const topicLabels = {
  products: 'Cómo crear productos',
  sales: 'Cómo registrar una venta',
} as const;

export function TutorialButton({ topic }: { topic?: TutorialTopic }) {
  const [activeTopic, setActiveTopic] = useState<TutorialTopic | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  return (
    <>
      <button
        className="secondary-action tutorial-trigger"
        type="button"
        aria-haspopup="dialog"
        ref={trigger}
        onClick={() => {
          setActiveTopic(topic ?? 'products');
          dialog.current?.showModal();
        }}
      >
        {topic ? topicLabels[topic] : 'Guía'}
      </button>
      <dialog
        className="tutorial-dialog"
        aria-labelledby={titleId}
        ref={dialog}
        onClose={() => {
          setActiveTopic(null);
          trigger.current?.focus();
        }}
      >
        <header>
          <h2 id={titleId}>Guía de StockApp</h2>
          <button
            className="secondary-action"
            type="button"
            onClick={() => dialog.current?.close()}
          >
            Cerrar guía
          </button>
        </header>
        {activeTopic && (
          <>
            <div className="tutorial-topics" role="group" aria-label="Temas">
              <button
                className="secondary-action"
                type="button"
                aria-pressed={activeTopic === 'products'}
                onClick={() => setActiveTopic('products')}
              >
                Productos
              </button>
              <button
                className="secondary-action"
                type="button"
                aria-pressed={activeTopic === 'sales'}
                onClick={() => setActiveTopic('sales')}
              >
                Ventas
              </button>
            </div>
            <section>
              <h3 aria-live="polite">{topicLabels[activeTopic]}</h3>
              {activeTopic === 'products' ? <ProductSteps /> : <SaleSteps />}
            </section>
          </>
        )}
      </dialog>
    </>
  );
}

function ProductSteps() {
  return (
    <>
      <ol>
        <li>
          En <strong>Productos</strong>, toca <strong>Crear producto</strong>.
          Escribe el nombre. Puedes agregar una variante y un código de barras.
        </li>
        <li>
          En <strong>Precio de venta por unidad</strong>, escribe lo que esperas
          cobrar por cada unidad.
        </li>
        <li>
          En <strong>Stock inicial</strong>, escribe cuántas unidades tienes. Si
          tienes unidades, pon lo que pagaste por cada una en{' '}
          <strong>Costo de compra por unidad</strong>. Si todavía no tienes
          unidades, deja el stock en 0.
        </li>
        <li>
          Toca <strong>Crear producto</strong> para guardarlo.
        </li>
      </ol>
      <p>
        Por ejemplo, si tienes 10 unidades, pagaste 2 por cada una y quieres
        venderlas a 3, escribe 10 en stock, 2 en costo y 3 en precio de venta.
      </p>
      <p>
        Si creas el producto desde <strong>Nueva compra</strong>, anota el costo
        y la cantidad al volver a la compra.
      </p>
    </>
  );
}

function SaleSteps() {
  return (
    <>
      <ol>
        <li>
          Abre <strong>Nueva venta</strong>. Busca el producto por nombre y toca{' '}
          <strong>Agregar</strong>, o escribe su código de barras y toca{' '}
          <strong>Agregar por código</strong>.
        </li>
        <li>
          En el <strong>Carrito</strong>, ajusta la cantidad con{' '}
          <strong>+</strong> y <strong>−</strong>. Revisa el precio de venta por
          unidad. Si lo cambias aquí, el nuevo precio se usa en esta venta.
        </li>
        <li>
          Revisa el total y toca <strong>Registrar venta</strong>. Si aparece un
          aviso de stock insuficiente, comprueba las cantidades antes de
          continuar.
        </li>
        <li>
          Comprueba que aparezca el detalle de la venta. Puedes volver a verlo
          desde <strong>Historial</strong>.
        </li>
      </ol>
      <p>Por ejemplo, 2 unidades a 3 cada una suman 6.</p>
    </>
  );
}
