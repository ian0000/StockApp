import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { SaleDetailDto } from '@stock-app/contracts';
import { useSessionView } from '../auth/context.js';
import { useOnline, useProducts } from '../products/context.js';
import {
  productScope,
  productErrorMessage,
  productsKey,
  type ProductScope,
} from '../products/controller.js';
import { productListOptions } from '../products/queries.js';
import { uniqueProducts } from '../products/client.js';
import { formatMoney } from '../products/input.js';
import { useSales, useSaleMutation, useSaleDraft } from '../sales/context.js';
import { saleErrorMessage } from '../sales/controller.js';
import { saleDetailOptions } from '../sales/queries.js';
import {
  addProduct,
  editPrice,
  changeQuantity,
  removeLine,
  cartTotal,
  type CartLine,
  type StockWarning,
} from '../sales/cart.js';

export function PendingSaleStatus() {
  const controller = useSales(),
    view = useSaleMutation(),
    draft = useSaleDraft(),
    online = useOnline();
  return (
    <section aria-label="Estado de la venta">
      <p id="sale-message" role="status" aria-live="polite">
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
          <button
            type="button"
            onClick={() => {
              controller.discard();
              draft.clear();
            }}
          >
            Descartar y crear una venta nueva
          </button>
        </>
      )}
      {view.kind === 'ACCEPTED' && view.saleId && (
        <>
          <Link to={`/sales/${view.saleId}`}>Ver venta registrada</Link>
          <button type="button" onClick={() => controller.acknowledge()}>
            Crear una venta nueva
          </button>
        </>
      )}
    </section>
  );
}
export function StockWarningPanel({
  warnings,
  disabled,
  review,
  confirm,
}: {
  warnings: readonly StockWarning[];
  disabled: boolean;
  review: () => void;
  confirm: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section role="alert" aria-labelledby="stock-warning">
      <h2 tabIndex={-1} ref={heading} id="stock-warning">
        Stock registrado insuficiente.
      </h2>
      <ul>
        {warnings.map((w) => (
          <li key={w.productId}>
            <strong>{w.name}</strong>
            <p>
              Tienes: {w.stock} · Venderás: {w.quantity} · Quedará:{' '}
              {w.resultingStock}
            </p>
          </li>
        ))}
      </ul>
      <button type="button" disabled={disabled} onClick={review}>
        Revisar cantidades
      </button>
      <button type="button" disabled={disabled} onClick={confirm}>
        Registrar igualmente
      </button>
    </section>
  );
}
export function CartLines({
  cart,
  currency,
  locked,
  unavailable = [],
  change,
}: {
  cart: readonly CartLine[];
  currency: string;
  locked: boolean;
  unavailable?: readonly string[];
  change: (update: (cart: readonly CartLine[]) => CartLine[]) => void;
}) {
  let total: string;
  try {
    total = formatMoney(String(cartTotal(cart).scaledUnits));
  } catch {
    total =
      'No disponible: revisa los precios, cantidades e importes de la venta.';
  }
  return (
    <section aria-labelledby="cart-heading">
      <h2 id="cart-heading" tabIndex={-1}>
        Carrito
      </h2>
      {!cart.length && <p>Agrega productos a la venta.</p>}
      <ul className="product-list">
        {cart.map((line, index) => {
          const id = `sale-price-${index}`;
          let subtotal: string;
          try {
            subtotal = formatMoney(
              String(
                line.unitSalePrice.multiplyByInteger(line.quantity).scaledUnits,
              ),
            );
          } catch {
            subtotal = 'Importe fuera del rango permitido.';
          }
          return (
            <li key={line.productId} className="sale-cart-line">
              <h3>
                {line.name}
                {line.variant && ` · ${line.variant}`}
              </h3>
              <p>Stock registrado: {line.stock}</p>
              {unavailable.some(
                (p) => p.toLowerCase() === line.productId.toLowerCase(),
              ) && (
                <p role="alert">
                  Producto no disponible. Quita la línea o revisa el producto
                  antes de volver a confirmar.
                </p>
              )}
              <div>
                <button
                  type="button"
                  aria-label={`Disminuir cantidad de ${line.name}`}
                  disabled={locked}
                  onClick={() =>
                    change((cart) => changeQuantity(cart, line.productId, -1))
                  }
                >
                  −
                </button>
                <output
                  aria-live="polite"
                  aria-label={`Cantidad de ${line.name}`}
                >
                  {line.quantity}
                </output>
                <button
                  type="button"
                  aria-label={`Aumentar cantidad de ${line.name}`}
                  disabled={locked}
                  onClick={() =>
                    change((cart) => changeQuantity(cart, line.productId, 1))
                  }
                >
                  +
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    change((cart) => removeLine(cart, line.productId))
                  }
                >
                  Quitar
                </button>
              </div>
              <label htmlFor={id}>
                Precio de venta por unidad ({currency})
              </label>
              <input
                id={id}
                name={id}
                inputMode="decimal"
                value={line.priceText}
                disabled={locked}
                aria-invalid={line.priceError !== null}
                aria-describedby={`${id}-message`}
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  change((cart) => editPrice(cart, line.productId, text));
                }}
              />
              <p id={`${id}-message`}>
                {line.priceError ??
                  'El precio elegido se conserva al cambiar la cantidad.'}
              </p>
              <p>
                Subtotal: {subtotal} {currency}
              </p>
            </li>
          );
        })}
      </ul>
      <p role="status" aria-live="polite">
        Total: {total} {currency}
      </p>
    </section>
  );
}
export function NewSalePage() {
  const controller = useSales();
  useSessionView();
  const scope = productScope(controller.session);
  return scope ? (
    <NewSale key={`${scope.generation}/${scope.inventoryId}`} scope={scope} />
  ) : null;
}
function NewSale({ scope }: { scope: ProductScope }) {
  const controller = useSales(),
    products = useProducts(),
    draft = useSaleDraft(),
    view = useSaleMutation(),
    online = useOnline(),
    navigate = useNavigate(),
    queries = useQueryClient();
  const [input, setInput] = useState(''),
    [search, setSearch] = useState(''),
    [barcode, setBarcode] = useState(''),
    [barcodeMessage, setBarcodeMessage] = useState(''),
    [lookingUp, setLookingUp] = useState(false);
  const list = useInfiniteQuery(
    productListOptions(products.client, scope, search),
  );
  const locked = [
    'PREPARING',
    'SENDING',
    'UNCERTAIN',
    'CHECKING',
    'ACCEPTED',
  ].includes(view.kind);
  const [enteredAccepted] = useState(view.kind === 'ACCEPTED');
  const { refresh, clear } = draft;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (list.error) controller.session.handleBusinessError(list.error);
  }, [controller, list.error]);
  useEffect(() => {
    if (!view.refreshed) return;
    refresh(view.refreshed);
    // Only metadata/stock presentation refreshes; prices and prepared evidence remain exact.
  }, [view.refreshed, refresh]);
  useEffect(() => {
    if (!enteredAccepted && view.kind === 'ACCEPTED' && view.saleId) {
      clear();
      controller.acknowledge();
      void navigate(`/sales/${view.saleId}`, {
        replace: true,
        state: { saleMessage: view.message },
      });
    }
  }, [view, enteredAccepted, controller, navigate, clear]);
  async function lookup() {
    const code = barcode.trim();
    if (!code || !online || lookingUp || locked) return;
    setLookingUp(true);
    setBarcodeMessage('Buscando producto…');
    try {
      const item = await queries.fetchQuery({
        queryKey: productsKey(scope, 'barcode', code),
        staleTime: 0,
        queryFn: ({ signal }) =>
          products.client.barcode(scope.inventoryId, code, signal),
      });
      const current = productScope(controller.session);
      if (
        !mounted.current ||
        !current ||
        current.generation !== scope.generation ||
        current.inventoryId !== scope.inventoryId
      )
        return;
      if (item) {
        draft.change((cart) => addProduct(cart, item));
        setBarcodeMessage('Producto agregado.');
        setBarcode('');
      } else setBarcodeMessage('Producto no encontrado.');
    } catch (error) {
      controller.session.handleBusinessError(error);
      if (mounted.current) setBarcodeMessage(productErrorMessage(error));
    } finally {
      if (mounted.current) setLookingUp(false);
    }
  }
  let valid = draft.cart.length > 0;
  try {
    cartTotal(draft.cart);
  } catch {
    valid = false;
  }
  return (
    <section>
      <h1>Nueva venta</h1>
      {!online && (
        <p role="status">
          Sin conexión. Los datos en pantalla pueden estar desactualizados.
          Necesitas conexión para registrar la venta.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (online) setSearch(input.trim());
        }}
      >
        <label>
          Buscar productos
          <input
            value={input}
            disabled={locked}
            onChange={(event) => setInput(event.currentTarget.value)}
          />
        </label>
        <button type="submit" disabled={!online || locked}>
          Buscar
        </button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void lookup();
        }}
      >
        <label>
          Código de barras
          <input
            value={barcode}
            disabled={locked || lookingUp}
            onChange={(event) => setBarcode(event.currentTarget.value)}
            aria-describedby="sale-barcode-message"
          />
        </label>
        <button type="submit" disabled={!online || locked || lookingUp}>
          Agregar por código
        </button>
        <p role="status" id="sale-barcode-message">
          {barcodeMessage}
        </p>
      </form>
      {list.isPending && <p role="status">Cargando productos…</p>}
      {list.error && (
        <p role="alert">
          {productErrorMessage(list.error)}{' '}
          <button
            type="button"
            disabled={!online}
            onClick={() => void list.refetch()}
          >
            Reintentar consulta
          </button>
        </p>
      )}
      {list.data && (
        <ul className="product-list">
          {uniqueProducts(list.data.pages).map((item) => (
            <li className="product-card" key={item.product.id}>
              <div>
                <strong>{item.product.name}</strong>
                {item.product.variant && ` · ${item.product.variant}`}
                <p>Stock: {item.state.stock}</p>
                {item.product.barcode && <p>Código: {item.product.barcode}</p>}
              </div>
              <p>
                Precio habitual: {formatMoney(item.product.regularSalePrice)}{' '}
                {scope.currency}
              </p>
              <button
                type="button"
                disabled={locked}
                onClick={() => draft.change((cart) => addProduct(cart, item))}
              >
                Agregar
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.data && !uniqueProducts(list.data.pages).length && (
        <p>No encontramos productos.</p>
      )}
      {list.hasNextPage && (
        <button
          type="button"
          disabled={!online || list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Cargar más
        </button>
      )}
      <CartLines
        cart={draft.cart}
        currency={scope.currency}
        locked={locked}
        unavailable={view.unavailable}
        change={draft.change}
      />
      {draft.error && <p role="alert">{draft.error}</p>}
      {view.kind === 'WARNING' && view.warnings && (
        <StockWarningPanel
          warnings={view.warnings}
          disabled={!online}
          review={() => {
            controller.reviewQuantities();
            document.getElementById('cart-heading')?.focus();
          }}
          confirm={() => void controller.continuePrepared()}
        />
      )}
      <button
        type="button"
        disabled={locked || !online || !valid || view.kind === 'WARNING'}
        onClick={() => void controller.prepare(draft.cart)}
      >
        Registrar venta
      </button>
      <button
        type="button"
        disabled={locked}
        onClick={() => {
          controller.reviewQuantities();
          draft.clear();
        }}
      >
        Descartar carrito
      </button>
      <PendingSaleStatus />
    </section>
  );
}
export function formatSaleTime(timestamp: number, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('es', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(timestamp));
  } catch {
    return 'Fecha no disponible';
  }
}
export function SaleFacts({
  detail,
  currency,
  timeZone,
}: {
  detail: SaleDetailDto;
  currency: string;
  timeZone: string;
}) {
  const { sale, items } = detail;
  return (
    <section className="sale-detail">
      <h1>{sale.status === 'VOIDED' ? 'Venta anulada' : 'Venta registrada'}</h1>
      <p>Estado: {sale.status === 'VOIDED' ? 'Anulada' : 'Confirmada'}</p>
      <p>{formatSaleTime(sale.effectiveAt, timeZone)}</p>
      <ul className="product-list">
        {items.map((item) => (
          <li key={item.id} className="sale-history-line">
            <h2>
              {item.productName ?? 'Producto no disponible'}
              {item.productVariant && ` · ${item.productVariant}`}
            </h2>
            <dl>
              <dt>Cantidad</dt>
              <dd>{item.quantity}</dd>
              <dt>Precio de venta por unidad</dt>
              <dd>
                {formatMoney(item.unitSalePrice)} {currency}
              </dd>
              <dt>Subtotal</dt>
              <dd>
                {formatMoney(item.subtotal)} {currency}
              </dd>
              <dt>Costo por unidad al vender</dt>
              <dd>
                {item.costStatus === 'UNKNOWN'
                  ? 'Costo no disponible'
                  : `${formatMoney(item.unitCostSnapshot)} ${currency}`}
              </dd>
              <dt>Costo estimado</dt>
              <dd>
                {item.estimatedCost === null
                  ? 'Costo no disponible'
                  : `${formatMoney(item.estimatedCost)} ${currency}`}
              </dd>
              <dt>Ganancia estimada</dt>
              <dd>
                {item.costStatus === 'UNKNOWN'
                  ? 'Ganancia no disponible'
                  : `${formatMoney(item.estimatedProfit)} ${currency}`}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
      <dl>
        <dt>Total</dt>
        <dd>
          {formatMoney(sale.totalAmount)} {currency}
        </dd>
        <dt>Costo estimado total</dt>
        <dd>
          {sale.estimatedCost === null
            ? 'Costo no disponible'
            : `${formatMoney(sale.estimatedCost)} ${currency}`}
        </dd>
        <dt>Ganancia estimada total</dt>
        <dd>
          {sale.estimatedProfit === null
            ? 'Ganancia no disponible'
            : `${formatMoney(sale.estimatedProfit)} ${currency}`}
        </dd>
      </dl>
      {sale.notes && <p>Notas: {sale.notes}</p>}
    </section>
  );
}
export function SaleDetailPage() {
  const controller = useSales(),
    session = useSessionView(),
    scope = productScope(controller.session),
    { id = '' } = useParams();
  if (
    !scope ||
    session.kind !== 'BUSINESS_ACTIVE_ENABLED' ||
    !session.me.inventory
  )
    return null;
  return (
    <LoadedSale
      key={`${scope.generation}/${scope.inventoryId}/${id}`}
      scope={scope}
      id={id}
      timeZone={session.me.inventory.reportingTimeZone}
    />
  );
}
function LoadedSale({
  scope,
  id,
  timeZone,
}: {
  scope: ProductScope;
  id: string;
  timeZone: string;
}) {
  const controller = useSales(),
    online = useOnline(),
    location = useLocation(),
    query = useQuery(saleDetailOptions(controller.client, scope, id));
  useEffect(() => {
    if (query.error) controller.session.handleBusinessError(query.error);
  }, [query.error, controller]);
  const message =
    location.state && typeof location.state.saleMessage === 'string'
      ? location.state.saleMessage
      : '';
  return (
    <>
      {!online && (
        <p role="status">
          Sin conexión. Los datos en pantalla pueden estar desactualizados.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {query.isPending ? (
        <p role="status">Cargando venta…</p>
      ) : query.error ? (
        <section>
          <p role="alert">{saleErrorMessage(query.error)}</p>
          <button
            type="button"
            disabled={!online}
            onClick={() => void query.refetch()}
          >
            Reintentar consulta
          </button>
        </section>
      ) : !query.data ? (
        <p role="status">Venta no disponible.</p>
      ) : (
        <SaleFacts
          detail={query.data}
          currency={scope.currency}
          timeZone={timeZone}
        />
      )}
      <Link to="/sales/new">Nueva venta</Link>
      <Link to="/products">Volver a productos</Link>
    </>
  );
}
