import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ProductReadDto } from '@stock-app/contracts';
import { useSessionView } from '../auth/context.js';
import {
  useOnline,
  useProductMutation,
  useProducts,
} from '../products/context.js';
import {
  productErrorMessage,
  productScope,
  productsKey,
} from '../products/controller.js';
import { uniqueProducts } from '../products/client.js';
import { formatMoney, initialProductForm } from '../products/input.js';
import { productListOptions } from '../products/queries.js';

export function ProductCard({
  item,
  currency,
}: {
  item: ProductReadDto;
  currency: string;
}) {
  return (
    <li className="product-card">
      <div>
        <strong>{item.product.name}</strong>
        {item.product.variant && <span> · {item.product.variant}</span>}
        {item.product.barcode && <p>Código: {item.product.barcode}</p>}
      </div>
      <div>
        <span>Stock: {item.state.stock}</span>
        {item.isLowStock && <strong className="stock-label">Stock bajo</strong>}
      </div>
      <div>
        <span>
          Precio: {formatMoney(item.product.regularSalePrice)} {currency}
        </span>
      </div>
      <Link to={`/products/${item.product.id}`}>Ver producto</Link>
    </li>
  );
}
export function PendingProductStatus() {
  const controller = useProducts(),
    view = useProductMutation();
  const online = useOnline();
  return (
    <section aria-label="Estado del registro">
      <p id="product-message" role="status" aria-live="polite">
        {view.message}
      </p>
      {view.kind === 'UNCERTAIN' && (
        <>
          {view.canRetry && (
            <button
              type="button"
              disabled={!online}
              onClick={() => void controller.retry()}
            >
              Reintentar
            </button>
          )}
          <button
            type="button"
            disabled={!online}
            onClick={() => void controller.check()}
          >
            Comprobar estado
          </button>
          <button type="button" onClick={() => controller.discard()}>
            Descartar y volver a completar
          </button>
        </>
      )}
    </section>
  );
}
export function EmptyProducts({ search }: { search: string }) {
  return (
    <p>
      {search
        ? 'No encontramos productos para esa búsqueda.'
        : 'Aún no tienes productos. Crea tu primer producto.'}
    </p>
  );
}
export function BarcodeMatch({
  item,
  code,
  currency,
}: {
  item: ProductReadDto | null | undefined;
  code: string;
  currency: string;
}) {
  if (item === undefined) return null;
  if (item === null)
    return (
      <>
        <p role="status" aria-live="polite">
          No encontramos un producto con ese código.
        </p>
        <Link to="/products/new" state={{ barcode: code }}>
          Crear producto con este código
        </Link>
      </>
    );
  return (
    <ul className="product-list">
      <ProductCard item={item} currency={currency} />
    </ul>
  );
}
export function ProductsPage() {
  useSessionView();
  const controller = useProducts(),
    scope = productScope(controller.session);
  if (!scope) return null;
  return <ProductsList key={`${scope.generation}/${scope.inventoryId}`} />;
}
function ProductsList() {
  const controller = useProducts(),
    scope = productScope(controller.session)!;
  const queries = useQueryClient(),
    online = useOnline(),
    location = useLocation();
  const [input, setInput] = useState(''),
    [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState(''),
    [lookup, setLookup] = useState('');
  const [message, setMessage] = useState('');
  const page = useInfiniteQuery(
    productListOptions(controller.client, scope, search),
  );
  const found = useQuery({
    queryKey: productsKey(scope, 'barcode', lookup),
    enabled: lookup !== '',
    queryFn: ({ signal }) =>
      controller.client.barcode(scope.inventoryId, lookup, signal),
  });
  useEffect(() => {
    controller.session.handleBusinessError(page.error);
    controller.session.handleBusinessError(found.error);
  }, [controller, page.error, found.error]);
  const feedback =
    location.state &&
    typeof location.state === 'object' &&
    'productMessage' in location.state &&
    typeof location.state.productMessage === 'string'
      ? location.state.productMessage
      : '';
  const items = uniqueProducts(page.data?.pages ?? []);
  return (
    <main>
      <h1>Productos</h1>
      <Link to="/products/new">Crear producto</Link>
      <p role="status" aria-live="polite">
        {feedback}
      </p>
      <PendingProductStatus />
      {!online && (
        <p role="status">
          Sin conexión. Los datos pueden estar desactualizados.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = input.trim();
          if (next !== search) {
            queries.removeQueries({
              queryKey: productsKey(scope, 'list', search),
              exact: true,
            });
            setSearch(next);
          } else void page.refetch();
        }}
      >
        <label>
          Buscar productos
          <input
            value={input}
            aria-describedby={page.isError ? 'search-error' : undefined}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <button type="submit" disabled={!online}>
          Buscar
        </button>
      </form>
      {page.isPending && (
        <p role="status" aria-live="polite">
          Cargando productos…
        </p>
      )}
      {page.isError && (
        <div role="alert">
          <p id="search-error">{productErrorMessage(page.error)}</p>
          <button
            type="button"
            disabled={!online || page.isFetching}
            onClick={() => void page.refetch()}
          >
            Reintentar consulta
          </button>
        </div>
      )}
      {page.data && items.length === 0 && <EmptyProducts search={search} />}
      <ul className="product-list" aria-label="Productos activos">
        {items.map((item) => (
          <ProductCard
            key={item.product.id}
            item={item}
            currency={scope.currency}
          />
        ))}
      </ul>
      {page.hasNextPage && (
        <button
          type="button"
          disabled={!online || page.isFetching}
          onClick={() => void page.fetchNextPage()}
        >
          {page.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
      <section aria-labelledby="barcode-title">
        <h2 id="barcode-title">Código de barras</h2>
        <p>
          Escribe el código o enfoca el campo y usa tu lector de teclado. Pulsa
          Enter para buscar.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const next = barcode.trim();
            if (!next) {
              setMessage('Escribe un código de barras.');
              return;
            }
            setMessage('');
            if (next === lookup) void found.refetch();
            else setLookup(next);
          }}
        >
          <label>
            Código de barras
            <input
              type="text"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              aria-describedby={
                found.isError
                  ? 'barcode-message barcode-error'
                  : 'barcode-message'
              }
            />
          </label>
          <button type="submit" disabled={!online}>
            Buscar código
          </button>
        </form>
        <p id="barcode-message" role="status" aria-live="polite">
          {message || (lookup && found.isPending ? 'Buscando código…' : '')}
        </p>
        {found.isError && (
          <div role="alert">
            <p id="barcode-error">{productErrorMessage(found.error)}</p>
            <button
              type="button"
              disabled={!online || found.isFetching}
              onClick={() => void found.refetch()}
            >
              Reintentar búsqueda del código
            </button>
          </div>
        )}
        <BarcodeMatch
          item={found.data}
          code={lookup}
          currency={scope.currency}
        />
      </section>
    </main>
  );
}
export function NewProductPage() {
  const controller = useProducts(),
    view = useProductMutation(),
    location = useLocation(),
    navigate = useNavigate(),
    online = useOnline();
  const navigationBarcode =
    location.state &&
    typeof location.state === 'object' &&
    'barcode' in location.state &&
    typeof location.state.barcode === 'string'
      ? location.state.barcode
      : '';
  const [form, setForm] = useState(() => initialProductForm(navigationBarcode));
  const formRef = useRef<HTMLFormElement>(null);
  const alreadyAccepted = useRef(view.kind === 'ACCEPTED');
  const [previousMessage] = useState(
    view.kind === 'ACCEPTED' ? view.message : '',
  );
  const locked = ['SENDING', 'UNCERTAIN', 'CHECKING', 'ACCEPTED'].includes(
    view.kind,
  );
  useEffect(() => {
    if (view.field)
      formRef.current
        ?.querySelector<HTMLInputElement>(`[name="${view.field}"]`)
        ?.focus();
  }, [view.field, view.message]);
  useEffect(() => {
    if (view.kind === 'ACCEPTED') {
      controller.acknowledge();
      // Entering a fresh form after list recovery must not bounce back to the list.
      if (alreadyAccepted.current) {
        alreadyAccepted.current = false;
        return;
      }
      void navigate('/products', {
        replace: true,
        state: { productMessage: view.message },
      });
    }
  }, [controller, navigate, view.kind, view.message]);
  const fields = [
    ['name', 'Nombre', false],
    ['variant', 'Variante (opcional)', false],
    ['barcode', 'Código de barras (opcional)', false],
    ['regularSalePrice', 'Precio habitual por unidad', true],
    ['minimumStock', 'Stock mínimo (opcional)', true],
    ['initialStock', 'Stock inicial', true],
    ['initialUnitCost', 'Costo inicial aproximado por unidad', true],
  ] as const;
  return (
    <main>
      <h1>Nuevo producto</h1>
      <p>
        El costo inicial se usa para estimar la ganancia. Es obligatorio si ya
        tienes unidades; puede ser aproximado.
      </p>
      <PendingProductStatus />
      {previousMessage && (
        <p role="status" aria-live="polite">
          {previousMessage}
        </p>
      )}
      {!online && (
        <p role="status">Necesitas conexión para registrar el producto.</p>
      )}
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!locked && online) void controller.submit(form);
        }}
      >
        <fieldset disabled={locked || !online}>
          <legend>Datos del producto</legend>
          {fields.map(([name, label, numeric]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                type="text"
                inputMode={
                  numeric
                    ? name === 'initialStock' || name === 'minimumStock'
                      ? 'numeric'
                      : 'decimal'
                    : undefined
                }
                value={form[name]}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    [name]: event.target.value,
                  }))
                }
                required={
                  name === 'name' ||
                  name === 'regularSalePrice' ||
                  name === 'initialStock' ||
                  (name === 'initialUnitCost' &&
                    form.initialStock.trim() !== '0')
                }
                aria-invalid={view.field === name || undefined}
                aria-describedby="product-message"
              />
            </label>
          ))}
          <button type="submit" disabled={locked || !online}>
            {view.kind === 'SENDING' ? 'Registrando…' : 'Crear producto'}
          </button>
        </fieldset>
      </form>
      <Link to="/products">Volver a productos</Link>
    </main>
  );
}
